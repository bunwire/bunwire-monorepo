import {
  CONTROLLER_KIND,
  Controller,
  defineApp,
  defineManagedMethodPlan,
  defineRuntimeRegistry,
} from "@bunwire/core";
import {
  ELECTROBUN_MESSAGE_KIND,
  ELECTROBUN_ROUTE_KIND,
  ElectrobunAdapter,
  Message,
  Route,
} from "@bunwire/electrobun";
import { Utils } from "electrobun/bun";

class SmokeController {
  request(values: string[]): string {
    const result = values.join("|");
    console.log(`BUNWIRE_NATIVE_SMOKE_REQUEST:${result}`);
    return result;
  }

  message(value: string): void {
    console.log(`BUNWIRE_NATIVE_SMOKE_COMPLETE:${value}`);
    setTimeout(() => Utils.quit(), 50);
  }
}

Controller("smoke")(SmokeController);
Route("request")(
  SmokeController.prototype,
  "request",
  Object.getOwnPropertyDescriptor(SmokeController.prototype, "request")!,
);
Message("message")(
  SmokeController.prototype,
  "message",
  Object.getOwnPropertyDescriptor(SmokeController.prototype, "message")!,
);

const registry = defineRuntimeRegistry({
  classes: [{
    kind: CONTROLLER_KIND,
    target: SmokeController,
    data: { prefix: "smoke" },
  }],
  methods: [
    defineManagedMethodPlan({
      kind: ELECTROBUN_ROUTE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: SmokeController,
      method: "request",
      data: { path: "request" },
      parameters: [
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
      ],
    }),
    defineManagedMethodPlan({
      kind: ELECTROBUN_MESSAGE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: SmokeController,
      method: "message",
      data: { path: "message" },
      parameters: [
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
      ],
    }),
  ],
});

await defineApp()
  .withAdapter(new ElectrobunAdapter({
    mainWindow: {
      title: "Bunwire Milestone 11 Native Smoke",
      width: 480,
      height: 320,
    },
  }))
  .withRuntimeRegistry(registry)
  .start();

console.log("BUNWIRE_NATIVE_SMOKE_STARTED");
