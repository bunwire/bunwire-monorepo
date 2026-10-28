import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { analyzeBunwireApplication, loadBunwireConfig, resolveBunwireEventExport, isBunwirePathWithin } from "@bunwire/vite/compiler";

export const MAKE_COMMANDS = Object.freeze([
  "make:controller", "make:service", "make:provider", "make:middleware", "make:event", "make:listener",
] as const);
export type MakeCommand = typeof MAKE_COMMANDS[number];

export interface MakeSourceOptions {
  readonly root: string;
  readonly source?: string;
  readonly event?: string;
  readonly alias?: string;
}

const folders: Record<MakeCommand, string> = {
  "make:controller": "controllers", "make:service": "services", "make:provider": "providers",
  "make:middleware": "middleware", "make:event": "events", "make:listener": "listeners",
};

function kebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
}

function importPath(fromDirectory: string, target: string): string {
  const relative = path.relative(fromDirectory, target).replaceAll("\\", "/");
  const extension = path.extname(relative);
  if (![".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    throw new Error("Event source must have a supported TypeScript or JavaScript extension.");
  }
  const outputExtension = extension === ".mts" ? ".mjs" : extension === ".cts" ? ".cjs" : ".js";
  const specifier = `${relative.slice(0, -extension.length)}${outputExtension}`;
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function template(command: MakeCommand, name: string, alias: string | undefined, eventImport: string | undefined): string {
  switch (command) {
    case "make:controller": return `import { Controller } from "@bunwire/core";\n\n@Controller()\nexport class ${name} {\n  // Add adapter-defined managed methods to expose endpoints.\n}\n`;
    case "make:service": return `import { Service } from "@bunwire/core";\n\n@Service()\nexport class ${name} {\n  // Add application behavior here.\n}\n`;
    case "make:provider": return `import { Provider, type Container, type InvocationContext } from "@bunwire/core";\n\n@Provider()\nexport class ${name} {\n  register(container: Container): void {\n    // Create application-scope bindings here; called once during app.start().\n    void container;\n  }\n\n  boot(context: InvocationContext): void {\n    // Create invocation-scope bindings here when needed.\n    void context;\n  }\n}\n`;
    case "make:middleware": return `import { Middleware, type MiddlewareNext } from "@bunwire/core";\n\n@Middleware()\nexport class ${name} implements Middleware {\n${alias === undefined ? "" : `  protected alias = ${JSON.stringify(alias)};\n\n`}  async handle(_context: unknown, next: MiddlewareNext): Promise<unknown> {\n    return next();\n  }\n}\n`;
    case "make:event": return `import { Event } from "@bunwire/core";\n\n@Event()\nexport class ${name} {\n  // Add occurrence data through constructor parameters when needed.\n}\n`;
    case "make:listener": return `import { Listener } from "@bunwire/core";\n${eventImport}\n\n@Listener(__BunwireEvent)\nexport class ${name} {\n  handle(event: __BunwireEvent): void {\n    // Add event reaction behavior here.\n    void event;\n  }\n}\n`;
  }
}

async function ensureContainedDirectory(sourceRoot: string, folder: string): Promise<string> {
  const directory = path.join(sourceRoot, folder);
  await mkdir(directory, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const canonical = await realpath(directory);
  if ((await lstat(directory)).isSymbolicLink() || !isBunwirePathWithin(sourceRoot, canonical)) {
    throw new Error(`Destination directory "${directory}" resolves outside the selected source root.`);
  }
  return canonical;
}

export async function makeSource(command: MakeCommand, name: string, options: MakeSourceOptions): Promise<string> {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    throw new Error("Class name must be a PascalCase TypeScript identifier without path segments.");
  }
  if (options.event !== undefined && command !== "make:listener") throw new Error("--event is available only for make:listener.");
  if (options.alias !== undefined && command !== "make:middleware") throw new Error("--alias is available only for make:middleware.");
  if (command === "make:listener" && !options.event) throw new Error("make:listener requires --event project-relative-file#ExportName.");
  if (options.alias !== undefined && (!options.alias.trim() || options.alias !== options.alias.trim() || /[:,\\]/.test(options.alias))) {
    throw new Error("--alias must be a non-empty middleware reference name without ':' or ','.");
  }

  const config = await loadBunwireConfig({ root: options.root });
  let sourceRoot: string;
  if (options.source === undefined) {
    if (config.sourceRoots.length !== 1) throw new Error("This project has multiple source roots; select one with --source path.");
    sourceRoot = config.sourceRoots[0]!;
  } else {
    if (path.isAbsolute(options.source) || !options.source.trim() || options.source.split(/[\\/]/).includes("..")) {
      throw new Error("--source must be a project-relative configured source root without parent traversal.");
    }
    const requested = path.resolve(config.root, options.source);
    const canonical = await realpath(requested).catch(() => "");
    sourceRoot = config.sourceRoots.find((entry) => entry === canonical) ?? "";
    if (!sourceRoot) throw new Error(`--source "${options.source}" is not a configured source root.`);
  }

  const folder = folders[command];
  const destination = path.join(sourceRoot, folder, `${kebabCase(name)}.ts`);
  if (!isBunwirePathWithin(sourceRoot, destination)) throw new Error("Destination must remain inside the selected source root.");
  let eventImport: string | undefined;
  if (command === "make:listener") {
    const event = await resolveBunwireEventExport(config.root, options.event!);
    eventImport = `import { ${event.exportName} as __BunwireEvent } from ${JSON.stringify(importPath(path.dirname(destination), event.filePath))};`;
  }
  if (command === "make:middleware" && options.alias !== undefined) {
    const application = await analyzeBunwireApplication({ root: config.root });
    const owned = application.analysis.classes.some((entry) =>
      entry.kind.id === "core.middleware" && (entry.data as { readonly alias?: string }).alias === options.alias,
    );
    const external = application.extensions.middlewareDefinitions.some((entry) => entry.data.alias === options.alias);
    if (owned || external) throw new Error(`Middleware alias "${options.alias}" is already defined in this project.`);
  }
  const content = template(command, name, options.alias, eventImport);
  const directory = await ensureContainedDirectory(sourceRoot, folder);
  const finalPath = path.join(directory, `${kebabCase(name)}.ts`);
  const handle = await open(finalPath, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error(`Destination already exists: ${finalPath}`);
    throw error;
  });
  let writeError: unknown;
  try { await handle.writeFile(content, "utf8"); }
  catch (error) { writeError = error; }
  finally { await handle.close(); }
  if (writeError) {
    await unlink(finalPath).catch(() => undefined);
    throw writeError;
  }
  return finalPath;
}
