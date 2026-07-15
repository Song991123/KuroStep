const DEPLOYED_BASE_URL = "https://song991123.github.io/KuroStep/";
const DEPLOYED_ORIGIN = new URL(DEPLOYED_BASE_URL).origin;
const CONTENT_CACHE_VERSION = "20260716-v063";
const params = new URLSearchParams(window.location.search);
const view = params.get("view") || "main";
const shellWindow = document.querySelector("#shell-window");
const shellFrame = document.querySelector("#shell-frame");
const shellActions = document.querySelector("#shell-actions");
const shellTitleText = document.querySelector("#shell-title-text");
let authenticated = false;
let trustedContentOrigin = DEPLOYED_ORIGIN;
let pawPopup = null;
let positionSaveTimer = null;
let latestLyricContextJson = "{}";
let latestLyricContextStamp = 0;
let authHydrationTimer = null;
let authHydrationConfirmed = false;

function readShellFlag(key, fallback = true) {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : JSON.parse(value) !== false;
  } catch {
    return fallback;
  }
}

function readShellAuthJson() {
  const authJson = window.localStorage.getItem("kurostep.auth");
  if (!authJson) {
    return null;
  }
  try {
    const auth = JSON.parse(authJson);
    return auth?.accessToken ? authJson : null;
  } catch {
    return null;
  }
}

function syncShellAuthToContent() {
  const authJson = readShellAuthJson();
  if (!authJson) {
    return false;
  }
  authenticated = true;
  renderActions();
  shellFrame.contentWindow?.postMessage(
    {
      source: "kurostep-shell",
      type: "hydrate_auth",
      authJson,
      pawVisible: readShellFlag("kurostep.pawWidgetVisible", true),
      lyricsVisible: readShellFlag("kurostep.lyricsOverlayVisible", true),
      autoTranslationEnabled: readShellFlag("kurostep.autoTranslationEnabled", true),
    },
    "*",
  );
  return true;
}

function startShellAuthHydration() {
  window.clearInterval(authHydrationTimer);
  authHydrationConfirmed = false;
  let attempts = 0;
  syncShellAuthToContent();
  authHydrationTimer = window.setInterval(() => {
    attempts += 1;
    if (authHydrationConfirmed || attempts >= 20 || !syncShellAuthToContent()) {
      window.clearInterval(authHydrationTimer);
      authHydrationTimer = null;
    }
  }, 500);
}

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
  url.searchParams.set("v", `${CONTENT_CACHE_VERSION}-${Date.now()}`);
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

function blockDeveloperShortcut(event) {
  const key = event.key.toLowerCase();
  const isMacDevtools = event.metaKey && event.altKey && ["i", "j", "c"].includes(key);
  const isWinDevtools = event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key);
  if (event.key === "F12" || isMacDevtools || isWinDevtools) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function forwardLyricContextToContent(contextJson) {
  if (view !== "paw") {
    return;
  }
  if (!acceptLyricContext(contextJson)) {
    return;
  }
  shellFrame.contentWindow?.postMessage(
    {
      source: "kurostep-shell",
      type: "current_lyric_context",
      contextJson: contextJson || "{}",
    },
    "*",
  );
}

function sendLyricContextToTarget(target, origin, contextJson) {
  if (view !== "paw" || !target) {
    return;
  }
  target.postMessage(
    {
      source: "kurostep-shell",
      type: "current_lyric_context",
      contextJson: contextJson || "{}",
    },
    origin || "*",
  );
}

function lyricContextStamp(contextJson) {
  try {
    const context = JSON.parse(contextJson || "{}");
    return Number(context.sentAt || context.at || context.updatedAt || 0);
  } catch {
    return 0;
  }
}

function acceptLyricContext(contextJson) {
  const nextContextJson = contextJson || "{}";
  const nextStamp = lyricContextStamp(nextContextJson);
  if (nextContextJson === latestLyricContextJson) {
    return false;
  }
  if (!nextStamp && latestLyricContextStamp) {
    return false;
  }
  if (nextStamp && latestLyricContextStamp && nextStamp < latestLyricContextStamp) {
    return false;
  }
  latestLyricContextJson = nextContextJson;
  latestLyricContextStamp = Math.max(latestLyricContextStamp, nextStamp);
  return true;
}

async function refreshLyricContextFromNative(target = null, origin = "*") {
  if (view !== "paw") {
    return;
  }
  try {
    const contextJson = await invokeNative("get_current_lyric_context");
    if (contextJson) {
      if (target) {
        const isLatestContext = contextJson === latestLyricContextJson;
        if (acceptLyricContext(contextJson) || isLatestContext) {
          sendLyricContextToTarget(target, origin, contextJson);
        }
      } else {
        forwardLyricContextToContent(contextJson);
      }
    }
  } catch {
    // The iframe still has storage/BroadcastChannel fallbacks when native polling is unavailable.
  }
}

async function syncLyricContextFromContent(contextJson) {
  if (!acceptLyricContext(contextJson)) {
    return;
  }
  try {
    await invokeNative("sync_paw_lyric_context", { contextJson: latestLyricContextJson });
  } catch {
    // The content iframe still keeps local fallbacks when native sync is unavailable.
  }
}

const tauriListen = window.__TAURI__?.event?.listen;
if (tauriListen) {
  tauriListen("paw:lyric-context", (event) => {
    forwardLyricContextToContent(event.payload);
  }).catch?.(() => {});
}

window.addEventListener("kurostep:lyric-context", (event) => {
  forwardLyricContextToContent(event.detail);
});

if (view === "paw") {
  shellFrame.addEventListener("load", () => {
    void refreshLyricContextFromNative();
  });
  window.setInterval(refreshLyricContextFromNative, 500);
}

shellFrame.addEventListener("load", () => {
  startShellAuthHydration();
});

function scheduleWindowPositionSave() {
  window.clearTimeout(positionSaveTimer);
  positionSaveTimer = window.setTimeout(() => {
    invokeNative("save_current_window_position", { label: view }).catch(() => {});
  }, 250);
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

async function handleNativeMessage(message, replyTarget = null, replyOrigin = "*") {
  if (!message || message.source !== "kurostep-content") {
    return;
  }

  if (message.type === "request_lyric_context") {
    await refreshLyricContextFromNative(replyTarget, replyOrigin);
    return;
  }

  if (message.type === "auth_state") {
    authenticated = Boolean(message.authenticated);
    if (authenticated && authHydrationTimer) {
      authHydrationConfirmed = true;
      window.clearInterval(authHydrationTimer);
      authHydrationTimer = null;
    }
    if (message.authJson) {
      window.localStorage.setItem("kurostep.auth", message.authJson);
    } else if (message.clearAuth) {
      window.localStorage.removeItem("kurostep.auth");
    }
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

  if (message.type === "current_lyric_context") {
    await syncLyricContextFromContent(message.contextJson);
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
  scheduleWindowPositionSave();
});

window.addEventListener("pointerup", scheduleWindowPositionSave);
window.addEventListener("blur", scheduleWindowPositionSave);
window.setInterval(() => {
  invokeNative("save_current_window_position", { label: view }).catch(() => {});
}, 5000);

document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("keydown", blockDeveloperShortcut, true);

window.addEventListener("message", (event) => {
  if (event.origin !== trustedContentOrigin) {
    return;
  }
  handleNativeMessage(event.data, event.source, event.origin);
});

shellFrame.src = contentUrl();
renderActions();
