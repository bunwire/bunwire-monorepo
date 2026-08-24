import { afterAll, describe, it } from "vitest";
import { createPolicyHarness } from "./policy-test-support.js";

const { analyzePolicy, expectFailure, cleanup } = createPolicyHarness("mapping");
afterAll(cleanup);

describe("Middleware Redesign 12D — invalid Controller mappings", () => {
  it.each([
    ["non-object", "registry.controllers(mapping);", "const mapping = {};"],
    ["spread property", "registry.controllers({ ...mapping });", "const mapping = {};"],
    ["computed property", "registry.controllers({ [\"controllers/**\"]: \"auth\" });", ""],
    ["identifier value", "registry.controllers({ \"controllers/**\": refs });", "const refs = [\"auth\"];"],
    ["empty array", "registry.controllers({ \"controllers/**\": [] });", ""],
  ])("rejects invalid Controller mapping form: %s", (_label, statement, prelude) => {
    expectFailure(analyzePolicy(
      `defineApp().withMiddlewares((registry) => { ${statement} })`,
      prelude,
    ), "MIDDLEWARE_POLICY_INVALID");
  });

  it.each([
    ["/controllers/**", "relative path"],
    ["../controllers/**", "relative path"],
    ["controllers\\\\**", "relative path"],
    ["controllers/a**b.ts", "relative path"],
    ["missing/**", "matched no discovered Controller"],
  ])("rejects invalid or unmatched Controller pattern %s", (pattern, message) => {
    expectFailure(analyzePolicy(
      `defineApp().withMiddlewares((r) => { r.controllers({ ${JSON.stringify(pattern)}: \"auth\" }); })`,
    ), "MIDDLEWARE_CONTROLLER_PATTERN_INVALID", message);
  });
});
