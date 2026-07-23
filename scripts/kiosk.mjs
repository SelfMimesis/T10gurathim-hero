import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { get } from "node:http";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const url = "http://127.0.0.1:4173";
const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const browserPath = chromeCandidates.find(existsSync);
if (!browserPath) {
  throw new Error("No se encontró Chrome o Edge para iniciar el modo kiosco.");
}

if (process.argv.includes("--check")) {
  console.log(`Kiosk ready: ${browserPath}`);
  console.log(`Project root: ${root}`);
  process.exit(0);
}

const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});

function waitForServer(attempt = 0) {
  get(url, (response) => {
    response.resume();
    launchBrowser();
  }).on("error", () => {
    if (attempt > 50) {
      server.kill();
      throw new Error("El servidor local no respondió.");
    }
    setTimeout(() => waitForServer(attempt + 1), 100);
  });
}

function launchBrowser() {
  const browser = spawn(
    browserPath,
    [
      "--kiosk",
      `--app=${url}`,
      "--autoplay-policy=no-user-gesture-required",
      "--disable-pinch",
      "--overscroll-history-navigation=0",
      "--no-first-run",
      "--disable-session-crashed-bubble",
      `--user-data-dir=${resolve(root, ".kiosk-profile")}`,
    ],
    {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    },
  );

  browser.once("exit", () => server.kill());
}

process.once("SIGINT", () => server.kill());
process.once("SIGTERM", () => server.kill());
waitForServer();
