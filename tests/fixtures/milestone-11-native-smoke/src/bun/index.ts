import app from "./bootstrap.js";
import { applicationRegistry } from "./registry.generated.js";

await app.withRuntimeRegistry(applicationRegistry).start();

console.log("BUNWIRE_NATIVE_SMOKE_STARTED");
