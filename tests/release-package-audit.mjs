import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releasePackages = ["core", "vite", "electrobun", "bun"];
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "bunwire-release-pack-"));
const packRoot = path.join(temporaryRoot, "packs");
const consumerRoot = path.join(temporaryRoot, "consumer");

function runNode(script, args, cwd, timeout = 180_000) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    stdio: "pipe",
    timeout,
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"));
  }
  return result.stdout;
}

function runExecutable(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"));
  }
  return result.stdout;
}

try {
  const pnpmPath = process.env.npm_execpath;
  if (!pnpmPath) {
    throw new Error("npm_execpath is unavailable; run this audit through pnpm test:release-pack.");
  }
  await mkdir(packRoot, { recursive: true });
  await mkdir(consumerRoot, { recursive: true });

  const tarballs = new Map();
  for (const packageName of releasePackages) {
    const packageRoot = path.join(repositoryRoot, "packages", packageName);
    const sourceManifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    runNode(pnpmPath, ["pack", "--pack-destination", packRoot], packageRoot);
    const candidates = (await readdir(packRoot))
      .filter((entry) => entry.endsWith(".tgz") && ![...tarballs.values()].some((value) => path.basename(value) === entry));
    if (candidates.length !== 1) {
      throw new Error(`Expected one new tarball for @bunwire/${packageName}, found ${candidates.length}.`);
    }
    const tarball = path.join(packRoot, candidates[0]);
    tarballs.set(packageName, tarball);

    const entries = runExecutable("tar", ["-tf", tarball], repositoryRoot)
      .split(/\r?\n/)
      .filter(Boolean);
    const allowed = /^package\/(?:package\.json|README\.md|LICENSE|dist\/.*\.(?:js|d\.ts|map))$/;
    const unexpected = entries.filter((entry) => !allowed.test(entry));
    if (unexpected.length > 0) {
      throw new Error(`Unexpected files in @bunwire/${packageName} tarball: ${unexpected.join(", ")}`);
    }
    for (const required of ["package/package.json", "package/README.md", "package/LICENSE", "package/dist/index.js", "package/dist/index.d.ts"]) {
      if (!entries.includes(required)) {
        throw new Error(`@bunwire/${packageName} tarball is missing ${required}.`);
      }
    }

    const manifest = JSON.parse(runExecutable("tar", ["-xOf", tarball, "package/package.json"], repositoryRoot));
    if (manifest.version !== sourceManifest.version || manifest.private === true || manifest.publishConfig?.access !== "public") {
      throw new Error(`@bunwire/${packageName} is not configured as a public ${sourceManifest.version} package.`);
    }
    if (Object.values(manifest.dependencies ?? {}).some((version) => String(version).startsWith("workspace:"))) {
      throw new Error(`@bunwire/${packageName} packed manifest retains a workspace dependency protocol.`);
    }
  }

  const packedCore = `file:${tarballs.get("core").replaceAll("\\", "/")}`;
  const packedBun = `file:${tarballs.get("bun").replaceAll("\\", "/")}`;
  await writeFile(path.join(consumerRoot, "package.json"), JSON.stringify({
    name: "bunwire-packed-consumer",
    private: true,
    type: "module",
    dependencies: {
      "@bunwire/bun": packedBun,
      "@bunwire/core": packedCore,
      "@bunwire/vite": `file:${tarballs.get("vite").replaceAll("\\", "/")}`,
      "@bunwire/electrobun": `file:${tarballs.get("electrobun").replaceAll("\\", "/")}`,
      typescript: "5.9.3",
      vite: "7.3.6",
    },
  }, null, 2));
  await writeFile(
    path.join(consumerRoot, "pnpm-workspace.yaml"),
    `packages:\n  - .\noverrides:\n  '@bunwire/core': ${JSON.stringify(packedCore)}\n`,
  );
  await writeFile(path.join(consumerRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      experimentalDecorators: true,
      skipLibCheck: true,
    },
    include: ["consumer.ts"],
  }, null, 2));
  await writeFile(path.join(consumerRoot, "consumer.ts"), `
import { Controller, Service, createToken, defineApp } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";
import { bunwire, defineBunwireConfig } from "@bunwire/vite";
import { ElectrobunAdapter, Route } from "@bunwire/electrobun";

const VALUE = createToken<string>("value");
@Service() class Values {}
@Controller("release") class ReleaseController { @Route("read") read(): string { return "ok"; } }
const config = defineBunwireConfig({ source: "./src", bootstrap: "./src/bootstrap.ts" });
const plugin = bunwire();
const app = defineApp().withAdapter(new ElectrobunAdapter());
const bunApp = defineApp().withAdapter(new BunAdapter({ handleSignals: false }));
void [VALUE, Values, ReleaseController, config, plugin, app, bunApp];
`);
  await writeFile(path.join(consumerRoot, "consumer.mjs"), `
import { createToken, defineApp } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";
import { bunwire } from "@bunwire/vite";
import { ElectrobunAdapter } from "@bunwire/electrobun";
if (typeof createToken !== "function" || typeof defineApp !== "function" || typeof bunwire !== "function" || typeof ElectrobunAdapter !== "function" || typeof BunAdapter !== "function") {
  throw new Error("Packed Bunwire public ESM exports are incomplete.");
}
`);

  runNode(pnpmPath, ["install", "--ignore-scripts"], consumerRoot);
  runNode(path.join(consumerRoot, "node_modules/typescript/bin/tsc"), ["-p", "tsconfig.json", "--pretty", "false"], consumerRoot);
  runNode(path.join(consumerRoot, "consumer.mjs"), [], consumerRoot);

  console.log("Bunwire tarball contents, manifests, isolated typechecking, and ESM imports passed for all release packages.");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
