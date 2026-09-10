import { defineAdapterCompilerDescriptor } from "@bunwire/core";
import {
  BUN_HTTP_NO_CALLER_CONTRACT_HANDLER,
  BUN_HTTP_ROUTE_IDENTITY_HANDLER,
  BUN_HTTP_ROUTE_KIND,
  Context,
  Delete,
  Get,
  Head,
  Options,
  Patch,
  Post,
  Put,
} from "./http.js";
import {
  BUN_REQUEST_BASE_CONTRACT_HANDLER,
  BUN_REQUEST_KIND,
  BUN_REQUEST_PARAMETER_RESOLVER_HANDLER,
  Request,
} from "./request.js";
import { CsrfMiddleware } from "./csrf.js";
import { AuthenticateMiddleware, GuestMiddleware } from "./auth.js";
import { AuthorizeMiddleware } from "./authorization.js";
import { Job, BUN_JOB_KIND, BUN_JOB_HANDLE_KIND, BUN_JOB_COMPILATION_HANDLER, BUN_JOB_NO_CALLER_CONTRACT_HANDLER } from "./jobs.js";
import { Queue, BUN_QUEUE_IDENTITY_HANDLER } from "./queued-listeners.js";
import { Schedule, BUN_SCHEDULED_TASK_KIND, BUN_SCHEDULED_TASK_HANDLE_KIND, BUN_SCHEDULED_TASK_COMPILATION_HANDLER, BUN_APPLICATION_SCHEDULE_HANDLER, BUN_SCHEDULE_NO_CALLER_CONTRACT_HANDLER } from "./scheduled-tasks.js";
import { Argument, Option, Flag, Command, BUN_COMMAND_KIND, BUN_COMMAND_HANDLE_KIND, BUN_COMMAND_COMPILATION_HANDLER, BUN_COMMAND_IDENTITY_HANDLER, BUN_COMMAND_NO_CALLER_CONTRACT_HANDLER } from "./commands.js";

export const BUN_COMPILER_DESCRIPTOR = defineAdapterCompilerDescriptor({
  id: "bun.adapter",
  classKinds: [BUN_REQUEST_KIND, BUN_JOB_KIND, BUN_SCHEDULED_TASK_KIND, BUN_COMMAND_KIND],
  classDecorators: [Request.definition, Job.definition, Schedule.definition, Command.definition],
  classAttachments: [Queue.definition],
  methodKinds: [BUN_HTTP_ROUTE_KIND, BUN_JOB_HANDLE_KIND, BUN_SCHEDULED_TASK_HANDLE_KIND, BUN_COMMAND_HANDLE_KIND],
  methodDecorators: [
    Get.definition,
    Post.definition,
    Put.definition,
    Patch.definition,
    Delete.definition,
    Options.definition,
    Head.definition,
  ],
  parameterInjectors: [Context.definition, Argument.definition, Option.definition, Flag.definition],
  middlewareDefinitions: [
    Object.freeze({
      compilerSymbol: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: "CsrfMiddleware" }),
      data: Object.freeze({ scope: "transient" as const, alias: "csrf" }),
    }),
    Object.freeze({
      compilerSymbol: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: "AuthenticateMiddleware" }),
      data: Object.freeze({ scope: "transient" as const, alias: "auth" }),
    }),
    Object.freeze({
      compilerSymbol: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: "GuestMiddleware" }),
      data: Object.freeze({ scope: "transient" as const, alias: "guest" }),
    }),
    Object.freeze({
      compilerSymbol: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: "AuthorizeMiddleware" }),
      data: Object.freeze({ scope: "transient" as const, alias: "can" }),
    }),
  ],
  metadataHandlers: [
    BUN_COMMAND_COMPILATION_HANDLER,
    BUN_COMMAND_IDENTITY_HANDLER,
    BUN_COMMAND_NO_CALLER_CONTRACT_HANDLER,
    BUN_APPLICATION_SCHEDULE_HANDLER,
    BUN_SCHEDULED_TASK_COMPILATION_HANDLER,
    BUN_SCHEDULE_NO_CALLER_CONTRACT_HANDLER,
    BUN_JOB_COMPILATION_HANDLER,
    BUN_QUEUE_IDENTITY_HANDLER,
    BUN_JOB_NO_CALLER_CONTRACT_HANDLER,
    BUN_HTTP_ROUTE_IDENTITY_HANDLER,
    BUN_HTTP_NO_CALLER_CONTRACT_HANDLER,
    BUN_REQUEST_BASE_CONTRACT_HANDLER,
    BUN_REQUEST_PARAMETER_RESOLVER_HANDLER,
  ],
});
