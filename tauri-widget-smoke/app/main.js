const widgetState = {
  work: {
    title: "2막 대사 번역 정리",
    status: "DOING",
    todoCount: 2,
    doingCount: 1,
    doneCount: 4,
  },
  track: {
    title: "Night Window",
    artist: "Moonlit Room",
    playlistName: "Midnight Draft",
    duration: "03:42",
    isPlaying: true,
  },
  playlist: [
    { title: "Night Window", duration: "03:42", isPlaying: true },
    { title: "Soft Static", duration: "02:58", isPlaying: false },
    { title: "Ink Before Dawn", duration: "04:10", isPlaying: false },
  ],
  lyricMemo: {
    line: "keep the light low, let the quiet decide",
    translation: "조용한 빛 아래, 고요함이 결정하도록",
    timestamp: "01:18",
    memo: "불을 낮추고, 조용함이 장면의 감정을 정하게 둔다. (분위기 전환 포인트)",
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sectionHeader(title, actionLabel) {
  const action = actionLabel
    ? `<button class="action-button" type="button">${escapeHtml(actionLabel)}</button>`
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
      <header class="mac-header" data-tauri-drag-region>
        <div class="mac-dots" data-tauri-drag-region>
          <span class="mac-dot dot-red"></span>
          <span class="mac-dot dot-yellow"></span>
          <span class="mac-dot dot-green"></span>
        </div>
        <strong class="window-title" data-tauri-drag-region>KuroStep</strong>
        <button class="icon-button close-button" id="close-widget" type="button" aria-label="닫기">×</button>
      </header>
      <div class="widget-content">
        ${content}
      </div>
    </section>
  `;
}

function todayWorkWidget(work) {
  const statuses = [
    ["TODO", work.todoCount],
    ["DOING", work.doingCount],
    ["DONE", work.doneCount],
  ];

  const statusButtons = statuses
    .map(([status, count]) => {
      const active = status === work.status ? " active" : "";
      return `<button class="badge${active}" type="button">${status} <span>${count}</span></button>`;
    })
    .join("");

  return `
    <section class="widget-section today-work" aria-labelledby="today-work-title">
      ${sectionHeader("TODAY'S WORK", "+ 작업")}
      <div class="task-header">
        <h3 class="task-title" id="today-work-title">${escapeHtml(work.title)}</h3>
      </div>
      <div class="status-badges" aria-label="작업 상태">
        ${statusButtons}
      </div>
      <div class="button-row">
        <button class="action-button" type="button">상태 변경</button>
        <button class="action-button" type="button">플리 연결</button>
      </div>
    </section>
  `;
}

function playerWidget(track) {
  const playingClass = track.isPlaying ? " playing" : "";
  const title = track.isPlaying ? "재생 중" : "여기에 마우스를 올려보세요!";

  return `
    <section class="widget-section now-playing" aria-labelledby="now-playing-title">
      ${sectionHeader("NOW PLAYING", "+ 곡")}
      <div class="player-area${playingClass}" title="${title}">
        <div class="cat-tail" aria-hidden="true"></div>
        <div class="record" aria-label="재생 중인 레코드">
          <span class="record-label">
            <img class="paw-print" src="./assets/paw-print.svg" alt="" aria-hidden="true" />
          </span>
        </div>
        <div class="track-info">
          <h3 id="now-playing-title">${escapeHtml(track.title)}</h3>
          <p>${escapeHtml(track.artist)} · ${escapeHtml(track.playlistName)}</p>
          <div class="track-actions">
            <button class="action-button" type="button">현재곡 변경</button>
            <button class="action-button" type="button">링크 열기</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function playlistWidget(tracks) {
  const items = tracks
    .map((track) => {
      const playing = track.isPlaying ? " playing" : "";
      return `
        <li class="playlist-item${playing}">
          <span class="playlist-track">${escapeHtml(track.title)}</span>
          <span class="playlist-duration">${escapeHtml(track.duration)}</span>
        </li>
      `;
    })
    .join("");

  return `
    <section class="widget-section playlist-widget" aria-labelledby="playlist-title">
      ${sectionHeader("PLAYLIST", "관리")}
      <ol class="playlist-list" id="playlist-title">
        ${items}
      </ol>
      <div class="button-row">
        <button class="action-button" type="button">+ 플레이리스트</button>
        <button class="action-button" type="button">+ 곡 추가</button>
        <button class="action-button" type="button">순서 편집</button>
      </div>
    </section>
  `;
}

function lyricMemoWidget(lyricMemo) {
  return `
    <section class="widget-section lyric-memo-widget" aria-labelledby="lyric-memo-title">
      ${sectionHeader("LYRIC", "라인 선택")}
      <div class="lyric-display" id="lyric-memo-title" aria-live="polite">
        <span class="lyric-time">${escapeHtml(lyricMemo.timestamp)}</span>
        <div class="lyric-lines">
          <p class="lyric-line">"${escapeHtml(lyricMemo.line)}"</p>
          <p class="lyric-translation">「${escapeHtml(lyricMemo.translation)}」</p>
        </div>
      </div>
      <label class="memo-label" for="translation-memo">한국어 번역 메모</label>
      <textarea class="memo-input" id="translation-memo" rows="2">${escapeHtml(lyricMemo.memo)}</textarea>
      <div class="button-row">
        <button class="action-button" type="button">메모 편집</button>
        <button class="action-button primary" type="button">저장</button>
      </div>
    </section>
  `;
}

function render() {
  const app = document.querySelector("#app");

  app.innerHTML = widgetShell(`
    ${todayWorkWidget(widgetState.work)}
    ${playerWidget(widgetState.track)}
    ${playlistWidget(widgetState.playlist)}
    ${lyricMemoWidget(widgetState.lyricMemo)}
  `);

  const closeButton = document.querySelector("#close-widget");
  closeButton.addEventListener("click", closeWidget);
}

async function closeWidget() {
  const tauriWindow = window.__TAURI__?.window;

  if (tauriWindow?.getCurrentWindow) {
    await tauriWindow.getCurrentWindow().close();
    return;
  }

  window.close();
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeWidget();
  }
});

render();
