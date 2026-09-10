import { Controller } from "@bunwire/core";
import { Mark } from "proof-attachments";
@Controller() @Mark({ id: "base" }) export class Base {}
@Controller() export class Child extends Base {}
