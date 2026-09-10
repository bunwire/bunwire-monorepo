import { describe, expect, test } from "vitest";
import { AsyncRuleError, RuleRegistry, ValidationRequest, createValidator, getPath, parsePath, rules, type Rule, type RuleDefinitions } from "@bunwire/validation";

describe("paths and declarations", () => {
  test("normalizes dot and bracket paths", () => {
    expect(parsePath("items[0].name")).toEqual(["items", 0, "name"]);
    expect(getPath({ items: [{ name: "ok" }] }, "items.0.name")).toEqual({ present: true, value: "ok" });
  });

  test("validates nested paths and emits only declared data", () => {
    const result = createValidator().validate({ user: { email: "a@b.com", ignored: true }, ignored: 1 }, { "user.email": "required|email" });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data as unknown).toEqual({ user: { email: "a@b.com" } });
  });

  test("supports array syntax, pipes, and arguments", () => {
    const result = createValidator().validate({ name: "Al", status: "draft" }, { name: ["required", "string", "min:3"], status: "in:pending,approved" });
    expect(result.valid).toBe(false);
    expect(result.errors.get("name")[0]?.rule).toBe("min");
    expect(result.errors.get("status")[0]?.arguments).toEqual(["pending", "approved"]);
  });

  test("supports programmatic built-in rule invocations alongside strings", () => {
    const result = createValidator().validate({ age: 17, role: "reader", password: "a", confirmation: "b" }, {
      age: ["required", rules.min(18)], role: rules.in("author", "editor"), confirmation: [rules.same("password"), "different:password"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.all().map((error) => [error.rule, error.arguments])).toEqual([
      ["min", ["18"]], ["in", ["author", "editor"]], ["same", ["password"]],
    ]);
  });

  test("supports every argument-bearing built-in factory", () => {
    const result = createValidator().validate({
      minimum: 5, maximum: 5, range: 5, allowed: "author", blocked: "reader", password: "secret", confirmation: "secret", changed: "different",
    }, {
      minimum: rules.min(5), maximum: rules.max(5), range: rules.between(4, 6), allowed: rules.in("author", "editor"), blocked: rules.notIn("banned"),
      confirmation: rules.same("password"), changed: rules.different("password"),
    });
    expect(result.valid).toBe(true);
  });
});

describe("registry and custom rules", () => {
  const sourceFile: Rule = { name: "source-file", defaultMessage: "The :attribute must be a source file.", caller: ({ value }) => typeof value === "string" && /\.(ts|tsx)$/.test(value) ? { valid: true } : { valid: false, code: "SOURCE_FILE" } };

  test("registers aliases without core domain knowledge", () => {
    const validator = createValidator().alias("source-file", sourceFile);
    const result = validator.validate({ file: "README.md" }, { file: ["source-file"] });
    expect(result.valid).toBe(false);
    expect(result.errors.first("file")?.code).toBe("SOURCE_FILE");
  });

  test("supports direct objects and callback rules", () => {
    const direct: Rule = { name: "starts-x", caller: ({ value }) => String(value).startsWith("x") ? { valid: true } : { valid: false, message: ":attribute needs x" } };
    const result = createValidator().validate({ a: "bad", b: "bad" }, { a: direct, b: (context) => context.value === "ok" ? { valid: true } : { valid: false } });
    expect(result.errors.all().map((error) => error.rule)).toEqual(["starts-x", "b"]);
  });

  test("isolates registries and requires explicit replacement", () => {
    const registry = new RuleRegistry();
    registry.register("x", sourceFile);
    expect(() => registry.register("x", sourceFile)).toThrow();
    const fork = registry.fork().register("x", { ...sourceFile, name: "replacement" }, { override: true });
    expect(registry.resolve("x")?.name).toBe("source-file");
    expect(fork.resolve("x")?.name).toBe("replacement");
  });
});

describe("built-in rules and errors", () => {
  test("handles required, optional, nullable, and empty values", () => {
    const result = createValidator().validate({ required: "", nullable: null, empty: [] }, {
      required: ["required", "string"], optional: ["optional", "string"], nullable: ["nullable", "string"], empty: ["required", "array"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.has("required")).toBe(true);
    expect(result.errors.has("optional")).toBe(false);
    expect(result.errors.has("nullable")).toBe(false);
    expect(result.errors.has("empty")).toBe(true);
  });

  test("covers primitive, numeric, membership, and cross-field rules", () => {
    const result = createValidator().validate({ s: 1, n: 1.2, b: "yes", a: {}, o: [], age: 17, status: "other", password: "a", confirm: "b" }, {
      s: "string", n: "integer", b: "boolean", a: "array", o: "object", age: "between:18,65", status: ["in:ok,yes", "notIn:other"], confirm: ["same:password", "different:password"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.size).toBe(9);
  });

  test("resolves custom messages and interpolation", () => {
    const result = createValidator({ messages: { "name.min": ":attribute needs :min characters (:arg0)." } }).validate({ name: "a" }, { name: rules.min(3) }, { attributes: { name: "Display name" } });
    expect(result.errors.first("name")?.message).toBe("Display name needs 3 characters (3).");
    expect(result.errors.all()).toHaveLength(1);
  });

  test("factories honor registry alias overrides", () => {
    const replacement: Rule = { name: "replacement-min", caller: ({ arguments: args }) => args[0] === "5" ? { valid: false, code: "REPLACED" } : { valid: true } };
    const validator = createValidator().alias("min", replacement, { override: true });
    const result = validator.validate({ string: "value", factory: "value" }, { string: "min:5", factory: rules.min(5) });
    expect(result.errors.all().map((error) => [error.rule, error.arguments, error.code])).toEqual([
      ["replacement-min", ["5"], "REPLACED"], ["replacement-min", ["5"], "REPLACED"],
    ]);
  });
});

describe("request and async behavior", () => {
  class CreateUserRequest extends ValidationRequest<{ name: string; email: string }, { name: string; email: string }> {
    rules(): RuleDefinitions<{ name: string; email: string }> { return { name: "required|string", email: "required|email" }; }
  }

  test("retains request result and exposes validated data", () => {
    const request = new CreateUserRequest({ name: "Ada", email: "ada@example.com" });
    expect(request.all()).toEqual({ name: "Ada", email: "ada@example.com" });
    expect(request.input).toEqual(request.all());
    expect(request.validate().valid).toBe(true);
    expect(request.validated()).toEqual({ name: "Ada", email: "ada@example.com" });
  });

  test("gets raw nested input by dot and bracket paths", () => {
    class NestedRequest extends ValidationRequest<{
      locations: { name: string };
      items: { name: string }[];
    }> {
      rules(): RuleDefinitions<{ locations: { name: string }; items: { name: string }[] }> {
        return { "locations.name": "required|string", "items[0].name": "required|string" };
      }
    }

    const request = new NestedRequest({ locations: { name: "Lagos" }, items: [{ name: "first" }] });
    expect(request.get("locations.name")).toBe("Lagos");
    expect(request.get("items[0].name")).toBe("first");
    expect(request.get("locations.country")).toBeUndefined();
    expect(request.get("locations.country", "Nigeria")).toBe("Nigeria");
    expect(request.validate().valid).toBe(true);
  });

  test("gets raw input before validation and after validation failure", () => {
    const request = new CreateUserRequest({ name: "Ada", email: "not-an-email" });
    expect(request.get("name")).toBe("Ada");
    expect(request.validate().valid).toBe(false);
    expect(request.get("name")).toBe("Ada");
    expect(request.get("missing", false)).toBe(false);
  });

  test("keeps validation failures result-first", () => {
    const request = new CreateUserRequest({ name: "", email: "not-email" });
    expect(request.validate().valid).toBe(false);
    expect(request.errors.has("email")).toBe(true);
    expect(() => request.validated()).toThrow("Validation failed");
  });

  test("supports mixed async rules and rejects them in synchronous mode", async () => {
    const asyncRule: Rule = { name: "available", caller: async ({ value }) => value === "ok" ? { valid: true } : { valid: false } };
    const validator = createValidator().alias("available", asyncRule);
    expect(() => validator.validate({ value: "ok" }, { value: "available" })).toThrow(AsyncRuleError);
    await expect(validator.validateAsync({ value: "bad" }, { value: ["string", "available"] })).resolves.toMatchObject({ valid: false });
  });
});
