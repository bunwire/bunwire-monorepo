import type { Rule } from "./types.js";

export interface RegisterOptions { readonly override?: boolean; }

export class RuleRegistry {
  readonly #rules: Map<string, Rule>;

  constructor(rules: Iterable<readonly [string, Rule]> = []) {
    this.#rules = new Map(rules);
  }

  register(alias: string, rule: Rule, options: RegisterOptions = {}): this {
    if (!alias) throw new Error("A rule alias must not be empty.");
    if (this.#rules.has(alias) && !options.override) {
      throw new Error(`A rule is already registered for alias "${alias}".`);
    }
    this.#rules.set(alias, rule);
    return this;
  }

  alias(alias: string, rule: Rule, options?: RegisterOptions): this {
    return this.register(alias, rule, options);
  }

  resolve(alias: string): Rule | undefined { return this.#rules.get(alias); }
  has(alias: string): boolean { return this.#rules.has(alias); }
  fork(): RuleRegistry { return new RuleRegistry(this.#rules); }
}
