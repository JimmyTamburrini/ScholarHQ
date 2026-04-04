const STORAGE_KEY = "study-tracker-sessions";

function isValidDateString(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeSession(session) {
  const now = new Date().toISOString();

  return {
    id: String(session.id ?? crypto.randomUUID()),
    subject: String(session.subject ?? "").trim(),
    date: isValidDateString(session.date) ? session.date : now.slice(0, 10),
    durationMinutes: Number(session.durationMinutes ?? 0),
    notes: String(session.notes ?? "").trim(),
    category: String(session.category ?? "").trim(),
    createdAt: isValidDateString(session.createdAt) ? session.createdAt : now,
    updatedAt: isValidDateString(session.updatedAt) ? session.updatedAt : now,
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
      .map(normalizeSession)
      .filter((session) => session.subject && session.durationMinutes > 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch {
    return [];
  }
}

export function saveSessions(sessions) {
  const normalized = sessions.map(normalizeSession);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function createSession(input) {
  const now = new Date().toISOString();
  return normalizeSession({
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  });
}

export function updateSession(existing, input) {
  return normalizeSession({
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
  });
}
