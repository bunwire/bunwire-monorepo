const fixtureStateKey = Symbol.for("@bunwire/tests/milestone-7-adapter-state");
const fixtureState = globalThis[fixtureStateKey] ?? {
  moduleLoads: 0,
  constructions: 0,
  nativeCallbacks: 0,
};
fixtureState.moduleLoads += 1;
globalThis[fixtureStateKey] = fixtureState;

const consumerKind = Object.freeze({
  id: "fixture.consumer",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});

const consumerDecorator = Object.freeze({
  id: "fixture.consumer.decorator",
  kind: consumerKind,
  createMetadata: () => Object.freeze({}),
  validateTarget: undefined,
});

const subscribeKind = Object.freeze({
  id: "fixture.subscribe",
  allowedOn: Object.freeze([consumerKind.id]),
  invocable: true,
});

const subscribeDecorator = Object.freeze({
  id: "fixture.subscribe.decorator",
  kind: subscribeKind,
  createMetadata: () => Object.freeze({}),
});

const deliveryInjector = Object.freeze({
  id: "fixture.delivery.decorator",
  resolverId: "fixture.delivery",
  createMetadata: () => Object.freeze({}),
});

const compilerDescriptor = Object.freeze({
  id: "fixture.host",
  classKinds: Object.freeze([consumerKind]),
  classDecorators: Object.freeze([consumerDecorator]),
  methodKinds: Object.freeze([subscribeKind]),
  methodDecorators: Object.freeze([subscribeDecorator]),
  parameterInjectors: Object.freeze([deliveryInjector]),
  metadataHandlers: Object.freeze([
    Object.freeze({ id: "fixture.topic-metadata", data: Object.freeze({ type: "topic" }) }),
  ]),
});

export { fixtureState };

export class FixtureAdapter {
  static compiler = compilerDescriptor;

  constructor(options) {
    fixtureState.constructions += 1;
    if (typeof options?.configure === "function") {
      fixtureState.nativeCallbacks += 1;
      options.configure({ native: true });
    }
  }
}

export class MissingCompilerAdapter {}
