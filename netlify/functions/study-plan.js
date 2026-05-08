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
      return String(item || "").replace(/^[-*•]\s*/, "").trim();
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizePlanResult(parsed, rawText) {
  const focusAreas = normalizeList(parsed && parsed.focusAreas);
  const studyBlocks = normalizeList(parsed && parsed.studyBlocks);
  const researchedTopics = normalizeList(parsed && parsed.researchedTopics);
  const topicGuidance = normalizeList(parsed && parsed.topicGuidance);
  const tips = normalizeList(parsed && parsed.tips);
  const fallbackPool = []
    .concat(focusAreas)
    .concat(studyBlocks)
    .concat(researchedTopics)
    .concat(topicGuidance)
    .concat(tips)
    .filter(Boolean);

  function fillSection(items, startIndex, count) {
    if (items.length) {
      return items;
    }

    return fallbackPool.slice(startIndex, startIndex + count);
  }

  return {
    headline: String((parsed && parsed.headline) || "Your study plan is ready.").trim(),
    summary: String((parsed && parsed.summary) || rawText || "The AI generated a study plan.").trim(),
    focusAreas: fillSection(focusAreas, 0, 3),
    studyBlocks: fillSection(studyBlocks, 0, 3),
    researchedTopics: fillSection(researchedTopics, 0, 3),
    topicGuidance: fillSection(topicGuidance, 0, 4),
    tips: fillSection(tips, 1, 4),
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

function extractSection(text, label, nextLabels) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextPattern = nextLabels
    .map(function (nextLabel) {
      return nextLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("|");
  const regex = new RegExp(
    escapedLabel + "\\s*:\\s*([\\s\\S]*?)(?:\\n(?:" + nextPattern + ")\\s*:|$)",
    "i"
  );
  const match = String(text || "").match(regex);
  return match ? match[1].trim() : "";
}

function parseBullets(text) {
  return String(text || "")
    .split("\n")
    .map(function (line) {
      return line.replace(/^[-*•]\s*/, "").trim();
    })
    .filter(Boolean)
    .slice(0, 5);
}

function fallbackListFromText(text) {
  return String(text || "")
    .split(/\n+/)
    .map(function (line) {
      return line.replace(/^[-*•]\s*/, "").trim();
    })
    .filter(Boolean)
    .slice(0, 5);
}

function parsePlanText(rawText) {
  const sectionOrder = [
    "HEADLINE",
    "SUMMARY",
    "FOCUS AREAS",
    "STUDY BLOCKS",
    "RESEARCHED TOPICS",
    "TOPIC GUIDANCE",
    "TIPS",
  ];

  const headline = extractSection(rawText, "HEADLINE", sectionOrder.slice(1));
  const summary = extractSection(rawText, "SUMMARY", sectionOrder.slice(2));
  const focusAreas = parseBullets(extractSection(rawText, "FOCUS AREAS", sectionOrder.slice(3)));
  const studyBlocks = parseBullets(extractSection(rawText, "STUDY BLOCKS", sectionOrder.slice(4)));
  const researchedTopics = parseBullets(extractSection(rawText, "RESEARCHED TOPICS", sectionOrder.slice(5)));
  const topicGuidance = parseBullets(extractSection(rawText, "TOPIC GUIDANCE", sectionOrder.slice(6)));
  const tips = parseBullets(extractSection(rawText, "TIPS", []));

  if (!headline && !summary && !focusAreas.length && !studyBlocks.length && !topicGuidance.length) {
    return null;
  }

  return {
    headline: headline || "Your study plan is ready.",
    summary: summary || rawText || "The AI generated a study plan.",
    focusAreas: focusAreas,
    studyBlocks: studyBlocks,
    researchedTopics: researchedTopics,
    topicGuidance: topicGuidance,
    tips: tips,
  };
}

function buildLooseFallbackPlan(rawText) {
  const cleaned = String(rawText || "").trim();
  const lines = fallbackListFromText(cleaned);
  const headline = lines[0] || "Your study plan is ready.";
  const summary = lines.slice(1, 3).join(" ") || cleaned || "The AI generated a study plan.";
  const items = lines.slice(1);

  return {
    headline: headline,
    summary: summary,
    focusAreas: items.slice(0, 3),
    studyBlocks: items.slice(0, 3),
    researchedTopics: items.slice(0, 3),
    topicGuidance: items.slice(0, 4),
    tips: items.slice(0, 4),
  };
}

function extractSources(payload) {
  if (!payload || !Array.isArray(payload.output)) {
    return [];
  }

  const collected = [];

  payload.output.forEach(function (item) {
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
      (Array.isArray(payload.recentGrades) && payload.recentGrades.length > 0) ||
      (Array.isArray(payload.classSummaries) && payload.classSummaries.length > 0);

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
        model: process.env.OPENAI_MODEL || "gpt-4.1",
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        input:
          "You are an academic study-planning assistant for a student dashboard named ScholarHQ. " +
          "Create a concise short-term study plan from the student's recent study behavior, grades, and class workload. " +
          "If the student has named assignments, quizzes, projects, chapters, or exams in researchedTopics, use web search to research only those topics and infer what they should actually study. " +
          "Return plain text in exactly this labeled format: " +
          "HEADLINE:, SUMMARY:, FOCUS AREAS:, STUDY BLOCKS:, RESEARCHED TOPICS:, TOPIC GUIDANCE:, TIPS:. " +
          "For the list sections, use bullet points starting with '- '. Do not return JSON. " +
          "Be practical, encouraging, and specific. " +
          "Recommend concrete study blocks with class names, task types, and realistic durations. " +
          "Keep the response short enough for a quick dashboard card. " +
          "Use the researched assignment names and exam topics to say what concepts, methods, problem types, or vocabulary the student should actually focus on. " +
          "Keep each list to at most 5 items and avoid markdown tables.\n\n" +
          "Student dashboard data:\n" +
          JSON.stringify(payload),
      }),
    });

    const responseText = await openAiResponse.text();
    let responsePayload = null;

    try {
      responsePayload = JSON.parse(responseText);
    } catch (_error) {
      responsePayload = null;
    }

    if (!openAiResponse.ok) {
      const apiError =
        responsePayload && responsePayload.error && responsePayload.error.message
          ? responsePayload.error.message
          : responseText || "The OpenAI request failed.";

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
        statusCode: 502,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "The OpenAI response was not valid JSON.",
        }),
      };
    }

    const rawText = extractResponseText(responsePayload);
    const parsed = parsePlanText(rawText) || tryParseJson(rawText) || buildLooseFallbackPlan(rawText);
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
