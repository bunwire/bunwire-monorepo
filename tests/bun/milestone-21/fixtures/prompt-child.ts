import { defineApp, defineManagedMethodPlan, defineRuntimeRegistry, getManagedClassMetadata } from "@bunwire/core";
import { BUN_COMMAND_CONTEXT, BUN_COMMAND_HANDLE_KIND, BUN_COMMAND_KIND, BunAdapter, Command, runBunCli, type BunCommandContext } from "@bunwire/bun";

@Command("ask")
class Ask {
  constructor(private readonly context: BunCommandContext) {}
  async handle(): Promise<void> {
    const value = await this.context.io.prompt({ message: "Name?",
      ...(process.env.BUNWIRE_PROMPT_FALLBACK ? { nonInteractiveValue: process.env.BUNWIRE_PROMPT_FALLBACK } : {}) });
    await this.context.io.status("success", value);
  }
}

const registry = defineRuntimeRegistry({
  classes: [{ target: Ask, kind: BUN_COMMAND_KIND, scope: "transient", data: getManagedClassMetadata(Ask)!.data,
    dependencies: [{ index: 0, token: BUN_COMMAND_CONTEXT }] }],
  methods: [defineManagedMethodPlan({ target: Ask, kind: BUN_COMMAND_HANDLE_KIND, ownerKind: BUN_COMMAND_KIND,
    method: "handle", data: undefined, parameters: [] })],
});
const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false }));
process.exitCode = await runBunCli(app, registry, { argv: ["ask"] });
