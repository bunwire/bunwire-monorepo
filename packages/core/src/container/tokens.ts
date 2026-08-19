declare const tokenType: unique symbol;

export type ClassToken<Value = unknown> = abstract new (...args: any[]) => Value;
export type Constructable<Value = unknown> = new (...args: any[]) => Value;

export interface Token<Value> {
  readonly kind: "bunwire.token";
  readonly id: symbol;
  readonly description: string;
  readonly [tokenType]?: Value;
  toString(): string;
}

export type RuntimeToken<Value = unknown> = Token<Value> | ClassToken<Value>;

export function createToken<Value>(description: string): Token<Value> {
  if (description.trim().length === 0) {
    throw new TypeError("Token description must not be empty.");
  }

  const token = {
    kind: "bunwire.token" as const,
    id: Symbol(description),
    description,
    toString: () => `Token(${description})`,
  };

  return Object.freeze(token) as Token<Value>;
}

export function isToken(value: unknown): value is Token<unknown> {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "bunwire.token";
}

export function isClassToken(value: unknown): value is ClassToken {
  return typeof value === "function";
}

export function describeToken(token: RuntimeToken): string {
  if (isToken(token)) {
    return token.toString();
  }
  return token.name ? `Class(${token.name})` : "Class(<anonymous>)";
}
