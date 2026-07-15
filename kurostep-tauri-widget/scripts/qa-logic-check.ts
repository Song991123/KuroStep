import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chooseLineByPlaybackTime,
  clampLyricSyncOffset,
  isLikelyYoutubeAdDuration,
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
assert.equal(chooseLineByPlaybackTime(lyric, source, 7.1)?.text, "Green, green");
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
const appSource = readFileSync(new URL("../src-react/App.tsx", import.meta.url), "utf8");
const buildInfoSource = readFileSync(new URL("../src-react/buildInfo.ts", import.meta.url), "utf8");
const tauriSource = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
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
assert.match(appSource, /autoTranslationEnabledRef/, "auto translation toggle must use a live ref for late async guards");
assert.match(
  appSource,
  /cancelled \|\| !lineStillCurrent\(\) \|\| !autoTranslationEnabledRef\.current/,
  "late auto-translation responses must not apply after the user turns automatic translation off",
);
assert.match(
  appSource,
  /const activeMemoTranslation = isTranslationForLine\(translation, selectedLine\) \? translation : null/,
  "memo widget must ignore stale translations from the previous lyric line",
);

const requiredControlIds = [
  "window-minimize",
  "settings-open",
  "app-exit-button",
  "toggle-paw-widget",
  "global-lyrics-toggle",
  "global-auto-translation-toggle",
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
  assert.match(appSource, new RegExp(`id="${id}"`), `${id} control must have a stable id for no-mouse QA`);
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
  "lyrics-panel-toggle",
]) {
  assert.match(
    appSource,
    new RegExp(`<button[\\s\\S]*id="${id}"[\\s\\S]*aria-label=`),
    `${id} button must expose an accessible name`,
  );
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
assert.match(appCss, /\.lyrics-full-now\s*\{[\s\S]*position:\s*sticky/, "expanded full lyrics should keep the current line visible while scrolling");
assert.match(appCss, /\.lyrics-full-list\s*\{[\s\S]*scrollbar-width:\s*thin/, "expanded full lyrics should expose a visible scroll affordance");
assert.equal(/\.lyrics-full-list::-webkit-scrollbar\s*\{[\s\S]*display:\s*none/.test(appCss), false, "expanded full lyrics must not hide its scrollbar");
assert.match(appSource, /aria-current=\{isActive \? "true" : undefined\}/, "active full-lyrics row should expose aria-current");
assert.match(appSource, /fullListRef/, "expanded full lyrics should measure the scroll container before auto-following the active line");
assert.match(appSource, /scrollIntoView\(\{ block: "nearest", behavior: "auto" \}\)/, "full lyrics should avoid smooth-scroll churn on every lyric tick");
assert.equal(/scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/.test(appSource), false, "full lyrics must not constantly animate the list while the song plays");
assert.match(buildInfoSource, /KUROSTEP_BUILD_COMMIT/, "React build should expose a build commit for installed-app QA");
assert.match(appSource, /buildCommit:\s*KUROSTEP_BUILD_COMMIT/, "main view should report the React build commit to native status");
assert.match(tauriSource, /build_commit:\s*Option<String>/, "native status should persist the React build commit");

console.log("qa:logic ok");
