import { Inject, Service } from "@bunwire/core";

const INVALID_UNKNOWN: unknown = 42;

@Service()
export class InvalidUnknownTokenService {
  constructor(@Inject(INVALID_UNKNOWN) _value: unknown) {}
}
