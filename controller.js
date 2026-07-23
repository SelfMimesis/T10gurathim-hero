import RemoteBridge from "./remote-bridge.js";
import { resolveRemoteConfig, saveRemoteConfig } from "./remote-config.js";

const controller = document.querySelector("#controller");
const connectionToggle = document.querySelector("#connection-toggle");
const connectionLabel = document.querySelector("#connection-label");
const connectionDrawer = document.querySelector("#connection-drawer");
const connectionForm = document.querySelector("#connection-form");
const websocketUrl = document.querySelector("#websocket-url");
const websocketRoom = document.querySelector("#websocket-room");
const roomLabel = document.querySelector("#room-label");
const displayStatus = document.querySelector("#display-status");
const lastSignal = document.querySelector("#last-signal");
const versionCount = document.querySelector("#version-count");
const terminalModule = document.querySelector(".terminal-module");
const terminalReadout = document.querySelector("#terminal-readout");
const terminalOpenButton = document.querySelector("#terminal-open");
const terminalCloseButton = document.querySelector("#terminal-close");
const brightnessSlider = document.querySelector("#brightness-slider");
const brightnessReadout = document.querySelector("#brightness-readout");
const opacityValue = document.querySelector("#opacity-value");
const opacityCells = Array.from(document.querySelectorAll(".opacity-cells i"));
const doorAccessButton = document.querySelector("#door-access");
const extremeModule = document.querySelector("#extreme-module");
const extremeToggle = document.querySelector("#extreme-toggle");
const extremeReadout = document.querySelector("#extreme-readout");
const extremeAction = document.querySelector("#extreme-action");
const signalLines = document.querySelector("#signal-lines");
const transportLabel = document.querySelector("#transport-label");
const controllerFlash = document.querySelector("#controller-flash");
const liveRegion = document.querySelector("#live-region");

let remoteConfiguration = resolveRemoteConfig("controller");
let brightnessFrame = 0;
let remoteStateReceived = false;

const VERSION_FALLBACK = 7;
const COMMITS_ENDPOINT =
  "https://api.github.com/repos/SelfMimesis/T10gurathim-hero/commits?sha=main&per_page=1";

const state = {
  terminalOpen: false,
  brightness: 100,
  extreme: false,
  accessVisible: false,
};

const bridge = new RemoteBridge(remoteConfiguration);

const clock = () =>
  new Date().toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function addSignal(text, tone = "default") {
  const line = document.createElement("p");
  line.dataset.tone = tone;
  const time = document.createElement("time");
  const message = document.createElement("span");
  time.textContent = clock();
  message.textContent = text;
  line.append(time, message);
  signalLines.append(line);

  while (signalLines.children.length > 3) {
    signalLines.firstElementChild?.remove();
  }

  lastSignal.textContent = time.textContent;
}

function renderVersion(value) {
  const normalized = Math.max(1, Math.floor(Number(value) || VERSION_FALLBACK));
  versionCount.textContent = String(normalized).padStart(4, "0");
}

async function syncVersion() {
  renderVersion(VERSION_FALLBACK);

  try {
    const response = await fetch(COMMITS_ENDPOINT, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);

    const lastPage = response.headers
      .get("Link")
      ?.match(/[?&]page=(\d+)>;\s*rel="last"/)?.[1];
    if (lastPage) {
      renderVersion(lastPage);
      return;
    }

    const commits = await response.json();
    renderVersion(Array.isArray(commits) ? commits.length : VERSION_FALLBACK);
  } catch {
    // The embedded version remains available when GitHub cannot be reached.
  }
}

function haptic(pattern = 22) {
  navigator.vibrate?.(pattern);
}

function fireControl(element, color = "114 223 255") {
  element.classList.remove("is-firing");
  void element.offsetWidth;
  element.classList.add("is-firing");
  window.setTimeout(() => element.classList.remove("is-firing"), 560);

  const rect = element.getBoundingClientRect();
  controllerFlash.style.setProperty("--flash-x", `${((rect.left + rect.width / 2) / window.innerWidth) * 100}%`);
  controllerFlash.style.setProperty("--flash-y", `${((rect.top + rect.height / 2) / window.innerHeight) * 100}%`);
  controllerFlash.style.setProperty("--flash-color", color);
  controllerFlash.classList.remove("is-active");
  void controllerFlash.offsetWidth;
  controllerFlash.classList.add("is-active");
}

function renderTerminal() {
  terminalModule.dataset.open = String(state.terminalOpen);
  terminalReadout.textContent = state.terminalOpen ? "OPEN" : "CLOSED";
  terminalReadout.style.color = state.terminalOpen ? "var(--cyan)" : "";
}

function renderBrightness() {
  const level = Math.max(0, Math.min(100, Math.round(state.brightness)));
  const blackOpacity = Math.round((1 - level / 100) * 88);
  brightnessSlider.value = String(level);
  brightnessSlider.style.setProperty("--slider-fill", `${level}%`);
  brightnessReadout.textContent = `${String(level).padStart(3, "0")}%`;
  opacityValue.textContent = `${String(blackOpacity).padStart(2, "0")}%`;
  const activeCells = Math.round(blackOpacity / 8.8);
  opacityCells.forEach((cell, index) => cell.classList.toggle("is-active", index < activeCells));
}

function renderExtreme() {
  extremeModule.classList.toggle("is-active", state.extreme);
  extremeToggle.setAttribute("aria-pressed", String(state.extreme));
  extremeReadout.textContent = state.extreme ? "ONLINE" : "OFFLINE";
  extremeAction.textContent = state.extreme ? "DEACTIVATE EXTREME MODE" : "ACTIVATE EXTREME MODE";
  controller.classList.toggle("extreme-active", state.extreme);
}

function renderState() {
  renderTerminal();
  renderBrightness();
  renderExtreme();
  displayStatus.textContent = remoteStateReceived ? "STATE SYNCHRONIZED" : "COMMANDS READY";
}

function sendCommand(message, value, button, logText, options = {}) {
  bridge.send(message, value, { target: "display" });
  addSignal(`${message} // ${logText}`, options.tone);
  fireControl(button, options.color);
  haptic(options.haptic ?? 24);
  liveRegion.textContent = logText;
}

terminalOpenButton.addEventListener("click", () => {
  state.terminalOpen = true;
  renderTerminal();
  sendCommand("terminal.open", { open: true }, terminalOpenButton, "TERMINAL OPEN");
});

terminalCloseButton.addEventListener("click", () => {
  state.terminalOpen = false;
  renderTerminal();
  sendCommand("terminal.close", { open: false }, terminalCloseButton, "TERMINAL CLOSED", {
    color: "145 126 222",
  });
});

brightnessSlider.addEventListener("input", () => {
  state.brightness = Number(brightnessSlider.value);
  renderBrightness();
  window.cancelAnimationFrame(brightnessFrame);
  brightnessFrame = window.requestAnimationFrame(() => {
    bridge.send(
      "display.brightness",
      {
        level: state.brightness,
        blackLayerOpacity: Number(((1 - state.brightness / 100) * 0.88).toFixed(3)),
      },
      { target: "display" },
    );
    lastSignal.textContent = clock();
  });
});

brightnessSlider.addEventListener("change", () => {
  addSignal(`display.brightness // ${state.brightness}%`);
  haptic(14);
});

doorAccessButton.addEventListener("click", () => {
  state.accessVisible = true;
  sendCommand(
    "door.access",
    {
      visible: true,
      title: "ACCESS TO THE DOOR",
      duration: 4600,
    },
    doorAccessButton,
    "CLEARANCE POPUP SENT",
    { haptic: [30, 35, 45] },
  );
  window.setTimeout(() => {
    state.accessVisible = false;
  }, 4600);
});

extremeToggle.addEventListener("click", () => {
  state.extreme = !state.extreme;
  renderExtreme();
  sendCommand(
    "extreme.set",
    { enabled: state.extreme },
    extremeToggle,
    state.extreme ? "EXTREME MODE ONLINE" : "EXTREME MODE OFFLINE",
    {
      color: state.extreme ? "216 116 255" : "114 223 255",
      haptic: state.extreme ? [35, 25, 35, 25, 60] : 28,
      tone: state.extreme ? "extreme" : "default",
    },
  );
});

bridge.addEventListener("status", (event) => {
  const { status, delay } = event.detail;
  connectionToggle.dataset.state = status;
  transportLabel.textContent = status === "connected" ? "RENDER WEBSOCKET" : "BROADCAST CHANNEL";

  const labels = {
    idle: "INITIALIZING",
    local: "LOCAL RELAY",
    connecting: "CONNECTING",
    connected: "RENDER ONLINE",
    reconnecting: `RETRY ${delay ? `${Math.ceil(delay / 1000)}S` : ""}`,
    disconnected: "DISCONNECTED",
    error: "LINK ERROR",
  };
  connectionLabel.textContent = labels[status] ?? status.toUpperCase();

  if (status === "connected" || status === "local") {
    roomLabel.textContent = remoteConfiguration.room.toUpperCase();
    bridge.send("state.request", { requestedBy: remoteConfiguration.clientId }, { target: "display" });
    addSignal(status === "connected" ? "Render WebSocket uplink established." : "Local tab relay active.");
  }
});

bridge.addEventListener("message", (event) => {
  const envelope = event.detail;
  if (envelope.message !== "state.update") return;
  const incoming = envelope.value ?? {};
  if (typeof incoming.terminalOpen === "boolean") state.terminalOpen = incoming.terminalOpen;
  if (Number.isFinite(Number(incoming.brightness))) state.brightness = Number(incoming.brightness);
  if (typeof incoming.extreme === "boolean") state.extreme = incoming.extreme;
  if (typeof incoming.accessVisible === "boolean") state.accessVisible = incoming.accessVisible;
  remoteStateReceived = true;
  renderState();
  addSignal(`state.update // ${event.detail.transport.toUpperCase()}`);
});

function openConnectionDrawer() {
  connectionDrawer.classList.add("is-open");
  connectionDrawer.setAttribute("aria-hidden", "false");
  connectionToggle.setAttribute("aria-expanded", "true");
  websocketUrl.value = remoteConfiguration.endpoint;
  websocketRoom.value = remoteConfiguration.room;
  window.setTimeout(() => websocketUrl.focus(), 180);
}

function closeConnectionDrawer() {
  connectionDrawer.classList.remove("is-open");
  connectionDrawer.setAttribute("aria-hidden", "true");
  connectionToggle.setAttribute("aria-expanded", "false");
}

connectionToggle.addEventListener("click", openConnectionDrawer);
document.querySelector("#drawer-close").addEventListener("click", closeConnectionDrawer);
document.querySelector("#drawer-backdrop").addEventListener("click", closeConnectionDrawer);

connectionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const saved = saveRemoteConfig({
    endpoint: websocketUrl.value,
    room: websocketRoom.value,
  });
  remoteConfiguration = { ...remoteConfiguration, ...saved };
  roomLabel.textContent = saved.room.toUpperCase();
  bridge.reconfigure(saved);
  addSignal(saved.endpoint ? "Connecting to Render WebSocket…" : "Switched to local tab relay.");
  closeConnectionDrawer();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && connectionDrawer.classList.contains("is-open")) {
    closeConnectionDrawer();
  }
});

renderState();
syncVersion();
roomLabel.textContent = remoteConfiguration.room.toUpperCase();
websocketUrl.value = remoteConfiguration.endpoint;
websocketRoom.value = remoteConfiguration.room;
bridge.connect();

if (!remoteConfiguration.endpoint) {
  window.setTimeout(openConnectionDrawer, 650);
}
