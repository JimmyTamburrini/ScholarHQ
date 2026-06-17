import { formatMinutes, escapeHtml } from "../utils/formatters.js";

function buildSubjectBreakdown(sessions) {
  const totals = new Map();

  for (const session of sessions) {
    const current = totals.get(session.subject) ?? 0;
    totals.set(session.subject, current + session.durationMinutes);
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
}

export function renderSummaryCards(sessions) {
  const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const subjectCount = new Set(sessions.map((session) => session.subject)).size;
  const currentWeekMinutes = sessions
    .filter((session) => {
      const sessionDate = new Date(session.date);
      const now = new Date();
      const diffInDays = (now - sessionDate) / (1000 * 60 * 60 * 24);
      return diffInDays >= 0 && diffInDays <= 7;
    })
    .reduce((sum, session) => sum + session.durationMinutes, 0);
  const breakdown = buildSubjectBreakdown(sessions);

  return `
    <section class="summary-grid" aria-label="Study summary">
      <article class="summary-card">
        <p class="eyebrow">Total Focus Time</p>
        <h2>${formatMinutes(totalMinutes)}</h2>
        <p>Across ${sessions.length} logged study session${sessions.length === 1 ? "" : "s"}.</p>
      </article>
      <article class="summary-card">
        <p class="eyebrow">Active Subjects</p>
        <h2>${subjectCount}</h2>
        <p>Distinct subjects tracked in your browser on this device.</p>
      </article>
      <article class="summary-card">
        <p class="eyebrow">This Week</p>
        <h2>${formatMinutes(currentWeekMinutes)}</h2>
        <p>Recent effort from the last 7 days.</p>
      </article>
      <article class="summary-card subject-card">
        <p class="eyebrow">Top Subjects</p>
        ${
          breakdown.length
            ? `
              <ul class="subject-breakdown">
                ${breakdown
                  .map(
                    ([subject, minutes]) => `
                      <li>
                        <span>${escapeHtml(subject)}</span>
                        <strong>${formatMinutes(minutes)}</strong>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            `
            : "<p>No subjects yet. Add your first session to see your study mix.</p>"
        }
      </article>
    </section>
  `;
}
