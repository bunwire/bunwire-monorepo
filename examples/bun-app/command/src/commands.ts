import { Argument, Command, Flag, Option } from "@bunwire/bun";
import { Service } from "@bunwire/core";

@Service()
export class GreetingService {
  greeting(name: string, excited: boolean): string { return `Hello, ${name}${excited ? "!" : "."}`; }
}

@Command({ name: "greet", description: "Print a generated, DI-managed greeting." })
export class GreetCommand {
  constructor(private readonly greetings: GreetingService) {}
  handle(
    @Argument({ name: "name", description: "Name to greet." }) name: string,
    @Option({ name: "count", alias: "c", type: "integer", default: 1, description: "Number of greetings." }) count: number,
    @Flag({ name: "excited", alias: "e", description: "Use excited punctuation." }) excited: boolean,
  ): void {
    for (let index = 0; index < count; index++) console.log(this.greetings.greeting(name, excited));
  }
}
