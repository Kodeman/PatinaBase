#!/usr/bin/env node
/* Streaming perf harness. The Artifact host serves the file over the network
   and the browser parses it as it arrives, so every byte that sits AHEAD of
   the markup is a byte of blank screen. host-sim's insertAdjacentHTML model
   parses the whole string from memory at once and can never show this.
   Usage: node perf-stream.mjs [pathToIndexHtml] [label]
   Env: KBPS (default 500), CPU_RATE (default 4). */
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : path.join(here, "index.html");
const label = process.argv[3] || "target";
const KBPS = Number(process.env.KBPS || 500);
const RATE = Number(process.env.CPU_RATE || 4);

const body = fs.readFileSync(target);
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port + "/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1560, height: 1060 } });
const client = await page.context().newCDPSession(page);
await client.send("Network.enable");
await client.send("Network.emulateNetworkConditions", {
  offline: false, latency: 40,
  downloadThroughput: (KBPS * 1000) / 8,
  uploadThroughput: (KBPS * 1000) / 8,
});
if (RATE > 1) await client.send("Emulation.setCPUThrottlingRate", { rate: RATE });

const t0 = Date.now();
await page.goto(url, { waitUntil: "commit" });
const marks = { commit: Date.now() - t0 };

/* "first text on screen" = the first region head has a laid-out box AND the
   browser has reported a contentful paint. A screenshot poll cannot be the
   probe here: page.screenshot() itself blocks on a pending stylesheet, so its
   own baseline shot lands after the very stall we are trying to time. */
let firstText = null;
const deadline = Date.now() + 90000;
while (Date.now() < deadline && firstText === null) {
  const hasText = await page.evaluate(() => {
    const h = document.querySelector("#frame-1440 .region .rh-name");
    if (!h) return false;
    const r = h.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }).catch(() => false);
  if (hasText) firstText = Date.now() - t0;
  else await new Promise((r) => setTimeout(r, 60));
}
marks.firstText = firstText;

/* timer polling, never rAF: a pending <style> blocks the rendering steps, so
   an rAF-driven poll cannot observe a flag the script has already set. */
await page.waitForFunction(() => window.__mockReady === true, null,
  { timeout: 90000, polling: 50 }).catch(() => {});
marks.mockReady = Date.now() - t0;
await page.evaluate(() => document.fonts.ready).catch(() => {});
marks.fontsReady = Date.now() - t0;
await page.evaluate(() => (window.__lensSettled ? window.__lensSettled() : null)).catch(() => {});
marks.settled = Date.now() - t0;

const perf = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0] || {};
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  return {
    fcp: fcp ? Math.round(fcp.startTime) : null,
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
    loadEnd: Math.round(nav.loadEventEnd || 0),
    nodes: document.getElementsByTagName("*").length,
  };
});

await browser.close();
server.close();

const f = (n) => (n == null ? "-" : (n / 1000).toFixed(2) + "s");
console.log("=== stream: " + label + " @ " + KBPS + " kbps, cpu " + RATE + "x, " +
  Buffer.byteLength(body) + " bytes ===");
console.log("first non-blank paint (FCP):", f(perf.fcp));
console.log("first region-head text box:", f(marks.firstText));
console.log("__mockReady:", f(marks.mockReady));
console.log("fonts.ready:", f(marks.fontsReady));
console.log("__lensSettled:", f(marks.settled));
console.log("DCL:", f(perf.domContentLoaded), "load:", f(perf.loadEnd), "nodes:", perf.nodes);
