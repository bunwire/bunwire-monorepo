import { Job } from "@bunwire/bun";
import { Inject, createToken } from "@bunwire/core";
export const TOKEN = createToken<string>("test.token");
@Job({ id: "invalid.token" })
export class Invalid { handle(@Inject(TOKEN) _id: string): void {} }
