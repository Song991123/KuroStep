import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  type Playlist,
  type PlaylistTrack,
  type SavedLyricPiece,
  type TaskStatus,
  type Track,
  type TrackCreateDraft,
  type YouTubePlaylistPreview,
} from "./lib/api";
import { extractYoutubeId, extractYoutubePlaylistId, fetchYoutubeMetadata } from "./lib/youtube";

const query = new URLSearchParams(window.location.search);
const isEmbeddedContent = query.get("embedded") === "1";

if (isEmbeddedContent) {
  document.documentElement.classList.add("embedded-mode");
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

const emptyCounts: Record<TaskStatus, number> = { TODO: 0, DOING: 0, DONE: 0 };

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
  onLogout,
}: {
  children: ReactNode;
  title?: string;
  rightAction?: "exit" | "settings" | "none";
  onLogout?: () => void;
}) {
  if (isEmbeddedContent) {
    return <section className="embedded-content">{children}</section>;
  }

  return (
    <section className="widget-container">
      <header className="mac-header" id="window-drag-region" data-tauri-drag-region>
        <div className="window-tools">
          <button className="window-tool-button" id="window-minimize" type="button" aria-label="최소화" title="최소화">
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
            <button className="ghost-header-button icon-text" id="settings-open" type="button">
              <Icon name="settings" />
              <span>설정</span>
            </button>
            <button className="ghost-header-button" id="app-exit-button" type="button" onClick={onLogout}>종료</button>
          </div>
        ) : rightAction === "exit" ? (
          <div className="header-actions">
            <button className="ghost-header-button" id="app-exit-button" type="button" onClick={onLogout}>종료</button>
          </div>
        ) : <span />}
      </header>
      <div className="widget-content">{children}</div>
    </section>
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
          <button className="action-button primary auth-submit" type="submit" disabled={busy}>{busy ? "문 여는 중이냥..." : isSignup ? "회원가입" : "로그인"}</button>
        </form>
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
  counts,
  onSelectTask,
  onCreateTask,
  onUpdateStatus,
  onDeleteTask,
}: {
  tasks: CreatorTask[];
  work: CreatorTask | null;
  counts: Record<TaskStatus, number>;
  onSelectTask: (task: CreatorTask) => void;
  onCreateTask: (title: string) => void;
  onUpdateStatus: (status: TaskStatus) => void;
  onDeleteTask: () => void;
}) {
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
          onClick={() => {
            const title = window.prompt("새 할 일을 적어줘냥.");
            if (title) onCreateTask(title);
          }}
        >
          <Icon name="plus" />
        </button>
      </div>
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
                {statusLabel(status)} <span>{counts[status] || 0}</span>
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
  onTogglePlay,
  onSelectTrack,
  onRegisterLink,
  onRemoveTrack,
  onShuffle,
  onPage,
}: {
  track: Track | null;
  tracks: PlaylistTrack[];
  playlist: Playlist | null;
  page: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSelectTrack: (playlistTrack: PlaylistTrack) => void;
  onRegisterLink: (url: string) => void;
  onRemoveTrack: (playlistTrack: PlaylistTrack) => void;
  onShuffle: () => void;
  onPage: (page: number) => void;
}) {
  const [url, setUrl] = useState("");
  const duration = track?.durationSeconds || 0;
  const pageCount = getPlaylistPageCount(tracks.length);
  const visibleTracks = tracks.slice((page - 1) * PLAYLIST_PAGE_SIZE, page * PLAYLIST_PAGE_SIZE);

  return (
    <section className="widget-group music-player-widget" aria-label="BGM 턴테이블">
      <div className="widget-group-head">
        <div>
          <h2>BGM 턴테이블</h2>
          <p>작업 카드에 붙인 곡을 여기서 조심조심 튼다냥</p>
        </div>
      </div>
      <section className="widget-section now-playing" aria-labelledby="now-playing-title">
        <SectionHeader title="NOW PLAYING" />
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
              <span>{track?.sourceType || "YOUTUBE"}</span>
              <span>{track?.sourceId || "source id 없음"}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>
        </div>
        <div className="player-controls" aria-label="작업용 플레이어 컨트롤">
          <button className="icon-button" type="button" disabled={!tracks.length}><Icon name="previous" /></button>
          <button className="icon-button" type="button" disabled={!track}><Icon name="rewind" /></button>
          <button className="icon-button main" type="button" disabled={!track} onClick={onTogglePlay}><Icon name={isPlaying ? "pause" : "play"} /></button>
          <button className="icon-button" type="button" disabled={!track}><Icon name="forward" /></button>
          <button className="icon-button" type="button" disabled={!tracks.length}><Icon name="next" /></button>
          <button className="icon-button repeat" type="button"><Icon name="repeat" /></button>
        </div>
        <div className="progress-row" aria-label="재생 위치">
          <span>0:00</span>
          <div className="progress-track" role="slider" tabIndex={0} aria-label="재생 위치 이동">
            <span style={{ width: "0%" }}></span>
            <i style={{ left: "0%" }}></i>
          </div>
          <span id="progress-duration">{formatDuration(duration)}</span>
          <div className="volume-control">
            <button className="volume-button" type="button" aria-label="볼륨 조절"><Icon name="volume" /></button>
            <div className="volume-popover" aria-hidden="true">
              <input type="range" min="0" max="100" step="1" defaultValue="80" aria-label="볼륨" />
              <span>80%</span>
            </div>
          </div>
        </div>
        <button className="youtube-panel-toggle" id="youtube-video-toggle" type="button" aria-expanded="false" aria-controls="youtube-frame-shell" title="영상 펼치기" aria-label="영상 펼치기">
          <Icon name="chevronDown" />
          <span>영상 펼치기</span>
        </button>
        <div className="youtube-frame-shell" id="youtube-frame-shell" aria-hidden="true">
          <div id="youtube-player" className="youtube-player" aria-label="앱 내부 YouTube 플레이어"></div>
        </div>
      </section>
      <section className="sub-section link-widget" aria-labelledby="link-widget-title">
        <SectionHeader title="YOUTUBE LINK" />
        <form className="link-form" id="link-widget-title" onSubmit={(event) => {
          event.preventDefault();
          onRegisterLink(url);
          setUrl("");
        }}>
          <input className="form-input wide" value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="영상 또는 플레이리스트 링크를 붙여넣어줘냥" aria-label="유튜브 링크" />
          <button className="action-button primary" type="submit">링크 불러오기</button>
        </form>
      </section>
      <section className="widget-section playlist-widget" aria-labelledby="playlist-title">
        <div className="section-head">
          <h2 className="section-title">PLAYLIST</h2>
          <button className="mini-icon-button" id="shuffle-playlist" type="button" title="셔플" aria-label="셔플" onClick={onShuffle}><Icon name="shuffle" /></button>
        </div>
        <p className="playlist-name">{playlist?.name || "오늘의 작업 BGM"} · {tracks.length}곡 · {page}/{pageCount}쪽</p>
        <ol className="playlist-list" id="playlist-title">
          {visibleTracks.map((playlistTrack) => (
            <li className={`playlist-item${playlistTrack.playlistTrackId === track?.playlistTrackId ? " playing" : ""}`} draggable="true" key={playlistTrack.playlistTrackId}>
              <button className="drag-handle" type="button" title="끌어서 순서 바꾸기" aria-label="끌어서 순서 바꾸기"><Icon name="grip" /></button>
              <button className="playlist-track" type="button" onClick={() => onSelectTrack(playlistTrack)}>
                <strong>{playlistTrack.title || `Track #${playlistTrack.trackId}`}</strong>
                <small>{playlistTrack.artist || "YouTube"} · #{playlistTrack.trackId}</small>
              </button>
              <span className="playlist-duration">{formatDuration(playlistTrack.durationSeconds)}</span>
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
  onSelectTask,
  onCreateTask,
  onUpdateStatus,
  onDeleteTask,
}: {
  workspace: Workspace;
  savedLyricPieces: SavedLyricPiece[];
  onSelectTask: (task: CreatorTask) => void;
  onCreateTask: (title: string) => void;
  onUpdateStatus: (status: TaskStatus) => void;
  onDeleteTask: () => void;
}) {
  return (
    <section className="widget-group task-paw-widget lyric-paw-widget" aria-label="작업 발자국">
      <div className="widget-group-head">
        <div>
          <h2>작업 발자국</h2>
          <p>오늘 할 일과 번역 메모를 한 발자국씩 만진다냥</p>
        </div>
      </div>
      <TodayWorkWidget tasks={workspace.tasks} work={workspace.work} counts={workspace.counts} onSelectTask={onSelectTask} onCreateTask={onCreateTask} onUpdateStatus={onUpdateStatus} onDeleteTask={onDeleteTask} />
      <section className="widget-section empty-section">
        <SectionHeader title="번역 메모" />
        <p className="state-message">곡을 재생하면 현재 가사와 한국어 메모를 만질 수 있다냥.</p>
      </section>
      <section className="widget-section saved-lyrics-widget" aria-labelledby="saved-lyrics-title">
        <SectionHeader title="저장한 가사 조각" />
        {savedLyricPieces.length ? (
          <ol className="saved-lyric-list">
            {savedLyricPieces.map((piece) => (
              <li key={piece.id}>
                <strong>{piece.lineText}</strong>
                <small>{piece.translatedText || piece.memoText || piece.trackTitle}</small>
              </li>
            ))}
          </ol>
        ) : <p className="state-message">가사 창에서 마음에 드는 줄을 콕 저장할 수 있다냥.</p>}
      </section>
    </section>
  );
}

function LyricsWidget({ currentTrack }: { currentTrack: Track | null }) {
  return (
    <section className="widget-group lyrics-widget" aria-label="가사 창">
      <div className="widget-group-head">
        <div>
          <h2>가사 창</h2>
          <p>지금 흐르는 문장을 보고, 펼치면 전체 가사를 본다냥</p>
        </div>
        <button className="lyrics-panel-toggle" id="lyrics-panel-toggle" type="button" aria-expanded="false" aria-controls="lyrics-full-list" title="가사 펼치기" aria-label="가사 펼치기">
          <Icon name="chevronDown" />
        </button>
      </div>
      <div className="lyrics-preview">
        <p>{currentTrack ? "처음 듣는 곡이면 가사 발자국을 굽는 중이다냥." : "아직 재생 중인 곡이 없다냥."}</p>
        <button className="action-button compact" id="save-lyric-piece" type="button" disabled>현재 줄 저장</button>
        <ol className="lyrics-full-list" id="lyrics-full-list">
          <li className="lyrics-line">
            <span>{formatTimestamp(0)}</span>
            <p>{currentTrack ? "가사 API 연결은 다음 단계에서 붙인다냥." : "곡을 먼저 골라줘냥."}</p>
          </li>
        </ol>
      </div>
    </section>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthSession | null>(() => readJson<AuthSession | null>("kurostep.auth", null));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>({ kind: "notice", message: "작업실 불러오는 중이냥..." });
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
  const [savedLyricPieces] = useState(() => readJson<SavedLyricPiece[]>("kurostep.savedLyricPieces", []));
  const authRef = useRef<AuthSession | null>(auth);

  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  const refreshWorkspace = useCallback(async (session = authRef.current) => {
    if (!session?.userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let tasks = await api<CreatorTask[]>(`/api/tasks/today?userId=${session.userId}`, {}, session);
      if (tasks.length === 0) {
        await api<CreatorTask>(`/api/tasks?userId=${session.userId}`, {
          method: "POST",
          body: JSON.stringify({
            title: "오늘의 작업 발자국 정리",
            description: "작업 카드와 BGM, 가사 라인, 번역 메모를 한곳에 모아요.",
            taskDate: todayIso(),
          }),
        }, session);
        tasks = await api<CreatorTask[]>(`/api/tasks/today?userId=${session.userId}`, {}, session);
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

      setWorkspace({
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
    if (!auth?.accessToken) {
      setLoading(false);
      return;
    }
    api<AuthSession>("/api/auth/me", {}, auth)
      .then((me) => {
        const nextAuth = { ...me, accessToken: auth.accessToken };
        setAuth(nextAuth);
        writeJson("kurostep.auth", nextAuth);
        return refreshWorkspace(nextAuth);
      })
      .catch(() => {
        window.localStorage.removeItem("kurostep.auth");
        setAuth(null);
        setLoading(false);
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
    setNotice({ kind: "notice", message: mode === "signup" ? "가입 정보 정리 중이냥..." : "작업실 문 여는 중이냥..." });
    try {
      const session = await api<AuthSession>(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(mode === "signup" ? data : { email: data.email, password: data.password }),
      });
      writeJson("kurostep.auth", session);
      setAuth(session);
      await refreshWorkspace(session);
    } catch (error) {
      window.localStorage.removeItem("kurostep.auth");
      setNotice({ kind: "error", message: authErrorMessage(error, mode) });
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    window.localStorage.removeItem("kurostep.auth");
    setAuth(null);
    setWorkspace({ tasks: [], work: null, counts: { ...emptyCounts }, playlist: null, playlistTracks: [], currentTrack: null });
    setIsPlaying(false);
    setNotice({ kind: "notice", message: "다음 작업 때 또 보자냥." });
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
      await refreshWorkspace(auth);
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
      await refreshWorkspace(auth);
      setNotice({ kind: "notice", message: `작업 상태를 ${statusLabel(status)}로 옮겼다냥.` });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function deleteTask() {
    if (!auth?.userId || !workspace.work) return;
    try {
      await api<void>(`/api/tasks/${workspace.work.id}?userId=${auth.userId}`, { method: "DELETE" }, auth);
      await refreshWorkspace(auth);
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
      if (existing) return existing;
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

  async function registerLink(url: string) {
    if (!auth?.userId || !workspace.playlist) return;
    const sourceUrl = url.trim();
    const sourceId = extractYoutubeId(sourceUrl);
    const playlistId = extractYoutubePlaylistId(sourceUrl);
    if (!sourceUrl || (!sourceId && !playlistId)) {
      setNotice({ kind: "error", message: "YouTube 영상이나 플레이리스트 링크를 넣어줘냥." });
      return;
    }
    try {
      setNotice({ kind: "notice", message: "YouTube 링크를 작업 바구니에 담는 중이냥..." });

      if (playlistId) {
        const preview = await api<YouTubePlaylistPreview>("/api/tracks/youtube-playlist/preview", {
          method: "POST",
          body: JSON.stringify({ playlistUrl: sourceUrl }),
        }, auth);
        const answer = window.prompt(
          `플레이리스트에서 ${preview.trackCount}곡을 찾았다냥. 앞에서 몇 곡까지 넣을까냥? 최대 50곡까지 가능하다냥.`,
          String(Math.min(preview.trackCount, 10)),
        );
        if (!answer) {
          setNotice({ kind: "notice", message: "플레이리스트 담기를 멈췄다냥." });
          return;
        }
        const count = Math.min(Math.max(Number(answer) || 0, 1), preview.tracks.length, 50);
        const drafts = preview.tracks.slice(0, count);
        for (const draft of drafts) {
          const track = await findOrCreateTrackDraft(draft);
          await api<void>(`/api/playlists/${workspace.playlist.id}/tracks/${track.id}?userId=${auth.userId}`, { method: "POST" }, auth).catch((error) => {
            if (!String((error as Error).message).includes("이미")) throw error;
          });
        }
        setNotice({ kind: "notice", message: `${drafts.length}곡을 BGM 바구니에 넣었다냥.` });
      } else {
        const track = await findOrCreateTrack(sourceUrl, sourceId);
        await api<void>(`/api/playlists/${workspace.playlist.id}/tracks/${track.id}?userId=${auth.userId}`, { method: "POST" }, auth).catch((error) => {
          if (!String((error as Error).message).includes("이미")) throw error;
        });
        setNotice({ kind: "notice", message: "곡을 BGM 바구니에 넣었다냥." });
      }
      await refreshWorkspace(auth);
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function selectTrack(playlistTrack: PlaylistTrack) {
    if (!auth?.userId || !workspace.work) return;
    try {
      const work = await api<CreatorTask>(`/api/tasks/${workspace.work.id}/current-playlist-track/${playlistTrack.playlistTrackId}?userId=${auth.userId}`, { method: "PATCH" }, auth);
      const detail = await api<Track>(`/api/tracks/${playlistTrack.trackId}`, {}, auth);
      setWorkspace((current) => ({
        ...current,
        work,
        tasks: current.tasks.map((task) => (task.id === work.id ? work : task)),
        currentTrack: { ...detail, playlistTrackId: playlistTrack.playlistTrackId, playlistName: current.playlist?.name },
      }));
      setNotice({ kind: "notice", message: "현재 곡을 바꿨다냥." });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  async function removeTrack(playlistTrack: PlaylistTrack) {
    if (!auth?.userId || !workspace.playlist) return;
    try {
      await api<void>(`/api/playlists/${workspace.playlist.id}/tracks/${playlistTrack.trackId}?userId=${auth.userId}`, { method: "DELETE" }, auth);
      await refreshWorkspace(auth);
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
      setWorkspace((current) => ({ ...current, playlistTracks: tracks }));
      setNotice({ kind: "notice", message: "플레이리스트를 랜덤 발걸음으로 섞었다냥." });
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    }
  }

  const visibleNotice = loading ? { kind: "notice" as const, message: "작업실 불러오는 중이냥..." } : notice;

  if (!auth) {
    return (
      <WidgetShell rightAction="exit">
        <p className={`app-status ${visibleNotice.kind === "error" ? "error" : ""}`} id="app-status">{visibleNotice.message}</p>
        <AuthScreen busy={busy} onSubmit={handleAuth} />
      </WidgetShell>
    );
  }

  return (
    <WidgetShell rightAction="settings" onLogout={logout}>
      <p className={`app-status ${visibleNotice.kind === "error" ? "error" : ""}`} id="app-status">{visibleNotice.message}</p>
      <div className="global-widget-controls" aria-label="위젯 열고 닫기">
        <button className="action-button primary" id="toggle-paw-widget" type="button" aria-pressed="true">작업 발자국 ON</button>
        <button className="action-button" id="global-lyrics-toggle" type="button" aria-pressed="false">가사 오버레이 OFF</button>
      </div>
      <div className="widget-stack">
        <TaskPawWidget
          workspace={workspace}
          savedLyricPieces={savedLyricPieces}
          onSelectTask={(task) => setWorkspace((current) => ({ ...current, work: task }))}
          onCreateTask={createTask}
          onUpdateStatus={updateStatus}
          onDeleteTask={deleteTask}
        />
        <MusicPlayerWidget
          track={workspace.currentTrack}
          tracks={workspace.playlistTracks}
          playlist={workspace.playlist}
          page={playlistPage}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((value) => !value)}
          onSelectTrack={selectTrack}
          onRegisterLink={registerLink}
          onRemoveTrack={removeTrack}
          onShuffle={shufflePlaylist}
          onPage={setPlaylistPage}
        />
        <LyricsWidget currentTrack={workspace.currentTrack} />
      </div>
    </WidgetShell>
  );
}
