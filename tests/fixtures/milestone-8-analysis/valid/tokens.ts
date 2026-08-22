import { createToken } from "@bunwire/core";

export interface Cache {
  readonly name: string;
}

export const CACHE = createToken<Cache>("fixture-cache");

export class RandomUtility {
  readonly useful = true;
}
