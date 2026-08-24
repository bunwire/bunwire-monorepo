import { Controller, MIDDLEWARE_KIND, Use, defineManagedClassDecorator } from "@bunwire/core";
const FakeMiddleware = defineManagedClassDecorator({
  id: "fixture.fake-middleware",
  compilerSymbol: { moduleSpecifier: "fixture", exportName: "FakeMiddleware" },
  kind: MIDDLEWARE_KIND,
  createMetadata: () => ({}),
});
@FakeMiddleware() export class CounterfeitMiddleware { handle() {} }
@Use(CounterfeitMiddleware) @Controller() export class Invalid {}
