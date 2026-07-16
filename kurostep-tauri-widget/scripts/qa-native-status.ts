import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type WindowStatus = {
  label: string;
  visible: boolean;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
};

type ClientStatus = {
  view: string;
  stage: string;
  authenticated: boolean;
  text: string;
  current_lyric_context?: string | null;
  build_commit?: string | null;
  build_time?: string | null;
  timestamp_ms: number;
  windows: WindowStatus[];
  overlaps: string[];
  views?: Record<string, ClientViewStatus>;
};

type ClientViewStatus = {
  stage?: string;
  authenticated?: boolean;
  text?: string;
  current_lyric_context?: string | null;
  build_commit?: string | null;
  build_time?: string | null;
  timestamp_ms?: number;
};

type SavedWindowPositions = Record<string, { x?: number | null; y?: number | null }>;

const statusPath = process.env.KUROSTEP_NATIVE_STATUS_PATH ||
  join(homedir(), "Library/Application Support/com.song991123.kurostep/client-status-v1.json");
const positionsPath = process.env.KUROSTEP_WINDOW_POSITIONS_PATH ||
  join(homedir(), "Library/Application Support/com.song991123.kurostep/window-positions-v6.json");
const maxAgeMs = Number(process.env.KUROSTEP_NATIVE_STATUS_MAX_AGE_MS || 180000);
const positionTolerancePx = Number(process.env.KUROSTEP_NATIVE_POSITION_TOLERANCE_PX || 4);
const expectedBuildCommit = process.env.KUROSTEP_EXPECTED_BUILD_COMMIT || readCurrentGitCommit();
const status = JSON.parse(readFileSync(statusPath, "utf8")) as ClientStatus;
const savedPositions = JSON.parse(readFileSync(positionsPath, "utf8")) as SavedWindowPositions;
const ageMs = Date.now() - Number(status.timestamp_ms || 0);
const windowsByLabel = new Map(status.windows.map((windowStatus) => [windowStatus.label, windowStatus]));
const mainStatus = status.views?.main || status;
const pawStatus = status.views?.paw || null;
const text = mainStatus.text || "";
const pawToggleOn = text.includes("작업 발자국 ON");
const lyricsToggleOn = text.includes("가사 오버레이 ON");
const currentLyricContext = parseCurrentLyricContext(mainStatus.current_lyric_context || status.current_lyric_context);

assert.ok(ageMs >= 0 && ageMs <= maxAgeMs, `native status must be fresh (${ageMs}ms old)`);
assert.equal(mainStatus.authenticated, true, "installed app should keep the main player view logged in for smoke QA");
assert.ok(mainStatus.build_commit && mainStatus.build_commit !== "unknown", "native status must include the installed React build commit");
assert.ok(mainStatus.build_time && mainStatus.build_time !== "unknown", "native status must include the installed React build time");
assert.equal(mainStatus.build_commit, expectedBuildCommit, `installed app build must match the current git commit (${expectedBuildCommit})`);
for (const [view, viewStatus] of Object.entries(status.views || { [status.view]: status })) {
  assert.notEqual(viewStatus.stage, "client-error", `${view} view must not report a recent client runtime error`);
  assert.notEqual(viewStatus.stage, "client-unhandled-rejection", `${view} view must not report a recent unhandled promise rejection`);
  assert.notEqual(viewStatus.stage, "native-error", `${view} view must not report a recent native command error`);
}
assert.equal(status.overlaps.length, 0, `visible native windows must not overlap: ${status.overlaps.join(", ")}`);

const main = windowsByLabel.get("main");
assert.equal(main?.visible, true, "main player window must be visible");
assertWindowRestoredFromSavedPosition("main", main);

if (pawToggleOn) {
  const paw = windowsByLabel.get("paw");
  assert.equal(paw?.visible, true, "paw window must be visible when 작업 발자국 is ON");
  assertWindowRestoredFromSavedPosition("paw", paw);
  assertCurrentLyricContext("paw");
  assert.ok(pawStatus?.authenticated, "paw view should report an authenticated render status");
  assert.match(pawStatus?.text || "", /작업 발자국/, "paw view should report its rendered task surface");
  assert.match(pawStatus?.text || "", /가사 창/, "paw view should report its full lyrics surface");
  assert.match(pawStatus?.text || "", /전체 가사/, "paw view should report the expanded full lyrics panel");
}

if (lyricsToggleOn) {
  const lyrics = windowsByLabel.get("lyrics");
  assert.equal(lyrics?.visible, true, "lyrics overlay must be visible when 가사 오버레이 is ON");
  assertWindowRestoredFromSavedPosition("lyrics", lyrics);
  assertCurrentLyricContext("lyrics overlay");
}

if (text.includes("LEMONADE")) {
  assert.equal(typeof currentLyricContext.trackId, "number", "LEMONADE smoke QA should report a numeric lyric context trackId");
}

function assertCurrentLyricContext(target: string) {
  assert.ok(status.current_lyric_context, `${target} QA should include the latest lyric context in native status`);
  assert.equal(typeof currentLyricContext, "object", `${target} lyric context must be a JSON object`);
  assert.equal(typeof currentLyricContext.at, "number", `${target} lyric context must include an update timestamp`);
  assert.ok(
    currentLyricContext.trackId == null || typeof currentLyricContext.trackId === "number",
    `${target} lyric context trackId must be null or a number`,
  );
  assert.ok(
    currentLyricContext.line == null || typeof currentLyricContext.line === "object",
    `${target} lyric context line must be null or an object`,
  );
}

function assertWindowRestoredFromSavedPosition(label: string, windowStatus: WindowStatus | undefined) {
  const saved = savedPositions[label];
  assert.ok(saved, `${label} window must have a saved position`);
  assert.equal(typeof saved.x, "number", `${label} saved position must include x`);
  assert.equal(typeof saved.y, "number", `${label} saved position must include y`);
  assert.equal(typeof windowStatus?.x, "number", `${label} status must include x`);
  assert.equal(typeof windowStatus?.y, "number", `${label} status must include y`);
  assert.ok(
    Math.abs(Number(windowStatus?.x) - Number(saved.x)) <= positionTolerancePx,
    `${label} x position must restore from saved value: saved=${saved.x}, actual=${windowStatus?.x}`,
  );
  assert.ok(
    Math.abs(Number(windowStatus?.y) - Number(saved.y)) <= positionTolerancePx,
    `${label} y position must restore from saved value: saved=${saved.y}, actual=${windowStatus?.y}`,
  );
}

function parseCurrentLyricContext(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  assert.ok(parsed && typeof parsed === "object" && !Array.isArray(parsed), "current lyric context must parse as an object");
  return parsed as Record<string, unknown>;
}

function readCurrentGitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

console.log(JSON.stringify({
  ok: true,
  statusPath,
  positionsPath,
  ageMs,
  stage: status.stage,
  build: {
    commit: status.build_commit,
    time: status.build_time,
    expectedCommit: expectedBuildCommit,
  },
  authenticated: mainStatus.authenticated,
  currentLyricContext,
  viewStatus: {
    main: {
      stage: mainStatus.stage,
      textIncludesPlayer: text.includes("BGM 턴테이블"),
    },
    paw: pawStatus ? {
      stage: pawStatus.stage,
      textIncludesFullLyrics: String(pawStatus.text || "").includes("가사 창"),
      textIncludesExpandedLyrics: String(pawStatus.text || "").includes("전체 가사"),
    } : null,
  },
  toggles: {
    paw: pawToggleOn ? "ON" : "unknown/off",
    lyrics: lyricsToggleOn ? "ON" : "unknown/off",
  },
  windows: status.windows,
  savedPositions,
  overlaps: status.overlaps,
}, null, 2));
