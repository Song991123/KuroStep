import assert from "node:assert/strict";
import { chooseLineByPlaybackTime } from "../src-react/lib/lyrics.ts";

const API_BASE_URL = process.env.KUROSTEP_QA_API_BASE_URL || "https://54-116-185-226.sslip.io";
const TIMEOUT_MS = Number(process.env.KUROSTEP_QA_TIMEOUT_MS || 20000);

type AuthSession = {
  userId: number;
  email: string;
  nickname?: string;
  accessToken: string;
};

type Track = {
  id: number;
  title: string;
  artist?: string;
  sourceType: string;
  sourceUrl?: string;
  sourceId?: string;
  durationSeconds?: number;
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

type PlaylistTrack = {
  playlistTrackId: number;
  trackId: number;
  title?: string;
  artist?: string;
  sortOrder?: number;
};

type LyricLineRef = {
  id: number;
  lineIndex: number;
  startTimeMs?: number | null;
};

type LyricFetchResponse = {
  lyric?: {
    id: number;
    trackId: number;
    synced: boolean;
    lines?: LyricLineRef[];
  } | null;
  localCacheKey?: string;
  plainLyrics?: string;
  syncedLyrics?: string;
};

type SyncedLyricLine = {
  index: number;
  startTimeMs: number;
  text: string;
};

type Translation = {
  id?: number;
  lyricLineRefId?: number | null;
  languageCode: string;
  translatedText: string;
  memoText?: string;
  status?: string;
  provider?: string;
};

const samples = [
  {
    title: "LEMONADE",
    artist: "aespa",
    sourceUrl: "https://youtu.be/83C3TZ4Zm_o",
    sourceId: "83C3TZ4Zm_o",
    durationSeconds: 186,
  },
  {
    title: "REDRED",
    artist: "CORTIS",
    sourceUrl: "https://youtu.be/U6BDbXIah-Y",
    sourceId: "U6BDbXIah-Y",
    durationSeconds: 180,
  },
  {
    title: "LOVE ATTACK",
    artist: "RESCENE",
    sourceUrl: "https://youtu.be/9XttLI0oH0I",
    sourceId: "9XttLI0oH0I",
    durationSeconds: 182,
  },
  {
    title: "Dirty Work",
    artist: "aespa",
    sourceUrl: "https://youtu.be/M2WTUoy4y6E",
    sourceId: "M2WTUoy4y6E",
    durationSeconds: 180,
  },
];

function todayIso() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
    const body = text ? safeJson(text) : null;
    if (!response.ok) {
      const message = typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : text || `HTTP ${response.status}`;
      throw new Error(`${response.status} ${message}`);
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function hasHangul(text: string) {
  return /[가-힣]/.test(text);
}

function isUsefulKoreanTranslation(sourceText: string, translatedText: string) {
  const source = sourceText.trim().toLowerCase();
  const translated = translatedText.trim().toLowerCase();
  return hasHangul(translatedText) && translated !== source && translated.length > 0;
}

function parseSyncedLyrics(raw: string): SyncedLyricLine[] {
  return raw
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/);
      if (!match) return null;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const millis = match[3] ? Number(match[3].padEnd(3, "0").slice(0, 3)) : 0;
      const text = match[4].trim();
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !text) return null;
      return {
        index,
        startTimeMs: minutes * 60_000 + seconds * 1000 + millis,
        text,
      };
    })
    .filter((line): line is SyncedLyricLine => Boolean(line));
}

function assertStrictlySortedTimedLines(title: string, lines: Array<{ startTimeMs?: number | null }>) {
  let previous = -1;
  for (const [index, line] of lines.entries()) {
    assert.equal(typeof line.startTimeMs, "number", `${title} line ${index} must include a numeric start time`);
    const current = Number(line.startTimeMs);
    assert.ok(current >= previous, `${title} lyric timestamps must be sorted: ${previous} -> ${current}`);
    previous = current;
  }
}

async function main() {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const email = `codex-live-${runId}@kurostep.qa`;
  const password = `KuroStep-${runId}`;
  const nickname = `코덱스QA-${runId.slice(-6)}`;
  const date = todayIso();

  const auth = await api<AuthSession>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, nickname }),
  });
  assert.equal(typeof auth.accessToken, "string", "signup must return an access token");
  assert.ok(auth.userId > 0, "signup must return a user id");

  const me = await api<AuthSession>("/api/auth/me", {}, auth);
  assert.equal(me.userId, auth.userId, "token must resolve to the same user");

  const task = await api<CreatorTask>(`/api/tasks?userId=${auth.userId}`, {
    method: "POST",
    body: JSON.stringify({
      title: "라이브 QA 작업 발자국",
      description: "마우스 없이 API로 생성한 0.1 QA 작업",
      taskDate: date,
    }),
  }, auth);
  assert.equal(task.taskDate, date, "created task must be dated today");

  const playlist = await api<Playlist>(`/api/playlists?userId=${auth.userId}`, {
    method: "POST",
    body: JSON.stringify({
      name: "한국곡 라이브 QA",
      description: "KuroStep API smoke test playlist",
    }),
  }, auth);
  assert.ok(playlist.id > 0, "playlist must be created");

  const tracks: Track[] = [];
  for (const sample of samples) {
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
    assert.equal(track.title, sample.title, `${sample.title} track title must round-trip`);
    assert.equal(track.artist, sample.artist, `${sample.title} artist must round-trip`);
    tracks.push(track);
  }

  const playlistTracks: PlaylistTrack[] = [];
  for (const track of tracks) {
    playlistTracks.push(await api<PlaylistTrack>(
      `/api/playlists/${playlist.id}/tracks/${track.id}?userId=${auth.userId}`,
      { method: "POST" },
      auth,
    ));
  }
  assert.equal(playlistTracks.length, samples.length, "all sample tracks must be added to the playlist");

  const connectedTask = await api<CreatorTask>(
    `/api/tasks/${task.id}/playlist/${playlist.id}?userId=${auth.userId}`,
    { method: "PATCH" },
    auth,
  );
  assert.equal(connectedTask.playlistId, playlist.id, "task must connect to playlist immediately");

  const currentTrack = playlistTracks[0];
  const currentTask = await api<CreatorTask>(
    `/api/tasks/${task.id}/current-playlist-track/${currentTrack.playlistTrackId}?userId=${auth.userId}`,
    { method: "PATCH" },
    auth,
  );
  assert.equal(
    currentTask.currentPlaylistTrackId,
    currentTrack.playlistTrackId,
    "current playlist track must be saved immediately",
  );

  const reordered = await api<PlaylistTrack[]>(
    `/api/playlists/${playlist.id}/tracks/reorder?userId=${auth.userId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        playlistTrackIds: playlistTracks.map((track) => track.playlistTrackId).reverse(),
      }),
    },
    auth,
  );
  assert.equal(reordered.length, playlistTracks.length, "reorder must keep the same playlist track count");
  assert.deepEqual(
    reordered.map((track) => track.playlistTrackId),
    playlistTracks.map((track) => track.playlistTrackId).reverse(),
    "reorder must preserve the requested playlist order",
  );

  const secondTrack = playlistTracks[1];
  assert.ok(secondTrack, "playlist transition QA requires a second track");
  const switchedTask = await api<CreatorTask>(
    `/api/tasks/${task.id}/current-playlist-track/${secondTrack.playlistTrackId}?userId=${auth.userId}`,
    { method: "PATCH" },
    auth,
  );
  assert.equal(
    switchedTask.currentPlaylistTrackId,
    secondTrack.playlistTrackId,
    "current track transition must persist immediately",
  );

  const replacementTrack = playlistTracks[0];
  const replacedBeforeRemoval = await api<CreatorTask>(
    `/api/tasks/${task.id}/current-playlist-track/${replacementTrack.playlistTrackId}?userId=${auth.userId}`,
    { method: "PATCH" },
    auth,
  );
  assert.equal(
    replacedBeforeRemoval.currentPlaylistTrackId,
    replacementTrack.playlistTrackId,
    "app-style removal flow must save a replacement current track before removing the old current item",
  );
  await api<void>(
    `/api/playlists/${playlist.id}/tracks/${secondTrack.trackId}?userId=${auth.userId}`,
    { method: "DELETE" },
    auth,
  );
  const afterRemoval = await api<PlaylistTrack[]>(
    `/api/playlists/${playlist.id}/tracks?userId=${auth.userId}`,
    {},
    auth,
  );
  assert.equal(afterRemoval.some((track) => track.trackId === secondTrack.trackId), false, "removed playlist item must disappear immediately");
  assert.equal(afterRemoval.some((track) => track.playlistTrackId === replacementTrack.playlistTrackId), true, "replacement current track must remain in the playlist");
  assert.equal(afterRemoval.length, samples.length - 1, "playlist removal should only remove the selected item");
  const taskAfterRemoval = await api<CreatorTask>(
    `/api/tasks/${task.id}?userId=${auth.userId}`,
    {},
    auth,
  );
  assert.equal(
    taskAfterRemoval.currentPlaylistTrackId,
    replacementTrack.playlistTrackId,
    "current track must still point at the replacement after removing another playlist item",
  );

  const lyricResults: Array<{
    title: string;
    lineCount: number;
    synced: boolean;
    firstStartTimeMs: number | null;
    syncedLyricsLength: number;
    sampledLine?: string;
    sampledStartTimeMs?: number;
    selectedStartTimeMs?: number | null;
  }> = [];
  let manualLineRef: LyricLineRef | null = null;
  let autoLineRef: LyricLineRef | null = null;

  for (const track of tracks) {
    const fetched = await api<LyricFetchResponse>(
      `/api/tracks/${track.id}/lyrics/fetch`,
      { method: "POST" },
      auth,
    );
    const lines = fetched.lyric?.lines || [];
    const sourceLines = parseSyncedLyrics(fetched.syncedLyrics || "");
    assert.ok(fetched.lyric, `${track.title} must return a lyric entity`);
    assert.equal(fetched.lyric?.synced, true, `${track.title} must return synced lyrics`);
    assert.ok(lines.length >= 3, `${track.title} must create multiple lyric line refs`);
    assert.ok(sourceLines.length >= 3, `${track.title} must parse multiple synced lyric text lines`);
    assert.ok(
      Math.abs(sourceLines.length - lines.length) <= 1,
      `${track.title} synced text lines and saved refs should stay aligned`,
    );
    assert.ok((fetched.syncedLyrics || "").length > 20, `${track.title} must include synced lyric text`);
    assert.ok(
      lines.some((line) => typeof line.startTimeMs === "number" && line.startTimeMs >= 0),
      `${track.title} must include timed line refs`,
    );
    assertStrictlySortedTimedLines(track.title, lines);
    assertStrictlySortedTimedLines(`${track.title} source`, sourceLines);

    const firstSourceLine = sourceLines[0];
    if (firstSourceLine.startTimeMs > 300) {
      const earlyLine = chooseLineByPlaybackTime(
        { id: fetched.lyric!.id, trackId: track.id, synced: true, lines },
        { source: "LRCLIB", synced: true, lines: sourceLines },
        (firstSourceLine.startTimeMs - 250) / 1000,
      );
      assert.equal(earlyLine, null, `${track.title} must not show a lyric before the first timed line`);
    }

    const middleSourceLine = sourceLines[Math.floor(sourceLines.length / 2)];
    const selectedMiddleLine = chooseLineByPlaybackTime(
      { id: fetched.lyric!.id, trackId: track.id, synced: true, lines },
      { source: "LRCLIB", synced: true, lines: sourceLines },
      middleSourceLine.startTimeMs / 1000,
    );
    assert.equal(
      selectedMiddleLine?.text,
      middleSourceLine.text,
      `${track.title} synced lookup should select the lyric line for the current playback time`,
    );
    assert.ok(selectedMiddleLine, `${track.title} synced lookup should return a selected line`);
    assert.ok(
      Math.abs(Number(selectedMiddleLine.startTimeMs) - middleSourceLine.startTimeMs) <= 1,
      `${track.title} selected lyric timestamp must match the source timestamp: selected=${selectedMiddleLine.startTimeMs}, source=${middleSourceLine.startTimeMs}`,
    );

    for (const line of lines) {
      if (typeof line.id !== "number") continue;
      manualLineRef ||= line;
      if (manualLineRef?.id !== line.id) {
        autoLineRef ||= line;
      }
      if (manualLineRef && autoLineRef) break;
    }
    lyricResults.push({
      title: track.title,
      lineCount: lines.length,
      synced: Boolean(fetched.lyric?.synced),
      firstStartTimeMs: lines[0]?.startTimeMs ?? null,
      syncedLyricsLength: (fetched.syncedLyrics || "").length,
      sampledLine: middleSourceLine.text,
      sampledStartTimeMs: middleSourceLine.startTimeMs,
      selectedStartTimeMs: selectedMiddleLine.startTimeMs ?? null,
    });
  }

  assert.ok(manualLineRef?.id, "at least one synced line ref must be available for memo QA");
  assert.ok(autoLineRef?.id, "a separate synced line ref must be available for auto-translation QA");

  const manual = await api<Translation>(
    `/api/lyric-line-refs/${manualLineRef.id}/translations?userId=${auth.userId}`,
    {
      method: "POST",
      body: JSON.stringify({
        languageCode: "ko",
        translatedText: "QA 저장 번역",
        memoText: "QA 메모 저장 확인",
      }),
    },
    auth,
  );
  assert.equal(manual.translatedText, "QA 저장 번역", "manual translation text must be saved");
  assert.equal(manual.memoText, "QA 메모 저장 확인", "manual memo text must be saved");

  const saved = await api<Translation[]>(
    `/api/lyric-line-refs/${manualLineRef.id}/translations?userId=${auth.userId}`,
    {},
    auth,
  );
  assert.ok(
    saved.some((translation) => translation.translatedText === "QA 저장 번역" && translation.memoText === "QA 메모 저장 확인"),
    "saved manual memo must be readable without flicker-prone empty replacement",
  );

  const autoSourceText = "You should come";
  const autoDraft = await api<Translation>(
    `/api/lyric-line-refs/${autoLineRef.id}/translations/auto-draft?userId=${auth.userId}`,
    {
      method: "POST",
      body: JSON.stringify({
        sourceText: autoSourceText,
        sourceLanguageCode: "en",
        targetLanguageCode: "ko",
        memoText: "자동 번역 품질 QA",
      }),
    },
    auth,
  ).then((translation) => ({
    ...translation,
    accepted: true,
  }));

  assert.ok(
    isUsefulKoreanTranslation(autoSourceText, autoDraft.translatedText),
    `auto translation must be Korean and not source echo: ${autoDraft.translatedText}`,
  );
  assert.notEqual(autoDraft.provider, "MANUAL", "auto translation QA must not be satisfied by a previously saved manual memo");
  assert.notEqual(autoDraft.translatedText.trim(), "필수", "MyMemory fallback must not choose a misleading partial-segment translation");

  const summary = {
    ok: true,
    apiBaseUrl: API_BASE_URL,
    qaUserId: auth.userId,
    taskId: task.id,
    playlistId: playlist.id,
    currentPlaylistTrackId: taskAfterRemoval.currentPlaylistTrackId,
    playlistTransition: {
      initialCurrentPlaylistTrackId: currentTask.currentPlaylistTrackId,
      switchedCurrentPlaylistTrackId: switchedTask.currentPlaylistTrackId,
      replacementCurrentPlaylistTrackId: taskAfterRemoval.currentPlaylistTrackId,
      remainingTrackCount: afterRemoval.length,
    },
    tracks: tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
    })),
    lyrics: lyricResults,
    manualMemo: {
      lineRefId: manualLineRef.id,
      saved: true,
    },
    autoTranslation: autoDraft,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("qa:korean-live failed");
  console.error(error);
  process.exitCode = 1;
});
