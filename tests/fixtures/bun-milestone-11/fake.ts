const Job = Object.assign((_options: { id: string }): ClassDecorator => () => {}, {
  definition: { id: "bun.job-decorator" as const },
});
@Job({ id: "fake" })
export class Invalid { handle(): void {} }
