import { Job } from "@bunwire/bun";
@Job({ id: "duplicate" })
export class First { handle(): void {} }
@Job({ id: "duplicate" })
export class Second { handle(): void {} }
