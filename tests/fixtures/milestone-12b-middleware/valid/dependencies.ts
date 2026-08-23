import { Service, createToken } from "@bunwire/core";

export interface AuditSink {
  write(message: string): void;
}

export const AUDIT_SINK = createToken<AuditSink>("milestone-12b.audit-sink");

@Service()
export class AuthService {
  readonly name = "auth-service";
}
