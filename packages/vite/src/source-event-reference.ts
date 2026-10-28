import { realpath } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { EVENT_KIND } from "@bunwire/core";
import { analyzeBunwireApplication } from "./discovery.js";
import { BunwireCompilerError } from "./diagnostics.js";
import { canonicalCompilerPath } from "./path-identity.js";
import { isBunwirePathWithin } from "./watch-inputs.js";

export interface BunwireEventExport {
  readonly filePath: string;
  readonly exportName: string;
  readonly className: string;
}

/** Resolve an explicit file export to an exact compiler-discovered Core Event. */
export async function resolveBunwireEventExport(root: string, reference: string): Promise<BunwireEventExport> {
  const separator = reference.lastIndexOf("#");
  const file = reference.slice(0, separator);
  const exportName = reference.slice(separator + 1);
  if (separator <= 0 || !file || !/^[A-Za-z_$][\w$]*$/.test(exportName) || path.isAbsolute(file) || file.split(/[\\/]/).includes("..")) {
    throw new BunwireCompilerError("LISTENER_EVENT_INVALID", "--event must be a project-relative source file followed by #ExportName.");
  }
  const application = await analyzeBunwireApplication({ root });
  const candidate = path.resolve(application.config.root, file);
  if (!isBunwirePathWithin(application.config.root, candidate)) {
    throw new BunwireCompilerError("LISTENER_EVENT_INVALID", "--event file must remain inside the selected project root.");
  }
  let filePath: string;
  try {
    filePath = await realpath(candidate);
  } catch (cause) {
    throw new BunwireCompilerError("LISTENER_EVENT_INVALID", `Event source file "${file}" does not exist.`, { cause });
  }
  if (!application.config.sourceRoots.some((sourceRoot) => isBunwirePathWithin(sourceRoot, filePath))) {
    throw new BunwireCompilerError("LISTENER_EVENT_INVALID", "--event file must be inside a configured source root.");
  }
  const { program, checker } = application.analysis.context;
  const source = program.getSourceFile(filePath);
  if (!source) throw new BunwireCompilerError("LISTENER_EVENT_INVALID", `Event source file "${file}" is not in the Bunwire TypeScript program.`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const exported = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((entry) => entry.getName() === exportName);
  if (!exported) throw new BunwireCompilerError("LISTENER_EVENT_INVALID", `"${exportName}" is not exported from "${file}".`);
  const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
  const declaration = target.declarations?.find((entry): entry is ts.ClassDeclaration => ts.isClassDeclaration(entry) && !!entry.name);
  const event = declaration && application.analysis.classes.find((entry) =>
    entry.kind.id === EVENT_KIND.id
    && canonicalCompilerPath(entry.target.declaration.filePath) === canonicalCompilerPath(declaration.getSourceFile().fileName)
    && entry.target.symbolName === declaration.name?.text,
  );
  if (!event || !declaration?.name) {
    throw new BunwireCompilerError("LISTENER_EVENT_INVALID", `"${file}#${exportName}" does not resolve to a canonical Core @Event() class.`);
  }
  return Object.freeze({ filePath, exportName, className: declaration.name.text });
}
