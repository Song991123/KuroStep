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

  lineElement.textContent = payload.line || "아직 재생 중이 아닙니다";

  if (payload.translation) {
    translationElement.textContent = payload.translation;
    translationElement.hidden = false;
  } else {
    translationElement.textContent = "";
    translationElement.hidden = true;
  }
});
