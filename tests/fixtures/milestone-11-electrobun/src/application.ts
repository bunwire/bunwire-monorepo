import { Controller, Inject, Service, createToken } from "@bunwire/core";
import { Message, Route, Window, type ElectrobunWindow } from "@bunwire/electrobun";

export const CACHE = createToken<{ get(key: string): string }>("fixture.electrobun-cache");

@Service()
export class UserService {
  describe(id: string): string { return `user:${id}`; }
}

@Controller(" /users// ")
export class UserController {
  @Route(" /get/ ")
  get(
    id: string,
    users: UserService,
    @Inject(CACHE) cache: { get(key: string): string },
    @Window() window: ElectrobunWindow,
  ): string {
    return `${users.describe(id)}:${cache.get(id)}:${window.title}`;
  }

  @Message("selected/")
  selected(id: string): void { void id; }

  @Route()
  inferredName(id: string): string { return id; }

  ordinary(id: string): string { return id; }
}
