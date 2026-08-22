import { Controller as ManagedController } from "@bunwire/core";
import { UserService as Users } from "./services.js";

@ManagedController("users")
export class UserController {
  constructor(readonly users: Users) {}
}
