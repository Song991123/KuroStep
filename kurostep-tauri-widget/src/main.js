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
  lyricsOverlayVisible: false,
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
            <button class="action-button subtitle-toggle" id="subtitle-toggle" type="button" aria-pressed="${widgetState.lyricsOverlayVisible}">
              자막 ${widgetState.lyricsOverlayVisible ? "ON" : "OFF"}
            </button>
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
    <section class="widget-section lyric-memo-widget" aria-labelledby="translation-memo-title">
      ${sectionHeader("TRANSLATION MEMO", "라인 선택")}
      <p class="memo-context" id="translation-memo-title">
        <span>${escapeHtml(lyricMemo.timestamp)}</span>
        "${escapeHtml(lyricMemo.line)}"
      </p>
      <label class="memo-label" for="translation-memo">한국어 번역 메모</label>
      <textarea class="memo-input" id="translation-memo" rows="2">${escapeHtml(lyricMemo.memo)}</textarea>
      <p class="memo-save-state" id="memo-save-state" aria-live="polite"></p>
      <div class="button-row">
        <button class="action-button" type="button">메모 편집</button>
        <button class="action-button primary" id="save-memo" type="button">저장</button>
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

  bindWindowControls();
  bindSubtitleToggle();
  bindMemoPersistence();
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
  document.querySelector("#window-close").addEventListener("click", closeWidget);
  document.querySelector("#window-minimize").addEventListener("click", minimizeWidget);
  document.querySelector("#window-zoom").addEventListener("click", toggleWidgetZoom);

  document.querySelector("#window-drag-region").addEventListener("mousedown", (event) => {
    if (event.target.closest("button")) {
      return;
    }

    startWindowDrag();
  });
}

async function setLyricsOverlayVisible(visible) {
  widgetState.lyricsOverlayVisible = visible;

  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    await invoke("set_lyrics_visible", {
      visible,
      line: widgetState.lyricMemo.line,
      translation: widgetState.lyricMemo.translation,
    });
  }

  const button = document.querySelector("#subtitle-toggle");
  button.textContent = `자막 ${visible ? "ON" : "OFF"}`;
  button.setAttribute("aria-pressed", String(visible));
}

function bindSubtitleToggle() {
  document.querySelector("#subtitle-toggle").addEventListener("click", async () => {
    await setLyricsOverlayVisible(!widgetState.lyricsOverlayVisible);
  });
}

function bindMemoPersistence() {
  const memoInput = document.querySelector("#translation-memo");
  const saveButton = document.querySelector("#save-memo");
  const saveState = document.querySelector("#memo-save-state");
  const savedMemo = window.localStorage.getItem("kurostep.translationMemo");

  if (savedMemo) {
    memoInput.value = savedMemo;
    widgetState.lyricMemo.memo = savedMemo;
  }

  saveButton.addEventListener("click", () => {
    widgetState.lyricMemo.memo = memoInput.value;
    window.localStorage.setItem("kurostep.translationMemo", memoInput.value);
    saveState.textContent = "로컬에 저장됨";
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeWidget();
  }
});

render();
