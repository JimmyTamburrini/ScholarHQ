const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const { handleStudyCoachRequest } = require("./api/study-coach");
const { handleStudyPlanRequest } = require("./api/study-plan");

const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

const apiHandlers = {
  "/api/study-coach": handleStudyCoachRequest,
  "/api/study-plan": handleStudyPlanRequest,
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
    { "Content-Type": "application/json; charset=utf-8" },
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
      method: req.method,
      headers: req.headers,
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
