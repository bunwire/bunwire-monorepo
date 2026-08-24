import { Controller, Use } from "@bunwire/core";
@Controller() export class Invalid { @Use("auth") run = () => undefined; }
