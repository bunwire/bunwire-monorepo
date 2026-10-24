import { Middleware } from "@bunwire/core";
export const trace: string[] = [];
export const abilities = new Set(["admin.access"]);
export interface PolicyContext { readonly parameters: readonly string[] }
class Traced {
  protected tag = "base";
  async handle(context: PolicyContext, next: () => Promise<unknown>): Promise<unknown> {
    const label = `${this.tag}${context.parameters.length ? ":" + context.parameters.join(",") : ""}`;
    trace.push("before:" + label);
    const result = await next();
    trace.push("after:" + label);
    return result;
  }
}
@Middleware() export class Csrf extends Traced { protected alias = "csrf"; protected override tag = "csrf"; }
@Middleware() export class Auth extends Traced { protected alias = "auth"; protected override tag = "auth"; }
@Middleware() export class Audit extends Traced { protected alias = "audit"; protected override tag = "audit"; }
@Middleware() export class Can extends Traced {
  protected alias = "can"; protected override tag = "can";
  override async handle(context: PolicyContext, next: () => Promise<unknown>): Promise<unknown> {
    if (!abilities.has(context.parameters[0]!)) throw new Error("Unknown authorization policy");
    return super.handle(context, next);
  }
}
