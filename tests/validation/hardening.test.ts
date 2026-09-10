import { describe, expect, test } from "vitest";
import {
  AsyncRuleError, ValidationRequest, createValidator, getPath, parsePath, setPath,
  type Rule, type RuleDefinitions,
} from "@bunwire/validation";
import { sourceFileRule } from "./external-rules.js";

describe("presence and skip semantics", () => {
  test("treats missing and undefined as absent while retaining false, zero, and empty objects", () => {
    const result = createValidator().validate({ undefinedValue: undefined, falseValue: false, zero: 0, object: {} }, {
      missing: "required", undefinedValue: "required", falseValue: "required|boolean", zero: "required|number", object: "required|object",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.all().map((error) => error.attribute)).toEqual(["missing", "undefinedValue"]);
  });

  test("defines required, optional, and nullable combinations in either order", () => {
    const result = createValidator().validate({
      nullable: null, requiredNullable: null, nullableRequired: null,
    }, {
      optionalString: "optional|string",
      nullable: "nullable|string",
      requiredNullable: "required|nullable|string",
      nullableRequired: "nullable|required|string",
      optionalRequired: "optional|required|string",
      requiredOptional: "required|optional|string",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.all().map((error) => `${error.attribute}:${error.rule}`)).toEqual([
      "requiredNullable:required", "nullableRequired:required", "optionalRequired:required", "requiredOptional:required",
    ]);
  });

  test("skips content rules for null but validates present non-null values", () => {
    const result = createValidator().validate({ nullValue: null, empty: "", emptyArray: [] }, {
      nullValue: ["nullable", "string", "min:1"], empty: ["string", "min:1"], emptyArray: ["array", "min:1"],
    });
    expect(result.errors.all().map((error) => `${error.attribute}:${error.rule}`)).toEqual(["empty:min", "emptyArray:min"]);
  });

  test("allows custom rules to intentionally run after a null skip when they opt into both policies", () => {
    const audit: Rule = { name: "audit", runsOnNull: true, runsWhenSkipped: true, caller: () => ({ valid: false, code: "AUDIT" }) };
    const result = createValidator().validate({ value: null }, { value: ["nullable", audit, "string"] });
    expect(result.errors.all().map((error) => error.rule)).toEqual(["audit"]);
  });
});

describe("paths and projected output", () => {
  test("reads array indexes and reports absent values through missing or null intermediates", () => {
    expect(getPath({ items: [{ name: "Ada" }] }, "items[0].name")).toEqual({ present: true, value: "Ada" });
    expect(getPath({ user: null }, "user.email")).toEqual({ present: false, value: undefined });
    expect(getPath({}, "user.email")).toEqual({ present: false, value: undefined });
  });

  test("constructs nested objects and arrays without copying unruled fields", () => {
    const output: Record<string | number, unknown> = {};
    setPath(output, "user.name", "Ada");
    setPath(output, "items[0].name", "first");
    expect(output).toEqual({ user: { name: "Ada" }, items: [{ name: "first" }] });
    const result = createValidator().validate({ user: { name: "Ada", role: "admin" }, items: [{ name: "first", hidden: true }] }, {
      "user.name": "required", "items.0.name": "required",
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data as unknown).toEqual({ user: { name: "Ada" }, items: [{ name: "first" }] });
  });

  test("rejects empty string and empty segment paths", () => {
    expect(() => parsePath("")).toThrow("must not be empty");
    expect(() => parsePath([])).toThrow("must not be empty");
    expect(() => setPath({}, [], "invalid")).toThrow("must not be empty");
  });
});

describe("membership, errors, and external rules", () => {
  test("uses string tokens for in and notIn", () => {
    const validator = createValidator();
    const allowed = validator.validate({ numeric: 1, string: "2", falseValue: false, nullValue: null }, {
      numeric: "in:1,2,3", string: "in:1,2,3", falseValue: "in:1,2,3", nullValue: "in:1,2,3",
    });
    expect(allowed.errors.all().map((error) => error.attribute)).toEqual(["falseValue"]);
    const excluded = validator.validate({ number: 1, string: "1", falseValue: false, nullValue: null }, {
      number: "notIn:1", string: "notIn:1", falseValue: "notIn:1", nullValue: "notIn:1",
    });
    expect(excluded.errors.all().map((error) => error.attribute)).toEqual(["number", "string"]);
  });

  test("exposes nested custom errors, metadata, and multiple failures", () => {
    const validator = createValidator().alias("source-file", sourceFileRule);
    const result = validator.validate({ asset: { file: "README.md" }, name: 1 }, {
      "asset.file": "source-file", name: ["string", "min:3"],
    });
    expect(result.errors.has("asset.file")).toBe(true);
    expect(result.errors.first("asset.file")?.metadata).toEqual({ acceptedExtensions: [".ts", ".tsx"] });
    expect(result.errors.get("name").map((error) => error.rule)).toEqual(["string", "min"]);
  });

  test("supports an external rule directly without registry changes", () => {
    const result = createValidator().validate({ file: "README.md" }, { file: sourceFileRule });
    expect(result.errors.first("file")?.code).toBe("SOURCE_FILE");
  });
});

describe("type contract and asynchronous rules", () => {
  class UserRequest extends ValidationRequest<{ email: string; ignored: string }, { email: string }> {
    rules(): RuleDefinitions<{ email: string; ignored: string }> { return { email: "required|email" }; }
  }

  test("returns the request-declared validated type", () => {
    const request = new UserRequest({ email: "ada@example.com", ignored: "not projected" });
    request.validate();
    const data: { email: string } = request.validated();
    expect(data).toEqual({ email: "ada@example.com" });
    // @ts-expect-error validated no longer accepts unchecked type arguments.
    request.validated<number>();
  });

  test("awaits mixed rules and preserves ordered async errors", async () => {
    const asyncFailure: Rule = { name: "async-failure", caller: async () => ({ valid: false, code: "ASYNC" }) };
    const syncFailure: Rule = { name: "sync-failure", caller: () => ({ valid: false, code: "SYNC" }) };
    const validator = createValidator().alias("async-failure", asyncFailure).alias("sync-failure", syncFailure);
    expect(() => validator.validate({ value: "x" }, { value: "async-failure" })).toThrow(AsyncRuleError);
    const result = await validator.validateAsync({ value: "x" }, { value: ["sync-failure", "async-failure"] });
    expect(result.errors.all().map((error) => error.code)).toEqual(["SYNC", "ASYNC"]);
  });

  test("keeps sync and async APIs semantically identical for synchronous rule sets", async () => {
    const labelled: Rule = {
      name: "labelled",
      defaultMessage: ":attribute has an invalid label :arg0.",
      caller: ({ value, arguments: args }) => value === args[0] ? { valid: true } : { valid: false, code: "LABEL", metadata: { expected: args[0] } },
    };
    const validator = createValidator({ messages: { "user.email.email": "Email :value is invalid." } }).alias("labelled", labelled);
    const data = { user: { email: "bad", label: "wrong" }, tags: [], enabled: false, nullable: null };
    const definitions = {
      "user.email": ["required", "email"],
      "user.label": [labelled, "labelled:expected"],
      tags: ["required", "array", "min:1"],
      enabled: ["required", "boolean"],
      nullable: ["nullable", "string"],
      missing: ["optional", "string"],
    };
    const summarize = (result: ReturnType<typeof validator.validate>) => ({
      valid: result.valid,
      ...(result.valid ? { data: result.data } : {}),
      errors: result.errors.all(),
    });
    expect(summarize(await validator.validateAsync(data, definitions))).toEqual(summarize(validator.validate(data, definitions)));
  });
});
