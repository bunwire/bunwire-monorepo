import type { Path, PathSegment, PathValue } from "./types.js";

const segmentPattern = /[^.\[\]]+/g;

export function parsePath(path: string | Path): PathSegment[] {
  if (typeof path !== "string") {
    if (path.length === 0) throw new Error("A validation path must not be empty.");
    return [...path];
  }
  if (path.length === 0) throw new Error("A validation path must not be empty.");
  const matches = path.match(segmentPattern) ?? [];
  if (matches.length === 0) throw new Error("A validation path must not be empty.");
  return matches.map((segment) => /^\d+$/.test(segment) ? Number(segment) : segment);
}

export function formatPath(path: string | Path): string {
  return parsePath(path).map(String).join(".");
}

export function getPath(data: unknown, path: string | Path): PathValue {
  let current: unknown = data;
  for (const segment of parsePath(path)) {
    if (current === null || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return { present: false, value: undefined };
    }
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current === undefined ? { present: false, value: undefined } : { present: true, value: current };
}

export function setPath(target: Record<string | number, unknown>, path: string | Path, value: unknown): void {
  const segments = parsePath(path);
  let current: Record<string | number, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const next = segments[index + 1]!;
    const existing = current[segment];
    if (existing === null || typeof existing !== "object") {
      current[segment] = typeof next === "number" ? [] : {};
    }
    current = current[segment] as Record<string | number, unknown>;
  }
  current[segments[segments.length - 1]!] = value;
}
