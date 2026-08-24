import { performance } from "node:perf_hooks";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineApp } from "../packages/core/dist/index.js";
import {
  analyzeBunwireApplication,
  generateBunwireArtifacts,
} from "../packages/vite/dist/index.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = path.join(repositoryRoot, "examples/electrobun-app");
const ceilings = Object.freeze({
  compilerMedianMs: 10_000,
  startupMedianMs: 10,
  invocationMedianPerCallMs: 2,
});

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function elapsed(operation) {
  const started = performance.now();
  await operation();
  return performance.now() - started;
}

await analyzeBunwireApplication({ root: exampleRoot });
const compilerSamplesMs = [];
for (let index = 0; index < 3; index += 1) {
  compilerSamplesMs.push(await elapsed(() => analyzeBunwireApplication({ root: exampleRoot })));
}

const startupSamplesMs = [];
for (let index = 0; index < 100; index += 1) {
  startupSamplesMs.push(await elapsed(async () => {
    const app = defineApp();
    await app.start();
  }));
}

const invocationApp = defineApp();
await invocationApp.start();
for (let index = 0; index < 100; index += 1) {
  await invocationApp.runInvocation(() => index);
}
const invocationSamplesPerCallMs = [];
for (let batch = 0; batch < 5; batch += 1) {
  const batchMs = await elapsed(async () => {
    for (let index = 0; index < 1_000; index += 1) {
      await invocationApp.runInvocation(() => index);
    }
  });
  invocationSamplesPerCallMs.push(batchMs / 1_000);
}

const firstGeneration = await generateBunwireArtifacts({ root: exampleRoot });
const generatedPaths = [
  firstGeneration.paths.registry,
  firstGeneration.paths.client,
  firstGeneration.paths.declarations,
];
const firstFiles = await Promise.all(generatedPaths.map(async (filePath) => ({
  filePath,
  bytes: await readFile(filePath),
  mtimeMs: (await stat(filePath)).mtimeMs,
})));
const secondGeneration = await generateBunwireArtifacts({ root: exampleRoot });
if (secondGeneration.changedPaths.length !== 0) {
  throw new Error(`Second artifact generation unexpectedly changed: ${secondGeneration.changedPaths.join(", ")}`);
}
if (firstGeneration.registryHash !== secondGeneration.registryHash
  || firstGeneration.clientHash !== secondGeneration.clientHash) {
  throw new Error("Generated registry/client hashes changed without source changes.");
}
for (const first of firstFiles) {
  const [bytes, metadata] = await Promise.all([readFile(first.filePath), stat(first.filePath)]);
  if (!bytes.equals(first.bytes) || metadata.mtimeMs !== first.mtimeMs) {
    throw new Error(`Unchanged artifact ${first.filePath} experienced byte or timestamp churn.`);
  }
}

const results = {
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    cpuCount: (await import("node:os")).cpus().length,
  },
  ceilings,
  compiler: {
    samplesMs: compilerSamplesMs,
    medianMs: median(compilerSamplesMs),
  },
  startup: {
    samplesMs: startupSamplesMs,
    medianMs: median(startupSamplesMs),
  },
  invocation: {
    samplesPerCallMs: invocationSamplesPerCallMs,
    medianPerCallMs: median(invocationSamplesPerCallMs),
    totalCalls: 5_000,
  },
  generation: {
    registryHash: secondGeneration.registryHash,
    clientHash: secondGeneration.clientHash,
    secondChangedPaths: secondGeneration.changedPaths,
  },
};

console.log(JSON.stringify(results, null, 2));

const failures = [];
if (results.compiler.medianMs > ceilings.compilerMedianMs) failures.push("compiler analysis");
if (results.startup.medianMs > ceilings.startupMedianMs) failures.push("application startup");
if (results.invocation.medianPerCallMs > ceilings.invocationMedianPerCallMs) failures.push("managed invocation");
if (failures.length > 0) {
  throw new Error(`Bunwire performance sanity ceilings exceeded: ${failures.join(", ")}.`);
}
