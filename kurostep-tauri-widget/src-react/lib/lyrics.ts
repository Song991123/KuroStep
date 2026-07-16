import type { Lyric, LyricSource, SelectedLine, Translation } from "./api";

export const LYRIC_SYNC_LOOKAHEAD_MS = 350;
export const MAX_LYRIC_SYNC_OFFSET_MS = 30000;

export function normalizeMemoText(text: string | null | undefined) {
  const value = String(text || "");
  if (value.trim() === "작업 중 떠오른 번역 느낌을 살짝 적어둘게냥.") {
    return "";
  }
  return value;
}

export function lyricLineKey(line: SelectedLine | null | undefined) {
  if (!line?.text) return "";
  if (line.id != null) return `id-${line.id}`;
  return `idx-${line.lineIndex}-${line.startTimeMs ?? "na"}-${line.text}`;
}

export function isSameLyricLine(left: SelectedLine | null | undefined, right: SelectedLine | null | undefined) {
  const leftKey = lyricLineKey(left);
  return Boolean(leftKey && leftKey === lyricLineKey(right));
}

export function clampLyricSyncOffset(value: number) {
  return Math.min(Math.max(Math.round(Number(value) || 0), -MAX_LYRIC_SYNC_OFFSET_MS), MAX_LYRIC_SYNC_OFFSET_MS);
}

export function isTranslationForLine(translation: Translation | null | undefined, line: SelectedLine | null | undefined) {
  if (!translation || !line?.text) return false;
  if (translation.clientLineKey) {
    return translation.clientLineKey === lyricLineKey(line);
  }
  if (translation.lyricLineRefId != null && line.id != null) {
    return Number(translation.lyricLineRefId) === Number(line.id);
  }
  if (translation.status === "LOCAL_DRAFT") {
    if (translation.lyricLineRefId != null && line.id != null) {
      return Number(translation.lyricLineRefId) === Number(line.id);
    }
    return line.id == null && translation.translatedText === line.text;
  }
  return false;
}

export function translationFingerprint(translation: Translation | null | undefined) {
  if (!translation) return "";
  return [
    translation.id || "",
    translation.clientLineKey || "",
    translation.lyricLineRefId || "",
    translation.status || "",
    translation.translatedText || "",
    normalizeMemoText(translation.memoText),
  ].join("|");
}

export function stableTranslationForLine(
  line: SelectedLine | null | undefined,
  candidates: Array<Translation | null | undefined>,
) {
  if (!line?.text) return null;
  return candidates.find((candidate) => isTranslationForLine(candidate, line)) || null;
}

export function translationStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "AUTO_DRAFT":
      return "";
    case "LOCAL_DRAFT":
      return "작성 중";
    case "EDITED":
    case "SAVED":
      return "저장됨";
    default:
      return "";
  }
}

export function shouldAutoTranslateLine(text: string | null | undefined) {
  return Boolean(String(text || "").trim()) && !/[\uac00-\ud7a3]/.test(String(text || ""));
}

export function chooseLineByPlaybackTime(
  lyric: Lyric | null,
  source: LyricSource | null,
  positionSeconds: number,
  syncOffsetMs = 0,
): SelectedLine | null {
  const refs = lyric?.lines || [];
  const sourceLines = source?.lines || [];
  if (!refs.length && !sourceLines.length) return null;

  const rawPositionMs = positionSeconds * 1000 + syncOffsetMs;
  const positionMs = rawPositionMs + LYRIC_SYNC_LOOKAHEAD_MS;
  const timedRefs = refs
    .filter((line) => Number.isFinite(line.startTimeMs))
    .sort((left, right) => Number(left.startTimeMs) - Number(right.startTimeMs));
  const timedSourceLines = sourceLines
    .filter((line) => Number.isFinite(line.startTimeMs))
    .sort((left, right) => Number(left.startTimeMs) - Number(right.startTimeMs));
  if (!timedRefs.length && !timedSourceLines.length) {
    const fallbackSourceLine = sourceLines[0];
    const fallbackRef = refs[0];
    if (!fallbackSourceLine && !fallbackRef) return null;
    return {
      id: fallbackRef?.id || null,
      lineIndex: fallbackRef?.lineIndex ?? fallbackSourceLine?.index ?? 0,
      startTimeMs: fallbackRef?.startTimeMs ?? fallbackSourceLine?.startTimeMs ?? null,
      text: fallbackSourceLine?.text || "",
    };
  }
  const firstTimedLine = timedSourceLines[0] || timedRefs[0];
  if (firstTimedLine && rawPositionMs < Number(firstTimedLine.startTimeMs) - 100) {
    return null;
  }
  const sourceLine =
    timedSourceLines
      .filter((line) => Number(line.startTimeMs) <= positionMs)
      .sort((left, right) => Number(right.startTimeMs) - Number(left.startTimeMs))[0] ||
    null;

  if (sourceLine) {
    const ref = timedRefs.find((line) => Math.abs(Number(line.startTimeMs) - Number(sourceLine.startTimeMs)) <= 50);
    return {
      id: ref?.id || null,
      lineIndex: sourceLine.index,
      startTimeMs: sourceLine.startTimeMs,
      text: sourceLine.text || "",
    };
  }

  const ref =
    timedRefs
      .filter((line) => Number(line.startTimeMs) <= positionMs)
      .sort((left, right) => Number(right.startTimeMs) - Number(left.startTimeMs))[0] ||
    null;
  if (!ref) return null;
  const fallbackSourceLine = sourceLines.find((line) => line.index === ref?.lineIndex) || sourceLines[0];
  return {
    id: ref?.id || null,
    lineIndex: ref?.lineIndex ?? fallbackSourceLine?.index ?? 0,
    startTimeMs: ref?.startTimeMs ?? fallbackSourceLine?.startTimeMs ?? null,
    text: fallbackSourceLine?.text || "",
  };
}
