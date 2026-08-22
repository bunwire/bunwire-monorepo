export class ElectrobunPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElectrobunPathError";
  }
}

function segments(value: string, label: string, allowEmpty: boolean): readonly string[] {
  if (typeof value !== "string") {
    throw new ElectrobunPathError(`${label} must be a string.`);
  }
  const normalized = value.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (!allowEmpty && normalized.length === 0) {
    throw new ElectrobunPathError(`${label} must contain at least one non-empty path segment.`);
  }
  for (const segment of normalized) {
    if (segment === "." || segment === "..") {
      throw new ElectrobunPathError(`${label} may not contain "." or ".." path segments.`);
    }
  }
  return normalized;
}

export function normalizeElectrobunPath(prefix: string | undefined, path: string | undefined, methodName: PropertyKey): string {
  if (typeof methodName !== "string" || methodName.trim().length === 0) {
    throw new ElectrobunPathError("Electrobun managed methods must have non-empty string names.");
  }
  const prefixSegments = prefix === undefined ? [] : segments(prefix, "Controller prefix", true);
  const methodSegments = path === undefined
    ? segments(methodName, "Managed method name", false)
    : segments(path, "Electrobun method path", false);
  return [...prefixSegments, ...methodSegments].join("/");
}
