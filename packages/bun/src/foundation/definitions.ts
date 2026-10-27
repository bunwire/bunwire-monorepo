import { defineAdapterCompilerDescriptor, defineCompilerMetadataHandler, type ProjectInspectionHandlerData } from "@bunwire/core";
import {
  BUN_HTTP_NO_CALLER_CONTRACT_HANDLER,
  BUN_HTTP_ROUTE_KIND,
  bunHttpCompiledRoute,
  Context,
  Delete,
  Get,
  Head,
  Options,
  Patch,
  Post,
  Put,
} from "../http/http.js";
import {
  BUN_REQUEST_BASE_CONTRACT_HANDLER,
  BUN_REQUEST_KIND,
  BUN_REQUEST_PARAMETER_RESOLVER_HANDLER,
  Request,
} from "../http/request.js";
import { CsrfMiddleware } from "../security/csrf.js";
import { AuthenticateMiddleware, GuestMiddleware } from "../security/auth.js";
import { AuthorizeMiddleware } from "../security/authorization.js";
import { SignedUrlMiddleware } from "../http/signed-urls.js";
import { ThrottleMiddleware } from "../http/rate-limiting.js";
import { Job, BUN_JOB_KIND, BUN_JOB_HANDLE_KIND, BUN_JOB_COMPILATION_HANDLER, BUN_JOB_NO_CALLER_CONTRACT_HANDLER, type BunJobDefinition } from "../jobs/jobs.js";
import { Queue, BUN_QUEUE_IDENTITY_HANDLER } from "../jobs/queued-listeners.js";
import { Schedule, BUN_SCHEDULED_TASK_KIND, BUN_SCHEDULED_TASK_HANDLE_KIND, BUN_SCHEDULED_TASK_COMPILATION_HANDLER, BUN_APPLICATION_SCHEDULE_HANDLER, BUN_SCHEDULE_NO_CALLER_CONTRACT_HANDLER } from "../scheduling/scheduled-tasks.js";
import { Argument, Option, Flag, Command, BUN_COMMAND_KIND, BUN_COMMAND_HANDLE_KIND, BUN_COMMAND_COMPILATION_HANDLER, BUN_COMMAND_IDENTITY_HANDLER, BUN_COMMAND_NO_CALLER_CONTRACT_HANDLER } from "../commands/commands.js";
import { WebSocket, BUN_WEBSOCKET_KIND, BUN_WEBSOCKET_OPEN_KIND, BUN_WEBSOCKET_MESSAGE_KIND, BUN_WEBSOCKET_CLOSE_KIND, BUN_WEBSOCKET_DRAIN_KIND, BUN_WEBSOCKET_COMPILATION_HANDLER, BUN_WEBSOCKET_ROUTE_IDENTITY_HANDLER, BUN_WEBSOCKET_NO_CALLER_CONTRACT_HANDLER } from "../websocket/websocket.js";

const BUN_PROJECT_INSPECTION_HANDLER = defineCompilerMetadataHandler({
  id: "bun.project-inspection",
  data: Object.freeze({
    type: "bunwire.project-inspection",
    classes: Object.freeze([
      Object.freeze({ kindId: BUN_JOB_KIND.id, command: "jobs:list", describe: ({ data }: { readonly data: unknown }) => {
        const job = data as BunJobDefinition;
        return { id: job.id, queue: job.queue, tries: job.tries, timeout: job.timeout };
      } }),
      Object.freeze({ kindId: BUN_COMMAND_KIND.id, command: "commands:list", describe: ({ data }: { readonly data: unknown }) => {
        const command = data as { readonly name: string; readonly description?: string };
        return { name: command.name, description: command.description };
      } }),
    ]),
    methods: Object.freeze([
      Object.freeze({ kindId: BUN_HTTP_ROUTE_KIND.id, command: "routes:list", describe: (input: {
        readonly ownerKindId: string; readonly ownerData: unknown; readonly methodData: unknown;
        readonly methodName: string; readonly transportParameterCount: number;
      }) => {
        const route = bunHttpCompiledRoute(input);
        return { transport: "http", method: route.method, path: route.path };
      } }),
    ]),
    listenerAttachments: Object.freeze([Object.freeze({ definitionId: Queue.definition.id, delivery: "queued" })]),
  } satisfies ProjectInspectionHandlerData),
});

export const BUN_COMPILER_DESCRIPTOR = defineAdapterCompilerDescriptor({
  id: "bun.adapter",
  classKinds: [BUN_REQUEST_KIND, BUN_JOB_KIND, BUN_SCHEDULED_TASK_KIND, BUN_COMMAND_KIND, BUN_WEBSOCKET_KIND],
  classDecorators: [Request.definition, Job.definition, Schedule.definition, Command.definition, WebSocket.definition],
  classAttachments: [Queue.definition],
  methodKinds: [BUN_HTTP_ROUTE_KIND, BUN_JOB_HANDLE_KIND, BUN_SCHEDULED_TASK_HANDLE_KIND, BUN_COMMAND_HANDLE_KIND, BUN_WEBSOCKET_OPEN_KIND, BUN_WEBSOCKET_MESSAGE_KIND, BUN_WEBSOCKET_CLOSE_KIND, BUN_WEBSOCKET_DRAIN_KIND],
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
    Object.freeze({
      compilerSymbol: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: "SignedUrlMiddleware" }),
      data: Object.freeze({ scope: "transient" as const, alias: "signed" }),
    }),
    Object.freeze({
      compilerSymbol: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: "ThrottleMiddleware" }),
      data: Object.freeze({ scope: "transient" as const, alias: "throttle" }),
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
    BUN_WEBSOCKET_COMPILATION_HANDLER,
    BUN_WEBSOCKET_ROUTE_IDENTITY_HANDLER,
    BUN_WEBSOCKET_NO_CALLER_CONTRACT_HANDLER,
    BUN_HTTP_NO_CALLER_CONTRACT_HANDLER,
    BUN_REQUEST_BASE_CONTRACT_HANDLER,
    BUN_REQUEST_PARAMETER_RESOLVER_HANDLER,
    BUN_PROJECT_INSPECTION_HANDLER,
  ],
});
