export const DEPLOYED_API_BASE_URL = "https://54-116-185-226.sslip.io";
const configuredApiBaseUrl = import.meta.env.VITE_KUROSTEP_API_BASE_URL as string | undefined;

const isGitHubPages = window.location.hostname.endsWith("github.io");
const isTauriApp =
  Boolean((window as Window & { __TAURI__?: unknown }).__TAURI__) ||
  window.location.protocol === "tauri:" ||
  window.location.hostname === "tauri.localhost";

const storedApiBaseUrl = window.localStorage.getItem("kurostep.apiBaseUrl") || "";
const canUseStoredApiBaseUrl =
  Boolean(storedApiBaseUrl) &&
  (!(isGitHubPages || isTauriApp) || storedApiBaseUrl === DEPLOYED_API_BASE_URL);

export const API_BASE_URL =
  (canUseStoredApiBaseUrl ? storedApiBaseUrl : "") ||
  configuredApiBaseUrl ||
  (isGitHubPages || isTauriApp ? DEPLOYED_API_BASE_URL : "http://localhost:8080");

export const API_TIMEOUT_MS = 12000;
export const METADATA_TIMEOUT_MS = 3500;
export const PLAYLIST_PAGE_SIZE = 10;

export type AuthSession = {
  userId: number;
  email: string;
  nickname?: string;
  accessToken: string;
};

export type TaskStatus = "TODO" | "DOING" | "DONE";

export type CreatorTask = {
  id: number;
  title: string;
  description?: string;
  taskDate: string;
  status: TaskStatus;
  playlistId?: number | null;
  currentPlaylistTrackId?: number | null;
};

export type Playlist = {
  id: number;
  name: string;
  description?: string;
};

export type PlaylistTrack = {
  playlistTrackId: number;
  trackId: number;
  title?: string;
  artist?: string;
  durationSeconds?: number;
};

export type Track = {
  id: number;
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
  sourceType: "YOUTUBE" | "SPOTIFY" | "SOUNDCLOUD" | "LOCAL_FILE" | "EXTERNAL_URL";
  sourceUrl?: string;
  sourceId?: string;
  playlistTrackId?: number;
  playlistName?: string;
};

export type TrackCreateDraft = {
  title: string;
  artist?: string;
  album?: string;
  sourceType: Track["sourceType"];
  sourceUrl?: string;
  sourceId?: string;
  durationSeconds?: number;
};

export type YouTubePlaylistPreview = {
  playlistId: string;
  trackCount: number;
  tracks: TrackCreateDraft[];
};

export type LyricRef = {
  id: number;
  lineIndex: number;
  startTimeMs?: number | null;
};

export type Lyric = {
  id: number;
  trackId: number;
  lines?: LyricRef[];
};

export type LyricSourceLine = {
  index: number;
  startTimeMs: number | null;
  text: string;
};

export type LyricSource = {
  localCacheKey?: string;
  lyric?: Lyric | null;
  lines: LyricSourceLine[];
};

export type SelectedLine = {
  id?: number | null;
  lineIndex: number;
  startTimeMs?: number | null;
  text: string;
};

export type Translation = {
  id?: number;
  lyricLineRefId?: number | null;
  status?: string;
  languageCode: string;
  translatedText: string;
  memoText?: string;
};

export type LyricFetchResponse = {
  lyric?: Lyric | null;
  localCacheKey?: string;
  syncedLyrics?: string;
  plainLyrics?: string;
};

type ApiOptions = RequestInit & {
  timeoutMs?: number;
};

export type SavedLyricPiece = {
  id: string;
  lineRefId?: number | null;
  trackId?: number | null;
  trackTitle: string;
  lineText: string;
  translatedText: string;
  memoText: string;
  savedAt: string;
};

export function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function authErrorMessage(error: unknown, mode: "login" | "signup") {
  const message = String((error as Error)?.message || "");
  const lower = message.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "백엔드 서버랑 연결이 안 됐어냥. Spring Boot 서버 켜졌는지 봐줘냥.";
  }
  if (message.includes("401") || message.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return "이메일이나 비밀번호가 안 맞다냥.";
  }
  if (message.includes("409") || message.includes("이미") || lower.includes("duplicate") || lower.includes("exists")) {
    return "이미 가입된 이메일이다냥. 로그인으로 들어와줘냥.";
  }
  if (message.includes("400") || lower.includes("validation")) {
    return mode === "signup" ? "입력한 가입 정보를 다시 확인해줘냥." : "이메일과 비밀번호를 다시 확인해줘냥.";
  }

  return `${mode === "signup" ? "회원가입" : "로그인"}에 실패했다냥: ${message}`;
}

export async function api<T>(path: string, options: ApiOptions = {}, auth?: AuthSession | null): Promise<T> {
  const controller = new AbortController();
  let timeoutId: number | undefined;
  const { timeoutMs = API_TIMEOUT_MS, ...requestOptions } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
    ...(requestOptions.headers || {}),
  };

  try {
    const response = await Promise.race([
      fetch(`${API_BASE_URL}${path}`, {
        ...requestOptions,
        headers,
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort();
          reject(new Error("서버 응답이 너무 늦다냥. 잠깐 뒤 다시 시도해줘냥."));
        }, timeoutMs);
      }),
    ]);
    const text = await response.text();
    const body = text ? safeJson(text) : null;

    if (!response.ok) {
      const message = body?.message || body?.error || text || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return body as T;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("서버 응답이 너무 늦다냥. 잠깐 뒤 다시 시도해줘냥.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
