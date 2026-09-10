import type { QueueDriver, QueueDriverContext, QueueEnvelope, QueueReservation } from "@bunwire/bun";

/** Test-only client: the parent test process owns the queue and survives worker death. */
export async function brokerCall<Result>(operation: string, data: unknown = {}): Promise<Result> {
  const origin = process.env.BUNWIRE_TEST_BROKER;
  if (!origin) throw new Error("Missing test broker origin.");
  const response = await fetch(`${origin}/${operation}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(`Test broker ${operation} failed: ${await response.text()}`);
  return await response.json() as Result;
}
export class TestBrokerDriver implements QueueDriver {
  readonly capabilities = Object.freeze({ reservations: true, delay: true, renewal: true });
  async initialize(_context: QueueDriverContext): Promise<void> { await brokerCall("initialize"); }
  async push(envelope: QueueEnvelope): Promise<void> { await brokerCall("push", { envelope }); }
  async reserve(queue: string, duration: number): Promise<QueueReservation | undefined> { return (await brokerCall<QueueReservation | null>("reserve", { queue, duration })) ?? undefined; }
  renew(reservation: QueueReservation, duration: number): Promise<QueueReservation> { return brokerCall("renew", { reservation, duration }); }
  async acknowledge(reservation: QueueReservation): Promise<void> { await brokerCall("ack", { reservation }); }
  async release(reservation: QueueReservation, delay = 0): Promise<void> { await brokerCall("release", { reservation, delay }); }
  async fail(reservation: QueueReservation, _error: unknown): Promise<void> { await brokerCall("fail", { reservation }); }
  async close(): Promise<void> { await brokerCall("close"); }
}
