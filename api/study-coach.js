function getOpenAiApiKey() {
  return getEnvValue("OPENAI_API_KEY") || getEnvValue("SCHOLARHQ_API");
}

function extractResponseText(payload) {
  if (payload && typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!payload || !Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap(function (item) {
      if (!item || !Array.isArray(item.content)) {
        return [];
      }

      return item.content
        .map(function (contentItem) {
          if (!contentItem) {
            return "";
          }

          return contentItem.text || contentItem.output_text || "";
        })
        .filter(Boolean);
    })
    .join("\n")
    .trim();
}

function getEnvValue(name) {
  const trimmed = String(process.env[name] || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function stripCodeFences(value) {
  return String(value || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeList(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(function (item) {
      return String(item || "").trim();
    })
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeCoachResult(parsed, rawText) {
  return {
    headline: String((parsed && parsed.headline) || "Your study coach is ready.").trim(),
    summary: String((parsed && parsed.summary) || rawText || "The AI coach generated a study review.").trim(),
    priorities: normalizeList(parsed && parsed.priorities),
    risks: normalizeList(parsed && parsed.risks),
    nextSteps: normalizeList(parsed && parsed.nextSteps),
  };
}

async function getSupabaseUserFromAuthHeader(event) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: "SUPABASE_URL and SUPABASE_ANON_KEY must be configured for authenticated AI access.",
      statusCode: 500,
    };
  }

  if (!token) {
    return {
      error: "Authentication is required. Sign in before using AI Study Coach.",
      statusCode: 401,
    };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return {
      error: "Your session is invalid or expired. Sign in again and retry.",
      statusCode: 401,
    };
  }

  const user = await response.json();
  return { user };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  }

  const openAiApiKey = getOpenAiApiKey();

  if (!openAiApiKey) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "OPENAI_API_KEY or SCHOLARHQ_API is not configured yet. Add it in Render environment variables before using AI Study Coach.",
      }),
    };
  }

  try {
    const authResult = await getSupabaseUserFromAuthHeader(event);
    if (authResult.error) {
      return {
        statusCode: authResult.statusCode || 401,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: authResult.error }),
      };
    }

    const payload = JSON.parse(event.body || "{}");
    const hasData =
      (Array.isArray(payload.recentSessions) && payload.recentSessions.length > 0) ||
      (Array.isArray(payload.manualGrades) && payload.manualGrades.length > 0) ||
      (Array.isArray(payload.classSnapshots) && payload.classSnapshots.length > 0);

    if (!hasData) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "There is not enough study data yet for the AI coach to analyze." }),
      };
    }

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + openAiApiKey,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input:
          "You are an academic productivity coach for a student dashboard named ScholarHQ. " +
          "Analyze the student's recent study behavior and class progress. " +
          "Return only valid JSON with this exact shape: " +
          '{ "headline": string, "summary": string, "priorities": string[], "risks": string[], "nextSteps": string[] }. ' +
          "Be concise, practical, encouraging, and specific. " +
          "Prefer concrete actions tied to classes, recent effort, grades, and upcoming items. " +
          "Keep each list to at most 4 items and avoid markdown.\n\n" +
          "Student dashboard data:\n" +
          JSON.stringify(payload),
      }),
    });

    const responsePayload = await openAiResponse.json();

    if (!openAiResponse.ok) {
      const apiError =
        responsePayload &&
        responsePayload.error &&
        responsePayload.error.message
          ? responsePayload.error.message
          : "The OpenAI request failed.";

      return {
        statusCode: openAiResponse.status,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: apiError }),
      };
    }

    const rawText = extractResponseText(responsePayload);
    const parsed = JSON.parse(stripCodeFences(rawText));
    const coach = normalizeCoachResult(parsed, rawText);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ coach: coach }),
    };
  } catch (_error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "The AI Study Coach could not generate advice right now. Check the server logs and environment variables, then try again.",
      }),
    };
  }
};
