type RequestHandler = (method: string, payload: unknown) => unknown | Promise<unknown>;
type MessageHandler = (method: string, payload: unknown) => void;

export class FakeElectrobunRPC {
  requestHandler: RequestHandler | undefined;
  readonly messageHandlers = new Set<MessageHandler>();
  readonly outgoingMessages: Array<{ method: string; payload: unknown }> = [];
  readonly outgoingRequests: Array<{ method: string; payload: unknown }> = [];
  transport: object | undefined;
  readonly request = Object.assign(async (method: string, payload?: unknown) => {
    this.outgoingRequests.push({ method, payload });
    return { method, payload };
  }, {});
  readonly send = Object.assign((method: string, payload?: unknown) => {
    this.outgoingMessages.push({ method, payload });
  }, {});
  readonly proxy = { request: this.request, send: this.send };

  setTransport(transport: object): void { this.transport = transport; }
  setRequestHandler(handler: RequestHandler): void { this.requestHandler = handler; }
  addMessageListener(message: string, listener: MessageHandler): void {
    if (message !== "*") throw new Error("The fixture supports the wildcard listener only.");
    this.messageHandlers.add(listener);
  }
  removeMessageListener(_message: string, listener: (...args: unknown[]) => void): void {
    this.messageHandlers.delete(listener as MessageHandler);
  }
  receiveRequest(method: string, payload?: unknown): unknown | Promise<unknown> {
    if (!this.requestHandler) throw new Error(`No native request handler is installed for "${method}".`);
    return this.requestHandler(method, payload);
  }
  receiveMessage(method: string, payload?: unknown): void {
    for (const listener of this.messageHandlers) listener(method, payload);
  }
}

export class BrowserView {
  static nextId = 1;
  readonly id = BrowserView.nextId++;
  readonly windowId: number;
  readonly rpc: FakeElectrobunRPC;
  readonly scripts: string[] = [];
  url: string | undefined;
  html: string | undefined;
  constructor(options: { windowId?: number; rpc?: FakeElectrobunRPC } = {}) {
    this.windowId = options.windowId ?? 0;
    this.rpc = options.rpc ?? new FakeElectrobunRPC();
    this.rpc.setTransport({ nativeWebviewId: this.id });
  }
  static defineRPC(config: {
    handlers?: {
      requests?: RequestHandler | object;
      messages?: Record<string, MessageHandler>;
    };
  }): FakeElectrobunRPC {
    const rpc = new FakeElectrobunRPC();
    if (typeof config.handlers?.requests === "function") {
      rpc.setRequestHandler(config.handlers.requests as RequestHandler);
    }
    const wildcard = config.handlers?.messages?.["*"];
    if (wildcard) rpc.addMessageListener("*", wildcard);
    return rpc;
  }
  executeJavascript(script: string): void { this.scripts.push(script); }
  loadURL(url: string): void { this.url = url; }
  loadHTML(html: string): void { this.html = html; }
}

export class BrowserWindow {
  static nextId = 1;
  static readonly instances: BrowserWindow[] = [];
  readonly id = BrowserWindow.nextId++;
  readonly options: Record<string, unknown>;
  readonly frame: { x: number; y: number; width: number; height: number };
  readonly webview: BrowserView;
  title: string;
  visible = false;
  active = false;
  closed = false;
  constructor(options: Record<string, any> = {}) {
    this.options = options;
    this.title = options.title ?? "New Window";
    this.frame = options.frame ?? { x: 0, y: 0, width: 800, height: 600 };
    this.webview = new BrowserView({ windowId: this.id, rpc: options.rpc });
    BrowserWindow.instances.push(this);
  }
  show(): void { this.visible = true; this.active = true; }
  showInactive(): void { this.visible = true; this.active = false; }
  hide(): void { this.visible = false; }
  activate(): void { this.active = true; }
  close(): void { this.closed = true; }
  setTitle(title: string): void { this.title = title; }
}
