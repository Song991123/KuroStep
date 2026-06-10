const DEPLOYED_API_BASE_URL = "https://54-116-185-226.sslip.io";
const isGitHubPages = window.location.hostname.endsWith("github.io");
const KUROSTEP_WINDOW = window.KUROSTEP_WINDOW || "main";
const isEmbeddedContent = new URLSearchParams(window.location.search).get("embedded") === "1";
if (isEmbeddedContent) {
  document.documentElement.classList.add("embedded-mode");
}
const isTauriApp =
  Boolean(window.__TAURI__) ||
  window.location.protocol === "tauri:" ||
  window.location.hostname === "tauri.localhost";
const DEFAULT_API_BASE_URL = isGitHubPages || isTauriApp
  ? DEPLOYED_API_BASE_URL
  : "http://localhost:8080";
const API_BASE_URL = window.localStorage.getItem("kurostep.apiBaseUrl") || DEFAULT_API_BASE_URL;
const YOUTUBE_APP_ORIGIN = window.location.origin;
const PLAYLIST_PAGE_SIZE = 10;
const API_TIMEOUT_MS = 12000;
const METADATA_TIMEOUT_MS = 3500;
const PLAYBACK_TICK_MS = 250;
const LYRIC_SYNC_LOOKAHEAD_MS = 350;

function isPawWindow() {
  return KUROSTEP_WINDOW === "paw";
}

function postShellMessage(message) {
  if (!isEmbeddedContent || window.parent === window) {
    return false;
  }
  window.parent.postMessage({ source: "kurostep-content", ...message }, "*");
  return true;
}

function notifyShellAuthState() {
  postShellMessage({
    type: "auth_state",
    authenticated: Boolean(appState.auth),
  });
}

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
  previousVolume: Number(window.localStorage.getItem("kurostep.previousVolume") || 80),
  volumePanelOpen: false,
  lyricsOverlayVisible: false,
  pawWidgetVisible: readJson("kurostep.pawWidgetVisible") ?? true,
  lyricsPanelExpanded: false,
  settingsOpen: false,
  taskFormOpen: false,
  taskEditing: false,
  tasks: [],
  work: null,
  counts: { TODO: 0, DOING: 0, DONE: 0 },
  playlist: null,
  playlistTracks: [],
  playlistPage: 1,
  currentTrack: null,
  lyric: null,
  lyricSource: null,
  selectedLine: null,
  translation: null,
  translationCache: {},
  translationPending: {},
  preparedTrackId: null,
  linkSaving: false,
};

let playbackTimer = null;
let youtubeApiPromise = null;
let youtubePlayer = null;
let youtubePlayerReady = false;
let youtubePlayerVideoId = "";
let progressScrubbing = false;
let draggedPlaylistTrackId = null;
let syncedPawWindowVisible = null;
let linkImportSequence = 0;

function resetPlaybackPosition() {
  appState.playbackPositionSeconds = 0;
  appState.isPlaying = false;
  appState.preparedTrackId = null;
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

function tuneYoutubeIframe() {
  const iframe = document.querySelector("#youtube-player iframe");
  if (!iframe) {
    return;
  }
  iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
}

async function ensureYoutubePlayer() {
  const videoId = getYoutubeVideoId();
  const playerRoot = document.querySelector("#youtube-player");
  if (!videoId || !playerRoot) {
    throw new Error("재생할 YouTube 영상 정보를 못 찾았어냥.");
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
        tuneYoutubeIframe();
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
          "YouTube 플레이어를 깨우지 못했어냥. 영상 펼치기를 열어 재생 상태를 확인해줘냥.";
        syncPlaybackTimer();
        updatePlaybackDom();
      },
    },
  });

  window.setTimeout(tuneYoutubeIframe, 500);

  return youtubePlayer;
}

async function playCurrentAudio() {
  if (!isYoutubeTrack()) {
    throw new Error("현재 곡은 YouTube 링크가 아니라 바로 재생하기 어렵다냥.");
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
  appState.notice = "YouTube BGM 재생 중이냥.";
}

async function confirmYoutubePlaybackStarted() {
  if (!youtubePlayer?.getPlayerState || !window.YT?.PlayerState) {
    return true;
  }

  await new Promise((resolve) => setTimeout(resolve, 1200));
  const state = youtubePlayer.getPlayerState();
  return state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.BUFFERING;
}

function pauseCurrentAudio() {
  youtubePlayer?.pauseVideo?.();
}

function keepYoutubePlayingAfterOverlayChange() {
  if (!appState.isPlaying || !youtubePlayer?.playVideo) {
    return;
  }

  const resumeIfPaused = () => {
    const state = youtubePlayer?.getPlayerState?.();
    if (!window.YT?.PlayerState || state === window.YT.PlayerState.PAUSED || state === window.YT.PlayerState.CUED) {
      youtubePlayer?.playVideo?.();
    }
    syncPlaybackTimer();
  };

  window.setTimeout(resumeIfPaused, 150);
  window.setTimeout(resumeIfPaused, 700);
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
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const rest = String(wholeSeconds % 60).padStart(2, "0");
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
    minimize: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12h10"/></svg>`,
    arrowLeft: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05-2.12 2.12-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66v.1h-3v-.1a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.05.05-2.12-2.12.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.1h-.1v-3h.1A1.8 1.8 0 0 0 4.6 9a1.8 1.8 0 0 0-.36-1.98l-.05-.05 2.12-2.12.05.05A1.8 1.8 0 0 0 8.34 5.26 1.8 1.8 0 0 0 9.44 3.6v-.1h3v.1a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.05-.05 2.12 2.12-.05.05A1.8 1.8 0 0 0 19.4 9a1.8 1.8 0 0 0 1.66 1.1h.1v3h-.1A1.8 1.8 0 0 0 19.4 15z"/></svg>`,
    shuffle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`,
    grip: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h.01"/><path d="M15 6h.01"/><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M9 18h.01"/><path d="M15 18h.01"/></svg>`,
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
  const controller = new AbortController();
  let timeoutId;
  const headers = {
    "Content-Type": "application/json",
    ...(appState.auth?.accessToken ? { Authorization: `Bearer ${appState.auth.accessToken}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await Promise.race([
      fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      }),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort();
          reject(new Error("서버 응답이 너무 늦다냥. 잠깐 뒤 다시 시도해줘냥."));
        }, API_TIMEOUT_MS);
      }),
    ]);
    const text = await response.text();
    const body = text ? safeJson(text) : null;

    if (!response.ok) {
      const message = body?.message || body?.error || text || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("서버 응답이 너무 늦다냥. 잠깐 뒤 다시 시도해줘냥.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
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
      notifyShellAuthState();
      return true;
    } catch {
      window.localStorage.removeItem("kurostep.auth");
      appState.auth = null;
      notifyShellAuthState();
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
    notifyShellAuthState();
    appState.notice = appState.authMode === "signup" ? "가입 완료냥. 작업실로 들어간다냥." : "어서 와냥. 오늘 발자국을 펼친다냥.";
    await ensureWorkspaceData();
  } catch (error) {
    appState.auth = null;
    notifyShellAuthState();
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
  notifyShellAuthState();
  appState.settingsOpen = false;
  appState.work = null;
  appState.tasks = [];
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

function broadcastWorkspaceChanged() {
  window.localStorage.setItem("kurostep.workspaceChangedAt", String(Date.now()));
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
  appState.tasks = tasks;
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
  appState.playlistTracks = playlistTracks;
  appState.playlistPage = Math.min(appState.playlistPage, getPlaylistPageCount(appState.playlistTracks.length));

  if (appState.work.playlistId !== appState.playlist.id) {
    appState.work = await api(`/api/tasks/${appState.work.id}/playlist/${appState.playlist.id}?userId=${userId}`, {
      method: "PATCH",
    });
    appState.tasks = appState.tasks.map((task) => (task.id === appState.work.id ? appState.work : task));
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
    appState.tasks = appState.tasks.map((task) => (task.id === appState.work.id ? appState.work : task));
  }

  appState.lyric = null;
  appState.lyricSource = null;
  appState.selectedLine = null;
  appState.translation = null;
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
  const searchKeyword = trackDraft.sourceId || trackDraft.title;
  try {
    const results = await api(`/api/tracks/search?keyword=${encodeURIComponent(searchKeyword)}`);
    const existing = results.find(
      (track) =>
        track.sourceType === trackDraft.sourceType &&
        ((trackDraft.sourceId && track.sourceId === trackDraft.sourceId) || track.sourceUrl === trackDraft.sourceUrl),
    );
    if (existing) {
      return existing;
    }
  } catch {
    // Searching by title can fail on remote servers when video titles contain
    // unusual Unicode. Creation is still safe for the demo flow.
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

function youtubeFallbackMetadata(sourceId) {
  return {
    title: `YouTube track ${sourceId}`,
    artist: "YouTube",
  };
}

function withTimeout(promise, timeoutMs, fallback) {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function fetchYoutubeMetadata(sourceUrl, sourceId) {
  const fallback = youtubeFallbackMetadata(sourceId);

  const endpoints = [
    `https://noembed.com/embed?url=${encodeURIComponent(sourceUrl)}`,
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`,
  ];

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, { signal: controller.signal });
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
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return fallback;
}

async function attachTrackToWorkspace(userId, track, makeCurrent = true) {
  await ensurePlaylistTrack(userId, appState.playlist.id, track.id);

  const playlistTracks = await api(`/api/playlists/${appState.playlist.id}/tracks?userId=${userId}`);
  appState.playlistTracks = playlistTracks;

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
  const hadCurrentTrack = Boolean(appState.currentTrack);
  const metadata = await withTimeout(
    fetchYoutubeMetadata(sourceUrl, sourceId),
    METADATA_TIMEOUT_MS + 800,
    youtubeFallbackMetadata(sourceId),
  );
  const track = await findOrCreateTrack({
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.artist,
    sourceType: "YOUTUBE",
    sourceUrl,
    sourceId,
    durationSeconds: null,
  });

  await attachTrackToWorkspace(userId, track, !hadCurrentTrack);
  appState.notice = hadCurrentTrack
    ? "YouTube 링크를 플레이리스트 뒤에 넣었다냥."
    : "첫 곡을 플레이리스트에 넣었다냥. 재생 버튼을 누르면 시작한다냥.";
  broadcastWorkspaceChanged();
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
    .slice(0, 8)
    .map((track, index) => `${index + 1}. ${track.title}`)
    .join("\n");
  const defaultEnd = Math.min(preview.trackCount, PLAYLIST_PAGE_SIZE);
  const rangeAnswer = window.prompt(
    `이 플레이리스트에서 ${preview.trackCount}곡을 찾았다냥.\n몇 번부터 몇 번까지 넣을까냥?\n예: 1-${defaultEnd}\n\n${sample}${preview.trackCount > 8 ? "\n..." : ""}`,
    `1-${defaultEnd}`,
  );

  if (!rangeAnswer) {
    if (fallbackVideoId) {
      await registerSingleTrackFromUrl(userId, playlistUrl, fallbackVideoId);
      return;
    }

    appState.notice = "플레이리스트 추가를 멈췄다냥.";
    return;
  }

  const range = parsePlaylistRange(rangeAnswer, preview.trackCount);
  const selectedTracks = preview.tracks.slice(range.startIndex, range.endIndex + 1);

  let firstTrack = null;
  let addedCount = 0;

  for (const draft of selectedTracks) {
    const track = await findOrCreateTrack(draft);
    firstTrack = firstTrack || track;
    await attachTrackToWorkspace(userId, track, false);
    addedCount += 1;
  }

  if (!appState.currentTrack && firstTrack) {
    const firstPlaylistTrack = appState.playlistTracks.find((item) => item.trackId === firstTrack.id);
    if (firstPlaylistTrack) {
      resetPlaybackPosition();
      appState.currentTrack = await hydratePlaylistTrack(firstPlaylistTrack);
      appState.work = await api(
        `/api/tasks/${appState.work.id}/current-playlist-track/${firstPlaylistTrack.playlistTrackId}?userId=${userId}`,
        { method: "PATCH" },
      );
    }
  }

  appState.playlistPage = Math.ceil(appState.playlistTracks.length / PLAYLIST_PAGE_SIZE);
  appState.notice = `플레이리스트 ${range.startNumber}-${range.endNumber}번, ${addedCount}곡을 뒤에 추가했다냥.`;
  broadcastWorkspaceChanged();
}

function parsePlaylistRange(value, trackCount) {
  const normalized = String(value).replace(/\s/g, "");
  const match = normalized.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    throw new Error("범위는 1-10처럼 적어줘냥.");
  }

  const startNumber = Number(match[1]);
  const endNumber = Number(match[2] || match[1]);
  if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber) || startNumber < 1 || endNumber < startNumber) {
    throw new Error("곡 범위가 이상하다냥. 예: 1-10");
  }
  if (endNumber > trackCount) {
    throw new Error(`이 플레이리스트는 ${trackCount}곡까지만 찾았다냥.`);
  }

  return {
    startNumber,
    endNumber,
    startIndex: startNumber - 1,
    endIndex: endNumber - 1,
  };
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

  const importSequence = ++linkImportSequence;
  appState.linkSaving = true;
  appState.error = "";
  appState.notice = "YouTube 링크를 작업 바구니에 담는 중이냥...";
  refreshLinkWidgetDom();
  updatePlaybackDom();

  const unlockTimer = window.setTimeout(() => {
    if (appState.linkSaving && importSequence === linkImportSequence) {
      appState.linkSaving = false;
      appState.error = "링크 추가가 오래 걸려서 멈췄다냥. 같은 링크를 다시 눌러줘냥.";
      refreshLinkWidgetDom();
      updatePlaybackDom();
    }
  }, API_TIMEOUT_MS + METADATA_TIMEOUT_MS + 1500);

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
    if (importSequence !== linkImportSequence) {
      return;
    }
    appState.linkSaving = false;
    refreshLinkWidgetDom();
    refreshPlaylistWidgetDom();
    updatePlaybackDom();
  } catch (error) {
    if (importSequence !== linkImportSequence) {
      return;
    }
    appState.error = error.message;
    appState.linkSaving = false;
    refreshLinkWidgetDom();
    updatePlaybackDom();
  } finally {
    window.clearTimeout(unlockTimer);
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
    try {
      fetchResponse = await api(`/api/tracks/${trackId}/lyrics/fetch`, { method: "POST" });
      lyricSource = parseLyricSource(fetchResponse);
      writeJson(cacheKey, lyricSource);
    } catch (error) {
      appState.lyric = null;
      appState.lyricSource = null;
      appState.selectedLine = null;
      appState.translation = null;
      appState.notice = `싱크 가사를 아직 못 찾았다냥: ${error.message}`;
      return;
    }
  }

  appState.lyric = fetchResponse?.lyric || (await getLatestLyric(trackId));
  appState.lyricSource = lyricSource;
  appState.selectedLine = chooseLineByPlaybackTime(appState.playbackPositionSeconds || 0) || chooseDisplayLine(appState.lyric, lyricSource);
  if (!appState.selectedLine || (appState.playbackPositionSeconds || 0) === 0) {
    appState.selectedLine = chooseLineByPlaybackTime(appState.playbackPositionSeconds || 0);
    appState.translation = null;
  }

  await ensureSelectedLineTranslation(userId).catch((error) => {
    appState.translation = null;
    appState.notice = `가사는 불러왔고, 번역 메모는 나중에 다시 시도할게냥: ${error.message}`;
  });
  warmUpcomingTranslations(userId);
}

async function prepareCurrentTrackForPlayback() {
  if (!appState.auth?.userId || !appState.currentTrack?.id) {
    return;
  }

  if (appState.preparedTrackId === appState.currentTrack.id && appState.lyricSource?.lines?.length) {
    warmUpcomingTranslations(appState.auth.userId);
    return;
  }

  await ensureLyricAndTranslation(appState.auth.userId, appState.currentTrack.id);
  appState.preparedTrackId = appState.currentTrack.id;
  refreshLyricsWidgetDom();
  await syncLyricsOverlay();
}

async function ensureSelectedLineTranslation(userId, line = appState.selectedLine) {
  if (!line?.text || !line?.id) {
    return;
  }

  const translation = await getLineTranslation(userId, line);
  if (appState.selectedLine?.id === line.id) {
    appState.translation = translation;
  }
  return translation;
}

async function getLineTranslation(userId, line) {
  if (!line?.id || !line?.text) {
    return null;
  }

  const cacheKey = String(line.id);
  if (appState.translationCache[cacheKey]) {
    return appState.translationCache[cacheKey];
  }
  if (appState.translationPending[cacheKey]) {
    return appState.translationPending[cacheKey];
  }

  appState.translationPending[cacheKey] = (async () => {
    const savedTranslations = await api(`/api/lyric-line-refs/${line.id}/translations?userId=${userId}`);
    const savedKorean = savedTranslations.find((translation) => translation.languageCode === "ko") || savedTranslations[0];
    if (savedKorean) {
      appState.translationCache[cacheKey] = savedKorean;
      return savedKorean;
    }

    const created = await api(
      `/api/lyric-line-refs/${line.id}/translations/auto-draft?userId=${userId}`,
      {
        method: "POST",
        body: JSON.stringify({
          sourceText: line.text,
          sourceLanguageCode: "en",
          targetLanguageCode: "ko",
          memoText: readMemoFallback(),
        }),
      },
    );
    appState.translationCache[cacheKey] = created;
    return created;
  })().finally(() => {
    delete appState.translationPending[cacheKey];
  });

  return appState.translationPending[cacheKey];
}

function getCachedTranslation(line) {
  return line?.id ? appState.translationCache[String(line.id)] || null : null;
}

function warmUpcomingTranslations(userId, currentLine = appState.selectedLine) {
  if (!userId || !currentLine?.id) {
    return;
  }

  const refs = appState.lyric?.lines || [];
  const sourceLines = appState.lyricSource?.lines || [];
  const currentIndex = refs.findIndex((line) => line.id === currentLine.id);
  if (currentIndex < 0) {
    return;
  }

  refs.slice(currentIndex, currentIndex + 3).forEach((ref) => {
    const sourceLine = sourceLines.find((line) => line.index === ref.lineIndex);
    const line = {
      id: ref.id,
      lineIndex: ref.lineIndex,
      startTimeMs: ref.startTimeMs,
      text: sourceLine?.text || "",
    };
    getLineTranslation(userId, line).catch(() => {});
  });
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

  const positionMs = positionSeconds * 1000 + LYRIC_SYNC_LOOKAHEAD_MS;
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
  appState.tasks = tasks;
  appState.counts = countTaskStatuses(tasks);
  if (tasks.length) {
    appState.work = tasks.find((task) => task.id === appState.work?.id) || tasks[0];
  } else {
    appState.work = null;
  }
}

function selectTask(taskId) {
  const task = appState.tasks.find((item) => item.id === Number(taskId));
  if (!task || task.id === appState.work?.id) {
    return;
  }

  appState.work = task;
  appState.taskFormOpen = false;
  appState.taskEditing = false;
  appState.notice = `${task.title} 발자국을 펼쳤다냥.`;
  render();
}

async function saveTaskFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = form.elements.title.value.trim();
  const description = form.elements.description.value.trim();
  const taskDate = form.elements.taskDate.value;

  if (!title || !taskDate) {
    appState.error = "할 일 이름과 날짜를 적어줘냥.";
    render();
    return;
  }

  try {
    const payload = { title, description, taskDate };
    if (appState.taskEditing && appState.work?.id) {
      appState.work = await api(`/api/tasks/${appState.work.id}?userId=${appState.auth.userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      appState.notice = "오늘 발자국을 고쳤다냥.";
    } else {
      appState.work = await api(`/api/tasks?userId=${appState.auth.userId}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      appState.notice = "새 할 일을 발자국장에 넣었다냥.";
    }
    appState.taskFormOpen = false;
    appState.taskEditing = false;
    await refreshTasksOnly();
    broadcastWorkspaceChanged();
  } catch (error) {
    appState.error = error.message;
  } finally {
    render();
  }
}

async function deleteCurrentTask() {
  if (!appState.work?.id) {
    return;
  }

  try {
    const deletedTaskId = appState.work.id;
    await api(`/api/tasks/${appState.work.id}?userId=${appState.auth.userId}`, { method: "DELETE" });
    appState.notice = "할 일을 살짝 치웠다냥.";
    appState.tasks = appState.tasks.filter((task) => task.id !== deletedTaskId);
    appState.work = appState.tasks[0] || null;
    await refreshTasksOnly();
    broadcastWorkspaceChanged();
  } catch (error) {
    appState.error = error.message;
  } finally {
    render();
  }
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
    appState.translationCache[String(appState.selectedLine.id)] = appState.translation;
    window.localStorage.setItem("kurostep.translationMemo", memoInput.value);
    appState.notice = "번역 메모를 서버에 콕 저장했다냥";
    broadcastWorkspaceChanged();
  } catch (error) {
    appState.error = error.message;
  } finally {
    render();
  }
}

async function deleteMemo() {
  if (!appState.selectedLine?.id || !appState.translation?.id) {
    appState.notice = "아직 지울 번역 메모가 없다냥.";
    updatePlaybackDom();
    return;
  }
  if (!window.confirm("현재 가사 줄의 번역 메모를 지울까냥?")) {
    return;
  }

  try {
    await api(`/api/lyric-line-refs/${appState.selectedLine.id}/translations?userId=${appState.auth.userId}&languageCode=ko`, {
      method: "DELETE",
    });
    delete appState.translationCache[String(appState.selectedLine.id)];
    appState.translation = null;
    appState.notice = "이 줄의 번역 메모를 지웠다냥.";
    broadcastWorkspaceChanged();
  } catch (error) {
    appState.error = error.message;
  } finally {
    render();
  }
}

async function togglePlayback() {
  appState.error = "";

  try {
    if (!appState.isPlaying) {
      await prepareCurrentTrackForPlayback();
      appState.isPlaying = true;
      updatePlaybackDom();
      await playCurrentAudio();
      const started = await confirmYoutubePlaybackStarted();
      if (!started) {
        appState.isPlaying = false;
        appState.notice = "YouTube가 바로 재생을 막았어냥. 영상 펼치기로 한 번 깨워줘냥.";
      }
    } else {
      pauseCurrentAudio();
      appState.isPlaying = false;
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
      appState.playbackPositionSeconds = youtubePlayer.getCurrentTime() || 0;
      getTrackDurationSeconds();
    } else {
      appState.playbackPositionSeconds += PLAYBACK_TICK_MS / 1000;
    }
    handlePlaybackTick();
  }, PLAYBACK_TICK_MS);
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
    updateLyricsPreviewDom();
    syncLyricsOverlay();
    updatePlaybackDom();
    return;
  }
  if (nextLine && nextLine.id !== appState.selectedLine?.id) {
    appState.selectedLine = nextLine;
    appState.translation = getCachedTranslation(nextLine);
    updateLyricMemoDom();
    updateLyricsPreviewDom();
    if (appState.translation) {
      syncLyricsOverlay();
    }
    ensureSelectedLineTranslation(appState.auth.userId)
      .then(() => {
        warmUpcomingTranslations(appState.auth.userId, nextLine);
        updateLyricMemoDom();
        updateLyricsPreviewDom();
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

function toggleMute() {
  if (appState.volume > 0) {
    appState.previousVolume = appState.volume;
    window.localStorage.setItem("kurostep.previousVolume", String(appState.previousVolume));
    changeVolume(0);
    appState.notice = "소리를 잠깐 숨겼다냥.";
  } else {
    changeVolume(appState.previousVolume || 80);
    appState.notice = "소리를 다시 꺼냈다냥.";
  }
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

  await setCurrentPlaylistTrack(nextTrack, { autoplay: appState.isPlaying });
}

async function setCurrentPlaylistTrack(playlistTrack, options = {}) {
  const autoplay = options.autoplay ?? appState.isPlaying;
  const userId = appState.auth.userId;
  if (playlistTrack.playlistTrackId === appState.currentTrack?.playlistTrackId) {
    if (autoplay && !appState.isPlaying) {
      await togglePlayback();
    }
    return;
  }

  appState.playbackPositionSeconds = 0;
  appState.preparedTrackId = null;
  pauseCurrentAudio();
  youtubePlayer = null;
  youtubePlayerReady = false;
  youtubePlayerVideoId = "";
  appState.work = await api(
    `/api/tasks/${appState.work.id}/current-playlist-track/${playlistTrack.playlistTrackId}?userId=${userId}`,
    { method: "PATCH" },
  );
  appState.currentTrack = await hydratePlaylistTrack(playlistTrack);
  appState.lyric = null;
  appState.lyricSource = null;
  appState.selectedLine = null;
  appState.translation = null;
  appState.notice = "현재 곡을 바꿨다냥";
  appState.isPlaying = Boolean(autoplay);
  render();
  if (autoplay) {
    await playCurrentAudio().catch((error) => {
      appState.error = `재생을 시작하지 못했다냥: ${error.message}`;
      appState.isPlaying = false;
      render();
    });
    syncPlaybackTimer();
    updatePlaybackDom();
  }

  prepareCurrentTrackForPlayback()
    .then(() => {
      if (appState.currentTrack?.playlistTrackId === playlistTrack.playlistTrackId) {
        updateLyricsPreviewDom();
        updatePlaybackDom();
      }
    })
    .catch((error) => {
      if (appState.currentTrack?.playlistTrackId === playlistTrack.playlistTrackId) {
        appState.notice = `가사는 천천히 불러올게냥: ${error.message}`;
        updatePlaybackDom();
      }
    });
}

async function reorderPlaylistTracks(orderedIds) {
  if (!appState.playlist?.id || orderedIds.length !== appState.playlistTracks.length) {
    return;
  }

  try {
    appState.playlistTracks = await api(`/api/playlists/${appState.playlist.id}/tracks/reorder?userId=${appState.auth.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ playlistTrackIds: orderedIds }),
    });
    appState.notice = "재생 순서를 다시 맞췄다냥.";
    broadcastWorkspaceChanged();
  } catch (error) {
    appState.error = error.message;
  } finally {
    render();
  }
}

async function shufflePlaylistTracks() {
  if (appState.playlistTracks.length < 2) {
    appState.notice = "섞을 곡이 아직 부족하다냥.";
    updatePlaybackDom();
    return;
  }

  const orderedIds = appState.playlistTracks.map((track) => track.playlistTrackId);
  for (let index = orderedIds.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [orderedIds[index], orderedIds[randomIndex]] = [orderedIds[randomIndex], orderedIds[index]];
  }

  await reorderPlaylistTracks(orderedIds);
  appState.notice = "플레이리스트를 랜덤 발걸음으로 섞었다냥.";
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
  const payload = {
    visible: true,
    line: appState.selectedLine?.text || "",
    translation: appState.translation?.translatedText || "",
  };
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    try {
      await invoke("set_lyrics_visible", payload);
      keepYoutubePlayingAfterOverlayChange();
    } catch (error) {
      appState.error = `가사 오버레이 갱신을 못 했다냥: ${error.message || error}`;
    }
    return;
  }

  postShellMessage({
    type: "native_command",
    command: "set_lyrics_visible",
    payload,
  });
  keepYoutubePlayingAfterOverlayChange();
}

function hasSyncedLyricLines() {
  const refs = appState.lyric?.lines || [];
  return refs.some((line) => Number.isFinite(line.startTimeMs));
}

function lyricSyncStatusText() {
  if (!appState.currentTrack) {
    return "곡을 고르면 가사를 찾아볼게냥.";
  }
  if (!appState.lyricSource?.lines?.length) {
    return "아직 불러온 가사가 없다냥.";
  }
  if (!hasSyncedLyricLines()) {
    return "시간표가 없는 가사라 자동 싱크는 못 맞춘다냥.";
  }
  return "";
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

function updateLyricsPreviewDom() {
  const preview = document.querySelector(".lyrics-preview");
  const currentLine = preview?.querySelector(":scope > p");
  if (!preview || !currentLine) {
    return;
  }

  const syncStatus = lyricSyncStatusText();
  currentLine.textContent = appState.selectedLine?.text || syncStatus || "아직 재생 중이 아닙니다";
  preview.classList.toggle("playing", appState.isPlaying);

  document.querySelectorAll(".lyrics-line").forEach((item) => {
    const index = Number(item.getAttribute("data-line-index"));
    item.classList.toggle("active", Number.isFinite(index) && index === appState.selectedLine?.lineIndex);
  });
}

function updateGlobalControlsDom() {
  const pawButton = document.querySelector("#toggle-paw-widget");
  if (pawButton) {
    pawButton.classList.toggle("primary", appState.pawWidgetVisible);
    pawButton.setAttribute("aria-pressed", String(appState.pawWidgetVisible));
    pawButton.textContent = `작업 발자국 ${appState.pawWidgetVisible ? "ON" : "OFF"}`;
  }

  const lyricsButton = document.querySelector("#global-lyrics-toggle");
  if (lyricsButton) {
    lyricsButton.classList.toggle("primary", appState.lyricsOverlayVisible);
    lyricsButton.setAttribute("aria-pressed", String(appState.lyricsOverlayVisible));
    lyricsButton.textContent = `가사 오버레이 ${appState.lyricsOverlayVisible ? "ON" : "OFF"}`;
  }
}

function bindLinkImportAction() {
  bindLinkImportAction();
}

function refreshLinkWidgetDom() {
  const current = document.querySelector(".link-widget");
  if (!current) {
    return;
  }
  current.outerHTML = youtubeLinkWidget();
  bindLinkImportAction();
}

function refreshPlaylistWidgetDom() {
  const current = document.querySelector(".playlist-widget");
  if (!current) {
    return;
  }
  current.outerHTML = playlistWidget(appState.playlistTracks);
  bindPlaylistInteractions();
}

function bindLyricsPanelToggle() {
  document.querySelector("#lyrics-panel-toggle")?.addEventListener("click", () => {
    appState.lyricsPanelExpanded = !appState.lyricsPanelExpanded;
    refreshLyricsWidgetDom();
  });
}

function refreshLyricsWidgetDom() {
  const current = document.querySelector(".lyrics-widget");
  if (!current) {
    return;
  }
  current.outerHTML = lyricsWidget();
  bindLyricsPanelToggle();
  updateLyricsPreviewDom();
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

function widgetShell(content, options = {}) {
  if (isEmbeddedContent) {
    return `<section class="embedded-content">${content}</section>`;
  }

  const title = options.title || "KuroStep";
  const rightAction = options.rightAction ?? (!isPawWindow() ? (appState.auth ? "settings" : "exit") : "none");
  const rightButton =
    rightAction === "settings"
      ? `<div class="header-actions">
          <button class="ghost-header-button icon-text" id="settings-open" type="button">${iconSvg("settings")}<span>설정</span></button>
          <button class="ghost-header-button" id="app-exit-button" type="button">종료</button>
        </div>`
      : rightAction === "exit"
        ? `<div class="header-actions">
            <button class="ghost-header-button" id="app-exit-button" type="button">종료</button>
          </div>`
      : "";

  return `
    <section class="widget-container">
      <header class="mac-header" id="window-drag-region" data-tauri-drag-region>
        <div class="window-tools">
          <button class="window-tool-button" id="window-minimize" type="button" aria-label="최소화" title="최소화">
            ${iconSvg("minimize")}
          </button>
        </div>
        <strong class="window-title" data-tauri-drag-region>
          <span class="app-mark" aria-hidden="true">
            <img src="./assets/paw-print-neutral.svg" alt="" />
          </span>
          ${escapeHtml(title)}
        </strong>
        ${rightButton || `<span></span>`}
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

function settingsWidget() {
  return `
    <section class="settings-screen" aria-labelledby="settings-title">
      <button class="settings-back-button" id="settings-back" type="button" aria-label="돌아가기" title="돌아가기">
        ${iconSvg("arrowLeft")}
      </button>
      <div class="settings-head">
        <p class="auth-eyebrow">SETTINGS</p>
        <h1 id="settings-title">작업실 설정</h1>
        <p>계정 정보와 로그아웃을 조용히 정리한다냥.</p>
      </div>
      <div class="settings-list">
        <div class="settings-card">
          <strong>로그인 계정</strong>
          <span>${escapeHtml(appState.auth?.email || "로그인 정보 없음")}</span>
        </div>
        <div class="settings-card">
          <strong>닉네임</strong>
          <span>${escapeHtml(appState.auth?.nickname || "이름 없는 작업실")}</span>
        </div>
      </div>
      <div class="settings-actions">
        <button class="action-button danger" id="settings-logout" type="button">로그아웃</button>
      </div>
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

function globalControlsWidget() {
  return `
    <div class="global-widget-controls" aria-label="위젯 열고 닫기">
      <button class="action-button ${appState.pawWidgetVisible ? "primary" : ""}" id="toggle-paw-widget" type="button" aria-pressed="${appState.pawWidgetVisible}">
        작업 발자국 ${appState.pawWidgetVisible ? "ON" : "OFF"}
      </button>
      <button class="action-button ${appState.lyricsOverlayVisible ? "primary" : ""}" id="global-lyrics-toggle" type="button" aria-pressed="${appState.lyricsOverlayVisible}">
        가사 오버레이 ${appState.lyricsOverlayVisible ? "ON" : "OFF"}
      </button>
    </div>
  `;
}

function taskFormWidget(work) {
  if (!appState.taskFormOpen) {
    return "";
  }

  const title = appState.taskEditing ? work?.title || "" : "";
  const description = appState.taskEditing ? work?.description || "" : "";
  const taskDate = appState.taskEditing ? work?.taskDate || todayIso() : todayIso();

  return `
    <form class="task-form" id="task-form">
      <label>할 일 이름<input class="form-input" name="title" value="${escapeHtml(title)}" placeholder="오늘 그릴 컷 정리" required /></label>
      <label>발자국 날짜<input class="form-input" name="taskDate" type="date" value="${escapeHtml(taskDate)}" required /></label>
      <label class="wide">짧은 메모<textarea class="memo-input" name="description" rows="2" placeholder="오늘 작업 목표를 적어줘냥">${escapeHtml(description)}</textarea></label>
      <div class="button-row">
        <button class="action-button primary" type="submit">${appState.taskEditing ? "수정 저장" : "할 일 추가"}</button>
        <button class="action-button" id="cancel-task-form" type="button">닫기</button>
      </div>
    </form>
  `;
}

function taskListWidget(tasks, selectedTask) {
  if (!tasks.length) {
    return `<p class="state-message">오늘 찍을 발자국이 아직 없다냥.</p>`;
  }

  return `
    <ol class="todo-list" aria-label="오늘 할 일 목록">
      ${tasks
        .map((task) => {
          const selected = task.id === selectedTask?.id ? " selected" : "";
          return `
            <li>
              <button class="todo-item${selected}" data-task-id="${escapeHtml(task.id)}" type="button" aria-pressed="${task.id === selectedTask?.id}">
                <span class="todo-status-dot ${escapeHtml(task.status || "TODO")}"></span>
                <span class="todo-text">
                  <strong>${escapeHtml(task.title)}</strong>
                  <small>${escapeHtml(task.description || task.taskDate || "메모 없는 발자국")}</small>
                </span>
                <span class="todo-status-label">${escapeHtml(statusLabel(task.status))}</span>
              </button>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
}

function todayWorkWidget(work, counts, tasks = []) {
  if (!work) {
    return `
      <section class="widget-section today-work" aria-labelledby="today-work-title">
        <div class="task-list-head">
          ${sectionHeader("오늘 할 일")}
          <button class="mini-icon-button" id="open-task-create" type="button" title="할 일 추가" aria-label="할 일 추가">${iconSvg("plus")}</button>
        </div>
        ${taskListWidget(tasks, work)}
        ${taskFormWidget(null)}
      </section>
    `;
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
      <div class="task-list-head">
        ${sectionHeader("오늘 할 일")}
        <button class="mini-icon-button" id="open-task-create" type="button" title="할 일 추가" aria-label="할 일 추가">${iconSvg("plus")}</button>
      </div>
      ${taskListWidget(tasks, work)}
      <div class="task-header">
        <h3 class="task-title" id="today-work-title">${escapeHtml(work.title)}</h3>
        <div class="task-actions">
          <button class="mini-icon-button" id="open-task-edit" type="button" title="할 일 수정" aria-label="할 일 수정">${iconSvg("edit")}</button>
          <button class="mini-icon-button danger" id="delete-task" type="button" title="할 일 삭제" aria-label="할 일 삭제">${iconSvg("trash")}</button>
        </div>
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
      ${taskFormWidget(work)}
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

function getPlaylistPageCount(trackCount) {
  return Math.max(Math.ceil(trackCount / PLAYLIST_PAGE_SIZE), 1);
}

function playlistWidget(tracks) {
  if (!tracks.length) {
    return emptySection("PLAYLIST", "플레이리스트가 아직 조용하다냥.");
  }

  const pageCount = getPlaylistPageCount(tracks.length);
  const currentPage = Math.min(Math.max(appState.playlistPage, 1), pageCount);
  const startIndex = (currentPage - 1) * PLAYLIST_PAGE_SIZE;
  const pagedTracks = tracks.slice(startIndex, startIndex + PLAYLIST_PAGE_SIZE);

  const items = pagedTracks
    .map((track, index) => {
      const playing = track.playlistTrackId === appState.currentTrack?.playlistTrackId || (!appState.currentTrack && index === 0) ? " playing" : "";
      const duration = track.durationSeconds || (track.trackId === appState.currentTrack?.id ? appState.currentTrack.durationSeconds : null);
      return `
        <li class="playlist-item${playing}" draggable="true" data-playlist-track-id="${escapeHtml(track.playlistTrackId)}">
          <button class="drag-handle" type="button" title="끌어서 순서 바꾸기" aria-label="끌어서 순서 바꾸기">${iconSvg("grip")}</button>
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
      <div class="section-head">
        <h2 class="section-title">PLAYLIST</h2>
        <button class="mini-icon-button" id="shuffle-playlist" type="button" title="셔플" aria-label="셔플">${iconSvg("shuffle")}</button>
      </div>
      <p class="playlist-name">${escapeHtml(appState.playlist?.name || "")} · ${escapeHtml(String(tracks.length))}곡 · ${escapeHtml(String(currentPage))}/${escapeHtml(String(pageCount))}쪽</p>
      <ol class="playlist-list" id="playlist-title">
        ${items}
      </ol>
      ${
        pageCount > 1
          ? `<div class="playlist-pager" aria-label="플레이리스트 페이지">
              <button class="action-button" id="playlist-prev-page" type="button" ${currentPage <= 1 ? "disabled" : ""}>이전 10곡</button>
              <button class="action-button" id="playlist-next-page" type="button" ${currentPage >= pageCount ? "disabled" : ""}>다음 10곡</button>
            </div>`
          : ""
      }
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
        <button class="action-button danger" id="delete-memo" type="button">메모 삭제</button>
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
    "task-paw-widget lyric-paw-widget",
    "작업 발자국",
    "오늘 할 일과 번역 메모를 한 발자국씩 만진다냥",
    `
      ${todayWorkWidget(appState.work, appState.counts, appState.tasks)}
      ${lyricMemoWidget(appState.selectedLine, appState.translation)}
    `
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
  const syncStatus = lyricSyncStatusText();
  const lineText = currentLine || syncStatus || "아직 재생 중이 아닙니다";
  const sourceLines = appState.lyricSource?.lines || [];
  const fullLyrics = sourceLines.length
    ? sourceLines
        .map((line) => {
          const active = line.index === appState.selectedLine?.lineIndex ? " active" : "";
          const timestamp = Number.isFinite(line.startTimeMs) ? formatTimestamp(line.startTimeMs) : "--:--";
          return `
            <li class="lyrics-line${active}" data-line-index="${escapeHtml(line.index)}">
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
        ${syncStatus && currentLine ? `<small>${escapeHtml(syncStatus)}</small>` : ""}
        ${appState.lyricsPanelExpanded ? `<ol class="lyrics-full-list" id="lyrics-full-list">${fullLyrics}</ol>` : ""}
      </div>
    </section>
  `;
}

function render() {
  const app = document.querySelector("#app");
  if (!appState.auth) {
    app.innerHTML = widgetShell(
      isPawWindow() ? `<p class="app-status">로그인하면 작업 발자국이 열린다냥.</p>` : authWidget(),
      isPawWindow() ? { title: "작업 발자국", rightAction: "none" } : {},
    );
    bindWindowControls();
    if (!isPawWindow()) {
      bindAuthActions();
    }
    notifyShellAuthState();
    return;
  }

  if (appState.settingsOpen && !isPawWindow()) {
    app.innerHTML = widgetShell(settingsWidget(), { title: "KuroStep", rightAction: "none" });
    bindWindowControls();
    bindSettingsActions();
    notifyShellAuthState();
    return;
  }

  if (isPawWindow()) {
    app.innerHTML = widgetShell(`
      ${appNoticeWidget()}
      <div class="widget-stack" aria-label="작업 발자국 위젯">
        ${taskPawWidget()}
      </div>
    `, { title: "작업 발자국", rightAction: "none" });

    bindWindowControls();
    bindActions();
    notifyShellAuthState();
    return;
  }

  app.innerHTML = widgetShell(`
    ${appNoticeWidget()}
    ${globalControlsWidget()}
    <div class="widget-stack" aria-label="KuroStep 위젯 모음">
      ${musicPlayerWidget()}
      ${lyricsWidget()}
    </div>
    ${!isTauriApp && !isEmbeddedContent && appState.pawWidgetVisible ? `<aside class="detached-widget paw-detached-widget" aria-label="작업 발자국 위젯">${taskPawWidget()}</aside>` : ""}
  `);

  bindWindowControls();
  bindActions();
  syncPawWidgetWindowIfNeeded();
  notifyShellAuthState();
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
  document.querySelector("#settings-open")?.addEventListener("click", () => {
    appState.settingsOpen = true;
    render();
  });
  document.querySelector("#app-exit-button")?.addEventListener("click", exitApplication);
  document.querySelector("#toggle-paw-widget")?.addEventListener("click", () => {
    setPawWidgetVisible(!appState.pawWidgetVisible);
  });
  document.querySelector("#global-lyrics-toggle")?.addEventListener("click", async () => {
    await setLyricsOverlayVisible(!appState.lyricsOverlayVisible);
    updateGlobalControlsDom();
    updateLyricsPreviewDom();
  });
  document.querySelector("#open-task-create")?.addEventListener("click", () => {
    appState.taskFormOpen = true;
    appState.taskEditing = false;
    render();
  });
  document.querySelector("#open-task-edit")?.addEventListener("click", () => {
    appState.taskFormOpen = true;
    appState.taskEditing = true;
    render();
  });
  document.querySelector("#cancel-task-form")?.addEventListener("click", () => {
    appState.taskFormOpen = false;
    appState.taskEditing = false;
    render();
  });
  document.querySelector("#task-form")?.addEventListener("submit", saveTaskFromForm);
  document.querySelector("#delete-task")?.addEventListener("click", deleteCurrentTask);
  document.querySelectorAll("[data-task-id]").forEach((button) => {
    button.addEventListener("click", () => selectTask(button.dataset.taskId));
  });
  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => changeStatus(button.dataset.status));
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
  bindLyricsPanelToggle();
  document.querySelector("#play-toggle")?.addEventListener("click", togglePlayback);
  document.querySelector("#skip-back")?.addEventListener("click", () => skipPlayback(-10));
  document.querySelector("#skip-forward")?.addEventListener("click", () => skipPlayback(10));
  bindProgressScrubber();
  document.querySelector("#volume-toggle")?.addEventListener("click", toggleMute);
  document.querySelector("#volume-slider")?.addEventListener("input", (event) => {
    changeVolume(event.target.value);
  });
  document.querySelector("#previous-track")?.addEventListener("click", () => movePlaylistTrack(-1));
  document.querySelector("#next-track")?.addEventListener("click", () => movePlaylistTrack(1));
  document.querySelector("#repeat-toggle")?.addEventListener("click", toggleRepeatMode);
  document.querySelector("#shuffle-playlist")?.addEventListener("click", shufflePlaylistTracks);
  document.querySelector("#playlist-prev-page")?.addEventListener("click", () => {
    appState.playlistPage = Math.max(appState.playlistPage - 1, 1);
    render();
  });
  document.querySelector("#playlist-next-page")?.addEventListener("click", () => {
    appState.playlistPage = Math.min(appState.playlistPage + 1, getPlaylistPageCount(appState.playlistTracks.length));
    render();
  });
  document.querySelector("#save-memo")?.addEventListener("click", saveMemo);
  document.querySelector("#delete-memo")?.addEventListener("click", deleteMemo);
  document.querySelector("#register-track-link")?.addEventListener("click", registerTrackFromInputs);
  bindPlaylistInteractions();
  document.querySelector("#auto-translate")?.addEventListener("click", async () => {
    await ensureLyricAndTranslation(appState.auth.userId, appState.currentTrack.id);
    render();
  });
}

function bindSettingsActions() {
  document.querySelector("#settings-back")?.addEventListener("click", () => {
    appState.settingsOpen = false;
    render();
  });
  document.querySelector("#settings-logout")?.addEventListener("click", logout);
}

function bindPlaylistInteractions() {
  document.querySelectorAll("[data-playlist-track-id]").forEach((item) => {
    const playlistTrackId = Number(item.dataset.playlistTrackId);
    const playlistTrack = appState.playlistTracks.find((track) => track.playlistTrackId === playlistTrackId);

    item.addEventListener("click", (event) => {
      if (event.target.closest(".drag-handle")) {
        return;
      }
      if (playlistTrack) {
        setCurrentPlaylistTrack(playlistTrack, { autoplay: true });
      }
    });

    item.addEventListener("dragstart", (event) => {
      draggedPlaylistTrackId = playlistTrackId;
      item.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", String(playlistTrackId));
      event.dataTransfer?.setDragImage?.(item, 20, 12);
    });

    item.addEventListener("dragend", () => {
      draggedPlaylistTrackId = null;
      item.classList.remove("dragging");
      document.querySelectorAll(".playlist-item.drag-over").forEach((node) => node.classList.remove("drag-over"));
    });

    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      item.classList.add("drag-over");
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });

    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("drag-over");
      const fromId = Number(event.dataTransfer?.getData("text/plain") || draggedPlaylistTrackId);
      const toId = playlistTrackId;
      if (!fromId || fromId === toId) {
        return;
      }

      const orderedIds = appState.playlistTracks.map((track) => track.playlistTrackId);
      const fromIndex = orderedIds.indexOf(fromId);
      const toIndex = orderedIds.indexOf(toId);
      if (fromIndex < 0 || toIndex < 0) {
        return;
      }
      orderedIds.splice(fromIndex, 1);
      orderedIds.splice(toIndex, 0, fromId);
      reorderPlaylistTracks(orderedIds);
    });
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

async function exitApplication() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    try {
      await invoke("exit_app");
      return;
    } catch (error) {
      appState.error = `앱을 한 번에 종료하지 못했다냥: ${error.message || error}`;
      render();
      return;
    }
  }

  if (postShellMessage({ type: "native_command", command: "exit_app" })) {
    return;
  }

  closeWidget();
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
  document.querySelector("#window-minimize")?.addEventListener("click", minimizeWidget);
  document.querySelectorAll("[data-tauri-drag-region]").forEach((region) => {
    region.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button, input, textarea, select, a, [role='button']")) {
        return;
      }
      startWindowDrag();
    });
  });
  document.querySelector(".widget-container")?.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      event.target.closest(".widget-content, button, input, textarea, select, a, [role='button']")
    ) {
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
      keepYoutubePlayingAfterOverlayChange();
      appState.notice = visible ? "가사 창 띄웠다냥." : "가사 창 접었다냥.";
    } catch (error) {
      appState.error = `가사 창을 못 열었다냥: ${error.message || error}`;
    }
  } else if (
    postShellMessage({
      type: "native_command",
      command: "set_lyrics_visible",
      payload: {
        visible,
        line: appState.selectedLine?.text || "",
        translation: appState.translation?.translatedText || "",
      },
    })
  ) {
    keepYoutubePlayingAfterOverlayChange();
    appState.notice = visible ? "가사 창 띄웠다냥." : "가사 창 접었다냥.";
  } else {
    appState.notice = visible ? "브라우저 미리보기라 위젯 안에 자막 보여준다냥." : "자막 프리뷰 접었다냥.";
  }

  updatePlaybackDom();
}

async function setPawWidgetVisible(visible) {
  appState.pawWidgetVisible = visible;
  window.localStorage.setItem("kurostep.pawWidgetVisible", JSON.stringify(visible));

  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    try {
      await invoke("set_paw_visible", { visible });
      appState.notice = visible ? "작업 발자국 창을 펼쳤다냥." : "작업 발자국 창을 접었다냥.";
    } catch (error) {
      appState.error = `작업 발자국 창을 못 열었다냥: ${error.message || error}`;
    }
  } else if (postShellMessage({ type: "native_command", command: "set_paw_visible", payload: { visible } })) {
    appState.notice = visible ? "작업 발자국 창을 펼쳤다냥." : "작업 발자국 창을 접었다냥.";
  } else {
    appState.notice = visible ? "작업 발자국을 펼쳤다냥." : "작업 발자국을 접었다냥.";
  }

  render();
}

async function syncPawWidgetWindowIfNeeded() {
  const invoke = window.__TAURI__?.core?.invoke;
  if ((!invoke && !isEmbeddedContent) || !appState.auth) {
    return;
  }
  if (syncedPawWindowVisible === appState.pawWidgetVisible) {
    return;
  }

  try {
    if (invoke) {
      await invoke("set_paw_visible", { visible: appState.pawWidgetVisible });
    } else {
      postShellMessage({
        type: "native_command",
        command: "set_paw_visible",
        payload: { visible: appState.pawWidgetVisible },
      });
    }
    syncedPawWindowVisible = appState.pawWidgetVisible;
  } catch {
    // The browser preview does not have a native paw window.
  }
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeWidget();
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === "kurostep.auth") {
    appState.auth = readJson("kurostep.auth");
    loadDashboard();
    return;
  }

  if (event.key === "kurostep.workspaceChangedAt" && appState.auth) {
    loadDashboard();
  }
});

window.addEventListener("message", (event) => {
  if (!event.data || event.data.source !== "kurostep-shell") {
    return;
  }

  if (event.data.action === "open_settings" && appState.auth && !isPawWindow()) {
    appState.settingsOpen = true;
    render();
  }
});

render();
loadDashboard();
