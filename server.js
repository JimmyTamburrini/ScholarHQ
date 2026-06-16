const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const { handler: studyCoachHandler } = require("./api/study-coach");
const { handler: studyPlanHandler } = require("./api/study-plan");
const {
  handleGoogleCallback,
  handleGoogleConnect,
  handleGoogleEvents,
  handleGoogleStatus,
} = require("./api/google-calendar");

const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

function normalizeEnvValue(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

[
  "OPENAI_API_KEY",
  "SCHOLARHQ_API",
  "OPENAI_MODEL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "PUBLIC_APP_URL",
  "GOOGLE_OAUTH_STATE_SECRET",
  "GOOGLE_CALENDAR_TIME_ZONE",
].forEach(function (name) {
  if (process.env[name]) {
    process.env[name] = normalizeEnvValue(process.env[name]);
  }
});

const apiHandlers = {
  "/api/study-coach": studyCoachHandler,
  "/api/study-plan": studyPlanHandler,
  "/.netlify/functions/study-coach": studyCoachHandler,
  "/.netlify/functions/study-plan": studyPlanHandler,
  "/api/google/connect": handleGoogleConnect,
  "/api/google/callback": handleGoogleCallback,
  "/api/google/status": handleGoogleStatus,
  "/api/google/events": handleGoogleEvents,
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendResponse(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers || {});
  res.end(body || "");
}

function sendJson(res, statusCode, payload) {
  sendResponse(
    res,
    statusCode,
    {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
    JSON.stringify(payload)
  );
}

function readRequestBody(req) {
  return new Promise(function (resolve, reject) {
    let body = "";

    req.on("data", function (chunk) {
      body += chunk;

      if (body.length > 1_000_000) {
        req.destroy(new Error("Request body is too large."));
      }
    });

    req.on("end", function () {
      resolve(body);
    });

    req.on("error", reject);
  });
}

async function handleApiRequest(req, res, handler) {
  try {
    const body = await readRequestBody(req);
    const result = await handler({
      httpMethod: req.method,
      headers: req.headers,
      queryStringParameters: Object.fromEntries(new URL(req.url || "/", "http://localhost").searchParams.entries()),
      body: body,
    });

    sendResponse(res, result.statusCode || 200, result.headers, result.body);
  } catch (error) {
    sendJson(res, 500, {
      error: error && error.message ? error.message : "The ScholarHQ API request failed.",
    });
  }
}

function isInsideRoot(filePath) {
  const relativePath = path.relative(rootDir, filePath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function resolveStaticFile(urlPath) {
  let decodedPath = "";

  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch (_error) {
    return null;
  }

  const normalizedPath = path.normalize(decodedPath).replace(/^([/\\])+/, "");
  const requestedPath = normalizedPath || "index.html";
  const filePath = path.join(rootDir, requestedPath);

  if (!isInsideRoot(filePath)) {
    return null;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return filePath;
  }

  return path.join(rootDir, "index.html");
}

function injectRuntimeConfig(content) {
  const runtimeConfig = {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  };

  return content.replace(
    /window\.PRODUCTIVITY_HUB_CONFIG\s*=\s*\{[\s\S]*?\};/,
    "window.PRODUCTIVITY_HUB_CONFIG = " + JSON.stringify(runtimeConfig) + ";"
  );
}

function handleStatusRequest(res) {
  sendJson(res, 200, {
    openAiKeyConfigured: Boolean(process.env.OPENAI_API_KEY || process.env.SCHOLARHQ_API),
    openAiKeyLooksPlaceholder: /your[_-]?openai|placeholder/i.test(
      process.env.OPENAI_API_KEY || process.env.SCHOLARHQ_API || ""
    ),
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL),
    supabaseAnonKeyConfigured: Boolean(process.env.SUPABASE_ANON_KEY),
  });
}

function handleStaticRequest(req, res, pathname) {
  const filePath = resolveStaticFile(pathname);

  if (!filePath || !fs.existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
  };

  fs.readFile(filePath, function (error, content) {
    if (error) {
      sendJson(res, 500, { error: "Could not read the requested file." });
      return;
    }

    const isMainHtml = path.basename(filePath) === "index.html";
    const body = isMainHtml ? injectRuntimeConfig(content.toString("utf8")) : content;
    res.writeHead(200, headers);
    res.end(body);
  });
}

function createServer() {
  return http.createServer(function (req, res) {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const handler = apiHandlers[requestUrl.pathname];

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (requestUrl.pathname === "/api/status") {
      handleStatusRequest(res);
      return;
    }

    if (handler) {
      handleApiRequest(req, res, handler);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    handleStaticRequest(req, res, requestUrl.pathname);
  });
}

function startServer() {
  const server = createServer();

  server.listen(port, function () {
    console.log(`ScholarHQ is running on port ${port}.`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createServer,
  startServer,
};
