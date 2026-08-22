import { defineApp } from "@bunwire/core";
import { MissingCompilerAdapter } from "../adapter/fake-adapter.mjs";

export default defineApp().withAdapter(new MissingCompilerAdapter());
