import { Service as ManagedService, Inject } from "@bunwire/core";
import { CACHE, type Cache, RandomUtility } from "./tokens.js";

@ManagedService()
export class LoggerService {}

@ManagedService({ scope: "transient" })
export class UserService {
  constructor(
    readonly logger: LoggerService,
    @Inject(CACHE) readonly cache: Cache,
    @Inject(RandomUtility) readonly utility: RandomUtility,
  ) {}
}

function Service(): ClassDecorator {
  return () => undefined;
}

@Service()
export class SameNamedButUnrelated {}
