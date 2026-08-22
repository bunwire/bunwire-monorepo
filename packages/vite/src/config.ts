import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { BunwireCompilerError } from "./diagnostics.js";

const configFileNames = Object.freeze([
  "bunwire.config.ts",
  "bunwire.config.mts",
  "bunwire.config.cts",
  "bunwire.config.js",
  "bunwire.config.mjs",
  "bunwire.config.cjs",
] as const);

export interface BunwireConfig {
  readonly source: string | readonly string[];
  readonly bootstrap: string;
}

export interface ResolvedBunwireConfig {
  readonly root: string;
  readonly configFile: string;
  readonly sourceRoots: readonly string[];
  readonly bootstrap: string;
}

export interface LoadBunwireConfigOptions {
  readonly root?: string;
  readonly configFile?: string;
}

function assertNonEmptyRelativePath(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BunwireCompilerError(
      "CONFIG_INVALID",
      `Bunwire config field "${label}" must be a non-empty project-root-relative path.`,
    );
  }
  if (path.isAbsolute(value)) {
    throw new BunwireCompilerError(
      "CONFIG_INVALID",
      `Bunwire config field "${label}" must be relative to the project root; received absolute path "${value}".`,
    );
  }
}

export function defineBunwireConfig(config: BunwireConfig): Readonly<BunwireConfig> {
  if (!config || typeof config !== "object") {
    throw new BunwireCompilerError("CONFIG_INVALID", "Bunwire config must be an object.");
  }
  const sources = Array.isArray(config.source) ? [...config.source] : [config.source];
  if (sources.length === 0) {
    throw new BunwireCompilerError(
      "CONFIG_INVALID",
      "Bunwire config field \"source\" must contain at least one source root.",
    );
  }
  for (const source of sources) {
    assertNonEmptyRelativePath(source, "source");
  }
  assertNonEmptyRelativePath(config.bootstrap, "bootstrap");
  return Object.freeze({
    source: Array.isArray(config.source) ? Object.freeze(sources) : sources[0] as string,
    bootstrap: config.bootstrap,
  });
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
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

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function readString(expression: ts.Expression, field: string, filePath: string): string {
  const value = unwrapExpression(expression);
  if (!ts.isStringLiteralLike(value)) {
    throw new BunwireCompilerError(
      "CONFIG_INVALID",
      `Bunwire config field "${field}" in "${filePath}" must be a string literal so discovery remains deterministic.`,
      { filePath },
    );
  }
  return value.text;
}

function readSource(expression: ts.Expression, filePath: string): string | readonly string[] {
  const value = unwrapExpression(expression);
  if (ts.isArrayLiteralExpression(value)) {
    if (value.elements.length === 0) {
      throw new BunwireCompilerError(
        "CONFIG_INVALID",
        `Bunwire config field "source" in "${filePath}" must contain at least one path.`,
        { filePath },
      );
    }
    return value.elements.map((element) => readString(element, "source", filePath));
  }
  return readString(value, "source", filePath);
}

function parseConfigSource(sourceText: string, filePath: string): Readonly<BunwireConfig> {
  const sourceFile = ts.createSourceFile(
    filePath,
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
    throw new BunwireCompilerError(
      "CONFIG_INVALID",
      `Unable to parse Bunwire config "${filePath}": ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
      { filePath },
    );
  }

  const exports = sourceFile.statements.filter(ts.isExportAssignment);
  const exportedConfig = exports[0];
  if (exports.length !== 1 || !exportedConfig || exportedConfig.isExportEquals) {
    throw new BunwireCompilerError(
      "CONFIG_INVALID",
      `Bunwire config "${filePath}" must contain exactly one "export default defineBunwireConfig({ ... })" declaration.`,
      { filePath },
    );
  }

  let expression = unwrapExpression(exportedConfig.expression);
  if (ts.isCallExpression(expression)) {
    const called = expression.expression;
    const isConfigHelper = ts.isIdentifier(called) && called.text === "defineBunwireConfig";
    if (!isConfigHelper || expression.arguments.length !== 1) {
      throw new BunwireCompilerError(
        "CONFIG_INVALID",
        `Bunwire config "${filePath}" must call defineBunwireConfig() with one object literal.`,
        { filePath },
      );
    }
    const configArgument = expression.arguments[0];
    if (!configArgument) {
      throw new BunwireCompilerError(
        "CONFIG_INVALID",
        `Bunwire config "${filePath}" must call defineBunwireConfig() with one object literal.`,
        { filePath },
      );
    }
    expression = unwrapExpression(configArgument);
  }
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new BunwireCompilerError(
      "CONFIG_INVALID",
      `Bunwire config "${filePath}" must export a declarative object literal.`,
      { filePath },
    );
  }

  let source: string | readonly string[] | undefined;
  let bootstrap: string | undefined;
  const seen = new Set<string>();
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new BunwireCompilerError(
        "CONFIG_INVALID",
        `Bunwire config "${filePath}" may only contain explicit source/bootstrap property assignments.`,
        { filePath },
      );
    }
    const name = propertyNameText(property.name);
    if (name !== "source" && name !== "bootstrap") {
      throw new BunwireCompilerError(
        "CONFIG_INVALID",
        `Unknown Bunwire config field "${name ?? property.name.getText(sourceFile)}" in "${filePath}". Milestone 7 supports "source" and "bootstrap".`,
        { filePath },
      );
    }
    if (seen.has(name)) {
      throw new BunwireCompilerError(
        "CONFIG_INVALID",
        `Bunwire config field "${name}" is declared more than once in "${filePath}".`,
        { filePath },
      );
    }
    seen.add(name);
    if (name === "source") {
      source = readSource(property.initializer, filePath);
    } else {
      bootstrap = readString(property.initializer, "bootstrap", filePath);
    }
  }
  if (source === undefined || bootstrap === undefined) {
    throw new BunwireCompilerError(
      "CONFIG_INVALID",
      `Bunwire config "${filePath}" must declare both "source" and "bootstrap".`,
      { filePath },
    );
  }
  return defineBunwireConfig({ source, bootstrap });
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative));
}

async function assertExistingPath(
  target: string,
  expected: "file" | "directory",
  code: "SOURCE_ROOT_NOT_FOUND" | "BOOTSTRAP_NOT_FOUND",
  label: string,
): Promise<void> {
  let details;
  try {
    details = await stat(target);
  } catch (cause) {
    throw new BunwireCompilerError(
      code,
      `${label} "${target}" does not exist. Check the project-root-relative path in bunwire.config.*.`,
      { filePath: target, cause },
    );
  }
  const valid = expected === "file" ? details.isFile() : details.isDirectory();
  if (!valid) {
    throw new BunwireCompilerError(
      expected === "file" ? "BOOTSTRAP_INVALID" : "SOURCE_ROOT_INVALID",
      `${label} "${target}" must be a ${expected}.`,
      { filePath: target },
    );
  }
}

async function resolveContainedPath(
  root: string,
  relativePath: string,
  label: string,
): Promise<string> {
  const resolved = path.resolve(root, relativePath);
  if (!isWithin(root, resolved)) {
    throw new BunwireCompilerError(
      "CONFIG_PATH_OUTSIDE_ROOT",
      `${label} path "${relativePath}" resolves outside project root "${root}".`,
      { filePath: resolved },
    );
  }
  return resolved;
}

async function findConfigFile(root: string, configured?: string): Promise<string> {
  if (configured) {
    const resolved = await resolveContainedPath(root, configured, "Bunwire config");
    try {
      if ((await stat(resolved)).isFile()) {
        return resolved;
      }
    } catch {}
    throw new BunwireCompilerError(
      "CONFIG_NOT_FOUND",
      `Bunwire config file "${resolved}" does not exist.`,
      { filePath: resolved },
    );
  }

  const found: string[] = [];
  for (const fileName of configFileNames) {
    const candidate = path.join(root, fileName);
    try {
      if ((await stat(candidate)).isFile()) {
        found.push(candidate);
      }
    } catch {}
  }
  if (found.length === 0) {
    throw new BunwireCompilerError(
      "CONFIG_NOT_FOUND",
      `No bunwire.config.* file was found in project root "${root}".`,
      { filePath: root },
    );
  }
  if (found.length > 1) {
    throw new BunwireCompilerError(
      "CONFIG_AMBIGUOUS",
      `Multiple Bunwire config files were found: ${found.map((file) => `"${file}"`).join(", ")}. Keep one or select configFile explicitly.`,
      { filePath: root },
    );
  }
  return found[0] as string;
}

export async function loadBunwireConfig(
  options: LoadBunwireConfigOptions = {},
): Promise<ResolvedBunwireConfig> {
  const requestedRoot = path.resolve(options.root ?? process.cwd());
  let root: string;
  try {
    root = await realpath(requestedRoot);
  } catch (cause) {
    throw new BunwireCompilerError(
      "CONFIG_NOT_FOUND",
      `Bunwire project root "${requestedRoot}" does not exist.`,
      { filePath: requestedRoot, cause },
    );
  }
  const configFile = await findConfigFile(root, options.configFile);
  const parsed = parseConfigSource(await readFile(configFile, "utf8"), configFile);
  const sourceValues = Array.isArray(parsed.source) ? parsed.source : [parsed.source];
  const resolvedSourceRoots: string[] = [];
  for (const source of sourceValues) {
    const resolved = await resolveContainedPath(root, source, "Source root");
    await assertExistingPath(resolved, "directory", "SOURCE_ROOT_NOT_FOUND", "Bunwire source root");
    const canonical = await realpath(resolved);
    if (!isWithin(root, canonical)) {
      throw new BunwireCompilerError(
        "SOURCE_GRAPH_ESCAPE",
        `Bunwire source root "${resolved}" resolves outside project root through a filesystem link.`,
        { filePath: resolved },
      );
    }
    resolvedSourceRoots.push(canonical);
  }

  const bootstrapCandidate = await resolveContainedPath(root, parsed.bootstrap, "Bootstrap");
  await assertExistingPath(
    bootstrapCandidate,
    "file",
    "BOOTSTRAP_NOT_FOUND",
    "Bunwire bootstrap",
  );
  const bootstrap = await realpath(bootstrapCandidate);
  if (!isWithin(root, bootstrap)) {
    throw new BunwireCompilerError(
      "CONFIG_PATH_OUTSIDE_ROOT",
      `Bunwire bootstrap "${bootstrapCandidate}" resolves outside project root through a filesystem link.`,
      { filePath: bootstrapCandidate },
    );
  }

  const sourceRoots = [...new Set(resolvedSourceRoots)].sort();
  return Object.freeze({
    root,
    configFile,
    sourceRoots: Object.freeze(sourceRoots),
    bootstrap,
  });
}
