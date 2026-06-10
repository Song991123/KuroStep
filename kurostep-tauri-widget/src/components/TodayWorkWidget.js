import { SectionHeader } from "./SectionHeader.js";
import { escapeHtml } from "./html.js";

const STATUS_LABELS = {
  TODO: "할 일",
  DOING: "걷는 중",
  DONE: "발도장",
};

export function TodayWorkWidget(work) {
  if (!work) {
    return `
      <section class="widget-section today-work">
        ${SectionHeader("오늘 할 일")}
        <p class="state-message">오늘 찍을 발자국이 아직 없다냥.</p>
      </section>
    `;
  }

  const statuses = [
    ["TODO", work.todoCount],
    ["DOING", work.doingCount],
    ["DONE", work.doneCount],
  ];

  const statusButtons = statuses
    .map(([status, count]) => {
      const active = status === work.status ? " active" : "";
      return `<button class="badge${active}" type="button">${STATUS_LABELS[status]} <span>${count}</span></button>`;
    })
    .join("");

  return `
    <section class="widget-section today-work" aria-labelledby="today-work-title">
      ${SectionHeader("오늘 할 일")}
      <div class="task-header">
        <h3 class="task-title" id="today-work-title">${escapeHtml(work.title)}</h3>
      </div>
      <div class="status-badges" aria-label="작업 상태">
        ${statusButtons}
      </div>
    </section>
  `;
}
