import { runBunCli } from "@bunwire/bun";
import app from "./src/bootstrap.js";
import registry from "./.bunwire/registry.js";

process.exitCode = await runBunCli(app, registry);
