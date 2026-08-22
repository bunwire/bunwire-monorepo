import { Controller } from "@bunwire/core";
import type { Cache } from "./valid/tokens.js";

@Controller("invalid")
export class InterfaceDependencyController {
  constructor(readonly cache: Cache) {}
}
