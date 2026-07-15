const lineElement = document.querySelector("#lyric-line");
const translationElement = document.querySelector("#lyric-translation");
const dragRegion = document.querySelector("#lyrics-drag-region");
let positionSaveTimer = null;

function normalizeOverlayText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getCurrentWindow() {
  return window.__TAURI__?.window?.getCurrentWindow?.();
}

async function startWindowDrag() {
  const currentWindow = getCurrentWindow();

  if (currentWindow?.startDragging) {
    await currentWindow.startDragging();
    scheduleWindowPositionSave();
  }
}

async function invokeNative(command, payload = {}) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    return null;
  }
  return invoke(command, payload);
}

function scheduleWindowPositionSave() {
  window.clearTimeout(positionSaveTimer);
  positionSaveTimer = window.setTimeout(() => {
    invokeNative("save_current_window_position", { label: "lyrics" }).catch(() => {});
  }, 250);
}

function blockDeveloperShortcut(event) {
  const key = event.key.toLowerCase();
  const isMacDevtools = event.metaKey && event.altKey && ["i", "j", "c"].includes(key);
  const isWinDevtools = event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key);
  const isBroadInspectorShortcut =
    (event.metaKey || event.ctrlKey) && event.shiftKey && ["i", "j", "c", "k"].includes(key);
  if (event.key === "F12" || isMacDevtools || isWinDevtools || isBroadInspectorShortcut) {
    event.preventDefault();
    event.stopPropagation();
  }
}

lineElement.addEventListener("mousedown", startWindowDrag);
translationElement.addEventListener("mousedown", startWindowDrag);
window.addEventListener("mouseup", scheduleWindowPositionSave);
window.addEventListener("blur", scheduleWindowPositionSave);
window.setInterval(() => {
  invokeNative("save_current_window_position", { label: "lyrics" }).catch(() => {});
}, 5000);
document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("keydown", blockDeveloperShortcut, true);

window.__TAURI__?.event?.listen?.("lyrics:update", (event) => {
  const payload = event.payload ?? {};
  const nextLine = normalizeOverlayText(payload.line) || "가사 발자국을 기다리는 중이다냥.";
  const nextTranslation = normalizeOverlayText(payload.translation);

  if (lineElement.textContent !== nextLine) {
    lineElement.textContent = nextLine;
  }

  if (nextTranslation) {
    if (translationElement.textContent !== nextTranslation) {
      translationElement.textContent = nextTranslation;
    }
    translationElement.hidden = false;
  } else {
    if (translationElement.textContent) {
      translationElement.textContent = "";
    }
    translationElement.hidden = true;
  }
});
