import type { CreatorTask, StatusCounts, TaskStatus } from "../types";

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function statusLabel(status?: TaskStatus | string) {
  return {
    TODO: "할 일",
    DOING: "진행 중",
    DONE: "완료",
  }[status] || status || "할 일";
}

export function countStatuses(tasks: CreatorTask[]): StatusCounts {
  return tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    { TODO: 0, DOING: 0, DONE: 0 },
  );
}
