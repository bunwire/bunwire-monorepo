import { Job } from "@bunwire/bun";
@Job({ id: "invalid.null" })
export class Invalid { protected queue = null; handle(): void {} }
