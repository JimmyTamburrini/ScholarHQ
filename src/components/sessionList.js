import { escapeHtml, formatDate, formatMinutes } from "../utils/formatters.js";

export function renderSessionList(sessions) {
  return `
    <section class="panel list-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Recent Sessions</p>
          <h2>Your Study Log</h2>
        </div>
        <p class="panel-copy">Edit or remove entries whenever your study history changes.</p>
      </div>

      ${
        sessions.length
          ? `
            <div class="session-list">
              ${sessions
                .map(
                  (session) => `
                    <article class="session-item">
                      <div class="session-main">
                        <div class="session-title-row">
                          <h3>${escapeHtml(session.subject)}</h3>
                          <span class="pill">${formatMinutes(session.durationMinutes)}</span>
                        </div>
                        <p class="session-meta">
                          <span>${formatDate(session.date)}</span>
                          ${
                            session.category
                              ? `<span>${escapeHtml(session.category)}</span>`
                              : ""
                          }
                        </p>
                        ${
                          session.notes
                            ? `<p class="session-notes">${escapeHtml(session.notes)}</p>`
                            : ""
                        }
                      </div>
                      <div class="session-actions">
                        <button class="secondary-button" type="button" data-action="edit" data-id="${escapeHtml(session.id)}">
                          Edit
                        </button>
                        <button class="ghost-button" type="button" data-action="delete" data-id="${escapeHtml(session.id)}">
                          Delete
                        </button>
                      </div>
                    </article>
                  `
                )
                .join("")}
            </div>
          `
          : `
            <div class="empty-state">
              <h3>No sessions yet</h3>
              <p>Start by logging your first study session. Your data will be saved locally in this browser.</p>
            </div>
          `
      }
    </section>
  `;
}
