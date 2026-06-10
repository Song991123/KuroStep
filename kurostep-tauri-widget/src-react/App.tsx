import { useMemo, useState, type ReactNode } from "react";
import pawCream from "../src/assets/paw-print-cream.svg";
import pawNeutral from "../src/assets/paw-print-neutral.svg";
import pawBlack from "../src/assets/paw-print.svg";

const query = new URLSearchParams(window.location.search);
const isEmbeddedContent = query.get("embedded") === "1";

if (isEmbeddedContent) {
  document.documentElement.classList.add("embedded-mode");
}

type TaskStatus = "TODO" | "DOING" | "DONE";

type Task = {
  id: number;
  title: string;
  description: string;
  taskDate: string;
  status: TaskStatus;
  playlistId?: number;
  currentPlaylistTrackId?: number;
};

type PlaylistTrack = {
  playlistTrackId: number;
  trackId: number;
  title: string;
  artist: string;
  durationSeconds: number;
};

const sampleTasks: Task[] = [
  {
    id: 1,
    title: "오늘의 작업 발자국 정리",
    description: "작업 카드와 BGM, 가사 메모를 한곳에 모아요.",
    taskDate: "2026-06-10",
    status: "DOING",
    playlistId: 1,
    currentPlaylistTrackId: 1,
  },
  {
    id: 2,
    title: "콘티 컷 러프",
    description: "오늘 밤에 손 풀기",
    taskDate: "2026-06-10",
    status: "TODO",
    playlistId: 1,
  },
];

const sampleTracks: PlaylistTrack[] = [
  {
    playlistTrackId: 1,
    trackId: 1,
    title: "Moon Shadow",
    artist: "AHN YE EUN - Topic",
    durationSeconds: 357,
  },
  {
    playlistTrackId: 2,
    trackId: 2,
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    durationSeconds: 213,
  },
];

const sampleLines = [
  { index: 0, startTimeMs: 0, text: "아직 불러온 가사가 없다냥." },
  { index: 1, startTimeMs: 12000, text: "달빛 아래 발자국을 맞춘다냥." },
];

function statusLabel(status: TaskStatus) {
  return {
    TODO: "할 일",
    DOING: "걷는 중",
    DONE: "발도장",
  }[status];
}

function formatDuration(seconds?: number) {
  const value = Math.max(0, Math.floor(Number(seconds || 0)));
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatTimestamp(ms?: number) {
  return formatDuration(Math.floor(Number(ms || 0) / 1000));
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
    plus: <path d="M12 5v14M5 12h14" />,
    edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />,
    trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />,
    previous: <path d="M19 20 9 12l10-8v16zM5 19V5" />,
    next: <path d="m5 4 10 8-10 8V4zM19 5v14" />,
    rewind: <path d="m11 19-9-7 9-7v14zM22 19l-9-7 9-7v14z" />,
    forward: <path d="m13 5 9 7-9 7V5zM2 5l9 7-9 7V5z" />,
    play: <path d="m8 5 11 7-11 7V5z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    repeat: <path d="m17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    shuffle: <path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5" />,
    volume: <path d="M11 5 6 9H3v6h3l5 4V5zM15 9a5 5 0 0 1 0 6M18 7a9 9 0 0 1 0 10" />,
    grip: <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{icons[name]}</svg>;
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {action}
    </div>
  );
}

function WidgetShell({ children, title = "KuroStep", rightAction = "exit" }: { children: React.ReactNode; title?: string; rightAction?: "exit" | "settings" | "none" }) {
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
            <button className="ghost-header-button icon-text" id="settings-open" type="button"><Icon name="settings" /><span>설정</span></button>
            <button className="ghost-header-button" id="app-exit-button" type="button">종료</button>
          </div>
        ) : rightAction === "exit" ? (
          <div className="header-actions">
            <button className="ghost-header-button" id="app-exit-button" type="button">종료</button>
          </div>
        ) : <span />}
      </header>
      <div className="widget-content">{children}</div>
    </section>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const isSignup = mode === "signup";
  return (
    <WidgetShell>
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
        <form className="auth-form" id="auth-form">
          {isSignup && <label>닉네임<input className="form-input" name="nickname" autoComplete="nickname" placeholder="검은 작업실 이름" /></label>}
          <label>이메일<input className="form-input" name="email" type="email" autoComplete="email" placeholder="you@example.com" /></label>
          <label>비밀번호<input className="form-input" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder="비밀번호" /></label>
          <button className="action-button primary auth-submit" type="submit">{isSignup ? "회원가입" : "로그인"}</button>
        </form>
      </section>
    </WidgetShell>
  );
}

function TaskList({ tasks, selectedId }: { tasks: Task[]; selectedId: number }) {
  return (
    <ol className="todo-list" aria-label="오늘 할 일 목록">
      {tasks.map((task) => (
        <li key={task.id}>
          <button className={`todo-item${task.id === selectedId ? " selected" : ""}`} data-task-id={task.id} type="button" aria-pressed={task.id === selectedId}>
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

function TodayWorkWidget({ tasks }: { tasks: Task[] }) {
  const work = tasks[0];
  const counts = useMemo(() => tasks.reduce((acc, task) => ({ ...acc, [task.status]: (acc[task.status] || 0) + 1 }), {} as Record<TaskStatus, number>), [tasks]);
  return (
    <section className="widget-section today-work" aria-labelledby="today-work-title">
      <div className="task-list-head">
        <SectionHeader title="오늘 할 일" />
        <button className="mini-icon-button" id="open-task-create" type="button" title="할 일 추가" aria-label="할 일 추가"><Icon name="plus" /></button>
      </div>
      <TaskList tasks={tasks} selectedId={work.id} />
      <div className="task-header">
        <h3 className="task-title" id="today-work-title">{work.title}</h3>
        <div className="task-actions">
          <button className="mini-icon-button" id="open-task-edit" type="button" title="할 일 수정" aria-label="할 일 수정"><Icon name="edit" /></button>
          <button className="mini-icon-button danger" id="delete-task" type="button" title="할 일 삭제" aria-label="할 일 삭제"><Icon name="trash" /></button>
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
          <button key={status} className={`badge${status === work.status ? " active" : ""}`} data-status={status} type="button">
            {statusLabel(status)} <span>{counts[status] || 0}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MusicPlayerWidget({ tracks }: { tracks: PlaylistTrack[] }) {
  const track = tracks[0];
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
        <div className="player-area paused" id="player-area" title="작업 카드에 연결된 곡">
          <div className="cat-tail" aria-hidden="true"></div>
          <div className="record" aria-label="재생 중인 레코드">
            <span className="record-label">
              <img className="paw-print" src={pawBlack} alt="" aria-hidden="true" />
            </span>
          </div>
          <div className="track-info">
            <h3 id="now-playing-title">{track.title}</h3>
            <p>{track.artist} · 오늘의 작업 BGM</p>
            <div className="track-meta" aria-label="곡 상세">
              <span>YouTube</span>
              <span>source id 없음</span>
              <span>{formatDuration(track.durationSeconds)}</span>
            </div>
          </div>
        </div>
        <div className="player-controls" aria-label="작업용 플레이어 컨트롤">
          <button className="icon-button" type="button"><Icon name="previous" /></button>
          <button className="icon-button" type="button"><Icon name="rewind" /></button>
          <button className="icon-button main" type="button"><Icon name="play" /></button>
          <button className="icon-button" type="button"><Icon name="forward" /></button>
          <button className="icon-button" type="button"><Icon name="next" /></button>
          <button className="icon-button repeat" type="button"><Icon name="repeat" /></button>
        </div>
        <div className="progress-row" aria-label="재생 위치">
          <span>0:00</span>
          <div className="progress-track" role="slider" tabIndex={0} aria-label="재생 위치 이동">
            <span style={{ width: "0%" }}></span>
            <i style={{ left: "0%" }}></i>
          </div>
          <span id="progress-duration">{formatDuration(track.durationSeconds)}</span>
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
      <YoutubeLinkWidget />
      <PlaylistWidget tracks={tracks} />
    </section>
  );
}

function YoutubeLinkWidget() {
  return (
    <section className="sub-section link-widget" aria-labelledby="link-widget-title">
      <SectionHeader title="YOUTUBE LINK" />
      <div className="link-form" id="link-widget-title">
        <input className="form-input wide" id="track-url-input" type="url" placeholder="영상 또는 플레이리스트 링크를 붙여넣어줘냥" aria-label="유튜브 링크" />
        <button className="action-button primary" id="register-track-link" type="button">링크 불러오기</button>
      </div>
    </section>
  );
}

function PlaylistWidget({ tracks }: { tracks: PlaylistTrack[] }) {
  return (
    <section className="widget-section playlist-widget" aria-labelledby="playlist-title">
      <div className="section-head">
        <h2 className="section-title">PLAYLIST</h2>
        <button className="mini-icon-button" id="shuffle-playlist" type="button" title="셔플" aria-label="셔플"><Icon name="shuffle" /></button>
      </div>
      <p className="playlist-name">오늘의 작업 BGM · {tracks.length}곡 · 1/1쪽</p>
      <ol className="playlist-list" id="playlist-title">
        {tracks.map((track, index) => (
          <li className={`playlist-item${index === 0 ? " playing" : ""}`} draggable="true" data-playlist-track-id={track.playlistTrackId} key={track.playlistTrackId}>
            <button className="drag-handle" type="button" title="끌어서 순서 바꾸기" aria-label="끌어서 순서 바꾸기"><Icon name="grip" /></button>
            <span className="playlist-track">
              <strong>{track.title}</strong>
              <small>{track.artist} · #{track.trackId}</small>
            </span>
            <span className="playlist-duration">{formatDuration(track.durationSeconds)}</span>
            <button className="mini-icon-button danger playlist-remove-button" type="button" title="플레이리스트에서 곡 제거" aria-label="플레이리스트에서 곡 제거"><Icon name="trash" /></button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TaskPawWidget({ tasks }: { tasks: Task[] }) {
  return (
    <section className="widget-group task-paw-widget lyric-paw-widget" aria-label="작업 발자국">
      <div className="widget-group-head">
        <div>
          <h2>작업 발자국</h2>
          <p>오늘 할 일과 번역 메모를 한 발자국씩 만진다냥</p>
        </div>
      </div>
      <TodayWorkWidget tasks={tasks} />
      <section className="widget-section empty-section">
        <SectionHeader title="번역 메모" />
        <p className="state-message">곡을 재생하면 현재 가사와 한국어 메모를 만질 수 있다냥.</p>
      </section>
      <section className="widget-section saved-lyrics-widget" aria-labelledby="saved-lyrics-title">
        <SectionHeader title="저장한 가사 조각" />
        <p className="state-message">가사 창에서 마음에 드는 줄을 콕 저장할 수 있다냥.</p>
      </section>
    </section>
  );
}

function LyricsWidget() {
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
        <p>아직 불러온 가사가 없다냥.</p>
        <button className="action-button compact" id="save-lyric-piece" type="button" disabled>현재 줄 저장</button>
        <ol className="lyrics-full-list" id="lyrics-full-list">
          {sampleLines.map((line) => (
            <li className="lyrics-line" data-line-index={line.index} key={line.index}>
              <span>{formatTimestamp(line.startTimeMs)}</span>
              <p>{line.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Dashboard() {
  return (
    <WidgetShell rightAction="settings">
      <p className="app-status" id="app-status">오늘 발자국장 준비 완료냥</p>
      <div className="global-widget-controls" aria-label="위젯 열고 닫기">
        <button className="action-button primary" id="toggle-paw-widget" type="button" aria-pressed="true">작업 발자국 ON</button>
        <button className="action-button" id="global-lyrics-toggle" type="button" aria-pressed="false">가사 오버레이 OFF</button>
      </div>
      <div className="widget-stack">
        <TaskPawWidget tasks={sampleTasks} />
        <MusicPlayerWidget tracks={sampleTracks} />
        <LyricsWidget />
      </div>
    </WidgetShell>
  );
}

export default function App() {
  const [demoLoggedIn, setDemoLoggedIn] = useState(false);

  if (!demoLoggedIn) {
    return (
      <div onDoubleClick={() => setDemoLoggedIn(true)}>
        <AuthScreen />
      </div>
    );
  }

  return <Dashboard />;
}
