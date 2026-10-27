import { Middleware } from "@bunwire/core";

export const trace: string[] = [];
interface Context { readonly parameters: readonly string[] }
class Traced {
  protected tag = "base";
  async handle(context: Context, next: () => Promise<unknown>): Promise<unknown> {
    const label = `${this.tag}${context.parameters.length ? ":" + context.parameters.join(",") : ""}`;
    trace.push("before:" + label);
    const value = await next();
    trace.push("after:" + label);
    return value;
  }
}
@Middleware() export class BillingAuth extends Traced { protected alias = "billing-auth"; protected override tag = "billing-auth"; }
@Middleware() export class BillingAudit extends Traced { protected alias = "billing-audit"; protected override tag = "billing-audit"; }
@Middleware() export class BillingCan extends Traced { protected alias = "billing-can"; protected override tag = "billing-can"; }
