import { Controller } from "@bunwire/core";
import { RandomUtility } from "./valid/tokens.js";

@Controller("invalid")
export class PlainDependencyController {
  constructor(readonly utility: RandomUtility) {}
}
