const fs = require("fs");
const { accountListPath } = require("./accounts");
const { dbPath, readDb, requireUser, sendJson } = require("./security");

function hasValue(name) {
  return Boolean(String(process.env[name] || "").trim());
}

function getAccountListSummary(userId) {
  try {
    if (!fs.existsSync(accountListPath)) {
      return { exists: false, currentUserListed: false, count: 0 };
    }

    const parsed = JSON.parse(fs.readFileSync(accountListPath, "utf8"));
    const accounts = Array.isArray(parsed) ? parsed : [];
    return {
      exists: true,
      currentUserListed: accounts.some(function (account) {
        return account && account.id === userId;
      }),
      count: accounts.length,
    };
  } catch (_error) {
    return { exists: false, currentUserListed: false, count: 0 };
  }
}

async function handler(event) {
  if (event.httpMethod !== "GET") {
    return sendJson(405, { error: "Method not allowed." });
  }

  const auth = requireUser(event);
  if (auth.error) {
    return auth.error;
  }

  const db = readDb();
  const userId = auth.user.id;
  const accountList = getAccountListSummary(userId);

  return sendJson(200, {
    currentUser: {
      id: auth.user.id,
      email: auth.user.email,
      full_name: auth.user.full_name || "",
      email_verified: Boolean(auth.user.email_verified),
      savedInSecurityDb: db.users.some(function (user) {
        return user && user.id === userId;
      }),
      listedInCreatedAccounts: accountList.currentUserListed,
    },
    storage: {
      securityDbPath: ".data/security-db.json",
      securityDbExists: fs.existsSync(dbPath),
      createdAccountsPath: "created-accounts.json",
      createdAccountsExists: accountList.exists,
      createdAccountsCount: accountList.count,
    },
    routes: {
      signup: "/api/auth/signup",
      login: "/api/auth/login",
      logout: "/api/auth/logout",
      me: "/api/auth/me",
      profile: "/api/profile",
      studySessions: "/api/study-sessions",
      aiCoach: "/api/study-coach",
      aiPlan: "/api/study-plan",
      calendarStatus: "/api/google/status",
    },
    environment: {
      openAiConfigured: hasValue("OPENAI_API_KEY") || hasValue("SCHOLARHQ_API"),
      googleClientConfigured: hasValue("GOOGLE_CLIENT_ID"),
      googleSecretConfigured: hasValue("GOOGLE_CLIENT_SECRET"),
      googleRedirectConfigured: hasValue("GOOGLE_REDIRECT_URI"),
      publicAppUrlConfigured: hasValue("PUBLIC_APP_URL"),
      sessionSecretConfigured: hasValue("SESSION_SECRET"),
      tokenEncryptionConfigured: hasValue("TOKEN_ENCRYPTION_KEY"),
    },
    productionNotes: [
      "Do not enter secrets in the browser. Set them in your server or Render environment variables.",
      "For launch, move .data/security-db.json to Supabase/Postgres and run supabase/schema.sql.",
      "Use the Security page to confirm account persistence and protected-route status from the web app.",
    ],
  });
}

exports.handler = handler;
