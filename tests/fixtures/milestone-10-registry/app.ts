import { Controller, Inject, Provider, Service, createToken, type Container, type InvocationContext } from "@bunwire/core";
import { Consumer, FrameworkValue, Subscribe } from "@bunwire/test-analysis-extensions";

export interface RegistryValue {
  readonly name: string;
}

export const REGISTRY_VALUE = createToken<RegistryValue>("milestone-10-value");
export const MISSING_VALUE = createToken<RegistryValue>("milestone-10-missing");

@Service()
export class RegistryService {
  readonly name = "generated-service";
}

@Service({ scope: "transient" })
export class TransientRegistryService {}

@Controller("reports")
export class RegistryController {
  constructor(readonly service: RegistryService) {}
}

@Provider()
export class RegistryProvider {
  static registerCount = 0;
  static bootCount = 0;

  register(container: Container): void {
    RegistryProvider.registerCount += 1;
    container.value(REGISTRY_VALUE, { name: "provider-value" });
  }

  boot(_context: InvocationContext): void {
    RegistryProvider.bootCount += 1;
  }
}

@Consumer("generated-consumer")
export class GeneratedConsumer {
  constructor(readonly constructorService: RegistryService) {}

  @Subscribe("registry.execute")
  execute(
    id: string,
    service: RegistryService,
    @Inject(REGISTRY_VALUE) value: RegistryValue,
    @FrameworkValue() frameworkValue: unknown,
    suffix: string,
  ): unknown {
    return {
      id,
      constructorService: this.constructorService.name,
      service: service.name,
      value: value.name,
      frameworkValue,
      suffix,
    };
  }

  @Subscribe("registry.missing")
  missing(@Inject(MISSING_VALUE) value: RegistryValue): string {
    return value.name;
  }
}
