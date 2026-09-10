import { createToken, type Token } from "@bunwire/core";
import type { BunCookieOptions } from "./cookies.js";
import { BunCookieJar } from "./cookies.js";

export type BunSessionValue =
  | null | boolean | number | string
  | readonly BunSessionValue[]
  | { readonly [key: string]: BunSessionValue };

export interface BunSessionStoreRecord {
  readonly data: Readonly<Record<string, BunSessionValue>>;
  readonly flash: readonly string[];
  readonly framework?: Readonly<Record<string, BunSessionValue>>;
  readonly csrfToken?: string;
  readonly expiresAt: number;
}

export interface SessionStore {
  read(id: string): Promise<BunSessionStoreRecord | undefined>;
  write(id: string, record: BunSessionStoreRecord): Promise<void>;
  destroy(id: string): Promise<void>;
}

export interface BunSessionCookieOptions extends BunCookieOptions {
  readonly name?: string;
}

export interface BunSessionOptions {
  readonly secret: string;
  readonly store?: SessionStore;
  readonly lifetimeSeconds?: number;
  readonly cookie?: BunSessionCookieOptions;
}

export class BunSessionError extends Error {
  override readonly name = "BunSessionError";
}

export const BUN_SESSION: Token<Session> = createToken<Session>("bunwire.bun.session");
export const BUN_SESSION_MANAGER: Token<SessionManager> =
  createToken<SessionManager>("bunwire.bun.session-manager");

export function validateBunSessionOptions(options: BunSessionOptions): void {
  if (!options || typeof options !== "object" || Array.isArray(options) || typeof options.secret !== "string"
    || new TextEncoder().encode(options.secret).byteLength < 32) {
    throw new BunSessionError("Bun sessions require a secret containing at least 32 UTF-8 bytes.");
  }
  if (options.lifetimeSeconds !== undefined && (!Number.isInteger(options.lifetimeSeconds) || options.lifetimeSeconds <= 0)) {
    throw new BunSessionError("Session lifetimeSeconds must be a positive integer.");
  }
  if (options.store && (typeof options.store !== "object" || typeof options.store.read !== "function" || typeof options.store.write !== "function" || typeof options.store.destroy !== "function")) {
    throw new BunSessionError("Session stores must implement read, write, and destroy.");
  }
  const cookie = options.cookie;
  if (cookie !== undefined && (!cookie || typeof cookie !== "object" || Array.isArray(cookie))) {
    throw new BunSessionError("Session cookie options must be an object.");
  }
  if (cookie?.name !== undefined && !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(cookie.name)) {
    throw new BunSessionError("Session cookie names must be valid HTTP token values.");
  }
  if (cookie?.sameSite !== undefined && !["strict", "lax", "none"].includes(cookie.sameSite)) {
    throw new BunSessionError("Session cookie sameSite must be strict, lax, or none.");
  }
  if (cookie?.sameSite === "none" && cookie.secure === false) {
    throw new BunSessionError("SameSite=None session cookies must be Secure.");
  }
  for (const key of ["secure", "httpOnly", "partitioned"] as const) {
    if (cookie?.[key] !== undefined && typeof cookie[key] !== "boolean") {
      throw new BunSessionError(`Session cookie ${key} must be a boolean.`);
    }
  }
  for (const key of ["domain", "path"] as const) {
    if (cookie?.[key] !== undefined && typeof cookie[key] !== "string") {
      throw new BunSessionError(`Session cookie ${key} must be a string.`);
    }
  }
  if (cookie?.path !== undefined && cookie.path !== "" && !cookie.path.startsWith("/")) {
    throw new BunSessionError("Session cookie path must be empty or start with '/'.");
  }
  if (cookie?.partitioned && cookie.secure === false) {
    throw new BunSessionError("Partitioned session cookies must be Secure.");
  }
  if (cookie?.maxAge !== undefined || cookie?.expires !== undefined) {
    throw new BunSessionError("Session cookie expiry is controlled by lifetimeSeconds.");
  }
}

function cloneValue<Value>(value: Value): Value {
  return structuredClone(value);
}

function freezeValue(value: BunSessionValue): BunSessionValue {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => freezeValue(item)));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
  }
  return value;
}

function assertValue(value: unknown, ancestors = new Set<object>()): asserts value is BunSessionValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new BunSessionError("Session values must be finite, acyclic serializable values.");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) assertValue(item, ancestors);
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new BunSessionError("Session object values must be plain objects.");
    }
    for (const item of Object.values(value)) assertValue(item, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function freezeRecord(record: BunSessionStoreRecord): BunSessionStoreRecord {
  if (!record || typeof record !== "object" || !Number.isFinite(record.expiresAt)
    || !record.data || typeof record.data !== "object" || Array.isArray(record.data)
    || (record.framework !== undefined && (typeof record.framework !== "object" || record.framework === null || Array.isArray(record.framework)))
    || !Array.isArray(record.flash) || record.flash.some((key) => typeof key !== "string")
    || new Set(record.flash).size !== record.flash.length
    || (record.csrfToken !== undefined && typeof record.csrfToken !== "string")) {
    throw new BunSessionError("Session stores must return valid immutable-compatible records.");
  }
  const data: Record<string, BunSessionValue> = {};
  for (const [key, value] of Object.entries(record.data ?? {})) {
    assertValue(value);
    data[key] = freezeValue(cloneValue(value));
  }
  const framework: Record<string, BunSessionValue> = {};
  for (const [key, value] of Object.entries(record.framework ?? {})) {
    assertValue(value);
    framework[key] = freezeValue(cloneValue(value));
  }
  return Object.freeze({
    data: Object.freeze(data),
    flash: Object.freeze([...record.flash]),
    framework: Object.freeze(framework),
    ...(record.csrfToken === undefined ? {} : { csrfToken: record.csrfToken }),
    expiresAt: record.expiresAt,
  });
}

export class MemorySessionStore implements SessionStore {
  readonly #records = new Map<string, BunSessionStoreRecord>();

  async read(id: string): Promise<BunSessionStoreRecord | undefined> {
    const record = this.#records.get(id);
    if (!record) return undefined;
    if (record.expiresAt <= Date.now()) {
      this.#records.delete(id);
      return undefined;
    }
    return freezeRecord(record);
  }

  async write(id: string, record: BunSessionStoreRecord): Promise<void> {
    this.#records.set(id, freezeRecord(record));
  }

  async destroy(id: string): Promise<void> {
    this.#records.delete(id);
  }
}

interface SessionState {
  id: string;
  originalId: string | undefined;
  data: Map<string, BunSessionValue>;
  incomingFlash: Set<string>;
  outgoingFlash: Set<string>;
  framework: Map<string, BunSessionValue>;
  csrfToken: string | undefined;
  destroyed: boolean;
}

/** @internal Framework-owned session metadata access. */
export const BUN_SESSION_FRAMEWORK_GET: unique symbol = Symbol("bun.session.framework.get");
/** @internal Framework-owned session metadata access. */
export const BUN_SESSION_FRAMEWORK_SET: unique symbol = Symbol("bun.session.framework.set");
/** @internal Framework-owned session metadata access. */
export const BUN_SESSION_FRAMEWORK_DELETE: unique symbol = Symbol("bun.session.framework.delete");

const sessionStates = new WeakMap<Session, SessionState>();

function stateFor(session: Session): SessionState {
  const state = sessionStates.get(session);
  if (!state) throw new BunSessionError("Session was not created by a SessionManager.");
  if (state.destroyed) throw new BunSessionError("Destroyed sessions cannot be read or mutated.");
  return state;
}

export class Session {
  private constructor() {
    throw new BunSessionError("Sessions are created by SessionManager and cannot be constructed directly.");
  }

  get id(): string { return stateFor(this).id; }
  get<Value extends BunSessionValue = BunSessionValue>(key: string): Value | undefined {
    const value = stateFor(this).data.get(key);
    return value === undefined ? undefined : cloneValue(value) as Value;
  }
  has(key: string): boolean { return stateFor(this).data.has(key); }
  put(key: string, value: BunSessionValue): this {
    assertValue(value);
    const state = stateFor(this);
    state.data.set(key, cloneValue(value));
    return this;
  }
  set(key: string, value: BunSessionValue): this { return this.put(key, value); }
  remove(key: string): boolean {
    const state = stateFor(this);
    state.incomingFlash.delete(key);
    state.outgoingFlash.delete(key);
    const removed = state.data.delete(key);
    return removed;
  }
  clear(): this {
    const state = stateFor(this);
    state.data.clear(); state.incomingFlash.clear(); state.outgoingFlash.clear();
    return this;
  }
  regenerate(): this {
    const state = stateFor(this);
    state.originalId ??= state.id;
    state.id = crypto.randomUUID();
    state.csrfToken = undefined;
    return this;
  }
  invalidate(): this {
    const state = stateFor(this);
    this.clear();
    state.framework.clear();
    return this.regenerate();
  }
  destroy(): void {
    const state = stateFor(this);
    state.originalId ??= state.id;
    state.data.clear(); state.framework.clear(); state.destroyed = true;
  }
  flash(key: string, value: BunSessionValue): this {
    this.put(key, value);
    stateFor(this).outgoingFlash.add(key);
    return this;
  }
  consumeFlash<Value extends BunSessionValue = BunSessionValue>(key: string): Value | undefined {
    const value = this.get<Value>(key);
    this.remove(key);
    return value;
  }
  flashInput(input: Readonly<Record<string, BunSessionValue>>): this {
    return this.flash("_old_input", input);
  }
  old<Value extends BunSessionValue = BunSessionValue>(key?: string, fallback?: Value): Value | Readonly<Record<string, BunSessionValue>> | undefined {
    const input = this.get<Readonly<Record<string, BunSessionValue>> & BunSessionValue>("_old_input");
    if (key === undefined) return input ?? fallback;
    return (input && !Array.isArray(input) && typeof input === "object" ? input[key] as Value | undefined : undefined) ?? fallback;
  }

  /** @internal */
  [BUN_SESSION_FRAMEWORK_GET]<Value extends BunSessionValue = BunSessionValue>(key: string): Value | undefined {
    const value = stateFor(this).framework.get(key);
    return value === undefined ? undefined : cloneValue(value) as Value;
  }

  /** @internal */
  [BUN_SESSION_FRAMEWORK_SET](key: string, value: BunSessionValue): void {
    assertValue(value);
    stateFor(this).framework.set(key, cloneValue(value));
  }

  /** @internal */
  [BUN_SESSION_FRAMEWORK_DELETE](key: string): void {
    stateFor(this).framework.delete(key);
  }
}

interface LockTail { tail: Promise<void>; }
export interface BunSessionLease {
  readonly session: Session;
  commit(response: Response): Promise<Response>;
  release(): void;
}

export class SessionManager {
  readonly store: SessionStore;
  readonly cookieName: string;
  readonly #secret: CryptoKey;
  readonly #lifetimeSeconds: number;
  readonly #cookie: BunCookieOptions;
  readonly #locks = new Map<string, LockTail>();

  private constructor(options: BunSessionOptions, secret: CryptoKey) {
    this.store = options.store ?? new MemorySessionStore();
    this.cookieName = options.cookie?.name ?? "bunwire_session";
    this.#secret = secret;
    this.#lifetimeSeconds = options.lifetimeSeconds ?? 7200;
    const { name: _name, ...cookie } = options.cookie ?? {};
    this.#cookie = Object.freeze({ path: "/", secure: true, httpOnly: true, sameSite: "lax", ...cookie });
  }

  static async create(options: BunSessionOptions): Promise<SessionManager> {
    validateBunSessionOptions(options);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    return new SessionManager(options, key);
  }

  async open(cookies: BunCookieJar): Promise<BunSessionLease> {
    const encoded = cookies.get(this.cookieName);
    const verifiedId = encoded ? await this.verify(encoded) : undefined;
    let id = verifiedId ?? crypto.randomUUID();
    const release = await this.acquire(id);
    let normalized: BunSessionStoreRecord | undefined;
    try {
      let record = verifiedId ? await this.store.read(id) : undefined;
      if (record && record.expiresAt <= Date.now()) {
        await this.store.destroy(id);
        record = undefined;
      }
      normalized = record ? freezeRecord(record) : undefined;
    } catch (error) {
      release();
      throw error;
    }
    if (verifiedId && !normalized) id = crypto.randomUUID();
    const state: SessionState = {
      id, originalId: undefined, data: new Map(Object.entries(normalized?.data ?? {})),
      incomingFlash: new Set(normalized?.flash ?? []), outgoingFlash: new Set(),
      framework: new Map(Object.entries(normalized?.framework ?? {})),
      csrfToken: normalized?.csrfToken, destroyed: false,
    };
    const session = Object.create(Session.prototype) as Session;
    sessionStates.set(session, state);
    let settled = false;
    return Object.freeze({
      session,
      commit: async (response: Response): Promise<Response> => {
        if (settled) throw new BunSessionError("A session lease can be committed only once.");
        settled = true;
        try {
          for (const key of state.incomingFlash) if (!state.outgoingFlash.has(key)) state.data.delete(key);
          if (state.destroyed) {
            await this.store.destroy(state.originalId ?? state.id);
            cookies.deleteFrameworkCookie(this.cookieName, this.#cookie);
          } else {
            const expiresAt = Date.now() + this.#lifetimeSeconds * 1000;
            await this.store.write(state.id, freezeRecord({
              data: Object.freeze(Object.fromEntries(state.data)), flash: Object.freeze([...state.outgoingFlash]),
              framework: Object.freeze(Object.fromEntries(state.framework)),
              ...(state.csrfToken ? { csrfToken: state.csrfToken } : {}), expiresAt,
            }));
            if (state.originalId && state.originalId !== state.id) await this.store.destroy(state.originalId);
            cookies.setFrameworkCookie(this.cookieName, await this.sign(state.id), { ...this.#cookie, maxAge: this.#lifetimeSeconds });
          }
          return cookies.apply(response);
        } finally { release(); }
      },
      release: (): void => { if (!settled) { settled = true; release(); } },
    });
  }

  async csrfToken(session: Session): Promise<string> {
    const state = stateFor(session);
    state.csrfToken ??= await this.signCsrfToken(state.id);
    return state.csrfToken;
  }

  async rotateCsrfToken(session: Session): Promise<string> {
    const state = stateFor(session); state.csrfToken = undefined; return this.csrfToken(session);
  }

  async verifyCsrfToken(session: Session, supplied: string): Promise<boolean> {
    const state = stateFor(session);
    const boundary = supplied.lastIndexOf(".");
    if (!state.csrfToken || boundary <= 0 || supplied !== state.csrfToken) return false;
    const nonce = supplied.slice(0, boundary);
    try {
      return await crypto.subtle.verify(
        "HMAC",
        this.#secret,
        Buffer.from(supplied.slice(boundary + 1), "base64url"),
        new TextEncoder().encode(`bunwire.csrf\0${state.id}\0${nonce}`),
      );
    } catch { return false; }
  }

  private async sign(id: string): Promise<string> {
    const signature = await crypto.subtle.sign("HMAC", this.#secret, new TextEncoder().encode(`bunwire.session\0${id}`));
    return `${id}.${Buffer.from(signature).toString("base64url")}`;
  }
  private async signCsrfToken(id: string): Promise<string> {
    const nonce = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const signature = await crypto.subtle.sign("HMAC", this.#secret, new TextEncoder().encode(`bunwire.csrf\0${id}\0${nonce}`));
    return `${nonce}.${Buffer.from(signature).toString("base64url")}`;
  }
  private async verify(value: string): Promise<string | undefined> {
    const boundary = value.lastIndexOf(".");
    if (boundary <= 0) return undefined;
    const id = value.slice(0, boundary);
    try {
      const valid = await crypto.subtle.verify("HMAC", this.#secret, Buffer.from(value.slice(boundary + 1), "base64url"), new TextEncoder().encode(`bunwire.session\0${id}`));
      return valid ? id : undefined;
    } catch { return undefined; }
  }
  private async acquire(id: string): Promise<() => void> {
    const existing = this.#locks.get(id);
    let resolve!: () => void;
    const current = new Promise<void>((done) => { resolve = done; });
    const entry = { tail: current };
    this.#locks.set(id, entry);
    await existing?.tail;
    return () => { resolve(); if (this.#locks.get(id) === entry) this.#locks.delete(id); };
  }
}
