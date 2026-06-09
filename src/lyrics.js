const lineElement = document.querySelector("#lyric-line");
const translationElement = document.querySelector("#lyric-translation");
const dragRegion = document.querySelector("#lyrics-drag-region");

function getCurrentWindow() {
  return window.__TAURI__?.window?.getCurrentWindow?.();
}

async function startWindowDrag() {
  const currentWindow = getCurrentWindow();

  if (currentWindow?.startDragging) {
    await currentWindow.startDragging();
  }
}

dragRegion.addEventListener("mousedown", startWindowDrag);

window.__TAURI__?.event?.listen?.("lyrics:update", (event) => {
  const payload = event.payload ?? {};

  if (payload.line) {
    lineElement.textContent = payload.line;
  }

  if (payload.translation) {
    translationElement.textContent = payload.translation;
  }
});
