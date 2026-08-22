export interface CompilerSymbolReference {
  readonly moduleSpecifier: string;
  readonly exportName: string;
}

export function assertCompilerSymbolReference(
  reference: CompilerSymbolReference,
  label: string,
): void {
  if (typeof reference !== "object" || reference === null
    || typeof reference.moduleSpecifier !== "string"
    || reference.moduleSpecifier.trim().length === 0
    || typeof reference.exportName !== "string"
    || reference.exportName.trim().length === 0) {
    throw new TypeError(
      `${label} requires a compilerSymbol with non-empty moduleSpecifier and exportName values.`,
    );
  }
}

export function freezeCompilerSymbolReference(
  reference: CompilerSymbolReference,
  label: string,
): CompilerSymbolReference {
  assertCompilerSymbolReference(reference, label);
  return Object.freeze({
    moduleSpecifier: reference.moduleSpecifier,
    exportName: reference.exportName,
  });
}
