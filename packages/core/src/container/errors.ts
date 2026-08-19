import { describeToken, type RuntimeToken } from "./tokens.js";

export class ContainerResolutionError extends Error {
  readonly chain: readonly RuntimeToken[];

  constructor(message: string, chain: readonly RuntimeToken[]) {
    super(message);
    this.name = "ContainerResolutionError";
    this.chain = Object.freeze([...chain]);
  }
}

export function missingBindingError(
  token: RuntimeToken,
  chain: readonly RuntimeToken[],
): ContainerResolutionError {
  const printableChain = [...chain, token].map(describeToken).join(" -> ");
  return new ContainerResolutionError(
    `Unable to resolve ${describeToken(token)}: no binding is registered. Resolution chain: ${printableChain}.`,
    [...chain, token],
  );
}

export function circularResolutionError(chain: readonly RuntimeToken[]): ContainerResolutionError {
  const printableChain = chain.map(describeToken).join(" -> ");
  return new ContainerResolutionError(
    `Circular dependency detected while resolving: ${printableChain}.`,
    chain,
  );
}
