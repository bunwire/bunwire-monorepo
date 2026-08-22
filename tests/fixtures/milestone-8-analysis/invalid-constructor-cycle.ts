import { Service } from "@bunwire/core";

@Service()
export class CycleA {
  constructor(readonly dependency: CycleB) {}
}

@Service()
export class CycleB {
  constructor(readonly dependency: CycleA) {}
}
