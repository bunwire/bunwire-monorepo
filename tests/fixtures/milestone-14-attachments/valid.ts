import { Controller } from "@bunwire/core";
import { Mark, Widget } from "proof-attachments";
@Controller() @Mark({ id: "first" }) export class First {}
@Mark({ id: "second" }) @Controller() export class Second {}
@Widget({ id: "third" }) export class Third {}
