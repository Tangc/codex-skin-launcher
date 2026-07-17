#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const configPath = argument("--config");
const statusPath = argument("--status");
const port = Number(argument("--port", "9333"));
const parentPid = Number(argument("--parent-pid", "0"));
const logPath = path.join(path.dirname(statusPath), "injector.log");
const sessions = new Map();

let currentCSS = "";
let currentHash = "";
let configMtime = 0;
let stopping = false;
let lastStatusJSON = "";

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, line);
  } catch {
    // 日志不能影响皮肤注入。
  }
}

function writeStatus(state, targetCount, message, lastError = "") {
  const payload = {
    state,
    targetCount,
    message,
    lastError: lastError || null,
    updatedAt: new Date().toISOString(),
  };
  const comparable = JSON.stringify({ state, targetCount, message, lastError });
  if (comparable === lastStatusJSON) return;
  lastStatusJSON = comparable;
  try {
    const temporaryPath = `${statusPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
    fs.renameSync(temporaryPath, statusPath);
  } catch (error) {
    log(`写入状态失败：${error.message}`);
  }
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function validHex(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function hexToRGB(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

function quoteFont(value) {
  if (typeof value !== "string" || value.trim() === "") return "";
  const escaped = value.trim().replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
}

function mimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".heic":
    case ".heif": return "image/heic";
    default: return "image/jpeg";
  }
}

function wallpaperDataURL(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const data = fs.readFileSync(filePath);
  return `data:${mimeType(filePath)};base64,${data.toString("base64")}`;
}

function buildCSS(config) {
  if (!config.enabled) return "";

  const background = validHex(config.backgroundColor, "#0D1117");
  const foreground = validHex(config.foregroundColor, "#E8EDF5");
  const accent = validHex(config.accentColor, "#7C9CFF");
  const backgroundRGB = hexToRGB(background);
  const panelOpacity = clamp(config.panelOpacity, 0.25, 1, 0.78);
  const underOpacity = Math.max(0.22, panelOpacity - 0.2);
  const elevatedOpacity = Math.min(1, panelOpacity + 0.1);
  const overlayOpacity = clamp(config.overlayOpacity, 0, 0.95, 0.58);
  const blurRadius = clamp(config.blurRadius, 0, 30, 3);
  const brightness = clamp(config.brightness, 0.25, 1.5, 0.86);
  const saturation = clamp(config.saturation, 0, 2, 0.92);
  const fit = config.imageFit === "contain" ? "contain" : "cover";
  const dataURL = wallpaperDataURL(config.backgroundImagePath);
  const backgroundImage = dataURL
    ? `linear-gradient(rgb(${backgroundRGB} / ${overlayOpacity}), rgb(${backgroundRGB} / ${overlayOpacity})), url("${dataURL}")`
    : `linear-gradient(${background}, ${background})`;
  const uiFont = quoteFont(config.uiFontFamily);
  const codeFont = quoteFont(config.codeFontFamily);
  const fontRules = [
    uiFont ? `--font-sans: ${uiFont}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;` : "",
    uiFont ? `--vscode-font-family: ${uiFont}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;` : "",
    codeFont ? `--font-mono: ${codeFont}, "SFMono-Regular", Menlo, monospace !important;` : "",
    codeFont ? `--vscode-editor-font-family: ${codeFont}, "SFMono-Regular", Menlo, monospace !important;` : "",
  ].filter(Boolean).join("\n");

  return `
/* Codex Skin Launcher — generated stylesheet */
:root,
html,
html[data-codex-window-type],
body,
#root {
  --color-background-surface: rgb(${backgroundRGB} / ${panelOpacity}) !important;
  --color-background-surface-under: rgb(${backgroundRGB} / ${underOpacity}) !important;
  --color-background-elevated-primary: rgb(${backgroundRGB} / ${elevatedOpacity}) !important;
  --color-background-elevated-primary-opaque: rgb(${backgroundRGB} / ${elevatedOpacity}) !important;
  --color-background-elevated-secondary: rgb(${backgroundRGB} / ${Math.min(1, panelOpacity + 0.04)}) !important;
  --color-background-editor-opaque: rgb(${backgroundRGB} / ${panelOpacity}) !important;
  --color-token-main-surface-primary: rgb(${backgroundRGB} / ${panelOpacity}) !important;
  --vscode-editor-background: rgb(${backgroundRGB} / ${panelOpacity}) !important;
  --vscode-sideBar-background: rgb(${backgroundRGB} / ${underOpacity}) !important;
  --vscode-foreground: ${foreground} !important;
  --color-text-foreground: ${foreground} !important;
  --color-token-foreground: ${foreground} !important;
  --color-token-text-primary: ${foreground} !important;
  --vscode-textLink-foreground: ${accent} !important;
  --vscode-textLink-activeForeground: ${accent} !important;
  --vscode-focusBorder: ${accent} !important;
  --vscode-charts-blue: ${accent} !important;
  --color-token-text-link-foreground: ${accent} !important;
  --color-token-text-link-active-foreground: ${accent} !important;
  --color-token-focus-border: ${accent} !important;
  --color-token-charts-blue: ${accent} !important;
  ${fontRules}
}

html {
  background: ${background} !important;
}

body {
  background: transparent !important;
  isolation: isolate !important;
}

body::before {
  content: "" !important;
  position: fixed !important;
  inset: -32px !important;
  z-index: -1 !important;
  pointer-events: none !important;
  background-color: ${background} !important;
  background-image: ${backgroundImage} !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-size: ${fit} !important;
  filter: blur(${blurRadius}px) brightness(${brightness}) saturate(${saturation}) !important;
  transform: scale(1.025) !important;
  transform-origin: center !important;
}

#root,
.startup-loader,
[data-codex-window-type="electron"] {
  background-color: transparent !important;
}

.bg-token-main-surface-primary {
  background-color: rgb(${backgroundRGB} / ${panelOpacity}) !important;
}
`;
}

class CDPConnection {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextID = 1;
    this.pending = new Map();
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", async (event) => {
      try {
        let raw = event.data;
        if (typeof raw !== "string") {
          if (typeof raw?.text === "function") raw = await raw.text();
          else raw = Buffer.from(raw).toString("utf8");
        }
        const message = JSON.parse(raw);
        if (!message.id || !this.pending.has(message.id)) return;
        const { resolve, reject, timeout } = this.pending.get(message.id);
        clearTimeout(timeout);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || "CDP 请求失败"));
        else resolve(message.result || {});
      } catch (error) {
        log(`解析 CDP 消息失败：${error.message}`);
      }
    });
    this.socket.addEventListener("close", () => this.rejectAll(new Error("CDP 连接已关闭")));
    this.socket.addEventListener("error", () => this.rejectAll(new Error("CDP 连接失败")));

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("连接 Codex 调试端口超时")), 4000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("无法连接 Codex 调试端口"));
      }, { once: true });
    });
  }

  rejectAll(error) {
    for (const { reject, timeout } of this.pending.values()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.pending.clear();
  }

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextID++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, 5000);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  close() {
    try { this.socket?.close(); } catch { }
    this.socket = null;
  }
}

class SkinSession {
  constructor(target) {
    this.target = target;
    this.connection = new CDPConnection(target.webSocketDebuggerUrl);
    this.styleSheetID = "";
    this.lastHash = "";
    this.lastHealthCheck = 0;
  }

  async initialize() {
    await this.connection.connect();
    await this.connection.request("Page.enable");
    await this.connection.request("DOM.enable");
    await this.connection.request("CSS.enable");
    await this.createStyleSheet();
  }

  async createStyleSheet() {
    const frameTree = await this.connection.request("Page.getFrameTree");
    const frameID = frameTree?.frameTree?.frame?.id;
    if (!frameID) throw new Error("未找到 Codex 页面 Frame");
    const result = await this.connection.request("CSS.createStyleSheet", { frameId: frameID });
    this.styleSheetID = result.styleSheetId;
    if (!this.styleSheetID) throw new Error("无法创建皮肤样式表");
  }

  async apply(css, hash, forceHealthCheck = false) {
    if (!this.styleSheetID) await this.initialize();
    const now = Date.now();
    if (this.lastHash === hash && !forceHealthCheck && now - this.lastHealthCheck < 3500) return;

    try {
      await this.connection.request("CSS.setStyleSheetText", {
        styleSheetId: this.styleSheetID,
        text: css,
      });
    } catch {
      this.styleSheetID = "";
      await this.createStyleSheet();
      await this.connection.request("CSS.setStyleSheetText", {
        styleSheetId: this.styleSheetID,
        text: css,
      });
    }
    this.lastHash = hash;
    this.lastHealthCheck = now;
  }

  close() {
    this.connection.close();
  }
}

function loadConfigIfChanged() {
  const stat = fs.statSync(configPath);
  if (stat.mtimeMs === configMtime && currentHash) return false;
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  currentCSS = buildCSS(config);
  currentHash = crypto.createHash("sha256").update(currentCSS).digest("hex");
  configMtime = stat.mtimeMs;
  log(`已载入皮肤配置，样式 ${Math.round(currentCSS.length / 1024)} KB`);
  return true;
}

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1800) });
  if (!response.ok) throw new Error(`调试端口返回 ${response.status}`);
  const targets = await response.json();
  return targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
}

async function tick() {
  let configChanged = false;
  try {
    configChanged = loadConfigIfChanged();
  } catch (error) {
    writeStatus("error", sessions.size, "皮肤配置读取失败", error.message);
    return;
  }

  let targets;
  try {
    targets = await listTargets();
  } catch {
    writeStatus("waiting", 0, "等待 Codex 启动…");
    return;
  }

  const targetIDs = new Set(targets.map((target) => target.id));
  for (const [id, session] of sessions) {
    if (!targetIDs.has(id)) {
      session.close();
      sessions.delete(id);
    }
  }

  let lastError = "";
  for (const target of targets) {
    let session = sessions.get(target.id);
    if (!session || session.target.webSocketDebuggerUrl !== target.webSocketDebuggerUrl) {
      session?.close();
      session = new SkinSession(target);
      sessions.set(target.id, session);
    }
    try {
      await session.apply(currentCSS, currentHash, configChanged);
    } catch (error) {
      lastError = error.message;
      log(`页面 ${target.id} 注入失败：${error.message}`);
      session.close();
      sessions.delete(target.id);
    }
  }

  if (targets.length === 0) {
    writeStatus("waiting", 0, "等待 Codex 页面…");
  } else if (lastError && sessions.size === 0) {
    writeStatus("error", 0, "皮肤注入失败", lastError);
  } else {
    writeStatus("connected", sessions.size, currentCSS ? `皮肤已应用到 ${sessions.size} 个窗口` : "已恢复 Codex 原始外观");
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const session of sessions.values()) session.close();
  sessions.clear();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (error) => {
  log(`未捕获异常：${error.stack || error.message}`);
  writeStatus("error", sessions.size, "注入器异常", error.message);
});
process.on("unhandledRejection", (error) => {
  log(`未处理的异步异常：${error?.stack || error}`);
});

if (!configPath || !statusPath || !Number.isFinite(port)) {
  throw new Error("启动参数不完整");
}

log(`注入器启动，端口 ${port}`);
writeStatus("waiting", 0, "等待 Codex 启动…");

if (parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      shutdown();
    }
  }, 2000).unref();
}

while (!stopping) {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 900));
}
