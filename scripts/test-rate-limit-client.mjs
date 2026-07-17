#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CodexRateLimitClient, mergeRateLimitUpdate } from "../Resources/rate-limit-client.js";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const merged = mergeRateLimitUpdate({
  rateLimits: {
    limitId: "codex",
    limitName: "Codex",
    primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1000 },
  },
}, {
  limitId: "codex",
  limitName: null,
  primary: { usedPercent: 35, windowDurationMins: null },
});
assert.equal(merged.rateLimits.limitName, "Codex");
assert.equal(merged.rateLimits.primary.usedPercent, 35);
assert.equal(merged.rateLimits.primary.windowDurationMins, 300);
assert.equal(merged.rateLimits.primary.resetsAt, 1000);
console.log("PASS sparse-rate-limit-merge");

const states = [];
let resolveReady;
const ready = new Promise((resolve, reject) => {
  resolveReady = resolve;
  setTimeout(() => reject(new Error("额度事件测试超时")), 5000).unref();
});

const client = new CodexRateLimitClient({
  codexPath: process.execPath,
  appServerArguments: [path.join(projectDirectory, "tests", "fake-app-server.js")],
  pollIntervalMs: 60_000,
  restartDelayMs: 100,
  onState(state) {
    states.push(state);
    if (state.status === "ready" && state.result?.rateLimits?.primary?.usedPercent === 31) resolveReady();
  },
});

try {
  client.start();
  await ready;
  const initial = states.find((state) => state.status === "ready" && state.result?.rateLimits?.primary?.usedPercent === 25);
  const updated = states.find((state) => state.status === "ready" && state.result?.rateLimits?.primary?.usedPercent === 31);
  assert.ok(initial, "没有收到初始额度快照");
  assert.ok(updated, "没有收到额度更新通知");
  assert.equal(updated.result.rateLimits.primary.windowDurationMins, 300);
  assert.equal(updated.result.rateLimits.secondary.usedPercent, 40);
  console.log("PASS app-server-rate-limit-events");
} finally {
  client.stop();
}
