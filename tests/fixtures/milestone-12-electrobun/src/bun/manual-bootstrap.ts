import { defineApp } from "@bunwire/core";
import { ManualElectrobunAdapter } from "@bunwire/electrobun";

export default defineApp().withAdapter(new ManualElectrobunAdapter());
