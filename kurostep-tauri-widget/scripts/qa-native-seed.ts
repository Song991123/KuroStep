import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API_BASE_URL = process.env.KUROSTEP_QA_API_BASE_URL || "https://54-116-185-226.sslip.io";
const TIMEOUT_MS = Number(process.env.KUROSTEP_QA_TIMEOUT_MS || 20000);
const WEBKIT_BUNDLE_ID = process.env.KUROSTEP_WEBKIT_BUNDLE_ID || "com.song991123.kurostep";

type AuthSession = {
  userId: number;
  email: string;
  nickname?: string;
  accessToken: string;
};

type CreatorTask = {
  id: number;
  title: string;
  taskDate: string;
  playlistId?: number | null;
  currentPlaylistTrackId?: number | null;
};

type Playlist = {
  id: number;
  name: string;
};

type Track = {
  id: number;
  title: string;
  artist?: string;
};

type PlaylistTrack = {
  playlistTrackId: number;
  trackId: number;
  title?: string;
  artist?: string;
};

type LyricFetchResponse = {
  lyric?: {
    id: number;
    trackId: number;
    synced: boolean;
    lines?: Array<{ id?: number; lineIndex: number; startTimeMs?: number | null }>;
  } | null;
  syncedLyrics?: string;
};

const sample = {
  title: "LEMONADE",
  artist: "aespa",
  sourceUrl: "https://youtu.be/83C3TZ4Zm_o",
  sourceId: "83C3TZ4Zm_o",
  durationSeconds: 186,
};

function todayIso() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

async function api<T>(path: string, options: RequestInit = {}, auth?: AuthSession): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (auth?.accessToken) headers.set("Authorization", `Bearer ${auth.accessToken}`);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${response.status} ${text || response.statusText}`);
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

function webkitLocalStorageDb() {
  const root = join(homedir(), "Library/WebKit", WEBKIT_BUNDLE_ID, "WebsiteData/Default");
  assert.ok(existsSync(root), `${root} does not exist. Launch the installed app once before seeding QA state.`);

  for (const originPath of findFiles(root, "origin")) {
    const origin = readFileSync(originPath, "latin1");
    if (!origin.includes("tauri") || !origin.includes("localhost")) continue;
    const dbPath = join(originPath.slice(0, -"origin".length), "LocalStorage/localstorage.sqlite3");
    if (existsSync(dbPath)) {
      return dbPath;
    }
  }

  throw new Error(`Could not find tauri://localhost LocalStorage DB under ${root}`);
}

function safeReadDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function findFiles(root: string, fileName: string, depth = 0): string[] {
  if (depth > 6) return [];
  const matches: string[] = [];
  for (const entry of safeReadDir(root)) {
    const path = join(root, entry);
    let isDirectory = false;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) {
      matches.push(...findFiles(path, fileName, depth + 1));
    } else if (entry === fileName) {
      matches.push(path);
    }
  }
  return matches;
}

function insertUtf16Value(dbPath: string, key: string, value: string) {
  const hex = Buffer.from(value, "utf16le").toString("hex");
  execFileSync("sqlite3", [
    dbPath,
    `insert or replace into ItemTable(key,value) values('${key.replaceAll("'", "''")}', x'${hex}')`,
  ]);
}

async function main() {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const date = todayIso();
  const auth = await api<AuthSession>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: `codex-native-${runId}@kurostep.qa`,
      password: `KuroStep-${runId}`,
      nickname: `네이티브QA-${runId.slice(-6)}`,
    }),
  });
  assert.ok(auth.accessToken, "signup must return an access token");

  const task = await api<CreatorTask>(`/api/tasks?userId=${auth.userId}`, {
    method: "POST",
    body: JSON.stringify({
      title: "설치 앱 네이티브 QA",
      description: "native status lyric context 검증용",
      taskDate: date,
    }),
  }, auth);
  const playlist = await api<Playlist>(`/api/playlists?userId=${auth.userId}`, {
    method: "POST",
    body: JSON.stringify({
      name: "설치 앱 한국곡 QA",
      description: "native status lyric context",
    }),
  }, auth);
  const track = await api<Track>("/api/tracks", {
    method: "POST",
    body: JSON.stringify({
      title: sample.title,
      artist: sample.artist,
      sourceType: "YOUTUBE",
      sourceUrl: sample.sourceUrl,
      sourceId: sample.sourceId,
      durationSeconds: sample.durationSeconds,
    }),
  }, auth);
  const playlistTrack = await api<PlaylistTrack>(
    `/api/playlists/${playlist.id}/tracks/${track.id}?userId=${auth.userId}`,
    { method: "POST" },
    auth,
  );
  await api<CreatorTask>(`/api/tasks/${task.id}/playlist/${playlist.id}?userId=${auth.userId}`, { method: "PATCH" }, auth);
  await api<CreatorTask>(
    `/api/tasks/${task.id}/current-playlist-track/${playlistTrack.playlistTrackId}?userId=${auth.userId}`,
    { method: "PATCH" },
    auth,
  );
  const fetched = await api<LyricFetchResponse>(
    `/api/tracks/${track.id}/lyrics/fetch`,
    { method: "POST" },
    auth,
  );
  assert.equal(fetched.lyric?.synced, true, "native QA seed track should have synced lyrics");
  const firstLine = fetched.lyric?.lines?.[0] || null;

  const dbPath = webkitLocalStorageDb();
  insertUtf16Value(dbPath, "kurostep.auth", JSON.stringify(auth));
  insertUtf16Value(dbPath, "kurostep.pawWidgetVisible", "true");
  insertUtf16Value(dbPath, "kurostep.lyricsOverlayVisible", "true");
  insertUtf16Value(dbPath, "kurostep.autoTranslationEnabled", "true");
  insertUtf16Value(dbPath, "kurostep.currentLyricContext", JSON.stringify({
    trackId: track.id,
    line: firstLine ? { ...firstLine, text: "♫" } : null,
    translation: null,
    at: Date.now(),
  }));

  console.log(JSON.stringify({
    ok: true,
    apiBaseUrl: API_BASE_URL,
    webkitLocalStorageDb: dbPath,
    auth: {
      userId: auth.userId,
      email: auth.email,
      nickname: auth.nickname,
    },
    task,
    playlist,
    track,
    playlistTrack,
    seededKeys: [
      "kurostep.auth",
      "kurostep.pawWidgetVisible",
      "kurostep.lyricsOverlayVisible",
      "kurostep.autoTranslationEnabled",
      "kurostep.currentLyricContext",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error("qa:native-seed failed");
  console.error(error);
  process.exitCode = 1;
});
