import fs from "node:fs";
import { spawn } from "node:child_process";

const NEWLINE = "\n";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeSparse(previous, patch) {
  if (!isObject(patch)) return previous;
  const result = isObject(previous) ? { ...previous } : {};
  for (const [key, value] of Object.entries(patch)) {
    // 额度更新通知是稀疏数据；null 表示本次未提供，不应清空旧值。
    if (value === null || value === undefined) continue;
    result[key] = isObject(value) ? mergeSparse(result[key], value) : value;
  }
  return result;
}

export function mergeRateLimitUpdate(previousResponse, update) {
  const response = isObject(previousResponse) ? structuredClone(previousResponse) : {};
  if (!isObject(update)) return response;

  const mergedSnapshot = mergeSparse(response.rateLimits, update);
  response.rateLimits = mergedSnapshot;

  const limitId = update.limitId || mergedSnapshot.limitId;
  if (limitId) {
    const buckets = isObject(response.rateLimitsByLimitId) ? { ...response.rateLimitsByLimitId } : {};
    buckets[limitId] = mergeSparse(buckets[limitId], update);
    response.rateLimitsByLimitId = buckets;
  }
  return response;
}

export class CodexRateLimitClient {
  constructor({ codexPath, onState, log = () => {}, pollIntervalMs = 30_000, restartDelayMs = 5_000, appServerArguments = null }) {
    this.codexPath = codexPath;
    this.onState = typeof onState === "function" ? onState : () => {};
    this.log = log;
    this.pollIntervalMs = pollIntervalMs;
    this.restartDelayMs = restartDelayMs;
    this.appServerArguments = Array.isArray(appServerArguments) ? appServerArguments : [
      "--disable", "plugins",
      "--disable", "plugin_hooks",
      "app-server",
    ];
    this.child = null;
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.snapshot = null;
    this.pollTimer = null;
    this.restartTimer = null;
    this.stopping = false;
  }

  start() {
    if (this.child || this.stopping) return;
    if (!this.codexPath || !fs.existsSync(this.codexPath)) {
      this.emit("error", null, "未找到 Codex App Server");
      return;
    }
    this.launch();
  }

  launch() {
    this.clearTimers();
    this.buffer = "";
    this.emit("loading", this.snapshot, "正在读取 Codex 额度");
    try {
      this.child = spawn(this.codexPath, this.appServerArguments, {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });
    } catch (error) {
      this.emit("error", this.snapshot, error.message);
      this.scheduleRestart();
      return;
    }

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleOutput(chunk));
    this.child.stderr.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (message) this.log(`App Server：${message.slice(0, 1200)}`);
    });
    this.child.on("error", (error) => this.log(`App Server 进程错误：${error.message}`));
    this.child.on("close", (code, signal) => this.handleExit(code, signal));

    this.request("initialize", {
      clientInfo: {
        name: "codex_skin_launcher",
        title: "Codex Skin Launcher",
        version: "2.1.0",
      },
      capabilities: null,
    }, 15_000).then(() => {
      this.notify("initialized");
      return this.refresh();
    }).then(() => {
      this.pollTimer = setInterval(() => this.refresh().catch(() => {}), this.pollIntervalMs);
    }).catch((error) => {
      this.emit("error", this.snapshot, error.message);
      this.child?.kill("SIGTERM");
    });
  }

  handleOutput(chunk) {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf(NEWLINE);
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      try {
        this.handleMessage(JSON.parse(line));
      } catch (error) {
        this.log(`解析 App Server 消息失败：${error.message}`);
      }
    }
  }

  handleMessage(message) {
    if (message?.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "App Server 请求失败"));
      else pending.resolve(message.result || {});
      return;
    }

    if (message?.method === "account/rateLimits/updated" && isObject(message.params?.rateLimits)) {
      this.snapshot = mergeRateLimitUpdate(this.snapshot, message.params.rateLimits);
      this.emit("ready", this.snapshot, "额度已实时更新");
    }
  }

  request(method, params, timeoutMs = 10_000) {
    if (!this.child?.stdin?.writable) return Promise.reject(new Error("App Server 尚未连接"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        const message = params === undefined ? { method, id } : { method, id, params };
        this.child.stdin.write(`${JSON.stringify(message)}${NEWLINE}`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params) {
    if (!this.child?.stdin?.writable) return;
    const message = params === undefined ? { method } : { method, params };
    this.child.stdin.write(`${JSON.stringify(message)}${NEWLINE}`);
  }

  async refresh() {
    const result = await this.request("account/rateLimits/read", undefined, 15_000);
    this.snapshot = result;
    this.emit("ready", result, "额度已连接");
    return result;
  }

  emit(status, result, message) {
    this.onState({
      status,
      result: result || null,
      message: message || "",
      updatedAt: new Date().toISOString(),
    });
  }

  handleExit(code, signal) {
    const wasStopping = this.stopping;
    this.child = null;
    this.clearPending(new Error("App Server 连接已关闭"));
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (wasStopping) return;
    this.log(`App Server 已退出：${signal || code || "unknown"}`);
    this.emit("error", this.snapshot, "额度连接中断，正在重连");
    this.scheduleRestart();
  }

  scheduleRestart() {
    if (this.stopping || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.launch();
    }, this.restartDelayMs);
  }

  clearPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  clearTimers() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.pollTimer = null;
    this.restartTimer = null;
  }

  stop() {
    this.stopping = true;
    this.clearTimers();
    this.clearPending(new Error("额度客户端已停止"));
    this.child?.kill("SIGTERM");
    this.child = null;
  }
}
