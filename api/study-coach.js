const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

function getOpenAiApiKey() {
  return process.env.SCHOLARHQ_API || "";
}

function getOpenAiModel() {
  return String(process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
}

function getApiErrorMessage(payload, fallback) {
  return payload && payload.error && payload.error.message
    ? payload.error.message
    : fallback || "The OpenAI request failed.";
}

function shouldRetryWithDefaultModel(response, responsePayload, requestedModel) {
  if (requestedModel === DEFAULT_OPENAI_MODEL) {
    return false;
  }

  const message = getApiErrorMessage(responsePayload, "");
  return (
    [400, 403, 404].includes(response.status) &&
    /does not have access to model|model.*not.*found|invalid model|unsupported model|model_not_found/i.test(message)
  );
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

async function handleStudyCoachRequest(request) {
  if (request.method === "OPTIONS") {
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

  if (request.method !== "POST") {
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
        error: "SCHOLARHQ_API is not configured yet. Add it in Render environment variables before using AI Study Coach.",
      }),
    };
  }

  try {
    const payload = JSON.parse(request.body || "{}");
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

    const coachRequestBody = {
      model: getOpenAiModel(),
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
    };

    let openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + openAiApiKey,
      },
      body: JSON.stringify(coachRequestBody),
    });

    let responsePayload = await openAiResponse.json();

    if (shouldRetryWithDefaultModel(openAiResponse, responsePayload, coachRequestBody.model)) {
      coachRequestBody.model = DEFAULT_OPENAI_MODEL;
      openAiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + openAiApiKey,
        },
        body: JSON.stringify(coachRequestBody),
      });
      responsePayload = await openAiResponse.json();
    }

    if (!openAiResponse.ok) {
      const apiError = getApiErrorMessage(responsePayload, "The OpenAI request failed.");

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
}

module.exports = {
  handleStudyCoachRequest,
};
