import { defineApp, Inject, Service } from "@bunwire/core";
import { Argument, BunAdapter, Command, Flag, Option } from "@bunwire/bun";

@Service()
export class UsersService {}

@Command({ name: "users:cleanup", description: "Remove inactive users." })
export class CleanupUsers {
  constructor(@Inject(UsersService) readonly users: UsersService) {}
  handle(
    @Argument({ name: "team", choices: ["staff", "guests"] }) _team: string,
    @Option({ name: "days", alias: "d", type: "integer", default: 30 }) _days: number,
    @Flag({ name: "force", alias: "f" }) _force: boolean,
  ): number { return 0; }
}

export default defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false }));
