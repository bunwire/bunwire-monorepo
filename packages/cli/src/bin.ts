#!/usr/bin/env node
import { runBunwireCli } from "./index.js";

const shutdown = new AbortController();
const onSignal = (): void => shutdown.abort();
process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);
try {
  process.exitCode = await runBunwireCli(process.argv.slice(2), { signal: shutdown.signal });
} finally {
  process.removeListener("SIGINT", onSignal);
  process.removeListener("SIGTERM", onSignal);
}
