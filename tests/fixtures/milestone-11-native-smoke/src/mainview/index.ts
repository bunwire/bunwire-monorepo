import { Electroview, type RPCSchema } from "electrobun/view";

type SmokeSchema = {
  bun: RPCSchema<{
    requests: {
      "smoke/request": {
        params: { args: readonly unknown[] };
        response: string;
      };
    };
    messages: {
      "smoke/message": { args: readonly unknown[] };
    };
  }>;
  webview: RPCSchema<{ requests: {}; messages: {} }>;
};

const rpc = Electroview.defineRPC<SmokeSchema>({
  maxRequestTime: 2_000,
  handlers: { requests: {}, messages: {} },
});
new Electroview({ rpc });

async function run(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const result = await rpc.request["smoke/request"]({ args: [["native", "sdk"]] });
      if (result !== "native|sdk") throw new Error(`Unexpected Bunwire response: ${result}`);
      rpc.send["smoke/message"]({ args: ["verified"] });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

void run();
