import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertAdapterCompilerDescriptor,
  type AdapterCompilerDescriptor,
} from "@bunwire/core";
import ts from "typescript";
import {
  BunwireCompilerError,
  type BunwireSourceLocation,
} from "./diagnostics.js";

function locationOf(node: ts.Node): BunwireSourceLocation {
  const sourceFile = node.getSourceFile();
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return Object.freeze({
    filePath: path.resolve(sourceFile.fileName),
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  });
}

export interface ImportBinding {
  readonly moduleSpecifier: string;
  readonly exportName: string | undefined;
  readonly namespace: boolean;
}

export interface DiscoveredAdapterReference {
  readonly moduleSpecifier: string;
  readonly resolvedModule: string;
  readonly exportName: string;
  readonly localName: string;
  readonly compilerDescriptor: AdapterCompilerDescriptor;
}

export function collectImportBindings(sourceFile: ts.SourceFile): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || !statement.importClause) {
      continue;
    }
    const moduleSpecifier = statement.moduleSpecifier.text;
    if (statement.importClause.name) {
      bindings.set(statement.importClause.name.text, {
        moduleSpecifier,
        exportName: "default",
        namespace: false,
      });
    }
    const namedBindings = statement.importClause.namedBindings;
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      bindings.set(namedBindings.name.text, {
        moduleSpecifier,
        exportName: undefined,
        namespace: true,
      });
    } else if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        bindings.set(element.name.text, {
          moduleSpecifier,
          exportName: element.propertyName?.text ?? element.name.text,
          namespace: false,
        });
      }
    }
  }
  return bindings;
}

export function unwrapBootstrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isImportedDefineApp(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, ImportBinding>,
): boolean {
  const called = unwrapBootstrapExpression(expression);
  if (ts.isIdentifier(called)) {
    const binding = bindings.get(called.text);
    return binding?.moduleSpecifier === "@bunwire/core" && binding.exportName === "defineApp";
  }
  if (ts.isPropertyAccessExpression(called)) {
    if (ts.isIdentifier(called.expression)) {
      const namespace = bindings.get(called.expression.text);
      if (namespace?.moduleSpecifier === "@bunwire/core"
        && namespace.namespace
        && called.name.text === "defineApp") {
        return true;
      }
    }
  }
  return false;
}

export function applicationCallChain(
  exportedExpression: ts.Expression,
  bindings: ReadonlyMap<string, ImportBinding>,
  bootstrap: string,
): readonly ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  let current = unwrapBootstrapExpression(exportedExpression);
  while (ts.isCallExpression(current)) {
    const called = unwrapBootstrapExpression(current.expression);
    if (isImportedDefineApp(called, bindings)) {
      if (current.arguments.length !== 0) {
        break;
      }
      return calls;
    }
    if (!ts.isPropertyAccessExpression(called) && !ts.isElementAccessExpression(called)) {
      break;
    }
    calls.push(current);
    current = unwrapBootstrapExpression(called.expression);
  }
  throw new BunwireCompilerError(
    "ADAPTER_EXPRESSION_UNRESOLVABLE",
    `Bootstrap "${bootstrap}" default export must be a direct Application chain rooted in the imported defineApp().`,
    { location: locationOf(exportedExpression) },
  );
}

function adapterImportFromExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, ImportBinding>,
  bootstrap: string,
): { readonly binding: ImportBinding; readonly exportName: string; readonly localName: string } {
  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding && !binding.namespace && binding.exportName) {
      return { binding, exportName: binding.exportName, localName: expression.text };
    }
  } else if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const binding = bindings.get(expression.expression.text);
    if (binding?.namespace) {
      return {
        binding,
        exportName: expression.name.text,
        localName: `${expression.expression.text}.${expression.name.text}`,
      };
    }
  }
  throw new BunwireCompilerError(
    "ADAPTER_EXPRESSION_UNRESOLVABLE",
    `Adapter expression "${expression.getText()}" in "${bootstrap}" must reference a statically imported adapter class (named, default, or namespace import).`,
    { location: locationOf(expression) },
  );
}

async function resolveExecutableModule(
  moduleSpecifier: string,
  bootstrap: string,
  location: BunwireSourceLocation,
): Promise<string> {
  let resolved: string;
  try {
    if (moduleSpecifier.startsWith(".")) {
      resolved = path.resolve(path.dirname(bootstrap), moduleSpecifier);
      await stat(resolved);
    } else {
      resolved = await resolveEsmPackageModule(moduleSpecifier, bootstrap);
    }
  } catch (cause) {
    throw new BunwireCompilerError(
      "ADAPTER_MODULE_UNRESOLVABLE",
      `Unable to resolve adapter module "${moduleSpecifier}" from bootstrap "${bootstrap}". Export a runtime-loadable adapter class with an own static compiler descriptor.`,
      { location, cause },
    );
  }
  if (/\.[cm]?tsx?$/i.test(resolved)) {
    throw new BunwireCompilerError(
      "ADAPTER_MODULE_UNRESOLVABLE",
      `Adapter module "${resolved}" is TypeScript source and is not runtime-loadable by the compiler process. Reference the adapter package/module's compiled JavaScript export.`,
      { location },
    );
  }
  return resolved;
}

interface PackageSpecifier {
  readonly name: string;
  readonly subpath: string;
}

function splitPackageSpecifier(moduleSpecifier: string): PackageSpecifier {
  const segments = moduleSpecifier.split("/");
  const scoped = moduleSpecifier.startsWith("@");
  const packageSegments = scoped ? segments.slice(0, 2) : segments.slice(0, 1);
  const subpathSegments = segments.slice(packageSegments.length);
  return {
    name: packageSegments.join("/"),
    subpath: subpathSegments.length === 0 ? "." : `./${subpathSegments.join("/")}`,
  };
}

function selectImportTarget(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const selected = selectImportTarget(candidate);
      if (selected) {
        return selected;
      }
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const conditions = value as Record<string, unknown>;
    const activeConditions = new Set(["node", "import", "default"]);
    for (const [condition, conditionalValue] of Object.entries(conditions)) {
      if (!activeConditions.has(condition)) {
        continue;
      }
      const selected = selectImportTarget(conditionalValue);
      if (selected) {
        return selected;
      }
    }
  }
  return undefined;
}

async function resolveEsmPackageModule(
  moduleSpecifier: string,
  bootstrap: string,
): Promise<string> {
  const parsed = splitPackageSpecifier(moduleSpecifier);
  let directory = path.dirname(bootstrap);
  while (true) {
    const packageRoot = path.join(directory, "node_modules", ...parsed.name.split("/"));
    const manifestPath = path.join(packageRoot, "package.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        readonly exports?: unknown;
        readonly module?: unknown;
        readonly main?: unknown;
      };
      let exported: unknown = manifest.exports;
      if (exported && typeof exported === "object" && !Array.isArray(exported)) {
        const exportMap = exported as Record<string, unknown>;
        if (Object.keys(exportMap).some((key) => key.startsWith("."))) {
          exported = exportMap[parsed.subpath];
        }
      } else if (parsed.subpath !== ".") {
        exported = undefined;
      }
      const target = selectImportTarget(exported)
        ?? (parsed.subpath === "." && typeof manifest.module === "string" ? manifest.module : undefined)
        ?? (parsed.subpath === "." && typeof manifest.main === "string" ? manifest.main : undefined);
      if (!target || path.isAbsolute(target)) {
        throw new Error(`Package "${parsed.name}" does not expose "${parsed.subpath}" for ESM import.`);
      }
      const candidate = path.resolve(packageRoot, target);
      const canonicalRoot = await realpath(packageRoot);
      const canonicalTarget = await realpath(candidate);
      const relative = path.relative(canonicalRoot, canonicalTarget);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Package export "${target}" resolves outside package "${parsed.name}".`);
      }
      if (!(await stat(canonicalTarget)).isFile()) {
        throw new Error(`Package export "${target}" is not a file.`);
      }
      return canonicalTarget;
    } catch (error) {
      if (error instanceof SyntaxError
        || (error instanceof Error && error.message.startsWith("Package "))) {
        throw error;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`Package "${parsed.name}" was not found from "${bootstrap}".`);
    }
    directory = parent;
  }
}

async function loadAdapterDescriptor(
  moduleSpecifier: string,
  resolvedModule: string,
  exportName: string,
  bootstrap: string,
  location: BunwireSourceLocation,
): Promise<AdapterCompilerDescriptor> {
  let namespace: Record<string, unknown>;
  try {
    namespace = await import(pathToFileURL(resolvedModule).href) as Record<string, unknown>;
  } catch (cause) {
    throw new BunwireCompilerError(
      "ADAPTER_MODULE_UNRESOLVABLE",
      `Unable to load adapter compiler module "${moduleSpecifier}" resolved to "${resolvedModule}".`,
      { location, cause },
    );
  }
  const fallback = namespace.default;
  const exported = namespace[exportName] ?? (
    fallback && typeof fallback === "object"
      ? (fallback as Record<string, unknown>)[exportName]
      : undefined
  );
  if (typeof exported !== "function") {
    throw new BunwireCompilerError(
      "ADAPTER_EXPORT_INVALID",
      `Adapter export "${exportName}" was not found as a class in module "${moduleSpecifier}".`,
      { location },
    );
  }
  const compilerProperty = Object.getOwnPropertyDescriptor(exported, "compiler");
  if (!compilerProperty || !("value" in compilerProperty)) {
    throw new BunwireCompilerError(
      "ADAPTER_DESCRIPTOR_INVALID",
      `Adapter class export "${exportName}" from "${moduleSpecifier}" must declare an own static compiler data property.`,
      { location },
    );
  }
  try {
    assertAdapterCompilerDescriptor(compilerProperty.value);
    return compilerProperty.value;
  } catch (cause) {
    throw new BunwireCompilerError(
      "ADAPTER_DESCRIPTOR_INVALID",
      `Adapter class export "${exportName}" from "${moduleSpecifier}" has a malformed compiler descriptor: ${cause instanceof Error ? cause.message : String(cause)}`,
      { location, cause },
    );
  }
}

export async function discoverBootstrapAdapter(
  bootstrap: string,
): Promise<DiscoveredAdapterReference> {
  const sourceText = await readFile(bootstrap, "utf8");
  const sourceFile = ts.createSourceFile(
    bootstrap,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    const diagnostic = parseDiagnostics[0] as ts.Diagnostic;
    const startPosition = diagnostic.start ?? 0;
    const start = sourceFile.getLineAndCharacterOfPosition(startPosition);
    const end = sourceFile.getLineAndCharacterOfPosition(startPosition + (diagnostic.length ?? 0));
    throw new BunwireCompilerError(
      "BOOTSTRAP_INVALID",
      `Unable to parse Bunwire bootstrap "${bootstrap}": ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
      { location: Object.freeze({
        filePath: path.resolve(bootstrap),
        line: start.line + 1,
        column: start.character + 1,
        endLine: end.line + 1,
        endColumn: end.character + 1,
      }) },
    );
  }
  const bindings = collectImportBindings(sourceFile);
  const defaultExports = sourceFile.statements.filter(
    (statement): statement is ts.ExportAssignment => (
      ts.isExportAssignment(statement) && !statement.isExportEquals
    ),
  );
  if (defaultExports.length !== 1) {
    throw new BunwireCompilerError(
      "ADAPTER_EXPRESSION_UNRESOLVABLE",
      `Bootstrap "${bootstrap}" must contain exactly one default-exported Application composition root.`,
      { location: locationOf(defaultExports[1] ?? sourceFile) },
    );
  }
  const exportedApplication = defaultExports[0] as ts.ExportAssignment;
  const applicationCalls = applicationCallChain(exportedApplication.expression, bindings, bootstrap);
  const adapterCalls = applicationCalls.filter((call) => (
    ts.isPropertyAccessExpression(unwrapBootstrapExpression(call.expression))
      && (unwrapBootstrapExpression(call.expression) as ts.PropertyAccessExpression).name.text === "withAdapter"
  ));

  if (adapterCalls.length !== 1) {
    throw new BunwireCompilerError(
      "ADAPTER_EXPRESSION_UNRESOLVABLE",
      adapterCalls.length === 0
        ? `Bootstrap "${bootstrap}" must configure one primary adapter through defineApp().withAdapter(new ImportedAdapter(...)).`
        : `Bootstrap "${bootstrap}" configures ${adapterCalls.length} adapters; v1 requires exactly one primary host adapter.`,
      { location: locationOf(adapterCalls[1] ?? exportedApplication.expression) },
    );
  }
  const adapterCall = adapterCalls[0] as ts.CallExpression;
  const argument = adapterCall.arguments[0];
  if (adapterCall.arguments.length !== 1 || !argument || !ts.isNewExpression(argument)) {
    throw new BunwireCompilerError(
      "ADAPTER_EXPRESSION_UNRESOLVABLE",
      `withAdapter() in "${bootstrap}" must receive a direct "new ImportedAdapter(...)" expression so compiler integration can be resolved without executing runtime configuration.`,
      { location: locationOf(adapterCall) },
    );
  }
  const imported = adapterImportFromExpression(argument.expression, bindings, bootstrap);
  const adapterLocation = locationOf(argument);
  const resolvedModule = await resolveExecutableModule(
    imported.binding.moduleSpecifier,
    bootstrap,
    adapterLocation,
  );
  const compilerDescriptor = await loadAdapterDescriptor(
    imported.binding.moduleSpecifier,
    resolvedModule,
    imported.exportName,
    bootstrap,
    adapterLocation,
  );
  return Object.freeze({
    moduleSpecifier: imported.binding.moduleSpecifier,
    resolvedModule,
    exportName: imported.exportName,
    localName: imported.localName,
    compilerDescriptor,
  });
}
