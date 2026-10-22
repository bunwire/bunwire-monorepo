import { defineApp } from "@bunwire/core";
import { Argument, BunAdapter, Command, Flag, Option } from "@bunwire/bun";

@Command({ name: "reports:build", description: "Build a report.", examples: ["bunwire reports:build staff --format csv"] })
export class BuildReport {
  handle(
    @Argument({ name: "team", description: "Team name.", choices: ["staff", "guests"] }) _team: string,
    @Option({ name: "format", alias: "f", choices: ["csv", "json"], default: "json" }) _format: string,
    @Flag({ name: "verbose", alias: "v" }) _verbose: boolean,
  ): void {}
}

export default defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false }));
