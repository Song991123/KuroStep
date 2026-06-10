import {
  ChevronDown,
  ChevronUp,
  Edit3,
  ListMusic,
  LogOut,
  Minus,
  Pause,
  Play,
  Plus,
  Save,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, api, authErrorMessage, readJson, removeStorage, todayIso, writeJson } from "./lib/api";
import { countStatuses, formatDuration, statusLabel } from "./lib/format";
import { extractYoutubeId, extractYoutubePlaylistId, fetchYoutubeMetadata, loadYoutubeApi } from "./lib/youtube";
import type {
  AuthUser,
  CreatorTask,
  LyricLine,
  Playlist,
  PlaylistTrack,
  SavedLyricPiece,
  Track,
  Translation,
  YoutubePlayer,
} from "./types";

const PLAYLIST_PAGE_SIZE = 10;

const query = new URLSearchParams(window.location.search);
const windowKind = query.get("window") || window.KUROSTEP_WINDOW || "main";
const embedded = query.get("embedded") === "1";

function postShellMessage(message: Record<string, unknown>) {
  if (!embedded || window.parent === window) {
    return false;
  }
  window.parent.postMessage({ source: "kurostep-content", ...message }, "*");
  return true;
}

function notifyShellAuthState(auth: AuthUser | null) {
  postShellMessage({
    type: "auth_state",
    authenticated: Boolean(auth),
  });
}

function nativeCommand(command: string, payload: Record<string, unknown> = {}) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    return invoke(command, payload);
  }
  postShellMessage({ type: "native_command", command, payload });
  return Promise.resolve();
}

function makeNotice(text: string) {
  return text || "오늘 작업 위젯 준비 완료냥";
}

export default function App() {
  const [auth, setAuth] = useState<AuthUser | null>(() => readJson<AuthUser>("kurostep.auth"));
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<CreatorTask[]>([]);
  const [work, setWork] = useState<CreatorTask | null>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [playlistPage, setPlaylistPage] = useState(1);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskEditing, setTaskEditing] = useState(false);
  const [lyricsOverlayVisible, setLyricsOverlayVisibleState] = useState(false);
  const [pawVisible, setPawVisibleState] = useState<boolean>(() => readJson<boolean>("kurostep.pawWidgetVisible", true) ?? true);
  const [lyricPanelOpen, setLyricPanelOpen] = useState(false);
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [currentLine, setCurrentLine] = useState<LyricLine | null>(null);
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [savedPieces, setSavedPieces] = useState<SavedLyricPiece[]>(() => readJson<SavedLyricPiece[]>("kurostep.savedLyricPieces", []) ?? []);
  const [linkSaving, setLinkSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => Number(window.localStorage.getItem("kurostep.volume") || 80));
  const [mutedVolume, setMutedVolume] = useState(() => Number(window.localStorage.getItem("kurostep.previousVolume") || 80));
  const [youtubePanelOpen, setYoutubePanelOpen] = useState(false);
  const playerRef = useRef<YoutubePlayer | null>(null);
  const playerReadyRef = useRef(false);
  const playerVideoIdRef = useRef("");
  const timerRef = useRef<number | null>(null);

  const counts = useMemo(() => countStatuses(tasks), [tasks]);
  const view = windowKind === "paw" ? "paw" : "main";

  const clearPlayerTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!auth?.accessToken) {
      setLoading(false);
      notifyShellAuthState(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const me = await api("/api/auth/me", {}, auth);
      const nextAuth = { ...me, accessToken: auth.accessToken };
      setAuth(nextAuth);
      writeJson("kurostep.auth", nextAuth);
      notifyShellAuthState(nextAuth);

      let nextTasks = await api(`/api/tasks/today?userId=${nextAuth.userId}`, {}, nextAuth);
      if (nextTasks.length === 0) {
        await api(
          `/api/tasks?userId=${nextAuth.userId}`,
          {
            method: "POST",
            body: JSON.stringify({
              title: "오늘의 작업 발자국 정리",
              description: "작업 카드와 BGM, 가사 라인, 번역 메모를 한곳에 모아요.",
              taskDate: todayIso(),
            }),
          },
          nextAuth,
        );
        nextTasks = await api(`/api/tasks/today?userId=${nextAuth.userId}`, {}, nextAuth);
      }

      let nextPlaylists = await api(`/api/playlists?userId=${nextAuth.userId}`, {}, nextAuth);
      if (nextPlaylists.length === 0) {
        await api(
          `/api/playlists?userId=${nextAuth.userId}`,
          {
            method: "POST",
            body: JSON.stringify({
              name: "오늘의 작업 BGM",
              description: "작업 카드에 연결할 곡을 직접 담는 플레이리스트",
            }),
          },
          nextAuth,
        );
        nextPlaylists = await api(`/api/playlists?userId=${nextAuth.userId}`, {}, nextAuth);
      }

      const nextPlaylist = nextPlaylists[0];
      const selectedTask = nextTasks.find((task) => task.status === "DOING") || nextTasks[0];
      let linkedTask = selectedTask;
      if (selectedTask?.playlistId !== nextPlaylist.id) {
        linkedTask = await api(`/api/tasks/${selectedTask.id}/playlist/${nextPlaylist.id}?userId=${nextAuth.userId}`, { method: "PATCH" }, nextAuth);
        nextTasks = nextTasks.map((task) => (task.id === linkedTask.id ? linkedTask : task));
      }

      const tracks = await api(`/api/playlists/${nextPlaylist.id}/tracks?userId=${nextAuth.userId}`, {}, nextAuth);
      const currentPlaylistTrack =
        tracks.find((track) => track.playlistTrackId === linkedTask.currentPlaylistTrackId) || tracks[0] || null;
      const hydrated = currentPlaylistTrack ? await api(`/api/tracks/${currentPlaylistTrack.trackId}`, {}, nextAuth) : null;

      setTasks(nextTasks);
      setWork(linkedTask);
      setPlaylist(nextPlaylist);
      setPlaylistTracks(tracks);
      setCurrentTrack(hydrated ? { ...hydrated, playlistTrackId: currentPlaylistTrack.playlistTrackId } : null);
      setNotice("오늘 발자국장 준비 완료냥");
    } catch (loadError) {
      removeStorage("kurostep.auth");
      setAuth(null);
      notifyShellAuthState(null);
      setError(`작업 정보를 못 불러왔다냥: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    notifyShellAuthState(auth);
  }, [auth]);

  useEffect(() => {
    const onMessage = (event) => {
      if (!event.data || event.data.source !== "kurostep-shell") {
        return;
      }
      if (event.data.action === "open_settings" && auth && view === "main") {
        setSettingsOpen(true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [auth, view]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === "kurostep.savedLyricPieces" || event.key === "kurostep.savedLyricPiecesChangedAt") {
        setSavedPieces(readJson("kurostep.savedLyricPieces", []));
      }
      if (event.key === "kurostep.auth") {
        setAuth(readJson("kurostep.auth"));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ensurePlayer = useCallback(async () => {
    const videoId = extractYoutubeId(currentTrack?.sourceUrl || "");
    if (!videoId) {
      throw new Error("재생할 YouTube 영상 ID가 없다냥.");
    }
    const YT = await loadYoutubeApi();

    if (playerRef.current && playerReadyRef.current) {
      if (playerVideoIdRef.current !== videoId) {
        playerVideoIdRef.current = videoId;
        playerRef.current.cueVideoById({ videoId, startSeconds: 0 });
      }
      return playerRef.current;
    }

    playerVideoIdRef.current = videoId;
    playerReadyRef.current = false;

    return new Promise<YoutubePlayer>((resolve) => {
      playerRef.current = new YT.Player("youtube-player", {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            playerReadyRef.current = true;
            event.target.setVolume(volume);
            resolve(event.target);
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              setIsPlaying(true);
            }
            if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
              setIsPlaying(false);
            }
          },
        },
      });
    });
  }, [currentTrack, volume]);

  useEffect(() => {
    if (!isPlaying) {
      clearPlayerTimer();
      return;
    }
    clearPlayerTimer();
    timerRef.current = window.setInterval(() => {
      const player = playerRef.current;
      const nextPosition = player?.getCurrentTime?.() || 0;
      const nextDuration = player?.getDuration?.() || currentTrack?.durationSeconds || 0;
      setPosition(nextPosition);
      setDuration(nextDuration);
      const line = chooseCurrentLine(lyricLines, nextPosition);
      setCurrentLine(line);
    }, 300);
    return clearPlayerTimer;
  }, [clearPlayerTimer, currentTrack, isPlaying, lyricLines]);

  useEffect(() => {
    nativeCommand("set_lyrics_visible", {
      visible: lyricsOverlayVisible,
      line: currentLine?.text || "",
      translation: translation?.translatedText || "",
    }).catch(() => {});
  }, [currentLine, lyricsOverlayVisible, translation]);

  async function submitAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const nickname = String(form.get("nickname") || "").trim();

    if (!email || !password || (authMode === "signup" && !nickname)) {
      setError("이메일, 비밀번호, 닉네임을 확인해줘냥.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice(authMode === "signup" ? "가입 정보 정리 중이냥..." : "작업실 문 여는 중이냥...");

    try {
      const payload = authMode === "signup" ? { email, password, nickname } : { email, password };
      const nextAuth = await api(authMode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      writeJson("kurostep.auth", nextAuth);
      setAuth(nextAuth);
      setNotice(authMode === "signup" ? "가입 완료냥. 작업실로 들어간다냥." : "어서 와냥. 오늘 발자국을 펼친다냥.");
    } catch (authError) {
      setError(authErrorMessage(authError, authMode));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearPlayerTimer();
    playerRef.current?.pauseVideo?.();
    removeStorage("kurostep.auth");
    setAuth(null);
    notifyShellAuthState(null);
    setSettingsOpen(false);
    setNotice("다음 작업 때 또 보자냥.");
  }

  async function togglePlay() {
    if (!currentTrack) {
      setNotice("먼저 YouTube 링크를 넣어줘냥.");
      return;
    }
    const player = await ensurePlayer();
    if (isPlaying) {
      player.pauseVideo?.();
      setIsPlaying(false);
    } else {
      player.seekTo?.(position || 0, true);
      player.playVideo?.();
      setIsPlaying(true);
    }
  }

  async function addYoutubeLink(url) {
    const sourceUrl = String(url || "").trim();
    const sourceId = extractYoutubeId(sourceUrl);
    const playlistId = extractYoutubePlaylistId(sourceUrl);

    if (!sourceId && !playlistId) {
      setError("YouTube 영상이나 플레이리스트 링크를 넣어줘냥.");
      return;
    }
    if (playlistId && !sourceId) {
      setError("플레이리스트 대량 추가는 React 2차에서 범위 선택 모달로 옮길게냥. 지금은 영상 링크부터 넣어줘냥.");
      return;
    }

    setLinkSaving(true);
    setError("");
    setNotice("YouTube 링크를 BGM 바구니에 담는 중이냥...");
    try {
      const metadata = await fetchYoutubeMetadata(sourceUrl, sourceId);
      const track = await api(
        "/api/tracks",
        {
          method: "POST",
          body: JSON.stringify({
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.artist,
            sourceType: "YOUTUBE",
            sourceUrl,
            sourceId,
            durationSeconds: null,
          }),
        },
        auth,
      );

      await api(`/api/playlists/${playlist.id}/tracks/${track.id}?userId=${auth.userId}`, { method: "POST" }, auth).catch(() => {});
      const nextTracks = await api(`/api/playlists/${playlist.id}/tracks?userId=${auth.userId}`, {}, auth);
      setPlaylistTracks(nextTracks);

      if (!currentTrack) {
        const playlistTrack = nextTracks.find((item) => item.trackId === track.id) || nextTracks.at(-1);
        setCurrentTrack({ ...track, playlistTrackId: playlistTrack?.playlistTrackId });
        if (work && playlistTrack) {
          const nextWork = await api(
            `/api/tasks/${work.id}/current-playlist-track/${playlistTrack.playlistTrackId}?userId=${auth.userId}`,
            { method: "PATCH" },
            auth,
          );
          setWork(nextWork);
        }
      }
      setNotice("BGM 바구니에 곡을 넣었다냥.");
    } catch (linkError) {
      setError(`곡을 넣지 못했다냥: ${linkError.message}`);
    } finally {
      setLinkSaving(false);
    }
  }

  async function selectPlaylistTrack(track) {
    const detail = await api(`/api/tracks/${track.trackId}`, {}, auth);
    setCurrentTrack({ ...detail, playlistTrackId: track.playlistTrackId });
    setPosition(0);
    setLyricLines([]);
    setCurrentLine(null);
    setTranslation(null);
    setNotice("현재 곡을 바꿨다냥.");
    if (work) {
      const nextWork = await api(`/api/tasks/${work.id}/current-playlist-track/${track.playlistTrackId}?userId=${auth.userId}`, { method: "PATCH" }, auth);
      setWork(nextWork);
    }
  }

  async function removeTrack(track) {
    await api(`/api/playlists/${playlist.id}/tracks/${track.trackId}?userId=${auth.userId}`, { method: "DELETE" }, auth);
    const nextTracks = await api(`/api/playlists/${playlist.id}/tracks?userId=${auth.userId}`, {}, auth);
    setPlaylistTracks(nextTracks);
    if (currentTrack?.id === track.trackId) {
      playerRef.current?.pauseVideo?.();
      setIsPlaying(false);
      setCurrentTrack(null);
      setPosition(0);
    }
    setNotice("BGM 바구니에서 곡을 뺐다냥.");
  }

  async function changeTaskStatus(status) {
    if (!work || work.status === status) {
      return;
    }
    const nextWork = await api(`/api/tasks/${work.id}/status?userId=${auth.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }, auth);
    setWork(nextWork);
    setTasks((items) => items.map((item) => (item.id === nextWork.id ? nextWork : item)));
    setNotice(`작업 상태를 ${statusLabel(status)}로 옮겼다냥.`);
  }

  async function saveTask(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim(),
      taskDate: String(form.get("taskDate") || todayIso()),
    };
    if (!payload.title) {
      setError("할 일 이름을 적어줘냥.");
      return;
    }

    const nextWork = taskEditing && work
      ? await api(`/api/tasks/${work.id}?userId=${auth.userId}`, { method: "PATCH", body: JSON.stringify(payload) }, auth)
      : await api(`/api/tasks?userId=${auth.userId}`, { method: "POST", body: JSON.stringify(payload) }, auth);
    setWork(nextWork);
    setTasks((items) => taskEditing ? items.map((item) => (item.id === nextWork.id ? nextWork : item)) : [nextWork, ...items]);
    setTaskFormOpen(false);
    setTaskEditing(false);
    setNotice(taskEditing ? "할 일을 고쳤다냥." : "새 할 일을 넣었다냥.");
  }

  async function deleteTask() {
    if (!work) {
      return;
    }
    await api(`/api/tasks/${work.id}?userId=${auth.userId}`, { method: "DELETE" }, auth);
    const nextTasks = tasks.filter((task) => task.id !== work.id);
    setTasks(nextTasks);
    setWork(nextTasks[0] || null);
    setNotice("할 일을 치웠다냥.");
  }

  async function fetchLyrics() {
    if (!currentTrack) {
      return;
    }
    setNotice("처음 듣는 곡이라 가사를 찾는 중이다냥.");
    try {
      const lyric = await api(`/api/tracks/${currentTrack.id}/lyrics/fetch`, { method: "POST" }, auth);
      const lines = lyric?.sourceLines || lyric?.lines || [];
      setLyricLines(lines.map((line, index) => ({
        id: line.id || line.lineRefId || `${currentTrack.id}-${index}`,
        lineIndex: line.lineIndex ?? line.index ?? index,
        startTimeMs: line.startTimeMs ?? index * 5000,
        text: line.text || line.sourceText || "",
      })));
      setNotice("가사 발자국을 준비했다냥.");
    } catch (lyricsError) {
      setNotice(`가사는 잠깐 못 찾았다냥: ${lyricsError.message}`);
    }
  }

  function saveLyricPiece() {
    if (!currentLine?.text) {
      setNotice("아직 저장할 가사 줄이 없다냥.");
      return;
    }
    const piece = {
      id: `${currentLine.id}-${Date.now()}`,
      lineRefId: currentLine.id,
      trackId: currentTrack?.id || null,
      trackTitle: currentTrack?.title || "작업곡",
      lineText: currentLine.text,
      translatedText: translation?.translatedText || "",
      memoText: translation?.memoText || "",
      savedAt: new Date().toISOString(),
    };
    const next = [piece, ...savedPieces.filter((item) => item.lineRefId !== piece.lineRefId)].slice(0, 30);
    setSavedPieces(next);
    writeJson("kurostep.savedLyricPieces", next);
    window.localStorage.setItem("kurostep.savedLyricPiecesChangedAt", String(Date.now()));
    setNotice("현재 가사 조각을 저장했다냥.");
  }

  function updateVolume(nextVolume) {
    const value = Math.min(Math.max(Number(nextVolume) || 0, 0), 100);
    if (value > 0) {
      setMutedVolume(value);
      window.localStorage.setItem("kurostep.previousVolume", String(value));
    }
    setVolumeState(value);
    window.localStorage.setItem("kurostep.volume", String(value));
    playerRef.current?.setVolume?.(value);
  }

  function toggleMute() {
    if (volume === 0) {
      updateVolume(mutedVolume || 80);
    } else {
      setMutedVolume(volume);
      updateVolume(0);
    }
  }

  async function setPawVisible(visible) {
    setPawVisibleState(visible);
    writeJson("kurostep.pawWidgetVisible", visible);
    await nativeCommand("set_paw_visible", { visible }).catch(() => {});
  }

  async function setLyricsVisible(visible) {
    setLyricsOverlayVisibleState(visible);
    await nativeCommand("set_lyrics_visible", {
      visible,
      line: currentLine?.text || "",
      translation: translation?.translatedText || "",
    }).catch(() => {});
  }

  if (!auth) {
    return <AuthScreen mode={authMode} setMode={setAuthMode} busy={busy} error={error} onSubmit={submitAuth} />;
  }

  if (settingsOpen && view === "main") {
    return <SettingsScreen auth={auth} onBack={() => setSettingsOpen(false)} onLogout={logout} />;
  }

  if (view === "paw") {
    return (
      <WidgetShell title="작업 발자국" notice={makeNotice(notice)} error={error} compact>
        <TaskPaw
          work={work}
          tasks={tasks}
          counts={counts}
          formOpen={taskFormOpen}
          editing={taskEditing}
          setFormOpen={setTaskFormOpen}
          setEditing={setTaskEditing}
          setWork={setWork}
          onSaveTask={saveTask}
          onDeleteTask={deleteTask}
          onChangeStatus={changeTaskStatus}
          currentLine={currentLine}
          translation={translation}
          setTranslation={setTranslation}
          onSavePiece={saveLyricPiece}
          savedPieces={savedPieces}
          setSavedPieces={setSavedPieces}
        />
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      title="KuroStep"
      notice={loading ? "작업실 불러오는 중이냥..." : makeNotice(notice)}
      error={error}
      onSettings={() => setSettingsOpen(true)}
      onExit={() => nativeCommand("exit_app")}
    >
      <div className="top-controls">
        <button className={pawVisible ? "pill active" : "pill"} onClick={() => setPawVisible(!pawVisible)}>작업 발자국 {pawVisible ? "ON" : "OFF"}</button>
        <button className={lyricsOverlayVisible ? "pill active" : "pill"} onClick={() => setLyricsVisible(!lyricsOverlayVisible)}>가사 오버레이 {lyricsOverlayVisible ? "ON" : "OFF"}</button>
      </div>
      <MusicPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        position={position}
        duration={duration || currentTrack?.durationSeconds || 0}
        volume={volume}
        youtubePanelOpen={youtubePanelOpen}
        setYoutubePanelOpen={setYoutubePanelOpen}
        onTogglePlay={togglePlay}
        onFetchLyrics={fetchLyrics}
        onMute={toggleMute}
        onVolume={updateVolume}
      />
      <LinkImport saving={linkSaving} onAdd={addYoutubeLink} />
      <Playlist
        tracks={playlistTracks}
        currentTrack={currentTrack}
        page={playlistPage}
        setPage={setPlaylistPage}
        onSelect={selectPlaylistTrack}
        onRemove={removeTrack}
      />
      <LyricsPanel
        open={lyricPanelOpen}
        setOpen={setLyricPanelOpen}
        lines={lyricLines}
        currentLine={currentLine}
        isPlaying={isPlaying}
        onSavePiece={saveLyricPiece}
      />
      <div id="youtube-player" className="youtube-player-host" aria-hidden={!youtubePanelOpen}></div>
    </WidgetShell>
  );
}

function chooseCurrentLine(lines, seconds) {
  if (!lines.length) {
    return null;
  }
  const positionMs = seconds * 1000;
  return [...lines]
    .filter((line) => Number(line.startTimeMs || 0) <= positionMs)
    .sort((a, b) => Number(b.startTimeMs || 0) - Number(a.startTimeMs || 0))[0] || lines[0];
}

type WidgetShellProps = {
  title: string;
  notice?: string;
  error?: string;
  children: React.ReactNode;
  onSettings?: () => void;
  onExit?: () => void;
  compact?: boolean;
};

function WidgetShell({ title, notice = "", error = "", children, onSettings, onExit, compact = false }: WidgetShellProps) {
  const shellClassName = [
    "widget",
    compact ? "compact" : "",
    embedded ? "embedded" : "",
  ].filter(Boolean).join(" ");

  return (
    <main className={shellClassName}>
      {!embedded && (
        <header className="window-bar" data-tauri-drag-region>
          <button className="window-button" type="button" onClick={() => window.__TAURI__?.window?.getCurrentWindow?.()?.minimize?.()} aria-label="최소화">
            <Minus size={14} />
          </button>
          <strong data-tauri-drag-region>{title}</strong>
          <span className="window-actions">
            {onSettings && <button className="ghost-button" onClick={onSettings}><Settings size={13} />설정</button>}
            {onExit && <button className="ghost-button dark" onClick={onExit}>종료</button>}
          </span>
        </header>
      )}
      <section className="widget-body">
        {(error || notice) && <p className={error ? "status error" : "status"}>{error || notice}</p>}
        {children}
      </section>
    </main>
  );
}

function AuthScreen({ mode, setMode, busy, error, onSubmit }) {
  return (
    <WidgetShell title="KuroStep">
      <section className="auth-screen">
        <img className="brand-paw" src={`${import.meta.env.BASE_URL}assets/paw-print-neutral.svg`} alt="" />
        <p className="eyebrow">KUROSTEP</p>
        <h1>작업실 들어가기</h1>
        <p className="muted">로그인하면 투두, 플레이어, 가사가 차례대로 열린다냥.</p>
        <div className="tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>로그인</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>회원가입</button>
        </div>
        {error && <p className="status error">{error}</p>}
        <form className="form" onSubmit={onSubmit}>
          <label>이메일<input name="email" type="email" placeholder="you@example.com" /></label>
          <label>비밀번호<input name="password" type="password" placeholder="비밀번호" /></label>
          {mode === "signup" && <label>닉네임<input name="nickname" placeholder="작업실 이름" /></label>}
          <button className="primary-button" disabled={busy}>{busy ? "처리 중이냥..." : mode === "signup" ? "회원가입" : "로그인"}</button>
        </form>
      </section>
    </WidgetShell>
  );
}

function SettingsScreen({ auth, onBack, onLogout }) {
  return (
    <WidgetShell title="설정">
      <button className="back-button" onClick={onBack}>← 돌아가기</button>
      <section className="settings-screen">
        <p className="eyebrow">SETTINGS</p>
        <h1>작업실 설정</h1>
        <div className="settings-card">
          <strong>로그인 계정</strong>
          <span>{auth.email}</span>
        </div>
        <div className="settings-card">
          <strong>닉네임</strong>
          <span>{auth.nickname || "KuroStep 작업자"}</span>
        </div>
        <button className="danger-button" onClick={onLogout}><LogOut size={16} />로그아웃</button>
      </section>
    </WidgetShell>
  );
}

function MusicPlayer({ currentTrack, isPlaying, position, duration, volume, youtubePanelOpen, setYoutubePanelOpen, onTogglePlay, onFetchLyrics, onMute, onVolume }) {
  const percent = duration ? Math.min((position / duration) * 100, 100) : 0;
  return (
    <section className="card player-card">
      <div className="card-head">
        <h2>BGM 턴테이블</h2>
        <span>YouTube BGM</span>
      </div>
      <div className="now-playing">
        <div className={isPlaying ? "record playing" : "record"}><img src={`${import.meta.env.BASE_URL}assets/paw-print-cream.svg`} alt="" /></div>
        <div>
          <p className="eyebrow">NOW PLAYING</p>
          <h3>{currentTrack?.title || "아직 같이 걸을 곡이 없다냥"}</h3>
          <p className="muted">{currentTrack?.artist || "링크를 넣으면 여기서 시작한다냥"}</p>
          <button className="small-button" onClick={onFetchLyrics}>가사 찾기</button>
        </div>
      </div>
      <div className="controls">
        <button><SkipBack size={18} /></button>
        <button className="play-button" onClick={onTogglePlay}>{isPlaying ? <Pause size={20} /> : <Play size={20} />}</button>
        <button><SkipForward size={18} /></button>
        <button><Shuffle size={18} /></button>
        <div className="volume">
          <button onClick={onMute}><Volume2 size={17} /></button>
          <input type="range" min="0" max="100" value={volume} onChange={(event) => onVolume(event.target.value)} />
        </div>
      </div>
      <div className="progress-row">
        <span>{formatDuration(position)}</span>
        <div className="progress"><i style={{ width: `${percent}%` }} /></div>
        <span>{formatDuration(duration)}</span>
      </div>
      <button className="video-toggle" onClick={() => setYoutubePanelOpen(!youtubePanelOpen)}>
        {youtubePanelOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        {youtubePanelOpen ? "영상 접기" : "영상 펼치기"}
      </button>
    </section>
  );
}

function LinkImport({ saving, onAdd }) {
  const [url, setUrl] = useState("");
  return (
    <section className="card">
      <h2>YouTube 링크</h2>
      <div className="inline-form">
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="영상 링크를 붙여넣어줘냥" />
        <button className="primary-button" disabled={saving} onClick={() => onAdd(url)}>{saving ? "불러오는 중" : "곡 넣기"}</button>
      </div>
    </section>
  );
}

function Playlist({ tracks, currentTrack, page, setPage, onSelect, onRemove }) {
  const pageCount = Math.max(Math.ceil(tracks.length / PLAYLIST_PAGE_SIZE), 1);
  const start = (Math.min(page, pageCount) - 1) * PLAYLIST_PAGE_SIZE;
  const visible = tracks.slice(start, start + PLAYLIST_PAGE_SIZE);
  return (
    <section className="card">
      <div className="card-head">
        <h2>PLAYLIST</h2>
        <span>{tracks.length}곡 · {Math.min(page, pageCount)}/{pageCount}</span>
      </div>
      <ol className="playlist">
        {visible.map((track) => (
          <li key={track.playlistTrackId} className={currentTrack?.playlistTrackId === track.playlistTrackId ? "active" : ""}>
            <button className="track-info" onClick={() => onSelect(track)}>
              <ListMusic size={16} />
              <span><strong>{track.title}</strong><small>{track.artist || "Unknown"}</small></span>
            </button>
            <button className="icon-button danger" onClick={() => onRemove(track)}><Trash2 size={15} /></button>
          </li>
        ))}
      </ol>
      {pageCount > 1 && (
        <div className="pager">
          <button onClick={() => setPage(Math.max(page - 1, 1))}>이전</button>
          <button onClick={() => setPage(Math.min(page + 1, pageCount))}>다음</button>
        </div>
      )}
    </section>
  );
}

function LyricsPanel({ open, setOpen, lines, currentLine, isPlaying, onSavePiece }) {
  return (
    <section className="card lyrics-card">
      <div className="card-head">
        <h2>가사</h2>
        <button className="icon-button" onClick={() => setOpen(!open)}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
      </div>
      <p className={isPlaying ? "current-lyric active" : "current-lyric"}>
        {currentLine?.text || (isPlaying ? "처음 듣는 곡이라 가사를 찾는 중이다냥." : "노래를 재생하면 현재 가사가 보인다냥.")}
      </p>
      <button className="small-button" onClick={onSavePiece} disabled={!currentLine?.text}>현재 줄 저장</button>
      {open && (
        <ol className="lyrics-list">
          {lines.map((line) => <li key={`${line.id}-${line.lineIndex}`} className={line.lineIndex === currentLine?.lineIndex ? "active" : ""}>{line.text}</li>)}
        </ol>
      )}
    </section>
  );
}

function TaskPaw({ work, tasks, counts, formOpen, editing, setFormOpen, setEditing, setWork, onSaveTask, onDeleteTask, onChangeStatus, currentLine, translation, setTranslation, onSavePiece, savedPieces, setSavedPieces }) {
  return (
    <div className="paw-stack">
      <section className="card">
        <div className="card-head">
          <h2>오늘 할 일</h2>
          <button className="icon-button" onClick={() => { setFormOpen(true); setEditing(false); }}><Plus size={16} /></button>
        </div>
        <div className="badges">
          {["TODO", "DOING", "DONE"].map((status) => <button key={status} className={work?.status === status ? "active" : ""} onClick={() => onChangeStatus(status)}>{statusLabel(status)} {counts[status] || 0}</button>)}
        </div>
        <ol className="todo-list">
          {tasks.map((task) => (
            <li key={task.id} className={work?.id === task.id ? "active" : ""}>
              <button onClick={() => setWork(task)}><strong>{task.title}</strong><small>{task.description || task.taskDate}</small></button>
            </li>
          ))}
        </ol>
        {work && (
          <div className="task-detail">
            <h3>{work.title}</h3>
            <p>{work.description || work.taskDate}</p>
            <button className="small-button" onClick={() => { setFormOpen(true); setEditing(true); }}><Edit3 size={14} />수정</button>
            <button className="small-button danger" onClick={onDeleteTask}><Trash2 size={14} />삭제</button>
          </div>
        )}
        {formOpen && <TaskForm work={editing ? work : null} editing={editing} onSave={onSaveTask} onClose={() => setFormOpen(false)} />}
      </section>
      <section className="card">
        <h2>가사 손질장</h2>
        <p className="memo-context">{currentLine?.text || "재생 중인 가사 줄을 여기서 손질한다냥."}</p>
        <label>한국어 번역문<textarea value={translation?.translatedText || ""} onChange={(event) => setTranslation({ ...(translation || {}), translatedText: event.target.value })} /></label>
        <label>개인 메모<textarea value={translation?.memoText || ""} onChange={(event) => setTranslation({ ...(translation || {}), memoText: event.target.value })} /></label>
        <button className="primary-button" onClick={onSavePiece}><Save size={15} />현재 줄 저장</button>
      </section>
      <section className="card">
        <h2>저장한 가사 조각</h2>
        <ol className="saved-list">
          {savedPieces.map((piece) => (
            <li key={piece.id}>
              <span><strong>{piece.lineText}</strong><small>{piece.translatedText || piece.trackTitle}</small></span>
              <button className="icon-button danger" onClick={() => {
                const next = savedPieces.filter((item) => item.id !== piece.id);
                setSavedPieces(next);
                writeJson("kurostep.savedLyricPieces", next);
              }}><X size={14} /></button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function TaskForm({ work, editing, onSave, onClose }) {
  return (
    <form className="task-form" onSubmit={onSave}>
      <input name="title" defaultValue={work?.title || ""} placeholder="할 일 이름" />
      <textarea name="description" defaultValue={work?.description || ""} placeholder="작업 메모" />
      <input name="taskDate" type="date" defaultValue={work?.taskDate || todayIso()} />
      <div className="button-row">
        <button className="primary-button">{editing ? "수정 저장" : "할 일 추가"}</button>
        <button type="button" onClick={onClose}>닫기</button>
      </div>
    </form>
  );
}
