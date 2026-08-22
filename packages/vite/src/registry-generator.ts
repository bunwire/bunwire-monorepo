import { createHash } from "node:crypto";
import path from "node:path";
import type { CompilerSymbolReference } from "@bunwire/core";
import type {
  AnalyzedManagedClass,
  BunwireCompilerAnalysis,
  CompilerRuntimeReference,
} from "./compiler-analysis.js";
import { BunwireCompilerError } from "./diagnostics.js";
import type { DiscoveredCompilerExtensions } from "./extensions.js";
import { BUNWIRE_REGISTRY_MODULE_ID } from "./virtual-modules.js";

export interface GenerateRuntimeRegistryModuleOptions {
  readonly analysis: BunwireCompilerAnalysis;
  readonly extensions: DiscoveredCompilerExtensions;
  readonly modulePath: string;
  readonly importMode?: "relative" | "vite";
}

export interface GeneratedRuntimeRegistryModule {
  readonly id: typeof BUNWIRE_REGISTRY_MODULE_ID;
  readonly code: string;
  readonly hash: string;
}

interface ImportBinding {
  readonly moduleSpecifier: string;
  readonly exportName: string;
  readonly localName: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableValue).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right));
    return `{ ${entries.map(([key, entry]) => `${JSON.stringify(key)}: ${stableValue(entry)}`).join(", ")} }`;
  }
  throw new BunwireCompilerError(
    "REGISTRY_GENERATION_INVALID",
    `Generated registry metadata contains unsupported ${typeof value} data.`,
  );
}

function runtimeExtension(filePath: string): string {
  if (/\.mts$/i.test(filePath)) return ".mjs";
  if (/\.cts$/i.test(filePath)) return ".cjs";
  return ".js";
}

function importSpecifier(
  declarationPath: string,
  modulePath: string,
  mode: "relative" | "vite",
): string {
  const withoutExtension = declarationPath.replace(/\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/i, "");
  const runtimePath = `${withoutExtension}${runtimeExtension(declarationPath)}`.replaceAll("\\", "/");
  if (mode === "vite") {
    return `/@fs/${runtimePath}`;
  }
  let relative = path.relative(path.dirname(modulePath), runtimePath).replaceAll("\\", "/");
  if (!relative.startsWith(".")) {
    relative = `./${relative}`;
  }
  return relative;
}

function classSortKey(entry: AnalyzedManagedClass): string {
  return `${entry.target.declaration.filePath.replaceAll("\\", "/").toLowerCase()}\0${entry.target.exportName}`;
}

export function generateRuntimeRegistryModule(
  options: GenerateRuntimeRegistryModuleOptions,
): GeneratedRuntimeRegistryModule {
  const mode = options.importMode ?? "relative";
  const classes = [...options.analysis.classes]
    .sort((left, right) => compareText(classSortKey(left), classSortKey(right)));
  const classKeys = new Set<string>();
  const methodKeys = new Set<string>();
  for (const entry of classes) {
    const classKey = classSortKey(entry);
    if (classKeys.has(classKey)) {
      throw new BunwireCompilerError(
        "REGISTRY_GENERATION_INVALID",
        `Generated registry contains duplicate managed class identity "${entry.target.exportName}" from "${entry.target.declaration.filePath}".`,
        { location: entry.location },
      );
    }
    classKeys.add(classKey);
    for (const method of entry.methods) {
      const methodKey = `${classKey}\0${method.name}\0${method.kind.id}`;
      if (methodKeys.has(methodKey)) {
        throw new BunwireCompilerError(
          "REGISTRY_GENERATION_INVALID",
          `Generated registry contains duplicate managed method identity "${entry.name}.${method.name}" for kind "${method.kind.id}".`,
          { location: method.location },
        );
      }
      methodKeys.add(methodKey);
    }
  }

  const imports = new Map<string, ImportBinding>();
  let nextImport = 0;
  const addImport = (moduleSpecifier: string, exportName: string): string => {
    const key = `${moduleSpecifier}\0${exportName}`;
    const existing = imports.get(key);
    if (existing) return existing.localName;
    const binding = Object.freeze({
      moduleSpecifier,
      exportName,
      localName: `__bunwire_import_${nextImport++}`,
    });
    imports.set(key, binding);
    return binding.localName;
  };
  const runtimeReference = (reference: CompilerRuntimeReference): string => addImport(
    reference.moduleSpecifier
      ?? importSpecifier(reference.declaration.filePath, options.modulePath, mode),
    reference.exportName,
  );
  const compilerReference = (reference: CompilerSymbolReference): string => addImport(
    reference.moduleSpecifier,
    reference.exportName,
  );

  const classDecoratorById = new Map<string, DiscoveredCompilerExtensions["classDecorators"][number]>(
    options.extensions.classDecorators.map((definition) => [definition.id, definition]),
  );
  const methodDecoratorById = new Map<string, DiscoveredCompilerExtensions["methodDecorators"][number]>(
    options.extensions.methodDecorators.map((definition) => [definition.id, definition]),
  );

  const classRecords = classes.map((entry) => {
    const decorator = classDecoratorById.get(entry.decoratorId);
    if (!decorator) {
      throw new BunwireCompilerError(
        "REGISTRY_GENERATION_INVALID",
        `Managed class "${entry.name}" references unknown canonical decorator "${entry.decoratorId}".`,
        { location: entry.location },
      );
    }
    const target = runtimeReference(entry.target);
    const decoratorRuntime = compilerReference(decorator.compilerSymbol);
    const dependencies = (entry.constructor?.dependencies ?? []).map((dependency) => (
      `{ index: ${dependency.index}, token: ${runtimeReference(dependency.token)} }`
    ));
    const scope = entry.kind.id === "core.service"
      && typeof entry.data === "object"
      && entry.data !== null
      && (entry.data as { readonly scope?: unknown }).scope === "transient"
      ? "transient"
      : "singleton";
    return `    { kind: ${decoratorRuntime}.definition.kind, target: ${target}, data: ${stableValue(entry.data)}, scope: ${JSON.stringify(scope)}, dependencies: [${dependencies.join(", ")}] }`;
  });

  const providerRecords = classes
    .filter((entry) => entry.kind.id === "core.provider")
    .map((entry) => `    ${runtimeReference(entry.target)}`);

  const methodRecords = classes.flatMap((entry) => entry.methods.map((method) => {
    const decorator = methodDecoratorById.get(method.decoratorId);
    if (!decorator) {
      throw new BunwireCompilerError(
        "REGISTRY_GENERATION_INVALID",
        `Managed method "${entry.name}.${method.name}" references unknown canonical decorator "${method.decoratorId}".`,
        { location: method.location },
      );
    }
    const target = runtimeReference(entry.target);
    const classDecorator = classDecoratorById.get(entry.decoratorId) as NonNullable<ReturnType<typeof classDecoratorById.get>>;
    const ownerDecoratorRuntime = compilerReference(classDecorator.compilerSymbol);
    const methodDecoratorRuntime = compilerReference(decorator.compilerSymbol);
    const parameters = method.parameters.map((parameter) => {
      switch (parameter.source) {
        case "transport":
          return `{ source: "transport", methodIndex: ${parameter.methodIndex}, argumentIndex: ${parameter.argumentIndex}, optional: ${parameter.optional}, rest: ${parameter.rest} }`;
        case "container":
          return `{ source: "container", methodIndex: ${parameter.methodIndex}, token: ${runtimeReference(parameter.token)} }`;
        case "resolver":
          return `{ source: "resolver", methodIndex: ${parameter.methodIndex}, resolverId: createParameterResolverId(${JSON.stringify(parameter.resolverId)}), data: ${stableValue(parameter.data)} }`;
      }
    });
    return `    defineManagedMethodPlan({ kind: ${methodDecoratorRuntime}.definition.kind, ownerKind: ${ownerDecoratorRuntime}.definition.kind, target: ${target}, method: ${JSON.stringify(method.name)}, data: ${stableValue(method.data)}, parameters: [${parameters.join(", ")}], middleware: [] })`;
  }));

  const importLines = [...imports.values()]
    .sort((left, right) => compareText(
      `${left.moduleSpecifier}\0${left.exportName}`,
      `${right.moduleSpecifier}\0${right.exportName}`,
    ))
    .map(({ moduleSpecifier, exportName, localName }) => (
      `import { ${exportName} as ${localName} } from ${JSON.stringify(moduleSpecifier)};`
    ));
  const body = [
    "// Generated by @bunwire/vite. Do not edit.",
    "import { createParameterResolverId, defineManagedMethodPlan, defineRuntimeRegistry } from \"@bunwire/core\";",
    ...importLines,
    "",
    "export const applicationRegistry = defineRuntimeRegistry({",
    "  classes: [",
    ...classRecords.map((line) => `${line},`),
    "  ],",
    "  providers: [",
    ...providerRecords.map((line) => `${line},`),
    "  ],",
    "  methods: [",
    ...methodRecords.map((line) => `${line},`),
    "  ],",
    "});",
    "",
  ].join("\n");
  const hash = createHash("sha256").update(body).digest("hex");
  const code = `${body}export const BUNWIRE_REGISTRY_HASH = ${JSON.stringify(hash)};\nexport default applicationRegistry;\n`;
  return Object.freeze({ id: BUNWIRE_REGISTRY_MODULE_ID, code, hash });
}
