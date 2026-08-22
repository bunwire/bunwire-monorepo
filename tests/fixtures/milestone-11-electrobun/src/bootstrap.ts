import { defineApp } from "@bunwire/core";
import { ElectrobunAdapter } from "@bunwire/electrobun";

export default defineApp().withAdapter(new ElectrobunAdapter({
  mainWindow: { title: "Compiler Fixture", width: 900, height: 600 },
}));
