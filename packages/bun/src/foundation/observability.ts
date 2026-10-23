export type BunOperationKind = "http" | "job" | "listener" | "schedule" | "command" | "websocket-upgrade" | "websocket-connection" | "websocket-message";
export type BunOperationPhase = "start" | "end";

/** Identifiers and timing only; application payloads and credentials are never copied. */
export interface BunOperationRecord {
  readonly kind: BunOperationKind;
  readonly phase: BunOperationPhase;
  readonly id: string;
  readonly at: number;
  readonly durationMs?: number;
  readonly outcome?: "ok" | "error";
  readonly requestId?: string;
  readonly route?: string;
  readonly method?: string;
  readonly status?: number;
  readonly jobId?: string;
  readonly job?: string;
  readonly attempt?: number;
  readonly queue?: string;
  readonly event?: string;
  readonly listener?: string;
  readonly scheduledTask?: string;
  readonly command?: string;
  readonly connectionId?: number;
  readonly messageId?: number;
}

export type BunObservationHook = (record: BunOperationRecord) => void;
export type BunOperationMetadata = Omit<BunOperationRecord, "phase" | "at" | "durationMs" | "outcome" | "status">;

export class BunOperationObserver {
  readonly #hook: BunObservationHook | undefined;
  constructor(hook?: BunObservationHook) { this.#hook = hook; }
  get enabled(): boolean { return this.#hook !== undefined; }
  emit(record: BunOperationRecord): void {
    if (!this.#hook) return;
    try { this.#hook(Object.freeze(record)); }
    catch (error) { console.error("Bunwire observation hook failed.", error); }
  }
  async run<Result>(metadata: BunOperationMetadata, operation: () => Result | Promise<Result>, status?: (result: Result) => number): Promise<Result> {
    if (!this.#hook) return operation();
    const started = performance.now();
    this.emit({ ...metadata, phase: "start", at: Date.now() });
    try {
      const result = await operation();
      const responseStatus = status?.(result);
      this.emit({ ...metadata, phase: "end", at: Date.now(), durationMs: performance.now() - started,
        outcome: responseStatus !== undefined && responseStatus >= 500 ? "error" : "ok",
        ...(responseStatus === undefined ? {} : { status: responseStatus }) });
      return result;
    } catch (error) {
      this.emit({ ...metadata, phase: "end", at: Date.now(), durationMs: performance.now() - started, outcome: "error" });
      throw error;
    }
  }
}
