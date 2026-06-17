import { escapeHtml } from "../utils/formatters.js";

export function renderSessionForm({ draft, errors, isEditing }) {
  const title = isEditing ? "Edit Study Session" : "Log Study Session";
  const helper = isEditing
    ? "Update the session details and save your changes."
    : "Capture what you studied, how long you focused, and any useful notes.";

  return `
    <section class="panel form-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Session Entry</p>
          <h2>${title}</h2>
        </div>
        <p class="panel-copy">${helper}</p>
      </div>

      <form id="session-form" novalidate>
        <div class="form-grid">
          <label>
            <span>Subject</span>
            <input
              type="text"
              name="subject"
              value="${escapeHtml(draft.subject)}"
              placeholder="Biology, Algebra, History..."
              maxlength="60"
              required
            />
            ${errors.subject ? `<small class="field-error">${escapeHtml(errors.subject)}</small>` : ""}
          </label>

          <label>
            <span>Date</span>
            <input type="date" name="date" value="${escapeHtml(draft.date)}" required />
            ${errors.date ? `<small class="field-error">${escapeHtml(errors.date)}</small>` : ""}
          </label>

          <label>
            <span>Duration (minutes)</span>
            <input
              type="number"
              name="durationMinutes"
              min="1"
              max="1440"
              step="1"
              value="${escapeHtml(String(draft.durationMinutes))}"
              required
            />
            ${
              errors.durationMinutes
                ? `<small class="field-error">${escapeHtml(errors.durationMinutes)}</small>`
                : ""
            }
          </label>

          <label>
            <span>Category</span>
            <input
              type="text"
              name="category"
              value="${escapeHtml(draft.category)}"
              placeholder="Revision, Homework, Reading..."
              maxlength="40"
            />
          </label>
        </div>

        <label>
          <span>Notes</span>
          <textarea
            name="notes"
            rows="4"
            maxlength="280"
            placeholder="What did you cover? What should you revisit next?"
          >${escapeHtml(draft.notes)}</textarea>
        </label>

        <div class="form-actions">
          <button class="primary-button" type="submit">
            ${isEditing ? "Save Changes" : "Add Session"}
          </button>
          ${
            isEditing
              ? '<button class="secondary-button" type="button" data-action="cancel-edit">Cancel</button>'
              : ""
          }
        </div>
      </form>
    </section>
  `;
}
