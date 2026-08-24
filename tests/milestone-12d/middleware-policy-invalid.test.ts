import { afterAll, describe, it } from "vitest";
import { createPolicyHarness } from "./policy-test-support.js";

const { analyzePolicy, expectFailure, cleanup } = createPolicyHarness("callback");
afterAll(cleanup);

describe("Middleware Redesign 12D — invalid policy callback syntax", () => {
  it("rejects repeated and indirect withMiddlewares callbacks", () => {
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares((registry) => {}).withMiddlewares((registry) => {})",
    ), "MIDDLEWARE_POLICY_INVALID", "at most one");
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares(configure)",
      "const configure = (registry: any) => { registry.use(AuthMiddleware); };",
    ), "MIDDLEWARE_POLICY_INVALID", "direct callback");
  });

  it("rejects computed and optional application-chain access", () => {
    expectFailure(analyzePolicy(
      "defineApp()[\"withMiddlewares\"]((registry) => { registry.use(AuthMiddleware); })",
    ), "MIDDLEWARE_POLICY_INVALID", "non-computed");
    expectFailure(analyzePolicy(
      "defineApp()?.withMiddlewares((registry) => { registry.use(AuthMiddleware); })",
    ), "MIDDLEWARE_POLICY_INVALID", "non-optional");
  });

  it.each([
    ["async callback", "defineApp().withMiddlewares(async (registry) => {})"],
    ["expression body", "defineApp().withMiddlewares((registry) => registry.use(AuthMiddleware))"],
    ["missing parameter", "defineApp().withMiddlewares(() => {})"],
    ["destructured parameter", "defineApp().withMiddlewares(({ use }) => {})"],
    ["return", "defineApp().withMiddlewares((registry) => { return; })"],
    ["variable", "defineApp().withMiddlewares((registry) => { const value = AuthMiddleware; })"],
    ["control flow", "defineApp().withMiddlewares((registry) => { if (true) registry.use(AuthMiddleware); })"],
    ["helper", "defineApp().withMiddlewares((registry) => { helper(registry); })"],
    ["wrong receiver", "defineApp().withMiddlewares((registry) => { other.use(AuthMiddleware); })"],
    ["computed method", "defineApp().withMiddlewares((registry) => { registry[\"use\"](AuthMiddleware); })"],
    ["optional method", "defineApp().withMiddlewares((registry) => { registry?.use(AuthMiddleware); })"],
    ["spread arguments", "defineApp().withMiddlewares((registry) => { registry.use(...[AuthMiddleware]); })"],
  ])("rejects forbidden callback form: %s", (_label, body) => {
    expectFailure(analyzePolicy(body), "MIDDLEWARE_POLICY_INVALID");
  });
});
