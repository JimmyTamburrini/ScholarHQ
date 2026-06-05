function getOpenAiApiKey() {
  return process.env.SCHOLARHQ_API || "";
}

const DEFAULT_OPENAI_MODELS = ["gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini"];

function parseModelList(value) {
  return String(value || "")
    .split(",")
    .map(function (model) {
      return model.trim();
    })
    .filter(Boolean);
}

function getOpenAiModelCandidates() {
  const explicitCandidates = parseModelList(process.env.OPENAI_MODEL_CANDIDATES);
  const preferredModels = parseModelList(process.env.OPENAI_MODEL);
  const modelList = explicitCandidates.length
    ? explicitCandidates
    : preferredModels.concat(DEFAULT_OPENAI_MODELS);
  const seen = new Set();

  return modelList.filter(function (model) {
    if (seen.has(model)) {
      return false;
    }

    seen.add(model);
    return true;
  });
}

function getOpenAiErrorMessage(responsePayload, responseText) {
  return responsePayload && responsePayload.error && responsePayload.error.message
    ? responsePayload.error.message
    : responseText || "The OpenAI request failed.";
}

function isRetryableModelAccessError(statusCode, errorMessage) {
  const normalizedMessage = String(errorMessage || "").toLowerCase();

  return (
    statusCode === 400 &&
    (normalizedMessage.includes("does not have access to model") ||
      normalizedMessage.includes("model_not_found") ||
      normalizedMessage.includes("model not found") ||
      normalizedMessage.includes("unsupported model"))
  );
}

function buildOpenAiAccessError(modelErrors) {
  const attemptedModels = modelErrors
    .map(function (entry) {
      return entry.model;
    })
    .join(", ");
  const lastError = modelErrors.length ? modelErrors[modelErrors.length - 1].message : "The OpenAI request failed.";

  return (
    "The configured OpenAI project could not access any attempted ScholarHQ model (" +
    attemptedModels +
    "). Last OpenAI error: " +
    lastError +
    " This usually means the Render SCHOLARHQ_API key belongs to a project without billing/API credits or without access to those models. Add billing/API credits in OpenAI, or set OPENAI_MODEL_CANDIDATES in Render to a comma-separated list of model IDs your project can use."
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

      if (openAiResponse.ok) {
        break;
      }

      const apiError = getOpenAiErrorMessage(responsePayload, responseText);
      modelErrors.push({ model: model, message: apiError });

      if (isRetryableModelAccessError(openAiResponse.status, apiError)) {
        responsePayload = null;
        continue;
      }

      return {
        statusCode: openAiResponse.status,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: apiError }),
      };
    }

    if (!responsePayload) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: buildOpenAiAccessError(modelErrors) }),
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
