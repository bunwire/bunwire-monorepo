import path from "node:path";
import {
  INJECT_DECORATOR_ID,
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

function matchDecorators<Definition extends { readonly id: string }>(
  node: ts.Node,
  checker: ts.TypeChecker,
  definitions: ReadonlyMap<string, Definition>,
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
    const id = decoratorIdentity(checker, expression, symbol);
    const definition = id ? definitions.get(id) : undefined;
    if (id && definition) {
      matches.push({ decorator, call: expression, symbol, id, definition });
    }
  }
  return matches;
}

function explicitInjectDecorators(
  node: ts.Node,
  checker: ts.TypeChecker,
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
    const id = decoratorIdentity(checker, expression, symbol);
    if (id === INJECT_DECORATOR_ID) {
      matches.push({ decorator, call: expression, symbol, id });
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

export function createBunwireProgram(options: BunwireProgramOptions): BunwireProgramContext {
  const program = ts.createProgram({
    rootNames: [...options.sourceFiles],
    options: readCompilerOptions(options),
  });
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
  return Object.freeze({
    expression: expression.getText(),
    symbolName: checker.symbolToString(canonical),
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
  return symbol;
}

function parameterOptional(parameter: ts.ParameterDeclaration): boolean {
  return Boolean(parameter.questionToken || parameter.initializer || parameter.dotDotDotToken);
}

function explicitToken(
  parameter: ts.ParameterDeclaration,
  checker: ts.TypeChecker,
): CompilerRuntimeReference | undefined {
  const injectors = explicitInjectDecorators(parameter, checker);
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
  return runtimeReference(checker, tokenExpression, symbol);
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
): AnalyzedConstructorPlan {
  const constructors = declaration.members.filter(ts.isConstructorDeclaration);
  const implementation = constructors.find((constructor) => constructor.body) ?? constructors[0];
  if (!implementation) {
    return Object.freeze({ parameterCount: 0, dependencies: Object.freeze([]) });
  }
  const dependencies: AnalyzedConstructorDependency[] = [];
  implementation.parameters.forEach((parameter, index) => {
    const token = explicitToken(parameter, checker);
    if (token) {
      dependencies.push(Object.freeze({
        index,
        source: "container",
        token,
        explicit: true,
        optional: parameterOptional(parameter),
      }));
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
    parameterCount: implementation.parameters.length,
    dependencies: Object.freeze(dependencies),
  });
}

function analyzeMethodParameters(
  method: ts.MethodDeclaration,
  checker: ts.TypeChecker,
  managedBySymbol: ReadonlyMap<ts.Symbol, { readonly kind: ManagedClassKind }>,
  injectorDefinitions: ReadonlyMap<string, { readonly id: string; readonly resolverId: ParameterResolverId; readonly createMetadata: (options: any) => unknown }>,
): readonly AnalyzedMethodParameter[] {
  let argumentIndex = 0;
  const parameters: AnalyzedMethodParameter[] = [];
  method.parameters.forEach((parameter, methodIndex) => {
    const injectors = matchDecorators(parameter, checker, injectorDefinitions);
    const explicitInjectors = explicitInjectDecorators(parameter, checker);
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
    const explicit = explicitToken(parameter, checker);
    if (explicit) {
      parameters.push(Object.freeze({
        source: "container",
        methodIndex,
        token: explicit,
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
  methodDefinitions: ReadonlyMap<string, { readonly id: string; readonly kind: ManagedMethodKind; readonly createMetadata: (options: any) => unknown }>,
  injectorDefinitions: ReadonlyMap<string, { readonly id: string; readonly resolverId: ParameterResolverId; readonly createMetadata: (options: any) => unknown }>,
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

export function analyzeBunwireProgram(options: BunwireAnalysisOptions): BunwireCompilerAnalysis {
  const context = createBunwireProgram(options);
  const checker = context.checker;
  const classDefinitions = new Map(options.extensions.classDecorators.map((definition) => [definition.id, definition]));
  const methodDefinitions = new Map(options.extensions.methodDecorators.map((definition) => [definition.id, definition]));
  const injectorDefinitions = new Map(options.extensions.parameterInjectors.map((definition) => [definition.id, definition]));
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
      constructor: match.definition.kind.analyzeConstructor
        ? analyzeConstructor(declaration, managedBySymbol, checker)
        : undefined,
      methods,
    }));
  }
  return Object.freeze({ context, classes: Object.freeze(classes) });
}
