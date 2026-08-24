import { Controller, Use } from "@bunwire/core";
const reference = "auth";
@Use(reference) @Controller() export class Invalid {}
