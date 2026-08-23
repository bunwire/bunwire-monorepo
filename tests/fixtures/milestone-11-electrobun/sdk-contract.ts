import type {
  BrowserView,
  BrowserWindow,
  ElectrobunRPCSchema,
  RPCSchema,
  WindowOptionsType,
} from "electrobun/bun";
import type {
  BunwireElectrobunSchema,
  ElectrobunMainWindowOptions,
  ElectrobunRPC,
  ElectrobunRpcOptions,
  ElectrobunWebview,
  ElectrobunWindow,
} from "@bunwire/electrobun";

type Assert<Condition extends true> = Condition;
type Extends<Actual, Expected> = Actual extends Expected ? true : false;

type _SchemaUsesNativeContract = Assert<Extends<BunwireElectrobunSchema, ElectrobunRPCSchema>>;
type NativeSchema = {
  bun: RPCSchema<{
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: Record<string, unknown>;
  }>;
  webview: RPCSchema<{
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: Record<string, unknown>;
  }>;
};
type NativeRPC = ReturnType<typeof BrowserView.defineRPC<NativeSchema>>;

declare const nativeRpc: NativeRPC;
declare const nativeWindow: BrowserWindow<NativeRPC>;

const bunwireRpc: ElectrobunRPC = nativeRpc;
const bunwireWindow: ElectrobunWindow = nativeWindow;
const bunwireWebview: ElectrobunWebview = nativeWindow.webview;
declare const bunwireNativeWindowOptions: Omit<
  ElectrobunMainWindowOptions,
  "x" | "y" | "width" | "height" | "configure"
>;
const nativeWindowOptions: Omit<Partial<WindowOptionsType<NativeRPC>>, "frame" | "rpc"> =
  bunwireNativeWindowOptions;
declare const configureWindow: NonNullable<ElectrobunMainWindowOptions["configure"]>;
declare const configureRpc: NonNullable<ElectrobunRpcOptions["configure"]>;
configureWindow(nativeWindow);
configureRpc(nativeRpc);

void bunwireRpc;
void bunwireWindow;
void bunwireWebview;
void nativeWindowOptions;
