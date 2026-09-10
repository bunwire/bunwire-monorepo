import { Controller } from "@bunwire/core";
import { Mark, Widget } from "proof-attachments";
@Controller() @Mark({ id: "shared" }) export class First {}
@Widget({ id: "shared" }) export class Second {}
