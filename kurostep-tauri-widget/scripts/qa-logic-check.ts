import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chooseLineByPlaybackTime,
  clampLyricSyncOffset,
  isSameLyricLine,
  isTranslationForLine,
  lyricLineKey,
  shouldAutoTranslateLine,
  stableTranslationForLine,
  translationStatusLabel,
  translationFingerprint,
} from "../src-react/lib/lyrics.ts";
import {
  getNextPlaylistIndex,
  isLikelyYoutubeAdDuration,
  isLikelyYoutubeAdPlaybackSnapshot,
  nextRepeatMode,
  normalizeTrackDuration,
  normalizeRepeatMode,
  repeatModeLabel,
  shouldReplayCurrentTrackOnEnded,
  youtubeTitleLooksLikeAd,
} from "../src-react/lib/playback.ts";
import type { Lyric, LyricSource, SelectedLine, Translation } from "../src-react/lib/api.ts";

const source: LyricSource = {
  lines: [
    { index: 0, startTimeMs: 7360, text: "Green, green" },
    { index: 1, startTimeMs: 10100, text: "You should come" },
    { index: 2, startTimeMs: 22600, text: "mess with the team" },
  ],
};
const lyric: Lyric = {
  id: 10,
  trackId: 20,
  lines: [
    { id: 101, lineIndex: 0, startTimeMs: 7360 },
    { id: 102, lineIndex: 1, startTimeMs: 10100 },
    { id: 103, lineIndex: 2, startTimeMs: 22600 },
  ],
};

assert.equal(chooseLineByPlaybackTime(lyric, source, 0), null, "first lyric should not flash before its timestamp");
assert.equal(chooseLineByPlaybackTime(lyric, source, 7.1), null, "first lyric should not appear too early because of lookahead");
assert.equal(chooseLineByPlaybackTime(lyric, source, 7.3)?.text, "Green, green");
assert.equal(chooseLineByPlaybackTime(lyric, source, 22.3)?.text, "mess with the team");
assert.equal(chooseLineByPlaybackTime(lyric, source, 1.8, 5600)?.text, "Green, green");
assert.equal(chooseLineByPlaybackTime(lyric, source, 8.0, -3000), null, "negative sync offset must not flash an early lyric");
assert.equal(chooseLineByPlaybackTime(lyric, source, 9.8, 0)?.text, "You should come", "lookahead should select the next line close to its timestamp");
assert.equal(clampLyricSyncOffset(40000), 30000);
assert.equal(clampLyricSyncOffset(-40000), -30000);

assert.equal(isLikelyYoutubeAdDuration(15, 180), true, "short ad duration must not replace song duration");
assert.equal(isLikelyYoutubeAdDuration(90, 240), true, "90-second ad duration must not replace a known longer song");
assert.equal(isLikelyYoutubeAdDuration(100, 240), true, "substantially shorter ad-like duration must not replace a known song");
assert.equal(isLikelyYoutubeAdDuration(179, 180), false, "normal song duration should be accepted");
assert.equal(youtubeTitleLooksLikeAd("Advertisement"), true);
assert.equal(youtubeTitleLooksLikeAd("공식 MV"), false);
assert.equal(normalizeTrackDuration(180.4, 180), 180, "small duration jitter should keep the stable track duration");
assert.equal(isLikelyYoutubeAdPlaybackSnapshot({
  activeVideoId: "ad-video",
  expectedVideoId: "song-video",
  candidateDurationSeconds: 30,
  expectedDurationSeconds: 180,
  currentSeconds: 12,
}), true, "a different active YouTube video should be treated as ad playback");
assert.equal(isLikelyYoutubeAdPlaybackSnapshot({
  activeVideoId: "",
  expectedVideoId: "song-video",
  candidateDurationSeconds: 45,
  expectedDurationSeconds: 210,
  currentSeconds: 20,
}), true, "unknown short clip during a known track should not advance song playback");
assert.equal(isLikelyYoutubeAdPlaybackSnapshot({
  activeVideoId: "song-video",
  expectedVideoId: "song-video",
  title: "Official MV",
  candidateDurationSeconds: 210,
  expectedDurationSeconds: 210,
  currentSeconds: 20,
}), false, "matching official playback should advance song playback");
assert.equal(isLikelyYoutubeAdPlaybackSnapshot({
  activeVideoId: "song-video",
  expectedVideoId: "song-video",
  title: "Official MV",
  candidateDurationSeconds: 0,
  expectedDurationSeconds: 0,
  currentSeconds: 8,
}), true, "matching playback must not advance before YouTube reports a trusted duration");
assert.equal(isLikelyYoutubeAdPlaybackSnapshot({
  activeVideoId: "song-video",
  expectedVideoId: "song-video",
  title: "Official MV",
  candidateDurationSeconds: 30,
  expectedDurationSeconds: 0,
  currentSeconds: 12,
}), true, "short matching pre-roll clips must not advance the song clock before duration is known");
assert.equal(isLikelyYoutubeAdPlaybackSnapshot({
  activeVideoId: "song-video",
  expectedVideoId: "song-video",
  title: "Official MV",
  candidateDurationSeconds: 180,
  expectedDurationSeconds: 0,
  currentSeconds: 2,
}), false, "matching playback can advance once YouTube reports a trusted song-like duration");
assert.equal(isLikelyYoutubeAdPlaybackSnapshot({
  activeVideoId: "song-video",
  expectedVideoId: "song-video",
  title: "Official MV",
  candidateDurationSeconds: 0,
  expectedDurationSeconds: 210,
  currentSeconds: 8,
}), true, "known tracks must not advance the song clock until YouTube reports a trusted duration");
assert.equal(isLikelyYoutubeAdPlaybackSnapshot({
  activeVideoId: "",
  expectedVideoId: "song-video",
  candidateDurationSeconds: 0,
  expectedDurationSeconds: 0,
  currentSeconds: 8,
}), true, "unknown pre-duration playback should not advance the song clock");

const line: SelectedLine = { id: 101, lineIndex: 0, startTimeMs: 7360, text: "Green, green" };
const sameLineWithoutServerId: SelectedLine = { lineIndex: 0, startTimeMs: 7360, text: "Green, green" };
const idlessLine: SelectedLine = { id: null, lineIndex: 8, startTimeMs: 20290, text: "That's red, red" };
const idlessDraft: Translation = {
  clientLineKey: lyricLineKey(idlessLine),
  languageCode: "ko",
  translatedText: "빨강, 빨강",
  memoText: "서버 줄 번호 없이 로컬 저장",
  status: "LOCAL_DRAFT",
};
assert.equal(lyricLineKey(line), "id-101");
assert.equal(isSameLyricLine(sameLineWithoutServerId, { ...sameLineWithoutServerId }), true);
assert.equal(isTranslationForLine(idlessDraft, idlessLine), true, "id-less lyric lines must keep local memo drafts stable");
assert.equal(isTranslationForLine(idlessDraft, { ...idlessLine, lineIndex: 9 }), false, "id-less memo drafts must not leak into a different line");

const savedTranslation: Translation = {
  id: 33,
  lyricLineRefId: 101,
  clientLineKey: "id-101",
  languageCode: "ko",
  translatedText: "초록, 초록",
  memoText: "",
  status: "SAVED",
};
assert.equal(isTranslationForLine(savedTranslation, line), true);
assert.notEqual(translationFingerprint(savedTranslation), translationFingerprint({ ...savedTranslation, translatedText: "녹색, 녹색" }));
const localOverride: Translation = {
  clientLineKey: "id-101",
  languageCode: "ko",
  translatedText: "사용자가 고친 번역",
  memoText: "로컬 메모",
  status: "LOCAL_DRAFT",
};
assert.equal(
  stableTranslationForLine(line, [localOverride, savedTranslation])?.translatedText,
  "사용자가 고친 번역",
  "local memo drafts must win over saved/auto translations to avoid flicker",
);
assert.equal(
  stableTranslationForLine(line, [null, { ...savedTranslation, clientLineKey: "idx-9-0-other" }, savedTranslation])?.translatedText,
  "초록, 초록",
  "translation selection must skip candidates that belong to a different line",
);
assert.equal(translationStatusLabel("LOCAL_DRAFT"), "작성 중");
assert.equal(translationStatusLabel("EDITED"), "저장됨", "server-edited memo should not look empty after saving");
assert.equal(translationStatusLabel("SAVED"), "저장됨", "local saved memo should keep a stable saved label");
assert.equal(translationStatusLabel("AUTO_DRAFT"), "");
assert.equal(shouldAutoTranslateLine("Green, green"), true);
assert.equal(shouldAutoTranslateLine("Outside, 한 밤에"), false, "mixed Korean lyric lines should not duplicate themselves as translations");

assert.equal(normalizeRepeatMode("bad-value"), "off");
assert.equal(nextRepeatMode("off"), "all");
assert.equal(nextRepeatMode("all"), "one");
assert.equal(nextRepeatMode("one"), "off");
assert.equal(repeatModeLabel("one"), "한 곡 반복");
assert.equal(getNextPlaylistIndex(3, 2, 1, false), 2, "normal mode should stop at the last track");
assert.equal(getNextPlaylistIndex(3, 2, 1, true), 0, "repeat-all should wrap from last to first");
assert.equal(getNextPlaylistIndex(3, 0, -1, true), 2, "repeat-all should wrap from first to last");
assert.equal(getNextPlaylistIndex(1, 0, 1, true), 0, "single-track repeat-all should stay stable");
assert.equal(getNextPlaylistIndex(0, 0, 1, true), -1, "empty playlists should not select a ghost track");
assert.equal(getNextPlaylistIndex(3, 10, 1, false), 2, "out-of-range current index should clamp before moving");
assert.equal(shouldReplayCurrentTrackOnEnded("one", 5), true, "repeat-one should always replay the current track on ended");
assert.equal(shouldReplayCurrentTrackOnEnded("all", 1), true, "repeat-all with a single-track playlist should replay instead of ending silently");
assert.equal(shouldReplayCurrentTrackOnEnded("all", 2), false, "repeat-all with multiple tracks should advance to the next item");
assert.equal(shouldReplayCurrentTrackOnEnded("off", 1), false, "normal mode should stop after a single track ends");

const tauriConfig = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const capability = JSON.parse(readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const appSource = readFileSync(new URL("../src-react/App.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../src-react/lib/api.ts", import.meta.url), "utf8");
const buildInfoSource = readFileSync(new URL("../src-react/buildInfo.ts", import.meta.url), "utf8");
const tauriSource = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const processHygieneSource = readFileSync(new URL("./qa-process-hygiene.ts", import.meta.url), "utf8");
const nativeSeedSource = readFileSync(new URL("./qa-native-seed.ts", import.meta.url), "utf8");
const nativeSmokeSource = readFileSync(new URL("./qa-native-smoke.ts", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/shell.js", import.meta.url), "utf8");
const lyricsOverlaySource = readFileSync(new URL("../src/lyrics.js", import.meta.url), "utf8");
const reactUiParityDoc = readFileSync(new URL("../docs/react-ui-parity.md", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const shellCss = readFileSync(new URL("../src/shell.css", import.meta.url), "utf8");
const lyricsCss = readFileSync(new URL("../src/lyrics.css", import.meta.url), "utf8");

assert.ok(
  tauriConfig.app.windows.every((windowConfig: { devtools?: boolean }) => windowConfig.devtools === false),
  "all Tauri windows must keep devtools disabled",
);
assert.ok(
  capability.permissions.includes("core:webview:deny-internal-toggle-devtools"),
  "Tauri IPC must deny internal devtools toggling",
);
for (const [name, sourceText] of [
  ["React app", appSource],
  ["Tauri shell", shellSource],
  ["lyrics overlay", lyricsOverlaySource],
] as const) {
  assert.match(sourceText, /(?:contextmenu[\s\S]*preventDefault|preventDefault[\s\S]*contextmenu)/, `${name} should block context menu access`);
  assert.match(sourceText, /keydown[\s\S]*blockDeveloperShortcut/, `${name} should install the developer shortcut guard`);
  assert.match(sourceText, /event\.key === "F12"[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/, `${name} should block F12 and stop the shortcut event`);
}
assert.match(apiSource, /export class ApiError extends Error/, "API errors should preserve HTTP status for auth recovery");
assert.match(apiSource, /export function isAuthExpiredError/, "auth expiry detection should be shared instead of string-only app catches");
assert.match(
  appSource,
  /function clearAuthSession\([\s\S]*window\.localStorage\.removeItem\("kurostep\.auth"\)[\s\S]*setAuth\(null\)/,
  "expired sessions should clear stored auth and return to the login screen",
);
assert.match(
  appSource,
  /if \(isAuthExpiredError\(error\)\) \{[\s\S]*clearAuthSession\(\);[\s\S]*return;[\s\S]*\}/,
  "JWT or 401 errors should not keep the stale authenticated workspace mounted",
);
assert.match(
  appSource,
  /setInterval\(heartbeat,\s*30000\)/,
  "installed-app status should refresh periodically even when the UI is idle",
);
assert.match(
  appSource,
  /currentLyricContext:\s*window\.localStorage\.getItem\("kurostep\.currentLyricContext"\) \|\| ""/,
  "installed-app status should include the latest lyric context for paw/overlay QA",
);
assert.match(
  tauriSource,
  /fn start_client_status_heartbeat\([\s\S]*Duration::from_secs\(30\)[\s\S]*refresh_client_status_heartbeat/,
  "native status should refresh from Rust even when the WebView timer is throttled",
);
assert.match(
  tauriSource,
  /current_lyric_context:\s*Option<String>/,
  "native status should persist the latest lyric context for installed-app QA",
);
assert.match(
  tauriSource,
  /WebviewWindowBuilder::new\(app, "paw", WebviewUrl::App\("index\.html#\?view=paw&shell=tauri"\.into\(\)\)\)/,
  "paw window should open the direct React paw view, not the legacy shell iframe",
);
assert.equal(
  /WebviewWindowBuilder::new\(app, "paw", WebviewUrl::App\("shell\.html/.test(tauriSource),
  false,
  "paw window must not regress to the shell.html iframe route",
);
assert.match(
  tauriSource,
  /fn sync_paw_context\([\s\S]*paw\.emit\("paw:lyric-context"[\s\S]*paw\.eval\(&paw_lyric_context_script/,
  "native paw context sync should push lyric context through both Tauri event and eval fallback",
);
assert.match(
  tauriSource,
  /fn paw_lyric_context_script[\s\S]*window\.__KUROSTEP_LATEST_LYRIC_CONTEXT__[\s\S]*window\.postMessage\(message, "\*"\)[\s\S]*CustomEvent\("kurostep:lyric-context"/,
  "paw context eval fallback should update the direct paw view without requiring a shell iframe",
);
assert.match(
  appSource,
  /writeJson\("kurostep\.currentLyricContext", context\)[\s\S]*new BroadcastChannel\("kurostep\.currentLyricContext"\)[\s\S]*invokeNative\("sync_paw_lyric_context"/,
  "main player should publish lyric context through storage, BroadcastChannel, and native sync",
);
assert.match(
  appSource,
  /if \(shellView === "main"\) return;[\s\S]*invokeNative\("get_current_lyric_context"\)/,
  "paw view should poll native lyric context instead of depending on mouse-visible UI state",
);
assert.match(
  appSource,
  /if \(shellView === "main"\) return;[\s\S]*window\.addEventListener\("storage", syncCurrentLyricFromStorage\)/,
  "paw view should listen for stored lyric-context updates",
);
assert.match(
  appSource,
  /const adPlayback = isLikelyYoutubeAdPlayback\(playerRef\.current, rawDuration, current\);[\s\S]*if \(adPlayback\) \{[\s\S]*stalledTickRef\.current = 0;[\s\S]*return;[\s\S]*\}[\s\S]*if \(event\.data === window\.YT\.PlayerState\.PLAYING\)/,
  "YouTube ad state changes must not pause, advance, or repeat the real playlist track",
);
assert.match(appSource, /const \[linkSubmitting, setLinkSubmitting\] = useState\(false\)/, "YouTube link submit should have its own in-flight guard");
assert.match(
  appSource,
  /async function submitLink\(\) \{[\s\S]*if \(!value \|\| linkSubmitting\) return;[\s\S]*setLinkSubmitting\(true\);[\s\S]*finally \{[\s\S]*setLinkSubmitting\(false\);[\s\S]*\}/,
  "YouTube link submit must always clear its in-flight state",
);
assert.match(
  appSource,
  /id="youtube-link-submit"[\s\S]*disabled=\{!canRegisterLinks \|\| linkSubmitting\}[\s\S]*linkSubmitting \? "불러오는 중"/,
  "YouTube link button should disable and show loading text while a link is being registered",
);
assert.match(
  appSource,
  /const \[youtubeVisible, setYoutubeVisible\] = useState\(\(\) => readJson<boolean>\("kurostep\.youtubeVisible", false\)\)/,
  "YouTube video panel visibility should restore the user's previous panel state",
);
assert.match(
  appSource,
  /onToggleYoutube=\{\(\) => \{[\s\S]*writeJson\("kurostep\.youtubeVisible", next\);[\s\S]*return next;/,
  "YouTube video panel toggles should persist immediately",
);
assert.match(
  appSource,
  /const \[lyricsExpanded, setLyricsExpanded\] = useState\(\(\) => readJson<boolean>\("kurostep\.lyricsExpanded", false\)\)/,
  "expanded lyrics panel should restore the user's previous panel state",
);
assert.match(
  appSource,
  /onToggleExpanded=\{\(\) => \{[\s\S]*writeJson\("kurostep\.lyricsExpanded", next\);[\s\S]*return next;/,
  "expanded lyrics panel toggles should persist immediately",
);
assert.match(appSource, /autoTranslationEnabledRef/, "auto translation toggle must use a live ref for late async guards");
assert.match(
  appSource,
  /cancelled \|\| !lineStillCurrent\(\) \|\| !autoTranslationEnabledRef\.current/,
  "late auto-translation responses must not apply after the user turns automatic translation off",
);
assert.match(appSource, /function isAutoDraftTranslation/, "auto translation drafts should be distinguishable from user-saved translations");
assert.match(
  appSource,
  /autoTranslationEnabledRef\.current = enabled;[\s\S]*if \(!enabled\) \{[\s\S]*pendingTranslationRef\.current\.clear\(\);[\s\S]*setTranslation\(\(current\) => isAutoDraftTranslation\(current\) \? null : current\);/,
  "turning automatic translation off should immediately hide current auto drafts and cancel pending draft work",
);
assert.match(
  appSource,
  /Object\.entries\(current\)\.filter\(\(\[, value\]\) => isManualOrSavedTranslation\(value\)\)/,
  "turning automatic translation off should remove cached auto drafts from the visible translation cache",
);
assert.match(
  appSource,
  /const allowedTranslations = autoTranslationEnabledRef\.current[\s\S]*: translations\.filter\(\(item\) => isManualOrSavedTranslation\(item\)\);/,
  "saved auto drafts from the server must not be applied while automatic translation is off",
);
assert.match(
  appSource,
  /const activeMemoTranslation = isTranslationForLine\(translation, selectedLine\) \? translation : null/,
  "memo widget must ignore stale translations from the previous lyric line",
);
assert.match(
  appSource,
  /setTranslation\(\(current\) => isTranslationForLine\(current, lineSnapshot\) \? current : null\);\s*if \(pendingTranslationRef\.current\.has\(key\)\)/,
  "pending translation fetches must preserve the current line memo instead of blanking and flickering",
);
assert.match(
  appSource,
  /const localTranslation = makeLocalTranslation\([\s\S]*?writeLocalTranslationDraft\(trackIdSnapshot, line, localTranslation\.translatedText, localTranslation\.memoText \|\| "", "SAVED"\);[\s\S]*?if \(!translationTextForSave \|\| !auth\?\.userId \|\| !line\.id\)/,
  "manual memo saves must write a local saved draft before any server dependency",
);
assert.match(
  appSource,
  /const saved = await api<Translation>[\s\S]*?writeLocalTranslationDraft\(trackIdSnapshot, line, normalized\.translatedText, normalized\.memoText \|\| "", "SAVED"\);/,
  "successful server memo saves must refresh the local saved draft",
);
assert.match(
  appSource,
  /catch \(error\) \{[\s\S]*?applySavedTranslation\(localTranslation\);/,
  "failed server memo saves must keep the local saved draft visible",
);
assert.match(
  appSource,
  /function draftMemo\(translatedText: string, memoText: string\) \{[\s\S]*?writeLocalTranslationDraft\(workspace\.currentTrack\?\.id, selectedLine, normalized\.translatedText, normalized\.memoText \|\| ""\);/,
  "typing in the memo editor must persist a local draft immediately",
);
assert.match(
  appSource,
  /id="memo-save-state"[\s\S]*aria-live=\{statusLabel \? "polite" : "off"\}/,
  "empty memo status must not keep an active live region that flickers while lyrics change",
);
assert.match(
  appSource,
  /async function deleteMemo\(\) \{[\s\S]*?removeLocalTranslationDraft\(workspace\.currentTrack\?\.id, selectedLine\);/,
  "deleting a memo must clear the matching local draft",
);

const requiredControlIds = [
  "window-minimize",
  "settings-open",
  "app-exit-button",
  "toggle-paw-widget",
  "global-lyrics-toggle",
  "global-auto-translation-toggle",
  "settings-auto-translation-toggle",
  "player-previous-track",
  "player-rewind-10",
  "player-toggle-play",
  "player-forward-10",
  "player-next-track",
  "player-repeat-mode",
  "progress-track",
  "volume-toggle",
  "volume-slider",
  "youtube-video-toggle",
  "youtube-link-submit",
  "shuffle-playlist",
  "playlist-import-confirm",
  "playlist-import-cancel",
  "playlist-page-prev",
  "playlist-page-next",
  "open-task-create",
  "task-title-input",
  "create-task-submit",
  "create-task-cancel",
  "delete-task",
  "task-status-todo",
  "task-status-doing",
  "task-status-done",
  "lyrics-panel-toggle",
  "save-lyric-piece",
  "lyrics-sync-late-5s",
  "lyrics-sync-late-500ms",
  "lyrics-sync-early-500ms",
  "lyrics-sync-early-5s",
  "lyrics-sync-reset",
  "save-memo",
  "delete-memo",
];
for (const id of requiredControlIds) {
  assert.match(
    appSource,
    new RegExp(`(?:id="${id}"|id: "${id}")`),
    `${id} control must have a stable id for no-mouse QA`,
  );
}
for (const id of [
  "player-previous-track",
  "player-rewind-10",
  "player-toggle-play",
  "player-forward-10",
  "player-next-track",
  "player-repeat-mode",
  "volume-toggle",
  "youtube-video-toggle",
  "shuffle-playlist",
  "open-task-create",
  "create-task-submit",
  "create-task-cancel",
  "delete-task",
  "task-status-todo",
  "task-status-doing",
  "task-status-done",
  "lyrics-panel-toggle",
]) {
  if (id.startsWith("task-status-")) {
    assert.match(appSource, new RegExp(`id: "${id}"`), `${id} button must expose a stable status control id`);
    assert.match(appSource, /aria-label=\{`작업 상태를 \$\{statusLabel\(status\)\}으로 변경`\}/, `${id} button must expose an accessible name`);
  } else {
    assert.match(
      appSource,
      new RegExp(`<button[\\s\\S]*id="${id}"[\\s\\S]*aria-label=`),
      `${id} button must expose an accessible name`,
    );
  }
}
assert.match(appSource, /function seekByKeyboard/, "progress slider should support keyboard seeking");
assert.match(appSource, /event\.key === "ArrowLeft"[\s\S]*skipBy\(-5\)/, "progress slider ArrowLeft should seek backward");
assert.match(appSource, /event\.key === "ArrowRight"[\s\S]*skipBy\(5\)/, "progress slider ArrowRight should seek forward");
assert.match(appSource, /event\.key === "PageDown"[\s\S]*skipBy\(-30\)/, "progress slider PageDown should seek backward by a larger step");
assert.match(appSource, /event\.key === "PageUp"[\s\S]*skipBy\(30\)/, "progress slider PageUp should seek forward by a larger step");
assert.match(appSource, /event\.key === "Home"[\s\S]*seekToPosition\(0\)/, "progress slider Home should seek to the beginning");
assert.match(appSource, /event\.key === "End"[\s\S]*seekToPosition\(displayedDuration\)/, "progress slider End should seek to the end");
assert.match(appSource, /id="progress-track"[\s\S]*aria-valuemin=\{0\}[\s\S]*aria-valuemax=/, "progress slider should expose aria value bounds");
assert.match(appSource, /id="progress-track"[\s\S]*aria-valuenow=/, "progress slider should expose the current playback value");
assert.match(appSource, /id="progress-track"[\s\S]*aria-valuetext=/, "progress slider should expose human-readable playback position");

for (const [name, css] of [
  ["styles.css", appCss],
  ["shell.css", shellCss],
  ["lyrics.css", lyricsCss],
] as const) {
  assert.equal(
    /font-size:\s*(?:[0-9]|1[0-3])px/.test(css),
    false,
    `${name} must not use text smaller than 14px`,
  );
}

assert.equal(/text-overflow:\s*ellipsis/.test(lyricsCss), false, "lyrics overlay must never ellipsize text");
assert.equal(/-webkit-line-clamp|line-clamp/.test(lyricsCss), false, "lyrics overlay must not clamp lyric lines");
assert.equal(/white-space:\s*nowrap/.test(lyricsCss), false, "lyrics overlay must wrap instead of clipping long lines");
assert.match(lyricsCss, /body\s*\{[\s\S]*pointer-events:\s*none/, "lyrics overlay body should let empty transparent space pass mouse events");
assert.match(lyricsCss, /\.lyrics-overlay\s*\{[\s\S]*pointer-events:\s*none/, "lyrics overlay wrapper should not catch empty-space mouse events");
assert.match(lyricsCss, /\.lyric-line,\s*\n\.lyric-translation\s*\{[\s\S]*pointer-events:\s*auto/, "only visible lyric text should be draggable");
assert.match(appCss, /\.memo-save-state\.empty\s*\{[\s\S]*visibility:\s*hidden/, "empty memo status should reserve space without visually flickering");
assert.equal(/\.memo-save-state\s*\{[\s\S]*transition:/.test(appCss), false, "memo status should not animate between empty and saved labels");
assert.match(appCss, /\.lyrics-full-now\s*\{[\s\S]*position:\s*sticky/, "expanded full lyrics should keep the current line visible while scrolling");
assert.match(appCss, /\.lyrics-full-list\s*\{[\s\S]*scrollbar-width:\s*thin/, "expanded full lyrics should expose a visible scroll affordance");
assert.equal(/\.lyrics-full-list::-webkit-scrollbar\s*\{[\s\S]*display:\s*none/.test(appCss), false, "expanded full lyrics must not hide its scrollbar");
assert.match(appCss, /\.lyrics-panel-toggle\[aria-expanded="true"\] svg\s*\{[\s\S]*transform:\s*rotate\(180deg\)/, "expanded lyrics toggle should visually reflect its state");
assert.match(appCss, /\.lyrics-line-button:focus-visible\s*\{[\s\S]*outline:/, "full lyrics rows should have visible keyboard focus");
assert.match(appCss, /@media \(max-width:\s*430px\)[\s\S]*\.lyrics-line-button\s*\{[\s\S]*grid-template-columns:\s*16px 50px minmax\(0, 1fr\)/, "full lyrics rows should keep stable columns on narrow screens");
assert.match(appSource, /aria-current=\{isActive \? "true" : undefined\}/, "active full-lyrics row should expose aria-current");
assert.match(appSource, /fullListRef/, "expanded full lyrics should measure the scroll container before auto-following the active line");
assert.match(appSource, /scrollIntoView\(\{ block: "nearest", behavior: "auto" \}\)/, "full lyrics should avoid smooth-scroll churn on every lyric tick");
assert.equal(/scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/.test(appSource), false, "full lyrics must not constantly animate the list while the song plays");
assert.match(appSource, /<LyricsWidget[\s\S]*showSyncControls=\{false\}[\s\S]*surface="section"/, "paw window should expose full lyrics as an in-window section without nesting another widget card");
assert.match(appSource, /lineActionLabel="이 줄 선택하기"/, "paw full lyrics should select a line for memo editing instead of pretending to adjust playback sync");
assert.match(appSource, /if \(shellView !== "main" && shellView !== "paw"\)/, "paw window should load lyric sources so the installed app has a full-lyrics UI");
assert.match(appCss, /\.paw-full-lyrics \.lyrics-preview\s*\{[\s\S]*padding:\s*6px 0 0/, "paw full lyrics section should avoid double padding inside the paw widget");
assert.match(buildInfoSource, /KUROSTEP_BUILD_COMMIT/, "React build should expose a build commit for installed-app QA");
assert.match(appSource, /buildCommit:\s*KUROSTEP_BUILD_COMMIT/, "main view should report the React build commit to native status");
assert.match(tauriSource, /build_commit:\s*Option<String>/, "native status should persist the React build commit");
assert.equal(
  packageJson.scripts["qa:native-seed"],
  "node --experimental-strip-types scripts/qa-native-seed.ts",
  "native seed QA should be runnable from package scripts",
);
assert.match(nativeSeedSource, /kurostep\.auth/, "native seed QA should inject the auth session without using mouse input");
assert.match(nativeSeedSource, /kurostep\.pawWidgetVisible/, "native seed QA should turn the paw window on before installed-app smoke checks");
assert.match(nativeSeedSource, /kurostep\.lyricsOverlayVisible/, "native seed QA should turn the lyrics overlay on before installed-app smoke checks");
assert.match(nativeSeedSource, /kurostep\.currentLyricContext/, "native seed QA should seed a lyric context for native status checks");
assert.match(nativeSeedSource, /LocalStorage\/localstorage\.sqlite3/, "native seed QA should target WebKit localStorage for the installed Tauri app");
assert.match(nativeSeedSource, /function assertInstalledAppIsStopped/, "native seed QA should guard against writing WebKit storage while the app is running");
assert.match(nativeSeedSource, /\/Applications\/KuroStep\.app\/Contents\/MacOS\/KuroStep/, "native seed QA should detect the installed app process before seeding");
assert.equal(
  packageJson.scripts["qa:native-smoke"],
  "node --experimental-strip-types scripts/qa-native-smoke.ts",
  "native smoke QA should be runnable from package scripts",
);
assert.match(nativeSmokeSource, /runNodeScript\("scripts\/qa-native-seed\.ts"\)/, "native smoke QA should seed the installed app without mouse input");
assert.match(nativeSmokeSource, /openInstalledApp\(\)/, "native smoke QA should launch the installed app after seeding");
assert.match(nativeSmokeSource, /runNodeScriptBuffered\("scripts\/qa-native-status\.ts"\)/, "native smoke QA should hide transient native status failures while polling");
assert.match(nativeSmokeSource, /runNodeScript\("scripts\/qa-process-hygiene\.ts"\)/, "native smoke QA should finish with process hygiene verification");
assert.equal(
  packageJson.scripts["qa:process-hygiene"],
  "node --experimental-strip-types scripts/qa-process-hygiene.ts",
  "process hygiene QA should be runnable from package scripts",
);
assert.match(processHygieneSource, /\/Applications\/KuroStep\.app/, "process hygiene QA should allow the installed app runtime");
assert.match(processHygieneSource, /tauri dev/, "process hygiene QA should detect stale Tauri dev servers");
assert.match(processHygieneSource, /GradleDaemon/, "process hygiene QA should detect stale build daemons");
assert.match(processHygieneSource, /unexpectedProcesses\.length/, "process hygiene QA should reject unknown KuroStep-related processes");
assert.match(processHygieneSource, /installedAppMainProcesses\.length <= 1/, "process hygiene QA should reject duplicate installed app processes");
assert.match(reactUiParityDoc, /기본 텍스트와 버튼은 14px 이상/, "React UI parity docs should preserve the 14px minimum text rule");
assert.match(reactUiParityDoc, /배포 UI 렌더 QA는 GitHub Pages origin에서 진행한다/, "React UI parity docs should require Pages-origin render QA");
assert.match(reactUiParityDoc, /CORS[\s\S]*“준비 중” 재현 판단에 쓰지 않는다/, "React UI parity docs should not treat local Vite CORS failures as deployed ready-state bugs");

console.log("qa:logic ok");
