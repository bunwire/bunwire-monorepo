import { describe, expect, it } from "vitest";
import {
  Container,
  ContainerResolutionError,
  createToken,
  isClassToken,
  isToken,
} from "@bunwire/core";

describe("runtime tokens", () => {
  it("creates unique custom tokens even when descriptions match", () => {
    const first = createToken<string>("cache");
    const second = createToken<string>("cache");

    expect(first).not.toBe(second);
    expect(first.id).not.toBe(second.id);
    expect(first.toString()).toBe("Token(cache)");
    expect(isToken(first)).toBe(true);
  });

  it("rejects structurally forged custom tokens", () => {
    const forged = Object.freeze({
      kind: "bunwire.token",
      id: Symbol("forged"),
      description: "forged",
      toString: () => "Token(forged)",
    });

    expect(isToken(forged)).toBe(false);
    expect(() => new Container().value(forged as never, "value")).toThrow(
      /valid runtime token/i,
    );
  });

  it("uses class constructors as runtime tokens", () => {
    class Logger {}
    class NamedLogger {
      constructor(readonly name: string) {}
    }
    const BoundLogger = NamedLogger.bind(undefined, "bound");
    const container = new Container().transient(Logger);

    expect(container.get(Logger)).toBeInstanceOf(Logger);
    expect(isClassToken(Logger)).toBe(true);
    expect(isClassToken(BoundLogger)).toBe(true);
  });

  it("rejects non-constructable functions as class tokens", () => {
    const arrow = () => "not a class";
    function* generator(): Generator<never, void, unknown> {}

    expect(isClassToken(arrow)).toBe(false);
    expect(isClassToken(generator)).toBe(false);
    expect(() => new Container().bind(arrow as never)).toThrow(/class implementation/i);
  });

  it("does not allow interface-only types to become runtime tokens", () => {
    interface RepositoryContractOnly {
      get(key: string): unknown;
    }
    const container = new Container();

    // @ts-expect-error Interfaces have no runtime value; use createToken<RepositoryContractOnly>().
    expect(() => container.get(RepositoryContractOnly)).toThrow();
  });
});

describe("class resolution from constructor metadata", () => {
  it("resolves a zero-argument class", () => {
    class ZeroArgument {}
    const container = new Container().bind(ZeroArgument);

    expect(container.get(ZeroArgument)).toBeInstanceOf(ZeroArgument);
  });

  it("resolves constructor dependency index zero", () => {
    class Logger {}
    class Service {
      constructor(readonly logger: Logger) {}
    }
    const container = new Container()
      .singleton(Logger)
      .transient(Service)
      .registerConstructorMetadata({
        target: Service,
        dependencies: [{ index: 0, token: Logger }],
      });

    expect(container.get(Service).logger).toBe(container.get(Logger));
  });

  it("preserves multiple constructor dependency positions", () => {
    const HOST = createToken<string>("position-host");
    const PORT = createToken<number>("position-port");
    class Server {
      constructor(readonly host: string, readonly port: number) {}
    }
    const container = new Container()
      .value(HOST, "127.0.0.1")
      .value(PORT, 3000)
      .transient(Server)
      .registerConstructorMetadata({
        target: Server,
        dependencies: [
          { index: 0, token: HOST },
          { index: 1, token: PORT },
        ],
      });

    const server = container.get(Server);
    expect([server.host, server.port]).toEqual(["127.0.0.1", 3000]);
  });

  it("orders constructor arguments when dependency metadata is supplied out of order", () => {
    const PORT = createToken<number>("port");
    const HOST = createToken<string>("host");
    class Server {
      constructor(
        readonly host: string,
        readonly marker: undefined,
        readonly port: number,
      ) {}
    }
    const container = new Container()
      .value(HOST, "localhost")
      .value(PORT, 8080)
      .transient(Server)
      .registerConstructorMetadata({
        target: Server,
        dependencies: [
          { index: 2, token: PORT },
          { index: 0, token: HOST },
        ],
      });

    const server = container.get(Server);
    expect(server.host).toBe("localhost");
    expect(server.marker).toBeUndefined();
    expect(server.port).toBe(8080);
  });

  it("recursively constructs a bound object graph", () => {
    class Database {}
    class Repository {
      constructor(readonly database: Database) {}
    }
    class Service {
      constructor(readonly repository: Repository) {}
    }
    const container = new Container()
      .singleton(Database)
      .transient(Repository)
      .transient(Service)
      .registerConstructorMetadata({
        target: Repository,
        dependencies: [{ index: 0, token: Database }],
      })
      .registerConstructorMetadata({
        target: Service,
        dependencies: [{ index: 0, token: Repository }],
      });

    expect(container.get(Service).repository.database).toBe(container.get(Database));
  });
});

describe("binding scopes", () => {
  it("caches singleton classes within one container", () => {
    class Clock {}
    const container = new Container().singleton(Clock);

    expect(container.get(Clock)).toBe(container.get(Clock));
  });

  it("does not share singletons between root containers", () => {
    class Clock {}
    const first = new Container().singleton(Clock);
    const second = new Container().singleton(Clock);

    expect(first.get(Clock)).not.toBe(second.get(Clock));
  });

  it("creates a new transient instance per resolution", () => {
    class Formatter {}
    const container = new Container().transient(Formatter);

    expect(container.get(Formatter)).not.toBe(container.get(Formatter));
  });
});

describe("explicit bindings", () => {
  it("resolves token to value", () => {
    const CONFIG = createToken<{ production: boolean }>("config");
    const config = { production: true };
    const container = new Container().value(CONFIG, config);

    expect(container.get(CONFIG)).toBe(config);
  });

  it("resolves token to transient and singleton factories", () => {
    const TRANSIENT = createToken<object>("transient-factory");
    const SINGLETON = createToken<object>("singleton-factory");
    const container = new Container()
      .factory(TRANSIENT, () => ({}))
      .singleton(SINGLETON, () => ({}));

    expect(container.get(TRANSIENT)).not.toBe(container.get(TRANSIENT));
    expect(container.get(SINGLETON)).toBe(container.get(SINGLETON));
  });

  it("resolves token to class", () => {
    abstract class Logger {}
    class ProductionLogger extends Logger {}
    const container = new Container().bind(Logger, ProductionLogger);

    expect(container.get(Logger)).toBeInstanceOf(ProductionLogger);
  });

  it("resolves an existing instance", () => {
    class Connection {}
    const connection = new Connection();
    const container = new Container().instance(Connection, connection);

    expect(container.get(Connection)).toBe(connection);
  });

  it("preserves target singleton identity through aliases", () => {
    const CACHE = createToken<object>("cache");
    const REDIS_CACHE = createToken<object>("redis-cache");
    const container = new Container()
      .singleton(REDIS_CACHE, () => ({}))
      .alias(CACHE, REDIS_CACHE);

    expect(container.get(CACHE)).toBe(container.get(REDIS_CACHE));
  });

  it("uses deterministic last-binding-wins override semantics", () => {
    const MODE = createToken<string>("mode");
    const container = new Container()
      .value(MODE, "convention")
      .value(MODE, "explicit");

    expect(container.get(MODE)).toBe("explicit");
  });

  it("evicts a cached singleton when its binding is overridden", () => {
    const VALUE = createToken<object>("value");
    const explicit = {};
    const container = new Container().singleton(VALUE, () => ({}));
    const convention = container.get(VALUE);

    container.value(VALUE, explicit);

    expect(container.get(VALUE)).toBe(explicit);
    expect(container.get(VALUE)).not.toBe(convention);
  });

  it("reports a missing token with its resolution chain", () => {
    const DATABASE = createToken<object>("database");
    class Repository {
      constructor(readonly database: object) {}
    }
    const container = new Container()
      .transient(Repository)
      .registerConstructorMetadata({
        target: Repository,
        dependencies: [{ index: 0, token: DATABASE }],
      });

    expect(() => container.get(Repository)).toThrowError(
      /no binding is registered.*Class\(Repository\) -> Token\(database\)/,
    );
  });

  it("reports circular dependencies with an actionable chain", () => {
    class First {
      constructor(readonly second: Second) {}
    }
    class Second {
      constructor(readonly first: First) {}
    }
    const container = new Container()
      .transient(First)
      .transient(Second)
      .registerConstructorMetadata({
        target: First,
        dependencies: [{ index: 0, token: Second }],
      })
      .registerConstructorMetadata({
        target: Second,
        dependencies: [{ index: 0, token: First }],
      });

    expect(() => container.get(First)).toThrowError(ContainerResolutionError);
    expect(() => container.get(First)).toThrowError(
      /Circular dependency.*Class\(First\) -> Class\(Second\) -> Class\(First\)/,
    );
  });
});
