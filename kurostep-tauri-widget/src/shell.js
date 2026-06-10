const DEPLOYED_BASE_URL = "https://song991123.github.io/KuroStep/";
const DEPLOYED_ORIGIN = new URL(DEPLOYED_BASE_URL).origin;
const params = new URLSearchParams(window.location.search);
const view = params.get("view") || "main";
const shellWindow = document.querySelector("#shell-window");
const shellFrame = document.querySelector("#shell-frame");
const shellActions = document.querySelector("#shell-actions");
let authenticated = false;

if (view === "paw") {
  shellWindow.classList.add("paw");
}

function iconSvg(name) {
  const icons = {
    settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05-2.12 2.12-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66v.1h-3v-.1a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.05.05-2.12-2.12.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.1h-.1v-3h.1A1.8 1.8 0 0 0 4.6 9a1.8 1.8 0 0 0-.36-1.98l-.05-.05 2.12-2.12.05.05A1.8 1.8 0 0 0 8.34 5.26 1.8 1.8 0 0 0 9.44 3.6v-.1h3v.1a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.05-.05 2.12 2.12-.05.05A1.8 1.8 0 0 0 19.4 9a1.8 1.8 0 0 0 1.66 1.1h.1v3h-.1A1.8 1.8 0 0 0 19.4 15z"/></svg>`,
  };
  return icons[name] || "";
}

function contentUrl() {
  const baseUrl = params.get("content") || DEPLOYED_BASE_URL;
  const url = new URL(view === "paw" ? "paw.html" : "", baseUrl);
  url.searchParams.set("embedded", "1");
  url.searchParams.set("shell", "tauri");
  url.searchParams.set("v", "20260610-5");
  return url.toString();
}

function renderActions() {
  if (view !== "main") {
    shellActions.innerHTML = "";
    return;
  }

  shellActions.innerHTML = `
    ${authenticated ? `<button class="shell-action-button icon-text" id="shell-settings" type="button">${iconSvg("settings")}<span>설정</span></button>` : ""}
    <button class="shell-action-button" id="shell-exit" type="button">종료</button>
  `;

  document.querySelector("#shell-settings")?.addEventListener("click", () => {
    shellFrame.contentWindow?.postMessage({ source: "kurostep-shell", action: "open_settings" }, DEPLOYED_ORIGIN);
  });

  document.querySelector("#shell-exit")?.addEventListener("click", exitApp);
}

function currentWindow() {
  return window.__TAURI__?.window?.getCurrentWindow?.();
}

async function minimizeWindow() {
  await currentWindow()?.minimize?.();
}

async function startDrag() {
  await currentWindow()?.startDragging?.();
}

async function invokeNative(command, payload = {}) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    return null;
  }
  return invoke(command, payload);
}

async function exitApp() {
  try {
    await invokeNative("exit_app");
  } catch {
    await currentWindow()?.close?.();
  }
}

async function handleNativeMessage(message) {
  if (!message || message.source !== "kurostep-content") {
    return;
  }

  if (message.type === "auth_state") {
    authenticated = Boolean(message.authenticated);
    renderActions();
    return;
  }

  if (message.type !== "native_command") {
    return;
  }

  try {
    await invokeNative(message.command, message.payload || {});
  } catch (error) {
    shellFrame.contentWindow?.postMessage(
      {
        source: "kurostep-shell",
        type: "native_error",
        command: message.command,
        message: error?.message || String(error),
      },
      DEPLOYED_ORIGIN,
    );
  }
}

document.querySelector("#shell-minimize")?.addEventListener("click", minimizeWindow);
document.querySelector("#shell-drag-region")?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest("button")) {
    return;
  }
  startDrag();
});

window.addEventListener("message", (event) => {
  if (event.origin !== DEPLOYED_ORIGIN) {
    return;
  }
  handleNativeMessage(event.data);
});

shellFrame.src = contentUrl();
renderActions();
