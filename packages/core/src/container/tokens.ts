const tokenBrand: unique symbol = Symbol("bunwire.token.brand");
declare const tokenType: unique symbol;

export type ClassToken<Value = unknown> = abstract new (...args: any[]) => Value;
export type Constructable<Value = unknown> = new (...args: any[]) => Value;

export interface Token<Value> {
  readonly [tokenBrand]: true;
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
    [tokenBrand]: true as const,
    kind: "bunwire.token" as const,
    id: Symbol(description),
    description,
    toString: () => `Token(${description})`,
  };

  return Object.freeze(token) as Token<Value>;
}

export function isToken(value: unknown): value is Token<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Token<unknown>>;
  return candidate[tokenBrand] === true
    && candidate.kind === "bunwire.token"
    && typeof candidate.id === "symbol"
    && typeof candidate.description === "string"
    && candidate.description.trim().length > 0
    && typeof candidate.toString === "function";
}

export function isClassToken(value: unknown): value is ClassToken {
  if (typeof value !== "function") return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
}

export function describeToken(token: RuntimeToken): string {
  if (isToken(token)) {
    return token.toString();
  }
  return token.name ? `Class(${token.name})` : "Class(<anonymous>)";
}
