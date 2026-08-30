import { createHash } from "node:crypto";
import path from "node:path";
import {
  EVENT_KIND,
  LISTENER_KIND,
  MIDDLEWARE_KIND,
  type CompilerSymbolReference,
  type MiddlewareClassMetadata,
} from "@bunwire/core";
import type {
  AnalyzedManagedClass,
  BunwireCompilerAnalysis,
  CompilerRuntimeReference,
} from "./compiler-analysis.js";
import { BunwireCompilerError } from "./diagnostics.js";
import { canonicalCompilerPath } from "./path-identity.js";
import type { DiscoveredCompilerExtensions } from "./extensions.js";
import { BUNWIRE_REGISTRY_MODULE_ID } from "./virtual-modules.js";
import { validateManagedMethodIdentities } from "./managed-method-validation.js";

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
  readonly declarationCode: string;
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

export function generatedImportSpecifier(
  declarationPath: string,
  modulePath: string,
  mode: "relative" | "vite",
): string {
  if (mode === "vite") {
    return `/@fs/${path.resolve(declarationPath).replaceAll("\\", "/")}`;
  }
  const withoutExtension = declarationPath.replace(/\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/i, "");
  const runtimePath = `${withoutExtension}${runtimeExtension(declarationPath)}`.replaceAll("\\", "/");
  let relative = path.relative(path.dirname(modulePath), runtimePath).replaceAll("\\", "/");
  if (!relative.startsWith(".")) {
    relative = `./${relative}`;
  }
  return relative;
}

function classSortKey(entry: AnalyzedManagedClass): string {
  return `${canonicalCompilerPath(entry.target.declaration.filePath)}\0${entry.target.exportName}`;
}

function sourceSortKey(entry: AnalyzedManagedClass): string {
  return `${canonicalCompilerPath(entry.location.filePath)}\0${String(entry.location.line).padStart(10, "0")}\0${String(entry.location.column).padStart(10, "0")}`;
}

function referenceKey(reference: CompilerRuntimeReference): string {
  return `${canonicalCompilerPath(reference.declaration.filePath)}\0${reference.exportName}`;
}

export function generateRuntimeRegistryModule(
  options: GenerateRuntimeRegistryModuleOptions,
): GeneratedRuntimeRegistryModule {
  validateManagedMethodIdentities(options.analysis, options.extensions);
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
      ?? generatedImportSpecifier(reference.declaration.filePath, options.modulePath, mode),
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

  const eventClasses = classes
    .filter((entry) => entry.kind === EVENT_KIND)
    .sort((left, right) => compareText(sourceSortKey(left), sourceSortKey(right)));
  const listenerClasses = classes
    .filter((entry) => entry.kind === LISTENER_KIND)
    .sort((left, right) => compareText(sourceSortKey(left), sourceSortKey(right)));
  const eventsByReference = new Map(eventClasses.map((entry) => [referenceKey(entry.target), entry]));
  const listenersByEvent = new Map<AnalyzedManagedClass, AnalyzedManagedClass[]>();
  for (const listener of listenerClasses) {
    if (!listener.listener) {
      throw new BunwireCompilerError(
        "REGISTRY_GENERATION_INVALID",
        `Listener "${listener.name}" is missing its compiled event relationship.`,
        { location: listener.location },
      );
    }
    const event = eventsByReference.get(referenceKey(listener.listener.event));
    if (!event) {
      throw new BunwireCompilerError(
        "REGISTRY_GENERATION_INVALID",
        `Listener "${listener.name}" references an event outside the canonical generated event registry.`,
        { location: listener.location },
      );
    }
    const related = listenersByEvent.get(event) ?? [];
    related.push(listener);
    listenersByEvent.set(event, related);
  }
  const listenerVariables = new Map<AnalyzedManagedClass, string>();
  const listenerDeclarations = listenerClasses.map((entry, index) => {
    const relationship = entry.listener as NonNullable<AnalyzedManagedClass["listener"]>;
    const variable = `__bunwire_listener_${index}`;
    listenerVariables.set(entry, variable);
    const dependencies = (entry.constructor?.dependencies ?? []).map((dependency) => (
      `{ index: ${dependency.index}, token: ${runtimeReference(dependency.token)} }`
    ));
    return `const ${variable} = defineListenerDefinition({ target: ${runtimeReference(entry.target)}, event: ${runtimeReference(relationship.event)}, dependencies: [${dependencies.join(", ")}] });`;
  });
  const eventVariables = new Map<AnalyzedManagedClass, string>();
  const eventDeclarations = eventClasses.map((entry, index) => {
    if (!entry.event) {
      throw new BunwireCompilerError(
        "REGISTRY_GENERATION_INVALID",
        `Event "${entry.name}" is missing compiled event metadata.`,
        { location: entry.location },
      );
    }
    const variable = `__bunwire_event_${index}`;
    eventVariables.set(entry, variable);
    const listeners = (listenersByEvent.get(entry) ?? [])
      .sort((left, right) => compareText(sourceSortKey(left), sourceSortKey(right)))
      .map((listener) => listenerVariables.get(listener) as string);
    const alias = entry.event.alias === undefined ? "" : `, alias: ${JSON.stringify(entry.event.alias)}`;
    return `const ${variable} = defineEventDefinition({ target: ${runtimeReference(entry.target)}${alias}, listeners: [${listeners.join(", ")}] });`;
  });

  const classRecords = classes.map((entry) => {
    if (entry.kind === EVENT_KIND) {
      return `    ${eventVariables.get(entry) as string}`;
    }
    if (entry.kind === LISTENER_KIND) {
      return `    ${listenerVariables.get(entry) as string}`;
    }
    const decorator = classDecoratorById.get(entry.decoratorId);
    if (!decorator) {
      throw new BunwireCompilerError(
        "REGISTRY_GENERATION_INVALID",
        `Managed class "${entry.name}" references unknown canonical decorator "${entry.decoratorId}".`,
        { location: entry.location },
      );
    }
    const target = runtimeReference(entry.target);
    if (entry.kind === MIDDLEWARE_KIND) {
      if (!entry.data || typeof entry.data !== "object"
        || (entry.data as { readonly scope?: unknown }).scope !== "transient") {
        throw new BunwireCompilerError(
          "REGISTRY_GENERATION_INVALID",
          `Managed middleware class "${entry.name}" must contain compiled transient middleware metadata.`,
          { location: entry.location },
        );
      }
      const dependencies = (entry.constructor?.dependencies ?? []).map((dependency) => (
        `{ index: ${dependency.index}, token: ${runtimeReference(dependency.token)} }`
      ));
      const { scope: _scope, ...data } = entry.data as MiddlewareClassMetadata;
      return `    defineMiddlewareDefinition({ target: ${target}, data: ${stableValue(data)}, dependencies: [${dependencies.join(", ")}] })`;
    }
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
    const middleware = method.middleware.map((middlewareEntry) => (
      `defineMiddlewareAttachment(${runtimeReference(middlewareEntry.target)}, ${stableValue(middlewareEntry.parameters)})`
    ));
    return `    defineManagedMethodPlan({ kind: ${methodDecoratorRuntime}.definition.kind, ownerKind: ${ownerDecoratorRuntime}.definition.kind, target: ${target}, method: ${JSON.stringify(method.name)}, data: ${stableValue(method.data)}, parameters: [${parameters.join(", ")}], middleware: [${middleware.join(", ")}] })`;
  }));
  methodRecords.push(...listenerClasses.map((entry) => (
    `    ${(listenerVariables.get(entry) as string)}.handle`
  )));

  const importLines = [...imports.values()]
    .sort((left, right) => compareText(
      `${left.moduleSpecifier}\0${left.exportName}`,
      `${right.moduleSpecifier}\0${right.exportName}`,
    ))
    .map(({ moduleSpecifier, exportName, localName }) => (
      `import { ${exportName} as ${localName} } from ${JSON.stringify(moduleSpecifier)};`
    ));
  const hasMiddlewareDefinitions = classes.some((entry) => entry.kind === MIDDLEWARE_KIND);
  const hasMiddlewareAttachments = classes.some((entry) => (
    entry.methods.some((method) => (
      method.middleware.some((item) => item.source === "attachment")
    ))
  ));
  const coreHelpers = [
    "createParameterResolverId",
    "defineManagedMethodPlan",
    ...(hasMiddlewareAttachments ? ["defineMiddlewareAttachment"] : []),
    ...(hasMiddlewareDefinitions ? ["defineMiddlewareDefinition"] : []),
    ...(eventClasses.length > 0 ? ["defineEventAlias", "defineEventDefinition"] : []),
    ...(listenerClasses.length > 0 ? ["defineListenerDefinition"] : []),
    "defineRuntimeRegistry",
  ];
  const body = [
    "// Generated by @bunwire/vite. Do not edit.",
    `import { ${coreHelpers.join(", ")} } from "@bunwire/core";`,
    ...importLines,
    "",
    ...listenerDeclarations,
    ...eventDeclarations,
    ...(listenerDeclarations.length > 0 || eventDeclarations.length > 0 ? [""] : []),
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
    "  events: [",
    ...eventClasses.map((entry) => `    ${eventVariables.get(entry) as string},`),
    "  ],",
    "  eventAliases: [",
    ...eventClasses
      .filter((entry) => entry.event?.alias !== undefined)
      .sort((left, right) => compareText(left.event?.alias ?? "", right.event?.alias ?? ""))
      .map((entry) => `    defineEventAlias(${JSON.stringify(entry.event?.alias)}, ${eventVariables.get(entry) as string}),`),
    "  ],",
    "});",
    "",
  ].join("\n");
  const hash = createHash("sha256").update(body).digest("hex");
  const code = `${body}export const BUNWIRE_REGISTRY_HASH = ${JSON.stringify(hash)};\nexport default applicationRegistry;\n`;
  const declarationCode = [
    `declare module ${JSON.stringify(BUNWIRE_REGISTRY_MODULE_ID)} {`,
    "  export const applicationRegistry: import(\"@bunwire/core\").RuntimeRegistry;",
    `  export const BUNWIRE_REGISTRY_HASH: ${JSON.stringify(hash)};`,
    "  export default applicationRegistry;",
    "}",
    "",
  ].join("\n");
  return Object.freeze({ id: BUNWIRE_REGISTRY_MODULE_ID, code, hash, declarationCode });
}
