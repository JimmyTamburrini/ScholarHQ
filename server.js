const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const { handler: studyCoachHandler } = require("./api/study-coach");
const { handler: studyPlanHandler } = require("./api/study-plan");
const { handler: accountsHandler } = require("./api/accounts");
const { handler: authHandler } = require("./api/auth");
const { handler: studySessionsHandler } = require("./api/study-sessions");
const { handler: profileHandler } = require("./api/profile");
const { handler: securityStatusHandler } = require("./api/security-status");
const {
  handleGoogleCallback,
  handleGoogleConnect,
  handleGoogleEvents,
  handleGoogleStatus,
} = require("./api/google-calendar");

const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

const apiHandlers = {
  "/api/study-coach": studyCoachHandler,
  "/api/study-plan": studyPlanHandler,
  "/api/accounts": accountsHandler,
  "/api/auth/signup": authHandler,
  "/api/auth/login": authHandler,
  "/api/auth/logout": authHandler,
  "/api/auth/forgot-password": authHandler,
  "/api/auth/me": authHandler,
  "/api/study-sessions": studySessionsHandler,
  "/api/profile": profileHandler,
  "/api/security/status": securityStatusHandler,
  "/api/google/connect": handleGoogleConnect,
  "/api/google/callback": handleGoogleCallback,
  "/api/google/status": handleGoogleStatus,
  "/api/google/events": handleGoogleEvents,
  "/api/google/disconnect": handleGoogleEvents,
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

function getSecurityHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY"
  };
}

function sendResponse(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers || {});
  res.end(body || "");
}

function sendJson(res, statusCode, payload) {
  sendResponse(
    res,
    statusCode,
    getSecurityHeaders("application/json; charset=utf-8"),
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
      path: new URL(req.url || "/", "http://localhost").pathname,
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

function handleStaticRequest(req, res, pathname) {
  const filePath = resolveStaticFile(pathname);

  if (!filePath || !fs.existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const headers = getSecurityHeaders(mimeTypes[extension] || "application/octet-stream");

  fs.createReadStream(filePath)
    .on("error", function () {
      sendJson(res, 500, { error: "Could not read the requested file." });
    })
    .on("open", function () {
      res.writeHead(200, headers);
    })
    .pipe(res);
}

function createServer() {
  return http.createServer(function (req, res) {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const handler = apiHandlers[requestUrl.pathname];

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
