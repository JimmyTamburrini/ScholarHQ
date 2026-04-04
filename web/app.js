import { loadSessions, saveSessions } from "./sessionStore.js";

const form = document.querySelector("#session-form");
const formMessage = document.querySelector("#form-message");
const submitButton = document.querySelector("#submit-button");
const resetButton = document.querySelector("#reset-button");
const sessionList = document.querySelector("#session-list");
const sessionCount = document.querySelector("#session-count");
const summaryCards = document.querySelector("#summary-cards");
const subjectTotals = document.querySelector("#subject-totals");

const fields = {
  id: document.querySelector("#session-id"),
  subject: document.querySelector("#subject"),
  date: document.querySelector("#date"),
  duration: document.querySelector("#duration"),
  category: document.querySelector("#category"),
  notes: document.querySelector("#notes"),
};

let sessions = loadSessions().sort(byLatestUpdated);

initialize();

function initialize() {
  if (!fields.date.value) {
    fields.date.value = new Date().toISOString().slice(0, 10);
  }

  form.addEventListener("submit", handleSubmit);
  resetButton.addEventListener("click", resetForm);
  sessionList.addEventListener("click", handleListClick);

  render();
}

function handleSubmit(event) {
  event.preventDefault();

  const payload = readForm();
  const validationError = validateSession(payload);

  if (validationError) {
    setMessage(validationError, "error");
    return;
  }

  const existingSessionIndex = sessions.findIndex((session) => session.id === payload.id);
  const now = new Date().toISOString();

  if (existingSessionIndex >= 0) {
    const currentSession = sessions[existingSessionIndex];
    sessions[existingSessionIndex] = {
      ...currentSession,
      ...payload,
      createdAt: currentSession.createdAt,
      updatedAt: now,
    };
    setMessage("Session updated.", "success");
  } else {
    sessions.unshift({
      ...payload,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    setMessage("Session saved.", "success");
  }

  persistAndRender();
  resetForm({ preserveMessage: true });
}

function handleListClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const { action, sessionId } = actionButton.dataset;
  const session = sessions.find((item) => item.id === sessionId);

  if (!session) {
    return;
  }

  if (action === "edit") {
    populateForm(session);
    setMessage(`Editing ${session.subject}.`, "success");
    fields.subject.focus();
    return;
  }

  if (action === "delete") {
    sessions = sessions.filter((item) => item.id !== sessionId);
    persistAndRender();
    resetForm({ preserveMessage: true });
    setMessage("Session deleted.", "success");
  }
}

function readForm() {
  return {
    id: fields.id.value.trim(),
    subject: fields.subject.value.trim(),
    date: fields.date.value,
    durationMinutes: Number(fields.duration.value),
    category: fields.category.value.trim(),
    notes: fields.notes.value.trim(),
  };
}

function validateSession(session) {
  if (!session.subject) {
    return "Subject is required.";
  }

  if (!session.date || Number.isNaN(Date.parse(session.date))) {
    return "A valid study date is required.";
  }

  if (!Number.isInteger(session.durationMinutes) || session.durationMinutes <= 0) {
    return "Duration must be a whole number greater than zero.";
  }

  return "";
}

function persistAndRender() {
  sessions = sessions.sort(byLatestUpdated);
  saveSessions(sessions);
  render();
}

function render() {
  renderSummary();
  renderSubjectTotals();
  renderSessionList();
}

function renderSummary() {
  const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const totalSessions = sessions.length;
  const totalSubjects = new Set(sessions.map((session) => session.subject.toLowerCase())).size;
  const longestSession = sessions.reduce(
    (max, session) => Math.max(max, session.durationMinutes),
    0,
  );

  const cards = [
    { label: "Total study time", value: formatMinutes(totalMinutes) },
    { label: "Sessions logged", value: String(totalSessions) },
    { label: "Subjects covered", value: String(totalSubjects) },
    { label: "Longest session", value: longestSession ? formatMinutes(longestSession) : "0m" },
    { label: "Average session", value: totalSessions ? formatMinutes(Math.round(totalMinutes / totalSessions)) : "0m" },
    { label: "Most recent date", value: sessions[0] ? formatDate(sessions[0].date) : "No sessions" },
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card">
          <p class="summary-card-label">${escapeHtml(card.label)}</p>
          <p class="summary-card-value">${escapeHtml(card.value)}</p>
        </article>
      `,
    )
    .join("");
}

function renderSubjectTotals() {
  if (!sessions.length) {
    subjectTotals.innerHTML = emptyState("No subject totals yet", "Your study breakdown will appear after the first saved session.");
    return;
  }

  const totals = new Map();

  for (const session of sessions) {
    const current = totals.get(session.subject) || 0;
    totals.set(session.subject, current + session.durationMinutes);
  }

  const rows = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([subject, minutes]) => `
        <div class="subject-total-row">
          <span class="subject-total-name">${escapeHtml(subject)}</span>
          <span class="subject-total-time">${escapeHtml(formatMinutes(minutes))}</span>
        </div>
      `,
    );

  subjectTotals.innerHTML = rows.join("");
}

function renderSessionList() {
  sessionCount.textContent = `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;

  if (!sessions.length) {
    sessionList.innerHTML = emptyState(
      "No sessions saved",
      "Use the form to create your first study entry. It will be stored in this browser.",
    );
    return;
  }

  sessionList.innerHTML = sessions
    .map(
      (session) => `
        <article class="session-card">
          <div class="session-card-top">
            <div>
              <h3>${escapeHtml(session.subject)}</h3>
              <p class="session-card-meta">
                ${escapeHtml(formatDate(session.date))} · ${escapeHtml(formatMinutes(session.durationMinutes))}
              </p>
            </div>
            <div class="session-actions">
              <button class="button button-secondary" type="button" data-action="edit" data-session-id="${escapeHtml(session.id)}">
                Edit
              </button>
              <button class="button button-danger" type="button" data-action="delete" data-session-id="${escapeHtml(session.id)}">
                Delete
              </button>
            </div>
          </div>
          ${session.category ? `<p class="pill">${escapeHtml(session.category)}</p>` : ""}
          ${session.notes ? `<p class="session-notes">${escapeHtml(session.notes)}</p>` : ""}
        </article>
      `,
    )
    .join("");
}

function populateForm(session) {
  fields.id.value = session.id;
  fields.subject.value = session.subject;
  fields.date.value = session.date;
  fields.duration.value = String(session.durationMinutes);
  fields.category.value = session.category || "";
  fields.notes.value = session.notes || "";
  submitButton.textContent = "Update session";
}

function resetForm(options = {}) {
  form.reset();
  fields.id.value = "";
  fields.date.value = new Date().toISOString().slice(0, 10);
  submitButton.textContent = "Save session";

  if (!options.preserveMessage) {
    setMessage("", "");
  }
}

function setMessage(message, tone) {
  formMessage.textContent = message;
  if (tone) {
    formMessage.dataset.tone = tone;
  } else {
    delete formMessage.dataset.tone;
  }
}

function formatMinutes(totalMinutes) {
  if (!totalMinutes) {
    return "0m";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes}m`;
  }

  if (!minutes) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function emptyState(title, description) {
  return `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function byLatestUpdated(a, b) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
