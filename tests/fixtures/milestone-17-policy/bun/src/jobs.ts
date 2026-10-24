import { Job, Schedule } from "@bunwire/bun";
export const deliveries: unknown[][] = [];
let resolveDelivered: () => void;
export const delivered = new Promise<void>((resolve) => { resolveDelivered = resolve; });
@Job({ id: "reports.generate" }) export class Report {
  handle(id: string, payload: { readonly limit: number }): void { deliveries.push([id, payload]); resolveDelivered(); }
}
@Schedule() export class Cleanup { handle(): void {} }
