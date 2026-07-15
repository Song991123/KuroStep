export const REPEAT_MODES = ["off", "all", "one"] as const;

export type RepeatMode = typeof REPEAT_MODES[number];

export function normalizeRepeatMode(mode: string | null | undefined): RepeatMode {
  return REPEAT_MODES.includes(mode as RepeatMode) ? mode as RepeatMode : "off";
}

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  const currentIndex = REPEAT_MODES.indexOf(mode);
  return REPEAT_MODES[(currentIndex + 1) % REPEAT_MODES.length];
}

export function repeatModeLabel(mode: RepeatMode) {
  if (mode === "all") return "전체 반복";
  if (mode === "one") return "한 곡 반복";
  return "반복 꺼짐";
}

export function repeatModeNotice(mode: RepeatMode) {
  if (mode === "all") return "플레이리스트를 빙글빙글 반복한다냥.";
  if (mode === "one") return "이 곡만 계속 따라 걷는다냥.";
  return "반복 산책을 잠깐 접었다냥.";
}

export function getNextPlaylistIndex(length: number, currentIndex: number, offset: number, wrap: boolean) {
  const listLength = Math.max(0, Math.floor(Number(length) || 0));
  if (listLength <= 0) return -1;

  const current = Math.min(Math.max(Math.floor(Number(currentIndex) || 0), 0), listLength - 1);
  let next = current + Math.trunc(Number(offset) || 0);
  if (next < 0) {
    next = wrap ? listLength - 1 : 0;
  }
  if (next >= listLength) {
    next = wrap ? 0 : listLength - 1;
  }
  return next;
}
