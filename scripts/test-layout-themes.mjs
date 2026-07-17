#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { isMainCodexTarget, targetFixtures } from "../Resources/target-filter.js";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

const targetBase = { type: "page", webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/test" };
assert.equal(isMainCodexTarget({ ...targetBase, url: targetFixtures.main }), true);
assert.equal(isMainCodexTarget({ ...targetBase, url: targetFixtures.avatarOverlay }), false);
assert.equal(isMainCodexTarget({ ...targetBase, url: targetFixtures.petSurface }), false);
assert.equal(isMainCodexTarget({ ...targetBase, url: "app://-/index.html?initialRoute=%2Fsettings" }), false);
console.log("PASS target-filter-fixtures");

if (!chromePath) {
  console.log("Chrome 未安装，跳过浏览器级布局测试。");
  process.exit(0);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForFile(filePath, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (fs.existsSync(filePath)) return;
    await sleep(80);
  }
  throw new Error("等待 Chrome 调试端口超时");
}

class CdpConnection {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP WebSocket 连接超时")), 5000);
      this.socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket 连接失败")); }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject, timeout } = this.pending.get(message.id);
      clearTimeout(timeout);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
    });
  }

  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, 5000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-layout-test-"));
const activePortPath = path.join(temporaryDirectory, "DevToolsActivePort");
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=1440,900",
  "--allow-file-access-from-files",
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=0",
  `--user-data-dir=${temporaryDirectory}`,
  "about:blank",
], { stdio: "ignore" });
let injector = null;
let auxiliaryConnection = null;

try {
  await waitForFile(activePortPath);
  const [port] = fs.readFileSync(activePortPath, "utf8").trim().split(/\r?\n/);
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (!page) throw new Error("Chrome 没有可用的页面目标");

  const connection = new CdpConnection(page.webSocketDebuggerUrl);
  await connection.connect();
  await connection.request("Page.enable");
  await connection.request("Runtime.enable");

  for (const theme of ["original", "wechat", "feishu", "qq2007"]) {
    const url = `${pathToFileURL(path.join(projectDirectory, "tests", "layout-harness.html")).href}?theme=${theme}`;
    await connection.request("Page.navigate", { url });

    let passed = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(75);
      const evaluation = await connection.request("Runtime.evaluate", {
        expression: `document.querySelector("#test-result")?.dataset.passed === "true"`,
        returnByValue: true,
      });
      passed = evaluation.result?.value === true;
      if (passed) break;
    }
    if (!passed) throw new Error(`${theme} 布局注入测试失败`);

    if (process.env.CODEX_SKIN_TEST_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.CODEX_SKIN_TEST_SCREENSHOT_DIR, { recursive: true });
      const screenshot = await connection.request("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.writeFileSync(path.join(process.env.CODEX_SKIN_TEST_SCREENSHOT_DIR, `${theme}.png`), Buffer.from(screenshot.data, "base64"));
    }
    console.log(`PASS ${theme}`);
  }

  const filterUrl = pathToFileURL(path.join(projectDirectory, "tests", "sidebar-filter-harness.html")).href;
  await connection.request("Page.navigate", { url: filterUrl });
  let filterReady = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(75);
    const evaluation = await connection.request("Runtime.evaluate", {
      expression: `Boolean(globalThis.__sidebarFilterHarnessReady && document.getElementById("codex-skin-sidebar-filter-host")?.shadowRoot)`,
      returnByValue: true,
    });
    filterReady = evaluation.result?.value === true;
    if (filterReady) break;
  }
  if (!filterReady) throw new Error("侧边栏筛选器没有挂载");

  const filterEvaluation = await connection.request("Runtime.evaluate", {
    expression: `(async () => {
      const api = globalThis.__codexSkinSidebarFilter;
      const host = document.getElementById("codex-skin-sidebar-filter-host");
      const shadow = host.shadowRoot;
      const input = shadow.querySelector("input");
      const hidden = (selector) => document.querySelector(selector)?.hasAttribute("data-codex-sidebar-filter-hidden");
      const wait = (milliseconds = 180) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const type = async (value) => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        await wait();
      };
      const assert = (condition, message) => { if (!condition) throw new Error(message); };

      assert(api.getState().total === 4, "初始任务数量错误");
      assert(api.getState().running === 1, "初始执行中数量错误");

      await type("Windows");
      assert(input.value === "Windows", "搜索框不应改写用户输入");
      assert(!hidden('[data-test-task="windows"]'), "任务名称匹配失败");
      assert(hidden('[data-test-task="docs"]'), "未匹配任务没有隐藏");
      assert(hidden('[data-test-task="pinned-release"]'), "未匹配置顶任务没有隐藏");
      assert(!hidden('[data-test-project="alpha"]') && hidden('[data-test-project="beta"]'), "任务所属项目显示错误");

      await type("Alpha Workspace");
      assert(!hidden('[data-test-task="windows"]') && !hidden('[data-test-task="docs"]'), "项目名称匹配没有显示项目任务");
      assert(hidden('[data-test-helper]'), "筛选时辅助行应隐藏");

      await type("");
      shadow.querySelector('button[data-mode="running"]').click();
      await wait();
      assert(api.getState().mode === "running" && api.getState().visible === 1, "执行中筛选结果错误");
      assert(!hidden('[data-test-task="windows"]') && hidden('[data-test-task="background"]'), "执行中任务显示错误");

      document.querySelector('[data-test-status]').classList.add("animate-spin");
      await wait();
      assert(api.getState().running === 2 && api.getState().visible === 2, "运行状态变化没有实时更新");
      assert(!hidden('[data-test-project="beta"]'), "新增执行中任务的项目没有显示");

      shadow.querySelector(".clear-query").click();
      await wait(40);
      assert(api.getState().mode === "all" && api.getState().query === "" && api.getState().visible === 4, "清除筛选没有恢复列表");
      assert(!hidden('[data-test-helper]'), "清除筛选没有恢复辅助行");

      await type("不存在的任务");
      assert(!shadow.querySelector('[data-field="empty"]').hidden, "空结果提示没有显示");
      api.setFilter({ query: "", mode: "all" });
      return api.getState();
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (filterEvaluation.exceptionDetails) {
    throw new Error(filterEvaluation.exceptionDetails.exception?.description || "侧边栏筛选测试失败");
  }
  console.log("PASS sidebar-filter");

  const cleanUrl = `${pathToFileURL(path.join(projectDirectory, "tests", "layout-harness.html")).href}?theme=original`;
  await connection.request("Page.navigate", { url: cleanUrl });
  await sleep(250);
  const auxiliaryUrl = `${pathToFileURL(path.join(projectDirectory, "tests", "layout-harness.html")).href}?theme=original&role=desktop-pet`;
  const auxiliaryTarget = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(auxiliaryUrl)}`, { method: "PUT" }).then((response) => response.json());
  auxiliaryConnection = new CdpConnection(auxiliaryTarget.webSocketDebuggerUrl);
  await auxiliaryConnection.connect();
  await auxiliaryConnection.request("Runtime.enable");
  await sleep(200);
  const configPath = path.join(temporaryDirectory, "config.json");
  const statusPath = path.join(temporaryDirectory, "status.json");
  fs.writeFileSync(configPath, JSON.stringify({
    enabled: true,
    quotaBarEnabled: true,
    layoutTheme: "qq2007",
    backgroundImagePath: "",
    backgroundColor: "#0D1117",
    foregroundColor: "#E8EDF5",
    accentColor: "#7C9CFF",
    overlayOpacity: 0.58,
    panelOpacity: 0.78,
    blurRadius: 3,
    brightness: 0.86,
    saturation: 0.92,
    imageFit: "cover",
    uiFontFamily: "",
    codeFontFamily: ""
  }, null, 2));
  injector = spawn(process.execPath, [
    path.join(projectDirectory, "Resources", "skin-injector.js"),
    "--config", configPath,
    "--status", statusPath,
    "--port", port,
    "--parent-pid", String(process.pid),
  ], {
    stdio: "ignore",
    env: {
      ...process.env,
      CODEX_SKIN_TEST_TARGET_URL: cleanUrl,
      CODEX_SKIN_TEST_RATE_LIMIT_JSON: JSON.stringify({
        status: "ready",
        updatedAt: new Date().toISOString(),
        result: {
          rateLimits: {
            limitId: "codex",
            primary: { usedPercent: 72, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 1800 },
          },
          rateLimitsByLimitId: null,
          rateLimitResetCredits: { availableCount: 0 },
        },
      }),
    },
  });

  let injectorPassed = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(100);
    const evaluation = await connection.request("Runtime.evaluate", {
      expression: `document.documentElement.dataset.codexLayoutTheme === "qq2007"
        && document.getElementById("codex-skin-layout-host")?.shadowRoot?.querySelector(".quota-bar")?.getAttribute("aria-valuenow") === "28"
        && typeof globalThis.__codexSkinSidebarFilter?.apply === "function"`,
      returnByValue: true,
    });
    injectorPassed = evaluation.result?.value === true;
    if (injectorPassed) break;
  }
  if (!injectorPassed) throw new Error("CDP 注入器没有应用 QQ 2007 布局");
  let injectorStatus = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (fs.existsSync(statusPath)) {
      injectorStatus = JSON.parse(fs.readFileSync(statusPath, "utf8"));
      if (injectorStatus.state === "connected") break;
    }
    await sleep(50);
  }
  if (!injectorStatus) throw new Error("CDP 注入器没有写入状态");
  if (injectorStatus.state !== "connected") throw new Error(`CDP 注入器状态异常：${injectorStatus.message}`);
  if (injectorStatus.targetCount !== 1) throw new Error(`CDP 注入器错误连接了 ${injectorStatus.targetCount} 个窗口`);
  console.log("PASS cdp-injector");

  const auxiliaryEvaluation = await auxiliaryConnection.request("Runtime.evaluate", {
    expression: `!document.documentElement.hasAttribute("data-codex-layout-theme")
      && !document.getElementById("codex-skin-layout-host")
      && !globalThis.__codexSkinSidebarFilter`,
    returnByValue: true,
  });
  if (auxiliaryEvaluation.result?.value !== true) throw new Error("桌面宠物模拟窗口被错误注入皮肤");
  console.log("PASS cdp-main-window-only");

  const restoredConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  restoredConfig.layoutTheme = "original";
  fs.writeFileSync(configPath, JSON.stringify(restoredConfig, null, 2));
  let restored = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(100);
    const evaluation = await connection.request("Runtime.evaluate", {
      expression: `!document.documentElement.hasAttribute("data-codex-layout-theme")
        && document.getElementById("codex-skin-layout-host")?.shadowRoot?.querySelector(".quota-bar")?.getAttribute("aria-valuenow") === "28"`,
      returnByValue: true,
    });
    restored = evaluation.result?.value === true;
    if (restored) break;
  }
  if (!restored) throw new Error("CDP 注入器没有恢复原始布局");
  console.log("PASS cdp-restore");
  injector.kill("SIGTERM");
  injector = null;
  auxiliaryConnection.close();
  auxiliaryConnection = null;
  connection.close();
} finally {
  injector?.kill("SIGTERM");
  auxiliaryConnection?.close();
  chrome.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => chrome.once("exit", resolve)), sleep(1500)]);
  if (chrome.exitCode === null) chrome.kill("SIGKILL");
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
