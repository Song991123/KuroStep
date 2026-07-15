import assert from "node:assert/strict";
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
  build_commit?: string | null;
  build_time?: string | null;
  timestamp_ms: number;
  windows: WindowStatus[];
  overlaps: string[];
};

type SavedWindowPositions = Record<string, { x?: number | null; y?: number | null }>;

const statusPath = process.env.KUROSTEP_NATIVE_STATUS_PATH ||
  join(homedir(), "Library/Application Support/com.song991123.kurostep/client-status-v1.json");
const positionsPath = process.env.KUROSTEP_WINDOW_POSITIONS_PATH ||
  join(homedir(), "Library/Application Support/com.song991123.kurostep/window-positions-v6.json");
const maxAgeMs = Number(process.env.KUROSTEP_NATIVE_STATUS_MAX_AGE_MS || 180000);
const positionTolerancePx = Number(process.env.KUROSTEP_NATIVE_POSITION_TOLERANCE_PX || 4);
const status = JSON.parse(readFileSync(statusPath, "utf8")) as ClientStatus;
const savedPositions = JSON.parse(readFileSync(positionsPath, "utf8")) as SavedWindowPositions;
const ageMs = Date.now() - Number(status.timestamp_ms || 0);
const windowsByLabel = new Map(status.windows.map((windowStatus) => [windowStatus.label, windowStatus]));
const text = status.text || "";
const pawToggleOn = text.includes("작업 발자국 ON");
const lyricsToggleOn = text.includes("가사 오버레이 ON");

assert.ok(ageMs >= 0 && ageMs <= maxAgeMs, `native status must be fresh (${ageMs}ms old)`);
assert.equal(status.view, "main", "native status should be reported from the main player view");
assert.equal(status.authenticated, true, "installed app should keep the user logged in for smoke QA");
assert.ok(status.build_commit && status.build_commit !== "unknown", "native status must include the installed React build commit");
assert.ok(status.build_time && status.build_time !== "unknown", "native status must include the installed React build time");
assert.equal(status.overlaps.length, 0, `visible native windows must not overlap: ${status.overlaps.join(", ")}`);

const main = windowsByLabel.get("main");
assert.equal(main?.visible, true, "main player window must be visible");
assertWindowRestoredFromSavedPosition("main", main);

if (pawToggleOn) {
  const paw = windowsByLabel.get("paw");
  assert.equal(paw?.visible, true, "paw window must be visible when 작업 발자국 is ON");
  assertWindowRestoredFromSavedPosition("paw", paw);
}

if (lyricsToggleOn) {
  const lyrics = windowsByLabel.get("lyrics");
  assert.equal(lyrics?.visible, true, "lyrics overlay must be visible when 가사 오버레이 is ON");
  assertWindowRestoredFromSavedPosition("lyrics", lyrics);
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

console.log(JSON.stringify({
  ok: true,
  statusPath,
  positionsPath,
  ageMs,
  stage: status.stage,
  build: {
    commit: status.build_commit,
    time: status.build_time,
  },
  authenticated: status.authenticated,
  toggles: {
    paw: pawToggleOn ? "ON" : "unknown/off",
    lyrics: lyricsToggleOn ? "ON" : "unknown/off",
  },
  windows: status.windows,
  savedPositions,
  overlaps: status.overlaps,
}, null, 2));
