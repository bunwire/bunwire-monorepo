import { Job } from "@bunwire/bun";
@Job({ id: "invalid.constructor" })
export class Invalid { protected tries = 1; constructor() { this.tries = 5; } handle(): void {} }
