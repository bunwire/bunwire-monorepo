import { Inject, Service } from "@bunwire/core";

const INVALID_ANY: any = 42;

@Service()
export class InvalidAnyTokenService {
  constructor(@Inject(INVALID_ANY) _value: unknown) {}
}
