# `@bunwire/electrobun` 0.1.0

Bunwire's Electrobun adapter owns the normal native RPC and main-window bootstrap:

```ts
import { defineApp } from "@bunwire/core";
import { ElectrobunAdapter } from "@bunwire/electrobun";

export default defineApp().withAdapter(new ElectrobunAdapter({
  mainWindow: {
    title: "My App",
    width: 1200,
    height: 800,
    configure(window) {
      // The actual Electrobun BrowserWindow created by the adapter.
    },
  },
  rpc: {
    configure(rpc) {
      // The actual Electrobun RPC object attached to the main webview.
    },
  },
}));
```

The host entrypoint imports that Application and the generated registry, then starts once:

```ts
import registry from "virtual:bunwire/registry";
import app from "./bootstrap";

await app.withRuntimeRegistry(registry).start();
```

When neither `url` nor `html` is configured, the main view uses the conventional
`views://mainview/index.html` Electrobun scaffold URL.

For an existing native host, use the explicit manual path. The window must already own a webview with an attached Electrobun RPC object:

```ts
import { defineApp } from "@bunwire/core";
import {
  ManualElectrobunAdapter,
  defineElectrobunContext,
} from "@bunwire/electrobun";
import registry from "virtual:bunwire/registry";

const context = defineElectrobunContext(existingWindow);

await defineApp()
  .withAdapter(new ManualElectrobunAdapter({
    // Electrobun has one mutable request handler and no handler getter.
    // Re-supply the existing handler to preserve non-Bunwire requests.
    fallbackRequestHandler: existingRequestHandler,
  }))
  .withRuntimeRegistry(registry)
  .withContext(context)
  .start();
```

`@Route()` handlers are Electrobun requests and return results. `@Message()` handlers are fire-and-forget messages. Application callers use the generated positional API:

```ts
import { Electroview } from "electrobun/view";
import {
  createBunwireClient,
  type BunwireClientSchema,
} from "virtual:bunwire/client";

const rpc = Electroview.defineRPC<BunwireClientSchema>({
  handlers: { requests: {}, messages: {} },
});
const { request, message } = createBunwireClient(rpc);

const user = await request("users/get", id, includePosts);
message("users/deleted", id);
```

The adapter privately encodes those logical arguments into Electrobun's single native payload and decodes them before Controller invocation. `ElectrobunClientSchema` integrates the generated logical contracts with Electrobun without requiring callers to declare or construct that wire encoding.

`@Window()`, `@Webview()`, and `@Context()` are framework-supplied parameters and are excluded from caller arguments. Bunwire endpoints take precedence over the manual fallback; unknown requests delegate their original method and payload unchanged. Native message listeners and outgoing `rpc.send()` and `rpc.request()` remain available on the unchanged RPC object.

## Managed middleware

Compiler-normalized `@Middleware()` attachments execute around Electrobun requests and messages. Electrobun supplies an immutable `ElectrobunMiddlewareContext` containing the normalized endpoint, `request` or `message` transport, the exact native window/webview/RPC objects, frozen logical arguments, and the current attachment's frozen string parameters.

```ts
import { Middleware } from "@bunwire/core";
import type { ElectrobunMiddlewareContext } from "@bunwire/electrobun";

@Middleware()
export class AuditMiddleware {
  protected alias = "audit";
  protected include = ["admin/**"];
  protected exclude = ["admin/public/**"];
  protected only = ["request"];

  async handle(context: ElectrobunMiddlewareContext, next: () => Promise<unknown>) {
    return next();
  }
}
```

Endpoint filters are adapter-owned and case-sensitive. Leading, trailing, and repeated `/` separators are normalized. `*` matches within one segment; `**` is valid only as a complete segment and matches zero or more segments. When `include` is present, at least one pattern must match; any matching `exclude` wins. `only` and `except` accept only `request` and `message`, and are validated before Providers or traffic begin.

Middleware can transform or short-circuit request results. Message results are discarded; message failures use `rpc.onMessageError` when configured and otherwise use the adapter's fallback error logging. Filtered-out middleware is not constructed. Both normal and manual adapters consume the same generated, already-normalized policy and retain native RPC behavior.
