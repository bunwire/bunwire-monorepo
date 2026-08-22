import { Inject, Service } from "@bunwire/core";

const INVALID_OBJECT = Object.freeze({ value: true });

@Service()
export class InvalidObjectTokenService {
  constructor(@Inject(INVALID_OBJECT) _value: unknown) {}
}
