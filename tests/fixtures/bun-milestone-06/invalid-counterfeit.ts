import { defineManagedClassDecorator } from "@bunwire/core";
import { BUN_REQUEST_KIND, FormRequest } from "@bunwire/bun";

const Request = defineManagedClassDecorator({
  id: "bun.request.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Request" },
  kind: BUN_REQUEST_KIND,
  createMetadata: () => ({ type: "request" }),
});

@Request()
export class CounterfeitRequest extends FormRequest {
  rules() { return {}; }
}
