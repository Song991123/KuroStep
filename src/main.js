const API_BASE_URL = window.localStorage.getItem("kurostep.apiBaseUrl") || "http://localhost:8080";
const DEMO_ACCOUNT = {
  email: "tauri-demo@kurostep.local",
  password: "1234",
  nickname: "Tauri Demo",
};
const DEMO_TRACK = {
  title: "Never Gonna Give You Up",
  artist: "Rick Astley",
  album: "Rick Astley",
  sourceType: "YOUTUBE",
  sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  sourceId: "dQw4w9WgXcQ",
  durationSeconds: 214,
};
const YOUTUBE_APP_ORIGIN = "https://dev.local.kurostep-widget";

const appState = {
  auth: readJson("kurostep.auth"),
  loading: true,
  error: "",
  notice: "",
  isPlaying: false,
  repeatMode: false,
  playbackPositionSeconds: 0,
  lyricsOverlayVisible: false,
  work: null,
  counts: { TODO: 0, DOING: 0, DONE: 0 },
  playlist: null,
  playlistTracks: [],
  currentTrack: null,
  lyric: null,
  lyricSource: null,
  selectedLine: null,
  translation: null,
  linkSaving: false,
};

let playbackTimer = null;
let youtubeApiPromise = null;
let youtubePlayer = null;
let youtubePlayerReady = false;
let youtubePlayerVideoId = "";

function getYoutubeVideoId(track = appState.currentTrack) {
  return track?.sourceId || extractYoutubeId(track?.sourceUrl || "");
}

function isYoutubeTrack(track = appState.currentTrack) {
  return Boolean(getYoutubeVideoId(track));
}

function loadYoutubeIframeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("YouTube 플레이어 API를 불러오지 못했어요."));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

async function ensureYoutubePlayer() {
  const videoId = getYoutubeVideoId();
  const playerRoot = document.querySelector("#youtube-player");
  if (!videoId || !playerRoot) {
    throw new Error("앱 안에서 재생할 YouTube 영상 정보를 찾지 못했어요.");
  }

  const YT = await loadYoutubeIframeApi();
  if (youtubePlayer && youtubePlayerReady && youtubePlayerVideoId === videoId) {
    return youtubePlayer;
  }

  if (youtubePlayer && youtubePlayerReady) {
    youtubePlayerVideoId = videoId;
    youtubePlayer.cueVideoById({ videoId, startSeconds: appState.playbackPositionSeconds || 0 });
    return youtubePlayer;
  }

  youtubePlayerReady = false;
  youtubePlayerVideoId = videoId;

  youtubePlayer = new YT.Player("youtube-player", {
    videoId,
    playerVars: {
      playsinline: 1,
      rel: 0,
      enablejsapi: 1,
      origin: YOUTUBE_APP_ORIGIN,
      widget_referrer: YOUTUBE_APP_ORIGIN,
    },
    events: {
      onReady: (event) => {
        youtubePlayerReady = true;
        const duration = Math.floor(event.target.getDuration?.() || 0);
        if (appState.currentTrack && duration > 0) {
          appState.currentTrack.durationSeconds = duration;
          updatePlaybackDom();
        }
      },
      onStateChange: (event) => {
        if (!window.YT) return;
        if (event.data === window.YT.PlayerState.PLAYING) {
          appState.isPlaying = true;
          syncPlaybackTimer();
          updatePlaybackDom();
          return;
        }
        if (event.data === window.YT.PlayerState.PAUSED) {
          appState.isPlaying = false;
          syncPlaybackTimer();
          updatePlaybackDom();
          return;
        }
        if (event.data === window.YT.PlayerState.ENDED) {
          handlePlaybackEnded();
        }
      },
      onError: () => {
        appState.isPlaying = false;
        appState.error =
          "YouTube 플레이어가 앱 안에서 시작되지 않았어요. Tauri WebView의 Referer 제한이면 Error 153이 날 수 있어요.";
        syncPlaybackTimer();
        updatePlaybackDom();
      },
    },
  });

  return youtubePlayer;
}

async function playCurrentAudio() {
  if (!isYoutubeTrack()) {
    throw new Error("현재 곡은 YouTube 링크가 아니라 앱 안 재생을 시작할 수 없어요.");
  }

  const player = await ensureYoutubePlayer();
  if (!youtubePlayerReady) {
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  player.seekTo?.(appState.playbackPositionSeconds || 0, true);
  player.playVideo?.();
  appState.notice = "앱 안에서 YouTube BGM을 재생하고 있어요냥.";
}

function pauseCurrentAudio() {
  youtubePlayer?.pauseVideo?.();
}

function handlePlaybackEnded() {
  if (appState.repeatMode) {
    appState.playbackPositionSeconds = 0;
    youtubePlayer?.seekTo?.(0, true);
    youtubePlayer?.playVideo?.();
    return;
  }
  movePlaylistTrack(1);
}

function readJson(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "--:--";
  }
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatTimestamp(ms) {
  if (!Number.isFinite(ms)) {
    return "--:--";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function iconSvg(name) {
  const icons = {
    previous: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6v12"/><path d="m19 6-9 6 9 6z"/></svg>`,
    rewind: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 19 2 12l9-7v14z"/><path d="M22 19 13 12l9-7v14z"/></svg>`,
    play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14"/><path d="M16 5v14"/></svg>`,
    forward: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 5 9 7-9 7V5z"/><path d="m2 5 9 7-9 7V5z"/></svg>`,
    next: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 6 9 6-9 6z"/><path d="M18 6v12"/></svg>`,
    repeat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>`,
  };
  return icons[name] || "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(appState.auth?.accessToken ? { Authorization: `Bearer ${appState.auth.accessToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const body = text ? safeJson(text) : null;

  if (!response.ok) {
    const message = body?.message || body?.error || text || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function ensureAuth() {
  if (appState.auth?.accessToken) {
    try {
      const me = await api("/api/auth/me");
      appState.auth = { ...me, accessToken: appState.auth.accessToken };
      writeJson("kurostep.auth", appState.auth);
      return;
    } catch {
      window.localStorage.removeItem("kurostep.auth");
      appState.auth = null;
    }
  }

  try {
    appState.auth = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password }),
    });
  } catch {
    appState.auth = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(DEMO_ACCOUNT),
    });
  }

  writeJson("kurostep.auth", appState.auth);
}

async function loadDashboard() {
  appState.loading = true;
  appState.error = "";
  render();

  try {
    await ensureAuth();
    await ensureDemoData();
    appState.notice = "서버랑 발맞춰 걷는 중이에요";
  } catch (error) {
    appState.error = `${error.message} · Spring Boot 서버가 http://localhost:8080 에서 실행 중인지 확인해줘.`;
  } finally {
    appState.loading = false;
    render();
  }
}

async function ensureDemoData() {
  const userId = appState.auth.userId;
  let tasks = await api(`/api/tasks/today?userId=${userId}`);
  if (tasks.length === 0) {
    await api(`/api/tasks?userId=${userId}`, {
      method: "POST",
      body: JSON.stringify({
        title: "오늘의 작업 발자국 정리",
        description: "작업 카드와 BGM, 가사 라인, 번역 메모를 한곳에 모아요.",
        taskDate: todayIso(),
      }),
    });
    tasks = await api(`/api/tasks/today?userId=${userId}`);
  }

  appState.counts = countTaskStatuses(tasks);
  appState.work = tasks.find((task) => task.status === "DOING") || tasks[0];

  let playlists = await api(`/api/playlists?userId=${userId}`);
  if (playlists.length === 0) {
    await api(`/api/playlists?userId=${userId}`, {
      method: "POST",
      body: JSON.stringify({
        name: "KuroStep Demo Mix",
        description: "작업 카드에 살짝 얹어둘 플레이리스트",
      }),
    });
    playlists = await api(`/api/playlists?userId=${userId}`);
  }
  appState.playlist = playlists[0];

  const track = await findOrCreateDemoTrack();
  await ensurePlaylistTrack(userId, appState.playlist.id, track.id);
  appState.playlistTracks = await api(`/api/playlists/${appState.playlist.id}/tracks?userId=${userId}`);
  const currentPlaylistTrack = appState.playlistTracks[0];
  appState.currentTrack = {
    ...track,
    playlistTrackId: currentPlaylistTrack?.playlistTrackId,
    playlistName: appState.playlist.name,
  };

  if (appState.work.playlistId !== appState.playlist.id) {
    appState.work = await api(`/api/tasks/${appState.work.id}/playlist/${appState.playlist.id}?userId=${userId}`, {
      method: "PATCH",
    });
  }
  if (currentPlaylistTrack && appState.work.currentPlaylistTrackId !== currentPlaylistTrack.playlistTrackId) {
    appState.work = await api(
      `/api/tasks/${appState.work.id}/current-playlist-track/${currentPlaylistTrack.playlistTrackId}?userId=${userId}`,
      { method: "PATCH" },
    );
  }

  await ensureLyricAndTranslation(userId, track.id);
}

function countTaskStatuses(tasks) {
  return tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    { TODO: 0, DOING: 0, DONE: 0 },
  );
}

async function findOrCreateDemoTrack() {
  return findOrCreateTrack(DEMO_TRACK);
}

async function findOrCreateTrack(trackDraft) {
  const results = await api(`/api/tracks/search?keyword=${encodeURIComponent(trackDraft.title)}`);
  const existing = results.find(
    (track) =>
      track.sourceType === trackDraft.sourceType &&
      ((trackDraft.sourceId && track.sourceId === trackDraft.sourceId) || track.sourceUrl === trackDraft.sourceUrl),
  );
  if (existing) {
    return existing;
  }

  return api("/api/tracks", {
    method: "POST",
    body: JSON.stringify(trackDraft),
  });
}

function extractYoutubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }
    return parsed.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

async function registerTrackFromInputs() {
  const titleInput = document.querySelector("#track-title-input");
  const artistInput = document.querySelector("#track-artist-input");
  const urlInput = document.querySelector("#track-url-input");
  const title = titleInput?.value.trim();
  const artist = artistInput?.value.trim();
  const sourceUrl = urlInput?.value.trim();

  if (!title || !artist || !sourceUrl) {
    appState.error = "곡 제목, 아티스트, YouTube 링크를 모두 적어줘냥.";
    render();
    return;
  }

  const sourceId = extractYoutubeId(sourceUrl);
  if (!sourceId) {
    appState.error = "이 링크에서는 YouTube 영상 ID를 못 찾았어요.";
    render();
    return;
  }

  appState.linkSaving = true;
  appState.error = "";
  appState.notice = "YouTube 링크를 작업 바구니에 담는 중이에요...";
  render();

  try {
    await ensureAuth();
    if (!appState.work || !appState.playlist) {
      await ensureDemoData();
    }

    const userId = appState.auth.userId;
    const track = await findOrCreateTrack({
      title,
      artist,
      album: artist,
      sourceType: "YOUTUBE",
      sourceUrl,
      sourceId,
      durationSeconds: null,
    });

    await ensurePlaylistTrack(userId, appState.playlist.id, track.id);
    appState.playlistTracks = await api(`/api/playlists/${appState.playlist.id}/tracks?userId=${userId}`);
    const currentPlaylistTrack =
      appState.playlistTracks.find((playlistTrack) => playlistTrack.trackId === track.id) || appState.playlistTracks.at(-1);

    appState.currentTrack = {
      ...track,
      playlistTrackId: currentPlaylistTrack?.playlistTrackId,
      playlistName: appState.playlist.name,
    };

    if (appState.work.playlistId !== appState.playlist.id) {
      appState.work = await api(`/api/tasks/${appState.work.id}/playlist/${appState.playlist.id}?userId=${userId}`, {
        method: "PATCH",
      });
    }
    if (currentPlaylistTrack) {
      appState.work = await api(
        `/api/tasks/${appState.work.id}/current-playlist-track/${currentPlaylistTrack.playlistTrackId}?userId=${userId}`,
        { method: "PATCH" },
      );
    }

    await ensureLyricAndTranslation(userId, track.id);
    appState.notice = "링크, 플레이리스트, 가사까지 착착 묶었어요냥";
  } catch (error) {
    appState.error = error.message;
  } finally {
    appState.linkSaving = false;
    render();
  }
}

async function ensurePlaylistTrack(userId, playlistId, trackId) {
  const tracks = await api(`/api/playlists/${playlistId}/tracks?userId=${userId}`);
  if (tracks.some((track) => track.trackId === trackId)) {
    return;
  }

  try {
    await api(`/api/playlists/${playlistId}/tracks/${trackId}?userId=${userId}`, { method: "POST" });
  } catch (error) {
    if (!String(error.message).includes("이미")) {
      throw error;
    }
  }
}

async function ensureLyricAndTranslation(userId, trackId) {
  const cacheKey = `kurostep.lyrics.${trackId}`;
  let lyricSource = readJson(cacheKey);
  let fetchResponse = null;

  if (!lyricSource?.lines?.length) {
    fetchResponse = await api(`/api/tracks/${trackId}/lyrics/fetch`, { method: "POST" });
    lyricSource = parseLyricSource(fetchResponse);
    writeJson(cacheKey, lyricSource);
  }

  appState.lyric = fetchResponse?.lyric || (await getLatestLyric(trackId));
  appState.lyricSource = lyricSource;
  appState.selectedLine = chooseDisplayLine(appState.lyric, lyricSource);
  appState.playbackPositionSeconds = Number.isFinite(appState.selectedLine?.startTimeMs)
    ? Math.floor(appState.selectedLine.startTimeMs / 1000)
    : 0;

  await ensureSelectedLineTranslation(userId);
}

async function ensureSelectedLineTranslation(userId) {
  if (!appState.selectedLine?.text) {
    return;
  }

  appState.translation = await api(
    `/api/lyric-line-refs/${appState.selectedLine.id}/translations/auto-draft?userId=${userId}`,
    {
      method: "POST",
      body: JSON.stringify({
        sourceText: appState.selectedLine.text,
        sourceLanguageCode: "en",
        targetLanguageCode: "ko",
        memoText: readMemoFallback(),
      }),
    },
  );
}

async function getLatestLyric(trackId) {
  const lyrics = await api(`/api/tracks/${trackId}/lyrics`);
  return lyrics.at(-1) || null;
}

function parseLyricSource(fetchResponse) {
  const source = fetchResponse.syncedLyrics || fetchResponse.plainLyrics || "";
  const lines = source
    .split("\n")
    .map((line, index) => parseLyricLine(line, index))
    .filter((line) => line.text);

  return {
    localCacheKey: fetchResponse.localCacheKey,
    lines,
  };
}

function parseLyricLine(line, index) {
  const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2}))?\]\s*(.*)$/);
  if (!match) {
    return { index, startTimeMs: null, text: line.trim() };
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const centiseconds = Number(match[3] || 0);
  return {
    index,
    startTimeMs: (minutes * 60 + seconds) * 1000 + centiseconds * 10,
    text: match[4].trim(),
  };
}

function chooseDisplayLine(lyric, source) {
  const refs = lyric?.lines || [];
  const sourceLines = source?.lines || [];
  const ref = refs.find((line) => Number.isFinite(line.startTimeMs)) || refs[0];
  if (!ref) {
    return null;
  }

  const sourceLine = sourceLines.find((line) => line.index === ref.lineIndex) || sourceLines[0];
  return {
    id: ref.id,
    lineIndex: ref.lineIndex,
    startTimeMs: ref.startTimeMs,
    text: sourceLine?.text || "",
  };
}

function chooseLineByPlaybackTime(positionSeconds) {
  const refs = appState.lyric?.lines || [];
  const sourceLines = appState.lyricSource?.lines || [];
  if (!refs.length) {
    return null;
  }

  const positionMs = positionSeconds * 1000;
  const timedRefs = refs.filter((line) => Number.isFinite(line.startTimeMs));
  const ref =
    timedRefs
      .filter((line) => line.startTimeMs <= positionMs)
      .sort((left, right) => right.startTimeMs - left.startTimeMs)[0] ||
    timedRefs[0] ||
    refs[0];
  const sourceLine = sourceLines.find((line) => line.index === ref.lineIndex) || sourceLines[0];
  return {
    id: ref.id,
    lineIndex: ref.lineIndex,
    startTimeMs: ref.startTimeMs,
    text: sourceLine?.text || "",
  };
}

function readMemoFallback() {
  return window.localStorage.getItem("kurostep.translationMemo") || "작업 중 떠오른 번역 느낌을 살짝 적어둘게요.";
}

async function changeStatus(status) {
  if (!appState.work || appState.work.status === status) {
    return;
  }

  try {
    appState.work = await api(`/api/tasks/${appState.work.id}/status?userId=${appState.auth.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    appState.notice = `작업 상태를 ${status}(으)로 옮겼어요`;
    await refreshTasksOnly();
  } catch (error) {
    appState.error = error.message;
  } finally {
    render();
  }
}

async function refreshTasksOnly() {
  const tasks = await api(`/api/tasks/today?userId=${appState.auth.userId}`);
  appState.counts = countTaskStatuses(tasks);
}

async function saveMemo() {
  const memoInput = document.querySelector("#translation-memo");
  const translatedInput = document.querySelector("#translated-text");
  if (!appState.selectedLine || !memoInput || !translatedInput) {
    return;
  }

  try {
    appState.translation = await api(
      `/api/lyric-line-refs/${appState.selectedLine.id}/translations?userId=${appState.auth.userId}`,
      {
        method: "POST",
        body: JSON.stringify({
          languageCode: "ko",
          translatedText: translatedInput.value,
          memoText: memoInput.value,
        }),
      },
    );
    window.localStorage.setItem("kurostep.translationMemo", memoInput.value);
    appState.notice = "번역 메모를 서버에 콕 저장했어요";
  } catch (error) {
    appState.error = error.message;
  } finally {
    render();
  }
}

async function togglePlayback() {
  appState.isPlaying = !appState.isPlaying;
  appState.error = "";

  try {
    if (appState.isPlaying) {
      await playCurrentAudio();
    } else {
      pauseCurrentAudio();
      appState.notice = "잠깐 멈춰둘게요";
    }
  } catch (error) {
    appState.isPlaying = false;
    appState.error = `재생을 시작하지 못했어요: ${error.message}`;
  }

  syncPlaybackTimer();
  await syncLyricsOverlay();
  updatePlaybackDom();
}

function syncPlaybackTimer() {
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }

  if (!appState.isPlaying) return;

  playbackTimer = setInterval(() => {
    if (youtubePlayer?.getCurrentTime) {
      appState.playbackPositionSeconds = Math.floor(youtubePlayer.getCurrentTime() || 0);
    } else {
      appState.playbackPositionSeconds += 1;
    }
    handlePlaybackTick();
  }, 1000);
}

function handlePlaybackTick() {
  const duration = appState.currentTrack?.durationSeconds;
  if (Number.isFinite(duration) && appState.playbackPositionSeconds >= duration) {
    if (appState.repeatMode) {
      appState.playbackPositionSeconds = 0;
      youtubePlayer?.seekTo?.(0, true);
    } else {
      movePlaylistTrack(1);
      return;
    }
  }

  const nextLine = chooseLineByPlaybackTime(appState.playbackPositionSeconds);
  if (nextLine && nextLine.id !== appState.selectedLine?.id) {
    appState.selectedLine = nextLine;
    updateLyricMemoDom();
    syncLyricsOverlay();
    ensureSelectedLineTranslation(appState.auth.userId)
      .then(() => {
        updateLyricMemoDom();
        return syncLyricsOverlay();
      })
      .catch((error) => {
        appState.error = error.message;
        render();
      });
  }
  updatePlaybackDom();
}

async function skipPlayback(seconds) {
  const duration = appState.currentTrack?.durationSeconds;
  const max = Number.isFinite(duration) ? Math.max(duration - 1, 0) : 24 * 60 * 60;
  await seekPlaybackToSeconds(Math.min(Math.max(appState.playbackPositionSeconds + seconds, 0), max));
  appState.notice = seconds > 0 ? "10초 앞으로 폴짝" : "10초 뒤로 살금";
  updatePlaybackDom();
}

async function seekPlaybackToSeconds(seconds, translateLine = true) {
  const duration = appState.currentTrack?.durationSeconds;
  const max = Number.isFinite(duration) ? Math.max(duration - 1, 0) : 24 * 60 * 60;
  appState.playbackPositionSeconds = Math.min(Math.max(Math.floor(seconds), 0), max);

  const nextLine = chooseLineByPlaybackTime(appState.playbackPositionSeconds);
  if (nextLine) {
    appState.selectedLine = nextLine;
    if (translateLine) {
      await ensureSelectedLineTranslation(appState.auth.userId);
    }
  }

  youtubePlayer?.seekTo?.(appState.playbackPositionSeconds, true);

  await syncLyricsOverlay();
  updatePlaybackDom();
  updateLyricMemoDom();
}

function seekPlaybackByPointer(event, translateLine = false) {
  const track = document.querySelector("#progress-track");
  if (!track) {
    return;
  }

  const rect = track.getBoundingClientRect();
  const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
  const duration = appState.currentTrack?.durationSeconds || 0;
  seekPlaybackToSeconds(duration * Math.min(Math.max(ratio, 0), 1), translateLine).catch((error) => {
    appState.error = error.message;
    render();
  });
}

async function movePlaylistTrack(offset) {
  if (!appState.playlistTracks.length || !appState.currentTrack) {
    return;
  }

  const currentIndex = Math.max(
    appState.playlistTracks.findIndex((track) => track.playlistTrackId === appState.currentTrack.playlistTrackId),
    0,
  );
  let nextIndex = currentIndex + offset;
  if (nextIndex < 0) {
    nextIndex = appState.repeatMode ? appState.playlistTracks.length - 1 : 0;
  }
  if (nextIndex >= appState.playlistTracks.length) {
    nextIndex = appState.repeatMode ? 0 : appState.playlistTracks.length - 1;
  }

  const nextTrack = appState.playlistTracks[nextIndex];
  if (!nextTrack) {
    return;
  }

  await setCurrentPlaylistTrack(nextTrack);
}

async function setCurrentPlaylistTrack(playlistTrack) {
  const userId = appState.auth.userId;
  appState.playbackPositionSeconds = 0;
  appState.work = await api(
    `/api/tasks/${appState.work.id}/current-playlist-track/${playlistTrack.playlistTrackId}?userId=${userId}`,
    { method: "PATCH" },
  );
  appState.currentTrack = {
    id: playlistTrack.trackId,
    playlistTrackId: playlistTrack.playlistTrackId,
    playlistName: appState.playlist?.name,
    title: playlistTrack.title,
    artist: playlistTrack.artist,
    sourceUrl: playlistTrack.sourceUrl,
    sourceId: playlistTrack.sourceId || extractYoutubeId(playlistTrack.sourceUrl || ""),
    durationSeconds: playlistTrack.durationSeconds,
  };
  youtubePlayerVideoId = "";
  await ensureLyricAndTranslation(userId, playlistTrack.trackId);
  appState.notice = "현재 곡을 바꿨어요";
  await syncLyricsOverlay();
  render();
  if (appState.isPlaying) {
    await playCurrentAudio().catch((error) => {
      appState.error = `재생을 시작하지 못했어요: ${error.message}`;
      appState.isPlaying = false;
    });
    syncPlaybackTimer();
  }
}

async function toggleRepeatMode() {
  appState.repeatMode = !appState.repeatMode;
  appState.notice = appState.repeatMode ? "반복 산책 ON" : "반복 산책 OFF";
  updatePlaybackDom();
}

async function syncLyricsOverlay() {
  if (!appState.lyricsOverlayVisible) {
    return;
  }
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    await invoke("set_lyrics_visible", {
      visible: true,
      line: appState.selectedLine?.text || "",
      translation: appState.translation?.translatedText || "",
    });
  }
}

function updatePlaybackDom() {
  const button = document.querySelector("#play-toggle");
  if (button) {
    button.innerHTML = iconSvg(appState.isPlaying ? "pause" : "play");
    button.title = appState.isPlaying ? "잠깐 멈춤" : "재생";
    button.setAttribute("aria-label", appState.isPlaying ? "잠깐 멈춤" : "재생");
  }

  const playerArea = document.querySelector("#player-area");
  if (playerArea) {
    playerArea.classList.toggle("playing", appState.isPlaying);
    playerArea.classList.toggle("paused", !appState.isPlaying);
  }

  const repeatButton = document.querySelector("#repeat-toggle");
  repeatButton?.classList.toggle("active", appState.repeatMode);

  const current = document.querySelector("#progress-current");
  if (current) {
    current.textContent = formatDuration(appState.playbackPositionSeconds);
  }

  const bar = document.querySelector("#progress-bar");
  if (bar) {
    const duration = appState.currentTrack?.durationSeconds || 1;
    bar.style.width = `${Math.min(((appState.playbackPositionSeconds || 0) / duration) * 100, 100)}%`;
  }

  const thumb = document.querySelector("#progress-thumb");
  if (thumb) {
    const duration = appState.currentTrack?.durationSeconds || 1;
    thumb.style.left = `${Math.min(((appState.playbackPositionSeconds || 0) / duration) * 100, 100)}%`;
  }

  const progressTrack = document.querySelector("#progress-track");
  if (progressTrack) {
    progressTrack.setAttribute("aria-valuenow", String(appState.playbackPositionSeconds || 0));
    progressTrack.setAttribute("aria-valuemax", String(appState.currentTrack?.durationSeconds || 0));
    progressTrack.setAttribute("aria-valuetext", formatDuration(appState.playbackPositionSeconds));
  }

  const notice = document.querySelector("#backend-notice");
  if (notice && appState.notice && !appState.error) {
    notice.textContent = appState.notice;
  }
}

function updateLyricMemoDom() {
  const context = document.querySelector("#memo-context");
  if (context && appState.selectedLine) {
    context.innerHTML = `<span>${escapeHtml(formatTimestamp(appState.selectedLine.startTimeMs))}</span> "${escapeHtml(appState.selectedLine.text)}"`;
  }

  const translated = document.querySelector("#translated-text");
  if (translated) {
    translated.value = appState.translation?.translatedText || "";
  }

  const memo = document.querySelector("#translation-memo");
  if (memo) {
    memo.value = appState.translation?.memoText || readMemoFallback();
  }

  const saveState = document.querySelector("#memo-save-state");
  if (saveState) {
    saveState.textContent = appState.translation?.status || "";
  }
}

function sectionHeader(title, actionLabel, actionId) {
  const action = actionLabel
    ? `<button class="action-button" id="${escapeHtml(actionId || "")}" type="button">${escapeHtml(actionLabel)}</button>`
    : "";

  return `
    <div class="section-head">
      <h2 class="section-title">${escapeHtml(title)}</h2>
      ${action}
    </div>
  `;
}

function widgetShell(content) {
  return `
    <section class="widget-container">
      <header class="mac-header" id="window-drag-region" data-tauri-drag-region>
        <div class="mac-dots">
          <button class="mac-dot dot-red" id="window-close" type="button" aria-label="닫기"></button>
          <button class="mac-dot dot-yellow" id="window-minimize" type="button" aria-label="최소화"></button>
          <button class="mac-dot dot-green" id="window-zoom" type="button" aria-label="확대 또는 복원"></button>
        </div>
        <strong class="window-title" data-tauri-drag-region>KuroStep</strong>
      </header>
      <div class="widget-content">
        ${content}
      </div>
    </section>
  `;
}

function connectionWidget() {
  const authText = appState.auth ? `${appState.auth.nickname} · user #${appState.auth.userId}` : "인증 대기";
  return `
    <section class="widget-section connection-widget">
      ${sectionHeader("BACKEND", "새로고침", "refresh-dashboard")}
      <div class="connection-row">
        <span class="connection-dot ${appState.error ? "error" : "ok"}"></span>
        <span>${escapeHtml(API_BASE_URL)}</span>
      </div>
      <p class="connection-meta">${escapeHtml(authText)}</p>
      ${appState.loading ? `<p class="state-message">서버랑 발맞추는 중...</p>` : ""}
      ${appState.error ? `<p class="state-message error">${escapeHtml(appState.error)}</p>` : ""}
      ${appState.notice && !appState.error ? `<p class="state-message" id="backend-notice">${escapeHtml(appState.notice)}</p>` : ""}
    </section>
  `;
}

function todayWorkWidget(work, counts) {
  if (!work) {
    return emptySection("TODAY'S WORK", "오늘 남길 발자국이 아직 없어요.");
  }

  const statuses = ["TODO", "DOING", "DONE"];
  const statusButtons = statuses
    .map((status) => {
      const active = status === work.status ? " active" : "";
      return `<button class="badge${active}" data-status="${status}" type="button">${status} <span>${counts[status] || 0}</span></button>`;
    })
    .join("");

  return `
    <section class="widget-section today-work" aria-labelledby="today-work-title">
      ${sectionHeader("TODAY'S WORK")}
      <div class="task-header">
        <h3 class="task-title" id="today-work-title">${escapeHtml(work.title)}</h3>
      </div>
      <p class="task-description">${escapeHtml(work.description || work.taskDate)}</p>
      <div class="status-badges" aria-label="작업 상태">
        ${statusButtons}
      </div>
      <div class="button-row">
        <button class="action-button" id="cycle-status" type="button">상태 바꾸기</button>
        <button class="action-button" id="refresh-task" type="button">새로 맞추기</button>
      </div>
    </section>
  `;
}

function playerWidget(track) {
  if (!track) {
    return emptySection("NOW PLAYING", "아직 같이 걸을 곡이 없어요.");
  }

  return `
    <section class="widget-section now-playing" aria-labelledby="now-playing-title">
      ${sectionHeader("NOW PLAYING")}
      <div class="youtube-frame-shell">
        <div id="youtube-player" class="youtube-player" aria-label="앱 내부 YouTube 플레이어"></div>
      </div>
      <div class="player-area ${appState.isPlaying ? "playing" : "paused"}" id="player-area" title="작업 카드에 연결된 곡">
        <div class="cat-tail" aria-hidden="true"></div>
        <div class="record" aria-label="재생 중인 레코드">
          <span class="record-label">
            <img class="paw-print" src="./assets/paw-print.svg" alt="" aria-hidden="true" />
          </span>
        </div>
        <div class="track-info">
          <h3 id="now-playing-title">${escapeHtml(track.title)}</h3>
          <p>${escapeHtml(track.artist || "Unknown")} · ${escapeHtml(track.playlistName || "No playlist")}</p>
          <div class="track-actions">
            <button class="action-button" id="prepare-player" type="button">앱 안 플레이어 준비</button>
            <button class="action-button subtitle-toggle" id="subtitle-toggle" type="button" aria-pressed="${appState.lyricsOverlayVisible}">
              자막 ${appState.lyricsOverlayVisible ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      </div>
      <div class="player-controls" aria-label="작업용 플레이어 컨트롤">
        <button class="icon-button" id="previous-track" type="button" title="이전 곡" aria-label="이전 곡">${iconSvg("previous")}</button>
        <button class="icon-button" id="skip-back" type="button" title="10초 뒤로" aria-label="10초 뒤로">${iconSvg("rewind")}</button>
        <button class="icon-button main" id="play-toggle" type="button" title="${appState.isPlaying ? "잠깐 멈춤" : "재생"}" aria-label="${appState.isPlaying ? "잠깐 멈춤" : "재생"}">
          ${iconSvg(appState.isPlaying ? "pause" : "play")}
        </button>
        <button class="icon-button" id="skip-forward" type="button" title="10초 앞으로" aria-label="10초 앞으로">${iconSvg("forward")}</button>
        <button class="icon-button" id="next-track" type="button" title="다음 곡" aria-label="다음 곡">${iconSvg("next")}</button>
        <button class="icon-button repeat ${appState.repeatMode ? "active" : ""}" id="repeat-toggle" type="button" title="반복 재생" aria-label="반복 재생">${iconSvg("repeat")}</button>
      </div>
      <div class="progress-row" aria-label="재생 위치">
        <span id="progress-current">${escapeHtml(formatDuration(appState.playbackPositionSeconds))}</span>
        <div class="progress-track" id="progress-track" role="slider" tabindex="0" aria-label="재생 위치 이동" aria-valuemin="0" aria-valuemax="${escapeHtml(track.durationSeconds || 0)}" aria-valuenow="${escapeHtml(appState.playbackPositionSeconds || 0)}">
          <span id="progress-bar" style="width: ${Math.min(((appState.playbackPositionSeconds || 0) / (track.durationSeconds || 1)) * 100, 100)}%"></span>
          <i id="progress-thumb" style="left: ${Math.min(((appState.playbackPositionSeconds || 0) / (track.durationSeconds || 1)) * 100, 100)}%"></i>
        </div>
        <span>${escapeHtml(formatDuration(track.durationSeconds))}</span>
      </div>
      <p class="audio-note">${escapeHtml(
        isYoutubeTrack(track)
          ? "YouTube 플레이어를 앱 안에 얌전히 준비했어요."
          : "YouTube 링크가 있는 곡만 앱 안 재생을 시작할 수 있어요.",
      )}</p>
    </section>
  `;
}

function youtubeLinkWidget() {
  return `
    <section class="widget-section link-widget" aria-labelledby="link-widget-title">
      ${sectionHeader("ADD YOUTUBE")}
      <div class="link-form" id="link-widget-title">
        <input class="form-input" id="track-title-input" type="text" value="${escapeHtml(DEMO_TRACK.title)}" aria-label="곡 제목" />
        <input class="form-input" id="track-artist-input" type="text" value="${escapeHtml(DEMO_TRACK.artist)}" aria-label="아티스트" />
        <input class="form-input wide" id="track-url-input" type="url" value="${escapeHtml(DEMO_TRACK.sourceUrl)}" aria-label="유튜브 링크" />
        <button class="action-button primary" id="register-track-link" type="button" ${appState.linkSaving ? "disabled" : ""}>
          ${appState.linkSaving ? "담는 중" : "링크 담기"}
        </button>
      </div>
    </section>
  `;
}

function playlistWidget(tracks) {
  if (!tracks.length) {
    return emptySection("PLAYLIST", "플레이리스트가 아직 조용해요.");
  }

  const items = tracks
    .map((track, index) => {
      const playing = track.playlistTrackId === appState.currentTrack?.playlistTrackId || (!appState.currentTrack && index === 0) ? " playing" : "";
      return `
        <li class="playlist-item${playing}">
          <span class="playlist-track">${escapeHtml(track.title)}</span>
          <span class="playlist-duration">${escapeHtml(formatDuration(appState.currentTrack?.durationSeconds))}</span>
        </li>
      `;
    })
    .join("");

  return `
    <section class="widget-section playlist-widget" aria-labelledby="playlist-title">
      ${sectionHeader("PLAYLIST")}
      <p class="playlist-name">${escapeHtml(appState.playlist?.name || "")}</p>
      <ol class="playlist-list" id="playlist-title">
        ${items}
      </ol>
    </section>
  `;
}

function lyricMemoWidget(line, translation) {
  if (!line) {
    return emptySection("TRANSLATION MEMO", "아직 붙잡을 가사 라인이 없어요.");
  }

  return `
    <section class="widget-section lyric-memo-widget" aria-labelledby="translation-memo-title">
      ${sectionHeader("TRANSLATION MEMO")}
      <p class="memo-context" id="memo-context">
        <span>${escapeHtml(formatTimestamp(line.startTimeMs))}</span>
        "${escapeHtml(line.text)}"
      </p>
      <label class="memo-label" for="translated-text">자동 번역 초안</label>
      <textarea class="memo-input" id="translated-text" rows="2">${escapeHtml(translation?.translatedText || "")}</textarea>
      <label class="memo-label" for="translation-memo">한국어 번역 메모</label>
      <textarea class="memo-input" id="translation-memo" rows="2">${escapeHtml(translation?.memoText || readMemoFallback())}</textarea>
      <p class="memo-save-state" id="memo-save-state" aria-live="polite">${escapeHtml(translation?.status || "")}</p>
      <div class="button-row">
        <button class="action-button" id="auto-translate" type="button">초안 다시</button>
        <button class="action-button primary" id="save-memo" type="button">저장</button>
      </div>
    </section>
  `;
}

function emptySection(title, message) {
  return `
    <section class="widget-section empty-section">
      ${sectionHeader(title)}
      <p class="state-message">${escapeHtml(message)}</p>
    </section>
  `;
}

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = widgetShell(`
    ${connectionWidget()}
    ${todayWorkWidget(appState.work, appState.counts)}
    ${playerWidget(appState.currentTrack)}
    ${youtubeLinkWidget()}
    ${playlistWidget(appState.playlistTracks)}
    ${lyricMemoWidget(appState.selectedLine, appState.translation)}
  `);

  bindWindowControls();
  bindActions();
}

function bindActions() {
  document.querySelector("#refresh-dashboard")?.addEventListener("click", loadDashboard);
  document.querySelector("#refresh-task")?.addEventListener("click", loadDashboard);
  document.querySelector("#cycle-status")?.addEventListener("click", () => {
    const statuses = ["TODO", "DOING", "DONE"];
    const currentIndex = statuses.indexOf(appState.work?.status || "TODO");
    changeStatus(statuses[(currentIndex + 1) % statuses.length]);
  });
  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => changeStatus(button.dataset.status));
  });
  document.querySelector("#prepare-player")?.addEventListener("click", async () => {
    try {
      await ensureYoutubePlayer();
      appState.notice = "앱 안 플레이어가 준비됐어요. 이제 재생을 눌러줘냥.";
      updatePlaybackDom();
    } catch (error) {
      appState.error = error.message;
      render();
    }
  });
  document.querySelector("#subtitle-toggle")?.addEventListener("click", async () => {
    await setLyricsOverlayVisible(!appState.lyricsOverlayVisible);
  });
  document.querySelector("#play-toggle")?.addEventListener("click", togglePlayback);
  document.querySelector("#skip-back")?.addEventListener("click", () => skipPlayback(-10));
  document.querySelector("#skip-forward")?.addEventListener("click", () => skipPlayback(10));
  bindProgressScrubber();
  document.querySelector("#previous-track")?.addEventListener("click", () => movePlaylistTrack(-1));
  document.querySelector("#next-track")?.addEventListener("click", () => movePlaylistTrack(1));
  document.querySelector("#repeat-toggle")?.addEventListener("click", toggleRepeatMode);
  document.querySelector("#save-memo")?.addEventListener("click", saveMemo);
  document.querySelector("#register-track-link")?.addEventListener("click", registerTrackFromInputs);
  document.querySelector("#auto-translate")?.addEventListener("click", async () => {
    await ensureLyricAndTranslation(appState.auth.userId, appState.currentTrack.id);
    render();
  });
}

function bindProgressScrubber() {
  const track = document.querySelector("#progress-track");
  if (!track) {
    return;
  }

  let dragging = false;

  track.addEventListener("pointerdown", (event) => {
    dragging = true;
    track.setPointerCapture?.(event.pointerId);
    seekPlaybackByPointer(event, false);
  });

  track.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    seekPlaybackByPointer(event, false);
  });

  const finishDrag = (event) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    seekPlaybackByPointer(event, true);
  };

  track.addEventListener("pointerup", finishDrag);
  track.addEventListener("pointercancel", finishDrag);
  track.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      skipPlayback(-5);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      skipPlayback(5);
    }
  });
}

async function closeWidget() {
  const tauriWindow = window.__TAURI__?.window;
  if (tauriWindow?.getCurrentWindow) {
    await tauriWindow.getCurrentWindow().close();
    return;
  }
  window.close();
}

function getCurrentWindow() {
  return window.__TAURI__?.window?.getCurrentWindow?.();
}

async function minimizeWidget() {
  const currentWindow = getCurrentWindow();
  if (currentWindow?.minimize) {
    await currentWindow.minimize();
  }
}

async function toggleWidgetZoom() {
  const currentWindow = getCurrentWindow();
  if (currentWindow?.toggleMaximize) {
    await currentWindow.toggleMaximize();
  }
}

async function startWindowDrag() {
  const currentWindow = getCurrentWindow();
  if (currentWindow?.startDragging) {
    await currentWindow.startDragging();
  }
}

function bindWindowControls() {
  document.querySelector("#window-close")?.addEventListener("click", closeWidget);
  document.querySelector("#window-minimize")?.addEventListener("click", minimizeWidget);
  document.querySelector("#window-zoom")?.addEventListener("click", toggleWidgetZoom);
  document.querySelector("#window-drag-region")?.addEventListener("mousedown", (event) => {
    if (event.target.closest("button")) {
      return;
    }
    startWindowDrag();
  });
}

async function setLyricsOverlayVisible(visible) {
  appState.lyricsOverlayVisible = visible;

  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    await invoke("set_lyrics_visible", {
      visible,
      line: appState.selectedLine?.text || "",
      translation: appState.translation?.translatedText || "",
    });
  }

  updatePlaybackDom();
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeWidget();
  }
});

render();
loadDashboard();
