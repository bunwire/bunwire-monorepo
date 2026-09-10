import { createBunwireReactApp } from "@bunwire/bun/react";
import type { BunReactPageComponent } from "@bunwire/bun/react";
import resolvePage from "virtual:bunwire/pages";

await createBunwireReactApp({
  resolvePage: (name) => resolvePage<BunReactPageComponent>(name),
});
