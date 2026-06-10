const DEFAULT_API_BASE_URL = window.location.hostname.endsWith("github.io")
  ? "https://54-116-185-226.sslip.io"
  : "http://localhost:8080";
const API_BASE_URL = window.localStorage.getItem("kurostep.apiBaseUrl") || DEFAULT_API_BASE_URL;
const YOUTUBE_APP_ORIGIN = window.location.origin;

const appState = {
  auth: readJson("kurostep.auth"),
  authMode: "login",
  authBusy: false,
  loading: true,
  error: "",
  notice: "",
  isPlaying: false,
  repeatMode: false,
  youtubeVideoVisible: false,
  playbackPositionSeconds: 0,
  volume: Number(window.localStorage.getItem("kurostep.volume") || 80),
  volumePanelOpen: false,
  lyricsOverlayVisible: false,
  lyricsPanelExpanded: false,
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
let progressScrubbing = false;

function readUserAddedTrackIds() {
  const value = readJson("kurostep.userAddedTrackIds");
  return Array.isArray(value) ? value : [];
}

function rememberUserAddedTrack(track) {
  const ids = new Set(readUserAddedTrackIds());
  if (track?.id) {
    ids.add(String(track.id));
  }
  writeJson("kurostep.userAddedTrackIds", [...ids]);
}

function isUserAddedPlaylistTrack(playlistTrack) {
  const ids = readUserAddedTrackIds();
  return ids.includes(String(playlistTrack.trackId));
}

function resetPlaybackPosition() {
  appState.playbackPositionSeconds = 0;
  appState.isPlaying = false;
  syncPlaybackTimer();
  youtubePlayer?.pauseVideo?.();
  youtubePlayer?.seekTo?.(0, true);
}

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
    script.onerror = () => reject(new Error("YouTube 플레이어 API를 못 불러왔어냥."));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

async function ensureYoutubePlayer() {
  const videoId = getYoutubeVideoId();
  const playerRoot = document.querySelector("#youtube-player");
  if (!videoId || !playerRoot) {
    throw new Error("앱 안에서 재생할 YouTube 영상 정보를 못 찾았어냥.");
  }

  const YT = await loadYoutubeIframeApi();
  if (youtubePlayer && youtubePlayerReady && youtubePlayerVideoId === videoId) {
    return youtubePlayer;
  }

  if (youtubePlayer && youtubePlayerReady) {
    youtubePlayerVideoId = videoId;
    youtubePlayer.cueVideoById({ videoId, startSeconds: 0 });
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
        event.target.setVolume?.(appState.volume);
        const duration = Math.floor(event.target.getDuration?.() || 0);
        if (appState.currentTrack && duration > 0) {
          appState.currentTrack.durationSeconds = duration;
          updatePlaybackDom();
        }
      },
      onStateChange: (event) => {
        if (!window.YT) return;
        getTrackDurationSeconds();
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
          "YouTube 플레이어가 앱 안에서 못 깨어났어냥. Tauri WebView Referer 제한이면 Error 153이 날 수 있어냥.";
        syncPlaybackTimer();
        updatePlaybackDom();
      },
    },
  });

  return youtubePlayer;
}

async function playCurrentAudio() {
  if (!isYoutubeTrack()) {
    throw new Error("현재 곡은 YouTube 링크가 아니라 앱 안 재생을 못 해냥.");
  }

  const player = await ensureYoutubePlayer();
  if (!youtubePlayerReady) {
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  player.seekTo?.(appState.playbackPositionSeconds || 0, true);
  player.playVideo?.();
  getTrackDurationSeconds();
  window.setTimeout(() => {
    getTrackDurationSeconds();
    updatePlaybackDom();
  }, 700);
  appState.notice = "앱 안에서 YouTube BGM 재생 중이냥.";
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

function getTrackDurationSeconds() {
  const storedDuration = appState.currentTrack?.durationSeconds;
  if (Number.isFinite(storedDuration) && storedDuration > 0) {
    return storedDuration;
  }

  const youtubeDuration = Math.floor(youtubePlayer?.getDuration?.() || 0);
  if (Number.isFinite(youtubeDuration) && youtubeDuration > 0) {
    if (appState.currentTrack) {
      appState.currentTrack.durationSeconds = youtubeDuration;
    }
    return youtubeDuration;
  }

  return NaN;
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
    volume: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`,
    volumeMuted: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m19 9-4 4"/><path d="m15 9 4 4"/></svg>`,
    chevronDown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
    chevronUp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>`,
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function authErrorMessage(error, mode) {
  const message = String(error?.message || "");
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

async function ensureAuth() {
  if (appState.auth?.accessToken) {
    try {
      const me = await api("/api/auth/me");
      appState.auth = { ...me, accessToken: appState.auth.accessToken };
      writeJson("kurostep.auth", appState.auth);
      return true;
    } catch {
      window.localStorage.removeItem("kurostep.auth");
      appState.auth = null;
    }
  }

  return false;
}

async function loadDashboard() {
  appState.loading = true;
  appState.error = "";
  render();

  try {
    const authenticated = await ensureAuth();
    if (!authenticated) {
      appState.loading = false;
      render();
      return;
    }
    await ensureWorkspaceData();
    appState.notice = "오늘 발자국장 준비 완료냥";
  } catch (error) {
    appState.error = `작업 정보를 못 불러왔어냥: ${error.message}`;
  } finally {
    appState.loading = false;
    render();
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const nickname = String(formData.get("nickname") || "").trim();

  if (appState.authMode === "signup" && !nickname) {
    appState.error = "닉네임을 적어줘냥.";
    render();
    return;
  }
  if (appState.authMode === "signup" && nickname.length > 50) {
    appState.error = "닉네임은 50자 안으로 적어줘냥.";
    render();
    return;
  }
  if (!email) {
    appState.error = "이메일을 적어줘냥.";
    render();
    return;
  }
  if (!isValidEmail(email)) {
    appState.error = "이메일 형식이 조금 이상하다냥. 예: kuro@step.com";
    render();
    return;
  }
  if (!password) {
    appState.error = "비밀번호를 적어줘냥.";
    render();
    return;
  }
  if (password.length < 4) {
    appState.error = "비밀번호는 최소 4자 이상으로 적어줘냥.";
    render();
    return;
  }

  appState.authBusy = true;
  appState.error = "";
  appState.notice = appState.authMode === "signup" ? "가입 정보 정리 중이냥..." : "작업실 문 여는 중이냥...";
  render();

  try {
    appState.auth = await api(appState.authMode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify(
        appState.authMode === "signup"
          ? { email, password, nickname }
          : { email, password },
      ),
    });
    writeJson("kurostep.auth", appState.auth);
    appState.notice = appState.authMode === "signup" ? "가입 완료냥. 작업실로 들어간다냥." : "어서 와냥. 오늘 발자국을 펼친다냥.";
    await ensureWorkspaceData();
  } catch (error) {
    appState.auth = null;
    window.localStorage.removeItem("kurostep.auth");
    appState.error = authErrorMessage(error, appState.authMode);
  } finally {
    appState.authBusy = false;
    appState.loading = false;
    render();
  }
}

function logout() {
  appState.auth = null;
  appState.work = null;
  appState.playlist = null;
  appState.playlistTracks = [];
  appState.currentTrack = null;
  appState.lyric = null;
  appState.lyricSource = null;
  appState.selectedLine = null;
  appState.translation = null;
  resetPlaybackPosition();
  window.localStorage.removeItem("kurostep.auth");
  appState.notice = "다음 작업 때 또 보자냥.";
  render();
}

async function ensureWorkspaceData() {
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
        name: "오늘의 작업 BGM",
        description: "작업 카드에 연결할 곡을 직접 담는 플레이리스트",
      }),
    });
    playlists = await api(`/api/playlists?userId=${userId}`);
  }
  appState.playlist = playlists[0];
  const playlistTracks = await api(`/api/playlists/${appState.playlist.id}/tracks?userId=${userId}`);
  appState.playlistTracks = playlistTracks.filter(isUserAddedPlaylistTrack);

  if (appState.work.playlistId !== appState.playlist.id) {
    appState.work = await api(`/api/tasks/${appState.work.id}/playlist/${appState.playlist.id}?userId=${userId}`, {
      method: "PATCH",
    });
  }

  const currentPlaylistTrack =
    appState.playlistTracks.find((playlistTrack) => playlistTrack.playlistTrackId === appState.work.currentPlaylistTrackId) ||
    appState.playlistTracks[0];

  if (!currentPlaylistTrack) {
    appState.currentTrack = null;
    appState.lyric = null;
    appState.lyricSource = null;
    appState.selectedLine = null;
    appState.translation = null;
    resetPlaybackPosition();
    return;
  }

  if (currentPlaylistTrack.playlistTrackId !== appState.currentTrack?.playlistTrackId) {
    resetPlaybackPosition();
  }
  appState.currentTrack = await hydratePlaylistTrack(currentPlaylistTrack);

  if (appState.work.currentPlaylistTrackId !== currentPlaylistTrack.playlistTrackId) {
    appState.work = await api(
      `/api/tasks/${appState.work.id}/current-playlist-track/${currentPlaylistTrack.playlistTrackId}?userId=${userId}`,
      { method: "PATCH" },
    );
  }

  try {
    await ensureLyricAndTranslation(userId, currentPlaylistTrack.trackId);
  } catch (error) {
    appState.lyric = null;
    appState.lyricSource = null;
    appState.selectedLine = null;
    appState.translation = null;
    appState.notice = `작업곡은 준비했다냥. 가사는 아직 못 찾았다냥: ${error.message}`;
  }
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

async function hydratePlaylistTrack(playlistTrack) {
  if (!playlistTrack) {
    return null;
  }

  const detail = await api(`/api/tracks/${playlistTrack.trackId}`);
  return {
    ...detail,
    playlistTrackId: playlistTrack.playlistTrackId,
    playlistName: appState.playlist?.name,
  };
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

function extractYoutubePlaylistId(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("list") || "";
  } catch {
    return "";
  }
}

async function fetchYoutubeMetadata(sourceUrl, sourceId) {
  const fallback = {
    title: `YouTube 작업곡 ${sourceId}`,
    artist: "YouTube",
  };

  const endpoints = [
    `https://noembed.com/embed?url=${encodeURIComponent(sourceUrl)}`,
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      return {
        title: data.title || fallback.title,
        artist: data.author_name || fallback.artist,
      };
    } catch {
      // Browser/Tauri CORS or network failures fall through to the next source.
    }
  }

  return fallback;
}

async function attachTrackToWorkspace(userId, track, makeCurrent = true) {
  rememberUserAddedTrack(track);
  await ensurePlaylistTrack(userId, appState.playlist.id, track.id);

  const playlistTracks = await api(`/api/playlists/${appState.playlist.id}/tracks?userId=${userId}`);
  appState.playlistTracks = playlistTracks.filter(isUserAddedPlaylistTrack);

  const playlistTrack =
    appState.playlistTracks.find((item) => item.trackId === track.id) || appState.playlistTracks.at(-1);

  if (appState.work.playlistId !== appState.playlist.id) {
    appState.work = await api(`/api/tasks/${appState.work.id}/playlist/${appState.playlist.id}?userId=${userId}`, {
      method: "PATCH",
    });
  }

  if (makeCurrent && playlistTrack) {
    resetPlaybackPosition();
    appState.currentTrack = await hydratePlaylistTrack(playlistTrack);
    appState.work = await api(
      `/api/tasks/${appState.work.id}/current-playlist-track/${playlistTrack.playlistTrackId}?userId=${userId}`,
      { method: "PATCH" },
    );
  }

  return playlistTrack;
}

async function registerSingleTrackFromUrl(userId, sourceUrl, sourceId) {
  const metadata = await fetchYoutubeMetadata(sourceUrl, sourceId);
  const track = await findOrCreateTrack({
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.artist,
    sourceType: "YOUTUBE",
    sourceUrl,
    sourceId,
    durationSeconds: null,
  });

  await attachTrackToWorkspace(userId, track, true);

  try {
    await ensureLyricAndTranslation(userId, track.id);
  } catch (error) {
    appState.lyric = null;
    appState.lyricSource = null;
    appState.selectedLine = null;
    appState.translation = null;
    appState.notice = `곡은 연결했다냥. 가사는 나중에 다시 불러올게냥: ${error.message}`;
  }

  if (!appState.notice.includes("가사는")) {
    appState.notice = "YouTube 링크에서 곡 정보를 불러와 작업 카드에 묶었다냥";
  }
}

async function registerPlaylistFromUrl(userId, playlistUrl, fallbackVideoId) {
  const preview = await api("/api/tracks/youtube-playlist/preview", {
    method: "POST",
    body: JSON.stringify({ playlistUrl }),
  });

  if (!preview.tracks?.length) {
    throw new Error("플레이리스트에서 담을 곡을 못 찾았다냥.");
  }

  const sample = preview.tracks
    .slice(0, 5)
    .map((track, index) => `${index + 1}. ${track.title}`)
    .join("\n");
  const confirmMessage = `이 플레이리스트에서 ${preview.trackCount}곡을 찾았다냥.\n모든 트랙을 오늘의 작업 BGM에 넣을까냥?\n\n${sample}${preview.trackCount > 5 ? "\n..." : ""}`;

  if (!window.confirm(confirmMessage)) {
    if (fallbackVideoId) {
      await registerSingleTrackFromUrl(userId, playlistUrl, fallbackVideoId);
      return;
    }

    appState.notice = "플레이리스트 추가를 멈췄다냥.";
    return;
  }

  let firstTrack = null;
  let addedCount = 0;

  for (const draft of preview.tracks) {
    const track = await findOrCreateTrack(draft);
    firstTrack = firstTrack || track;
    await attachTrackToWorkspace(userId, track, false);
    addedCount += 1;
  }

  if (firstTrack) {
    const firstPlaylistTrack = appState.playlistTracks.find((item) => item.trackId === firstTrack.id);
    if (firstPlaylistTrack) {
      resetPlaybackPosition();
      appState.currentTrack = await hydratePlaylistTrack(firstPlaylistTrack);
      appState.work = await api(
        `/api/tasks/${appState.work.id}/current-playlist-track/${firstPlaylistTrack.playlistTrackId}?userId=${userId}`,
        { method: "PATCH" },
      );

      try {
        await ensureLyricAndTranslation(userId, firstTrack.id);
      } catch (error) {
        appState.lyric = null;
        appState.lyricSource = null;
        appState.selectedLine = null;
        appState.translation = null;
      }
    }
  }

  appState.notice = `플레이리스트 ${addedCount}곡을 작업 BGM에 넣었다냥.`;
}

async function registerTrackFromInputs() {
  const urlInput = document.querySelector("#track-url-input");
  const sourceUrl = urlInput?.value.trim();

  if (!sourceUrl) {
    appState.error = "YouTube 링크를 먼저 넣어줘냥.";
    render();
    return;
  }

  const sourceId = extractYoutubeId(sourceUrl);
  const playlistId = extractYoutubePlaylistId(sourceUrl);
  if (!sourceId && !playlistId) {
    appState.error = "이 링크에서는 YouTube 영상이나 플레이리스트 ID를 못 찾았다냥.";
    render();
    return;
  }

  appState.linkSaving = true;
  appState.error = "";
  appState.notice = "YouTube 링크를 작업 바구니에 담는 중이냥...";
  render();

  try {
    await ensureAuth();
    if (!appState.work || !appState.playlist) {
      await ensureWorkspaceData();
    }

    const userId = appState.auth.userId;
    if (playlistId) {
      await registerPlaylistFromUrl(userId, sourceUrl, sourceId);
    } else {
      await registerSingleTrackFromUrl(userId, sourceUrl, sourceId);
    }
    urlInput.value = "";
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
  appState.selectedLine = chooseLineByPlaybackTime(appState.playbackPositionSeconds || 0) || chooseDisplayLine(appState.lyric, lyricSource);
  if (!appState.selectedLine || (appState.playbackPositionSeconds || 0) === 0) {
    appState.selectedLine = chooseLineByPlaybackTime(appState.playbackPositionSeconds || 0);
    appState.translation = null;
  }

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
  if (timedRefs.length) {
    const firstTimedRef = [...timedRefs].sort((left, right) => left.startTimeMs - right.startTimeMs)[0];
    if (positionMs < firstTimedRef.startTimeMs) {
      return null;
    }
  }
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
  return window.localStorage.getItem("kurostep.translationMemo") || "작업 중 떠오른 번역 느낌을 살짝 적어둘게냥.";
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
    appState.notice = `작업 상태를 ${status}(으)로 옮겼다냥`;
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
    appState.notice = "번역 메모를 서버에 콕 저장했다냥";
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
      appState.notice = "잠깐 멈춰둘게냥";
    }
  } catch (error) {
    appState.isPlaying = false;
    appState.error = `재생을 시작하지 못했다냥: ${error.message}`;
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
    if (progressScrubbing) {
      updatePlaybackDom();
      return;
    }
    if (youtubePlayer?.getCurrentTime) {
      appState.playbackPositionSeconds = Math.floor(youtubePlayer.getCurrentTime() || 0);
      getTrackDurationSeconds();
    } else {
      appState.playbackPositionSeconds += 1;
    }
    handlePlaybackTick();
  }, 1000);
}

function handlePlaybackTick() {
  const duration = getTrackDurationSeconds();
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
  if (!nextLine && appState.selectedLine) {
    appState.selectedLine = null;
    appState.translation = null;
    updateLyricMemoDom();
    syncLyricsOverlay();
    updatePlaybackDom();
    return;
  }
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
  } else {
    appState.selectedLine = null;
    appState.translation = null;
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

function changeVolume(value) {
  const nextVolume = Math.min(Math.max(Number(value) || 0, 0), 100);
  appState.volume = nextVolume;
  window.localStorage.setItem("kurostep.volume", String(nextVolume));
  youtubePlayer?.setVolume?.(nextVolume);
  updatePlaybackDom();
}

function toggleVolumePanel() {
  appState.volumePanelOpen = !appState.volumePanelOpen;
  updatePlaybackDom();
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
  appState.currentTrack = await hydratePlaylistTrack(playlistTrack);
  youtubePlayerVideoId = "";
  await ensureLyricAndTranslation(userId, playlistTrack.trackId);
  appState.notice = "현재 곡을 바꿨다냥";
  await syncLyricsOverlay();
  render();
  if (appState.isPlaying) {
    await playCurrentAudio().catch((error) => {
      appState.error = `재생을 시작하지 못했다냥: ${error.message}`;
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

  const subtitleToggle = document.querySelector("#subtitle-toggle");
  if (subtitleToggle) {
    subtitleToggle.textContent = `자막 ${appState.lyricsOverlayVisible ? "ON" : "OFF"}`;
    subtitleToggle.setAttribute("aria-pressed", String(appState.lyricsOverlayVisible));
  }

  const youtubeToggle = document.querySelector("#youtube-video-toggle");
  if (youtubeToggle) {
    const label = appState.youtubeVideoVisible ? "영상 접기" : "영상 펼치기";
    youtubeToggle.innerHTML = `${iconSvg(appState.youtubeVideoVisible ? "chevronUp" : "chevronDown")}<span>${label}</span>`;
    youtubeToggle.title = label;
    youtubeToggle.setAttribute("aria-label", label);
    youtubeToggle.setAttribute("aria-expanded", String(appState.youtubeVideoVisible));
  }

  const youtubeShell = document.querySelector("#youtube-frame-shell");
  if (youtubeShell) {
    youtubeShell.classList.toggle("open", appState.youtubeVideoVisible);
    youtubeShell.setAttribute("aria-hidden", String(!appState.youtubeVideoVisible));
  }

  const inlineSubtitle = document.querySelector("#inline-subtitle");
  if (inlineSubtitle) {
    inlineSubtitle.classList.toggle("show", appState.lyricsOverlayVisible);
    inlineSubtitle.setAttribute("aria-hidden", String(!appState.lyricsOverlayVisible));
  }

  const inlineSubtitleLine = document.querySelector("#inline-subtitle-line");
  if (inlineSubtitleLine) {
    inlineSubtitleLine.textContent = appState.selectedLine?.text || "재생 중인 가사가 여기 뜬다냥";
  }

  const inlineSubtitleTranslation = document.querySelector("#inline-subtitle-translation");
  if (inlineSubtitleTranslation) {
    inlineSubtitleTranslation.textContent = appState.translation?.translatedText || "번역 메모가 여기 이어진다냥";
  }

  const current = document.querySelector("#progress-current");
  if (current) {
    current.textContent = formatDuration(appState.playbackPositionSeconds);
  }

  const duration = getTrackDurationSeconds();
  const durationText = document.querySelector("#progress-duration");
  if (durationText) {
    durationText.textContent = formatDuration(duration);
  }

  const bar = document.querySelector("#progress-bar");
  if (bar) {
    const progressDuration = duration || 1;
    bar.style.width = `${Math.min(((appState.playbackPositionSeconds || 0) / progressDuration) * 100, 100)}%`;
  }

  const thumb = document.querySelector("#progress-thumb");
  if (thumb) {
    const progressDuration = duration || 1;
    thumb.style.left = `${Math.min(((appState.playbackPositionSeconds || 0) / progressDuration) * 100, 100)}%`;
  }

  const progressTrack = document.querySelector("#progress-track");
  if (progressTrack) {
    progressTrack.setAttribute("aria-valuenow", String(appState.playbackPositionSeconds || 0));
    progressTrack.setAttribute("aria-valuemax", String(Number.isFinite(duration) ? duration : 0));
    progressTrack.setAttribute("aria-valuetext", formatDuration(appState.playbackPositionSeconds));
  }

  const volumeSlider = document.querySelector("#volume-slider");
  if (volumeSlider) {
    volumeSlider.value = String(appState.volume);
    volumeSlider.setAttribute("aria-valuenow", String(appState.volume));
  }

  const volumeToggle = document.querySelector("#volume-toggle");
  if (volumeToggle) {
    volumeToggle.innerHTML = iconSvg(appState.volume === 0 ? "volumeMuted" : "volume");
    volumeToggle.setAttribute("aria-expanded", String(appState.volumePanelOpen));
  }

  const volumeControl = document.querySelector(".volume-control");
  if (volumeControl) {
    volumeControl.classList.toggle("open", appState.volumePanelOpen);
  }

  const volumePopover = document.querySelector("#volume-popover");
  if (volumePopover) {
    volumePopover.setAttribute("aria-hidden", String(!appState.volumePanelOpen));
  }

  const volumeValue = document.querySelector("#volume-value");
  if (volumeValue) {
    volumeValue.textContent = `${appState.volume}%`;
  }

  const notice = document.querySelector("#app-status");
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

function statusLabel(status) {
  const labels = {
    TODO: "할 일",
    DOING: "걷는 중",
    DONE: "발도장",
  };
  return labels[status] || status;
}

function widgetShell(content) {
  return `
    <section class="widget-container">
      <header class="mac-header" id="window-drag-region" data-tauri-drag-region>
        <div class="mac-dots">
          <button class="mac-dot dot-red" id="window-close" type="button" aria-label="닫기"></button>
          <button class="mac-dot dot-yellow" id="window-minimize" type="button" aria-label="최소화"></button>
        </div>
        <strong class="window-title" data-tauri-drag-region>
          <span class="app-mark" aria-hidden="true">
            <img src="./assets/paw-print-neutral.svg" alt="" />
          </span>
          KuroStep
        </strong>
        ${appState.auth ? `<button class="ghost-header-button" id="logout-button" type="button">나가기</button>` : `<span></span>`}
      </header>
      <div class="widget-content">
        ${content}
      </div>
    </section>
  `;
}

function authWidget() {
  const isSignup = appState.authMode === "signup";
  return `
    <section class="auth-screen" aria-labelledby="auth-title">
      <div class="auth-brand">
        <span class="auth-mark" aria-hidden="true">
          <img src="./assets/paw-print-neutral.svg" alt="" />
        </span>
        <p class="auth-eyebrow">KuroStep</p>
        <h1 id="auth-title">${isSignup ? "작업실 만들기" : "작업실 들어가기"}</h1>
        <p>${isSignup ? "오늘 발자국과 BGM, 가사 메모를 함께 묶어둘 계정을 만든다냥." : "로그인하면 발자국장, 턴테이블, 가사 창이 차례대로 열린다냥."}</p>
      </div>
      <div class="auth-switch" role="tablist" aria-label="인증 방식">
        <button class="${!isSignup ? "active" : ""}" id="auth-login-tab" type="button">로그인</button>
        <button class="${isSignup ? "active" : ""}" id="auth-signup-tab" type="button">회원가입</button>
      </div>
      <form class="auth-form" id="auth-form">
        ${isSignup ? `<label>닉네임<input class="form-input" name="nickname" autocomplete="nickname" placeholder="검은 작업실 이름" /></label>` : ""}
        <label>이메일<input class="form-input" name="email" type="email" autocomplete="email" placeholder="you@example.com" /></label>
        <label>비밀번호<input class="form-input" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" placeholder="비밀번호" /></label>
        <button class="action-button primary auth-submit" type="submit" ${appState.authBusy ? "disabled" : ""}>
          ${appState.authBusy ? "확인 중이냥" : isSignup ? "회원가입" : "로그인"}
        </button>
      </form>
      ${appState.error ? `<p class="state-message error">${escapeHtml(appState.error)}</p>` : ""}
      ${appState.notice && !appState.error ? `<p class="state-message">${escapeHtml(appState.notice)}</p>` : ""}
    </section>
  `;
}

function appNoticeWidget() {
  if (appState.loading) {
    return `<p class="app-status" id="app-status">작업실 정리 중이냥...</p>`;
  }
  if (appState.error) {
    return `<p class="app-status error" id="app-status">${escapeHtml(appState.error)}</p>`;
  }
  if (appState.notice) {
    return `<p class="app-status" id="app-status">${escapeHtml(appState.notice)}</p>`;
  }
  return "";
}

function todayWorkWidget(work, counts) {
  if (!work) {
    return emptySection("오늘 할 일", "오늘 찍을 발자국이 아직 없다냥.");
  }

  const statuses = ["TODO", "DOING", "DONE"];
  const statusButtons = statuses
    .map((status) => {
      const active = status === work.status ? " active" : "";
      return `<button class="badge${active}" data-status="${status}" type="button">${statusLabel(status)} <span>${counts[status] || 0}</span></button>`;
    })
    .join("");

  return `
    <section class="widget-section today-work" aria-labelledby="today-work-title">
      ${sectionHeader("오늘 할 일")}
      <div class="task-header">
        <h3 class="task-title" id="today-work-title">${escapeHtml(work.title)}</h3>
      </div>
      <p class="task-description">${escapeHtml(work.description || work.taskDate)}</p>
      <div class="meta-grid" aria-label="작업 카드 상세">
        <span>날짜 ${escapeHtml(work.taskDate || "-")}</span>
        <span>상태 ${escapeHtml(statusLabel(work.status))}</span>
        <span>BGM 바구니 ${escapeHtml(work.playlistId ? `#${work.playlistId}` : "미연결")}</span>
        <span>현재곡 ${escapeHtml(work.currentPlaylistTrackId ? `#${work.currentPlaylistTrackId}` : "없음")}</span>
      </div>
      <div class="status-badges" aria-label="작업 상태">
        ${statusButtons}
      </div>
    </section>
  `;
}

function playerWidget(track) {
  if (!track) {
    return emptySection("NOW PLAYING", "아직 같이 걸을 곡이 없다냥.");
  }

  const duration = getTrackDurationSeconds();
  const sourceLabel = track.sourceType === "YOUTUBE" ? "YouTube" : track.sourceType || "Source";

  return `
    <section class="widget-section now-playing" aria-labelledby="now-playing-title">
      ${sectionHeader("NOW PLAYING")}
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
          <div class="track-meta" aria-label="곡 상세">
            <span>${escapeHtml(sourceLabel)}</span>
            <span>${escapeHtml(track.sourceId || "source id 없음")}</span>
            <span>${escapeHtml(formatDuration(duration))}</span>
          </div>
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
        <div class="progress-track" id="progress-track" role="slider" tabindex="0" aria-label="재생 위치 이동" aria-valuemin="0" aria-valuemax="${escapeHtml(Number.isFinite(duration) ? duration : 0)}" aria-valuenow="${escapeHtml(appState.playbackPositionSeconds || 0)}">
          <span id="progress-bar" style="width: ${Math.min(((appState.playbackPositionSeconds || 0) / (duration || 1)) * 100, 100)}%"></span>
          <i id="progress-thumb" style="left: ${Math.min(((appState.playbackPositionSeconds || 0) / (duration || 1)) * 100, 100)}%"></i>
        </div>
        <span id="progress-duration">${escapeHtml(formatDuration(duration))}</span>
        <div class="volume-control ${appState.volumePanelOpen ? "open" : ""}">
          <button class="volume-button" id="volume-toggle" type="button" aria-label="볼륨 조절" aria-expanded="${appState.volumePanelOpen}" title="볼륨 조절">
            ${iconSvg(appState.volume === 0 ? "volumeMuted" : "volume")}
          </button>
          <div class="volume-popover" id="volume-popover" aria-hidden="${appState.volumePanelOpen ? "false" : "true"}">
            <input id="volume-slider" type="range" min="0" max="100" step="1" value="${escapeHtml(appState.volume)}" aria-label="볼륨" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(appState.volume)}" />
            <span id="volume-value">${escapeHtml(appState.volume)}%</span>
          </div>
        </div>
      </div>
      <button class="youtube-panel-toggle ${appState.youtubeVideoVisible ? "open" : ""}" id="youtube-video-toggle" type="button" aria-expanded="${appState.youtubeVideoVisible}" aria-controls="youtube-frame-shell" title="${appState.youtubeVideoVisible ? "영상 접기" : "영상 펼치기"}" aria-label="${appState.youtubeVideoVisible ? "영상 접기" : "영상 펼치기"}">
        ${iconSvg(appState.youtubeVideoVisible ? "chevronUp" : "chevronDown")}
        <span>${appState.youtubeVideoVisible ? "영상 접기" : "영상 펼치기"}</span>
      </button>
      <div class="inline-subtitle ${appState.lyricsOverlayVisible ? "show" : ""}" id="inline-subtitle" aria-hidden="${appState.lyricsOverlayVisible ? "false" : "true"}">
        <strong id="inline-subtitle-line">${escapeHtml(appState.selectedLine?.text || "재생 중인 가사가 여기 뜬다냥")}</strong>
        <span id="inline-subtitle-translation">${escapeHtml(appState.translation?.translatedText || "번역 메모가 여기 이어진다냥")}</span>
      </div>
      <div class="youtube-frame-shell ${appState.youtubeVideoVisible ? "open" : ""}" id="youtube-frame-shell" aria-hidden="${appState.youtubeVideoVisible ? "false" : "true"}">
        <div id="youtube-player" class="youtube-player" aria-label="앱 내부 YouTube 플레이어"></div>
      </div>
    </section>
  `;
}

function youtubeLinkWidget() {
  return `
    <section class="sub-section link-widget" aria-labelledby="link-widget-title">
      ${sectionHeader("YOUTUBE LINK")}
      <div class="link-form" id="link-widget-title">
        <input class="form-input wide" id="track-url-input" type="url" value="" placeholder="영상 또는 플레이리스트 링크를 붙여넣어줘냥" aria-label="유튜브 링크" />
        <button class="action-button primary" id="register-track-link" type="button" ${appState.linkSaving ? "disabled" : ""}>
          ${appState.linkSaving ? "불러오는 중이냥" : "링크 불러오기"}
        </button>
      </div>
    </section>
  `;
}

function playlistWidget(tracks) {
  if (!tracks.length) {
    return emptySection("PLAYLIST", "플레이리스트가 아직 조용하다냥.");
  }

  const items = tracks
    .map((track, index) => {
      const playing = track.playlistTrackId === appState.currentTrack?.playlistTrackId || (!appState.currentTrack && index === 0) ? " playing" : "";
      const duration = track.durationSeconds || (track.trackId === appState.currentTrack?.id ? appState.currentTrack.durationSeconds : null);
      return `
        <li class="playlist-item${playing}">
          <span class="playlist-track">
            <strong>${escapeHtml(track.title)}</strong>
            <small>${escapeHtml(track.artist || "Unknown")} · #${escapeHtml(track.trackId)}</small>
          </span>
          <span class="playlist-duration">${escapeHtml(formatDuration(duration))}</span>
        </li>
      `;
    })
    .join("");

  return `
    <section class="widget-section playlist-widget" aria-labelledby="playlist-title">
      ${sectionHeader("PLAYLIST")}
      <p class="playlist-name">${escapeHtml(appState.playlist?.name || "")} · ${escapeHtml(String(tracks.length))}곡</p>
      <ol class="playlist-list" id="playlist-title">
        ${items}
      </ol>
    </section>
  `;
}

function lyricMemoWidget(line, translation) {
  if (!line) {
    return emptySection("번역 메모", "곡을 재생하면 현재 가사와 한국어 메모를 만질 수 있다냥.");
  }

  return `
    <section class="widget-section lyric-memo-widget" aria-labelledby="translation-memo-title">
      ${sectionHeader("번역 메모")}
      <p class="memo-context" id="memo-context">
        <span>${escapeHtml(formatTimestamp(line.startTimeMs))}</span>
        "${escapeHtml(line.text)}"
      </p>
      <label class="memo-label" for="translated-text">한국어 번역문</label>
      <textarea class="memo-input" id="translated-text" rows="2">${escapeHtml(translation?.translatedText || "")}</textarea>
      <label class="memo-label" for="translation-memo">개인 메모</label>
      <textarea class="memo-input" id="translation-memo" rows="2">${escapeHtml(translation?.memoText || readMemoFallback())}</textarea>
      <p class="memo-save-state" id="memo-save-state" aria-live="polite">${escapeHtml(translation?.status || "")}</p>
      <div class="button-row">
        <button class="action-button" id="auto-translate" type="button">초안 다시냥</button>
        <button class="action-button primary" id="save-memo" type="button">콕 저장</button>
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

function widgetGroup(className, title, subtitle, content) {
  return `
    <section class="widget-group ${escapeHtml(className)}" aria-label="${escapeHtml(title)}">
      <div class="widget-group-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
      </div>
      ${content}
    </section>
  `;
}

function taskPawWidget() {
  return widgetGroup(
    "task-paw-widget",
    "오늘 발자국",
    "오늘 할 일과 작업 상태를 살금살금 정리한다냥",
    todayWorkWidget(appState.work, appState.counts)
  );
}

function lyricDeskWidget() {
  return widgetGroup(
    "lyric-desk-widget",
    "가사 손질장",
    "원문 옆에 한국어 번역과 떠오른 느낌을 콕 남긴다냥",
    lyricMemoWidget(appState.selectedLine, appState.translation)
  );
}

function musicPlayerWidget() {
  return widgetGroup(
    "music-player-widget",
    "BGM 턴테이블",
    "작업 카드에 붙인 곡을 여기서 조심조심 튼다냥",
    `
      ${playerWidget(appState.currentTrack)}
      ${youtubeLinkWidget()}
      ${playlistWidget(appState.playlistTracks)}
    `
  );
}

function lyricsWidget() {
  const currentLine = appState.selectedLine?.text || "";
  const lineText = currentLine || "아직 재생 중이 아닙니다";
  const sourceLines = appState.lyricSource?.lines || [];
  const fullLyrics = sourceLines.length
    ? sourceLines
        .map((line) => {
          const active = line.index === appState.selectedLine?.lineIndex ? " active" : "";
          const timestamp = Number.isFinite(line.startTimeMs) ? formatTimestamp(line.startTimeMs) : "--:--";
          return `
            <li class="lyrics-line${active}">
              <span>${escapeHtml(timestamp)}</span>
              <p>${escapeHtml(line.text)}</p>
            </li>
          `;
        })
        .join("")
    : `<li class="lyrics-line empty"><p>아직 불러온 가사가 없다냥.</p></li>`;

  return `
    <section class="widget-group lyrics-widget" aria-label="가사 창">
      <div class="widget-group-head">
        <div>
          <h2>가사 창</h2>
          <p>지금 흐르는 문장을 보고, 펼치면 전체 가사를 본다냥</p>
        </div>
        <button class="lyrics-panel-toggle" id="lyrics-panel-toggle" type="button" aria-expanded="${appState.lyricsPanelExpanded}" aria-controls="lyrics-full-list" title="${appState.lyricsPanelExpanded ? "가사 접기" : "가사 펼치기"}" aria-label="${appState.lyricsPanelExpanded ? "가사 접기" : "가사 펼치기"}">
          ${iconSvg(appState.lyricsPanelExpanded ? "chevronUp" : "chevronDown")}
        </button>
      </div>
      <div class="lyrics-preview ${appState.isPlaying ? "playing" : ""} ${appState.lyricsPanelExpanded ? "expanded" : ""}">
        <p>${escapeHtml(lineText)}</p>
        ${appState.lyricsPanelExpanded ? `<ol class="lyrics-full-list" id="lyrics-full-list">${fullLyrics}</ol>` : ""}
      </div>
    </section>
  `;
}

function render() {
  const app = document.querySelector("#app");
  if (!appState.auth) {
    app.innerHTML = widgetShell(authWidget());
    bindWindowControls();
    bindAuthActions();
    return;
  }

  app.innerHTML = widgetShell(`
    ${appNoticeWidget()}
    <div class="widget-stack" aria-label="KuroStep 위젯 모음">
    ${taskPawWidget()}
    ${lyricDeskWidget()}
    ${musicPlayerWidget()}
    ${lyricsWidget()}
    </div>
  `);

  bindWindowControls();
  bindActions();
}

function bindAuthActions() {
  document.querySelector("#auth-form")?.addEventListener("submit", handleAuthSubmit);
  document.querySelector("#auth-login-tab")?.addEventListener("click", () => {
    appState.authMode = "login";
    appState.error = "";
    render();
  });
  document.querySelector("#auth-signup-tab")?.addEventListener("click", () => {
    appState.authMode = "signup";
    appState.error = "";
    render();
  });
}

function bindActions() {
  document.querySelector("#logout-button")?.addEventListener("click", logout);
  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => changeStatus(button.dataset.status));
  });
  document.querySelector("#prepare-player")?.addEventListener("click", async () => {
    try {
      await ensureYoutubePlayer();
      getTrackDurationSeconds();
      window.setTimeout(() => {
        getTrackDurationSeconds();
        updatePlaybackDom();
      }, 700);
      appState.notice = "앱 안 플레이어 준비 완료냥. 이제 재생 눌러줘냥.";
      updatePlaybackDom();
    } catch (error) {
      appState.error = error.message;
      render();
    }
  });
  document.querySelector("#youtube-video-toggle")?.addEventListener("click", async () => {
    appState.youtubeVideoVisible = !appState.youtubeVideoVisible;
    appState.notice = appState.youtubeVideoVisible
      ? "YouTube 영상 열었다냥. 광고가 나오면 화면에서 직접 넘겨줘냥."
      : "영상은 다시 접고, 작업 플레이어만 남겨둔다냥.";
    try {
      if (appState.youtubeVideoVisible) {
        await ensureYoutubePlayer();
      }
      updatePlaybackDom();
    } catch (error) {
      appState.error = error.message;
      render();
    }
  });
  document.querySelector("#subtitle-toggle")?.addEventListener("click", async () => {
    await setLyricsOverlayVisible(!appState.lyricsOverlayVisible);
  });
  document.querySelector("#lyrics-panel-toggle")?.addEventListener("click", () => {
    appState.lyricsPanelExpanded = !appState.lyricsPanelExpanded;
    render();
  });
  document.querySelector("#play-toggle")?.addEventListener("click", togglePlayback);
  document.querySelector("#skip-back")?.addEventListener("click", () => skipPlayback(-10));
  document.querySelector("#skip-forward")?.addEventListener("click", () => skipPlayback(10));
  bindProgressScrubber();
  document.querySelector("#volume-toggle")?.addEventListener("click", toggleVolumePanel);
  document.querySelector("#volume-slider")?.addEventListener("input", (event) => {
    changeVolume(event.target.value);
  });
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
    progressScrubbing = true;
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
    progressScrubbing = false;
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

async function startWindowDrag() {
  const currentWindow = getCurrentWindow();
  if (currentWindow?.startDragging) {
    await currentWindow.startDragging();
  }
}

function bindWindowControls() {
  document.querySelector("#window-close")?.addEventListener("click", closeWidget);
  document.querySelector("#window-minimize")?.addEventListener("click", minimizeWidget);
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
    try {
      await invoke("set_lyrics_visible", {
        visible,
        line: appState.selectedLine?.text || "",
        translation: appState.translation?.translatedText || "",
      });
      appState.notice = visible ? "가사 창 띄웠다냥." : "가사 창 접었다냥.";
    } catch (error) {
      appState.error = `가사 창을 못 열었다냥: ${error.message || error}`;
    }
  } else {
    appState.notice = visible ? "브라우저 미리보기라 위젯 안에 자막 보여준다냥." : "자막 프리뷰 접었다냥.";
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
