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

  lineElement.textContent = payload.line || "가사 발자국을 기다리는 중이다냥.";

  if (payload.translation) {
    translationElement.textContent = payload.translation;
    translationElement.hidden = false;
  } else {
    translationElement.textContent = "";
    translationElement.hidden = true;
  }
});
