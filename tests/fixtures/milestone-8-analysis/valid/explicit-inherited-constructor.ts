import { Service } from "@bunwire/core";

@Service()
export class ExplicitInheritedDependency {}

class ExplicitConstructorBase {
  constructor(readonly dependency: ExplicitInheritedDependency) {}
}

@Service()
export class ExplicitConstructorService extends ExplicitConstructorBase {
  constructor(dependency: ExplicitInheritedDependency) {
    super(dependency);
  }
}
