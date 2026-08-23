import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-11-native-smoke");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const build = spawnSync(pnpmCommand, ["--filter", "@bunwire/electrobun...", "build"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  shell: process.platform === "win32",
});
process.stdout.write(build.stdout ?? "");
process.stderr.write(build.stderr ?? "");
if (build.status !== 0) process.exit(build.status ?? 1);

const fixtureModules = path.join(fixtureRoot, "node_modules");
const fixtureBunwireModules = path.join(fixtureModules, "@bunwire");
mkdirSync(fixtureBunwireModules, { recursive: true });
for (const [target, link] of [
  [path.join(repositoryRoot, "packages/core"), path.join(fixtureBunwireModules, "core")],
  [path.join(repositoryRoot, "packages/electrobun"), path.join(fixtureBunwireModules, "electrobun")],
  [path.join(repositoryRoot, "node_modules/electrobun"), path.join(fixtureModules, "electrobun")],
]) {
  if (!existsSync(link)) symlinkSync(target, link, "junction");
}

const cliPath = path.join(repositoryRoot, "node_modules/electrobun/bin/electrobun.cjs");
const child = spawn(process.execPath, [cliPath, "dev"], {
  cwd: fixtureRoot,
  env: { ...process.env, CI: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => {
  const text = String(chunk);
  output += text;
  process.stdout.write(text);
});
child.stderr.on("data", (chunk) => {
  const text = String(chunk);
  output += text;
  process.stderr.write(text);
});

const timeout = setTimeout(() => {
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}, 300_000);

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
clearTimeout(timeout);

const requiredMarkers = [
  "BUNWIRE_NATIVE_SMOKE_STARTED",
  "BUNWIRE_NATIVE_SMOKE_REQUEST:native|sdk",
  "BUNWIRE_NATIVE_SMOKE_COMPLETE:verified",
];
const missingMarkers = requiredMarkers.filter((marker) => !output.includes(marker));
if (exitCode !== 0 || missingMarkers.length > 0) {
  process.stderr.write(
    `Electrobun native smoke failed (exit ${exitCode}); missing markers: ${missingMarkers.join(", ") || "none"}.\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write("Electrobun native smoke passed.\n");
}
