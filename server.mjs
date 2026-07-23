import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || process.env.T10_PORT || 4173);
const host = process.env.T10_HOST || "0.0.0.0";
const maxMessageBytes = 64 * 1024;
const rooms = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};

const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const corsHeaders = {
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range",
      "Cross-Origin-Resource-Policy": "cross-origin",
    };

    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders).end();
      return;
    }

    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { ...corsHeaders, Allow: "GET, HEAD, OPTIONS" }).end();
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(join(root, normalize(relativePath)));

    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const stat = statSync(filePath);
    if (!stat.isFile()) throw new Error("Not a file");

    const contentType = mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
    const range = request.headers.range;
    const commonHeaders = {
      ...corsHeaders,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": extname(filePath) === ".mp4" ? "public, max-age=86400" : "no-cache",
    };

    if (range) {
      const [startText, endText] = range.replace("bytes=", "").split("-");
      const start = Number(startText);
      const end = endText ? Number(endText) : stat.size - 1;

      if (!Number.isFinite(start) || start < 0 || end >= stat.size || start > end) {
        response.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end();
        return;
      }

      response.writeHead(206, {
        ...commonHeaders,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1,
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, { ...commonHeaders, "Content-Length": stat.size });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

const websocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: maxMessageBytes,
  perMessageDeflate: false,
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocketServer.emit("connection", websocket, request);
  });
});

websocketServer.on("connection", (socket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const room = (url.searchParams.get("room") || "t10-gate-02").trim().slice(0, 80);
  const peers = rooms.get(room) || new Set();
  rooms.set(room, peers);
  peers.add(socket);
  socket.isAlive = true;

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (raw, isBinary) => {
    if (isBinary || raw.byteLength > maxMessageBytes) return;

    let envelope;
    try {
      envelope = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!envelope || typeof envelope !== "object") return;
    if (envelope.room && envelope.room !== room) return;

    if (envelope.type === "ping" || envelope.message === "client.ping") {
      socket.send(
        JSON.stringify({
          type: "pong",
          message: "client.pong",
          room,
          timestamp: Date.now(),
        }),
      );
      return;
    }

    const payload = JSON.stringify({ ...envelope, room });
    for (const peer of peers) {
      if (peer !== socket && peer.readyState === WebSocket.OPEN) peer.send(payload);
    }
  });

  socket.on("close", () => {
    peers.delete(socket);
    if (!peers.size) rooms.delete(room);
  });
});

const heartbeat = setInterval(() => {
  for (const socket of websocketServer.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);

server.on("close", () => clearInterval(heartbeat));

server.listen(port, host, () => {
  console.log(`TRH interface online at http://${host}:${port}`);
});
