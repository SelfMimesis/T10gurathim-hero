/**
 * Shared frontend configuration.
 *
 * Before publishing to GitHub Pages, set websocketUrl to the public Render
 * endpoint, for example: wss://your-service.onrender.com/ws
 *
 * URL parameters always take precedence:
 *   ?ws=wss%3A%2F%2Fyour-service.onrender.com%2Fws&room=t10-gate-02
 *
 * Do not place passwords or private API keys in this file: it is public code.
 */
export const TRH_CONFIG = Object.freeze({
  websocketUrl: "wss://t10gurathim-hero.onrender.com/ws",
  room: "t10-gate-02",
  videoUrl: "./assets/station-gate-masterloop.mp4",
  renderVideoUrl: "https://t10gurathim-hero.onrender.com/assets/station-gate-masterloop.mp4",
  reconnectBaseMs: 700,
  reconnectMaxMs: 12000,
  keepAliveMs: 20000,
});

function safeStorage(storage, action, key, value) {
  try {
    return value === undefined ? storage[action](key) : storage[action](key, value);
  } catch {
    return null;
  }
}

function normalizeEndpoint(value = "") {
  const endpoint = value.trim();
  if (!endpoint) return "";
  if (endpoint.startsWith("https://")) return `wss://${endpoint.slice(8)}`;
  if (endpoint.startsWith("http://")) return `ws://${endpoint.slice(7)}`;
  return endpoint;
}

function getClientId(role) {
  const key = `trh.client.${role}`;
  const existing = safeStorage(sessionStorage, "getItem", key);
  if (existing) return existing;
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(16).slice(2, 10);
  const clientId = `${role}-${suffix}`;
  safeStorage(sessionStorage, "setItem", key, clientId);
  return clientId;
}

export function resolveRemoteConfig(role) {
  const parameters = new URLSearchParams(window.location.search);
  const storedEndpoint = safeStorage(localStorage, "getItem", "trh.websocketUrl") ?? "";
  const storedRoom = safeStorage(localStorage, "getItem", "trh.websocketRoom") ?? "";

  return {
    endpoint: normalizeEndpoint(parameters.get("ws") || storedEndpoint || TRH_CONFIG.websocketUrl),
    room: (parameters.get("room") || storedRoom || TRH_CONFIG.room).trim(),
    role,
    clientId: parameters.get("client") || getClientId(role),
    reconnectBaseMs: TRH_CONFIG.reconnectBaseMs,
    reconnectMaxMs: TRH_CONFIG.reconnectMaxMs,
    keepAliveMs: TRH_CONFIG.keepAliveMs,
  };
}

export function saveRemoteConfig({ endpoint, room }) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const normalizedRoom = room.trim() || TRH_CONFIG.room;
  safeStorage(localStorage, "setItem", "trh.websocketUrl", normalizedEndpoint);
  safeStorage(localStorage, "setItem", "trh.websocketRoom", normalizedRoom);
  return { endpoint: normalizedEndpoint, room: normalizedRoom };
}

export function resolveVideoUrl() {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get("video")) return parameters.get("video");
  if (window.location.hostname.endsWith(".github.io")) return TRH_CONFIG.renderVideoUrl;
  return TRH_CONFIG.videoUrl;
}
