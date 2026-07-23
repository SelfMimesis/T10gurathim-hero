import RemoteBridge from "./remote-bridge.js";
import { resolveRemoteConfig, resolveVideoUrl, TRH_CONFIG } from "./remote-config.js";

const stage = document.querySelector("#stage");
const video = document.querySelector("#background-video");
const svgMount = document.querySelector("#svg-mount");
const terminal = document.querySelector("#terminal");
const terminalLog = document.querySelector("#terminal-log");
const typedCommand = document.querySelector("#typed-command");
const terminalState = document.querySelector("#terminal-state");
const terminalClock = document.querySelector("#terminal-clock");
const effectsLayer = document.querySelector("#effects-layer");
const fullscreenZone = document.querySelector("#fullscreen-zone");
const fullscreenRecovery = document.querySelector("#fullscreen-recovery");
const loadingCover = document.querySelector("#loading-cover");
const loadingLabel = document.querySelector("#loading-label");
const glyphRain = document.querySelector("#glyph-rain");
const brightnessOverlay = document.querySelector("#brightness-overlay");
const doorAccessPopup = document.querySelector("#door-access-popup");
const telemetryLatency = document.querySelector("#telemetry-latency");
const telemetryEntropy = document.querySelector("#telemetry-entropy");
const packetRate = document.querySelector("#packet-rate");
const typingSignalBars = document.querySelector("#typing-signal-bars");

video.src = resolveVideoUrl();
video.addEventListener(
  "error",
  () => {
    const localVideoUrl = new URL(TRH_CONFIG.videoUrl, window.location.href).href;
    if (video.src !== localVideoUrl) video.src = localVideoUrl;
  },
  { once: true },
);

const CONTROL_NAMES = [
  "VECTOR-NORTH",
  "VECTOR-EAST",
  "VECTOR-SOUTH",
  "VECTOR-WEST",
  "ENTER",
  "CANCEL",
  "CHANNEL-A",
  "CHANNEL-B",
  "LINK-NORTH",
  "LINK-EAST",
  "LINK-SOUTH",
  "LINK-WEST",
  "FLOW-NORTH",
  "FLOW-EAST",
  "FLOW-SOUTH",
  "FLOW-WEST",
  "NODE-NORTH",
  "NODE-EAST",
  "NODE-SOUTH",
  "NODE-WEST",
  "AUX-NORTH",
  "AUX-SOUTH",
  "AUX-WEST",
];

const PANEL_NAMES = ["ALIGN", "INVERT", "SPLICE", "DEPLOY"];
const HUES = [197, 207, 228, 249, 188, 216];
const MATRIX_GLYPHS = "AEMNRSUVWXZ2568";
const MATRIX_PALETTE = ["#6fdcff", "#b3e7ff", "#75bde8", "#9c9ce9", "#b3bcc3", "#76e5db"];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const downloads = {
  cipher: 0,
  handshake: 0,
  payload: 0,
};

let interactionCount = 0;
let terminalAwake = false;
let commandAnimation = 0;
let pulseTimer = 0;
let impactTimer = 0;
let pulseFrame = 0;
let accessFrame = 0;
let audioContext;
let auraGroup;
let glyphRainResizeFrame = 0;
let glyphRainBurstTimer = 0;
let typingBarsTimer = 0;
let extremeMode = false;
let currentBrightness = 100;
let accessVisible = false;
let accessTimer = 0;
let accessHideTimer = 0;
let statePublishTimer = 0;
let remoteBridge;

const nowCode = () => {
  const now = new Date();
  return [
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  ]
    .map((part, index) => String(part).padStart(index === 3 ? 3 : 2, "0"))
    .join(":");
};

const hex = (length = 8) =>
  Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16))
    .join("")
    .toUpperCase();

const choose = (items) => items[Math.floor(Math.random() * items.length)];

function addLog(message, type = "") {
  const line = document.createElement("div");
  line.className = `log-line ${type}`.trim();
  line.dataset.time = nowCode().slice(0, 8);
  line.textContent = message;
  terminalLog.append(line);

  while (terminalLog.children.length > 7) {
    terminalLog.firstElementChild?.remove();
  }
}

function getDisplayState() {
  return {
    terminalOpen: terminalAwake,
    brightness: currentBrightness,
    extreme: extremeMode,
    accessVisible,
    videoPlaybackRate: video.playbackRate,
    timestamp: Date.now(),
  };
}

function publishState(immediate = false) {
  if (!remoteBridge) return;
  window.clearTimeout(statePublishTimer);
  const send = () => {
    remoteBridge.send("state.update", getDisplayState(), { target: "controller" });
  };
  if (immediate) {
    send();
  } else {
    statePublishTimer = window.setTimeout(send, 90);
  }
}

function setTerminalOpen(open, options = {}) {
  const { announce = true, publish = true } = options;
  const nextState = Boolean(open);
  const changed = terminalAwake !== nextState;
  terminalAwake = nextState;

  if (terminalAwake) {
    terminal.classList.remove("is-closed");
    terminal.classList.add("is-awake");
    terminalState.textContent = "LINK ACTIVE";
    if (announce && changed) {
      addLog("secure shell mounted on /dev/gate02", "success");
      addLog("visual cipher stream intercepted", "warning");
    }
  } else {
    terminal.classList.remove("is-awake", "is-pulsing");
    terminal.classList.add("is-closed");
    terminalState.textContent = "STANDBY";
    typedCommand.textContent = "";
  }

  if (changed && publish) publishState();
}

function setDisplayBrightness(level, options = {}) {
  const { publish = true } = options;
  const normalized = Math.max(0, Math.min(100, Number(level) || 0));
  const changed = Math.abs(currentBrightness - normalized) > 0.01;
  currentBrightness = normalized;
  const blackLayerOpacity = (1 - normalized / 100) * 0.88;
  brightnessOverlay.style.opacity = blackLayerOpacity.toFixed(3);
  if (changed && publish) publishState();
}

function setExtremeMode(enabled, options = {}) {
  const { publish = true, announce = true } = options;
  const nextState = Boolean(enabled);
  const changed = extremeMode !== nextState;
  extremeMode = nextState;
  stage.classList.toggle("extreme-mode", extremeMode);
  video.playbackRate = extremeMode ? 1.46 : 1;

  if (announce && changed) {
    addLog(
      extremeMode ? "[CORE] extreme render protocol engaged" : "[CORE] render protocol normalized",
      extremeMode ? "warning" : "success",
    );
  }

  if (changed && publish) publishState();
}

function hideAccessPopup(options = {}) {
  const { publish = true } = options;
  window.clearTimeout(accessTimer);
  window.clearTimeout(accessHideTimer);
  window.cancelAnimationFrame(accessFrame);
  if (!accessVisible) return;
  accessVisible = false;
  doorAccessPopup.classList.add("is-hiding");
  doorAccessPopup.setAttribute("aria-hidden", "true");
  accessHideTimer = window.setTimeout(() => {
    doorAccessPopup.classList.remove("is-visible", "is-hiding");
  }, 360);
  if (publish) publishState();
}

function showAccessPopup(value = {}, options = {}) {
  const { publish = true } = options;
  const duration = Math.max(1200, Math.min(15000, Number(value.duration) || 4600));
  const title = String(value.title || "ACCESS TO THE DOOR").slice(0, 64);
  doorAccessPopup.querySelector(".access-copy strong").textContent = title;
  doorAccessPopup.style.setProperty("--access-duration", `${duration}ms`);

  window.clearTimeout(accessTimer);
  window.clearTimeout(accessHideTimer);
  window.cancelAnimationFrame(accessFrame);
  doorAccessPopup.classList.remove("is-visible", "is-hiding");
  accessFrame = window.requestAnimationFrame(() => {
    doorAccessPopup.classList.add("is-visible");
  });
  doorAccessPopup.setAttribute("aria-hidden", "false");
  accessVisible = true;
  pulseInterface(extremeMode ? 281 : 194);
  accessTimer = window.setTimeout(() => hideAccessPopup(), duration);
  if (publish) publishState();
}

function typeCommand(command) {
  window.cancelAnimationFrame(commandAnimation);
  window.clearTimeout(typingBarsTimer);
  typedCommand.textContent = "";
  typingSignalBars.classList.toggle("is-typing", !reducedMotion);

  if (reducedMotion) {
    typedCommand.textContent = command;
    return;
  }

  let index = 0;
  let lastType = 0;
  const tick = (time) => {
    if (time - lastType > (extremeMode ? 0 : 18)) {
      const burstSize = extremeMode ? 4 + Math.floor(Math.random() * 4) : 1;
      index = Math.min(command.length, index + burstSize);
      typedCommand.textContent = command.slice(0, index);
      lastType = time;
    }
    if (index < command.length) {
      commandAnimation = window.requestAnimationFrame(tick);
    } else {
      typingBarsTimer = window.setTimeout(
        () => typingSignalBars.classList.remove("is-typing"),
        extremeMode ? 420 : 220,
      );
    }
  };
  commandAnimation = window.requestAnimationFrame(tick);
}

function wakeTerminal() {
  setTerminalOpen(true);
}

function createTerminalSequence(label, index) {
  const node = `TRH-${String((index % 12) + 1).padStart(2, "0")}`;
  const command = choose([
    `gatectl vector --node ${node} --input ${label.toLowerCase()}`,
    `./inject.sh --channel ${index + 1} --token 0x${hex(6)}`,
    `ssh -q root@${node.toLowerCase()} "sync --pulse ${label.toLowerCase()}"`,
    `curl -s trh://${node.toLowerCase()}/cipher/${hex(4)} | decrypt -x`,
  ]);

  typeCommand(command);
  addLog(`$ ${command}`, "command");
  addLog(
    choose([
      `[SCAN] route ${hex(4)}:${hex(4)} accepted`,
      `[AUTH] quantum signature ${hex(12)} verified`,
      `[DATA] ${Math.floor(240 + Math.random() * 760)} blocks mapped`,
      `[GATE] tactile vector ${label} injected`,
    ]),
    choose(["success", "warning", ""]),
  );

  if (interactionCount % 3 === 0) {
    window.setTimeout(() => {
      addLog(`[HASH] ${hex(8)}-${hex(8)}-${hex(8)}`, "success");
    }, 170);
  }
}

function updateDownloadElement(name) {
  const task = document.querySelector(`.download[data-task="${name}"]`);
  if (!task) return;
  task.classList.toggle("is-running", downloads[name] > 0 && downloads[name] < 100);
  task.classList.toggle("is-complete", downloads[name] >= 100);
  task.querySelector(".progress-fill").style.width = `${downloads[name]}%`;
  task.querySelector(".download-value").textContent = `${String(Math.floor(downloads[name])).padStart(2, "0")}%`;
}

function advanceDownloads(forceTask) {
  const taskNames = Object.keys(downloads);
  const selected = forceTask ?? taskNames[interactionCount % taskNames.length];

  if (downloads[selected] >= 100) {
    downloads[selected] = 0;
    addLog(`[QUEUE] ${selected.toUpperCase()} buffer recycled`, "warning");
  }

  downloads[selected] = Math.min(100, downloads[selected] + 9 + Math.random() * 19);
  updateDownloadElement(selected);
}

function createRipple(clientX, clientY, hue) {
  const rect = stage.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "cyber-ripple";
  ripple.style.left = `${clientX - rect.left}px`;
  ripple.style.top = `${clientY - rect.top}px`;
  ripple.style.setProperty("--ripple-hue", hue);
  effectsLayer.append(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });

  const slice = document.createElement("span");
  slice.className = "glitch-slice";
  slice.style.top = `${Math.max(0, Math.min(rect.height, clientY - rect.top))}px`;
  slice.style.setProperty("--slice-hue", hue);
  effectsLayer.append(slice);
  slice.addEventListener("animationend", () => slice.remove(), { once: true });
}

function createKeyAura(control, hue) {
  if (!auraGroup) return;

  const aura = control.cloneNode(false);
  aura.setAttribute("class", "key-aura");
  aura.removeAttribute("id");
  aura.removeAttribute("role");
  aura.removeAttribute("tabindex");
  aura.removeAttribute("aria-label");
  aura.removeAttribute("data-control");
  aura.style.setProperty("--aura-hue", hue);
  auraGroup.append(aura);

  while (auraGroup.childElementCount > 20) {
    auraGroup.firstElementChild?.remove();
  }

  aura.addEventListener("animationend", () => aura.remove(), { once: true });
  window.setTimeout(() => aura.remove(), extremeMode ? 1200 : 1050);
}

function pulseInterface(hue) {
  document.documentElement.style.setProperty("--pulse-hue", hue);
  boostGlyphRain();
  window.cancelAnimationFrame(pulseFrame);
  window.clearTimeout(pulseTimer);
  window.clearTimeout(impactTimer);
  terminal.classList.remove("is-pulsing");
  stage.classList.remove("is-impacting");
  pulseFrame = window.requestAnimationFrame(() => {
    terminal.classList.add("is-pulsing");
    stage.classList.add("is-impacting");
    pulseTimer = window.setTimeout(() => terminal.classList.remove("is-pulsing"), 720);
    impactTimer = window.setTimeout(() => stage.classList.remove("is-impacting"), 340);
  });
}

function playSyntheticClick(index, hue) {
  try {
    audioContext ??= new AudioContext();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(105 + (index % 8) * 18 + (hue % 11), now);
    oscillator.frequency.exponentialRampToValueAtTime(54 + (index % 5) * 9, now + 0.1);
    filter.type = "lowpass";
    filter.frequency.value = 680;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(extremeMode ? 0.07 : 0.035, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  } catch {
    // The visual interface remains fully functional if audio is unavailable.
  }
}

function activateControl(control, event, label, index) {
  const hue = HUES[index % HUES.length];
  interactionCount += 1;
  wakeTerminal();
  pulseInterface(hue);
  createTerminalSequence(label, index);
  advanceDownloads();
  if (extremeMode) advanceDownloads();
  playSyntheticClick(index, hue);
  video.play().catch(() => {});

  const rect = control.getBoundingClientRect();
  const clientX = event?.clientX || rect.left + rect.width / 2;
  const clientY = event?.clientY || rect.top + rect.height / 2;
  createKeyAura(control, hue);
  createRipple(clientX, clientY, hue);
  if (extremeMode) {
    createRipple(clientX + rect.width * 0.08, clientY - rect.height * 0.06, (hue + 42) % 360);
    addLog(`[OVERCLOCK] vector gain ${(2.4 + Math.random() * 5.6).toFixed(2)}x`, "warning");
  }

  control.classList.add("is-active");
  window.setTimeout(() => control.classList.remove("is-active"), 360);
}

function configureControl(control, label, index) {
  const hue = HUES[index % HUES.length];
  control.dataset.control = label;
  control.style.setProperty("--button-hue", hue);
  control.setAttribute("role", "button");
  control.setAttribute("tabindex", "0");
  control.setAttribute("aria-label", `Control ${label}`);

  control.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    control.setPointerCapture?.(event.pointerId);
    activateControl(control, event, label, index);
  });

  control.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateControl(control, null, label, index);
  });
}

function addLargePanelHitAreas(svg) {
  const sourcePanels = Array.from(svg.querySelectorAll("#UI_Line > path")).slice(0, 4);
  const panelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  panelGroup.id = "LARGE_PANEL_BUTTONS";

  sourcePanels.forEach((source, index) => {
    const hitArea = source.cloneNode(false);
    hitArea.removeAttribute("class");
    hitArea.classList.add("hot-panel");
    configureControl(hitArea, PANEL_NAMES[index], CONTROL_NAMES.length + index);
    panelGroup.append(hitArea);
  });

  svg.append(panelGroup);
}

async function mountSvgControls() {
  const response = await fetch("./assets/station-gate-controls.svg");
  if (!response.ok) throw new Error(`SVG ${response.status}`);

  const source = await response.text();
  const documentFragment = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = documentFragment.documentElement;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-label", "Botonera vectorial");

  auraGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  auraGroup.id = "KEY_AURAS";
  auraGroup.setAttribute("aria-hidden", "true");
  svg.insertBefore(auraGroup, svg.querySelector("#BUTTONS"));

  const controls = Array.from(svg.querySelectorAll("#BUTTONS path"));
  controls.forEach((control, index) => {
    configureControl(control, CONTROL_NAMES[index] ?? `CONTROL-${index + 1}`, index);
  });

  addLargePanelHitAreas(svg);
  svgMount.replaceChildren(svg);
  return controls.length + PANEL_NAMES.length;
}

async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
    if (screen.orientation?.lock) {
      await screen.orientation.lock("landscape").catch(() => {});
    }
    await video.play().catch(() => {});
    fullscreenRecovery.classList.remove("is-visible");
  } catch {
    fullscreenRecovery.classList.add("is-visible");
    window.setTimeout(() => fullscreenRecovery.classList.remove("is-visible"), 3600);
  }
}

fullscreenZone.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  enterFullscreen();
});

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) {
    fullscreenRecovery.classList.remove("is-visible");
    return;
  }

  fullscreenRecovery.classList.add("is-visible");
  window.setTimeout(() => fullscreenRecovery.classList.remove("is-visible"), 4800);
});

document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("dragstart", (event) => event.preventDefault());

function buildGlyphRain() {
  const streamCount = Math.max(20, Math.min(42, Math.round(glyphRain.clientWidth / 48)));
  const fragment = document.createDocumentFragment();

  for (let streamIndex = 0; streamIndex < streamCount; streamIndex += 1) {
    const stream = document.createElement("span");
    const glyphCount = 5 + Math.floor(Math.random() * 4);
    const duration = 3.8 + Math.random() * 3.4;
    const extremeDuration = 1.25 + Math.random() * 1.5;
    stream.className = `glyph-stream${streamIndex % 7 === 0 ? " is-hot" : ""}`;
    stream.style.setProperty("--stream-x", `${((streamIndex + 0.35 + Math.random() * 0.3) / streamCount) * 100}%`);
    stream.style.setProperty("--stream-color", MATRIX_PALETTE[streamIndex % MATRIX_PALETTE.length]);
    stream.style.setProperty("--rain-duration", `${duration.toFixed(2)}s`);
    stream.style.setProperty("--rain-extreme-duration", `${extremeDuration.toFixed(2)}s`);
    stream.style.setProperty("--rain-delay", `${(-Math.random() * duration).toFixed(2)}s`);
    stream.style.setProperty("--rain-drift", `${(-0.45 + Math.random() * 0.9).toFixed(2)}cqw`);

    for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex += 1) {
      const glyph = document.createElement("i");
      glyph.textContent = MATRIX_GLYPHS[(streamIndex * 5 + glyphIndex * 3) % MATRIX_GLYPHS.length];
      glyph.style.setProperty("--glyph-alpha", (1 - glyphIndex / (glyphCount + 1)).toFixed(2));
      stream.append(glyph);
    }

    fragment.append(stream);
  }

  glyphRain.replaceChildren(fragment);
}

function scheduleGlyphRainBuild() {
  window.cancelAnimationFrame(glyphRainResizeFrame);
  glyphRainResizeFrame = window.requestAnimationFrame(buildGlyphRain);
}

function boostGlyphRain() {
  window.clearTimeout(glyphRainBurstTimer);
  glyphRain.classList.remove("is-bursting");
  window.requestAnimationFrame(() => {
    glyphRain.classList.add("is-bursting");
    glyphRainBurstTimer = window.setTimeout(() => glyphRain.classList.remove("is-bursting"), 760);
  });
}

function updateTelemetry() {
  terminalClock.textContent = nowCode();
  telemetryLatency.textContent = `${(1.5 + Math.random() * 5.8).toFixed(1).padStart(4, "0")} MS`;
  telemetryEntropy.textContent = `${(82 + Math.random() * 17).toFixed(2)}%`;
  packetRate.textContent = `${(terminalAwake ? 1.2 + Math.random() * 8.7 : 0).toFixed(2)} TB/S`;
}

function backgroundTransfers() {
  if (!terminalAwake) return;
  const active = Object.keys(downloads).filter((name) => downloads[name] > 0 && downloads[name] < 100);
  active.forEach((name) => {
    const gain = extremeMode ? 2.8 + Math.random() * 5.2 : 0.8 + Math.random() * 2.3;
    downloads[name] = Math.min(100, downloads[name] + gain);
    updateDownloadElement(name);
    if (downloads[name] === 100) {
      addLog(`[DONE] ${name.toUpperCase()} checksum ${hex(6)} OK`, "success");
    }
  });
}

function valueAsBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "enabled" in value) return Boolean(value.enabled);
  if (value && typeof value === "object" && "open" in value) return Boolean(value.open);
  if (typeof value === "string") return ["true", "1", "on", "open", "enabled"].includes(value.toLowerCase());
  return fallback;
}

function initializeRemoteBridge() {
  remoteBridge = new RemoteBridge(resolveRemoteConfig("display"));

  remoteBridge.addEventListener("status", (event) => {
    const { status } = event.detail;
    if (status === "connected") {
      addLog("[LINK] Render WebSocket uplink established", "success");
      publishState(true);
    } else if (status === "local") {
      publishState(true);
    } else if (status === "error") {
      addLog("[LINK] remote transport interrupted", "warning");
    }
  });

  remoteBridge.addEventListener("message", (event) => {
    const { message, value } = event.detail;

    switch (message) {
      case "terminal.open":
        setTerminalOpen(true);
        break;
      case "terminal.close":
        setTerminalOpen(false);
        break;
      case "terminal.set":
        setTerminalOpen(valueAsBoolean(value, terminalAwake));
        break;
      case "display.brightness": {
        const level = typeof value === "object" ? value?.level : value;
        setDisplayBrightness(level);
        break;
      }
      case "door.access":
        if (value?.visible === false) {
          hideAccessPopup();
        } else {
          showAccessPopup(value);
        }
        break;
      case "door.access.hide":
        hideAccessPopup();
        break;
      case "extreme.set":
        setExtremeMode(valueAsBoolean(value, extremeMode));
        break;
      case "extreme.toggle":
        setExtremeMode(!extremeMode);
        break;
      case "state.request":
        publishState(true);
        break;
      default:
        break;
    }
  });

  remoteBridge.connect();
}

async function initialize() {
  try {
    loadingLabel.textContent = "MAPPING VECTOR CONTROLS";
    const controlCount = await mountSvgControls();
    loadingLabel.textContent = `${controlCount} TACTILE VECTORS ONLINE`;

    if (video.readyState < 2) {
      await new Promise((resolve) => {
        video.addEventListener("loadeddata", resolve, { once: true });
        window.setTimeout(resolve, 3500);
      });
    }

    await document.fonts.ready;
    buildGlyphRain();
    addLog("$ trh-gate --standby --channel=02", "command");
    addLog("[SYS] awaiting tactile vector...", "");
    publishState(true);
    window.setTimeout(() => loadingCover.classList.add("is-hidden"), 420);

    // Visual QA hook: opening the local page with ?demo=1 fires one vector
    // without changing the normal installation behaviour.
    if (new URLSearchParams(window.location.search).has("demo")) {
      window.setTimeout(() => {
        const control = svgMount.querySelector("#BUTTONS path");
        if (!control) return;
        const rect = control.getBoundingClientRect();
        activateControl(
          control,
          { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
          control.dataset.control,
          0,
        );
      }, 900);
    }

    if (new URLSearchParams(window.location.search).has("remoteDemo")) {
      window.setTimeout(() => {
        setTerminalOpen(true);
        setDisplayBrightness(72);
        setExtremeMode(true);
        showAccessPopup({ duration: 9000 });
      }, 780);
    }

    if (new URLSearchParams(window.location.search).has("extremeDemo")) {
      window.setTimeout(() => {
        setTerminalOpen(true);
        setExtremeMode(true);
        advanceDownloads("cipher");
        advanceDownloads("handshake");
        advanceDownloads("payload");
        createTerminalSequence("OVERCLOCK", 9);
      }, 780);
    }
  } catch (error) {
    loadingLabel.textContent = "INTERFACE DEGRADED // CHECK LOCAL SERVER";
    console.error(error);
    window.setTimeout(() => loadingCover.classList.add("is-hidden"), 1800);
  }
}

window.addEventListener("resize", scheduleGlyphRainBuild, { passive: true });
window.setInterval(updateTelemetry, 280);
window.setInterval(backgroundTransfers, 460);
initializeRemoteBridge();
initialize();
