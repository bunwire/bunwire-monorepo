import { Controller, Use } from "@bunwire/core";
@Use("auth:admin\\,user") @Controller() export class Invalid {}
