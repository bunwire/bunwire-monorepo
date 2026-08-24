import { describe, expect, it } from "vitest";
import {
  CONTROLLER_KIND,
  Controller,
  PROVIDER_KIND,
  PROVIDER_LIFECYCLE_HOOKS,
  Provider,
  SERVICE_KIND,
  Service,
  getManagedClassMetadata,
  type ControllerClassMetadata,
  type ProviderClassMetadata,
  type ServiceClassMetadata,
} from "@bunwire/core";

describe("Milestone 3 — built-in managed class kinds", () => {
  it("@Service() creates core.service metadata", () => {
    @Service()
    class UserService {}

    const metadata = getManagedClassMetadata(UserService);
    expect(metadata?.kindId).toBe("core.service");
    expect(metadata?.target).toBe(UserService);
    expect(metadata?.data).toEqual({ scope: "singleton" });
  });

  it("supports bare built-in decorators when configuration is omitted", () => {
    @Service
    class BareService {}

    @Controller
    class BareController {}

    @Provider
    class BareProvider {}

    expect(getManagedClassMetadata(BareService)?.data).toEqual({ scope: "singleton" });
    expect(getManagedClassMetadata(BareController)?.data).toEqual({ prefix: undefined });
    expect(getManagedClassMetadata(BareProvider)?.data).toEqual({
      lifecycleHooks: PROVIDER_LIFECYCLE_HOOKS,
      constructorPolicy: "zero-arguments",
    });
  });

  it("@Controller() creates core.controller metadata", () => {
    @Controller()
    class HealthController {}

    const metadata = getManagedClassMetadata(HealthController);
    expect(metadata?.kindId).toBe("core.controller");
    expect((metadata?.data as ControllerClassMetadata).prefix).toBeUndefined();
  });

  it("@Controller(prefix) retains a generic prefix for adapters", () => {
    @Controller("users")
    class UserController {}

    const metadata = getManagedClassMetadata(UserController);
    expect((metadata?.data as ControllerClassMetadata).prefix).toBe("users");
  });

  it("@Provider() creates core.provider metadata", () => {
    @Provider()
    class AppProvider {}

    const metadata = getManagedClassMetadata(AppProvider);
    expect(metadata?.kindId).toBe("core.provider");
    expect(metadata?.target).toBe(AppProvider);
  });

  it("Service has managedMethods=false", () => {
    expect(SERVICE_KIND).toMatchObject({
      autoDiscover: true,
      injectable: true,
      analyzeConstructor: true,
      managedMethods: false,
      registry: false,
    });
  });

  it("Controller has managedMethods=true", () => {
    expect(CONTROLLER_KIND).toMatchObject({
      autoDiscover: true,
      injectable: true,
      analyzeConstructor: true,
      managedMethods: true,
      registry: true,
    });
  });

  it("Provider metadata identifies register and boot without ordinary managed routes", () => {
    @Provider()
    class LifecycleProvider {
      register(): void {}
      boot(): void {}
    }

    const metadata = getManagedClassMetadata(LifecycleProvider);
    const data = metadata?.data as ProviderClassMetadata;

    expect(data.lifecycleHooks).toEqual(["register", "boot"]);
    expect(data.lifecycleHooks).toBe(PROVIDER_LIFECYCLE_HOOKS);
    expect(data).not.toHaveProperty("routes");
    expect(data).not.toHaveProperty("managedMethods");
    expect(PROVIDER_KIND).toMatchObject({
      autoDiscover: true,
      injectable: false,
      analyzeConstructor: false,
      managedMethods: false,
      registry: true,
    });
  });

  it("plain undecorated classes receive no managed capabilities", () => {
    class PlainUtility {}

    expect(getManagedClassMetadata(PlainUtility)).toBeUndefined();
    expect(PlainUtility).not.toHaveProperty("definition");
  });

  it("does not inherit managed metadata through undecorated subclasses", () => {
    @Service()
    class BaseService {}

    @Controller("base")
    class BaseController {}

    @Provider()
    class BaseProvider {}

    class UndecoratedService extends BaseService {}
    class UndecoratedController extends BaseController {}
    class UndecoratedProvider extends BaseProvider {}

    expect(getManagedClassMetadata(UndecoratedService)).toBeUndefined();
    expect(getManagedClassMetadata(UndecoratedController)).toBeUndefined();
    expect(getManagedClassMetadata(UndecoratedProvider)).toBeUndefined();
  });

  it("allows a subclass to opt into its own managed metadata", () => {
    @Service()
    class BaseService {}

    @Service({ scope: "transient" })
    class ManagedSubclass extends BaseService {}

    const baseMetadata = getManagedClassMetadata(BaseService);
    const subclassMetadata = getManagedClassMetadata(ManagedSubclass);

    expect(baseMetadata?.target).toBe(BaseService);
    expect((baseMetadata?.data as ServiceClassMetadata).scope).toBe("singleton");
    expect(subclassMetadata?.target).toBe(ManagedSubclass);
    expect((subclassMetadata?.data as ServiceClassMetadata).scope).toBe("transient");
  });

  it("all built-ins specialize the generic managed-class decorator system", () => {
    expect(Service.definition.kind).toBe(SERVICE_KIND);
    expect(Controller.definition.kind).toBe(CONTROLLER_KIND);
    expect(Provider.definition.kind).toBe(PROVIDER_KIND);
    expect(Service.definition.id).toBe("core.service.decorator");
    expect(Controller.definition.id).toBe("core.controller.decorator");
    expect(Provider.definition.id).toBe("core.provider.decorator");
    expect(typeof Service.definition.createMetadata).toBe("function");
    expect(typeof Controller.definition.createMetadata).toBe("function");
    expect(typeof Provider.definition.createMetadata).toBe("function");
  });

  it("Service records explicit transient scope metadata", () => {
    @Service({ scope: "transient" })
    class FormatterService {}

    const metadata = getManagedClassMetadata(FormatterService);
    expect((metadata?.data as ServiceClassMetadata).scope).toBe("transient");
  });

  it("Provider records the zero-argument construction policy", () => {
    @Provider()
    class ValidProvider {}

    const metadata = getManagedClassMetadata(ValidProvider);
    expect((metadata?.data as ProviderClassMetadata).constructorPolicy).toBe("zero-arguments");
  });
});
