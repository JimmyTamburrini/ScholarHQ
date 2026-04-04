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
    .slice(0, 5);
}

function normalizePlanResult(parsed, rawText) {
  return {
    headline: String((parsed && parsed.headline) || "Your study plan is ready.").trim(),
    summary: String((parsed && parsed.summary) || rawText || "The AI generated a study plan.").trim(),
    focusAreas: normalizeList(parsed && parsed.focusAreas),
    studyBlocks: normalizeList(parsed && parsed.studyBlocks),
    researchedTopics: normalizeList(parsed && parsed.researchedTopics),
    topicGuidance: normalizeList(parsed && parsed.topicGuidance),
    tips: normalizeList(parsed && parsed.tips),
    sources: [],
  };
}

function tryParseJson(value) {
  try {
    return JSON.parse(stripCodeFences(value));
  } catch (_error) {
    return null;
  }
}

function extractSources(payload) {
  if (!payload || !Array.isArray(payload.output)) {
    return [];
  }

  const collected = [];

  payload.output.forEach(function (item) {
    if (item && item.type === "web_search_call" && item.action && Array.isArray(item.action.sources)) {
      item.action.sources.forEach(function (source) {
        if (source && source.url) {
          collected.push({
            title: source.title || source.url,
            url: source.url,
          });
        }
      });
    }

    if (item && item.type === "message" && Array.isArray(item.content)) {
      item.content.forEach(function (contentItem) {
        if (!contentItem || !Array.isArray(contentItem.annotations)) {
          return;
        }

        contentItem.annotations.forEach(function (annotation) {
          if (annotation && annotation.type === "url_citation" && annotation.url) {
            collected.push({
              title: annotation.title || annotation.url,
              url: annotation.url,
            });
          }
        });
      });
    }
  });

  const seen = new Set();
  return collected.filter(function (source) {
    if (seen.has(source.url)) {
      return false;
    }
    seen.add(source.url);
    return true;
  }).slice(0, 8);
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

  if (!process.env.OPENAI_API_KEY) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "OPENAI_API_KEY is not configured yet. Add it in Netlify environment variables before using AI Study Plan.",
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
        body: JSON.stringify({ error: "There is not enough study data yet for the AI study plan to analyze." }),
      };
    }

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources"],
        text: {
          format: {
            type: "json_object",
          },
        },
        input:
          "You are an academic study-planning assistant for a student dashboard named Productivity Hub. " +
          "Create a realistic short-term study plan from the student's recent study behavior, grades, and class workload. " +
          "If the student has named assignments, quizzes, projects, chapters, or exams, use web search to research those topics and infer what they should actually study. " +
          "Return only valid JSON with this exact shape: " +
          '{ "headline": string, "summary": string, "focusAreas": string[], "studyBlocks": string[], "researchedTopics": string[], "topicGuidance": string[], "tips": string[] }. ' +
          "Be practical, encouraging, and specific. " +
          "Recommend concrete study blocks with class names, task types, and realistic durations. " +
          "Use the researched assignment names and exam topics to say what concepts, methods, problem types, or vocabulary the student should actually focus on. " +
          "Keep each list to at most 5 items and avoid markdown.\n\n" +
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
    const parsed = tryParseJson(rawText);
    if (!parsed) {
      return {
        statusCode: 502,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "The AI study plan response was not valid JSON. Try again, or set OPENAI_MODEL to gpt-5 in Netlify if it is currently overridden.",
        }),
      };
    }
    const plan = normalizePlanResult(parsed, rawText);
    plan.sources = extractSources(responsePayload);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan: plan }),
    };
  } catch (_error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "The AI Study Plan could not generate a plan right now. Check the server logs and environment variables, then try again.",
      }),
    };
  }
};
