import { Job } from "@bunwire/bun";
@Job({ id: "overload" })
export class Invalid { handle(id: string): void; handle(_id: string): void {} }
