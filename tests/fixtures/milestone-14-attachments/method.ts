import { Controller } from "@bunwire/core";
import { Mark } from "proof-attachments";
@Controller() export class Owner { @Mark({ id: "method" }) handle(): void {} }
