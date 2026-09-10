# @bunwire/validation

A small, framework-independent TypeScript validation library. It has no HTTP,
database, framework, or application-domain assumptions.

## Quick start

```ts
import { ValidationRequest } from "@bunwire/validation";

class CreateUserRequest extends ValidationRequest<
  { name?: unknown; email?: unknown; age?: unknown },
  { name: string; email: string; age?: number }
> {
  rules() {
    return {
      name: ["required", "string"],
      email: ["required", "email"],
      age: ["optional", "number", "min:18"],
    };
  }
}

const request = new CreateUserRequest({ name: "Ada", email: "ada@example.com", age: 25 });
const result = request.validate();

if (result.valid) {
  const user = request.validated(); // { name: string; email: string; age?: number }
}
```

`validate()` returns `{ valid: true, data, errors }` or `{ valid: false, errors }`.
Use `errors.has(path)`, `errors.first(path)`, `errors.get(path)`, and
`errors.all()` to consume structured `ValidationError` objects.

`ValidationRequest.all()` returns the complete original input, while
`validated()` returns only the declared and successfully validated projection.
The original input is also available through the `input` property. Use
`ValidationRequest.get(path, defaultValue?)` to read one raw input value using
dot or bracket paths, such as `locations.name` or `items[0].name`.

## Rules and aliases

Rules are executable objects with a stable name and a `caller(context)`. The
default registry includes `required`, `optional`, `nullable`, `string`,
`number`, `integer`, `boolean`, `array`, `object`, `min`, `max`, `between`,
`email`, `url`, `in`, `notIn`, `same`, and `different`.

Rule declarations accept arrays (the canonical form) or pipe strings:

```ts
const rules = {
  name: ["required", "string", "min:3"],
  email: "required|email",
  role: "in:author,editor",
  passwordConfirmation: "same:password",
};
```

Argument-bearing built-ins also have programmatic factories via the `rules`
namespace. They are equivalent to their string forms and resolve through the
active registry, so aliases overridden on a validator apply to both forms:

```ts
import { rules } from "@bunwire/validation";

const ruleset = {
  name: ["required", "string", rules.min(3)],
  age: rules.between(18, 65),
  role: rules.in("author", "editor"),
  passwordConfirmation: rules.same("password"),
};
```

Available factories are `rules.min`, `rules.max`, `rules.between`, `rules.in`,
`rules.notIn`, `rules.same`, and `rules.different`.

Arguments are parsed once from aliases and exposed to rules as string tokens.
Consequently, `in:1,2,3` accepts both `1` and `"1"`; `null` is skipped by
ordinary rules unless the rule opts into null execution.

## Custom rules

External packages can define and register their own rules without changing this
package:

```ts
import { createValidator, type Rule } from "@bunwire/validation";

export const sourceFileRule: Rule = {
  name: "source-file",
  defaultMessage: "The :attribute field must be a TypeScript source file.",
  caller: ({ value }) =>
    typeof value === "string" && /\.(ts|tsx)$/.test(value)
      ? { valid: true }
      : { valid: false, code: "SOURCE_FILE" },
};

const validator = createValidator().alias("source-file", sourceFileRule);
validator.validate({ file: "entry.ts" }, { file: "required|source-file" });
```

Direct `Rule` objects and rule callbacks are also accepted in rule definitions.
`RuleRegistry` supports `register`, `alias`, `resolve`, `has`, and `fork`; an
existing alias requires `{ override: true }` to be replaced.

## Presence and execution semantics

`undefined` is absent. `null` is present but ordinary rules skip it by default.
`required` runs for absent/null values and rejects null, empty strings, and
empty arrays; `false`, `0`, and `{}` satisfy it.

- `optional` skips ordinary content rules when the value is absent.
- `nullable` skips ordinary content rules when the value is null.
- `required` has the necessary execution flags to still run after either skip,
  so it remains authoritative in `required|nullable` and `nullable|required`.

Rules can independently opt into absent values (`runsOnAbsent`), null values
(`runsOnNull`), and post-skip execution (`runsWhenSkipped`). These are separate
policies: a custom rule that must run after `nullable` needs both `runsOnNull`
and `runsWhenSkipped`.

## Paths and validated output

Exact nested paths support `user.email`, `items.0.name`, and
`items[0].name`. Missing or null intermediate values are absent. Empty paths
are invalid. Wildcards and property names containing `.` or brackets are not
supported in v1.

Successful `data` is a projection containing only declared, present paths.
Containers along those paths are reconstructed; leaf object and array values
remain references to the input and are not deep-cloned.

## Messages and errors

Rules can return a message, code, metadata, and interpolation parameters.
Message precedence is attribute-rule then rule-level messages from the request,
then the validator, then the rule default. Templates support `:attribute`,
`:value`, positional `:arg0`, and rule-provided parameters such as `:min`.

## Sync and async validation

Use `validate()` for synchronous rules. It throws `AsyncRuleError` if a rule
returns a promise. Use `validateAsync()` to run mixed synchronous and
asynchronous rules in declaration order.

## Type contract

`ValidationRequest<Input, Validated>` makes the host-declared `Validated` type
explicit. `validated()` returns exactly that type after a successful validation;
it does not accept a caller-chosen generic type. `Validator.validate<TData, TOutput>()`
remains available for advanced callers, but its output type is an
explicit caller assertion rather than automatic TypeScript inference from rules.

Programmatic argument-bearing factories such as `min(5)` are intentionally
deferred. Use an alias string or a direct `Rule` object/function today.
