const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { requireUser } = require("./security");

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const tokenStorePath = path.join(__dirname, "..", ".data", "google-calendar-tokens.json");

function sendJson(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

function sendRedirect(location) {
  return {
    statusCode: 302,
    headers: { Location: location },
    body: "",
  };
}

function getGoogleConfig(event) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || buildDefaultRedirectUri(event);
  const stateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET || clientSecret;

  return {
    clientId,
    clientSecret,
    redirectUri,
    stateSecret,
  };
}

function buildDefaultRedirectUri(event) {
  const headers = event.headers || {};
  const host = headers["x-forwarded-host"] || headers.host || "localhost:3000";
  const protocol = headers["x-forwarded-proto"] || (String(host).includes("localhost") ? "http" : "https");
  return `${protocol}://${host}/api/google/callback`;
}

function getPublicAppUrl(event) {
  const configuredUrl = process.env.PUBLIC_APP_URL || "";
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const headers = event.headers || {};
  const host = headers["x-forwarded-host"] || headers.host || "localhost:3000";
  const protocol = headers["x-forwarded-proto"] || (String(host).includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function verifyConfig(config) {
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    return "Google Calendar is not configured yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI on the server.";
  }

  return "";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function signState(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createStateToken(userId, secret) {
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      nonce: crypto.randomBytes(16).toString("hex"),
      createdAt: Date.now(),
    })
  );
  const signature = signState(payload, secret);
  return `${payload}.${signature}`;
}

function readStateToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) {
    throw new Error("Google OAuth state was malformed.");
  }

  const [payload, signature] = parts;
  const expectedSignature = signState(payload, secret);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Google OAuth state could not be verified.");
  }

  const parsed = JSON.parse(base64UrlDecode(payload));
  if (!parsed.userId || Date.now() - Number(parsed.createdAt || 0) > 10 * 60 * 1000) {
    throw new Error("Google OAuth state expired. Please try connecting again.");
  }

  return parsed;
}

function ensureTokenStoreDirectory() {
  fs.mkdirSync(path.dirname(tokenStorePath), { recursive: true });
}

function readTokenStore() {
  try {
    if (!fs.existsSync(tokenStorePath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(tokenStorePath, "utf8"));
  } catch (_error) {
    return {};
  }
}

function writeTokenStore(store) {
  ensureTokenStoreDirectory();
  fs.writeFileSync(tokenStorePath, JSON.stringify(store, null, 2));
}

function getUserTokens(userId) {
  const store = readTokenStore();
  return store[userId] || null;
}

function saveUserTokens(userId, tokens) {
  const store = readTokenStore();
  const existing = store[userId] || {};
  store[userId] = {
    ...existing,
    ...tokens,
    refresh_token: tokens.refresh_token || existing.refresh_token || "",
    connectedAt: existing.connectedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeTokenStore(store);
  return store[userId];
}

function parseJsonBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch (_error) {
    return {};
  }
}

async function exchangeAuthorizationCode(code, config) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = await response.json().catch(function () {
    return {};
  });

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google did not return calendar tokens.");
  }

  return normalizeTokenResponse(payload);
}

async function refreshAccessToken(userId, config, tokens) {
  if (!tokens || !tokens.refresh_token) {
    throw new Error("Google Calendar needs to be reconnected because no refresh token is saved.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const payload = await response.json().catch(function () {
    return {};
  });

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google Calendar token refresh failed.");
  }

  return saveUserTokens(userId, normalizeTokenResponse(payload));
}

function normalizeTokenResponse(payload) {
  const expiresIn = Number(payload.expires_in || 0);
  return {
    access_token: payload.access_token || "",
    refresh_token: payload.refresh_token || "",
    scope: payload.scope || CALENDAR_SCOPE,
    token_type: payload.token_type || "Bearer",
    expiry_date: expiresIn ? Date.now() + expiresIn * 1000 : 0,
  };
}

async function getValidTokens(userId, config) {
  const tokens = getUserTokens(userId);
  if (!tokens) {
    throw new Error("Google Calendar is not connected for this ScholarHQ account yet.");
  }

  if (!tokens.expiry_date || Date.now() > Number(tokens.expiry_date) - 60 * 1000) {
    return refreshAccessToken(userId, config, tokens);
  }

  return tokens;
}

function addMinutesToLocalDateTime(date, hour, minute, durationMinutes) {
  const startUtc = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hour,
    minute,
    0
  );
  const end = new Date(startUtc + durationMinutes * 60 * 1000);
  const year = end.getUTCFullYear();
  const month = String(end.getUTCMonth() + 1).padStart(2, "0");
  const day = String(end.getUTCDate()).padStart(2, "0");
  const hours = String(end.getUTCHours()).padStart(2, "0");
  const minutes = String(end.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:00`;
}

function normalizeCalendarSession(session) {
  const subject = String(session.subject || "Study Session").trim() || "Study Session";
  const date = String(session.date || "").slice(0, 10);
  const durationMinutes = Math.max(15, Math.min(360, Number(session.durationMinutes || 60)));
  const assignment = String(session.assignment || "").trim();
  const category = String(session.category || "").trim();
  const notes = String(session.notes || "").trim();

  if (!date || Number.isNaN(Date.parse(date))) {
    throw new Error(`The ${subject} session is missing a valid date.`);
  }

  const startDateTime = `${date}T18:00:00`;
  const endDateTime = addMinutesToLocalDateTime(date, 18, 0, durationMinutes);
  const descriptionLines = [
    "Created by ScholarHQ.",
    assignment ? `Assignment/exam: ${assignment}` : "",
    category ? `Category: ${category}` : "",
    notes ? `Notes: ${notes}` : "",
  ].filter(Boolean);

  return {
    summary: `Study: ${subject}`,
    description: descriptionLines.join("\n"),
    start: {
      dateTime: startDateTime,
      timeZone: process.env.GOOGLE_CALENDAR_TIME_ZONE || "America/Detroit",
    },
    end: {
      dateTime: endDateTime,
      timeZone: process.env.GOOGLE_CALENDAR_TIME_ZONE || "America/Detroit",
    },
  };
}

async function createGoogleEvent(accessToken, eventBody) {
  const response = await fetch(GOOGLE_CALENDAR_EVENTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventBody),
  });

  const payload = await response.json().catch(function () {
    return {};
  });

  if (!response.ok) {
    throw new Error((payload.error && payload.error.message) || "Google Calendar rejected an event.");
  }

  return payload;
}

async function handleConnect(event) {
  const config = getGoogleConfig(event);
  const configError = verifyConfig(config);
  if (configError) {
    return sendJson(500, { error: configError });
  }

  const auth = requireUser(event);
  if (auth.error) {
    return auth.error;
  }
  const userId = auth.user.id;

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", CALENDAR_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", createStateToken(userId, config.stateSecret));

  return sendRedirect(authUrl.toString());
}

async function handleCallback(event) {
  const config = getGoogleConfig(event);
  const configError = verifyConfig(config);
  const appUrl = getPublicAppUrl(event);

  if (configError) {
    return sendRedirect(`${appUrl}/?calendar=error&message=${encodeURIComponent(configError)}`);
  }

  try {
    const query = event.queryStringParameters || {};
    if (query.error) {
      throw new Error(`Google Calendar authorization failed: ${query.error}`);
    }

    const state = readStateToken(query.state, config.stateSecret);
    const tokens = await exchangeAuthorizationCode(String(query.code || ""), config);
    saveUserTokens(state.userId, tokens);
    return sendRedirect(`${appUrl}/?calendar=connected`);
  } catch (error) {
    return sendRedirect(`${appUrl}/?calendar=error&message=${encodeURIComponent(error.message || "Google Calendar could not connect.")}`);
  }
}

async function handleStatus(event) {
  const auth = requireUser(event);
  if (auth.error) {
    return auth.error;
  }
  const userId = auth.user.id;

  const tokens = getUserTokens(userId);
  return sendJson(200, {
    connected: Boolean(tokens && tokens.refresh_token),
    connectedAt: tokens ? tokens.connectedAt || "" : "",
    updatedAt: tokens ? tokens.updatedAt || "" : "",
  });
}

async function handleEvents(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod === "DELETE") {
    const auth = requireUser(event);
    if (auth.error) {
      return auth.error;
    }
    const store = readTokenStore();
    delete store[auth.user.id];
    writeTokenStore(store);
    return sendJson(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return sendJson(405, { error: "Method not allowed." });
  }

  const config = getGoogleConfig(event);
  const configError = verifyConfig(config);
  if (configError) {
    return sendJson(500, { error: configError });
  }

  const auth = requireUser(event);
  if (auth.error) {
    return auth.error;
  }
  const body = parseJsonBody(event);
  const userId = auth.user.id;
  const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 10) : [];

  if (!sessions.length) {
    return sendJson(400, { error: "Choose at least one study session to sync." });
  }

  try {
    const tokens = await getValidTokens(userId, config);
    const createdEvents = [];

    for (const session of sessions) {
      const eventBody = normalizeCalendarSession(session);
      const created = await createGoogleEvent(tokens.access_token, eventBody);
      createdEvents.push({
        id: created.id,
        htmlLink: created.htmlLink,
        summary: created.summary,
        start: created.start,
      });
    }

    return sendJson(200, { createdEvents });
  } catch (error) {
    return sendJson(500, { error: error.message || "Google Calendar sync failed." });
  }
}

exports.handleGoogleConnect = handleConnect;
exports.handleGoogleCallback = handleCallback;
exports.handleGoogleStatus = handleStatus;
exports.handleGoogleEvents = handleEvents;
