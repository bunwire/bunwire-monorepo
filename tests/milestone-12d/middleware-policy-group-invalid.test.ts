import { afterAll, describe, it } from "vitest";
import { createPolicyHarness } from "./policy-test-support.js";

const { analyzePolicy, expectFailure, cleanup } = createPolicyHarness("group");
afterAll(cleanup);

describe("Middleware Redesign 12D — invalid groups", () => {
  it("rejects invalid groups and alias collisions", () => {
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares((r) => { r.group(\"x\", [AuthMiddleware]); r.group(\"x\", [AuditMiddleware]); })",
    ), "MIDDLEWARE_POLICY_INVALID", "more than once");
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares((r) => { r.group(\"   \", [AuthMiddleware]); })",
    ), "MIDDLEWARE_POLICY_INVALID", "must not be empty");
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares((r) => { r.group(\"auth\", [AuditMiddleware]); })",
    ), "MIDDLEWARE_POLICY_INVALID", "collides");
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares((r) => { r.group(\"empty\", []); })",
    ), "MIDDLEWARE_POLICY_INVALID", "at least one");
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares((r) => { r.use(\"missing\"); })",
    ), "MIDDLEWARE_POLICY_INVALID", "unknown alias or group");
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares((r) => { r.group(\"stack\", [\"auth\"]); r.use(\"stack:param\"); })",
    ), "MIDDLEWARE_POLICY_INVALID", "cannot receive parameters");
  });

  it("reports direct and indirect group cycles with the complete path", () => {
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares((r) => { r.group(\"a\", [\"a\"]); })",
    ), "MIDDLEWARE_GROUP_CYCLE", "a -> a");
    expectFailure(analyzePolicy(
      "defineApp().withMiddlewares((r) => { r.group(\"a\", [\"b\"]); r.group(\"b\", [\"c\"]); r.group(\"c\", [\"a\"]); })",
    ), "MIDDLEWARE_GROUP_CYCLE", "a -> b -> c -> a");
  });
});
