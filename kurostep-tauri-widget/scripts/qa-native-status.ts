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

const statusPath = process.env.KUROSTEP_NATIVE_STATUS_PATH ||
  join(homedir(), "Library/Application Support/com.song991123.kurostep/client-status-v1.json");
const maxAgeMs = Number(process.env.KUROSTEP_NATIVE_STATUS_MAX_AGE_MS || 180000);
const status = JSON.parse(readFileSync(statusPath, "utf8")) as ClientStatus;
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

if (pawToggleOn) {
  assert.equal(windowsByLabel.get("paw")?.visible, true, "paw window must be visible when 작업 발자국 is ON");
}

if (lyricsToggleOn) {
  assert.equal(windowsByLabel.get("lyrics")?.visible, true, "lyrics overlay must be visible when 가사 오버레이 is ON");
}

console.log(JSON.stringify({
  ok: true,
  statusPath,
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
  overlaps: status.overlaps,
}, null, 2));
