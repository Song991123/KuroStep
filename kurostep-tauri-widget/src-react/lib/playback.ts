export const REPEAT_MODES = ["off", "all", "one"] as const;
export const YOUTUBE_AD_DURATION_MAX_SECONDS = 90;

export type RepeatMode = typeof REPEAT_MODES[number];

export type YoutubePlaybackSnapshot = {
  activeVideoId?: string | null;
  expectedVideoId?: string | null;
  title?: string | null;
  candidateDurationSeconds?: number;
  expectedDurationSeconds?: number;
  currentSeconds?: number;
};

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

export function normalizeTrackDuration(seconds: number, stableSeconds = 0) {
  const nextDuration = Math.round(Number(seconds) || 0);
  const currentDuration = Math.round(Number(stableSeconds) || 0);
  if (nextDuration <= 0) return 0;
  if (currentDuration > 0 && Math.abs(currentDuration - nextDuration) <= 1) {
    return currentDuration;
  }
  return nextDuration;
}

export function youtubeTitleLooksLikeAd(title: string | null | undefined) {
  return /\b(advertisement|sponsored|commercial)\b|광고/.test(String(title || "").toLowerCase());
}

function isLikelyAdDuration(seconds: number, expectedSeconds = 0) {
  const nextDuration = Number(seconds);
  const expectedDuration = Number(expectedSeconds);
  if (!Number.isFinite(nextDuration) || !Number.isFinite(expectedDuration)) return false;
  if (nextDuration <= 0 || expectedDuration < 60) return false;
  if (nextDuration <= 90 && expectedDuration - nextDuration > 20) {
    return true;
  }
  return nextDuration < expectedDuration * 0.55;
}

export function isLikelyYoutubeAdPlaybackSnapshot(snapshot: YoutubePlaybackSnapshot) {
  const expectedDuration = Number(snapshot.expectedDurationSeconds || 0);
  const candidateDuration = Number(snapshot.candidateDurationSeconds || 0);
  const currentPosition = Number(snapshot.currentSeconds);
  const activeVideoId = String(snapshot.activeVideoId || "");
  const expectedVideoId = String(snapshot.expectedVideoId || "");
  const isDifferentVideo = Boolean(activeVideoId && expectedVideoId && activeVideoId !== expectedVideoId);
  const titleLooksLikeAd = youtubeTitleLooksLikeAd(snapshot.title);
  const durationLooksLikeAd = isLikelyAdDuration(candidateDuration, expectedDuration);
  const isUnknownShortClipDuringKnownTrack =
    !activeVideoId &&
    expectedDuration > YOUTUBE_AD_DURATION_MAX_SECONDS &&
    Number.isFinite(candidateDuration) &&
    candidateDuration > 0 &&
    candidateDuration <= YOUTUBE_AD_DURATION_MAX_SECONDS &&
    Number.isFinite(currentPosition) &&
    currentPosition >= 0 &&
    currentPosition <= YOUTUBE_AD_DURATION_MAX_SECONDS;
  const isShortPreDurationClip =
    !activeVideoId &&
    expectedDuration <= 0 &&
    Number.isFinite(candidateDuration) &&
    candidateDuration > 0 &&
    candidateDuration <= YOUTUBE_AD_DURATION_MAX_SECONDS;
  const isPreDurationClockOnlyClip =
    expectedDuration <= 0 &&
    Number.isFinite(currentPosition) &&
    currentPosition > 0 &&
    currentPosition <= YOUTUBE_AD_DURATION_MAX_SECONDS &&
    (!Number.isFinite(candidateDuration) || candidateDuration <= 0 || candidateDuration <= YOUTUBE_AD_DURATION_MAX_SECONDS);

  return (
    titleLooksLikeAd ||
    isDifferentVideo ||
    isUnknownShortClipDuringKnownTrack ||
    isShortPreDurationClip ||
    isPreDurationClockOnlyClip ||
    durationLooksLikeAd
  );
}
