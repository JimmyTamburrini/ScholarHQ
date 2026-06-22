const { requireUser, rateLimit, logAiUsage, getDailyAiUsage } = require("./security");

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY || process.env.SCHOLARHQ_API || "";
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

exports.handler = async function (event) {
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

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  }

  const auth = requireUser(event);
  if (auth.error) {
    return auth.error;
  }

  const limited = rateLimit(event, "study_coach", 12, 60 * 1000, auth.user.id);
  if (limited) {
    return limited;
  }

  if (getDailyAiUsage(auth.user.id) > Number(process.env.AI_DAILY_TOKEN_LIMIT || 50000)) {
    return {
      statusCode: 429,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Daily AI usage limit reached. Please try again tomorrow." }),
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
        error: "OPENAI_API_KEY is not configured yet. Add it in Render environment variables before using AI Study Coach.",
      }),
    };
  }

  try {
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
          "You are an academic productivity coach for a student dashboard named AcademicTILT. " +
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

    logAiUsage(auth.user.id, "study_coach", responsePayload.usage || {});
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
