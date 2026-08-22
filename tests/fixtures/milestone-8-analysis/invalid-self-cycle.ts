import { Service } from "@bunwire/core";

@Service()
export class SelfCycleService {
  constructor(readonly self: SelfCycleService) {}
}
