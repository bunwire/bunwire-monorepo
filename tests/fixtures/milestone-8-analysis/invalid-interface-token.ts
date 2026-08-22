import { Controller, Inject } from "@bunwire/core";

interface FixtureCacheContract {
  readonly value: string;
}

@Controller("invalid")
export class TypeOnlyTokenController {
  constructor(
    @Inject(FixtureCacheContract)
    readonly cache: FixtureCacheContract,
  ) {}
}
