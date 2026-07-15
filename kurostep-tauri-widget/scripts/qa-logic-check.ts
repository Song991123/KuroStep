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
}), false, "matching official playback should advance even before YouTube reports a duration");
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

console.log("qa:logic ok");
