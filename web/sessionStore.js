const STORAGE_KEY = "study-tracker-sessions-v1";

function sanitizeSession(rawSession) {
  return {
    id: String(rawSession.id),
    subject: String(rawSession.subject || "").trim(),
    date: String(rawSession.date || ""),
    durationMinutes: Number(rawSession.durationMinutes) || 0,
    category: String(rawSession.category || "").trim(),
    notes: String(rawSession.notes || "").trim(),
    createdAt: String(rawSession.createdAt || new Date().toISOString()),
    updatedAt: String(rawSession.updatedAt || new Date().toISOString()),
  };
}

export function loadSessions() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(sanitizeSession)
      .filter((session) => session.subject && session.date && session.durationMinutes > 0);
  } catch {
    return [];
  }
}

export function saveSessions(sessions) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}
