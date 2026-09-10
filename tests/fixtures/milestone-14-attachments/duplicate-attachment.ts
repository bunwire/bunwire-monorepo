import { Controller } from "@bunwire/core";
import { Mark } from "proof-attachments";
@Controller() @Mark({ id: "first" }) @Mark({ id: "second" }) export class Duplicate {}
