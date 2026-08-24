import { afterAll, describe, it } from "vitest";
import { createPolicyHarness } from "./policy-test-support.js";

const { analyzePolicy, expectFailure, cleanup } = createPolicyHarness("reference");
afterAll(cleanup);

describe("Middleware Redesign 12D — invalid policy references", () => {
  it.each([
    ["identifier", "value", "const value = \"auth\";"],
    ["call", "getMiddleware()", "const getMiddleware = () => AuthMiddleware;"],
    ["template", "`auth`", ""],
    ["conditional", "true ? AuthMiddleware : AuditMiddleware", ""],
    ["counterfeit class", "FakeMiddleware", "class FakeMiddleware { handle() {} }"],
  ])("rejects non-static or counterfeit reference: %s", (_label, reference, prelude) => {
    expectFailure(analyzePolicy(
      `defineApp().withMiddlewares((registry) => { registry.use(${reference}); })`,
      prelude,
    ), "MIDDLEWARE_POLICY_INVALID");
  });
});
