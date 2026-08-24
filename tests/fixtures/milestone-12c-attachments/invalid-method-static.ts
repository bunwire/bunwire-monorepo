import { Controller, Use } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";
@Controller() export class Invalid { @Use("auth") @Route() static run() {} }
