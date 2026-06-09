import { widgetState } from "./data.js";
import { LyricMemoWidget } from "./components/LyricMemoWidget.js";
import { PlayerWidget } from "./components/PlayerWidget.js";
import { PlaylistWidget } from "./components/PlaylistWidget.js";
import { TodayWorkWidget } from "./components/TodayWorkWidget.js";
import { WidgetShell } from "./components/WidgetShell.js";

const app = document.querySelector("#app");

app.innerHTML = WidgetShell(`
  ${TodayWorkWidget(widgetState.work)}
  ${PlayerWidget(widgetState.track)}
  ${PlaylistWidget(widgetState.playlist)}
  ${LyricMemoWidget(widgetState.lyricMemo)}
`);

const closeButton = document.querySelector("#close-widget");

async function closeWidget() {
  const tauriWindow = window.__TAURI__?.window;

  if (tauriWindow?.getCurrentWindow) {
    await tauriWindow.getCurrentWindow().close();
    return;
  }

  window.close();
}

closeButton.addEventListener("click", closeWidget);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeWidget();
  }
});
