import { QUEUE_NAME as queue, POLICY, BACKOFF, Job, JOB_ALIAS, TOKEN, COUNTERFEIT } from "./star.js";
import * as policies from "./star.js";
export const imported = { queue, ...POLICY, backoff: [...BACKOFF, 90_000], name: policies.QUEUE_NAME };
export const namespaceComputed = policies["QUEUE_NAME"];
export const references = [Job, JOB_ALIAS, policies.Job, TOKEN, COUNTERFEIT];
export const alias = queue;
export const aliases = [alias, alias];
export const primitive = ["a", 1_000, true, false, null, undefined];
export const wrappers = (({ n: 2 } as const) as { n: number }) satisfies { n: number };
export const typeAssertion = (<{ n: number }>({ n: 2 }))!;
export const operators = [+2, -2, 1 + 2, 5 - 3, 2 * 4, 8 / 2, 8 % 3, 2 ** 3, "a" + "b"];
export const spread = { ...{ a: 1, b: 1 }, a: 2, ...{ b: 3 }, ["c" + "d"]: [0, ...[1, 2]], [4]: "four" };
export const special = { __proto__: "safe", constructor: 2, toString: 3 };
export const own = special["__proto__"];
export const arrayRead = [3, 4][1];
export const arrayLength = [3, 4].length;
export const shadow = "outer";
function lexical() {
  const shadow = "inner";
  const undefined = "shadowed";
  const shadowResult = [shadow, undefined];
}
