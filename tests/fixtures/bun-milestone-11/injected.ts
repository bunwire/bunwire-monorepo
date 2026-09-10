import { Job } from "@bunwire/bun";
import { Service } from "@bunwire/core";
@Service()
export class Dependency {}
@Job({ id: "injected" })
export class Invalid { handle(_dependency: Dependency): void {} }
