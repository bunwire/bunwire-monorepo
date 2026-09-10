import { Service } from "@bunwire/core";
import { Mark } from "proof-attachments";
@Service() @Mark({ id: "wrong" }) export class Wrong {}
