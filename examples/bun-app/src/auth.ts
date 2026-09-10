export interface ExamplePrincipal {
  readonly id: string;
  readonly role: "admin" | "member";
}

export function resolveExamplePrincipal(id: string): ExamplePrincipal | undefined {
  return id === "example-user" ? { id, role: "admin" } : undefined;
}
