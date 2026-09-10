import {
  defineParameterResolver,
  createToken,
  getManagedClassMetadata,
  type Constructable,
  type ManagedClassRegistryEntry,
  type ManagedMethodPlan,
  type ParameterResolutionRequest,
  type RuntimeRegistry,
} from "@bunwire/core";
import type { ValidationErrorsLike } from "@bunwire/validation";
import { BunAuthorizationException, BunHttpException, BunValidationException } from "./exceptions.js";
import { BUN_HTTP_CONTEXT, type BunHttpContext } from "./http.js";
import {
  BUN_FORM_REQUEST_RESOLVER_ID,
  BUN_FORM_REQUEST_INITIALIZE,
  BUN_REQUEST_KIND,
  FormRequest,
  Request,
  type BunFormRequestFileInput,
  type BunFormRequestInput,
  type BunFormRequestQueryInput,
  type BunFormRequestRouteInput,
  type BunFormRequestSources,
} from "./request.js";

interface CollectedFormRequestInput {
  readonly sources: BunFormRequestSources;
  readonly merged: BunFormRequestInput;
}

export interface BunFormRequestRuntimeState {
  readonly entries: Map<Constructable<object>, ManagedClassRegistryEntry>;
  readonly instances: WeakMap<object, Map<Constructable<object>, Promise<FormRequest>>>;
}

export function createBunFormRequestRuntimeState(): BunFormRequestRuntimeState {
  return { entries: new Map(), instances: new WeakMap() };
}

function freezeRecord(input: Record<string, unknown>): BunFormRequestInput {
  return Object.freeze(Object.fromEntries(Object.entries(input).map(([key, value]) => [
    key,
    Array.isArray(value) ? Object.freeze([...value]) : value,
  ])));
}

function appendValue(target: Record<string, unknown>, key: string, value: unknown): void {
  const existing = target[key];
  if (existing === undefined) target[key] = value;
  else if (Array.isArray(existing)) target[key] = [...existing, value];
  else target[key] = [existing, value];
}

function entriesInput(entries: Iterable<readonly [string, unknown]>): BunFormRequestInput {
  const result: Record<string, unknown> = {};
  for (const [key, value] of entries) appendValue(result, key, value);
  return freezeRecord(result);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function fileInput(body: BunFormRequestInput): BunFormRequestFileInput {
  const files: Record<string, File | readonly File[]> = {};
  for (const [key, value] of Object.entries(body)) {
    if (isFile(value)) files[key] = value;
    else if (Array.isArray(value)) {
      const selected = value.filter(isFile);
      if (selected.length === 1) files[key] = selected[0] as File;
      else if (selected.length > 1) files[key] = Object.freeze(selected);
    }
  }
  return Object.freeze(files);
}

async function bodyInput(context: BunHttpContext): Promise<BunFormRequestInput> {
  const mediaType = context.request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!mediaType) return Object.freeze({});
  try {
    const request = context.request.clone();
    if (mediaType === "application/json" || mediaType.endsWith("+json")) {
      const parsed: unknown = await request.json();
      if (!isPlainObject(parsed)) {
        throw new BunHttpException(400, "Bad Request");
      }
      return freezeRecord(parsed);
    }
    if (mediaType === "application/x-www-form-urlencoded") {
      return entriesInput(new URLSearchParams(await request.text()).entries());
    }
    if (mediaType === "multipart/form-data") {
      return entriesInput((await request.formData()).entries());
    }
    return Object.freeze({});
  } catch (error) {
    if (error instanceof BunHttpException) throw error;
    throw new BunHttpException(400, "Bad Request");
  }
}

async function collectInput(context: BunHttpContext): Promise<CollectedFormRequestInput> {
  const url = new URL(context.request.url);
  const query = entriesInput(url.searchParams.entries()) as BunFormRequestQueryInput;
  const route = Object.freeze({ ...context.route.params }) as BunFormRequestRouteInput;
  const body = await bodyInput(context);
  const files = fileInput(body);
  const sources = Object.freeze({ route, query, body, files });
  return Object.freeze({ sources, merged: freezeRecord({ ...query, ...body, ...route }) });
}

const BUN_FORM_REQUEST_INPUT = createToken<Promise<CollectedFormRequestInput>>(
  "bunwire.bun.form-request-input",
);

export function prepareBunFormRequestInput(context: BunHttpContext): void {
  context.scope.scoped(BUN_FORM_REQUEST_INPUT, () => collectInput(context));
}

function validationMessages(errors: ValidationErrorsLike): Readonly<Record<string, readonly string[]>> {
  const grouped: Record<string, string[]> = {};
  for (const error of errors.all()) {
    (grouped[error.attribute] ??= []).push(error.message);
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(grouped).map(([attribute, messages]) => [attribute, Object.freeze(messages)]),
  ));
}

export function consumeBunFormRequestRegistry(
  state: BunFormRequestRuntimeState,
  registry: RuntimeRegistry,
): void {
  state.entries.clear();
  for (const entry of registry.classes) {
    if (entry.kind !== BUN_REQUEST_KIND) continue;
    const metadata = getManagedClassMetadata(entry.target);
    if (metadata?.kindId !== BUN_REQUEST_KIND.id
      || metadata.decoratorId !== Request.definition.id
      || !(entry.target.prototype instanceof FormRequest)) {
      throw new TypeError(
        `Bun Request registry entry "${entry.target.name}" must use the canonical @Request() decorator and extend FormRequest.`,
      );
    }
    state.entries.set(entry.target, entry);
  }
  for (const plan of registry.methods) validateRequestParameters(state, plan);
}

function validateRequestParameters(state: BunFormRequestRuntimeState, plan: ManagedMethodPlan): void {
  for (const parameter of plan.parameters) {
    if (parameter.source !== "resolver" || parameter.resolverId !== BUN_FORM_REQUEST_RESOLVER_ID) continue;
    if (typeof parameter.token !== "function"
      || !state.entries.has(parameter.token as Constructable<object>)) {
      throw new TypeError(
        `Managed method "${plan.target.name}.${String(plan.method)}" references an unregistered Bun Request identity.`,
      );
    }
  }
}

export function createBunFormRequestResolver(
  stateForContext: (context: unknown) => BunFormRequestRuntimeState,
) {
  return defineParameterResolver({
    id: BUN_FORM_REQUEST_RESOLVER_ID,
    async resolve(request: ParameterResolutionRequest): Promise<FormRequest> {
      const target = request.parameter.token;
      const state = stateForContext(request.context.applicationContext);
      if (typeof target !== "function") {
        throw new TypeError("Bun Form Request resolution requires an exact registered Request class token.");
      }
      const requestTarget = target as Constructable<object>;
      if (!state.entries.has(requestTarget)) {
        throw new TypeError("Bun Form Request resolution requires an exact registered Request class token.");
      }
      let instances = state.instances.get(request.context.container);
      if (!instances) {
        instances = new Map();
        state.instances.set(request.context.container, instances);
      }
      const existing = instances.get(requestTarget);
      if (existing) return existing;
      const pending = (async () => {
        request.context.container.transient(requestTarget);
        const instance = request.context.container.get(requestTarget);
        if (!(instance instanceof FormRequest)) {
          throw new TypeError(`Bun Request "${requestTarget.name}" did not resolve to a FormRequest instance.`);
        }
        const context = request.context.container.get(BUN_HTTP_CONTEXT);
        const input = await request.context.container.get(BUN_FORM_REQUEST_INPUT);
        const initialization = await instance[BUN_FORM_REQUEST_INITIALIZE](
          context,
          input.sources,
          input.merged,
        );
        if (!initialization.authorized) throw new BunAuthorizationException();
        if (!initialization.result?.valid) {
          throw new BunValidationException(
            validationMessages(initialization.result?.errors ?? instance.errors),
            "Validation Failed",
            initialization.oldInput,
          );
        }
        return instance;
      })();
      instances.set(requestTarget, pending);
      return pending;
    },
  });
}
