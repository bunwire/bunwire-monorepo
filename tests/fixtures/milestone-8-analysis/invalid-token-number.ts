import { Inject, Service } from "@bunwire/core";

const INVALID_NUMBER = 42;

@Service()
export class InvalidNumberTokenService {
  constructor(@Inject(INVALID_NUMBER) _value: unknown) {}
}
