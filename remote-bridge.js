const LOCAL_CHANNEL = "trh-connect-v1";

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function dispatch(target, name, detail) {
  target.dispatchEvent(new CustomEvent(name, { detail }));
}

function normalizeIncoming(raw) {
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return { message: data, value: null };
    }
  }

  if (!data || typeof data !== "object") return null;
  if (data.data && typeof data.data === "object" && data.data.message) return data.data;
  if (data.command && !data.message) return { ...data, message: data.command };
  return data;
}

export class RemoteBridge extends EventTarget {
  constructor(configuration) {
    super();
    this.configuration = { ...configuration };
    this.socket = null;
    this.localChannel = "BroadcastChannel" in window ? new BroadcastChannel(LOCAL_CHANNEL) : null;
    this.status = "idle";
    this.retryCount = 0;
    this.reconnectTimer = 0;
    this.keepAliveTimer = 0;
    this.manualClose = false;
    this.seenIds = new Map();

    this.localChannel?.addEventListener("message", (event) => {
      this.receive(event.data, "local");
    });
  }

  setStatus(status, detail = {}) {
    this.status = status;
    dispatch(this, "status", { status, ...detail });
  }

  connect() {
    this.manualClose = false;
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();

    if (!this.configuration.endpoint) {
      this.setStatus("local", { message: "Local tab relay active" });
      return;
    }

    let endpoint;
    try {
      endpoint = new URL(this.configuration.endpoint);
      if (!["ws:", "wss:"].includes(endpoint.protocol)) throw new Error("Invalid WebSocket protocol");
      endpoint.searchParams.set("room", this.configuration.room);
      endpoint.searchParams.set("role", this.configuration.role);
      endpoint.searchParams.set("client", this.configuration.clientId);
    } catch (error) {
      this.setStatus("error", { message: error.message });
      return;
    }

    this.setStatus(this.retryCount ? "reconnecting" : "connecting");
    const socket = new WebSocket(endpoint);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.retryCount = 0;
      this.setStatus("connected");
      this.sendSocket({
        type: "hello",
        message: "client.hello",
        value: {
          role: this.configuration.role,
          clientId: this.configuration.clientId,
          protocol: "trh-connect-v1",
        },
      });
      this.startKeepAlive();
    });

    socket.addEventListener("message", (event) => this.receive(event.data, "websocket"));

    socket.addEventListener("error", () => {
      if (this.socket === socket) this.setStatus("error", { message: "WebSocket transport error" });
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      window.clearInterval(this.keepAliveTimer);
      if (this.manualClose) {
        this.setStatus("disconnected", { code: event.code });
        return;
      }
      this.scheduleReconnect(event.code);
    });
  }

  reconfigure(configuration) {
    this.configuration = { ...this.configuration, ...configuration };
    this.retryCount = 0;
    this.connect();
  }

  scheduleReconnect(code) {
    const base = this.configuration.reconnectBaseMs ?? 700;
    const maximum = this.configuration.reconnectMaxMs ?? 12000;
    const delay = Math.min(maximum, base * 2 ** this.retryCount) * (0.82 + Math.random() * 0.36);
    this.retryCount += 1;
    this.setStatus("reconnecting", { code, delay: Math.round(delay) });
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  startKeepAlive() {
    window.clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = window.setInterval(() => {
      this.sendSocket({
        type: "ping",
        message: "client.ping",
        value: Date.now(),
      });
    }, this.configuration.keepAliveMs ?? 20000);
  }

  sendSocket(partial) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(
      JSON.stringify({
        room: this.configuration.room,
        sender: this.configuration.clientId,
        timestamp: Date.now(),
        ...partial,
      }),
    );
    return true;
  }

  send(message, value = null, options = {}) {
    const envelope = {
      type: "trh:message",
      id: createId(),
      protocol: "trh-connect-v1",
      room: this.configuration.room,
      sender: this.configuration.clientId,
      role: this.configuration.role,
      target: options.target ?? "all",
      timestamp: Date.now(),
      message,
      value,
    };

    this.markSeen(envelope.id);
    this.localChannel?.postMessage(envelope);
    this.sendSocket(envelope);
    dispatch(this, "sent", envelope);
    return envelope;
  }

  receive(raw, transport) {
    const envelope = normalizeIncoming(raw);
    if (!envelope) return;
    if (envelope.type === "pong" || envelope.message === "client.pong") return;
    if (envelope.id && this.seenIds.has(envelope.id)) return;
    if (envelope.id) this.markSeen(envelope.id);
    if (envelope.room && envelope.room !== this.configuration.room) return;
    if (envelope.sender === this.configuration.clientId) return;
    if (envelope.target && !["all", this.configuration.role].includes(envelope.target)) return;

    dispatch(this, "message", {
      ...envelope,
      transport,
    });
  }

  markSeen(id) {
    const now = Date.now();
    this.seenIds.set(id, now);
    if (this.seenIds.size < 160) return;
    for (const [messageId, timestamp] of this.seenIds) {
      if (now - timestamp > 120000) this.seenIds.delete(messageId);
    }
  }

  close() {
    this.manualClose = true;
    window.clearTimeout(this.reconnectTimer);
    window.clearInterval(this.keepAliveTimer);
    this.socket?.close(1000, "Client closed");
    this.localChannel?.close();
    this.setStatus("disconnected");
  }
}

export default RemoteBridge;
