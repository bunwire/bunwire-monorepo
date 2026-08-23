import { createElectrobunClient, type ElectrobunClientSchema } from "@bunwire/electrobun";
import { Electroview } from "electrobun/view";

interface SmokeRequests {
  "smoke/request": (values: string[]) => string;
}

interface SmokeMessages {
  "smoke/message": (status: string) => void;
}

type SmokeSchema = ElectrobunClientSchema<SmokeRequests, SmokeMessages>;

const rpc = Electroview.defineRPC<SmokeSchema>({
  maxRequestTime: 2_000,
  handlers: { requests: {}, messages: {} },
});
new Electroview({ rpc });
const client = createElectrobunClient(rpc);

async function run(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const result = await client.request("smoke/request", ["native", "sdk"]);
      if (result !== "native|sdk") throw new Error(`Unexpected Bunwire response: ${result}`);
      client.message("smoke/message", "verified");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

void run();
