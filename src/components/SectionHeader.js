import { escapeHtml } from "./html.js";

export function SectionHeader(title, actionLabel) {
  const action = actionLabel
    ? `<button class="action-button" type="button">${escapeHtml(actionLabel)}</button>`
    : "";

  return `
    <div class="section-head">
      <h2 class="section-title">${escapeHtml(title)}</h2>
      ${action}
    </div>
  `;
}
