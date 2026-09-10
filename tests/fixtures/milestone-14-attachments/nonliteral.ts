import { Controller } from "@bunwire/core";
import { Mark } from "proof-attachments";
const id = () => "dynamic";
@Controller() @Mark({ id: id() }) export class Nonliteral {}
