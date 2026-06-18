const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", ".data");
const dbPath = path.join(dataDir, "security-db.json");
const SESSION_COOKIE = "scholarhq_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const rateBuckets = new Map();

function nowIso() { return new Date().toISOString(); }
function ensureDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ users: [], profiles: [], study_sessions: [], ai_usage_logs: [], calendar_connections: [], sessions: [], password_resets: [] }, null, 2));
  }
}
function readDb() { ensureDb(); try { return JSON.parse(fs.readFileSync(dbPath, "utf8")); } catch { return { users: [], profiles: [], study_sessions: [], ai_usage_logs: [], calendar_connections: [], sessions: [], password_resets: [] }; } }
function writeDb(db) { ensureDb(); fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }
function sendJson(statusCode, payload, headers) { return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", ...(headers || {}) }, body: JSON.stringify(payload) }; }
function parseJsonBody(event) { try { return JSON.parse(event.body || "{}"); } catch { return null; } }
function publicUser(user) { return user ? { id: user.id, email: user.email, full_name: user.full_name || "", email_verified: Boolean(user.email_verified), created_at: user.created_at } : null; }
function hashPassword(password, salt) { return crypto.scryptSync(String(password), salt, 64).toString("hex"); }
function createToken() { return crypto.randomBytes(32).toString("base64url"); }
function getCookie(event, name) { const cookie = String((event.headers && (event.headers.cookie || event.headers.Cookie)) || ""); const found = cookie.split(/;\s*/).find((part) => part.startsWith(`${name}=`)); return found ? decodeURIComponent(found.slice(name.length + 1)) : ""; }
function cookieHeader(token, maxAge) { const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""; return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`; }
function getIp(event) { const h = event.headers || {}; return String(h["x-forwarded-for"] || h["x-real-ip"] || "local").split(",")[0].trim(); }
function checkRateLimit(key, limit, windowMs) { const now = Date.now(); const bucket = rateBuckets.get(key) || []; const fresh = bucket.filter((ts) => now - ts < windowMs); if (fresh.length >= limit) return false; fresh.push(now); rateBuckets.set(key, fresh); return true; }
function rateLimit(event, name, limit, windowMs, suffix) { const key = `${name}:${suffix || getIp(event)}`; if (!checkRateLimit(key, limit, windowMs)) return sendJson(429, { error: "Too many requests. Please wait and try again." }); return null; }
function getCurrentUser(event) { const token = getCookie(event, SESSION_COOKIE); if (!token) return null; const db = readDb(); const session = db.sessions.find((s) => s.token === token && new Date(s.expires_at).getTime() > Date.now()); if (!session) return null; return db.users.find((u) => u.id === session.user_id) || null; }
function requireUser(event) { const user = getCurrentUser(event); if (!user) return { error: sendJson(401, { error: "Authentication required." }) }; return { user }; }
function createSession(userId) { const db = readDb(); const token = createToken(); const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString(); db.sessions = db.sessions.filter((s) => new Date(s.expires_at).getTime() > Date.now()); db.sessions.push({ token, user_id: userId, created_at: nowIso(), expires_at: expires }); writeDb(db); return token; }
function clearSession(event) { const token = getCookie(event, SESSION_COOKIE); if (token) { const db = readDb(); db.sessions = db.sessions.filter((s) => s.token !== token); writeDb(db); } }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "")); }
function validateString(value, max, required) { const v = String(value || "").trim(); if (required && !v) return null; return v.slice(0, max); }
function logAiUsage(userId, feature, usage) { const db = readDb(); db.ai_usage_logs.push({ id: crypto.randomUUID(), user_id: userId, feature_used: feature, prompt_tokens: Number(usage && usage.input_tokens || usage && usage.prompt_tokens || 0), completion_tokens: Number(usage && usage.output_tokens || usage && usage.completion_tokens || 0), total_tokens: Number(usage && usage.total_tokens || 0), created_at: nowIso() }); writeDb(db); }
function getDailyAiUsage(userId) { const db = readDb(); const day = new Date().toISOString().slice(0,10); return db.ai_usage_logs.filter((l) => l.user_id === userId && String(l.created_at).startsWith(day)).reduce((sum, l) => sum + Number(l.total_tokens || 0), 0); }
module.exports = { dbPath, SESSION_COOKIE, readDb, writeDb, sendJson, parseJsonBody, publicUser, hashPassword, createToken, cookieHeader, getIp, rateLimit, getCurrentUser, requireUser, createSession, clearSession, isEmail, validateString, logAiUsage, getDailyAiUsage, nowIso };
