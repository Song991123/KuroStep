import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

type ProcessInfo = {
  pid: number;
  command: string;
};

const workspaceHints = [
  "kurostep-tauri-widget",
  "/EDU/Personal Project/KuroStep",
  "/Applications/KuroStep.app",
  "com.song991123.kurostep",
];

const allowedRuntimePatterns = [
  /\/Applications\/KuroStep\.app\/Contents\/MacOS\/KuroStep/,
  /WebKit\.(?:WebContent|Networking|GPU).*KuroStep/,
];

const staleProcessPatterns = [
  /npm (?:run )?(?:dev|tauri:dev)\b/,
  /\btauri dev\b/,
  /\bvite\b.*(?:--host|5173|dev)/,
  /\bgradlew\b.*(?:bootRun|test|run)/,
  /\bGradleDaemon\b/,
  /\bKuroStepApplication\b/,
  /\bspring-boot:run\b/,
];

const processes = readProcesses();
const relevantProcesses = processes.filter((processInfo) => isRelevant(processInfo.command));
const staleProcesses = relevantProcesses.filter((processInfo) => isStale(processInfo.command));

assert.equal(
  staleProcesses.length,
  0,
  `KuroStep QA should not leave dev servers or build daemons running:\n${formatProcesses(staleProcesses)}`,
);

console.log(JSON.stringify({
  ok: true,
  inspectedProcessCount: processes.length,
  relevantProcessCount: relevantProcesses.length,
  allowedRuntimeProcesses: relevantProcesses
    .filter((processInfo) => allowedRuntimePatterns.some((pattern) => pattern.test(processInfo.command)))
    .map((processInfo) => ({ pid: processInfo.pid, command: shorten(processInfo.command) })),
}, null, 2));

function readProcesses() {
  return execFileSync("ps", ["axo", "pid=,command="], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        command: match[2],
      };
    })
    .filter((processInfo): processInfo is ProcessInfo => Boolean(processInfo));
}

function isRelevant(command: string) {
  if (command.includes("qa-process-hygiene")) return false;
  if (command.includes("ps axo")) return false;
  if (/\bGradleDaemon\b/.test(command)) return true;
  if (!workspaceHints.some((hint) => command.includes(hint))) return false;
  return true;
}

function isStale(command: string) {
  if (allowedRuntimePatterns.some((pattern) => pattern.test(command))) return false;
  return staleProcessPatterns.some((pattern) => pattern.test(command));
}

function formatProcesses(processesToFormat: ProcessInfo[]) {
  return processesToFormat
    .map((processInfo) => `- ${processInfo.pid}: ${shorten(processInfo.command)}`)
    .join("\n");
}

function shorten(command: string) {
  return command.length > 220 ? `${command.slice(0, 217)}...` : command;
}
