import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from "react";
import pawBlack from "../src/assets/paw-print.svg";
import pawNeutral from "../src/assets/paw-print-neutral.svg";
import {
  api,
  authErrorMessage,
  isValidEmail,
  PLAYLIST_PAGE_SIZE,
  readJson,
  todayIso,
  writeJson,
  type AuthSession,
  type CreatorTask,
  type Lyric,
  type LyricFetchResponse,
  type LyricRef,
  type LyricSource,
  type SelectedLine,
  type Playlist,
  type PlaylistTrack,
  type SavedLyricPiece,
  type TaskStatus,
  type Track,
  type TrackCreateDraft,
  type Translation,
  type YouTubePlaylistPreview,
} from "./lib/api";
import { extractYoutubeId, extractYoutubePlaylistId, fetchYoutubeMetadata } from "./lib/youtube";

const query = new URLSearchParams(window.location.search);
const isEmbeddedContent = query.get("embedded") === "1";
const shellView = query.get("view") || "main";
const isTauriShellContent = query.get("shell") === "tauri";
const isTauriEmbeddedContent = isEmbeddedContent && isTauriShellContent;
const isTauriApp =
  Boolean((window as Window & { __TAURI__?: unknown }).__TAURI__) ||
  window.location.protocol === "tauri:" ||
  window.location.hostname === "tauri.localhost";
const PLAYBACK_TICK_MS = 500;
const LYRIC_SYNC_LOOKAHEAD_MS = 350;
const LYRIC_SYNC_FINE_STEP_MS = 500;
const LYRIC_SYNC_COARSE_STEP_MS = 5000;
const MAX_LYRIC_SYNC_OFFSET_MS = 30000;
const REPEAT_MODES = ["off", "all", "one"] as const;
const MAX_YOUTUBE_RECOVERY_ATTEMPTS = 2;
const LONG_FORM_TRACK_SECONDS = 12 * 60;
const LYRIC_FETCH_TIMEOUT_MS = 45000;
const YOUTUBE_AD_DURATION_MAX_SECONDS = 90;

if (isEmbeddedContent) {
  document.documentElement.classList.add("embedded-mode");
}

function blockDeveloperShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  const isMacDevtools = event.metaKey && event.altKey && ["i", "j", "c"].includes(key);
  const isWinDevtools = event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key);
  if (event.key === "F12" || isMacDevtools || isWinDevtools) {
    event.preventDefault();
    event.stopPropagation();
  }
}

type Workspace = {
  tasks: CreatorTask[];
  work: CreatorTask | null;
  counts: Record<TaskStatus, number>;
  playlist: Playlist | null;
  playlistTracks: PlaylistTrack[];
  currentTrack: Track | null;
};

type NoticeKind = "notice" | "error";

type Notice = {
  kind: NoticeKind;
  message: string;
};

type RepeatMode = typeof REPEAT_MODES[number];

type PendingPlaylistImport = YouTubePlaylistPreview & {
  count: number;
};

type CurrentLyricContext = {
  trackId?: number | null;
  line?: SelectedLine | null;
  translation?: Translation | null;
  at?: number;
};

function todayTasksPath(userId: number) {
  return `/api/tasks?userId=${userId}&date=${todayIso()}`;
}

function lyricSyncOffsetKey(track: Pick<Track, "id" | "sourceId"> | null | undefined) {
  if (!track?.id && !track?.sourceId) return "";
  return `kurostep.lyricSyncOffset.${track.sourceId || track.id}`;
}

function readLyricSyncOffset(track: Pick<Track, "id" | "sourceId"> | null | undefined) {
  const key = lyricSyncOffsetKey(track);
  if (!key) return 0;
  return clampLyricSyncOffset(Number(window.localStorage.getItem(key) || 0));
}

function containsHangul(text: string) {
  return /[가-힣]/.test(text);
}

function normalizeMemoText(text: string | null | undefined) {
  const value = String(text || "");
  if (value.trim() === "작업 중 떠오른 번역 느낌을 살짝 적어둘게냥.") {
    return "";
  }
  return value;
}

function lyricDraftKey(trackId: number | null | undefined, line: SelectedLine | null | undefined) {
  if (!line?.text) return "";
  const lineKey = lyricLineKey(line);
  return lineKey ? `kurostep.translationDraft.${trackId || "trackless"}.${lineKey}` : "";
}

function lyricLineKey(line: SelectedLine | null | undefined) {
  if (!line?.text) return "";
  if (line.id != null) return `id-${line.id}`;
  return `idx-${line.lineIndex}-${line.startTimeMs ?? "na"}-${line.text}`;
}

function isSameLyricLine(left: SelectedLine | null | undefined, right: SelectedLine | null | undefined) {
  const leftKey = lyricLineKey(left);
  return Boolean(leftKey && leftKey === lyricLineKey(right));
}

function translationCacheKey(trackId: number | null | undefined, line: SelectedLine | null | undefined) {
  const lineKey = lyricLineKey(line);
  return lineKey ? `${trackId || "trackless"}:${lineKey}` : "";
}

function makeLocalTranslation(line: SelectedLine, translatedText: string, memoText = ""): Translation {
  return {
    lyricLineRefId: line.id || null,
    clientLineKey: lyricLineKey(line),
    languageCode: "ko",
    translatedText,
    memoText: normalizeMemoText(memoText),
    status: "LOCAL_DRAFT",
  };
}

function readLocalTranslationDraft(trackId: number | null | undefined, line: SelectedLine | null | undefined) {
  const key = lyricDraftKey(trackId, line);
  if (!key || !line?.text) return null;
  const draft = readJson<{ translatedText?: string; memoText?: string } | null>(key, null);
  if (!draft) return null;
  const translatedText = String(draft.translatedText || "");
  const memoText = normalizeMemoText(draft.memoText);
  if (!translatedText && !memoText) return null;
  return makeLocalTranslation(line, translatedText || (containsHangul(line.text) ? line.text : ""), memoText);
}

function writeLocalTranslationDraft(trackId: number | null | undefined, line: SelectedLine | null | undefined, translatedText: string, memoText: string) {
  const key = lyricDraftKey(trackId, line);
  if (!key) return;
  const draft = {
    translatedText,
    memoText: normalizeMemoText(memoText),
    savedAt: new Date().toISOString(),
  };
  writeJson(key, draft);
}

function removeLocalTranslationDraft(trackId: number | null | undefined, line: SelectedLine | null | undefined) {
  const key = lyricDraftKey(trackId, line);
  if (key) {
    window.localStorage.removeItem(key);
  }
}

function clampLyricSyncOffset(value: number) {
  return Math.min(Math.max(Math.round(Number(value) || 0), -MAX_LYRIC_SYNC_OFFSET_MS), MAX_LYRIC_SYNC_OFFSET_MS);
}

function formatLyricSyncOffset(value: number) {
  if (!value) return "기본";
  const seconds = (Math.abs(value) / 1000).toFixed(1).replace(/\.0$/, "");
  return value > 0 ? `앞당김 ${seconds}초` : `늦춤 ${seconds}초`;
}

function isTranslationForLine(translation: Translation | null | undefined, line: SelectedLine | null | undefined) {
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

function translationStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "AUTO_DRAFT":
      return "자동 초안";
    case "LOCAL_DRAFT":
      return "작성 중";
    case "SAVED":
      return "저장됨";
    default:
      return "";
  }
}

type YouTubePlayer = {
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  loadVideoById?: (options: { videoId: string; startSeconds?: number }) => void;
  destroy?: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getVideoData?: () => { video_id?: string; title?: string };
  setVolume: (volume: number) => void;
};

type YouTubeApi = {
  Player: new (
    elementId: string,
    options: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { data: number }) => void;
        onError: () => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    ENDED: number;
    CUED: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
    __TAURI__?: {
      core?: {
        invoke?: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
      };
      window?: {
        getCurrentWindow?: () => {
          minimize?: () => Promise<void>;
          startDragging?: () => Promise<void>;
        };
      };
    };
  }
}

const emptyCounts: Record<TaskStatus, number> = { TODO: 0, DOING: 0, DONE: 0 };
let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function isYoutubeApiReady(api?: YouTubeApi) {
  return Boolean(api?.Player && api.PlayerState);
}

function loadYoutubeIframeApi() {
  if (isYoutubeApiReady(window.YT)) {
    return Promise.resolve(window.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    let settled = false;
    let readyTimer: number | undefined;
    let timeoutTimer: number | undefined;

    const cleanup = () => {
      settled = true;
      window.clearInterval(readyTimer);
      window.clearTimeout(timeoutTimer);
    };

    const resolveWhenReady = () => {
      if (!isYoutubeApiReady(window.YT)) {
        return false;
      }
      cleanup();
      resolve(window.YT);
      return true;
    };

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolveWhenReady();
    };

    readyTimer = window.setInterval(() => {
      resolveWhenReady();
    }, 100);

    timeoutTimer = window.setTimeout(() => {
      if (settled || resolveWhenReady()) return;
      cleanup();
      youtubeApiPromise = null;
      reject(new Error("YouTube 플레이어 API가 아직 준비되지 않았어냥."));
    }, 10000);

    if (resolveWhenReady()) {
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>("script[src='https://www.youtube.com/iframe_api']");
    if (existing) {
      existing.addEventListener("error", () => {
        cleanup();
        youtubeApiPromise = null;
        reject(new Error("YouTube 플레이어 API를 못 불러왔어냥."));
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      cleanup();
      youtubeApiPromise = null;
      reject(new Error("YouTube 플레이어 API를 못 불러왔어냥."));
    };
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function getYoutubeVideoId(track: Track | null) {
  return track?.sourceId || extractYoutubeId(track?.sourceUrl || "");
}

function postShellMessage(message: Record<string, unknown>) {
  if (!isEmbeddedContent || window.parent === window) {
    return false;
  }
  window.parent.postMessage({ source: "kurostep-content", ...message }, "*");
  return true;
}

async function invokeNative(command: string, payload: Record<string, unknown> = {}) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    try {
      return await invoke(command, payload);
    } catch (error) {
      if (!postShellMessage({ type: "native_command", command, payload })) {
        throw error;
      }
      return null;
    }
  }
  if (postShellMessage({ type: "native_command", command, payload })) {
    return null;
  }
  return null;
}

function minimizeCurrentWindow() {
  void window.__TAURI__?.window?.getCurrentWindow?.()?.minimize?.();
}

function startCurrentWindowDrag() {
  void window.__TAURI__?.window?.getCurrentWindow?.()?.startDragging?.();
}

function saveCurrentWindowPosition(label = shellView) {
  if (!isTauriApp || isEmbeddedContent) return;
  void invokeNative("save_current_window_position", { label }).catch(() => {});
}

function scheduleCurrentWindowPositionSave(label = shellView) {
  window.setTimeout(() => saveCurrentWindowPosition(label), 350);
}

function parseLyricSource(fetchResponse: LyricFetchResponse): LyricSource {
  const source = fetchResponse.syncedLyrics || fetchResponse.plainLyrics || "";
  const lines = source
    .split("\n")
    .map((line, index) => parseLyricLine(line, index))
    .filter((line) => line.text);

  return {
    localCacheKey: fetchResponse.localCacheKey,
    lyric: fetchResponse.lyric || null,
    lines,
  };
}

function parseLyricLine(line: string, index: number) {
  const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
  if (!match) {
    return { index, startTimeMs: null, text: line.trim() };
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const milliseconds = Number(`${match[3] || ""}000`.slice(0, 3));
  return {
    index,
    startTimeMs: (minutes * 60 + seconds) * 1000 + milliseconds,
    text: match[4].trim(),
  };
}

function hasTimedLyricSource(source: LyricSource | null | undefined) {
  return Boolean(
    source?.lines?.some((line) => Number.isFinite(line.startTimeMs)) ||
    source?.lyric?.lines?.some((line) => Number.isFinite(line.startTimeMs)),
  );
}

function chooseLineByPlaybackTime(lyric: Lyric | null, source: LyricSource | null, positionSeconds: number, syncOffsetMs = 0): SelectedLine | null {
  const refs = lyric?.lines || [];
  const sourceLines = source?.lines || [];
  if (!refs.length && !sourceLines.length) return null;

  const positionMs = positionSeconds * 1000 + LYRIC_SYNC_LOOKAHEAD_MS + syncOffsetMs;
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
  if (firstTimedLine && positionMs < Number(firstTimedLine.startTimeMs) - 150) {
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

function statusLabel(status: TaskStatus) {
  return {
    TODO: "할 일",
    DOING: "걷는 중",
    DONE: "발도장",
  }[status];
}

function formatDuration(seconds?: number) {
  if (!Number.isFinite(seconds || NaN) || Number(seconds) <= 0) {
    return "0:00";
  }
  const value = Math.max(0, Math.floor(Number(seconds)));
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function normalizeTrackDuration(seconds: number, stableSeconds = 0) {
  const nextDuration = Math.round(Number(seconds) || 0);
  const currentDuration = Math.round(Number(stableSeconds) || 0);
  if (nextDuration <= 0) return 0;
  if (currentDuration > 0 && Math.abs(currentDuration - nextDuration) <= 1) {
    return currentDuration;
  }
  return nextDuration;
}

function isInstrumentalLyricMarker(text: string) {
  const value = String(text || "").trim();
  return Boolean(value) && /^[♫♪♬♩\s.·•-]+$/.test(value);
}

function getIntroClockGuardSeconds(source: LyricSource | null) {
  const timedLines = [...(source?.lines || [])]
    .filter((line) => Number.isFinite(Number(line.startTimeMs)))
    .sort((a, b) => Number(a.startTimeMs || 0) - Number(b.startTimeMs || 0));
  const firstLine = timedLines[0];
  if (!firstLine || Number(firstLine.startTimeMs || 0) > 1000 || !isInstrumentalLyricMarker(firstLine.text)) {
    return 0;
  }
  const firstVocalLine = timedLines.find((line) => !isInstrumentalLyricMarker(line.text) && Number(line.startTimeMs || 0) >= 3000);
  if (!firstVocalLine) {
    return 0;
  }
  return Math.max(0, Math.min(Number(firstVocalLine.startTimeMs) / 1000 - 0.4, 20));
}

function isLikelyYoutubeAdDuration(seconds: number, expectedSeconds = 0) {
  const nextDuration = Number(seconds);
  const expectedDuration = Number(expectedSeconds);
  if (!Number.isFinite(nextDuration) || !Number.isFinite(expectedDuration)) return false;
  if (nextDuration <= 0 || expectedDuration < 60) return false;
  if (nextDuration <= YOUTUBE_AD_DURATION_MAX_SECONDS && expectedDuration - nextDuration > 20) {
    return true;
  }
  return nextDuration < expectedDuration * 0.55;
}

function normalizeRepeatMode(mode: string | null | undefined): RepeatMode {
  return REPEAT_MODES.includes(mode as RepeatMode) ? mode as RepeatMode : "off";
}

function nextRepeatMode(mode: RepeatMode): RepeatMode {
  const currentIndex = REPEAT_MODES.indexOf(mode);
  return REPEAT_MODES[(currentIndex + 1) % REPEAT_MODES.length];
}

function repeatModeLabel(mode: RepeatMode) {
  if (mode === "all") return "전체 반복";
  if (mode === "one") return "한 곡 반복";
  return "반복 꺼짐";
}

function repeatModeNotice(mode: RepeatMode) {
  if (mode === "all") return "플레이리스트를 빙글빙글 반복한다냥.";
  if (mode === "one") return "이 곡만 계속 따라 걷는다냥.";
  return "반복 산책을 잠깐 접었다냥.";
}

function isLongFormOrNonSongTrack(track: Track | null) {
  const title = String(track?.title || "");
  const duration = Number(track?.durationSeconds);
  const longByDuration = Number.isFinite(duration) && duration > LONG_FORM_TRACK_SECONDS;
  const looksLikeCollection = /(playlist|mix|remix|loop|1\s*hour|hour|extended|compilation|모음|플레이리스트|연속재생|리믹스|루프)/i.test(title);
  return longByDuration || looksLikeCollection;
}

function friendlyLyricMessage(error: unknown, track: Track | null) {
  if (isLongFormOrNonSongTrack(track)) {
    return "이 영상은 길거나 편곡/모음집처럼 보여서 싱크 가사를 붙이기 어렵다냥. 공식 MV나 Topic 음원으로 넣어줘냥.";
  }

  const message = String((error as Error)?.message || error || "");
  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("timeout")) {
    return "가사 서버랑 잠깐 연결이 삐끗했다냥. 뒤에서 다시 찾아볼게냥.";
  }
  if (message.includes("404") || message.includes("찾을 수") || lower.includes("not found") || lower.includes("no lyric")) {
    return "맞는 싱크 가사를 아직 못 찾았다냥. 공식 MV/Topic 영상이면 제목과 아티스트 기준으로 다시 찾아볼게냥.";
  }
  if (message.includes("401") || message.includes("403")) {
    return "가사 제공처가 지금 응답을 막았다냥. 잠깐 뒤 다시 시도해볼게냥.";
  }

  return "가사를 바로 못 찾았다냥. 곡 정보가 맞으면 뒤에서 다시 발자국을 구워볼게냥.";
}

function friendlyPlaybackMessage(error: unknown) {
  const message = String((error as Error)?.message || error || "");
  if (message.includes("YouTube") || message.includes("영상") || message.includes("player")) {
    return "영상 재생이 꼬였다냥. 앱이 플레이어를 다시 깨우고 있으니, 계속 안 되면 공식 영상을 다시 넣어줘냥.";
  }
  return `재생을 시작하지 못했다냥: ${message}`;
}

function formatSourceType(sourceType?: Track["sourceType"] | null) {
  const labels: Record<Track["sourceType"], string> = {
    YOUTUBE: "YouTube",
    SPOTIFY: "Spotify",
    SOUNDCLOUD: "SoundCloud",
    LOCAL_FILE: "Local",
    EXTERNAL_URL: "External",
  };
  return sourceType ? labels[sourceType] || sourceType : "YouTube";
}

function formatTimestamp(ms?: number | null) {
  if (!Number.isFinite(Number(ms))) {
    return "--:--";
  }
  return formatDuration(Math.floor(Number(ms) / 1000));
}

function countTaskStatuses(tasks: CreatorTask[]) {
  return tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    { ...emptyCounts },
  );
}

function getPlaylistPageCount(length: number) {
  return Math.max(1, Math.ceil(length / PLAYLIST_PAGE_SIZE));
}

function Icon({ name }: { name: string }) {
  const icons: Record<string, ReactNode> = {
    minimize: <path d="M7 12h10" />,
    settings: (
      <>
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05-2.12 2.12-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66v.1h-3v-.1a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.05.05-2.12-2.12.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.1h-.1v-3h.1A1.8 1.8 0 0 0 4.6 9a1.8 1.8 0 0 0-.36-1.98l-.05-.05 2.12-2.12.05.05A1.8 1.8 0 0 0 8.34 5.26 1.8 1.8 0 0 0 9.44 3.6v-.1h3v.1a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.05-.05 2.12 2.12-.05.05A1.8 1.8 0 0 0 19.4 9a1.8 1.8 0 0 0 1.66 1.1h.1v3h-.1A1.8 1.8 0 0 0 19.4 15z" />
      </>
    ),
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" /></>,
    previous: <><path d="M6 6v12" /><path d="m19 6-9 6 9 6z" /></>,
    next: <><path d="m5 6 9 6-9 6z" /><path d="M18 6v12" /></>,
    rewind: <><path d="M11 19 2 12l9-7v14z" /><path d="M22 19 13 12l9-7v14z" /></>,
    forward: <><path d="m13 5 9 7-9 7V5z" /><path d="m2 5 9 7-9 7V5z" /></>,
    play: <path d="m8 5 11 7-11 7z" />,
    pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
    repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    shuffle: <><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></>,
    volume: <><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
    grip: <><path d="M9 6h.01" /><path d="M15 6h.01" /><path d="M9 12h.01" /><path d="M15 12h.01" /><path d="M9 18h.01" /><path d="M15 18h.01" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{icons[name]}</svg>;
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {action}
    </div>
  );
}

function WidgetShell({
  children,
  title = "KuroStep",
  rightAction = "exit",
  onExit,
  onSettings,
}: {
  children: ReactNode;
  title?: string;
  rightAction?: "exit" | "settings" | "none";
  onExit?: () => void;
  onSettings?: () => void;
}) {
  if (isEmbeddedContent) {
    return <section className="embedded-content">{children}</section>;
  }

  return (
    <section className="widget-container">
      <header
        className="mac-header"
        id="window-drag-region"
        data-tauri-drag-region
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
          startCurrentWindowDrag();
          scheduleCurrentWindowPositionSave();
        }}
      >
        <div className="window-tools">
          <button className="window-tool-button" id="window-minimize" type="button" aria-label="최소화" title="최소화" onClick={minimizeCurrentWindow}>
            <Icon name="minimize" />
          </button>
        </div>
        <strong className="window-title" data-tauri-drag-region>
          <span className="app-mark" aria-hidden="true">
            <img src={pawNeutral} alt="" />
          </span>
          {title}
        </strong>
        {rightAction === "settings" ? (
          <div className="header-actions">
            <button className="ghost-header-button icon-text" id="settings-open" type="button" onClick={onSettings}>
              <Icon name="settings" />
              <span>설정</span>
            </button>
            <button className="ghost-header-button" id="app-exit-button" type="button" onClick={onExit}>종료</button>
          </div>
        ) : rightAction === "exit" ? (
          <div className="header-actions">
            <button className="ghost-header-button" id="app-exit-button" type="button" onClick={onExit}>종료</button>
          </div>
        ) : <span />}
      </header>
      <div className="widget-content">{children}</div>
    </section>
  );
}

function SettingsScreen({
  auth,
  autoTranslationEnabled,
  onBack,
  onLogout,
  onExit,
  onToggleAutoTranslation,
}: {
  auth: AuthSession;
  autoTranslationEnabled: boolean;
  onBack: () => void;
  onLogout: () => void;
  onExit: () => void;
  onToggleAutoTranslation: (enabled: boolean) => void;
}) {
  return (
    <WidgetShell title="KuroStep" rightAction="none">
      <section className="settings-screen" aria-labelledby="settings-title">
        <button className="ghost-header-button icon-text" type="button" onClick={onBack} aria-label="돌아가기">← <span>돌아가기</span></button>
        <p className="auth-eyebrow">SETTINGS</p>
        <h1 id="settings-title">작업실 설정</h1>
        <p>로그아웃과 앱 종료는 여기서 조용히 정리한다냥.</p>
        <section className="settings-card">
          <h2>로그인 계정</h2>
          <p>{auth.email}</p>
        </section>
        <section className="settings-card">
          <h2>닉네임</h2>
          <p>{auth.nickname || "이름 없는 작업자냥"}</p>
        </section>
        <section className="settings-card setting-toggle-card">
          <div>
            <h2>자동 번역</h2>
            <p>{autoTranslationEnabled ? "새 영어 가사를 만나면 한국어 초안을 자동으로 만든다냥." : "자동 초안은 멈추고, 직접 적은 번역만 보여준다냥."}</p>
          </div>
          <button
            className={`toggle-pill ${autoTranslationEnabled ? "on" : ""}`}
            type="button"
            role="switch"
            aria-checked={autoTranslationEnabled}
            onClick={() => onToggleAutoTranslation(!autoTranslationEnabled)}
          >
            {autoTranslationEnabled ? "ON" : "OFF"}
          </button>
        </section>
        <div className="settings-actions">
          <button className="action-button danger" type="button" onClick={onLogout}>로그아웃</button>
          <button className="action-button primary" type="button" onClick={onExit}>앱 종료</button>
        </div>
      </section>
    </WidgetShell>
  );
}

function AuthScreen({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (mode: "login" | "signup", data: { email: string; password: string; nickname: string }) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const isSignup = mode === "signup";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSubmit(mode, {
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || ""),
      nickname: String(formData.get("nickname") || "").trim(),
    });
  }

  return (
      <section className="auth-screen" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="auth-mark" aria-hidden="true">
            <img src={pawNeutral} alt="" />
          </span>
          <p className="auth-eyebrow">KuroStep</p>
          <h1 id="auth-title">{isSignup ? "작업실 만들기" : "작업실 들어가기"}</h1>
          <p>{isSignup ? "오늘 발자국과 BGM, 가사 메모를 함께 묶어둘 계정을 만든다냥." : "로그인하면 발자국장, 턴테이블, 가사 창이 차례대로 열린다냥."}</p>
        </div>
        <div className="auth-switch" role="tablist" aria-label="인증 방식">
          <button className={!isSignup ? "active" : ""} id="auth-login-tab" type="button" onClick={() => setMode("login")}>로그인</button>
          <button className={isSignup ? "active" : ""} id="auth-signup-tab" type="button" onClick={() => setMode("signup")}>회원가입</button>
        </div>
        <form className="auth-form" id="auth-form" onSubmit={submit}>
          {isSignup && <label>닉네임<input className="form-input" name="nickname" autoComplete="nickname" placeholder="검은 작업실 이름" /></label>}
          <label>이메일<input className="form-input" name="email" type="email" autoComplete="email" placeholder="you@example.com" /></label>
          <label>비밀번호<input className="form-input" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder="비밀번호" /></label>
          <button className="action-button primary auth-submit" type="submit" disabled={busy}>{busy ? "문 여는 중이냥" : isSignup ? "회원가입" : "로그인"}</button>
        </form>
      </section>
  );
}

function PawWaitingScreen() {
  return (
    <section className="auth-screen paw-waiting" aria-labelledby="paw-waiting-title">
      <div className="auth-brand">
        <span className="auth-mark" aria-hidden="true">
          <img src={pawNeutral} alt="" />
        </span>
        <p className="auth-eyebrow">작업 발자국</p>
        <h1 id="paw-waiting-title">메인 작업실을 기다린다냥</h1>
        <p>메인 창에서 로그인하면 오늘 할 일과 가사 메모가 여기로 조용히 열린다냥.</p>
      </div>
    </section>
  );
}

function TaskList({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: CreatorTask[];
  selectedId?: number;
  onSelect: (task: CreatorTask) => void;
}) {
  if (!tasks.length) {
    return <p className="state-message">오늘 할 일을 아직 못 찾았다냥.</p>;
  }

  return (
    <ol className="todo-list" aria-label="오늘 할 일 목록">
      {tasks.map((task) => (
        <li key={task.id}>
          <button className={`todo-item${task.id === selectedId ? " selected" : ""}`} type="button" aria-pressed={task.id === selectedId} onClick={() => onSelect(task)}>
            <span className={`todo-status-dot ${task.status}`}></span>
            <span className="todo-text">
              <strong>{task.title}</strong>
              <small>{task.description || task.taskDate || "메모 없는 발자국"}</small>
            </span>
            <span className="todo-status-label">{statusLabel(task.status)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function TodayWorkWidget({
  tasks,
  work,
  onSelectTask,
  onCreateTask,
  onUpdateStatus,
  onDeleteTask,
}: {
  tasks: CreatorTask[];
  work: CreatorTask | null;
  onSelectTask: (task: CreatorTask) => void;
  onCreateTask: (title: string) => Promise<void> | void;
  onUpdateStatus: (status: TaskStatus) => void;
  onDeleteTask: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const liveCounts = countTaskStatuses(tasks);

  async function submitTask() {
    const title = draftTitle.trim();
    if (!title) return;
    await onCreateTask(title);
    setDraftTitle("");
    setCreating(false);
  }

  return (
    <section className="widget-section today-work" aria-labelledby="today-work-title">
      <div className="task-list-head">
        <SectionHeader title="오늘 할 일" />
        <button
          className="mini-icon-button"
          id="open-task-create"
          type="button"
          title="할 일 추가"
          aria-label="할 일 추가"
          onClick={() => setCreating((value) => !value)}
        >
          <Icon name="plus" />
        </button>
      </div>
      {creating && (
        <form
          className="task-inline-form"
          aria-label="새 할 일 추가"
          onSubmit={(event) => {
            event.preventDefault();
            void submitTask();
          }}
        >
          <input
            className="form-input"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="새 발자국을 적어줘냥"
            aria-label="새 할 일 제목"
            autoFocus
          />
          <button className="action-button primary compact" type="submit">추가</button>
          <button
            className="action-button compact"
            type="button"
            onClick={() => {
              setDraftTitle("");
              setCreating(false);
            }}
          >
            취소
          </button>
        </form>
      )}
      <TaskList tasks={tasks} selectedId={work?.id} onSelect={onSelectTask} />
      {work ? (
        <>
          <div className="task-header">
            <h3 className="task-title" id="today-work-title">{work.title}</h3>
            <div className="task-actions">
              <button className="mini-icon-button danger" id="delete-task" type="button" title="할 일 삭제" aria-label="할 일 삭제" onClick={onDeleteTask}><Icon name="trash" /></button>
            </div>
          </div>
          <p className="task-description">{work.description || work.taskDate}</p>
          <div className="meta-grid" aria-label="작업 카드 상세">
            <span>날짜 {work.taskDate || "-"}</span>
            <span>상태 {statusLabel(work.status)}</span>
            <span>BGM 바구니 {work.playlistId ? `#${work.playlistId}` : "미연결"}</span>
            <span>현재곡 {work.currentPlaylistTrackId ? `#${work.currentPlaylistTrackId}` : "없음"}</span>
          </div>
          <div className="status-badges" aria-label="작업 상태">
            {(["TODO", "DOING", "DONE"] as TaskStatus[]).map((status) => (
              <button key={status} className={`badge${status === work.status ? " active" : ""}`} type="button" onClick={() => onUpdateStatus(status)}>
                {statusLabel(status)} <span>{liveCounts[status] || 0}</span>
              </button>
            ))}
          </div>
        </>
      ) : <p className="state-message">선택된 할 일이 없다냥.</p>}
    </section>
  );
}

function MusicPlayerWidget({
  track,
  tracks,
  playlist,
  page,
  isPlaying,
  repeatMode,
  position,
  duration,
  volume,
  youtubeVisible,
  introClockGuardSeconds,
  canRegisterLinks,
  pendingPlaylistImport,
  onTogglePlay,
  onPlayingChange,
  onPositionChange,
  onDurationChange,
  onVolumeChange,
  onToggleYoutube,
  onMoveTrack,
  onSkip,
  onSeek,
  onToggleRepeat,
  onSelectTrack,
  onRegisterLink,
  onPendingPlaylistCountChange,
  onConfirmPlaylistImport,
  onCancelPlaylistImport,
  onRemoveTrack,
  onShuffle,
  onReorderTracks,
  onPage,
}: {
  track: Track | null;
  tracks: PlaylistTrack[];
  playlist: Playlist | null;
  page: number;
  isPlaying: boolean;
  repeatMode: RepeatMode;
  position: number;
  duration: number;
  volume: number;
  youtubeVisible: boolean;
  introClockGuardSeconds: number;
  canRegisterLinks: boolean;
  pendingPlaylistImport: PendingPlaylistImport | null;
  onTogglePlay: () => void;
  onPlayingChange: (playing: boolean) => void;
  onPositionChange: (seconds: number) => void;
  onDurationChange: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleYoutube: () => void;
  onMoveTrack: (offset: number, autoplay?: boolean, wrap?: boolean) => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onToggleRepeat: () => void;
  onSelectTrack: (playlistTrack: PlaylistTrack) => void;
  onRegisterLink: (url: string) => Promise<boolean>;
  onPendingPlaylistCountChange: (count: number) => void;
  onConfirmPlaylistImport: () => void;
  onCancelPlaylistImport: () => void;
  onRemoveTrack: (playlistTrack: PlaylistTrack) => void;
  onShuffle: () => void;
  onReorderTracks: (playlistTrackIds: number[]) => void;
  onPage: (page: number) => void;
}) {
  const [url, setUrl] = useState("");
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [draggingPlaylistTrackId, setDraggingPlaylistTrackId] = useState<number | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const videoIdRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const lastPlaybackTimeRef = useRef(0);
  const stalledTickRef = useRef(0);
  const recoveryAttemptsRef = useRef(0);
  const lastReportedDurationRef = useRef(0);
  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  const isPlayingRef = useRef(isPlaying);
  const manualSeekUntilRef = useRef(0);
  const videoId = getYoutubeVideoId(track);
  const displayedDuration = duration || track?.durationSeconds || 0;
  const playbackPositionRef = useRef(position);
  const displayedDurationRef = useRef(displayedDuration);
  const pageCount = getPlaylistPageCount(tracks.length);
  const visibleTracks = tracks.slice((page - 1) * PLAYLIST_PAGE_SIZE, page * PLAYLIST_PAGE_SIZE);
  const progressRatio = displayedDuration > 0 ? Math.min(position / displayedDuration, 1) : 0;

  function getPlaylistDuration(playlistTrack: PlaylistTrack) {
    if (playlistTrack.playlistTrackId === track?.playlistTrackId) {
      return duration || track?.durationSeconds || playlistTrack.durationSeconds || 0;
    }
    return playlistTrack.durationSeconds || 0;
  }

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    playbackPositionRef.current = position;
  }, [position]);

  useEffect(() => {
    displayedDurationRef.current = displayedDuration;
  }, [displayedDuration]);

  function isLikelyYoutubeAdPlayback(player: YouTubePlayer | null, seconds: number) {
    const expectedDuration = displayedDurationRef.current || track?.durationSeconds || 0;
    const activeVideoId = String(player?.getVideoData?.()?.video_id || "");
    const isDifferentVideo = Boolean(activeVideoId && videoId && activeVideoId !== videoId);
    return isDifferentVideo || isLikelyYoutubeAdDuration(seconds, expectedDuration);
  }

  function reportDuration(seconds: number) {
    if (isLikelyYoutubeAdPlayback(playerRef.current, seconds)) {
      return;
    }
    const nextDuration = normalizeTrackDuration(seconds, displayedDurationRef.current);
    if (nextDuration <= 0 || lastReportedDurationRef.current === nextDuration) {
      return;
    }
    lastReportedDurationRef.current = nextDuration;
    displayedDurationRef.current = nextDuration;
    onDurationChange(nextDuration);
  }

  async function recoverYoutubePlayback(reason = "unknown") {
    const player = playerRef.current;
    if (!player || !videoId) return false;
    if (recoveryAttemptsRef.current >= MAX_YOUTUBE_RECOVERY_ATTEMPTS) {
      setPlayerError("영상 재생이 계속 꼬인다냥. 영상 펼치기로 YouTube 상태를 확인하거나 다른 공식 영상을 넣어줘냥.");
      onPlayingChange(false);
      return false;
    }

    recoveryAttemptsRef.current += 1;
    setPlayerError("");
    const startSeconds = playbackPositionRef.current || 0;
    if (player.loadVideoById) {
      player.loadVideoById({ videoId, startSeconds });
    } else {
      player.cueVideoById?.({ videoId, startSeconds });
    }
    await new Promise((resolve) => window.setTimeout(resolve, reason === "stalled" ? 300 : 600));
    player.playVideo?.();
    await new Promise((resolve) => window.setTimeout(resolve, 1100));

    const playerState = player.getPlayerState?.();
    if (window.YT && (playerState === window.YT.PlayerState.PLAYING || playerState === window.YT.PlayerState.BUFFERING)) {
      recoveryAttemptsRef.current = 0;
      onPlayingChange(true);
      return true;
    }

    return false;
  }

  useEffect(() => {
    let cancelled = false;
    setPlayerError("");
    setPlayerReady(false);
    lastPlaybackTimeRef.current = 0;
    stalledTickRef.current = 0;
    recoveryAttemptsRef.current = 0;
    if (!videoId) {
      playerRef.current?.pauseVideo?.();
      playerRef.current?.destroy?.();
      playerRef.current = null;
      videoIdRef.current = "";
      return;
    }

    if (playerRef.current && videoIdRef.current && videoIdRef.current !== videoId) {
      playerRef.current.destroy?.();
      playerRef.current = null;
      const playerContainer = document.getElementById("youtube-player");
      if (playerContainer) {
        playerContainer.innerHTML = "";
      }
    }

    loadYoutubeIframeApi()
      .then((YT) => {
        if (cancelled) return;
        if (playerRef.current?.cueVideoById) {
          videoIdRef.current = videoId;
          lastReportedDurationRef.current = 0;
          setPlayerReady(true);
          onPositionChange(0);
          if (isPlayingRef.current && playerRef.current.loadVideoById) {
            playerRef.current.loadVideoById({ videoId, startSeconds: 0 });
          } else {
            playerRef.current.cueVideoById({ videoId, startSeconds: 0 });
          }
          if (isPlaying) {
            window.setTimeout(() => playerRef.current?.playVideo?.(), 150);
          }
          return;
        }

        playerRef.current = null;
        videoIdRef.current = videoId;
        lastReportedDurationRef.current = 0;
        playerRef.current = new YT.Player("youtube-player", {
          videoId,
          playerVars: {
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
            widget_referrer: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              const latestVideoId = videoIdRef.current || videoId;
              setPlayerReady(true);
              event.target.setVolume?.(volume);
              if (latestVideoId) {
                const startSeconds = playbackPositionRef.current || 0;
                if (isPlayingRef.current && event.target.loadVideoById) {
                  event.target.loadVideoById({ videoId: latestVideoId, startSeconds });
                } else {
                  event.target.cueVideoById?.({ videoId: latestVideoId, startSeconds });
                }
              }
              window.setTimeout(() => reportDuration(event.target.getDuration?.() || 0), 250);
              if (isPlaying) {
                event.target.playVideo?.();
              }
            },
            onStateChange: (event) => {
              if (!window.YT) return;
              const rawDuration = playerRef.current?.getDuration?.() || 0;
              if (!isLikelyYoutubeAdPlayback(playerRef.current, rawDuration)) {
                reportDuration(rawDuration);
              }
              if (event.data === window.YT.PlayerState.PLAYING) {
                stalledTickRef.current = 0;
                recoveryAttemptsRef.current = 0;
                onPlayingChange(true);
                return;
              }
              if (event.data === window.YT.PlayerState.PAUSED) {
                onPlayingChange(false);
                return;
              }
              if (event.data === window.YT.PlayerState.ENDED) {
                if (repeatModeRef.current === "one") {
                  playerRef.current?.seekTo?.(0, true);
                  playerRef.current?.playVideo?.();
                } else {
                  onMoveTrack(1, true, repeatModeRef.current === "all");
                }
              }
            },
            onError: () => {
              if (isPlayingRef.current) {
                void recoverYoutubePlayback("player-error");
              } else {
                setPlayerError("");
              }
            },
          },
        });
      })
      .catch((error) => {
        setPlayerError(friendlyPlaybackMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (!playerRef.current || !videoId) return;
    playerRef.current.setVolume?.(volume);
  }, [volume, videoId]);

  useEffect(() => {
    if (!playerReady || !videoId) return;
    const durationTimer = window.setInterval(() => {
      const rawDuration = playerRef.current?.getDuration?.() || 0;
      if (!isLikelyYoutubeAdPlayback(playerRef.current, rawDuration)) {
        reportDuration(rawDuration);
      }
    }, 500);
    return () => window.clearInterval(durationTimer);
  }, [playerReady, videoId]);

  useEffect(() => {
    if (!playerRef.current || !videoId) return;
    if (isPlaying) {
      playerRef.current.playVideo?.();
    } else {
      playerRef.current.pauseVideo?.();
    }
  }, [introClockGuardSeconds, isPlaying, videoId]);

  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!isPlaying) return;

    timerRef.current = window.setInterval(() => {
      const player = playerRef.current;
      const rawCurrent = player?.getCurrentTime?.();
      const current = Number.isFinite(rawCurrent) ? Number(rawCurrent) : playbackPositionRef.current;
      const rawDuration = player?.getDuration?.();
      if (isLikelyYoutubeAdPlayback(player || null, Number(rawDuration) || 0)) {
        stalledTickRef.current = 0;
        return;
      }
      const manualSeekActive = Date.now() < manualSeekUntilRef.current;
      if (!manualSeekActive && introClockGuardSeconds > 0 && current > 0 && current < introClockGuardSeconds) {
        if (playbackPositionRef.current !== 0) {
          playbackPositionRef.current = 0;
          onPositionChange(0);
        }
        lastPlaybackTimeRef.current = 0;
        stalledTickRef.current = 0;
        return;
      }
      const nextDuration = normalizeTrackDuration(
        Number.isFinite(rawDuration) && Number(rawDuration) > 0 ? Number(rawDuration) : displayedDurationRef.current || 0,
        displayedDurationRef.current,
      );
      const playerState = player?.getPlayerState?.();
      const previous = lastPlaybackTimeRef.current;
      const isActuallyPlaying = window.YT && playerState === window.YT.PlayerState.PLAYING;
      const nearTrackEnd = nextDuration > 0 && previous >= nextDuration - 2 && current < 2;
      const jumpedBackUnexpectedly = isActuallyPlaying && previous > 3 && current + 2 < previous && !manualSeekActive && !nearTrackEnd;
      const stableCurrent = jumpedBackUnexpectedly ? previous : current;

      playbackPositionRef.current = stableCurrent;
      onPositionChange(stableCurrent);
      if (nextDuration > 0) {
        reportDuration(nextDuration);
      }

      const isProgressStuck = Math.abs(stableCurrent - lastPlaybackTimeRef.current) < 0.15;
      if (isProgressStuck && !isActuallyPlaying) {
        stalledTickRef.current += 1;
      } else {
        stalledTickRef.current = 0;
      }
      lastPlaybackTimeRef.current = stableCurrent;

      if (stalledTickRef.current >= 5) {
        stalledTickRef.current = 0;
        void recoverYoutubePlayback("stalled").then((recovered) => {
          if (!recovered) {
            setPlayerError("YouTube 재생이 잠깐 멈췄다냥. 다른 탭 재생을 멈추거나 영상 펼치기로 상태를 확인해줘냥.");
          }
        });
      }
    }, PLAYBACK_TICK_MS);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, videoId]);

  function seekByPointer(event: PointerEvent<HTMLDivElement>) {
    if (!displayedDuration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const seconds = displayedDuration * Math.min(Math.max(ratio, 0), 1);
    manualSeekUntilRef.current = Date.now() + 1800;
    lastPlaybackTimeRef.current = seconds;
    playerRef.current?.seekTo?.(seconds, true);
    onSeek(seconds);
  }

  function skipBy(seconds: number) {
    const max = displayedDuration > 0 ? Math.max(displayedDuration - 1, 0) : 24 * 60 * 60;
    const nextSeconds = Math.min(Math.max(position + seconds, 0), max);
    manualSeekUntilRef.current = Date.now() + 1800;
    lastPlaybackTimeRef.current = nextSeconds;
    playerRef.current?.seekTo?.(nextSeconds, true);
    onSkip(seconds);
  }

  async function submitLink() {
    const value = url.trim();
    if (!value) return;
    const registered = await onRegisterLink(value);
    if (registered) {
      setUrl("");
    }
  }

  function dropTrack(targetPlaylistTrackId: number) {
    if (!draggingPlaylistTrackId || draggingPlaylistTrackId === targetPlaylistTrackId) {
      setDraggingPlaylistTrackId(null);
      return;
    }

    const orderedIds = tracks.map((item) => item.playlistTrackId);
    const fromIndex = orderedIds.indexOf(draggingPlaylistTrackId);
    const toIndex = orderedIds.indexOf(targetPlaylistTrackId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingPlaylistTrackId(null);
      return;
    }

    const [moved] = orderedIds.splice(fromIndex, 1);
    orderedIds.splice(toIndex, 0, moved);
    onReorderTracks(orderedIds);
    setDraggingPlaylistTrackId(null);
  }

  return (
    <section className="widget-group music-player-widget" aria-label="BGM 턴테이블">
      <div className="widget-group-head">
        <div>
          <h2>BGM 턴테이블</h2>
          <p>작업 카드에 붙인 곡을 여기서 조심조심 튼다냥</p>
        </div>
      </div>
      <section className="widget-section now-playing" aria-labelledby="now-playing-title">
        <SectionHeader title="지금 재생 중" />
        <div className={`player-area ${isPlaying ? "playing" : "paused"}`} id="player-area" title="작업 카드에 연결된 곡">
          <div className="cat-tail" aria-hidden="true"></div>
          <div className="record" aria-label="재생 중인 레코드">
            <span className="record-label">
              <img className="paw-print" src={pawBlack} alt="" aria-hidden="true" />
            </span>
          </div>
          <div className="track-info">
            <h3 id="now-playing-title">{track?.title || "아직 담긴 곡이 없다냥"}</h3>
            <p>{track?.artist || "YouTube 링크를 넣어줘냥"} · 오늘의 작업 BGM</p>
            <div className="track-meta" aria-label="곡 상세">
              <span>{formatSourceType(track?.sourceType)}</span>
            </div>
          </div>
        </div>
        <div className="player-controls" aria-label="작업용 플레이어 컨트롤">
          <button className="icon-button" type="button" title="이전 곡" aria-label="이전 곡" disabled={!tracks.length} onClick={() => onMoveTrack(-1, isPlaying)}><Icon name="previous" /></button>
          <button className="icon-button" type="button" title="10초 뒤로" aria-label="10초 뒤로" disabled={!track} onClick={() => skipBy(-10)}><Icon name="rewind" /></button>
          <button className="icon-button main" type="button" title={isPlaying ? "일시정지" : "재생"} aria-label={isPlaying ? "일시정지" : "재생"} disabled={!track} onClick={onTogglePlay}><Icon name={isPlaying ? "pause" : "play"} /></button>
          <button className="icon-button" type="button" title="10초 앞으로" aria-label="10초 앞으로" disabled={!track} onClick={() => skipBy(10)}><Icon name="forward" /></button>
          <button className="icon-button" type="button" title="다음 곡" aria-label="다음 곡" disabled={!tracks.length} onClick={() => onMoveTrack(1, isPlaying)}><Icon name="next" /></button>
          <button
            className={`icon-button repeat${repeatMode !== "off" ? " active" : ""}${repeatMode === "one" ? " repeat-one" : ""}`}
            type="button"
            title={repeatModeLabel(repeatMode)}
            aria-label={repeatModeLabel(repeatMode)}
            onClick={onToggleRepeat}
          >
            <Icon name="repeat" />
            {repeatMode === "one" && <span className="repeat-badge">1</span>}
          </button>
        </div>
        <div className="progress-row" aria-label="재생 위치">
          <span>{formatDuration(position)}</span>
          <div className="progress-track" id="progress-track" role="slider" tabIndex={0} aria-label="재생 위치 이동" onPointerDown={seekByPointer}>
            <span id="progress-bar" style={{ width: `${progressRatio * 100}%` }}></span>
            <i id="progress-thumb" style={{ left: `${progressRatio * 100}%` }}></i>
          </div>
          <span id="progress-duration">{formatDuration(displayedDuration)}</span>
          <div className="volume-control">
            <button className="volume-button" id="volume-toggle" type="button" aria-label="볼륨 조절" onClick={() => onVolumeChange(volume > 0 ? 0 : Number(window.localStorage.getItem("kurostep.previousVolume") || 80))}><Icon name="volume" /></button>
            <div className="volume-popover" aria-hidden="true">
              <input id="volume-slider" type="range" min="0" max="100" step="1" value={volume} aria-label="볼륨" onChange={(event) => onVolumeChange(Number(event.target.value))} />
              <span id="volume-value">{volume}%</span>
            </div>
          </div>
        </div>
        {playerError && <p className="state-message">{playerError}</p>}
        {!playerError && track && !playerReady && <p className="state-message">YouTube 플레이어를 깨우는 중이냥</p>}
        <button className="youtube-panel-toggle" id="youtube-video-toggle" type="button" aria-expanded={youtubeVisible} aria-controls="youtube-frame-shell" title={youtubeVisible ? "영상 접기" : "영상 펼치기"} aria-label={youtubeVisible ? "영상 접기" : "영상 펼치기"} onClick={onToggleYoutube}>
          <Icon name="chevronDown" />
          <span>{youtubeVisible ? "영상 접기" : "영상 펼치기"}</span>
        </button>
        <div className={`youtube-frame-shell${youtubeVisible ? " open" : ""}`} id="youtube-frame-shell" aria-hidden={!youtubeVisible}>
          <div id="youtube-player" className="youtube-player" aria-label="앱 내부 YouTube 플레이어"></div>
        </div>
      </section>
      <section className="sub-section link-widget" aria-labelledby="link-widget-title">
        <SectionHeader title="유튜브 링크" />
        <form className="link-form" id="link-widget-title" onSubmit={(event) => {
          event.preventDefault();
          submitLink();
        }}>
          <input className="form-input wide" value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="영상 또는 플레이리스트 링크를 붙여넣어줘냥" aria-label="유튜브 링크" />
          <button className="action-button primary" type="button" disabled={!canRegisterLinks} onClick={() => void submitLink()}>
            {canRegisterLinks ? "링크 불러오기" : "준비 중"}
          </button>
        </form>
        {pendingPlaylistImport && (
          <div className="playlist-import-panel" aria-label="플레이리스트 담기 확인">
            <strong>플레이리스트 {pendingPlaylistImport.trackCount}곡을 찾았다냥.</strong>
            <p>지금은 앞 {pendingPlaylistImport.tracks.length}곡까지 바로 담을 수 있다냥.</p>
            <label>
              담을 곡 수
              <input
                className="form-input small"
                type="number"
                min="1"
                max={pendingPlaylistImport.tracks.length}
                value={pendingPlaylistImport.count}
                onChange={(event) => onPendingPlaylistCountChange(Number(event.target.value))}
              />
            </label>
            <div className="inline-actions">
              <button className="action-button primary" type="button" onClick={onConfirmPlaylistImport}>담기</button>
              <button className="action-button compact" type="button" onClick={onCancelPlaylistImport}>취소</button>
            </div>
          </div>
        )}
      </section>
      <section className="widget-section playlist-widget" aria-labelledby="playlist-title">
        <div className="section-head">
          <h2 className="section-title">재생 목록</h2>
          <button className="mini-icon-button" id="shuffle-playlist" type="button" title="셔플" aria-label="셔플" onClick={onShuffle}><Icon name="shuffle" /></button>
        </div>
        <p className="playlist-name">{playlist?.name || "오늘의 작업 BGM"} · {tracks.length}곡 · {page}/{pageCount}쪽</p>
        <ol className="playlist-list" id="playlist-title">
          {visibleTracks.map((playlistTrack) => (
            <li
              className={`playlist-item${playlistTrack.playlistTrackId === track?.playlistTrackId ? " playing" : ""}${playlistTrack.playlistTrackId === draggingPlaylistTrackId ? " dragging" : ""}`}
              draggable="true"
              key={playlistTrack.playlistTrackId}
              onDragStart={() => setDraggingPlaylistTrackId(playlistTrack.playlistTrackId)}
              onDragEnd={() => setDraggingPlaylistTrackId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropTrack(playlistTrack.playlistTrackId)}
            >
              <button className="drag-handle" type="button" title="끌어서 순서 바꾸기" aria-label="끌어서 순서 바꾸기"><Icon name="grip" /></button>
              <span
                className="playlist-track"
                role="button"
                tabIndex={0}
                onClick={() => onSelectTrack(playlistTrack)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectTrack(playlistTrack);
                  }
                }}
              >
                <strong>{playlistTrack.title || `Track #${playlistTrack.trackId}`}</strong>
                <small>{playlistTrack.artist || "YouTube"} · #{playlistTrack.trackId}</small>
              </span>
              <span className="playlist-duration">{formatDuration(getPlaylistDuration(playlistTrack))}</span>
              <button className="mini-icon-button danger playlist-remove-button" type="button" title="플레이리스트에서 곡 제거" aria-label="플레이리스트에서 곡 제거" onClick={() => onRemoveTrack(playlistTrack)}><Icon name="trash" /></button>
            </li>
          ))}
        </ol>
        {pageCount > 1 && (
          <div className="playlist-pager">
            <button className="action-button compact" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>이전</button>
            <button className="action-button compact" type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>다음</button>
          </div>
        )}
      </section>
    </section>
  );
}

function TaskPawWidget({
  workspace,
  savedLyricPieces,
  selectedLine,
  translation,
  onSelectTask,
  onCreateTask,
  onUpdateStatus,
  onDeleteTask,
  onSaveMemo,
  onDeleteMemo,
  onDraftMemo,
  onDeletePiece,
}: {
  workspace: Workspace;
  savedLyricPieces: SavedLyricPiece[];
  selectedLine: SelectedLine | null;
  translation: Translation | null;
  onSelectTask: (task: CreatorTask) => void;
  onCreateTask: (title: string) => Promise<void> | void;
  onUpdateStatus: (status: TaskStatus) => void;
  onDeleteTask: () => void;
  onSaveMemo: (translatedText: string, memoText: string) => void;
  onDeleteMemo: () => void;
  onDraftMemo: (translatedText: string, memoText: string) => void;
  onDeletePiece: (pieceId: string) => void;
}) {
  return (
    <section className="widget-group task-paw-widget lyric-paw-widget" aria-label="작업 발자국">
      <div className="widget-group-head">
        <div>
          <h2>작업 발자국</h2>
          <p>오늘 할 일과 번역 메모를 한 발자국씩 만진다냥</p>
        </div>
      </div>
      <TodayWorkWidget tasks={workspace.tasks} work={workspace.work} onSelectTask={onSelectTask} onCreateTask={onCreateTask} onUpdateStatus={onUpdateStatus} onDeleteTask={onDeleteTask} />
      <LyricMemoWidget selectedLine={selectedLine} translation={translation} onSaveMemo={onSaveMemo} onDeleteMemo={onDeleteMemo} onDraftChange={onDraftMemo} />
      <section className="widget-section saved-lyrics-widget" aria-labelledby="saved-lyrics-title">
        <SectionHeader title="저장한 가사 조각" />
        {savedLyricPieces.length ? (
          <ol className="saved-lyric-list">
            {savedLyricPieces.map((piece) => (
              <li key={piece.id}>
                <strong>{piece.lineText}</strong>
                <small>{piece.translatedText || "번역문 없음"}{piece.memoText ? ` · ${piece.memoText}` : ` · ${piece.trackTitle}`}</small>
                <button className="mini-icon-button danger" type="button" title="저장 조각 삭제" aria-label="저장 조각 삭제" onClick={() => onDeletePiece(piece.id)}><Icon name="trash" /></button>
              </li>
            ))}
          </ol>
        ) : <p className="state-message">가사 창에서 마음에 드는 줄을 콕 저장할 수 있다냥.</p>}
      </section>
    </section>
  );
}

function LyricMemoWidget({
  selectedLine,
  translation,
  onSaveMemo,
  onDeleteMemo,
  onDraftChange,
}: {
  selectedLine: SelectedLine | null;
  translation: Translation | null;
  onSaveMemo: (translatedText: string, memoText: string) => void;
  onDeleteMemo: () => void;
  onDraftChange: (translatedText: string, memoText: string) => void;
}) {
  const [translatedText, setTranslatedText] = useState("");
  const [memoText, setMemoText] = useState("");
  const lineKey = lyricLineKey(selectedLine);
  const draftDirtyRef = useRef(false);

  useEffect(() => {
    setTranslatedText(translation?.translatedText || (selectedLine?.text && containsHangul(selectedLine.text) ? selectedLine.text : ""));
    setMemoText(normalizeMemoText(translation?.memoText));
    draftDirtyRef.current = false;
  }, [lineKey, selectedLine?.text]);

  useEffect(() => {
    if (draftDirtyRef.current) return;
    if (!translation) return;
    setTranslatedText(translation?.translatedText || (selectedLine?.text && containsHangul(selectedLine.text) ? selectedLine.text : ""));
    setMemoText(normalizeMemoText(translation?.memoText));
  }, [translation?.id, translation?.translatedText, translation?.memoText, lineKey, selectedLine?.text]);

  function changeTranslatedText(value: string) {
    draftDirtyRef.current = true;
    setTranslatedText(value);
    onDraftChange(value, memoText);
  }

  function changeMemoText(value: string) {
    draftDirtyRef.current = true;
    setMemoText(value);
    onDraftChange(translatedText, value);
  }

  function deleteMemo() {
    draftDirtyRef.current = false;
    setTranslatedText(selectedLine?.text && containsHangul(selectedLine.text) ? selectedLine.text : "");
    setMemoText("");
    onDeleteMemo();
  }

  return (
    <section className="widget-section lyric-memo-widget" aria-labelledby="lyric-memo-title">
      <SectionHeader title="번역 메모" />
      {selectedLine?.text ? (
        <>
          <p className="memo-context" id="memo-context"><span>{formatTimestamp(selectedLine.startTimeMs)}</span> "{selectedLine.text}"</p>
          <label className="memo-field"><span>번역문</span><textarea className="memo-input" id="translated-text" value={translatedText} onChange={(event) => changeTranslatedText(event.target.value)} placeholder="이 줄의 한국어 번역을 적어줘냥" /></label>
          <label className="memo-field"><span>작업 메모</span><textarea className="memo-input" id="translation-memo" value={memoText} onChange={(event) => changeMemoText(event.target.value)} placeholder="이 가사를 작업에 어떻게 붙일지 적어줘냥" /></label>
          <div className="memo-actions">
            <button className="action-button primary compact" id="save-memo" type="button" onClick={() => onSaveMemo(translatedText, memoText)}>메모 저장</button>
            <button className="action-button compact danger" id="delete-memo" type="button" onClick={deleteMemo}>메모 삭제</button>
            <span className="memo-save-state" id="memo-save-state">{translationStatusLabel(translation?.status)}</span>
          </div>
        </>
      ) : <p className="state-message">곡을 재생하면 현재 가사와 한국어 메모를 만질 수 있다냥.</p>}
    </section>
  );
}

function LyricsWidget({
  currentTrack,
  lyric,
  lyricSource,
  selectedLine,
  translation,
  lyricsExpanded,
  lyricSyncOffsetMs,
  onToggleExpanded,
  onSelectLine,
  onSavePiece,
  onAdjustSync,
  onResetSync,
}: {
  currentTrack: Track | null;
  lyric: Lyric | null;
  lyricSource: LyricSource | null;
  selectedLine: SelectedLine | null;
  translation: Translation | null;
  lyricsExpanded: boolean;
  lyricSyncOffsetMs: number;
  onToggleExpanded: () => void;
  onSelectLine: (line: SelectedLine) => void;
  onSavePiece: () => void;
  onAdjustSync: (deltaMs: number) => void;
  onResetSync: () => void;
}) {
  const fullLines = lyricSource?.lines || [];
  const lyricRefs = lyric?.lines || [];
  const activeLineRef = useRef<HTMLLIElement | null>(null);
  const lyricRefByLineIndex = useMemo(() => {
    const refs = new Map<number, LyricRef>();
    lyricRefs.forEach((lineRef) => refs.set(lineRef.lineIndex, lineRef));
    return refs;
  }, [lyricRefs]);
  const lineText = selectedLine?.text || (currentTrack ? "처음 듣는 곡이면 가사 발자국을 굽는 중이다냥." : "아직 재생 중인 곡이 없다냥.");

  useEffect(() => {
    if (!lyricsExpanded || selectedLine?.lineIndex == null) return;
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [lyricsExpanded, selectedLine?.lineIndex]);

  return (
    <section className="widget-group lyrics-widget" aria-label="가사 창">
      <div className="widget-group-head">
        <div>
          <h2>가사 창</h2>
          <p>지금 흐르는 문장을 보고, 펼치면 전체 가사를 본다냥</p>
        </div>
        <button className="lyrics-panel-toggle" id="lyrics-panel-toggle" type="button" aria-expanded={lyricsExpanded} aria-controls="lyrics-full-list" title={lyricsExpanded ? "가사 접기" : "가사 펼치기"} aria-label={lyricsExpanded ? "가사 접기" : "가사 펼치기"} onClick={onToggleExpanded}>
          <Icon name="chevronDown" />
        </button>
      </div>
      <div className={`lyrics-preview ${selectedLine ? "playing" : ""} ${lyricsExpanded ? "expanded" : ""}`}>
        <p>{lineText}</p>
        {translation?.translatedText && <small>{translation.translatedText}</small>}
        <button className="action-button compact" id="save-lyric-piece" type="button" disabled={!selectedLine?.text} onClick={onSavePiece}>현재 줄 저장</button>
        {currentTrack && (
          <div className="lyric-sync-controls" aria-label="가사 싱크 보정">
            <span>싱크 {formatLyricSyncOffset(lyricSyncOffsetMs)}</span>
            <button className="mini-sync-button" type="button" onClick={() => onAdjustSync(-LYRIC_SYNC_COARSE_STEP_MS)}>5초 늦게</button>
            <button className="mini-sync-button" type="button" onClick={() => onAdjustSync(-LYRIC_SYNC_FINE_STEP_MS)}>0.5초 늦게</button>
            <button className="mini-sync-button" type="button" onClick={() => onAdjustSync(LYRIC_SYNC_FINE_STEP_MS)}>0.5초 빨리</button>
            <button className="mini-sync-button" type="button" onClick={() => onAdjustSync(LYRIC_SYNC_COARSE_STEP_MS)}>5초 빨리</button>
            <button className="mini-sync-button" type="button" onClick={onResetSync}>초기화</button>
          </div>
        )}
        {lyricsExpanded && (
          <div className="lyrics-full-panel">
            <div className="lyrics-full-meta">
              <span>{fullLines.length ? `전체 ${fullLines.length}줄` : "가사 대기 중"}</span>
              <span>{selectedLine ? `현재 ${formatTimestamp(selectedLine.startTimeMs)}` : "싱크 준비"}</span>
            </div>
            <ol className="lyrics-full-list" id="lyrics-full-list">
              {fullLines.length ? fullLines.map((line) => {
                const isActive = line.index === selectedLine?.lineIndex;
                const ref = lyricRefByLineIndex.get(line.index);
                const activeLineTranslation = isActive ? translation?.translatedText || "" : "";
                return (
                <li className={`lyrics-line${isActive ? " active" : ""}`} data-line-index={line.index} key={line.index} ref={isActive ? activeLineRef : undefined}>
                  <button
                    className="lyrics-line-button"
                    type="button"
                    aria-label={`${formatTimestamp(line.startTimeMs)} 이 줄로 싱크 맞추기`}
                    onClick={() => onSelectLine({
                      id: ref?.id || null,
                      lineIndex: line.index,
                      startTimeMs: line.startTimeMs,
                      text: line.text,
                    })}
                  >
                    <span className="lyrics-line-time">{formatTimestamp(line.startTimeMs)}</span>
                    <span className="lyrics-line-copy">
                      <strong>{line.text}</strong>
                      {activeLineTranslation && <small>{activeLineTranslation}</small>}
                    </span>
                  </button>
                </li>
                );
              }) : (
                <li className="lyrics-line empty"><p>아직 불러온 가사가 없다냥.</p></li>
              )}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthSession | null>(() => readJson<AuthSession | null>("kurostep.auth", null));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>({ kind: "notice", message: "작업실 불러오는 중이냥" });
  const [workspace, setWorkspace] = useState<Workspace>({
    tasks: [],
    work: null,
    counts: { ...emptyCounts },
    playlist: null,
    playlistTracks: [],
    currentTrack: null,
  });
  const [playlistPage, setPlaylistPage] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => normalizeRepeatMode(window.localStorage.getItem("kurostep.repeatMode")));
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [lyricSyncOffsetMs, setLyricSyncOffsetMs] = useState(0);
  const [youtubeVisible, setYoutubeVisible] = useState(false);
  const [pawWidgetVisible, setPawWidgetVisible] = useState(() => readJson<boolean>("kurostep.pawWidgetVisible", true));
  const [lyricsOverlayVisible, setLyricsOverlayVisible] = useState(() => readJson<boolean>("kurostep.lyricsOverlayVisible", true));
  const [autoTranslationEnabled, setAutoTranslationEnabled] = useState(() => readJson<boolean>("kurostep.autoTranslationEnabled", true));
  const [volume, setVolume] = useState(() => Number(window.localStorage.getItem("kurostep.volume") || 80));
  const [pendingPlaylistImport, setPendingPlaylistImport] = useState<PendingPlaylistImport | null>(null);
  const [lyric, setLyric] = useState<Lyric | null>(null);
  const [lyricSource, setLyricSource] = useState<LyricSource | null>(null);
  const [selectedLine, setSelectedLine] = useState<SelectedLine | null>(null);
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [translationCache, setTranslationCache] = useState<Record<string, Translation>>({});
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [savedLyricPieces, setSavedLyricPieces] = useState(() => readJson<SavedLyricPiece[]>("kurostep.savedLyricPieces", []));
  const authRef = useRef<AuthSession | null>(auth);
  const workspaceRef = useRef<Workspace>(workspace);
  const selectedLineRef = useRef<SelectedLine | null>(selectedLine);
  const translationCacheRef = useRef<Record<string, Translation>>(translationCache);
  const pendingTranslationRef = useRef(new Set<string>());
  const lastAppliedLyricContextAtRef = useRef(0);
  const lyricLoadRequestRef = useRef(0);
  const lyricWarmupRef = useRef(new Map<number, Promise<LyricSource>>());
  const lastSyncedDurationRef = useRef<Record<number, number>>({});
  const workspaceSyncChannelRef = useRef<BroadcastChannel | null>(null);
  const activeTranslation = isTranslationForLine(translation, selectedLine) ? translation : null;

  useEffect(() => {
    if (!isEmbeddedContent && !isTauriApp) return;
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", blockDeveloperShortcut, true);
    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockDeveloperShortcut, true);
    };
  }, []);

  useEffect(() => {
    if (!isTauriApp || isEmbeddedContent) return;
    const savePosition = () => saveCurrentWindowPosition(shellView);
    const scheduleSave = () => scheduleCurrentWindowPositionSave(shellView);
    const intervalId = window.setInterval(savePosition, 5000);
    window.addEventListener("pointerup", scheduleSave, true);
    window.addEventListener("blur", scheduleSave);
    window.addEventListener("resize", scheduleSave);
    window.addEventListener("beforeunload", savePosition);
    savePosition();
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("pointerup", scheduleSave, true);
      window.removeEventListener("blur", scheduleSave);
      window.removeEventListener("resize", scheduleSave);
      window.removeEventListener("beforeunload", savePosition);
    };
  }, []);

  useEffect(() => {
    authRef.current = auth;
    if (shellView !== "main") {
      return;
    }
    postShellMessage({
      type: "auth_state",
      authenticated: Boolean(auth),
      pawVisible: pawWidgetVisible,
      authJson: auth ? JSON.stringify(auth) : null,
    });
  }, [auth, pawWidgetVisible]);

  useEffect(() => {
    function syncAuthFromStorage(event: StorageEvent) {
      if (event.key !== "kurostep.auth") return;
      setAuth(readJson<AuthSession | null>("kurostep.auth", null));
    }
    window.addEventListener("storage", syncAuthFromStorage);
    return () => window.removeEventListener("storage", syncAuthFromStorage);
  }, []);

  function broadcastWorkspaceSync(reason: string) {
    const payload = { reason, at: Date.now(), source: shellView };
    writeJson("kurostep.workspaceSync", payload);
    workspaceSyncChannelRef.current?.postMessage(payload);
  }

  function readCurrentLyricContext() {
    return readJson<CurrentLyricContext>("kurostep.currentLyricContext", {});
  }

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    selectedLineRef.current = selectedLine;
  }, [selectedLine]);

  useEffect(() => {
    translationCacheRef.current = translationCache;
  }, [translationCache]);

  function applyCurrentLyricContext(context: CurrentLyricContext) {
    if (shellView === "main" && context.trackId && workspaceRef.current.currentTrack?.id && context.trackId !== workspaceRef.current.currentTrack.id) {
      return;
    }
    const contextAt = Number(context.at || 0);
    if (contextAt && contextAt < lastAppliedLyricContextAtRef.current) {
      return;
    }
    if (contextAt) {
      lastAppliedLyricContextAtRef.current = contextAt;
    }
    const nextLine = context.line || null;
    const localDraft = readLocalTranslationDraft(context.trackId, nextLine);
    const nextTranslation = localDraft || (isTranslationForLine(context.translation, nextLine) ? context.translation || null : null);
    setSelectedLine(nextLine);
    setTranslation((current) => nextTranslation || (isTranslationForLine(current, nextLine) ? current : null));
  }

  useEffect(() => {
    if (shellView !== "main") return;
    const context = {
      trackId: workspace.currentTrack?.id || null,
      line: selectedLine || null,
      translation: activeTranslation || null,
      at: Date.now(),
    };
    const contextJson = JSON.stringify(context);
    writeJson("kurostep.currentLyricContext", context);
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("kurostep.currentLyricContext");
      channel.postMessage(context);
      channel.close();
    }
    postShellMessage({
      type: "current_lyric_context",
      contextJson,
    });
    void invokeNative("sync_paw_lyric_context", {
      contextJson,
    }).catch(() => {});
    broadcastWorkspaceSync("current-lyric-context");
  }, [workspace.currentTrack?.id, selectedLine, activeTranslation]);

  useEffect(() => {
    if (shellView === "main") return;

    function applyStoredCurrentLyricContext() {
      applyCurrentLyricContext(readCurrentLyricContext());
    }

    function syncCurrentLyricFromStorage(event: StorageEvent) {
      if (event.key === "kurostep.currentLyricContext") {
        applyStoredCurrentLyricContext();
      }
      if (event.key === "kurostep.workspaceSync") {
        const reason = readJson<{ reason?: string }>("kurostep.workspaceSync", {}).reason;
        if (reason === "current-lyric-context") {
          applyStoredCurrentLyricContext();
        }
      }
    }

    applyStoredCurrentLyricContext();
    const channel = "BroadcastChannel" in window ? new BroadcastChannel("kurostep.currentLyricContext") : null;
    if (channel) {
      channel.onmessage = (event) => {
        applyCurrentLyricContext(event.data as CurrentLyricContext);
      };
    }
    const shellRequestInterval = (isTauriShellContent || isTauriApp)
      ? window.setInterval(() => {
          postShellMessage({ type: "request_lyric_context" });
          void invokeNative("get_current_lyric_context")
            .then((contextJson) => {
              if (typeof contextJson === "string" && contextJson) {
                applyCurrentLyricContext(JSON.parse(contextJson) as CurrentLyricContext);
              }
            })
            .catch(() => {});
          applyStoredCurrentLyricContext();
        }, 500)
      : null;
    window.addEventListener("storage", syncCurrentLyricFromStorage);
    return () => {
      window.removeEventListener("storage", syncCurrentLyricFromStorage);
      channel?.close();
      if (shellRequestInterval) {
        window.clearInterval(shellRequestInterval);
      }
    };
  }, []);

  function updateWorkspaceState(updater: Workspace | ((current: Workspace) => Workspace)) {
    const next = typeof updater === "function" ? updater(workspaceRef.current) : updater;
    workspaceRef.current = next;
    setWorkspace(next);
  }

  function updateCurrentTrackDuration(seconds: number) {
    const currentTrack = workspaceRef.current.currentTrack;
    const nextDuration = normalizeTrackDuration(seconds, currentTrack?.durationSeconds || trackDuration);
    if (nextDuration <= 0) return;
    if (trackDuration === nextDuration && currentTrack?.durationSeconds === nextDuration) {
      return;
    }

    setTrackDuration(nextDuration);
    updateWorkspaceState((current) => ({
      ...current,
      playlistTracks: current.playlistTracks.map((playlistTrack) =>
        playlistTrack.playlistTrackId === current.currentTrack?.playlistTrackId
          ? { ...playlistTrack, durationSeconds: nextDuration }
          : playlistTrack,
      ),
      currentTrack: current.currentTrack
        ? { ...current.currentTrack, durationSeconds: nextDuration }
        : current.currentTrack,
    }));

    const track = workspaceRef.current.currentTrack;
    if (!authRef.current || !track?.id || !track.sourceId) return;
    if (lastSyncedDurationRef.current[track.id] === nextDuration) return;
    lastSyncedDurationRef.current[track.id] = nextDuration;
    void api<Track>("/api/tracks", {
      method: "POST",
      body: JSON.stringify({
        title: track.title,
        artist: track.artist,
        album: track.album,
        sourceType: track.sourceType,
        sourceUrl: track.sourceUrl,
        sourceId: track.sourceId,
        durationSeconds: nextDuration,
      }),
    }, authRef.current).catch(() => {});
  }

  useEffect(() => {
    function handleShellMessage(event: MessageEvent) {
      const data = event.data as { source?: string; action?: string; type?: string; command?: string; message?: string; context?: CurrentLyricContext; contextJson?: string };
      if (data?.source === "kurostep-shell" && data.action === "open_settings") {
        setSettingsOpen(true);
        return;
      }
      if (data?.source === "kurostep-shell" && data.type === "current_lyric_context") {
        try {
          const context = data.context || (data.contextJson ? JSON.parse(data.contextJson) as CurrentLyricContext : {});
          applyCurrentLyricContext(context);
        } catch {
          // Ignore a malformed shell sync packet; storage polling remains as fallback.
        }
        return;
      }
      if (data?.source === "kurostep-shell" && data.type === "native_error") {
        const commandLabel = data.command ? ` (${data.command})` : "";
        setNotice({ kind: "error", message: `앱 창 명령을 못 보냈다냥${commandLabel}: ${data.message || "알 수 없는 오류"}` });
      }
    }
    window.addEventListener("message", handleShellMessage);
    return () => window.removeEventListener("message", handleShellMessage);
  }, []);

  useEffect(() => {
    if (shellView !== "main") {
      return;
    }
    if (!auth) {
      void invokeNative("set_paw_visible", { visible: false, reload: false, clearAuth: true }).catch(() => {});
      void invokeNative("set_lyrics_visible", {
        visible: false,
        line: "",
        translation: "",
      }).catch(() => {});
      return;
    }
    void invokeNative("set_paw_visible", {
      visible: pawWidgetVisible,
      reload: false,
      authJson: JSON.stringify(auth),
    }).catch(() => {});
  }, [auth, pawWidgetVisible]);

  useEffect(() => {
    if (shellView !== "main") {
      return;
    }
    if (!auth) return;
    const contextJson = JSON.stringify({
      trackId: workspace.currentTrack?.id || null,
      line: selectedLine || null,
      translation: activeTranslation || null,
      at: Date.now(),
    });
    void invokeNative("set_lyrics_visible", {
      visible: lyricsOverlayVisible,
      line: selectedLine?.text || "",
      translation: activeTranslation?.translatedText || "",
      contextJson,
    }).catch((error) => {
      setNotice({ kind: "error", message: `가사 오버레이 갱신을 못 했다냥: ${(error as Error).message || error}` });
    });
  }, [auth, lyricsOverlayVisible, workspace.currentTrack?.id, selectedLine, activeTranslation]);

  function requestPawWidgetVisible(visible: boolean) {
    writeJson("kurostep.pawWidgetVisible", visible);
    setPawWidgetVisible(visible);
    if (shellView !== "main" || !authRef.current) return;
    void invokeNative("set_paw_visible", {
      visible,
      reload: false,
      authJson: JSON.stringify(authRef.current),
    }).catch((error) => {
      setNotice({ kind: "error", message: `작업 발자국 창을 못 열었다냥: ${(error as Error).message || error}` });
    });
  }

  function requestLyricsOverlayVisible(visible: boolean) {
    writeJson("kurostep.lyricsOverlayVisible", visible);
    setLyricsOverlayVisible(visible);
    if (shellView !== "main" || !authRef.current) return;
    void invokeNative("set_lyrics_visible", {
      visible,
      line: selectedLine?.text || "",
      translation: activeTranslation?.translatedText || "",
      contextJson: JSON.stringify({
        trackId: workspaceRef.current.currentTrack?.id || null,
        line: selectedLine || null,
        translation: activeTranslation || null,
        at: Date.now(),
      }),
    }).catch((error) => {
      setNotice({ kind: "error", message: `가사 오버레이 창을 못 열었다냥: ${(error as Error).message || error}` });
    });
  }

  function changeAutoTranslationEnabled(enabled: boolean) {
    writeJson("kurostep.autoTranslationEnabled", enabled);
    setAutoTranslationEnabled(enabled);
    setNotice({
      kind: "notice",
      message: enabled ? "자동 번역 초안을 다시 켰다냥." : "자동 번역 초안을 잠깐 껐다냥.",
    });
  }

  const warmTrackLyricCache = useCallback(async (trackId: number, session = authRef.current) => {
    const cacheKey = `kurostep.lyrics.${trackId}`;
    const cached = readJson<LyricSource | null>(cacheKey, null);
    if (cached?.lines?.length && cached?.lyric && hasTimedLyricSource(cached)) {
      return cached;
    }
    const existing = lyricWarmupRef.current.get(trackId);
    if (existing) {
      return existing;
    }
    const warmup = api<LyricFetchResponse>(`/api/tracks/${trackId}/lyrics/fetch`, { method: "POST", timeoutMs: LYRIC_FETCH_TIMEOUT_MS }, session)
      .then((response) => {
        const source = parseLyricSource(response);
        if (source.lines.length) {
          writeJson(cacheKey, source);
        }
        return source;
      })
      .finally(() => {
        lyricWarmupRef.current.delete(trackId);
      });
    lyricWarmupRef.current.set(trackId, warmup);
    return warmup;
  }, []);

  const loadTrackLyrics = useCallback(async (track: Track | null, session = authRef.current) => {
    const requestId = ++lyricLoadRequestRef.current;

    if (!track?.id) {
      setLyric(null);
      setLyricSource(null);
      setSelectedLine(null);
      setTranslation(null);
      return;
    }

    if (isLongFormOrNonSongTrack(track)) {
      setLyric(null);
      setLyricSource(null);
      setSelectedLine(null);
      setTranslation(null);
      setNotice({ kind: "notice", message: friendlyLyricMessage(null, track) });
      return;
    }

    const cacheKey = `kurostep.lyrics.${track.id}`;
    const cached = readJson<LyricSource | null>(cacheKey, null);
    if (cached?.lines?.length && cached?.lyric && hasTimedLyricSource(cached)) {
      if (requestId !== lyricLoadRequestRef.current) return;
      setLyric(cached.lyric || null);
      setLyricSource(cached);
      return;
    }

    setNotice({ kind: "notice", message: "처음 듣는 곡이면 가사 발자국을 굽는 중이다냥." });
    try {
      const source = await warmTrackLyricCache(track.id, session);
      if (requestId !== lyricLoadRequestRef.current) return;
      setLyric(source.lyric || null);
      setLyricSource(source);
      setNotice({ kind: "notice", message: "가사 발자국 준비 완료냥." });
    } catch (error) {
      if (requestId !== lyricLoadRequestRef.current) return;
      setLyric(null);
      setLyricSource(null);
      setSelectedLine(null);
      setTranslation(null);
      setNotice({ kind: "notice", message: friendlyLyricMessage(error, track) });
    }
  }, [warmTrackLyricCache]);

  const queueLyricWarmup = useCallback((track: Pick<Track, "id" | "title" | "artist" | "durationSeconds"> | null, delayMs = 0, session = authRef.current) => {
    if (!track?.id || !session) return;
    if (isLongFormOrNonSongTrack({
      id: track.id,
      title: track.title || "",
      artist: track.artist,
      durationSeconds: track.durationSeconds,
      sourceType: "YOUTUBE",
    })) {
      return;
    }
    window.setTimeout(() => {
      void warmTrackLyricCache(track.id, session).catch(() => {});
    }, delayMs);
  }, [warmTrackLyricCache]);

  useEffect(() => {
    if (shellView !== "main") {
      setTrackDuration(workspace.currentTrack?.durationSeconds || 0);
      return;
    }
    setPlaybackPosition(0);
    setTrackDuration(workspace.currentTrack?.durationSeconds || 0);
    setLyricSyncOffsetMs(readLyricSyncOffset(workspace.currentTrack));
    setSelectedLine(null);
    setTranslation(null);
    void loadTrackLyrics(workspace.currentTrack, authRef.current);
  }, [workspace.currentTrack?.id, loadTrackLyrics, shellView]);

  useEffect(() => {
    if (shellView !== "main") return;
    if (!auth?.accessToken || !workspace.currentTrack?.id || lyricSource?.lines?.length) return;
    void loadTrackLyrics(workspace.currentTrack, auth);
  }, [auth?.accessToken, workspace.currentTrack?.id, lyricSource?.lines?.length, isPlaying, loadTrackLyrics, shellView]);

  useEffect(() => {
    if (shellView !== "main") return;
    const nextLine = chooseLineByPlaybackTime(lyric, lyricSource, playbackPosition, lyricSyncOffsetMs);
    if (!nextLine) {
      return;
    }
    if (nextLine?.id !== selectedLine?.id || nextLine?.lineIndex !== selectedLine?.lineIndex) {
      setSelectedLine(nextLine);
    }
  }, [playbackPosition, lyric, lyricSource, lyricSyncOffsetMs, selectedLine?.id, selectedLine?.lineIndex, shellView]);

  useEffect(() => {
    if (shellView !== "main") {
      return;
    }
    if (!auth?.userId || !selectedLine?.id || !selectedLine.text) {
      setTranslation(null);
      return;
    }
    const lineSnapshot = selectedLine;
    const trackIdSnapshot = workspace.currentTrack?.id || null;
    const key = translationCacheKey(trackIdSnapshot, lineSnapshot) || String(lineSnapshot.id);
    const legacyKey = String(lineSnapshot.id);
    const lineStillCurrent = () =>
      workspaceRef.current.currentTrack?.id === trackIdSnapshot && isSameLyricLine(selectedLineRef.current, lineSnapshot);
    const applyTranslationForLine = (nextTranslation: Translation | null) => {
      if (lineStillCurrent()) {
        setTranslation(nextTranslation);
      }
    };
    const localDraft = readLocalTranslationDraft(trackIdSnapshot, lineSnapshot);
    if (localDraft) {
      setTranslation(localDraft);
      setTranslationCache((current) => ({ ...current, [key]: localDraft, [legacyKey]: localDraft }));
      return;
    }
    const cachedTranslation = translationCacheRef.current[key] || translationCacheRef.current[legacyKey];
    if (isTranslationForLine(cachedTranslation, lineSnapshot)) {
      setTranslation(cachedTranslation);
      return;
    }
    if (containsHangul(lineSnapshot.text)) {
      const koreanDraft = makeLocalTranslation(lineSnapshot, lineSnapshot.text);
      setTranslation(koreanDraft);
      setTranslationCache((current) => ({ ...current, [key]: koreanDraft, [legacyKey]: koreanDraft }));
    } else {
      const pendingDraft = makeLocalTranslation(lineSnapshot, "", "");
      setTranslation(pendingDraft);
      setTranslationCache((current) => ({ ...current, [key]: pendingDraft, [legacyKey]: pendingDraft }));
    }
    if (pendingTranslationRef.current.has(key)) {
      return;
    }
    pendingTranslationRef.current.add(key);

    let cancelled = false;
    api<Translation[]>(`/api/lyric-line-refs/${lineSnapshot.id}/translations?userId=${auth.userId}`, {}, auth)
      .then(async (translations) => {
        if (cancelled || !lineStillCurrent()) return;
        const savedKorean = translations.find((item) => item.languageCode === "ko") || translations[0];
        const localDraftBeforeSave = readLocalTranslationDraft(trackIdSnapshot, lineSnapshot);
        if (localDraftBeforeSave) {
          applyTranslationForLine(localDraftBeforeSave);
          setTranslationCache((current) => ({ ...current, [key]: localDraftBeforeSave, [legacyKey]: localDraftBeforeSave }));
          return;
        }
        if (savedKorean) {
          const normalized = {
            ...savedKorean,
            clientLineKey: lyricLineKey(lineSnapshot),
            memoText: normalizeMemoText(savedKorean.memoText),
          };
          applyTranslationForLine(normalized);
          setTranslationCache((current) => ({ ...current, [key]: normalized, [legacyKey]: normalized }));
          return;
        }
        if (containsHangul(lineSnapshot.text)) {
          return;
        }
        if (!autoTranslationEnabled) {
          return;
        }
        const created = await api<Translation>(`/api/lyric-line-refs/${lineSnapshot.id}/translations/auto-draft?userId=${auth.userId}`, {
          method: "POST",
          body: JSON.stringify({
            sourceText: lineSnapshot.text,
            sourceLanguageCode: "en",
            targetLanguageCode: "ko",
            memoText: "",
          }),
        }, auth);
        if (cancelled || !lineStillCurrent()) return;
        const localDraftBeforeAutoDraft = readLocalTranslationDraft(trackIdSnapshot, lineSnapshot);
        if (localDraftBeforeAutoDraft) {
          applyTranslationForLine(localDraftBeforeAutoDraft);
          setTranslationCache((current) => ({ ...current, [key]: localDraftBeforeAutoDraft, [legacyKey]: localDraftBeforeAutoDraft }));
          return;
        }
        const normalized = { ...created, clientLineKey: lyricLineKey(lineSnapshot), memoText: normalizeMemoText(created.memoText) };
        applyTranslationForLine(normalized);
        setTranslationCache((current) => ({ ...current, [key]: normalized, [legacyKey]: normalized }));
      })
      .catch((error) => {
        if (!cancelled && lineStillCurrent()) {
          setTranslation((current) => isTranslationForLine(current, lineSnapshot) ? current : null);
          if (!containsHangul(lineSnapshot.text)) {
            setNotice({ kind: "notice", message: "이 줄은 직접 번역 메모를 적어두면 된다냥." });
          }
        }
      })
      .finally(() => {
        pendingTranslationRef.current.delete(key);
      });

    return () => {
      cancelled = true;
    };
  }, [
    auth?.userId,
    workspace.currentTrack?.id,
    selectedLine?.id,
    selectedLine?.lineIndex,
    selectedLine?.startTimeMs,
    selectedLine?.text,
    shellView,
    autoTranslationEnabled,
  ]);

  useEffect(() => {
    if (!auth || !workspace.playlistTracks.length) return;
    const currentPlaylistTrackId = workspace.currentTrack?.playlistTrackId;
    const currentIndex = workspace.playlistTracks.findIndex((track) => track.playlistTrackId === currentPlaylistTrackId);
    const startIndex = Math.max(currentIndex, 0);
    const upcoming = workspace.playlistTracks.slice(startIndex, startIndex + 3);
    upcoming.forEach((playlistTrack, index) => {
      if (isLongFormOrNonSongTrack({
        id: playlistTrack.trackId,
        title: playlistTrack.title || "",
        artist: playlistTrack.artist,
        durationSeconds: playlistTrack.durationSeconds,
        sourceType: "YOUTUBE",
      })) {
        return;
      }
      queueLyricWarmup({
        id: playlistTrack.trackId,
        title: playlistTrack.title || "",
        artist: playlistTrack.artist,
        durationSeconds: playlistTrack.durationSeconds,
      }, 900 * index, auth);
    });
  }, [auth, workspace.currentTrack?.playlistTrackId, workspace.playlistTracks, queueLyricWarmup]);

  const refreshWorkspace = useCallback(async (session = authRef.current) => {
    if (!session?.userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let tasks = await api<CreatorTask[]>(todayTasksPath(session.userId), {}, session);
      if (tasks.length === 0) {
        await api<CreatorTask>(`/api/tasks?userId=${session.userId}`, {
          method: "POST",
          body: JSON.stringify({
            title: "오늘의 작업 발자국 정리",
            description: "작업 카드와 BGM, 가사 라인, 번역 메모를 한곳에 모아요.",
            taskDate: todayIso(),
          }),
        }, session);
        tasks = await api<CreatorTask[]>(todayTasksPath(session.userId), {}, session);
      }

      let work = tasks.find((task) => task.status === "DOING") || tasks[0] || null;
      let playlists = await api<Playlist[]>(`/api/playlists?userId=${session.userId}`, {}, session);
      if (playlists.length === 0) {
        await api<Playlist>(`/api/playlists?userId=${session.userId}`, {
          method: "POST",
          body: JSON.stringify({
            name: "오늘의 작업 BGM",
            description: "작업 카드에 연결할 곡을 직접 담는 플레이리스트",
          }),
        }, session);
        playlists = await api<Playlist[]>(`/api/playlists?userId=${session.userId}`, {}, session);
      }

      const playlist = playlists[0] || null;
      let playlistTracks: PlaylistTrack[] = [];
      if (playlist) {
        playlistTracks = await api<PlaylistTrack[]>(`/api/playlists/${playlist.id}/tracks?userId=${session.userId}`, {}, session);
      }

      if (work && playlist && work.playlistId !== playlist.id) {
        work = await api<CreatorTask>(`/api/tasks/${work.id}/playlist/${playlist.id}?userId=${session.userId}`, { method: "PATCH" }, session);
        tasks = tasks.map((task) => (task.id === work?.id ? work : task));
      }

      const currentPlaylistTrack =
        playlistTracks.find((playlistTrack) => playlistTrack.playlistTrackId === work?.currentPlaylistTrackId) ||
        playlistTracks[0] ||
        null;

      let currentTrack: Track | null = null;
      if (currentPlaylistTrack) {
        const detail = await api<Track>(`/api/tracks/${currentPlaylistTrack.trackId}`, {}, session);
        currentTrack = { ...detail, playlistTrackId: currentPlaylistTrack.playlistTrackId, playlistName: playlist?.name };
        if (work && work.currentPlaylistTrackId !== currentPlaylistTrack.playlistTrackId) {
          work = await api<CreatorTask>(`/api/tasks/${work.id}/current-playlist-track/${currentPlaylistTrack.playlistTrackId}?userId=${session.userId}`, { method: "PATCH" }, session);
          tasks = tasks.map((task) => (task.id === work?.id ? work : task));
        }
      }

      updateWorkspaceState({
        tasks,
        work,
        counts: countTaskStatuses(tasks),
        playlist,
        playlistTracks,
        currentTrack,
      });
      setPlaylistPage((current) => Math.min(current, getPlaylistPageCount(playlistTracks.length)));
      setNotice({ kind: "notice", message: "오늘 발자국장 준비 완료냥" });
    } catch (error) {
      setNotice({ kind: "error", message: `작업 정보를 못 불러왔어냥: ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function refreshFromPeer(reason?: string) {
      setSavedLyricPieces(readJson<SavedLyricPiece[]>("kurostep.savedLyricPieces", []));
      if (reason?.startsWith("lyric-piece")) return;

      const session = authRef.current;
      if (session?.accessToken) {
        void refreshWorkspace(session);
      }
    }

    function syncWorkspaceFromStorage(event: StorageEvent) {
      if (event.key === "kurostep.savedLyricPieces") {
        setSavedLyricPieces(readJson<SavedLyricPiece[]>("kurostep.savedLyricPieces", []));
        return;
      }
      if (event.key !== "kurostep.workspaceSync") return;
      refreshFromPeer(readJson<{ reason?: string }>("kurostep.workspaceSync", {}).reason);
    }

    const channel = "BroadcastChannel" in window ? new BroadcastChannel("kurostep.workspaceSync") : null;
    workspaceSyncChannelRef.current = channel;
    if (channel) {
      channel.onmessage = (event) => {
        refreshFromPeer((event.data as { reason?: string } | undefined)?.reason);
      };
    }
    window.addEventListener("storage", syncWorkspaceFromStorage);
    return () => {
      window.removeEventListener("storage", syncWorkspaceFromStorage);
      channel?.close();
      if (workspaceSyncChannelRef.current === channel) {
        workspaceSyncChannelRef.current = null;
      }
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!auth?.accessToken) {
      setLoading(false);
      return;
    }
    api<AuthSession>("/api/auth/me", {}, auth)
      .then((me) => {
        const nextAuth = { ...me, accessToken: auth.accessToken };
        setAuth(nextAuth);
        writeJson("kurostep.auth", nextAuth);
        if (shellView === "main") {
          void invokeNative("set_paw_visible", {
            visible: pawWidgetVisible,
            reload: false,
            authJson: JSON.stringify(nextAuth),
          }).catch(() => {});
        }
        return refreshWorkspace(nextAuth);
      })
      .catch(() => {
        setNotice({ kind: "error", message: "세션 확인이 잠깐 막혔다냥. 로그인 상태는 유지해둘게냥." });
        void refreshWorkspace(auth);
      });
  }, [auth?.accessToken, refreshWorkspace]);

  async function handleAuth(mode: "login" | "signup", data: { email: string; password: string; nickname: string }) {
    if (mode === "signup" && !data.nickname) {
      setNotice({ kind: "error", message: "닉네임을 적어줘냥." });
      return;
    }
    if (!data.email || !isValidEmail(data.email)) {
      setNotice({ kind: "error", message: "이메일 형식을 확인해줘냥." });
      return;
    }
    if (data.password.length < 4) {
      setNotice({ kind: "error", message: "비밀번호는 최소 4자 이상으로 적어줘냥." });
      return;
    }

    setBusy(true);
    setNotice({ kind: "notice", message: mode === "signup" ? "가입 정보 정리 중이냥" : "작업실 문 여는 중이냥" });
    try {
      const session = await api<AuthSession>(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(mode === "signup" ? data : { email: data.email, password: data.password }),
      });
      window.localStorage.removeItem("kurostep.apiBaseUrl");
      writeJson("kurostep.auth", session);
      writeJson("kurostep.pawWidgetVisible", true);
      writeJson("kurostep.lyricsOverlayVisible", true);
      setPawWidgetVisible(true);
      setLyricsOverlayVisible(true);
      setAuth(session);
      if (shellView === "main") {
        void invokeNative("set_paw_visible", {
          visible: true,
          reload: false,
          authJson: JSON.stringify(session),
        }).catch(() => {});
        void invokeNative("set_lyrics_visible", {
          visible: true,
          line: "",
          translation: "",
        }).catch(() => {});
      }
    } catch (error) {
      window.localStorage.removeItem("kurostep.auth");
      setNotice({ kind: "error", message: authErrorMessage(error, mode) });
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    window.localStorage.removeItem("kurostep.auth");
    void invokeNative("set_paw_visible", { visible: false, reload: false, clearAuth: true }).catch(() => {});
    void invokeNative("set_lyrics_visible", { visible: false, line: "", translation: "" }).catch(() => {});
    setAuth(null);
    updateWorkspaceState({ tasks: [], work: null, counts: { ...emptyCounts }, playlist: null, playlistTracks: [], currentTrack: null });
    setIsPlaying(false);
    setPlaybackPosition(0);
    setTrackDuration(0);
    setNotice({ kind: "notice", message: "다음 작업 때 또 보자냥." });
    postShellMessage({ type: "auth_state", authenticated: false });
  }

  async function exitApp() {
    try {
      await invokeNative("exit_app");
    } catch {
      window.close();
    }
  }

  async function reloadTasks(session = authRef.current) {
    if (!session?.userId) return;
    const tasks = await api<CreatorTask[]>(todayTasksPath(session.userId), {}, session);
    updateWorkspaceState((current) => {
      const currentWorkId = current.work?.id;
      const work = tasks.find((task) => task.id === currentWorkId) || tasks.find((task) => task.status === "DOING") || tasks[0] || null;
      return {
        ...current,
        tasks,
        work,
        counts: countTaskStatuses(tasks),
      };
    });
  }

  async function reloadPlaylistTracks(session = authRef.current, options: { selectFirstWhenEmpty?: boolean } = {}) {
    const playlist = workspaceRef.current.playlist;
    if (!session?.userId || !playlist) return [];
    const playlistTracks = await api<PlaylistTrack[]>(`/api/playlists/${playlist.id}/tracks?userId=${session.userId}`, {}, session);
    updateWorkspaceState((current) => {
      const refreshedCurrentPlaylistTrack = playlistTracks.find(
        (item) => item.playlistTrackId === current.currentTrack?.playlistTrackId,
      );
      return {
        ...current,
        playlistTracks,
        currentTrack: current.currentTrack && refreshedCurrentPlaylistTrack
          ? {
              ...current.currentTrack,
              playlistTrackId: refreshedCurrentPlaylistTrack.playlistTrackId,
              playlistName: current.playlist?.name,
            }
          : current.currentTrack,
      };
    });
    setPlaylistPage((current) => Math.min(current, getPlaylistPageCount(playlistTracks.length)));

    if (options.selectFirstWhenEmpty && !workspaceRef.current.currentTrack && playlistTracks[0]) {
      await selectTrack(playlistTracks[0]);
    }
    return playlistTracks;
  }

  async function createTask(title: string) {
    if (!auth?.userId || !title.trim()) {
      setNotice({ kind: "error", message: "할 일 이름을 적어줘냥." });
      return;
    }
    try {
      await api<CreatorTask>(`/api/tasks?userId=${auth.userId}`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), description: "", taskDate: todayIso() }),
      }, auth);
      await reloadTasks(auth);
      broadcastWorkspaceSync("task-created");
      setNotice({ kind: "notice", message: "새 할 일을 발자국장에 넣었다냥." });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function updateStatus(status: TaskStatus) {
    if (!auth?.userId || !workspace.work || workspace.work.status === status) return;
    try {
      await api<CreatorTask>(`/api/tasks/${workspace.work.id}/status?userId=${auth.userId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }, auth);
      await reloadTasks(auth);
      broadcastWorkspaceSync("task-status-updated");
      setNotice({ kind: "notice", message: `작업 상태를 ${statusLabel(status)}로 옮겼다냥.` });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function deleteTask() {
    if (!auth?.userId || !workspace.work) return;
    try {
      await api<void>(`/api/tasks/${workspace.work.id}?userId=${auth.userId}`, { method: "DELETE" }, auth);
      await reloadTasks(auth);
      broadcastWorkspaceSync("task-deleted");
      setNotice({ kind: "notice", message: "할 일을 살짝 치웠다냥." });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function findOrCreateTrackDraft(draft: TrackCreateDraft) {
    const searchKeyword = draft.sourceId || draft.title;
    try {
      const results = await api<Track[]>(`/api/tracks/search?keyword=${encodeURIComponent(searchKeyword)}`, {}, auth);
      const existing = results.find(
        (track) =>
          track.sourceType === draft.sourceType &&
          ((draft.sourceId && track.sourceId === draft.sourceId) || track.sourceUrl === draft.sourceUrl),
      );
      if (existing) {
        const currentTitle = (existing.title || "").trim();
        const currentArtist = (existing.artist || "").trim();
        const nextTitle = (draft.title || "").trim();
        const nextArtist = (draft.artist || "").trim();

        if (draft.sourceId && (currentTitle !== nextTitle || currentArtist !== nextArtist)) {
          return api<Track>("/api/tracks", { method: "POST", body: JSON.stringify(draft) }, auth);
        }
        return existing;
      }
    } catch {
      // Creation is still safe for duplicate-safe demo flow.
    }
    return api<Track>("/api/tracks", { method: "POST", body: JSON.stringify(draft) }, auth);
  }

  async function findOrCreateTrack(sourceUrl: string, sourceId: string) {
    const metadata = await fetchYoutubeMetadata(sourceUrl, sourceId);
    const draft: TrackCreateDraft = {
      title: metadata.title,
      artist: metadata.artist,
      sourceType: "YOUTUBE",
      sourceUrl,
      sourceId,
    };
    return findOrCreateTrackDraft(draft);
  }

  async function ensureWorkspaceReady(session = authRef.current) {
    if (!session?.userId) {
      setNotice({ kind: "error", message: "로그인이 먼저 필요하다냥." });
      return false;
    }
    if (workspaceRef.current.playlist) {
      return true;
    }

    setNotice({ kind: "notice", message: "BGM 바구니를 다시 준비하는 중이냥" });
    await refreshWorkspace(session);
    if (workspaceRef.current.playlist) {
      return true;
    }

    setNotice({ kind: "error", message: "BGM 바구니를 아직 못 만들었다냥. 잠깐 뒤 다시 눌러줘냥." });
    return false;
  }

  async function registerLink(url: string) {
    const session = authRef.current;
    if (!session?.userId) {
      setNotice({ kind: "error", message: "로그인이 먼저 필요하다냥." });
      return false;
    }
    if (!await ensureWorkspaceReady(session)) {
      return false;
    }

    const currentWorkspace = workspaceRef.current;
    const playlist = currentWorkspace.playlist;
    if (!playlist) {
      setNotice({ kind: "error", message: "BGM 바구니가 아직 준비 중이다냥. 잠깐 뒤 다시 눌러줘냥." });
      return false;
    }
    const shouldAutoSelectAddedTrack = !currentWorkspace.currentTrack;
    const sourceUrl = url.trim();
    const sourceId = extractYoutubeId(sourceUrl);
    const playlistId = extractYoutubePlaylistId(sourceUrl);
    if (!sourceUrl || (!sourceId && !playlistId)) {
      setNotice({ kind: "error", message: "YouTube 영상이나 플레이리스트 링크를 넣어줘냥." });
      return false;
    }
    try {
      setNotice({ kind: "notice", message: "YouTube 링크를 작업 바구니에 담는 중이냥" });

      if (playlistId) {
        const preview = await api<YouTubePlaylistPreview>("/api/tracks/youtube-playlist/preview", {
          method: "POST",
          body: JSON.stringify({ playlistUrl: sourceUrl }),
        }, session);
        const previewCount = preview.tracks.length;
        if (!previewCount) {
          setNotice({ kind: "error", message: "담을 수 있는 공개 영상을 찾지 못했다냥." });
          return false;
        }
        setPendingPlaylistImport({
          ...preview,
          count: previewCount,
        });
        setNotice({ kind: "notice", message: `플레이리스트 ${preview.trackCount}곡을 찾았다냥. 담을 곡 수를 확인해줘냥.` });
      } else {
        const track = await findOrCreateTrack(sourceUrl, sourceId);
        await api<void>(`/api/playlists/${playlist.id}/tracks/${track.id}?userId=${session.userId}`, { method: "POST" }, session).catch((error) => {
          if (!String((error as Error).message).includes("이미")) throw error;
        });
        queueLyricWarmup(track, 200, session);
        const playlistTracks = await reloadPlaylistTracks(session, { selectFirstWhenEmpty: shouldAutoSelectAddedTrack });
        const addedPlaylistTrack = playlistTracks.find((item) => item.trackId === track.id) || null;
        if (shouldAutoSelectAddedTrack && addedPlaylistTrack) {
          await selectTrack(addedPlaylistTrack);
        }
        broadcastWorkspaceSync("playlist-track-added");
        setNotice({ kind: "notice", message: "곡을 BGM 바구니에 넣었다냥." });
      }
      return true;
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
      return false;
    }
  }

  function changePendingPlaylistCount(count: number) {
    setPendingPlaylistImport((current) => {
      if (!current) return current;
      const normalized = Math.min(Math.max(Number(count) || 1, 1), current.tracks.length);
      return { ...current, count: normalized };
    });
  }

  async function confirmPlaylistImport() {
    const current = pendingPlaylistImport;
    const currentWorkspace = workspaceRef.current;
    if (!current || !auth?.userId || !currentWorkspace.playlist) return;

    try {
      setNotice({ kind: "notice", message: "플레이리스트 곡을 BGM 바구니에 담는 중이냥" });
      const shouldAutoSelectAddedTrack = !workspaceRef.current.currentTrack;
      const drafts = current.tracks.slice(0, current.count);
      let firstAddedTrackId: number | null = null;
      const warmupTracks: Track[] = [];
      for (const draft of drafts) {
        const track = await findOrCreateTrackDraft(draft);
        firstAddedTrackId ??= track.id;
        if (warmupTracks.length < 3) {
          warmupTracks.push(track);
        }
        await api<void>(`/api/playlists/${currentWorkspace.playlist.id}/tracks/${track.id}?userId=${auth.userId}`, { method: "POST" }, auth).catch((error) => {
          if (!String((error as Error).message).includes("이미")) throw error;
        });
      }
      warmupTracks.forEach((track, index) => queueLyricWarmup(track, 700 * index, auth));
      const playlistTracks = await reloadPlaylistTracks(auth);
      if (shouldAutoSelectAddedTrack && firstAddedTrackId && !workspaceRef.current.currentTrack) {
        const firstAddedPlaylistTrack = playlistTracks.find((item) => item.trackId === firstAddedTrackId) || playlistTracks[0];
        if (firstAddedPlaylistTrack) {
          await selectTrack(firstAddedPlaylistTrack);
        }
      }
      setPendingPlaylistImport(null);
      broadcastWorkspaceSync("playlist-imported");
      setNotice({ kind: "notice", message: `${drafts.length}곡을 BGM 바구니에 넣었다냥.` });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  function cancelPlaylistImport() {
    setPendingPlaylistImport(null);
    setNotice({ kind: "notice", message: "플레이리스트 담기를 멈췄다냥." });
  }

  async function selectTrack(playlistTrack: PlaylistTrack) {
    const currentWorkspace = workspaceRef.current;
    if (!auth?.userId) return;
    let work = currentWorkspace.work;
    try {
      if (!work) {
        const tasks = await api<CreatorTask[]>(todayTasksPath(auth.userId), {}, auth);
        work = tasks.find((task) => task.status === "DOING") || tasks[0] || null;
        updateWorkspaceState((current) => ({
          ...current,
          tasks,
          work,
          counts: countTaskStatuses(tasks),
        }));
      }
      if (!work) {
        work = await api<CreatorTask>(`/api/tasks?userId=${auth.userId}`, {
          method: "POST",
          body: JSON.stringify({ title: "오늘의 작업 발자국 정리", description: "", taskDate: todayIso() }),
        }, auth);
        updateWorkspaceState((current) => ({
          ...current,
          tasks: [work!, ...current.tasks],
          work,
          counts: countTaskStatuses([work!, ...current.tasks]),
        }));
      }
      const playlist = workspaceRef.current.playlist;
      if (playlist && work.playlistId !== playlist.id) {
        work = await api<CreatorTask>(`/api/tasks/${work.id}/playlist/${playlist.id}?userId=${auth.userId}`, { method: "PATCH" }, auth);
        updateWorkspaceState((current) => ({
          ...current,
          work,
          tasks: current.tasks.map((task) => (task.id === work!.id ? work! : task)),
        }));
      }
      const updatedWork = await api<CreatorTask>(`/api/tasks/${work.id}/current-playlist-track/${playlistTrack.playlistTrackId}?userId=${auth.userId}`, { method: "PATCH" }, auth);
      const detail = await api<Track>(`/api/tracks/${playlistTrack.trackId}`, {}, auth);
      setPlaybackPosition(0);
      setTrackDuration(detail.durationSeconds || 0);
      updateWorkspaceState((current) => ({
        ...current,
        work: updatedWork,
        tasks: current.tasks.map((task) => (task.id === updatedWork.id ? updatedWork : task)),
        currentTrack: { ...detail, playlistTrackId: playlistTrack.playlistTrackId, playlistName: current.playlist?.name },
      }));
      broadcastWorkspaceSync("current-track-selected");
      setNotice({ kind: "notice", message: "현재 곡을 바꿨다냥." });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function removeTrack(playlistTrack: PlaylistTrack) {
    const currentWorkspace = workspaceRef.current;
    if (!auth?.userId || !currentWorkspace.playlist) return;
    const removingCurrent = currentWorkspace.currentTrack?.playlistTrackId === playlistTrack.playlistTrackId;
    const replacement = currentWorkspace.playlistTracks.find((item) => item.playlistTrackId !== playlistTrack.playlistTrackId) || null;
    try {
      let updatedWork = currentWorkspace.work;
      if (removingCurrent && currentWorkspace.work) {
        if (replacement) {
          updatedWork = await api<CreatorTask>(`/api/tasks/${currentWorkspace.work.id}/current-playlist-track/${replacement.playlistTrackId}?userId=${auth.userId}`, { method: "PATCH" }, auth);
        } else {
          updatedWork = await api<CreatorTask>(`/api/tasks/${currentWorkspace.work.id}/current-playlist-track?userId=${auth.userId}`, { method: "DELETE" }, auth);
        }
      }

      await api<void>(`/api/playlists/${currentWorkspace.playlist.id}/tracks/${playlistTrack.trackId}?userId=${auth.userId}`, { method: "DELETE" }, auth);
      const playlistTracks = await reloadPlaylistTracks(auth);
      if (removingCurrent) {
        if (!replacement || !playlistTracks.length) {
          updateWorkspaceState((current) => ({
            ...current,
            work: updatedWork,
            tasks: updatedWork ? current.tasks.map((task) => (task.id === updatedWork?.id ? updatedWork : task)) : current.tasks,
            currentTrack: null,
          }));
          setPlaybackPosition(0);
          setTrackDuration(0);
          setIsPlaying(false);
        } else {
          const detail = await api<Track>(`/api/tracks/${replacement.trackId}`, {}, auth);
          updateWorkspaceState((current) => ({
            ...current,
            work: updatedWork,
            tasks: updatedWork ? current.tasks.map((task) => (task.id === updatedWork?.id ? updatedWork : task)) : current.tasks,
            currentTrack: { ...detail, playlistTrackId: replacement.playlistTrackId, playlistName: current.playlist?.name },
          }));
        }
      }
      broadcastWorkspaceSync("playlist-track-removed");
      setNotice({ kind: "notice", message: "BGM 바구니에서 곡을 뺐다냥." });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function shufflePlaylist() {
    if (!auth?.userId || !workspace.playlist) return;
    if (workspace.playlistTracks.length < 2) {
      setNotice({ kind: "notice", message: "섞을 곡이 아직 부족하다냥." });
      return;
    }
    const orderedIds = workspace.playlistTracks.map((track) => track.playlistTrackId);
    for (let index = orderedIds.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [orderedIds[index], orderedIds[randomIndex]] = [orderedIds[randomIndex], orderedIds[index]];
    }
    try {
      const tracks = await api<PlaylistTrack[]>(`/api/playlists/${workspace.playlist.id}/tracks/reorder?userId=${auth.userId}`, {
        method: "PATCH",
        body: JSON.stringify({ playlistTrackIds: orderedIds }),
      }, auth);
      updateWorkspaceState((current) => ({ ...current, playlistTracks: tracks }));
      setNotice({ kind: "notice", message: "플레이리스트를 랜덤 발걸음으로 섞었다냥." });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function reorderPlaylist(playlistTrackIds: number[]) {
    if (!auth?.userId || !workspace.playlist) return;
    if (playlistTrackIds.length !== workspace.playlistTracks.length) {
      setNotice({ kind: "error", message: "플레이리스트 순서를 다시 확인해줘냥." });
      return;
    }

    try {
      const tracks = await api<PlaylistTrack[]>(`/api/playlists/${workspace.playlist.id}/tracks/reorder?userId=${auth.userId}`, {
        method: "PATCH",
        body: JSON.stringify({ playlistTrackIds }),
      }, auth);
      updateWorkspaceState((current) => ({ ...current, playlistTracks: tracks }));
      setNotice({ kind: "notice", message: "BGM 순서를 살금 바꿨다냥." });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function saveMemoForLine(line: SelectedLine, translatedText: string, memoText: string, options: { showNotice?: boolean } = {}) {
    const showNotice = options.showNotice ?? true;
    const cacheKey = translationCacheKey(workspaceRef.current.currentTrack?.id, line);
    const legacyKey = line.id != null ? String(line.id) : cacheKey;
    const localTranslation = makeLocalTranslation(
      line,
      translatedText || (containsHangul(line.text) ? line.text : ""),
      memoText,
    );
    writeLocalTranslationDraft(workspaceRef.current.currentTrack?.id, line, localTranslation.translatedText, localTranslation.memoText || "");
    window.localStorage.setItem("kurostep.translationMemo", normalizeMemoText(memoText));
    if (!auth?.userId || !line.id) {
      setTranslation(localTranslation);
      setTranslationCache((current) => ({ ...current, [cacheKey]: localTranslation, [legacyKey]: localTranslation }));
      if (showNotice) {
        setNotice({ kind: "notice", message: "서버 줄 번호가 없어 로컬에 먼저 저장했다냥." });
      }
      return localTranslation;
    }
    try {
      const saved = await api<Translation>(`/api/lyric-line-refs/${line.id}/translations?userId=${auth.userId}`, {
        method: "POST",
        body: JSON.stringify({
          languageCode: "ko",
          translatedText: translatedText || line.text,
          memoText: normalizeMemoText(memoText),
        }),
      }, auth);
      const normalized = { ...saved, clientLineKey: lyricLineKey(line), memoText: normalizeMemoText(saved.memoText) };
      setTranslation(normalized);
      setTranslationCache((current) => ({ ...current, [cacheKey]: normalized, [legacyKey]: normalized }));
      writeLocalTranslationDraft(workspaceRef.current.currentTrack?.id, line, normalized.translatedText, normalized.memoText || "");
      if (showNotice) {
        setNotice({ kind: "notice", message: "번역 메모를 서버에 콕 저장했다냥." });
      }
      return normalized;
    } catch (error) {
      setTranslation(localTranslation);
      setTranslationCache((current) => ({ ...current, [cacheKey]: localTranslation, [legacyKey]: localTranslation }));
      if (showNotice) {
        setNotice({ kind: "notice", message: "서버 저장은 실패했지만 이 기기에는 저장했다냥." });
      }
      return localTranslation;
    }
  }

  async function saveMemo(translatedText: string, memoText: string) {
    if (!selectedLine) {
      setNotice({ kind: "notice", message: "아직 저장할 가사 줄이 없다냥." });
      return;
    }
    const saved = await saveMemoForLine(selectedLine, translatedText, memoText);
    if (saved) {
      broadcastWorkspaceSync("lyric-memo-saved");
    }
  }

  function draftMemo(translatedText: string, memoText: string) {
    if (!selectedLine?.text) {
      return;
    }
    const normalized = makeLocalTranslation(
      selectedLine,
      translatedText || (containsHangul(selectedLine.text) ? selectedLine.text : ""),
      memoText,
    );
    writeLocalTranslationDraft(workspace.currentTrack?.id, selectedLine, normalized.translatedText, normalized.memoText || "");
    setTranslation(normalized);
    const cacheKey = translationCacheKey(workspace.currentTrack?.id, selectedLine);
    const legacyKey = selectedLine.id != null ? String(selectedLine.id) : cacheKey;
    setTranslationCache((current) => ({ ...current, [cacheKey]: normalized, [legacyKey]: normalized }));
  }

  async function deleteMemo() {
    const activeTranslation = isTranslationForLine(translation, selectedLine) ? translation : null;
    if (selectedLine?.text && (!activeTranslation?.id || activeTranslation.status === "LOCAL_DRAFT")) {
      setTranslation(null);
      removeLocalTranslationDraft(workspace.currentTrack?.id, selectedLine);
      setTranslationCache((current) => {
        const next = { ...current };
        const cacheKey = translationCacheKey(workspace.currentTrack?.id, selectedLine);
        if (cacheKey) delete next[cacheKey];
        if (selectedLine.id != null) delete next[String(selectedLine.id)];
        return next;
      });
      broadcastWorkspaceSync("lyric-memo-deleted");
      setNotice({ kind: "notice", message: "이 기기에 저장한 번역 메모를 지웠다냥." });
      return;
    }
    if (!auth?.userId || !selectedLine?.id || !activeTranslation?.id) {
      setNotice({ kind: "notice", message: "아직 지울 번역 메모가 없다냥." });
      return;
    }
    try {
      await api<void>(`/api/lyric-line-refs/${selectedLine.id}/translations?userId=${auth.userId}&languageCode=ko`, { method: "DELETE" }, auth);
      setTranslation(null);
      removeLocalTranslationDraft(workspace.currentTrack?.id, selectedLine);
      setTranslationCache((current) => {
        const next = { ...current };
        const cacheKey = translationCacheKey(workspace.currentTrack?.id, selectedLine);
        delete next[cacheKey];
        delete next[String(selectedLine.id)];
        return next;
      });
      broadcastWorkspaceSync("lyric-memo-deleted");
      setNotice({ kind: "notice", message: "이 줄의 번역 메모를 지웠다냥." });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function saveCurrentLyricPiece() {
    if (!selectedLine?.text) {
      setNotice({ kind: "notice", message: "아직 저장할 가사 줄이 없다냥." });
      return;
    }

    const activeTranslation = isTranslationForLine(translation, selectedLine) ? translation : null;
    const memoFallback = normalizeMemoText(activeTranslation?.memoText) || normalizeMemoText(window.localStorage.getItem("kurostep.translationMemo")) || "저장한 가사 조각";
    const translatedDraft = activeTranslation?.translatedText || "";
    const serverTranslatedText = translatedDraft || selectedLine.text;
    const savedTranslation = selectedLine.id && auth?.userId
      ? await saveMemoForLine(selectedLine, serverTranslatedText, memoFallback, { showNotice: false })
      : null;
    const translationForPiece = savedTranslation || activeTranslation;

    const piece: SavedLyricPiece = {
      id: `${selectedLine.id || selectedLine.lineIndex || Date.now()}-${Date.now()}`,
      lineRefId: selectedLine.id || null,
      trackId: workspace.currentTrack?.id || null,
      trackTitle: workspace.currentTrack?.title || "작업곡",
      lineText: selectedLine.text,
      translatedText: translationForPiece?.translatedText || translatedDraft,
      memoText: translationForPiece?.memoText || memoFallback,
      savedAt: new Date().toISOString(),
    };

    setSavedLyricPieces((current) => {
      const next = [piece, ...current.filter((item) => item.lineRefId !== piece.lineRefId)].slice(0, 20);
      writeJson("kurostep.savedLyricPieces", next);
      return next;
    });
    window.localStorage.setItem("kurostep.translationMemo", piece.memoText || memoFallback);
    broadcastWorkspaceSync("lyric-piece-saved");
    setNotice({ kind: "notice", message: "현재 가사 조각을 저장했다냥." });
  }

  function deleteSavedLyricPiece(pieceId: string) {
    setSavedLyricPieces((current) => {
      const next = current.filter((piece) => piece.id !== pieceId);
      writeJson("kurostep.savedLyricPieces", next);
      return next;
    });
    broadcastWorkspaceSync("lyric-piece-deleted");
    setNotice({ kind: "notice", message: "저장한 가사 조각을 지웠다냥." });
  }

  async function moveTrack(offset: number, autoplay = isPlaying, wrap = repeatMode === "all") {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace.playlistTracks.length || !currentWorkspace.currentTrack) return;
    const currentIndex = Math.max(
      currentWorkspace.playlistTracks.findIndex((track) => track.playlistTrackId === currentWorkspace.currentTrack?.playlistTrackId),
      0,
    );
    let nextIndex = currentIndex + offset;
    if (nextIndex < 0) {
      nextIndex = wrap ? currentWorkspace.playlistTracks.length - 1 : 0;
    }
    if (nextIndex >= currentWorkspace.playlistTracks.length) {
      nextIndex = wrap ? 0 : currentWorkspace.playlistTracks.length - 1;
    }
    const nextTrack = currentWorkspace.playlistTracks[nextIndex];
    if (!nextTrack || nextTrack.playlistTrackId === currentWorkspace.currentTrack.playlistTrackId) {
      if (!wrap) {
        setIsPlaying(false);
      }
      return;
    }
    await selectTrack(nextTrack);
    setIsPlaying(Boolean(autoplay));
  }

  function skipPlayback(seconds: number) {
    const duration = trackDuration || workspace.currentTrack?.durationSeconds || 0;
    const max = duration > 0 ? Math.max(duration - 1, 0) : 24 * 60 * 60;
    setPlaybackPosition((current) => Math.min(Math.max(current + seconds, 0), max));
    setNotice({ kind: "notice", message: seconds > 0 ? "10초 앞으로 폴짝" : "10초 뒤로 살금" });
  }

  function seekPlayback(seconds: number) {
    const duration = trackDuration || workspace.currentTrack?.durationSeconds || 0;
    const max = duration > 0 ? Math.max(duration - 1, 0) : 24 * 60 * 60;
    setPlaybackPosition(Math.min(Math.max(seconds, 0), max));
  }

  function adjustLyricSync(deltaMs: number) {
    const track = workspace.currentTrack;
    if (!track) return;
    const key = lyricSyncOffsetKey(track);
    setLyricSyncOffsetMs((current) => {
      const next = clampLyricSyncOffset(current + deltaMs);
      if (key) {
        window.localStorage.setItem(key, String(next));
      }
      setNotice({ kind: "notice", message: `가사 싱크 ${formatLyricSyncOffset(next)}으로 맞췄다냥.` });
      return next;
    });
  }

  function syncLyricsToLine(line: SelectedLine) {
    setSelectedLine(line);
    if (!Number.isFinite(line.startTimeMs)) return;

    const track = workspace.currentTrack;
    if (!track) return;

    const key = lyricSyncOffsetKey(track);
    const next = clampLyricSyncOffset(Number(line.startTimeMs) - playbackPosition * 1000 - LYRIC_SYNC_LOOKAHEAD_MS);
    if (key) {
      window.localStorage.setItem(key, String(next));
    }
    setLyricSyncOffsetMs(next);
    setNotice({ kind: "notice", message: `현재 들리는 줄에 맞춰 가사 싱크를 ${formatLyricSyncOffset(next)}으로 저장했다냥.` });
  }

  function resetLyricSync() {
    const key = lyricSyncOffsetKey(workspace.currentTrack);
    if (key) {
      window.localStorage.removeItem(key);
    }
    setLyricSyncOffsetMs(0);
    setNotice({ kind: "notice", message: "가사 싱크 보정을 기본값으로 돌렸다냥." });
  }

  function changeVolume(nextVolume: number) {
    const normalized = Math.min(Math.max(Number(nextVolume) || 0, 0), 100);
    if (normalized > 0) {
      window.localStorage.setItem("kurostep.previousVolume", String(normalized));
    }
    window.localStorage.setItem("kurostep.volume", String(normalized));
    setVolume(normalized);
  }

  const visibleNotice = loading ? { kind: "notice" as const, message: "작업실 불러오는 중이냥" } : notice;
  const introClockGuardSeconds = useMemo(() => getIntroClockGuardSeconds(lyricSource), [lyricSource]);

  if (shellView === "paw" && !auth) {
    return (
      <WidgetShell title="작업 발자국" rightAction="none">
        <PawWaitingScreen />
      </WidgetShell>
    );
  }

  if (!auth) {
    const showAuthNotice = visibleNotice.kind === "error" || busy;
    return (
      <WidgetShell rightAction="exit" onExit={exitApp}>
        {showAuthNotice && <p className={`app-status ${visibleNotice.kind === "error" ? "error" : ""}`} id="app-status">{visibleNotice.message}</p>}
        <AuthScreen busy={busy} onSubmit={handleAuth} />
      </WidgetShell>
    );
  }

  if (settingsOpen) {
    return (
      <SettingsScreen
        auth={auth}
        autoTranslationEnabled={autoTranslationEnabled}
        onBack={() => setSettingsOpen(false)}
        onLogout={logout}
        onExit={exitApp}
        onToggleAutoTranslation={changeAutoTranslationEnabled}
      />
    );
  }

  if (shellView === "paw") {
    return (
      <WidgetShell title="작업 발자국" rightAction="none">
        <TaskPawWidget
          workspace={workspace}
          savedLyricPieces={savedLyricPieces}
          selectedLine={selectedLine}
          translation={activeTranslation}
          onSelectTask={(task) => updateWorkspaceState((current) => ({ ...current, work: task }))}
          onCreateTask={createTask}
          onUpdateStatus={updateStatus}
          onDeleteTask={deleteTask}
          onSaveMemo={saveMemo}
          onDeleteMemo={deleteMemo}
          onDraftMemo={draftMemo}
          onDeletePiece={deleteSavedLyricPiece}
        />
      </WidgetShell>
    );
  }

  return (
    <WidgetShell rightAction="settings" onSettings={() => setSettingsOpen(true)} onExit={exitApp}>
      <p className={`app-status ${visibleNotice.kind === "error" ? "error" : ""}`} id="app-status">{visibleNotice.message}</p>
      <div className="global-widget-controls" aria-label="위젯 열고 닫기">
        <button
          className={`action-button ${pawWidgetVisible ? "primary" : ""}`}
          id="toggle-paw-widget"
          type="button"
          aria-pressed={pawWidgetVisible}
          onClick={() => {
            const next = !pawWidgetVisible;
            requestPawWidgetVisible(next);
            setNotice({ kind: "notice", message: next ? "작업 발자국 창을 펼쳤다냥." : "작업 발자국 창을 접었다냥." });
          }}
        >
          작업 발자국 {pawWidgetVisible ? "ON" : "OFF"}
        </button>
        <button
          className={`action-button ${lyricsOverlayVisible ? "primary" : ""}`}
          id="global-lyrics-toggle"
          type="button"
          aria-pressed={lyricsOverlayVisible}
          onClick={() => {
            const next = !lyricsOverlayVisible;
            requestLyricsOverlayVisible(next);
            setNotice({ kind: "notice", message: next ? "가사 창 띄웠다냥." : "가사 창 접었다냥." });
          }}
        >
          가사 오버레이 {lyricsOverlayVisible ? "ON" : "OFF"}
        </button>
      </div>
      <div className="widget-stack">
        <MusicPlayerWidget
          track={workspace.currentTrack}
          tracks={workspace.playlistTracks}
          playlist={workspace.playlist}
          page={playlistPage}
          isPlaying={isPlaying}
          repeatMode={repeatMode}
          position={playbackPosition}
          duration={trackDuration}
          volume={volume}
          youtubeVisible={youtubeVisible}
          introClockGuardSeconds={introClockGuardSeconds}
          canRegisterLinks={Boolean(auth?.userId) && !loading}
          pendingPlaylistImport={pendingPlaylistImport}
          onTogglePlay={() => {
            if (!workspace.currentTrack) return;
            setIsPlaying((value) => !value);
            setNotice({ kind: "notice", message: isPlaying ? "잠깐 멈춰둘게냥" : "YouTube BGM 재생 중이냥." });
          }}
          onPlayingChange={setIsPlaying}
          onPositionChange={setPlaybackPosition}
          onDurationChange={updateCurrentTrackDuration}
          onVolumeChange={changeVolume}
          onToggleYoutube={() => setYoutubeVisible((value) => !value)}
          onMoveTrack={moveTrack}
          onSkip={skipPlayback}
          onSeek={seekPlayback}
          onToggleRepeat={() => {
            setRepeatMode((value) => {
              const next = nextRepeatMode(value);
              window.localStorage.setItem("kurostep.repeatMode", next);
              setNotice({ kind: "notice", message: repeatModeNotice(next) });
              return next;
            });
          }}
          onSelectTrack={selectTrack}
          onRegisterLink={registerLink}
          onPendingPlaylistCountChange={changePendingPlaylistCount}
          onConfirmPlaylistImport={() => void confirmPlaylistImport()}
          onCancelPlaylistImport={cancelPlaylistImport}
          onRemoveTrack={removeTrack}
          onShuffle={shufflePlaylist}
          onReorderTracks={reorderPlaylist}
          onPage={setPlaylistPage}
        />
        <LyricsWidget
          currentTrack={workspace.currentTrack}
          lyric={lyric}
          lyricSource={lyricSource}
          selectedLine={selectedLine}
          translation={activeTranslation}
          lyricsExpanded={lyricsExpanded}
          lyricSyncOffsetMs={lyricSyncOffsetMs}
          onToggleExpanded={() => setLyricsExpanded((value) => !value)}
          onSelectLine={syncLyricsToLine}
          onSavePiece={saveCurrentLyricPiece}
          onAdjustSync={adjustLyricSync}
          onResetSync={resetLyricSync}
        />
      </div>
      {!isTauriApp && !isEmbeddedContent && pawWidgetVisible && (
        <aside className="detached-widget paw-detached-widget" aria-label="작업 발자국 위젯">
          <TaskPawWidget
            workspace={workspace}
            savedLyricPieces={savedLyricPieces}
            selectedLine={selectedLine}
            translation={activeTranslation}
            onSelectTask={(task) => updateWorkspaceState((current) => ({ ...current, work: task }))}
            onCreateTask={createTask}
            onUpdateStatus={updateStatus}
            onDeleteTask={deleteTask}
            onSaveMemo={saveMemo}
            onDeleteMemo={deleteMemo}
            onDraftMemo={draftMemo}
            onDeletePiece={deleteSavedLyricPiece}
          />
        </aside>
      )}
    </WidgetShell>
  );
}
