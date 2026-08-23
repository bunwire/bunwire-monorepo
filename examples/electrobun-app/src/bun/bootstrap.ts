import { defineApp } from "@bunwire/core";
import { ElectrobunAdapter } from "@bunwire/electrobun";

export default defineApp().withAdapter(new ElectrobunAdapter({
  mainWindow: {
    title: "Bunwire Users",
    width: 1200,
    height: 800,
    configure(window): void {
      window.setTitle("Bunwire Users");
    },
  },
  rpc: {
    configure(rpc): void {
      void rpc.proxy;
    },
  },
}));
