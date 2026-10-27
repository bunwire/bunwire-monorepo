#!/usr/bin/env node
import { runBunwireCli } from "./index.js";

process.exitCode = await runBunwireCli(process.argv.slice(2));
