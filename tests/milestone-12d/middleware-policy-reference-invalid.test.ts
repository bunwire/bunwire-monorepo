import { afterAll, describe, expect, it } from "vitest";
import { createPolicyHarness } from "./policy-test-support.js";

const { analyzePolicy, expectFailure, cleanup } = createPolicyHarness("reference");
afterAll(cleanup);

describe("Middleware Redesign 12D — invalid policy references", () => {
  it.each([["value", "const value = \"auth\";"], ["`auth`", ""]])("accepts static reference %s", (reference, prelude) => {
    expect(analyzePolicy(`defineApp().withMiddlewares((registry) => { registry.use(${reference}); })`, prelude)().classes).toBeTruthy();
  });
  it.each([
    ["call", "getMiddleware()", "const getMiddleware = () => AuthMiddleware;"],
    ["conditional", "true ? AuthMiddleware : AuditMiddleware", ""],
    ["counterfeit class", "FakeMiddleware", "class FakeMiddleware { handle() {} }"],
  ])("rejects non-static or counterfeit reference: %s", (_label, reference, prelude) => {
    expectFailure(analyzePolicy(
      `defineApp().withMiddlewares((registry) => { registry.use(${reference}); })`,
      prelude,
    ), "MIDDLEWARE_POLICY_INVALID");
  });
});
