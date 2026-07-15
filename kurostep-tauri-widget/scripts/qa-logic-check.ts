import assert from "node:assert/strict";
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
  nextRepeatMode,
  normalizeRepeatMode,
  repeatModeLabel,
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
assert.equal(clampLyricSyncOffset(40000), 30000);
assert.equal(clampLyricSyncOffset(-40000), -30000);

assert.equal(isLikelyYoutubeAdDuration(15, 180), true, "short ad duration must not replace song duration");
assert.equal(isLikelyYoutubeAdDuration(179, 180), false, "normal song duration should be accepted");

const line: SelectedLine = { id: 101, lineIndex: 0, startTimeMs: 7360, text: "Green, green" };
const sameLineWithoutServerId: SelectedLine = { lineIndex: 0, startTimeMs: 7360, text: "Green, green" };
assert.equal(lyricLineKey(line), "id-101");
assert.equal(isSameLyricLine(sameLineWithoutServerId, { ...sameLineWithoutServerId }), true);

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

console.log("qa:logic ok");
