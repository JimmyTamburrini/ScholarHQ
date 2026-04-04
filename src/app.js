import { renderSessionForm } from "./components/sessionForm.js";
import { renderSessionList } from "./components/sessionList.js";
import { renderSummaryCards } from "./components/summaryCards.js";
import { createSession, loadSessions, saveSessions, updateSession } from "./data/sessionStore.js";

const appRoot = document.querySelector("#app");

const blankDraft = () => ({
  subject: "",
  date: new Date().toISOString().slice(0, 10),
  durationMinutes: 60,
  notes: "",
  category: "",
});

const state = {
  sessions: loadSessions(),
  draft: blankDraft(),
  errors: {},
  editingId: null,
};

function validateDraft(draft) {
  const errors = {};

  if (!draft.subject.trim()) {
    errors.subject = "Subject is required.";
  }

  if (!draft.date || Number.isNaN(Date.parse(draft.date))) {
    errors.date = "Choose a valid study date.";
  }

  const duration = Number(draft.durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    errors.durationMinutes = "Duration must be greater than zero.";
  }

  return errors;
}

function setDraftFromSession(session) {
  state.draft = {
    subject: session.subject,
    date: session.date.slice(0, 10),
    durationMinutes: session.durationMinutes,
    notes: session.notes ?? "",
    category: session.category ?? "",
  };
}

function resetForm() {
  state.draft = blankDraft();
  state.errors = {};
  state.editingId = null;
}

function persist() {
  saveSessions(state.sessions);
}

function render() {
  const isEditing = Boolean(state.editingId);

  appRoot.innerHTML = `
    <main class="page-shell">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Local-First Study Tracker</p>
          <h1>Turn each study block into visible progress.</h1>
          <p class="hero-text">
            Log sessions, track total focus time, and build a clean study history that stays saved in your browser.
          </p>
        </div>
      </section>

      ${renderSummaryCards(state.sessions)}

      <section class="workspace-grid">
        ${renderSessionForm({ draft: state.draft, errors: state.errors, isEditing })}
        ${renderSessionList(state.sessions)}
      </section>
    </main>
  `;
}

function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  const draft = {
    subject: String(formData.get("subject") ?? ""),
    date: String(formData.get("date") ?? ""),
    durationMinutes: Number(formData.get("durationMinutes") ?? 0),
    notes: String(formData.get("notes") ?? ""),
    category: String(formData.get("category") ?? ""),
  };

  const errors = validateDraft(draft);
  state.draft = draft;
  state.errors = errors;

  if (Object.keys(errors).length > 0) {
    render();
    return;
  }

  if (state.editingId) {
    state.sessions = state.sessions.map((session) =>
      session.id === state.editingId ? updateSession(session, draft) : session
    );
  } else {
    state.sessions = [createSession(draft), ...state.sessions];
  }

  state.sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
  persist();
  resetForm();
  render();
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }

  const { action, id } = target.dataset;

  if (action === "cancel-edit") {
    resetForm();
    render();
    return;
  }

  if (!id) {
    return;
  }

  if (action === "edit") {
    const session = state.sessions.find((entry) => entry.id === id);
    if (!session) {
      return;
    }

    state.editingId = id;
    state.errors = {};
    setDraftFromSession(session);
    render();
    return;
  }

  if (action === "delete") {
    state.sessions = state.sessions.filter((entry) => entry.id !== id);
    persist();

    if (state.editingId === id) {
      resetForm();
    }

    render();
  }
}

appRoot.addEventListener("submit", (event) => {
  if (event.target instanceof HTMLFormElement && event.target.id === "session-form") {
    handleSubmit(event);
  }
});

appRoot.addEventListener("click", handleClick);

render();
