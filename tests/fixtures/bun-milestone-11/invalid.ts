import { Job } from "@bunwire/bun";
@Job({ id: "invalid" })
export class Invalid { protected tries = 0; handle(): void {} }
