const fs = require("fs");
const path = require("path");

const accountListPath = path.join(__dirname, "..", "created-accounts.json");

function sendJson(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
    body: JSON.stringify(payload),
  };
}

function readAccountsFile() {
  try {
    if (!fs.existsSync(accountListPath)) {
      return [];
    }

    const parsed = JSON.parse(fs.readFileSync(accountListPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeAccountsFile(accounts) {
  fs.writeFileSync(accountListPath, `${JSON.stringify(accounts, null, 2)}\n`);
}

function parseJsonBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch (_error) {
    return {};
  }
}

function sanitizeAccount(account) {
  return {
    id: String(account.id || "").trim(),
    name: String(account.name || "").trim(),
    email: String(account.email || "").trim().toLowerCase(),
    school: String(account.school || "").trim(),
    createdAt: String(account.createdAt || "").trim(),
    lastLoginAt: String(account.lastLoginAt || "").trim(),
  };
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod === "GET") {
    return sendJson(200, { accounts: readAccountsFile() });
  }

  if (event.httpMethod !== "POST") {
    return sendJson(405, { error: "Method not allowed." });
  }

  const account = sanitizeAccount(parseJsonBody(event));
  if (!account.id || !account.email) {
    return sendJson(400, { error: "Account id and email are required." });
  }

  const accounts = readAccountsFile();
  const nextAccounts = accounts.filter(function (savedAccount) {
    return savedAccount.id !== account.id && savedAccount.email !== account.email;
  });
  nextAccounts.push(account);
  nextAccounts.sort(function (a, b) {
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });

  writeAccountsFile(nextAccounts);
  return sendJson(200, { account, accounts: nextAccounts });
}

exports.handler = handler;
exports.accountListPath = accountListPath;
