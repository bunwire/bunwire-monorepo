import { Controller } from "@bunwire/core";
import { FormRequest, Post } from "@bunwire/bun";

class UndecoratedRequest extends FormRequest {
  rules() { return {}; }
}

@Controller()
export class InvalidController {
  @Post()
  create(_request: UndecoratedRequest): object { return {}; }
}
