import { Service } from "@bunwire/core";

@Service()
class InheritedDependency {}

class ConstructorBase {
  constructor(readonly dependency: InheritedDependency) {}
}

@Service()
export class HiddenConstructorService extends ConstructorBase {}
