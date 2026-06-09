import { SectionHeader } from "./SectionHeader.js";
import { escapeHtml } from "./html.js";

export function TodayWorkWidget(work) {
  const statuses = [
    ["TODO", work.todoCount],
    ["DOING", work.doingCount],
    ["DONE", work.doneCount],
  ];

  const statusButtons = statuses
    .map(([status, count]) => {
      const active = status === work.status ? " active" : "";
      return `<button class="badge${active}" type="button">${status} <span>${count}</span></button>`;
    })
    .join("");

  return `
    <section class="widget-section today-work" aria-labelledby="today-work-title">
      ${SectionHeader("TODAY'S WORK", "+ 작업")}
      <div class="task-header">
        <h3 class="task-title" id="today-work-title">${escapeHtml(work.title)}</h3>
      </div>
      <div class="status-badges" aria-label="작업 상태">
        ${statusButtons}
      </div>
      <div class="button-row">
        <button class="action-button" type="button">상태 변경</button>
        <button class="action-button" type="button">플리 연결</button>
      </div>
    </section>
  `;
}
