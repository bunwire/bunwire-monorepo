import { Controller, Use } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";
@Controller() export abstract class Invalid { @Use("auth") @Route() abstract run(): void; }
