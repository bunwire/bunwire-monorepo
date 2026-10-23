const endpoint = process.env.BUNWIRE_SOCKET_URL!;
const cookie = process.env.BUNWIRE_COOKIE!;
const clients = [new WebSocket(endpoint, { headers: { Cookie: cookie } }),
  new WebSocket(endpoint, { headers: { Cookie: cookie } })];
const received: string[][] = [[], []];
const timeout = setTimeout(() => { console.error(JSON.stringify(received)); process.exit(2); }, 10_000);
for (const [index, socket] of clients.entries()) {
  socket.addEventListener("message", (event) => { received[index]!.push(String(event.data)); });
}
try {
  await Promise.all(clients.map((socket) => new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket upgrade failed")), { once: true });
  })));
  const waitFor = async (check: () => boolean) => {
    const started = Date.now();
    while (!check()) {
      if (Date.now() - started > 8_000) throw new Error(`Timed out: ${JSON.stringify(received)}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  await waitFor(() => received.every((items) => items.length > 0));
  clients[0]!.send(JSON.stringify({ type: "join", payload: { channel: "user:example-user" } }));
  clients[1]!.send(JSON.stringify({ type: "join", payload: { channel: "user:example-user" } }));
  await waitFor(() => received.every((items) => items.length > 1));
  clients[1]!.send(JSON.stringify({ type: "join", payload: { channel: "user:other" } }));
  await waitFor(() => received[1]!.length > 2);
  clients[0]!.send(JSON.stringify({ type: "chat", payload: { channel: "user:example-user", text: "shared" } }));
  await waitFor(() => received[1]!.some((item) => item.includes('"text":"shared"')));
  console.log(JSON.stringify(received));
} finally {
  clearTimeout(timeout);
  for (const socket of clients) socket.close();
}
