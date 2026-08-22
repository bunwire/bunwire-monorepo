import { Inject, Service } from "@bunwire/core";

const INVALID_FUNCTION = (): string => "not constructable";

@Service()
export class InvalidFunctionTokenService {
  constructor(@Inject(INVALID_FUNCTION) _value: unknown) {}
}
