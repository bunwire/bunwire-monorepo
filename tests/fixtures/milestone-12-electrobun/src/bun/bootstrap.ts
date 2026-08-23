import { defineApp } from "@bunwire/core";
import { ElectrobunAdapter } from "@bunwire/electrobun";

export const nativeCallbacks: { window?: object; rpc?: object } = {};

export default defineApp().withAdapter(new ElectrobunAdapter({
  mainWindow: {
    title: "Milestone 12",
    width: 1024,
    height: 720,
    hidden: true,
    configure(window): void {
      nativeCallbacks.window = window;
    },
  },
  rpc: {
    configure(rpc): void {
      nativeCallbacks.rpc = rpc;
    },
  },
}));
