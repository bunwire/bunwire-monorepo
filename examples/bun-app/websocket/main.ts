import registry from "./.bunwire/registry.js";
import app from "./src/bootstrap.js";

await app.withRuntimeRegistry(registry).start();
