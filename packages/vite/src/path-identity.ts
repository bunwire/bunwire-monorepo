import path from "node:path";
import ts from "typescript";

export function normalizedCompilerPath(filePath: string): string {
  return path.resolve(filePath).replaceAll("\\", "/");
}

export function canonicalCompilerPath(
  filePath: string,
  useCaseSensitiveFileNames = ts.sys.useCaseSensitiveFileNames,
): string {
  const normalized = normalizedCompilerPath(filePath);
  return useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}
