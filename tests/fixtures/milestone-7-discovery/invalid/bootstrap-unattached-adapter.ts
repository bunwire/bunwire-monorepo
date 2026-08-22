import { defineApp } from "@bunwire/core";
import { FixtureAdapter } from "../adapter/fake-adapter.mjs";

function unusedApplication(): unknown {
  return defineApp().withAdapter(new FixtureAdapter());
}

void unusedApplication;

export default defineApp();
