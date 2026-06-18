const crypto = require("crypto");
const { readDb, writeDb, sendJson, parseJsonBody, publicUser, hashPassword, createToken, cookieHeader, rateLimit, createSession, clearSession, requireUser, isEmail, validateString, nowIso } = require("./security");

function upsertProfile(db, user) {
  const existing = db.profiles.find((p) => p.user_id === user.id);
  const profile = { id: existing ? existing.id : crypto.randomUUID(), user_id: user.id, email: user.email, full_name: user.full_name || "", created_at: existing ? existing.created_at : nowIso(), updated_at: nowIso() };
  db.profiles = db.profiles.filter((p) => p.user_id !== user.id).concat(profile);
  return profile;
}
async function handleSignup(event) {
  const limited = rateLimit(event, "signup", 5, 15 * 60 * 1000); if (limited) return limited;
  const body = parseJsonBody(event); if (!body) return sendJson(400, { error: "Invalid JSON body." });
  const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || ""); const fullName = validateString(body.full_name || body.name, 120, true);
  if (!isEmail(email) || !fullName || password.length < 8 || password.length > 200) return sendJson(400, { error: "Enter a valid email, name, and password of at least 8 characters." });
  const db = readDb(); if (db.users.some((u) => u.email === email)) return sendJson(409, { error: "An account with this email already exists." });
  const salt = crypto.randomBytes(16).toString("hex"); const user = { id: crypto.randomUUID(), email, full_name: fullName, password_hash: hashPassword(password, salt), salt, email_verified: false, verification_token: createToken(), created_at: nowIso(), updated_at: nowIso() };
  db.users.push(user); upsertProfile(db, user); writeDb(db); const token = createSession(user.id);
  return sendJson(201, { user: publicUser(user), message: "Account created. Email verification token generated for provider setup." }, { "Set-Cookie": cookieHeader(token, 60 * 60 * 24 * 7) });
}
async function handleLogin(event) {
  const limited = rateLimit(event, "login", 8, 15 * 60 * 1000); if (limited) return limited;
  const body = parseJsonBody(event); if (!body) return sendJson(400, { error: "Invalid JSON body." });
  const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || ""); const db = readDb(); const user = db.users.find((u) => u.email === email);
  if (!user || user.password_hash !== hashPassword(password, user.salt)) return sendJson(401, { error: "Email or password is incorrect." });
  user.last_login_at = nowIso(); user.updated_at = nowIso(); writeDb(db); const token = createSession(user.id);
  return sendJson(200, { user: publicUser(user) }, { "Set-Cookie": cookieHeader(token, 60 * 60 * 24 * 7) });
}
function handleLogout(event) { clearSession(event); return sendJson(200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) }); }
function handleMe(event) { const result = requireUser(event); if (result.error) return result.error; return sendJson(200, { user: publicUser(result.user) }); }
function handleForgot(event) { const body = parseJsonBody(event) || {}; const email = String(body.email || "").trim().toLowerCase(); const limited = rateLimit(event, "forgot", 3, 60 * 60 * 1000, email || undefined); if (limited) return limited; if (email && isEmail(email)) { const db = readDb(); const user = db.users.find((u) => u.email === email); if (user) db.password_resets.push({ id: crypto.randomUUID(), user_id: user.id, token: createToken(), created_at: nowIso(), used_at: "" }); writeDb(db); } return sendJson(200, { message: "If that email exists, password reset instructions will be sent." }); }
async function handler(event) { if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" }, body: "" }; const path = (event.path || event.rawUrl || ""); if (event.httpMethod === "POST" && path.endsWith("/signup")) return handleSignup(event); if (event.httpMethod === "POST" && path.endsWith("/login")) return handleLogin(event); if (event.httpMethod === "POST" && path.endsWith("/logout")) return handleLogout(event); if (event.httpMethod === "POST" && path.endsWith("/forgot-password")) return handleForgot(event); if (event.httpMethod === "GET" && path.endsWith("/me")) return handleMe(event); return sendJson(404, { error: "Not found." }); }
module.exports = { handler };
