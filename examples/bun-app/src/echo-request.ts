import { FormRequest, Request } from "@bunwire/bun";
import { Service } from "@bunwire/core";

interface EchoInput extends Record<string, unknown> {
  id?: string;
  message?: string;
  normalizedBy?: string;
}

@Service()
export class EchoNormalizer {
  readonly name = "bunwire-di";
}

@Request()
export class EchoRequest extends FormRequest<
  EchoInput,
  Required<Pick<EchoInput, "id" | "message" | "normalizedBy">>
> {
  constructor(readonly normalizer: EchoNormalizer) { super(); }

  override rules() {
    return {
      id: "required|string",
      message: "required|string",
      normalizedBy: "required|string",
    };
  }

  override authorize(): boolean {
    return this.get("deny") !== "true";
  }

  protected override prepareForValidation(): void {
    this.merge({ normalizedBy: this.normalizer.name });
  }
}
