import { createToken, type Token } from "@bunwire/core";
import * as oauth from "oauth4webapi";
import type { AuthManager, BunAuthContext } from "./auth.js";
import { BunHttpException } from "./exceptions.js";
import type { BunHttpContext } from "./http.js";
import { redirect, type BunRedirectResult } from "./response.js";
import {
  BUN_SESSION_FRAMEWORK_GET,
  BUN_SESSION_FRAMEWORK_SET,
  type BunSessionValue,
  type Session,
} from "./sessions.js";

export type BunOAuthTokenEndpointAuthMethod = "client-secret-basic" | "client-secret-post" | "none";

export interface BunOAuthTokenSet {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresIn?: number;
  readonly refreshToken?: string;
  readonly scope?: string;
}

export interface BunOAuthAuthorizationInput<Principal = unknown> {
  readonly state: string;
  readonly codeChallenge: string;
  readonly http: BunHttpContext<Principal>;
}

export interface BunOAuthCallbackInput<Principal = unknown> {
  readonly callbackUrl: URL;
  readonly expectedState: string;
  readonly codeVerifier: string;
  readonly http: BunHttpContext<Principal>;
}

export interface BunOAuthProvider<Identity = unknown, Principal = unknown> {
  readonly name: string;
  authorizationUrl(input: BunOAuthAuthorizationInput<Principal>): URL | Promise<URL>;
  callback(input: BunOAuthCallbackInput<Principal>): Identity | Promise<Identity>;
}

export interface BunOAuth2ProviderOptions<Identity, Principal = unknown> {
  readonly name: string;
  readonly issuer: string | URL;
  readonly authorizationEndpoint: string | URL;
  readonly tokenEndpoint: string | URL;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly redirectUri: string | URL;
  readonly scopes?: readonly string[];
  readonly tokenEndpointAuthMethod?: BunOAuthTokenEndpointAuthMethod;
  readonly fetch?: typeof globalThis.fetch;
  readonly resolveIdentity: (
    tokens: BunOAuthTokenSet,
    context: BunOAuthCallbackInput<Principal>,
  ) => Identity | Promise<Identity>;
}

export interface BunOAuthIdentityMappingContext<Principal = unknown, Identity = unknown> {
  readonly provider: string;
  readonly identity: Identity;
  readonly http: BunHttpContext<Principal>;
}

export interface BunOAuthOptions<Principal = unknown> {
  readonly providers: readonly BunOAuthProvider<any, Principal>[];
  readonly mapIdentity: (context: BunOAuthIdentityMappingContext<Principal>) => Principal | Promise<Principal>;
  readonly loginGuard?: string;
  readonly stateLifetimeSeconds?: number;
}

export interface BunOAuthCallbackResult<Principal = unknown, Identity = unknown> {
  readonly provider: string;
  readonly identity: Identity;
  readonly principal: Principal;
}

export class BunOAuthError extends Error {
  override readonly name = "BunOAuthError";
}

export class BunOAuthCallbackException extends BunHttpException {
  override readonly name = "BunOAuthCallbackException";
  constructor(message = "Invalid OAuth callback") { super(400, message); }
}

export class BunOAuthProviderException extends BunHttpException {
  override readonly name = "BunOAuthProviderException";
  constructor(message = "OAuth provider request failed") { super(502, message); }
}

export const BUN_OAUTH_MANAGER: Token<OAuthManager<unknown>> =
  createToken<OAuthManager<unknown>>("bunwire.bun.oauth-manager");
export const BUN_OAUTH_CONTEXT: Token<BunOAuthContext<unknown>> =
  createToken<BunOAuthContext<unknown>>("bunwire.bun.oauth-context");

const OAUTH_FLOWS_KEY = "oauth:flows";
const MAX_OAUTH_FLOWS = 8;

interface StoredOAuthFlow extends Record<string, BunSessionValue> {
  readonly provider: string;
  readonly state: string;
  readonly verifier: string;
  readonly expiresAt: number;
}

function assertName(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) {
    throw new BunOAuthError(`${label} must be a non-empty identifier containing letters, numbers, '_' or '-'.`);
  }
}

function url(value: string | URL, label: string): URL {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    return parsed;
  } catch {
    throw new BunOAuthError(`${label} must be an absolute HTTP(S) URL.`);
  }
}

export function validateBunOAuthOptions<Principal>(options: BunOAuthOptions<Principal>): void {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new BunOAuthError("OAuth options must be an object.");
  if (!Array.isArray(options.providers) || options.providers.length === 0) throw new BunOAuthError("OAuth requires at least one provider.");
  if (typeof options.mapIdentity !== "function") throw new BunOAuthError("OAuth mapIdentity must be callable.");
  if (options.loginGuard !== undefined) assertName(options.loginGuard, "OAuth loginGuard");
  if (options.stateLifetimeSeconds !== undefined
    && (!Number.isInteger(options.stateLifetimeSeconds) || options.stateLifetimeSeconds <= 0)) {
    throw new BunOAuthError("OAuth stateLifetimeSeconds must be a positive integer.");
  }
  const names = new Set<string>();
  for (const provider of options.providers) {
    if (!provider || typeof provider !== "object") throw new BunOAuthError("OAuth providers must be objects.");
    assertName(provider.name, "OAuth provider name");
    if (names.has(provider.name)) throw new BunOAuthError(`OAuth provider ${JSON.stringify(provider.name)} is registered more than once.`);
    names.add(provider.name);
    if (typeof provider.authorizationUrl !== "function" || typeof provider.callback !== "function") {
      throw new BunOAuthError(`OAuth provider ${JSON.stringify(provider.name)} must define authorizationUrl() and callback().`);
    }
  }
}

function normalizeTokens(tokens: oauth.TokenEndpointResponse): BunOAuthTokenSet {
  return Object.freeze({
    accessToken: tokens.access_token,
    tokenType: tokens.token_type,
    ...(tokens.expires_in === undefined ? {} : { expiresIn: tokens.expires_in }),
    ...(tokens.refresh_token === undefined ? {} : { refreshToken: tokens.refresh_token }),
    ...(tokens.scope === undefined ? {} : { scope: tokens.scope }),
  });
}

export function createOAuth2Provider<Identity, Principal = unknown>(
  options: BunOAuth2ProviderOptions<Identity, Principal>,
): BunOAuthProvider<Identity, Principal> {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new BunOAuthError("OAuth2 provider options must be an object.");
  assertName(options.name, "OAuth2 provider name");
  if (typeof options.clientId !== "string" || options.clientId.length === 0) throw new BunOAuthError("OAuth2 clientId must be non-empty.");
  if (options.clientSecret !== undefined && (typeof options.clientSecret !== "string" || options.clientSecret.length === 0)) {
    throw new BunOAuthError("OAuth2 clientSecret must be non-empty when supplied.");
  }
  if (typeof options.resolveIdentity !== "function") throw new BunOAuthError("OAuth2 resolveIdentity must be callable.");
  if (options.fetch !== undefined && typeof options.fetch !== "function") throw new BunOAuthError("OAuth2 fetch must be callable.");
  const issuer = url(options.issuer, "OAuth2 issuer");
  const authorizationEndpoint = url(options.authorizationEndpoint, "OAuth2 authorizationEndpoint");
  const tokenEndpoint = url(options.tokenEndpoint, "OAuth2 tokenEndpoint");
  const redirectUri = url(options.redirectUri, "OAuth2 redirectUri");
  const scopes = Object.freeze([...(options.scopes ?? [])]);
  if (scopes.some((scope) => typeof scope !== "string" || scope.trim().length === 0)) throw new BunOAuthError("OAuth2 scopes must be non-empty strings.");
  const authMethod = options.tokenEndpointAuthMethod ?? (options.clientSecret ? "client-secret-basic" : "none");
  if (!["client-secret-basic", "client-secret-post", "none"].includes(authMethod)) throw new BunOAuthError("OAuth2 tokenEndpointAuthMethod is unsupported.");
  if (authMethod !== "none" && !options.clientSecret) throw new BunOAuthError(`OAuth2 ${authMethod} requires clientSecret.`);
  const server: oauth.AuthorizationServer = Object.freeze({
    issuer: issuer.toString(),
    authorization_endpoint: authorizationEndpoint.toString(),
    token_endpoint: tokenEndpoint.toString(),
  });
  const client: oauth.Client = Object.freeze({ client_id: options.clientId });
  const clientAuth = authMethod === "client-secret-basic"
    ? oauth.ClientSecretBasic(options.clientSecret!)
    : authMethod === "client-secret-post"
      ? oauth.ClientSecretPost(options.clientSecret!)
      : oauth.None();
  const requestOptions = options.fetch
    ? { [oauth.customFetch]: options.fetch }
    : undefined;
  return Object.freeze({
    name: options.name,
    authorizationUrl(input: BunOAuthAuthorizationInput<Principal>): URL {
      const result = new URL(authorizationEndpoint);
      result.searchParams.set("client_id", options.clientId);
      result.searchParams.set("redirect_uri", redirectUri.toString());
      result.searchParams.set("response_type", "code");
      if (scopes.length > 0) result.searchParams.set("scope", scopes.join(" "));
      result.searchParams.set("state", input.state);
      result.searchParams.set("code_challenge", input.codeChallenge);
      result.searchParams.set("code_challenge_method", "S256");
      return result;
    },
    async callback(input: BunOAuthCallbackInput<Principal>): Promise<Identity> {
      let parameters: URLSearchParams;
      try {
        parameters = oauth.validateAuthResponse(server, client, input.callbackUrl, input.expectedState);
      } catch {
        throw new BunOAuthCallbackException();
      }
      try {
        const response = await oauth.authorizationCodeGrantRequest(
          server,
          client,
          clientAuth,
          parameters,
          redirectUri.toString(),
          input.codeVerifier,
          requestOptions,
        );
        const tokens = await oauth.processAuthorizationCodeResponse(server, client, response);
        return await options.resolveIdentity(normalizeTokens(tokens), input);
      } catch (error) {
        if (error instanceof BunHttpException) throw error;
        throw new BunOAuthProviderException();
      }
    },
  });
}

export class OAuthManager<Principal = unknown> {
  readonly providers: ReadonlyMap<string, BunOAuthProvider<any, Principal>>;
  readonly loginGuard: string;
  readonly #mapIdentity: BunOAuthOptions<Principal>["mapIdentity"];
  readonly #stateLifetimeMs: number;
  readonly #authManager: AuthManager<Principal>;

  constructor(options: BunOAuthOptions<Principal>, authManager: AuthManager<Principal>) {
    validateBunOAuthOptions(options);
    this.#authManager = authManager;
    this.loginGuard = options.loginGuard ?? authManager.defaultGuard;
    const guard = authManager.guard(this.loginGuard);
    if (!guard.login || !guard.requiresSession) {
      throw new BunOAuthError(`OAuth login guard ${JSON.stringify(this.loginGuard)} must be a session-backed guard supporting login().`);
    }
    this.providers = new Map(options.providers.map((provider) => [provider.name, provider]));
    this.#mapIdentity = options.mapIdentity;
    this.#stateLifetimeMs = (options.stateLifetimeSeconds ?? 600) * 1000;
  }

  provider(name: string): BunOAuthProvider<any, Principal> {
    const provider = this.providers.get(name);
    if (!provider) throw new BunOAuthError(`OAuth provider ${JSON.stringify(name)} is not registered.`);
    return provider;
  }

  createContext(
    http: () => BunHttpContext<Principal>,
    auth: BunAuthContext<Principal>,
    session: Session,
  ): BunOAuthContext<Principal> {
    return new BunOAuthContext(this, http, auth, session);
  }

  /** @internal */
  async mapIdentity<Identity>(provider: string, identity: Identity, http: BunHttpContext<Principal>): Promise<Principal> {
    return this.#mapIdentity(Object.freeze({ provider, identity, http }));
  }

  /** @internal */
  get stateLifetimeMs(): number { return this.#stateLifetimeMs; }
}

export class BunOAuthContext<Principal = unknown> {
  readonly #manager: OAuthManager<Principal>;
  readonly #http: () => BunHttpContext<Principal>;
  readonly #auth: BunAuthContext<Principal>;
  readonly #session: Session;

  /** @internal */
  constructor(
    manager: OAuthManager<Principal>,
    http: () => BunHttpContext<Principal>,
    auth: BunAuthContext<Principal>,
    session: Session,
  ) {
    this.#manager = manager;
    this.#http = http;
    this.#auth = auth;
    this.#session = session;
    Object.freeze(this);
  }

  async redirect(providerName: string): Promise<BunRedirectResult> {
    const provider = this.#manager.provider(providerName);
    const state = oauth.generateRandomState();
    const verifier = oauth.generateRandomCodeVerifier();
    const codeChallenge = await oauth.calculatePKCECodeChallenge(verifier);
    const now = Date.now();
    const flows = this.flows().filter((flow) => flow.expiresAt > now);
    flows.push(Object.freeze({
      provider: provider.name,
      state,
      verifier,
      expiresAt: now + this.#manager.stateLifetimeMs,
    }));
    this.#session[BUN_SESSION_FRAMEWORK_SET](OAUTH_FLOWS_KEY, flows.slice(-MAX_OAUTH_FLOWS));
    const target = await provider.authorizationUrl(Object.freeze({ state, codeChallenge, http: this.#http() }));
    if (!(target instanceof URL)) throw new BunOAuthError(`OAuth provider ${JSON.stringify(provider.name)} returned a non-URL authorization target.`);
    return redirect(target.toString());
  }

  async callback<Identity = unknown>(providerName: string): Promise<BunOAuthCallbackResult<Principal, Identity>> {
    const provider = this.#manager.provider(providerName);
    const callbackUrl = new URL(this.#http().request.url);
    const suppliedState = callbackUrl.searchParams.get("state");
    const now = Date.now();
    const flows = this.flows();
    const index = suppliedState === null ? -1 : flows.findIndex((flow) => (
      flow.provider === provider.name && flow.state === suppliedState && flow.expiresAt > now
    ));
    if (index < 0) {
      this.#session[BUN_SESSION_FRAMEWORK_SET](OAUTH_FLOWS_KEY, flows.filter((flow) => flow.expiresAt > now));
      throw new BunOAuthCallbackException();
    }
    const flow = flows[index]!;
    this.#session[BUN_SESSION_FRAMEWORK_SET](OAUTH_FLOWS_KEY, flows.filter((_, flowIndex) => flowIndex !== index && flows[flowIndex]!.expiresAt > now));
    const identity = await provider.callback(Object.freeze({
      callbackUrl,
      expectedState: flow.state,
      codeVerifier: flow.verifier,
      http: this.#http(),
    })) as Identity;
    const principal = await this.#manager.mapIdentity(provider.name, identity, this.#http());
    await this.#auth.login(principal, this.#manager.loginGuard);
    return Object.freeze({ provider: provider.name, identity, principal });
  }

  private flows(): StoredOAuthFlow[] {
    const stored = this.#session[BUN_SESSION_FRAMEWORK_GET]<readonly BunSessionValue[]>(OAUTH_FLOWS_KEY);
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const candidate = value as Record<string, BunSessionValue>;
      return typeof candidate.provider === "string"
        && typeof candidate.state === "string"
        && typeof candidate.verifier === "string"
        && typeof candidate.expiresAt === "number"
        ? [candidate as StoredOAuthFlow]
        : [];
    });
  }
}
