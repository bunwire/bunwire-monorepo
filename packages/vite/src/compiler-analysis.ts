import path from "node:path";
import {
  Inject,
  INJECT_DECORATOR_ID,
  type CompilerSymbolReference,
  type ManagedClassKind,
  type ManagedMethodKind,
  type ParameterResolverId,
} from "@bunwire/core";
import ts from "typescript";
import type { DiscoveredCompilerExtensions } from "./extensions.js";
import {
  BunwireCompilerError,
  type BunwireSourceLocation,
} from "./diagnostics.js";

export interface BunwireProgramOptions {
  readonly sourceFiles: readonly string[];
  readonly projectRoot: string;
  readonly tsconfigPath?: string;
  readonly compilerOptions?: ts.CompilerOptions;
}

export interface BunwireAnalysisOptions extends BunwireProgramOptions {
  readonly extensions: DiscoveredCompilerExtensions;
}

export interface BunwireProgramContext {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly sourceFiles: readonly ts.SourceFile[];
}

export interface CompilerRuntimeReference {
  readonly expression: string;
  readonly symbolName: string;
  readonly exportName: string;
  readonly moduleSpecifier: string | undefined;
  readonly location: BunwireSourceLocation;
  readonly declaration: BunwireSourceLocation;
}

export interface AnalyzedConstructorDependency {
  readonly index: number;
  readonly source: "container";
  readonly token: CompilerRuntimeReference;
  readonly explicit: boolean;
  readonly optional: boolean;
}

export interface AnalyzedConstructorPlan {
  readonly parameterCount: number;
  readonly dependencies: readonly AnalyzedConstructorDependency[];
}

export interface AnalyzedTransportParameter {
  readonly source: "transport";
  readonly methodIndex: number;
  readonly argumentIndex: number;
  readonly optional: boolean;
  readonly rest: boolean;
  readonly location: BunwireSourceLocation;
}

export interface AnalyzedContainerParameter {
  readonly source: "container";
  readonly methodIndex: number;
  readonly token: CompilerRuntimeReference;
  readonly explicit: boolean;
  readonly location: BunwireSourceLocation;
}

export interface AnalyzedResolverParameter {
  readonly source: "resolver";
  readonly methodIndex: number;
  readonly resolverId: ParameterResolverId;
  readonly injectorId: string;
  readonly data: unknown;
  readonly location: BunwireSourceLocation;
}

export type AnalyzedMethodParameter =
  | AnalyzedTransportParameter
  | AnalyzedContainerParameter
  | AnalyzedResolverParameter;

export interface AnalyzedManagedMethod {
  readonly name: string;
  readonly kind: ManagedMethodKind;
  readonly decoratorId: string;
  readonly data: unknown;
  readonly location: BunwireSourceLocation;
  readonly parameters: readonly AnalyzedMethodParameter[];
  readonly minimumCallerArguments: number;
  readonly maximumCallerArguments: number | null;
}

export interface AnalyzedManagedClass {
  readonly name: string;
  readonly kind: ManagedClassKind;
  readonly decoratorId: string;
  readonly data: unknown;
  readonly target: CompilerRuntimeReference;
  readonly location: BunwireSourceLocation;
  readonly constructor: AnalyzedConstructorPlan | undefined;
  readonly methods: readonly AnalyzedManagedMethod[];
}

export interface BunwireCompilerAnalysis {
  readonly context: BunwireProgramContext;
  readonly classes: readonly AnalyzedManagedClass[];
}

interface DecoratorMatch<Definition> {
  readonly decorator: ts.Decorator;
  readonly call: ts.CallExpression;
  readonly symbol: ts.Symbol;
  readonly id: string;
  readonly definition: Definition;
}

interface CompilerDefinition {
  readonly id: string;
  readonly compilerSymbol: CompilerSymbolReference;
}

interface ResolvedCompilerDefinitions<Definition extends CompilerDefinition> {
  readonly byId: ReadonlyMap<string, Definition>;
  readonly bySymbol: ReadonlyMap<ts.Symbol, Definition>;
}

interface ResolvedRuntimeToken {
  readonly reference: CompilerRuntimeReference;
  readonly symbol: ts.Symbol;
}

interface ConstructorDependencyEdge {
  readonly target: ts.Symbol;
  readonly location: ts.Node;
}

interface ConstructorAnalysisResult {
  readonly plan: AnalyzedConstructorPlan;
  readonly edges: readonly ConstructorDependencyEdge[];
}

function stablePath(filePath: string): string {
  return path.resolve(filePath).replaceAll("\\", "/").toLowerCase();
}

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

function fail(
  code: BunwireCompilerError["code"],
  message: string,
  node: ts.Node,
): never {
  throw new BunwireCompilerError(code, message, { location: locationOf(node) });
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

function canonicalSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  let current = symbol;
  const seen = new Set<ts.Symbol>();
  while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
    seen.add(current);
    current = checker.getAliasedSymbol(current);
  }
  return current;
}

function resolveModuleExportSymbol(
  context: BunwireProgramContext,
  projectRoot: string,
  reference: CompilerSymbolReference,
  label: string,
): ts.Symbol {
  const containingFile = path.join(projectRoot, "__bunwire_compiler__.ts");
  const resolved = ts.resolveModuleName(
    reference.moduleSpecifier,
    containingFile,
    context.program.getCompilerOptions(),
    ts.sys,
  ).resolvedModule;
  if (!resolved) {
    throw new BunwireCompilerError(
      "COMPILER_SYMBOL_INVALID",
      `${label} compiler symbol module "${reference.moduleSpecifier}" cannot be resolved from "${projectRoot}".`,
    );
  }
  const sourceFile = context.program.getSourceFile(resolved.resolvedFileName)
    ?? context.program.getSourceFiles().find((candidate) => (
      stablePath(candidate.fileName) === stablePath(resolved.resolvedFileName)
    ));
  const moduleSymbol = sourceFile ? context.checker.getSymbolAtLocation(sourceFile) : undefined;
  if (!sourceFile || !moduleSymbol) {
    throw new BunwireCompilerError(
      "COMPILER_SYMBOL_INVALID",
      `${label} compiler symbol module "${reference.moduleSpecifier}" is not part of the TypeScript Program.`,
    );
  }
  const exported = context.checker.getExportsOfModule(moduleSymbol)
    .find((candidate) => candidate.name === reference.exportName);
  if (!exported) {
    throw new BunwireCompilerError(
      "COMPILER_SYMBOL_INVALID",
      `${label} compiler symbol module "${reference.moduleSpecifier}" does not export "${reference.exportName}".`,
    );
  }
  return canonicalSymbol(context.checker, exported);
}

function resolveCompilerDefinitions<Definition extends CompilerDefinition>(
  context: BunwireProgramContext,
  projectRoot: string,
  definitions: readonly Definition[],
  label: string,
  occupiedSymbols: Map<ts.Symbol, CompilerDefinition>,
): ResolvedCompilerDefinitions<Definition> {
  const byId = new Map<string, Definition>();
  const bySymbol = new Map<ts.Symbol, Definition>();
  for (const definition of definitions) {
    const symbol = resolveModuleExportSymbol(
      context,
      projectRoot,
      definition.compilerSymbol,
      `${label} "${definition.id}"`,
    );
    const existing = occupiedSymbols.get(symbol);
    if (existing && existing !== definition) {
      throw new BunwireCompilerError(
        "COMPILER_SYMBOL_INVALID",
        `Canonical compiler symbol "${definition.compilerSymbol.moduleSpecifier}" export "${definition.compilerSymbol.exportName}" is assigned to both "${existing.id}" and "${definition.id}".`,
      );
    }
    occupiedSymbols.set(symbol, definition);
    byId.set(definition.id, definition);
    bySymbol.set(symbol, definition);
  }
  return { byId, bySymbol };
}

function symbolAtExpression(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): ts.Symbol | undefined {
  const target = unwrapExpression(expression);
  const symbolNode = ts.isPropertyAccessExpression(target) ? target.name : target;
  const symbol = checker.getSymbolAtLocation(symbolNode);
  return symbol ? canonicalSymbol(checker, symbol) : undefined;
}

function stringLiteralProperty(
  checker: ts.TypeChecker,
  type: ts.Type,
  propertyName: string,
  location: ts.Node,
): string | undefined {
  const property = checker.getPropertyOfType(type, propertyName);
  if (!property) {
    return undefined;
  }
  const propertyType = checker.getTypeOfSymbolAtLocation(property, location);
  if (propertyType.isStringLiteral()) {
    return propertyType.value;
  }
  if (propertyType.isIntersection()) {
    return propertyType.types.find((part): part is ts.StringLiteralType => part.isStringLiteral())?.value;
  }
  return undefined;
}

function decoratorIdentity(
  checker: ts.TypeChecker,
  call: ts.CallExpression,
  symbol: ts.Symbol,
): string | undefined {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration ?? call.expression);
  const definition = checker.getPropertyOfType(type, "definition");
  if (!definition) {
    return undefined;
  }
  const definitionType = checker.getTypeOfSymbolAtLocation(definition, declaration ?? call.expression);
  return stringLiteralProperty(checker, definitionType, "id", declaration ?? call.expression);
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function matchDecorators<Definition extends CompilerDefinition>(
  node: ts.Node,
  checker: ts.TypeChecker,
  definitions: ResolvedCompilerDefinitions<Definition>,
): readonly DecoratorMatch<Definition>[] {
  const matches: DecoratorMatch<Definition>[] = [];
  for (const decorator of decoratorsOf(node)) {
    const expression = unwrapExpression(decorator.expression);
    if (!ts.isCallExpression(expression)) {
      continue;
    }
    const symbol = symbolAtExpression(checker, expression.expression);
    if (!symbol) {
      continue;
    }
    const definition = definitions.bySymbol.get(symbol);
    if (definition) {
      matches.push({ decorator, call: expression, symbol, id: definition.id, definition });
      continue;
    }
    const claimedId = decoratorIdentity(checker, expression, symbol);
    if (claimedId && definitions.byId.has(claimedId)) {
      fail(
        "DECORATOR_IDENTITY_CONFLICT",
        `Decorator symbol "${checker.symbolToString(symbol)}" claims registered ID "${claimedId}" but is not the canonical registered export.`,
        decorator,
      );
    }
  }
  return matches;
}

function explicitInjectDecorators(
  node: ts.Node,
  checker: ts.TypeChecker,
  definitions: ResolvedCompilerDefinitions<typeof Inject.definition>,
): readonly Omit<DecoratorMatch<never>, "definition">[] {
  const matches: Omit<DecoratorMatch<never>, "definition">[] = [];
  for (const decorator of decoratorsOf(node)) {
    const expression = unwrapExpression(decorator.expression);
    if (!ts.isCallExpression(expression)) {
      continue;
    }
    const symbol = symbolAtExpression(checker, expression.expression);
    if (!symbol) {
      continue;
    }
    if (definitions.bySymbol.has(symbol)) {
      matches.push({ decorator, call: expression, symbol, id: INJECT_DECORATOR_ID });
      continue;
    }
    const claimedId = decoratorIdentity(checker, expression, symbol);
    if (claimedId === INJECT_DECORATOR_ID) {
      fail(
        "DECORATOR_IDENTITY_CONFLICT",
        `Decorator symbol "${checker.symbolToString(symbol)}" claims registered ID "${INJECT_DECORATOR_ID}" but is not the canonical @Inject export.`,
        decorator,
      );
    }
  }
  return matches;
}

function evaluateDecoratorValue(expression: ts.Expression): unknown {
  const value = unwrapExpression(expression);
  if (ts.isStringLiteralLike(value)) {
    return value.text;
  }
  if (ts.isNumericLiteral(value)) {
    return Number(value.text);
  }
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (value.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (value.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (ts.isIdentifier(value) && value.text === "undefined") {
    return undefined;
  }
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.map((element) => evaluateDecoratorValue(element));
  }
  if (ts.isObjectLiteralExpression(value)) {
    const result: Record<string, unknown> = {};
    for (const property of value.properties) {
      if (!ts.isPropertyAssignment(property)
        || (!ts.isIdentifier(property.name) && !ts.isStringLiteralLike(property.name))) {
        fail(
          "DECORATOR_ARGUMENT_INVALID",
          "Decorator metadata objects must use explicit identifier or string-literal properties.",
          property,
        );
      }
      result[property.name.text] = evaluateDecoratorValue(property.initializer);
    }
    return Object.freeze(result);
  }
  return fail(
    "DECORATOR_ARGUMENT_INVALID",
    `Decorator argument "${value.getText()}" is not a deterministic literal value.`,
    value,
  );
}

function decoratorData(
  match: DecoratorMatch<{ readonly createMetadata: (options: any) => unknown }>,
): unknown {
  if (match.call.arguments.length > 1) {
    fail(
      "DECORATOR_ARGUMENT_INVALID",
      `Decorator "${match.id}" accepts one compiler metadata options value.`,
      match.decorator,
    );
  }
  const argument = match.call.arguments[0];
  try {
    return match.definition.createMetadata(argument ? evaluateDecoratorValue(argument) : undefined);
  } catch (cause) {
    throw new BunwireCompilerError(
      "DECORATOR_ARGUMENT_INVALID",
      `Decorator "${match.id}" metadata could not be compiled: ${cause instanceof Error ? cause.message : String(cause)}`,
      { location: locationOf(match.decorator), cause },
    );
  }
}

function readCompilerOptions(options: BunwireProgramOptions): ts.CompilerOptions {
  const configuredPath = options.tsconfigPath
    ?? ts.findConfigFile(options.projectRoot, ts.sys.fileExists, "tsconfig.json");
  let configured: ts.CompilerOptions = {};
  if (configuredPath) {
    const loaded = ts.readConfigFile(configuredPath, ts.sys.readFile);
    if (loaded.error) {
      throw new BunwireCompilerError(
        "TYPESCRIPT_PROGRAM_ERROR",
        `Unable to read TypeScript config "${configuredPath}": ${ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n")}`,
        { filePath: configuredPath },
      );
    }
    const parsed = ts.parseJsonConfigFileContent(
      loaded.config,
      ts.sys,
      path.dirname(configuredPath),
      undefined,
      configuredPath,
    );
    const error = parsed.errors[0];
    if (error) {
      throw new BunwireCompilerError(
        "TYPESCRIPT_PROGRAM_ERROR",
        `Unable to parse TypeScript config "${configuredPath}": ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`,
        { filePath: configuredPath },
      );
    }
    configured = parsed.options;
  }
  return {
    ...configured,
    ...options.compilerOptions,
    experimentalDecorators: true,
    noEmit: true,
  };
}

function createBunwireProgramInternal(
  options: BunwireProgramOptions,
  additionalRootNames: readonly string[] = [],
): BunwireProgramContext {
  const program = ts.createProgram({
    rootNames: [...new Set([...options.sourceFiles, ...additionalRootNames])],
    options: readCompilerOptions(options),
  });
  const diagnostic = [
    ...program.getOptionsDiagnostics(),
    ...program.getSyntacticDiagnostics(),
  ][0];
  if (diagnostic) {
    let location: BunwireSourceLocation | undefined;
    if (diagnostic.file && diagnostic.start !== undefined) {
      const start = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      const endPosition = diagnostic.start + (diagnostic.length ?? 0);
      const end = diagnostic.file.getLineAndCharacterOfPosition(endPosition);
      location = Object.freeze({
        filePath: path.resolve(diagnostic.file.fileName),
        line: start.line + 1,
        column: start.character + 1,
        endLine: end.line + 1,
        endColumn: end.character + 1,
      });
    }
    throw new BunwireCompilerError(
      "TYPESCRIPT_PROGRAM_ERROR",
      `TypeScript Program validation failed: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
      location ? { location } : {},
    );
  }
  const sourceUniverse = new Set(options.sourceFiles.map(stablePath));
  const sourceFiles = program.getSourceFiles()
    .filter((sourceFile) => sourceUniverse.has(stablePath(sourceFile.fileName)))
    .sort((left, right) => stablePath(left.fileName).localeCompare(stablePath(right.fileName)));
  if (sourceFiles.length !== sourceUniverse.size) {
    const loaded = new Set(sourceFiles.map((sourceFile) => stablePath(sourceFile.fileName)));
    const missing = options.sourceFiles.find((filePath) => !loaded.has(stablePath(filePath)));
    throw new BunwireCompilerError(
      "TYPESCRIPT_PROGRAM_ERROR",
      `TypeScript Program did not load configured source file "${missing ?? "<unknown>"}".`,
      missing ? { filePath: missing } : {},
    );
  }
  return Object.freeze({
    program,
    checker: program.getTypeChecker(),
    sourceFiles: Object.freeze(sourceFiles),
  });
}

export function createBunwireProgram(options: BunwireProgramOptions): BunwireProgramContext {
  return createBunwireProgramInternal(options);
}

function compilerSymbolRootNames(options: BunwireAnalysisOptions): readonly string[] {
  const compilerOptions = readCompilerOptions(options);
  const containingFile = path.join(options.projectRoot, "__bunwire_compiler__.ts");
  const definitions: readonly CompilerDefinition[] = [
    ...options.extensions.classDecorators,
    ...options.extensions.methodDecorators,
    ...options.extensions.parameterInjectors,
    Inject.definition,
  ];
  const roots = new Set<string>();
  for (const definition of definitions) {
    const resolved = ts.resolveModuleName(
      definition.compilerSymbol.moduleSpecifier,
      containingFile,
      compilerOptions,
      ts.sys,
    ).resolvedModule;
    if (resolved) {
      roots.add(resolved.resolvedFileName);
    }
  }
  return [...roots];
}

function runtimeReference(
  checker: ts.TypeChecker,
  expression: ts.Expression | ts.TypeNode,
  symbol: ts.Symbol,
): CompilerRuntimeReference {
  const canonical = canonicalSymbol(checker, symbol);
  const declaration = canonical.valueDeclaration ?? canonical.declarations?.[0];
  if (!declaration) {
    fail(
      "CONSTRUCTOR_INJECTION_INVALID",
      `Runtime reference "${expression.getText()}" has no resolvable declaration.`,
      expression,
    );
  }
  const sourceFile = declaration.getSourceFile();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const exported = moduleSymbol
    ? checker.getExportsOfModule(moduleSymbol).find((candidate) => (
      canonicalSymbol(checker, candidate) === canonical
    ))
    : undefined;
  if (!exported) {
    fail(
      "REGISTRY_GENERATION_INVALID",
      `Runtime reference "${expression.getText()}" resolves to "${checker.symbolToString(canonical)}", which is not exported from "${sourceFile.fileName}". Managed classes and runtime injection tokens must be exported so generated registries can import them.`,
      expression,
    );
  }
  let moduleSpecifier: string | undefined;
  for (const statement of expression.getSourceFile().statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteralLike(statement.moduleSpecifier)
      || statement.moduleSpecifier.text.startsWith(".")) {
      continue;
    }
    const clause = statement.importClause;
    const candidates: ts.Identifier[] = [];
    if (clause?.name) candidates.push(clause.name);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      candidates.push(...clause.namedBindings.elements.map((element) => element.name));
    }
    if (candidates.some((candidate) => {
      const imported = checker.getSymbolAtLocation(candidate);
      return imported ? canonicalSymbol(checker, imported) === canonical : false;
    })) {
      moduleSpecifier = statement.moduleSpecifier.text;
      break;
    }
  }
  return Object.freeze({
    expression: expression.getText(),
    symbolName: checker.symbolToString(canonical),
    exportName: exported.name,
    moduleSpecifier,
    location: locationOf(expression),
    declaration: locationOf(declaration),
  });
}

function symbolFromTypeNode(
  checker: ts.TypeChecker,
  typeNode: ts.TypeNode | undefined,
): ts.Symbol | undefined {
  if (!typeNode) {
    return undefined;
  }
  let selected = typeNode;
  if (ts.isUnionTypeNode(selected)) {
    const substantive = selected.types.filter((part) => (
      part.kind !== ts.SyntaxKind.UndefinedKeyword
      && part.kind !== ts.SyntaxKind.NullKeyword
    ));
    if (substantive.length !== 1) {
      return undefined;
    }
    selected = substantive[0] as ts.TypeNode;
  }
  if (ts.isTypeReferenceNode(selected)) {
    const symbol = checker.getSymbolAtLocation(selected.typeName);
    return symbol ? canonicalSymbol(checker, symbol) : undefined;
  }
  if (ts.isTypeQueryNode(selected)) {
    const symbol = checker.getSymbolAtLocation(selected.exprName);
    return symbol ? canonicalSymbol(checker, symbol) : undefined;
  }
  const type = checker.getTypeAtLocation(selected);
  return type.symbol ? canonicalSymbol(checker, type.symbol) : undefined;
}

function symbolFromRuntimeExpression(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  diagnosticCode: BunwireCompilerError["code"],
): ts.Symbol {
  const symbol = symbolAtExpression(checker, expression);
  if (!symbol) {
    fail(
      diagnosticCode,
      `Explicit injection token "${expression.getText()}" must resolve to a runtime value. Interfaces and type-only declarations require createToken().`,
      expression,
    );
  }
  if (!symbol.valueDeclaration && (symbol.flags & ts.SymbolFlags.Value) === 0) {
    fail(
      diagnosticCode,
      `Explicit injection token "${expression.getText()}" resolves only to a TypeScript type and has no runtime value. Use createToken() or a concrete runtime class.`,
      expression,
    );
  }
  const expressionType = checker.getTypeAtLocation(expression);
  const constructable = checker.getSignaturesOfType(expressionType, ts.SignatureKind.Construct).length > 0;
  const kind = stringLiteralProperty(checker, expressionType, "kind", expression);
  const id = checker.getPropertyOfType(expressionType, "id");
  const description = checker.getPropertyOfType(expressionType, "description");
  const toString = checker.getPropertyOfType(expressionType, "toString");
  const tokenObject = kind === "bunwire.token"
    && Boolean(id && (checker.getTypeOfSymbolAtLocation(id, expression).flags & ts.TypeFlags.ESSymbolLike) !== 0)
    && Boolean(description && (checker.getTypeOfSymbolAtLocation(description, expression).flags & ts.TypeFlags.StringLike) !== 0)
    && Boolean(toString && checker.getSignaturesOfType(
      checker.getTypeOfSymbolAtLocation(toString, expression),
      ts.SignatureKind.Call,
    ).length > 0);
  if ((expressionType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0
    || (!constructable && !tokenObject)) {
    fail(
      diagnosticCode,
      `Explicit injection token "${expression.getText()}" must be a createToken() value or a constructable class; received type "${checker.typeToString(expressionType)}".`,
      expression,
    );
  }
  return symbol;
}

function parameterOptional(parameter: ts.ParameterDeclaration): boolean {
  return Boolean(parameter.questionToken || parameter.initializer || parameter.dotDotDotToken);
}

function explicitToken(
  parameter: ts.ParameterDeclaration,
  checker: ts.TypeChecker,
  injectDefinitions: ResolvedCompilerDefinitions<typeof Inject.definition>,
): ResolvedRuntimeToken | undefined {
  const injectors = explicitInjectDecorators(parameter, checker, injectDefinitions);
  if (injectors.length > 1) {
    fail(
      "PARAMETER_SOURCE_CONFLICT",
      `Parameter "${parameter.name.getText()}" declares @Inject() more than once.`,
      parameter,
    );
  }
  const injector = injectors[0];
  if (!injector) {
    return undefined;
  }
  const argument = injector.call.arguments[0];
  if (injector.call.arguments.length !== 1 || !argument) {
    fail(
      "CONSTRUCTOR_INJECTION_INVALID",
      `@Inject() on parameter "${parameter.name.getText()}" requires exactly one runtime token expression.`,
      injector.decorator,
    );
  }
  const tokenExpression = unwrapExpression(argument);
  const symbol = symbolFromRuntimeExpression(
    checker,
    tokenExpression,
    "CONSTRUCTOR_INJECTION_INVALID",
  );
  return Object.freeze({
    reference: runtimeReference(checker, tokenExpression, symbol),
    symbol: canonicalSymbol(checker, symbol),
  });
}

function classDeclarations(context: BunwireProgramContext): readonly ts.ClassDeclaration[] {
  const declarations: ts.ClassDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      declarations.push(node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  for (const sourceFile of context.sourceFiles) {
    ts.forEachChild(sourceFile, visit);
  }
  return declarations.sort((left, right) => {
    const file = stablePath(left.getSourceFile().fileName)
      .localeCompare(stablePath(right.getSourceFile().fileName));
    return file || left.getStart() - right.getStart();
  });
}

function analyzeConstructor(
  declaration: ts.ClassDeclaration,
  managedBySymbol: ReadonlyMap<ts.Symbol, { readonly kind: ManagedClassKind; readonly declaration: ts.ClassDeclaration }>,
  checker: ts.TypeChecker,
  injectDefinitions: ResolvedCompilerDefinitions<typeof Inject.definition>,
): ConstructorAnalysisResult {
  const constructors = declaration.members.filter(ts.isConstructorDeclaration);
  const implementation = constructors.find((constructor) => constructor.body) ?? constructors[0];
  if (!implementation) {
    const classSymbol = declaration.name ? checker.getSymbolAtLocation(declaration.name) : undefined;
    const constructorType = classSymbol
      ? checker.getTypeOfSymbolAtLocation(classSymbol, declaration.name as ts.Identifier)
      : undefined;
    const inheritedSignature = constructorType
      ? checker.getSignaturesOfType(constructorType, ts.SignatureKind.Construct)
        .find((signature) => signature.parameters.length > 0)
      : undefined;
    if (inheritedSignature) {
      fail(
        "CONSTRUCTOR_INJECTION_INVALID",
        `Managed class "${declaration.name?.text ?? "<anonymous>"}" inherits a constructor with parameters. Declare an explicit forwarding constructor so Bunwire can compile its dependency sources.`,
        declaration,
      );
    }
    return Object.freeze({
      plan: Object.freeze({ parameterCount: 0, dependencies: Object.freeze([]) }),
      edges: Object.freeze([]),
    });
  }
  const dependencies: AnalyzedConstructorDependency[] = [];
  const edges: ConstructorDependencyEdge[] = [];
  implementation.parameters.forEach((parameter, index) => {
    const token = explicitToken(parameter, checker, injectDefinitions);
    if (token) {
      dependencies.push(Object.freeze({
        index,
        source: "container",
        token: token.reference,
        explicit: true,
        optional: parameterOptional(parameter),
      }));
      edges.push(Object.freeze({ target: token.symbol, location: parameter }));
      return;
    }
    const symbol = symbolFromTypeNode(checker, parameter.type);
    const managed = symbol ? managedBySymbol.get(symbol) : undefined;
    if (symbol && managed?.kind.injectable) {
      dependencies.push(Object.freeze({
        index,
        source: "container",
        token: runtimeReference(checker, parameter.type as ts.TypeNode, symbol),
        explicit: false,
        optional: parameterOptional(parameter),
      }));
      edges.push(Object.freeze({ target: symbol, location: parameter }));
      return;
    }
    const typeText = parameter.type?.getText() ?? checker.typeToString(checker.getTypeAtLocation(parameter));
    fail(
      "CONSTRUCTOR_INJECTION_INVALID",
      `Constructor parameter ${index} "${parameter.name.getText()}" on managed class "${declaration.name?.text ?? "<anonymous>"}" has type "${typeText}", which is not an injectable managed class. Use @Inject(TOKEN) and provide an explicit runtime binding.`,
      parameter,
    );
  });
  return Object.freeze({
    plan: Object.freeze({
      parameterCount: implementation.parameters.length,
      dependencies: Object.freeze(dependencies),
    }),
    edges: Object.freeze(edges),
  });
}

function analyzeMethodParameters(
  method: ts.MethodDeclaration,
  checker: ts.TypeChecker,
  managedBySymbol: ReadonlyMap<ts.Symbol, { readonly kind: ManagedClassKind }>,
  injectorDefinitions: ResolvedCompilerDefinitions<CompilerDefinition & { readonly resolverId: ParameterResolverId; readonly createMetadata: (options: any) => unknown }>,
  injectDefinitions: ResolvedCompilerDefinitions<typeof Inject.definition>,
): readonly AnalyzedMethodParameter[] {
  let argumentIndex = 0;
  const parameters: AnalyzedMethodParameter[] = [];
  method.parameters.forEach((parameter, methodIndex) => {
    const injectors = matchDecorators(parameter, checker, injectorDefinitions);
    const explicitInjectors = explicitInjectDecorators(parameter, checker, injectDefinitions);
    if (injectors.length > 1 || explicitInjectors.length > 1 || (injectors.length > 0 && explicitInjectors.length > 0)) {
      fail(
        "PARAMETER_SOURCE_CONFLICT",
        `Managed method parameter ${methodIndex} "${parameter.name.getText()}" declares incompatible or duplicate parameter-source decorators.`,
        parameter,
      );
    }
    const injector = injectors[0];
    if (injector) {
      parameters.push(Object.freeze({
        source: "resolver",
        methodIndex,
        resolverId: injector.definition.resolverId,
        injectorId: injector.id,
        data: decoratorData(injector),
        location: locationOf(parameter),
      }));
      return;
    }
    const explicit = explicitToken(parameter, checker, injectDefinitions);
    if (explicit) {
      parameters.push(Object.freeze({
        source: "container",
        methodIndex,
        token: explicit.reference,
        explicit: true,
        location: locationOf(parameter),
      }));
      return;
    }
    const symbol = symbolFromTypeNode(checker, parameter.type);
    const managed = symbol ? managedBySymbol.get(symbol) : undefined;
    if (symbol && managed?.kind.injectable) {
      parameters.push(Object.freeze({
        source: "container",
        methodIndex,
        token: runtimeReference(checker, parameter.type as ts.TypeNode, symbol),
        explicit: false,
        location: locationOf(parameter),
      }));
      return;
    }
    parameters.push(Object.freeze({
      source: "transport",
      methodIndex,
      argumentIndex,
      optional: parameterOptional(parameter),
      rest: Boolean(parameter.dotDotDotToken),
      location: locationOf(parameter),
    }));
    argumentIndex += 1;
  });
  return Object.freeze(parameters);
}

function analyzeManagedMethods(
  declaration: ts.ClassDeclaration,
  ownerKind: ManagedClassKind | undefined,
  checker: ts.TypeChecker,
  managedBySymbol: ReadonlyMap<ts.Symbol, { readonly kind: ManagedClassKind }>,
  methodDefinitions: ResolvedCompilerDefinitions<CompilerDefinition & { readonly kind: ManagedMethodKind; readonly createMetadata: (options: any) => unknown }>,
  injectorDefinitions: ResolvedCompilerDefinitions<CompilerDefinition & { readonly resolverId: ParameterResolverId; readonly createMetadata: (options: any) => unknown }>,
  injectDefinitions: ResolvedCompilerDefinitions<typeof Inject.definition>,
): readonly AnalyzedManagedMethod[] {
  const methods: AnalyzedManagedMethod[] = [];
  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member)) {
      continue;
    }
    const decorators = matchDecorators(member, checker, methodDefinitions);
    if (decorators.length === 0) {
      continue;
    }
    if (decorators.length > 1) {
      fail(
        "MANAGED_METHOD_INVALID",
        `Method "${member.name.getText()}" declares more than one managed-method decorator.`,
        member,
      );
    }
    const decorator = decorators[0] as DecoratorMatch<{ readonly id: string; readonly kind: ManagedMethodKind; readonly createMetadata: (options: any) => unknown }>;
    if (!ownerKind) {
      fail(
        "MANAGED_METHOD_INVALID",
        `Managed method decorator "${decorator.id}" may only be used on a registered managed class.`,
        decorator.decorator,
      );
    }
    if (!ownerKind.managedMethods || !decorator.definition.kind.allowedOn.includes(ownerKind.id)) {
      fail(
        "MANAGED_METHOD_INVALID",
        `Managed method decorator "${decorator.id}" is not allowed on owning class kind "${ownerKind.id}".`,
        decorator.decorator,
      );
    }
    if (member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)) {
      fail(
        "MANAGED_METHOD_INVALID",
        `Managed method "${member.name.getText()}" must be an instance method; static managed methods are not supported.`,
        member,
      );
    }
    if (!member.body || member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword)) {
      fail(
        "MANAGED_METHOD_INVALID",
        `Managed method "${member.name.getText()}" must declare a concrete runtime implementation.`,
        member,
      );
    }
    if (!ts.isIdentifier(member.name) && !ts.isStringLiteralLike(member.name) && !ts.isNumericLiteral(member.name)) {
      fail(
        "MANAGED_METHOD_INVALID",
        "Managed methods must use a statically known identifier, string, or numeric name.",
        member.name,
      );
    }
    const parameters = analyzeMethodParameters(
      member,
      checker,
      managedBySymbol,
      injectorDefinitions,
      injectDefinitions,
    );
    const caller = parameters.filter((parameter): parameter is AnalyzedTransportParameter => parameter.source === "transport");
    const highestRequired = caller.reduce(
      (highest, parameter) => parameter.optional ? highest : Math.max(highest, parameter.argumentIndex),
      -1,
    );
    const rest = caller.find((parameter) => parameter.rest);
    if (rest && rest.argumentIndex !== caller.length - 1) {
      fail(
        "MANAGED_METHOD_INVALID",
        "A caller-visible rest parameter must be the final caller-visible parameter.",
        member.parameters[rest.methodIndex] as ts.ParameterDeclaration,
      );
    }
    methods.push(Object.freeze({
      name: member.name.text,
      kind: decorator.definition.kind,
      decoratorId: decorator.id,
      data: decoratorData(decorator),
      location: locationOf(member),
      parameters,
      minimumCallerArguments: highestRequired + 1,
      maximumCallerArguments: rest ? null : caller.length,
    }));
  }
  return Object.freeze(methods);
}

function validateConstructorCycles(
  analyses: ReadonlyMap<ts.Symbol, ConstructorAnalysisResult>,
  managedBySymbol: ReadonlyMap<ts.Symbol, { readonly declaration: ts.ClassDeclaration }>,
): void {
  const states = new Map<ts.Symbol, "visiting" | "visited">();
  const stack: ts.Symbol[] = [];
  const visit = (symbol: ts.Symbol): void => {
    states.set(symbol, "visiting");
    stack.push(symbol);
    const analysis = analyses.get(symbol);
    for (const edge of analysis?.edges ?? []) {
      if (!analyses.has(edge.target)) {
        continue;
      }
      const state = states.get(edge.target);
      if (state === "visiting") {
        const cycleStart = stack.indexOf(edge.target);
        const cycle = [...stack.slice(cycleStart), edge.target]
          .map((entry) => managedBySymbol.get(entry)?.declaration.name?.text ?? entry.name)
          .join(" -> ");
        fail(
          "CONSTRUCTOR_DEPENDENCY_CYCLE",
          `Managed constructor dependency cycle detected: ${cycle}.`,
          edge.location,
        );
      }
      if (state !== "visited") {
        visit(edge.target);
      }
    }
    stack.pop();
    states.set(symbol, "visited");
  };
  for (const symbol of analyses.keys()) {
    if (!states.has(symbol)) {
      visit(symbol);
    }
  }
}

export function analyzeBunwireProgram(options: BunwireAnalysisOptions): BunwireCompilerAnalysis {
  const context = createBunwireProgramInternal(options, compilerSymbolRootNames(options));
  const checker = context.checker;
  const occupiedSymbols = new Map<ts.Symbol, CompilerDefinition>();
  const classDefinitions = resolveCompilerDefinitions(
    context,
    options.projectRoot,
    options.extensions.classDecorators,
    "Managed class decorator",
    occupiedSymbols,
  );
  const methodDefinitions = resolveCompilerDefinitions(
    context,
    options.projectRoot,
    options.extensions.methodDecorators,
    "Managed method decorator",
    occupiedSymbols,
  );
  const injectorDefinitions = resolveCompilerDefinitions(
    context,
    options.projectRoot,
    options.extensions.parameterInjectors,
    "Parameter injector",
    occupiedSymbols,
  );
  const injectDefinitions = resolveCompilerDefinitions(
    context,
    options.projectRoot,
    [Inject.definition],
    "Core injection decorator",
    occupiedSymbols,
  );
  const declarations = classDeclarations(context);
  const discovered = new Map<ts.ClassDeclaration, DecoratorMatch<any>>();
  const managedBySymbol = new Map<ts.Symbol, { readonly kind: ManagedClassKind; readonly declaration: ts.ClassDeclaration }>();

  for (const declaration of declarations) {
    const decorators = matchDecorators(declaration, checker, classDefinitions);
    if (decorators.length === 0) {
      continue;
    }
    if (decorators.length > 1) {
      fail(
        "MANAGED_CLASS_INVALID",
        `Class "${declaration.name?.text ?? "<anonymous>"}" declares more than one managed-class decorator.`,
        declaration,
      );
    }
    if (!declaration.name) {
      fail("MANAGED_CLASS_INVALID", "Managed classes must have a stable declared name.", declaration);
    }
    const symbol = checker.getSymbolAtLocation(declaration.name);
    if (!symbol) {
      fail(
        "MANAGED_CLASS_INVALID",
        `Managed class "${declaration.name.text}" has no resolvable TypeScript symbol.`,
        declaration.name,
      );
    }
    const match = decorators[0] as DecoratorMatch<any>;
    const canonical = canonicalSymbol(checker, symbol);
    discovered.set(declaration, match);
    managedBySymbol.set(canonical, { kind: match.definition.kind, declaration });
  }

  const constructorsBySymbol = new Map<ts.Symbol, ConstructorAnalysisResult>();
  const constructorsByDeclaration = new Map<ts.ClassDeclaration, ConstructorAnalysisResult>();
  for (const [declaration, match] of discovered) {
    if (!match.definition.kind.analyzeConstructor || !declaration.name) {
      continue;
    }
    const symbol = checker.getSymbolAtLocation(declaration.name) as ts.Symbol;
    const canonical = canonicalSymbol(checker, symbol);
    const analysis = analyzeConstructor(
      declaration,
      managedBySymbol,
      checker,
      injectDefinitions,
    );
    constructorsBySymbol.set(canonical, analysis);
    constructorsByDeclaration.set(declaration, analysis);
  }
  validateConstructorCycles(constructorsBySymbol, managedBySymbol);

  const classes: AnalyzedManagedClass[] = [];
  for (const declaration of declarations) {
    const match = discovered.get(declaration);
    const ownerKind = match?.definition.kind as ManagedClassKind | undefined;
    const methods = analyzeManagedMethods(
      declaration,
      ownerKind,
      checker,
      managedBySymbol,
      methodDefinitions,
      injectorDefinitions,
      injectDefinitions,
    );
    if (!match || !declaration.name) {
      continue;
    }
    const symbol = checker.getSymbolAtLocation(declaration.name) as ts.Symbol;
    classes.push(Object.freeze({
      name: declaration.name.text,
      kind: match.definition.kind,
      decoratorId: match.id,
      data: decoratorData(match),
      target: runtimeReference(checker, declaration.name, symbol),
      location: locationOf(declaration),
      constructor: constructorsByDeclaration.get(declaration)?.plan,
      methods,
    }));
  }
  return Object.freeze({ context, classes: Object.freeze(classes) });
}
