import {
  MIDDLEWARE_KIND,
  defineManagedClassDecorator,
} from "@bunwire/core";

const CounterfeitMiddleware = defineManagedClassDecorator<void, Readonly<Record<string, never>>, "core.middleware.decorator">({
  id: "core.middleware.decorator",
  compilerSymbol: {
    moduleSpecifier: "fixture.counterfeit",
    exportName: "CounterfeitMiddleware",
  },
  kind: MIDDLEWARE_KIND,
  createMetadata: () => Object.freeze({}),
});

@CounterfeitMiddleware()
export class CounterfeitTarget {
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}
