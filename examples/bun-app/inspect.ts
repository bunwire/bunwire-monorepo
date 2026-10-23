import { runBunCli } from "@bunwire/bun";
import registry from "./.bunwire/registry.js";

// Reuse the HTTP application's bootstrap and registry in the command role.
process.env.BUNWIRE_EXAMPLE_ROLE = "command";
const { default: app } = await import("./src/bootstrap.js");
process.exitCode = await runBunCli(app, registry);
