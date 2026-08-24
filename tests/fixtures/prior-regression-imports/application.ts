import { Controller, Inject } from "@bunwire/core";
import DefaultToken, { PublicToken } from "@bunwire/prior-regression-public";
import * as PublicTokens from "@bunwire/prior-regression-public";

@Controller()
export class PublicImportController {
  constructor(
    @Inject(PublicToken) readonly named: string,
    @Inject(DefaultToken) readonly defaulted: string,
    @Inject(PublicTokens.PublicToken) readonly namespaced: string,
  ) {}
}
