import { Controller } from "@bunwire/core";
import { Mark } from "proof-attachments";
const Fake = Object.assign((_options: { id: string }): ClassDecorator => () => {}, { definition: Mark.definition });
@Controller() @Fake({ id: "fake" }) export class Counterfeit {}
