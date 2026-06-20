const DEPLOYED_BASE_URL = "https://song991123.github.io/KuroStep/";
const DEPLOYED_ORIGIN = new URL(DEPLOYED_BASE_URL).origin;
const params = new URLSearchParams(window.location.search);
const view = params.get("view") || "main";
const shellWindow = document.querySelector("#shell-window");
const shellFrame = document.querySelector("#shell-frame");
const shellActions = document.querySelector("#shell-actions");
const shellTitleText = document.querySelector("#shell-title-text");
let authenticated = false;
let trustedContentOrigin = DEPLOYED_ORIGIN;
let pawPopup = null;

if (view === "paw") {
  shellWindow.classList.add("paw");
}

const shellTitles = {
  main: "KuroStep",
  paw: "작업 발자국",
  lyrics: "가사",
};

if (shellTitleText) {
  shellTitleText.textContent = shellTitles[view] || "KuroStep";
}
document.title = shellTitles[view] || "KuroStep";

function iconSvg(name) {
  const icons = {
    settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05-2.12 2.12-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66v.1h-3v-.1a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.05.05-2.12-2.12.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.1h-.1v-3h.1A1.8 1.8 0 0 0 4.6 9a1.8 1.8 0 0 0-.36-1.98l-.05-.05 2.12-2.12.05.05A1.8 1.8 0 0 0 8.34 5.26 1.8 1.8 0 0 0 9.44 3.6v-.1h3v.1a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.05-.05 2.12 2.12-.05.05A1.8 1.8 0 0 0 19.4 9a1.8 1.8 0 0 0 1.66 1.1h.1v3h-.1A1.8 1.8 0 0 0 19.4 15z"/></svg>`,
  };
  return icons[name] || "";
}

function contentUrl() {
  const baseUrl = params.get("content") || DEPLOYED_BASE_URL;
  const url = new URL("", baseUrl);
  url.searchParams.set("view", view);
  url.searchParams.set("embedded", "1");
  url.searchParams.set("shell", "tauri");
  url.searchParams.set("v", "20260621-v012");
  trustedContentOrigin = url.origin;
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
    shellFrame.contentWindow?.postMessage({ source: "kurostep-shell", action: "open_settings" }, trustedContentOrigin);
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
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    throw new Error("Tauri invoke bridge is not available");
  }
  return invoke(command, payload);
}

async function setNativePawVisible(visible, payload = {}) {
  try {
    await invokeNative("set_paw_visible", { ...payload, visible });
    return true;
  } catch {
    return false;
  }
}

async function exitApp() {
  try {
    await invokeNative("exit_app");
  } catch {
    await currentWindow()?.close?.();
  }
}

function openPawPopup() {
  if (view !== "main") {
    return;
  }
  if (pawPopup && !pawPopup.closed) {
    pawPopup.focus?.();
    return;
  }
  pawPopup = window.open(
    "shell.html?view=paw",
    "kurostep-paw",
    "popup,width=380,height=520,resizable=no",
  );
}

function closePawPopup() {
  if (pawPopup && !pawPopup.closed) {
    pawPopup.close();
  }
  pawPopup = null;
}

async function handleNativeMessage(message) {
  if (!message || message.source !== "kurostep-content") {
    return;
  }

  if (message.type === "auth_state") {
    authenticated = Boolean(message.authenticated);
    renderActions();
    if (view === "main") {
      const didUseNative = await setNativePawVisible(Boolean(message.authenticated && message.pawVisible !== false), {
        reload: false,
        authJson: message.authJson || null,
        clearAuth: !message.authenticated,
      });
      if (!didUseNative) {
        if (message.authenticated && message.pawVisible !== false) {
          openPawPopup();
        } else {
          closePawPopup();
        }
      }
    }
    return;
  }

  if (message.type !== "native_command") {
    return;
  }

  if (message.command === "set_paw_visible") {
    const visible = Boolean(message.payload?.visible);
    const didUseNative = await setNativePawVisible(visible, message.payload || {});
    if (!didUseNative) {
      if (visible) {
        openPawPopup();
      } else if (authenticated || message.payload?.clearAuth) {
        closePawPopup();
      }
    }
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
      trustedContentOrigin,
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
  if (event.origin !== trustedContentOrigin) {
    return;
  }
  handleNativeMessage(event.data);
});

shellFrame.src = contentUrl();
renderActions();
