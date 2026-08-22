import { defineApp } from "@bunwire/core";
import {
  FixtureAdapter,
  MissingCompilerAdapter,
} from "../adapter/fake-adapter.mjs";

function unusedApplication(): unknown {
  return defineApp().withAdapter(new MissingCompilerAdapter());
}

if (false) {
  defineApp().withAdapter(new MissingCompilerAdapter());
}

void unusedApplication;

export default defineApp()
  .withContext({ source: "fixture" })
  .withAdapter(new FixtureAdapter())
  .withRuntimeRegistry({ classes: [], methods: [] });
