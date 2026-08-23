# `@bunwire/electrobun`

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

The host entrypoint imports that Application and calls `await app.start()`.
When neither `url` nor `html` is configured, the main view uses the conventional
`views://mainview/index.html` Electrobun scaffold URL.

For an existing native host, use the explicit manual path. The window must already own a webview with an attached Electrobun RPC object:

```ts
import { defineApp } from "@bunwire/core";
import {
  ManualElectrobunAdapter,
  defineElectrobunContext,
} from "@bunwire/electrobun";

const context = defineElectrobunContext(existingWindow);

await defineApp()
  .withAdapter(new ManualElectrobunAdapter({
    // Electrobun has one mutable request handler and no handler getter.
    // Re-supply the existing handler to preserve non-Bunwire requests.
    fallbackRequestHandler: existingRequestHandler,
  }))
  .withContext(context)
  .start();
```

`@Route()` handlers are Electrobun requests and return results. `@Message()` handlers are fire-and-forget messages. Application callers use Bunwire's positional caller API; Milestone 12 supplies the generated client for that API. The adapter privately encodes those logical arguments into Electrobun's single native payload and decodes them before Controller invocation. That wire encoding is an adapter implementation detail, not a caller-facing Bunwire contract.

`@Window()`, `@Webview()`, and `@Context()` are framework-supplied parameters and are excluded from caller arguments. Bunwire endpoints take precedence over the manual fallback; unknown requests delegate their original method and payload unchanged. Native message listeners and outgoing `rpc.send()` and `rpc.request()` remain available on the unchanged RPC object.
