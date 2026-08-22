import { defineApp } from "@bunwire/core";
import { FixtureAdapter } from "../adapter/fake-adapter.mjs";

function createAdapter(): FixtureAdapter {
  return new FixtureAdapter({});
}

export default defineApp().withAdapter(createAdapter());
