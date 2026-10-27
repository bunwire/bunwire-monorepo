import path from "node:path";
import ts from "typescript";
import {
  CONTROLLER_KIND, EVENT_KIND, LISTENER_KIND, MIDDLEWARE_KIND, PROVIDER_KIND, SERVICE_KIND,
  type ProjectInspectionHandlerData,
} from "@bunwire/core";
import { applicationCallChain, collectImportBindings, unwrapBootstrapExpression } from "./bootstrap-discovery.js";
import type { AnalyzedManagedClass, CompilerRuntimeReference } from "./compiler-analysis.js";
import { BunwireCompilerError, type BunwireSourceLocation } from "./diagnostics.js";
import { analyzeBunwireApplication, type AnalyzeBunwireApplicationOptions, type AnalyzedBunwireApplication } from "./discovery.js";
import { canonicalCompilerPath } from "./path-identity.js";
import { isBunwirePathWithin } from "./watch-inputs.js";

export const BUNWIRE_INSPECTION_COMMANDS = Object.freeze([
  "routes:list", "events:list", "listeners:list", "jobs:list", "schedule:list",
  "providers:list", "controllers:list", "services:list", "middleware:list", "commands:list",
] as const);
export type BunwireInspectionCommand = typeof BUNWIRE_INSPECTION_COMMANDS[number];
export type BunwireInspectionDetail = string | number | boolean | null;
export interface BunwireInspectionLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}
export interface BunwireInspectionItem {
  readonly identity: string;
  readonly kindId: string;
  readonly name: string;
  readonly location: BunwireInspectionLocation | null;
  readonly details: Readonly<Record<string, BunwireInspectionDetail>>;
  readonly related: readonly string[];
}
export interface BunwireProjectInspection {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly items: Readonly<Record<BunwireInspectionCommand, readonly BunwireInspectionItem[]>>;
}

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const classCommands = new Map<string, BunwireInspectionCommand>([
  [CONTROLLER_KIND.id, "controllers:list"], [SERVICE_KIND.id, "services:list"],
  [PROVIDER_KIND.id, "providers:list"], [EVENT_KIND.id, "events:list"],
  [LISTENER_KIND.id, "listeners:list"], [MIDDLEWARE_KIND.id, "middleware:list"],
]);

function relativeFile(root: string, file: string): string {
  return path.relative(root, file).replaceAll("\\", "/") || ".";
}

function location(root: string, value: BunwireSourceLocation | undefined): BunwireInspectionLocation | null {
  return value ? Object.freeze({ file: relativeFile(root, value.filePath), line: value.line, column: value.column }) : null;
}

function referenceKey(reference: CompilerRuntimeReference): string {
  return `${canonicalCompilerPath(reference.declaration.filePath)}\0${reference.symbolName}`;
}

function classIdentity(root: string, kindId: string, reference: CompilerRuntimeReference): string {
  const external = !isBunwirePathWithin(root, reference.declaration.filePath);
  const owner = external && reference.moduleSpecifier ? reference.moduleSpecifier
    : relativeFile(root, reference.declaration.filePath);
  return `${kindId}:${owner}#${external ? reference.exportName : reference.symbolName}`;
}

function details(value: unknown, label: string): Readonly<Record<string, BunwireInspectionDetail>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BunwireCompilerError("INSPECTION_INVALID", `${label} must return a plain details object.`);
  }
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => compare(a, b));
  for (const [key, entry] of entries) {
    if (entry !== null && typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean") {
      throw new BunwireCompilerError("INSPECTION_INVALID", `${label} returned unsupported value for "${key}".`);
    }
    if (typeof entry === "number" && !Number.isFinite(entry)) {
      throw new BunwireCompilerError("INSPECTION_INVALID", `${label} returned a non-finite number for "${key}".`);
    }
  }
  return Object.freeze(Object.fromEntries(entries) as Record<string, BunwireInspectionDetail>);
}

function item(input: BunwireInspectionItem): BunwireInspectionItem {
  return Object.freeze({ ...input, details: details(input.details, `Inspection item "${input.identity}"`),
    related: Object.freeze([...input.related].sort(compare)) });
}

function sourceLocation(node: ts.Node): BunwireSourceLocation {
  const file = node.getSourceFile();
  const start = file.getLineAndCharacterOfPosition(node.getStart(file));
  const end = file.getLineAndCharacterOfPosition(node.getEnd());
  return Object.freeze({ filePath: path.resolve(file.fileName), line: start.line + 1, column: start.character + 1,
    endLine: end.line + 1, endColumn: end.character + 1 });
}

/** Explicit Provider references that the bootstrap's direct Application chain establishes statically. */
function explicitProviders(application: AnalyzedBunwireApplication): readonly BunwireInspectionItem[] {
  const { program, checker } = application.analysis.context;
  const source = program.getSourceFile(application.config.bootstrap);
  if (!source) return [];
  const exported = source.statements.find((entry): entry is ts.ExportAssignment => ts.isExportAssignment(entry) && !entry.isExportEquals);
  if (!exported) return [];
  const calls = applicationCallChain(exported.expression, collectImportBindings(source), application.config.bootstrap);
  const providers: BunwireInspectionItem[] = [];
  for (const call of calls) {
    const expression = unwrapBootstrapExpression(call.expression);
    if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== "withProviders") continue;
    for (const argument of call.arguments) {
      const symbol = checker.getSymbolAtLocation(argument);
      const resolved = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
      const declaration = resolved?.declarations?.find(ts.isClassDeclaration);
      if (!declaration || !resolved) continue;
      const kindId = PROVIDER_KIND.id;
      const name = declaration.name?.text ?? resolved.name;
      providers.push(item({ identity: `${kindId}:${relativeFile(application.config.root, declaration.getSourceFile().fileName)}#${name}`,
        kindId, name, location: location(application.config.root, sourceLocation(declaration)),
        details: { registration: "explicit" }, related: [] }));
    }
  }
  return providers;
}

/** Static project graph for CLI inspection. No application module or Provider lifecycle executes. */
export function inspectBunwireApplicationFromAnalysis(application: AnalyzedBunwireApplication): BunwireProjectInspection {
  const root = application.config.root;
  const items = Object.fromEntries(BUNWIRE_INSPECTION_COMMANDS.map((command) => [command, [] as BunwireInspectionItem[]])) as
    Record<BunwireInspectionCommand, BunwireInspectionItem[]>;
  const classDescriptions = new Map<string, NonNullable<ProjectInspectionHandlerData["classes"]>[number]>();
  const methodDescriptions = new Map<string, NonNullable<ProjectInspectionHandlerData["methods"]>[number]>();
  const deliveryByAttachment = new Map<string, string>();
  const classKinds = new Set(application.extensions.classKinds.map((entry) => entry.id));
  const methodKinds = new Set(application.extensions.methodKinds.map((entry) => entry.id));
  const attachmentIds = new Set((application.extensions.classAttachments ?? []).map((entry) => entry.id));
  for (const handler of application.extensions.metadataHandlers) {
    const data = handler.data as Partial<ProjectInspectionHandlerData> | undefined;
    if (data?.type !== "bunwire.project-inspection") continue;
    if ((data.classes !== undefined && !Array.isArray(data.classes))
      || (data.methods !== undefined && !Array.isArray(data.methods))
      || (data.listenerAttachments !== undefined && !Array.isArray(data.listenerAttachments))) {
      throw new BunwireCompilerError("INSPECTION_INVALID", `Inspection descriptor "${handler.id}" has malformed entries.`);
    }
    for (const descriptor of data.classes ?? []) {
      if (!classKinds.has(descriptor.kindId) || !["jobs:list", "commands:list", "controllers:list", "services:list", "providers:list", "middleware:list"].includes(descriptor.command)
        || typeof descriptor.describe !== "function") {
        throw new BunwireCompilerError("INSPECTION_INVALID", `Inspection descriptor "${handler.id}" has an invalid class mapping.`);
      }
      if (classDescriptions.has(descriptor.kindId)) throw new BunwireCompilerError("INSPECTION_INVALID", `Duplicate class inspection descriptor for "${descriptor.kindId}".`);
      classDescriptions.set(descriptor.kindId, descriptor);
    }
    for (const descriptor of data.methods ?? []) {
      if (!methodKinds.has(descriptor.kindId) || descriptor.command !== "routes:list" || typeof descriptor.describe !== "function") {
        throw new BunwireCompilerError("INSPECTION_INVALID", `Inspection descriptor "${handler.id}" has an invalid method mapping.`);
      }
      if (methodDescriptions.has(descriptor.kindId)) throw new BunwireCompilerError("INSPECTION_INVALID", `Duplicate method inspection descriptor for "${descriptor.kindId}".`);
      methodDescriptions.set(descriptor.kindId, descriptor);
    }
    for (const descriptor of data.listenerAttachments ?? []) {
      if (!attachmentIds.has(descriptor.definitionId) || typeof descriptor.delivery !== "string" || !descriptor.delivery.trim()) {
        throw new BunwireCompilerError("INSPECTION_INVALID", `Inspection descriptor "${handler.id}" has an invalid listener attachment mapping.`);
      }
      if (deliveryByAttachment.has(descriptor.definitionId)) throw new BunwireCompilerError("INSPECTION_INVALID", `Duplicate listener inspection attachment "${descriptor.definitionId}".`);
      deliveryByAttachment.set(descriptor.definitionId, descriptor.delivery);
    }
  }
  const classes = application.analysis.classes;
  const classByReference = new Map(classes.map((entry) => [referenceKey(entry.target), entry]));
  const middlewareUses = new Map<string, string[]>();
  const recordMiddlewareUse = (target: CompilerRuntimeReference, owner: string): void => {
    const key = referenceKey(target);
    middlewareUses.set(key, [...(middlewareUses.get(key) ?? []), owner]);
  };
  for (const owner of classes) {
    const ownerIdentity = classIdentity(root, owner.kind.id, owner.target);
    for (const attachment of owner.middleware) recordMiddlewareUse(attachment.target, ownerIdentity);
    for (const method of owner.methods) {
      for (const attachment of method.middleware) {
        recordMiddlewareUse(attachment.target, `${ownerIdentity}::${method.kind.id}:${method.name}`);
      }
    }
  }
  const eventByReference = new Map(classes.filter((entry) => entry.kind.id === EVENT_KIND.id)
    .map((entry) => [referenceKey(entry.target), entry]));
  const listenersByEvent = new Map<AnalyzedManagedClass, AnalyzedManagedClass[]>();
  for (const entry of classes) {
    if (!entry.listener) continue;
    const event = eventByReference.get(referenceKey(entry.listener.event));
    if (event) listenersByEvent.set(event, [...(listenersByEvent.get(event) ?? []), entry]);
  }
  for (const entry of classes) {
    const kindId = entry.kind.id;
    const command = classCommands.get(kindId) ?? classDescriptions.get(kindId)?.command;
    if (command) {
      const description = classDescriptions.get(kindId);
      let compiled: Readonly<Record<string, BunwireInspectionDetail>> = {};
      if (description) {
        try { compiled = details(description.describe({ name: entry.name, data: entry.data }), `Class descriptor "${kindId}"`); }
        catch (cause) { throw new BunwireCompilerError("INSPECTION_INVALID", `Cannot describe managed class "${entry.name}": ${cause instanceof Error ? cause.message : String(cause)}`, { location: entry.location, cause }); }
      }
      if (kindId === EVENT_KIND.id) compiled = { ...compiled, ...(entry.event?.alias ? { alias: entry.event.alias } : {}) };
      if (kindId === MIDDLEWARE_KIND.id) {
        const metadata = entry.data as { readonly alias?: string } | undefined;
        compiled = { ...compiled, ...(metadata?.alias ? { alias: metadata.alias } : {}) };
      }
      const related = kindId === EVENT_KIND.id ? (listenersByEvent.get(entry) ?? [])
        .map((listener) => classIdentity(root, listener.kind.id, listener.target))
        : kindId === LISTENER_KIND.id && entry.listener ? [classIdentity(root, EVENT_KIND.id, entry.listener.event)]
        : kindId === MIDDLEWARE_KIND.id ? (middlewareUses.get(referenceKey(entry.target)) ?? []) : [];
      if (kindId === LISTENER_KIND.id) {
        const attachment = entry.attachments?.find((candidate) => deliveryByAttachment.has(candidate.definition.id));
        const delivery = attachment ? deliveryByAttachment.get(attachment.definition.id)! : "direct";
        const event = entry.listener && eventByReference.get(referenceKey(entry.listener.event));
        compiled = { ...compiled, delivery, ...(event ? { event: event.event?.alias ?? event.name } : {}) };
        if (attachment?.data && typeof attachment.data === "object") {
          const queue = attachment.data as { readonly id?: string; readonly queue?: string };
          compiled = { ...compiled, ...(queue.id ? { id: queue.id } : {}), ...(queue.queue ? { queue: queue.queue } : {}) };
        }
      }
      items[command].push(item({ identity: classIdentity(root, kindId, entry.target), kindId, name: entry.name,
        location: location(root, entry.location), details: compiled, related }));
    }
    for (const method of entry.methods) {
      const descriptor = methodDescriptions.get(method.kind.id);
      if (!descriptor) continue;
      let compiled: Readonly<Record<string, BunwireInspectionDetail>>;
      try {
        compiled = details(descriptor.describe({ ownerKindId: kindId, ownerData: entry.data,
          methodData: method.data, methodName: method.name,
          transportParameterCount: method.parameters.filter((parameter) => parameter.source === "transport").length }),
        `Method descriptor "${method.kind.id}"`);
      } catch (cause) {
        throw new BunwireCompilerError("INSPECTION_INVALID", `Cannot describe managed method "${entry.name}.${method.name}": ${cause instanceof Error ? cause.message : String(cause)}`,
          { location: method.location, cause });
      }
      items[descriptor.command].push(item({ identity: `${classIdentity(root, kindId, entry.target)}::${method.kind.id}:${method.name}`,
        kindId: method.kind.id, name: `${entry.name}.${method.name}`, location: location(root, method.location),
        details: compiled, related: [classIdentity(root, kindId, entry.target)] }));
    }
  }
  for (const entry of application.analysis.schedules) {
    const target = classByReference.get(referenceKey(entry.target));
    items["schedule:list"].push(item({ identity: `schedule:${entry.id}`, kindId: "core.schedule", name: entry.id,
      location: location(root, entry.target.declaration), details: {
        id: entry.id, cron: entry.cron, execution: entry.execution, overlap: entry.overlap,
        ...(entry.timezone ? { timezone: entry.timezone } : {}),
        ...(entry.lockFor !== undefined ? { lockFor: entry.lockFor } : {}),
      }, related: target ? [classIdentity(root, target.kind.id, target.target)] : [] }));
  }
  const existingProviders = new Set(items["providers:list"].map((entry) => entry.identity));
  for (const provider of explicitProviders(application)) {
    if (!existingProviders.has(provider.identity)) { items["providers:list"].push(provider); existingProviders.add(provider.identity); }
  }
  for (const command of BUNWIRE_INSPECTION_COMMANDS) items[command].sort((a, b) => compare(a.identity, b.identity));
  return Object.freeze({ schemaVersion: 1, root, items: Object.freeze(Object.fromEntries(BUNWIRE_INSPECTION_COMMANDS.map((command) =>
    [command, Object.freeze(items[command])])) as Readonly<Record<BunwireInspectionCommand, readonly BunwireInspectionItem[]>>) });
}

export async function inspectBunwireApplication(options: AnalyzeBunwireApplicationOptions = {}): Promise<BunwireProjectInspection> {
  return inspectBunwireApplicationFromAnalysis(await analyzeBunwireApplication(options));
}
