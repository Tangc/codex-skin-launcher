#!/usr/bin/env node

import readline from "node:readline";

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

lines.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ id: message.id, result: { userAgent: "fake/1.0", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } });
    return;
  }
  if (message.method === "account/rateLimits/read") {
    send({
      id: message.id,
      result: {
        rateLimits: {
          limitId: "codex",
          limitName: "Codex",
          primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 2_000_000_000 },
          secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 2_000_100_000 },
          credits: null,
        },
        rateLimitsByLimitId: null,
        rateLimitResetCredits: { availableCount: 0 },
      },
    });
    setTimeout(() => {
      send({
        method: "account/rateLimits/updated",
        params: {
          rateLimits: {
            limitId: "codex",
            primary: { usedPercent: 31 },
          },
        },
      });
    }, 40);
  }
});
