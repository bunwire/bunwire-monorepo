import { defineApp } from "@bunwire/core";
import { FixtureAdapter as HostAdapter } from "../../adapter/fake-adapter.mjs";

export default defineApp().withAdapter(
  new HostAdapter({
    configure(nativeHost: unknown) {
      throw new Error(`Runtime native callback must not execute during discovery: ${String(nativeHost)}`);
    },
  }),
);
