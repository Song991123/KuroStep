import { execFileSync, spawnSync } from "node:child_process";

const INSTALLED_APP_COMMAND = "/Applications/KuroStep.app/Contents/MacOS/KuroStep";
const INSTALLED_APP_BUNDLE = "/Applications/KuroStep.app";
const STATUS_ATTEMPTS = Number(process.env.KUROSTEP_NATIVE_SMOKE_STATUS_ATTEMPTS || 12);
const STATUS_DELAY_MS = Number(process.env.KUROSTEP_NATIVE_SMOKE_STATUS_DELAY_MS || 1500);

type RuntimeProcess = {
  pid: number;
  command: string;
};

function installedAppProcesses() {
  const output = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes(INSTALLED_APP_COMMAND))
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter((runtimeProcess): runtimeProcess is RuntimeProcess => Boolean(runtimeProcess?.pid));
}

function stopInstalledApp() {
  const processes = installedAppProcesses();
  for (const runtimeProcess of processes) {
    try {
      process.kill(runtimeProcess.pid, "SIGTERM");
    } catch {
      // The process may already be gone; the wait loop below verifies the result.
    }
  }
  waitForAppToStop();
}

function waitForAppToStop() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (installedAppProcesses().length === 0) return;
    sleep(250);
  }
  throw new Error(`KuroStep did not stop cleanly: ${JSON.stringify(installedAppProcesses())}`);
}

function runNodeScript(scriptPath: string) {
  execFileSync("node", ["--experimental-strip-types", scriptPath], { stdio: "inherit" });
}

function runNodeScriptBuffered(scriptPath: string) {
  return execFileSync("node", ["--experimental-strip-types", scriptPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function openInstalledApp() {
  const result = spawnSync("open", ["-a", INSTALLED_APP_BUNDLE], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`open -a ${INSTALLED_APP_BUNDLE} failed with status ${result.status}`);
  }
}

function waitForNativeStatus() {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= STATUS_ATTEMPTS; attempt += 1) {
    try {
      const output = runNodeScriptBuffered("scripts/qa-native-status.ts");
      process.stdout.write(output);
      return;
    } catch (error) {
      lastError = error;
      sleep(STATUS_DELAY_MS);
    }
  }
  writeBufferedFailure(lastError);
  throw lastError;
}

function writeBufferedFailure(error: unknown) {
  const bufferedError = error as { stdout?: Buffer | string; stderr?: Buffer | string };
  if (bufferedError.stdout) process.stdout.write(bufferedError.stdout.toString());
  if (bufferedError.stderr) process.stderr.write(bufferedError.stderr.toString());
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main() {
  stopInstalledApp();
  runNodeScript("scripts/qa-native-seed.ts");
  openInstalledApp();
  waitForNativeStatus();
  runNodeScript("scripts/qa-process-hygiene.ts");
}

main();
