import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, cp, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "bunwire-cli-packed-"));
const packRoot = path.join(temporaryRoot, "packs");
const consumerRoot = path.join(temporaryRoot, "consumer");
const pnpmPath = process.env.npm_execpath;
if (!pnpmPath) throw new Error("Run this check through pnpm test:cli-pack.");
let watchChild;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 180_000 });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}).\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function pnpm(args, cwd) {
  return run(process.execPath, [pnpmPath, ...args], cwd);
}

async function waitFor(check, message) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

try {
  await mkdir(packRoot);
  await mkdir(consumerRoot);
  const tarballs = new Map();
  for (const name of ["core", "vite", "electrobun", "cli"]) {
    const before = new Set(await readdir(packRoot));
    pnpm(["pack", "--pack-destination", packRoot], path.join(repositoryRoot, "packages", name));
    const added = (await readdir(packRoot)).filter((entry) => entry.endsWith(".tgz") && !before.has(entry));
    if (added.length !== 1) throw new Error(`Expected one @bunwire/${name} tarball.`);
    tarballs.set(name, path.join(packRoot, added[0]));
  }
  const cliEntries = run("tar", ["-tf", tarballs.get("cli")], repositoryRoot).stdout;
  for (const file of ["package/dist/bin.js", "package/dist/index.js", "package/dist/index.d.ts", "package/README.md", "package/LICENSE"]) {
    if (!cliEntries.includes(file)) throw new Error(`CLI tarball is missing ${file}.`);
  }
  await cp(path.join(repositoryRoot, "tests/fixtures/milestone-12-electrobun"), consumerRoot, { recursive: true });
  const dependencies = Object.fromEntries([...tarballs].map(([name, tarball]) => [
    `@bunwire/${name}`, `file:${tarball.replaceAll("\\", "/")}`,
  ]));
  await writeFile(path.join(consumerRoot, "package.json"), JSON.stringify({
    name: "bunwire-cli-no-vite-consumer",
    private: true,
    type: "module",
    dependencies,
  }, null, 2));
  await writeFile(path.join(consumerRoot, "pnpm-workspace.yaml"), [
    "packages:", "  - .", "overrides:",
    ...["core", "vite"].map((name) => `  '@bunwire/${name}': '${dependencies[`@bunwire/${name}`]}'`),
    "",
  ].join("\n"));
  await writeFile(path.join(consumerRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
  pnpm(["install", "--offline", "--ignore-scripts"], consumerRoot);
  try {
    await stat(path.join(consumerRoot, "node_modules/vite"));
    throw new Error("Vite was installed in the compiler-only consumer.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const compiler = run(process.execPath, ["--input-type=module", "-e", "import('@bunwire/vite/compiler').then(m => { if (typeof m.generateBunwireArtifacts !== 'function') process.exit(1) })"], consumerRoot);
  if (compiler.stderr.trim()) throw new Error(compiler.stderr);
  const bin = path.join(consumerRoot, "node_modules", "@bunwire", "cli", "dist", "bin.js");
  run(process.execPath, [bin, "generate"], consumerRoot);
  const registry = await readFile(path.join(consumerRoot, ".bunwire/registry.ts"), "utf8");
  if (!registry.includes("applicationRegistry")) throw new Error("CLI did not generate the expected registry.");
  watchChild = spawn(process.execPath, [bin, "watch"], { cwd: consumerRoot, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let errors = "";
  watchChild.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  watchChild.stderr.setEncoding("utf8").on("data", (chunk) => { errors += chunk; });
  await waitFor(() => output.includes("Watching Bunwire project") && output.includes("Generated Bunwire artifacts"),
    `Packed watcher did not start. ${errors}`);
  const source = path.join(consumerRoot, "src/bun/application.ts");
  await writeFile(source, (await readFile(source, "utf8")).replace('@Route("get")', '@Route("packedWatch")'));
  await waitFor(async () => {
    try { return (await readFile(path.join(consumerRoot, ".bunwire/client.ts"), "utf8")).includes('"users/packedWatch"'); }
    catch { return false; }
  }, `Packed watcher did not regenerate after source edit. ${errors}`);
  if (errors.trim()) throw new Error(`Packed watcher reported an error: ${errors}`);
  console.log("Packed CLI generated and watched Electrobun artifacts without Vite or Bun installed.");
} finally {
  if (watchChild && watchChild.exitCode === null && watchChild.signalCode === null) {
    const exited = new Promise((resolve) => watchChild.once("exit", resolve));
    watchChild.kill("SIGTERM");
    await exited;
  }
  if (path.dirname(temporaryRoot) !== tmpdir() || !path.basename(temporaryRoot).startsWith("bunwire-cli-packed-")) {
    throw new Error("Unsafe temporary cleanup path.");
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
