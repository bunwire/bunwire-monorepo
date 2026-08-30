import applicationRegistry from "../.bunwire/registry.js";
import app from "./bootstrap.js";

await app.withRuntimeRegistry(applicationRegistry).start();
