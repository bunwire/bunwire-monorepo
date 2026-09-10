import { Controller, Service } from "@bunwire/core";
import { FormRequest, Post, Request } from "@bunwire/bun";

@Service()
export class RequestService {}

@Request()
export class CreateUserRequest extends FormRequest {
  constructor(readonly service: RequestService) { super(); }
  rules() { return { name: "required|string" }; }
}

@Controller("/users")
export class UserController {
  @Post()
  create(request: CreateUserRequest): object {
    return request.validated();
  }
}
