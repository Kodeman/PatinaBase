#!/usr/bin/env node
/* Perf harness: host-sim's insertion model + 4x CPU throttling, timing
   insertion -> first paint / fonts.ready / __mockReady / __lensSettled().
   Usage: node perf-host.mjs [pathToIndexHtml] [label]
   Never modifies index.html; the per-module instrumentation is a string
   rewrite applied to an in-memory copy only. */
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(here, "index.html");
const label = process.argv[3] || path.basename(path.dirname(target));
const RATE = Number(process.env.CPU_RATE || 4);
const RUNS = Number(process.env.RUNS || 3);

const HOST_SHELL =
  "<!doctype html><html><head><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style></head><body></body></html>";

const raw = fs.readFileSync(target, "utf8");

/* per-module instrumentation (only lands if the anchors exist -- our file) */
const ANCHOR = `  motion();
  fit();
  for (var fi = 0; fi < FRAMES.length; fi++) {
    lens(FRAMES[fi]);
    focus(FRAMES[fi]);
    FRAMES[fi].settle();
  }`;
const REPL = `  window.__initMarks = [];
  var __t0 = performance.now(), __tp = __t0;
  function __m(n) { var t = performance.now(); window.__initMarks.push(n + '=' + (t - __tp).toFixed(1)); __tp = t; }
  motion(); __m('motion');
  fit(); __m('fit');
  for (var fi = 0; fi < FRAMES.length; fi++) {
    lens(FRAMES[fi]); __m('lens.' + FRAMES[fi].key);
    focus(FRAMES[fi]); __m('focus.' + FRAMES[fi].key);
    FRAMES[fi].settle(); __m('settle.' + FRAMES[fi].key);
  }`;
const ANCHOR2 = `  syncBar();
  ink(document);
  window.__mockReady = true;`;
const REPL2 = `  __m('fullHeight');
  syncBar(); __m('syncBar');
  ink(document); __m('ink');
  window.__initTotal = performance.now() - __t0;
  window.__mockReady = true;`;

let html = raw;
let instrumented = false;
if (raw.includes(ANCHOR) && raw.includes(ANCHOR2)) {
  html = raw.replace(ANCHOR, REPL).replace(ANCHOR2, REPL2);
  instrumented = true;
}

async function runOnce(fileHtml, opts) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1560, height: 1060 } });
  const client = await page.context().newCDPSession(page);
  await page.setContent(HOST_SHELL, { waitUntil: "load" });
  await page.evaluate(() => {
    window.__longtasks = [];
    window.__paints = [];
    window.__lcp = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__longtasks.push(Math.round(e.duration));
      }).observe({ entryTypes: ["longtask"] });
    } catch (e) {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__paints.push(e.name + "@" + Math.round(e.startTime));
      }).observe({ type: "paint", buffered: true });
    } catch (e) {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lcp.push(Math.round(e.startTime));
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {}
  });
  if (RATE > 1) await client.send("Emulation.setCPUThrottlingRate", { rate: RATE });
  await client.send("Performance.enable");
  const metricsBefore = await client.send("Performance.getMetrics");

  const res = await page.evaluate(
    async ([fileHtmlIn, runScripts]) => {
      const out = {};
      const t0 = performance.now();
      window.__t0 = t0;
      document.body.insertAdjacentHTML("beforeend", fileHtmlIn);
      out.parse = performance.now() - t0;

      // first rendered frame containing our content: the SECOND rAF proves a
      // frame carrying the inserted markup was produced.
      const firstPaint = new Promise((res2) => {
        requestAnimationFrame(() => requestAnimationFrame(() => res2(performance.now() - t0)));
      });
      out.firstPaint = await firstPaint;

      out.nodes = document.getElementsByTagName("*").length;

      const fontsReady = document.fonts.ready.then(() => performance.now() - t0);

      if (runScripts) {
        const tS = performance.now();
        for (const orig of Array.from(document.querySelectorAll("script"))) {
          const s = document.createElement("script");
          for (const a of orig.attributes) s.setAttribute(a.name, a.value);
          s.textContent = orig.textContent;
          orig.parentNode.replaceChild(s, orig);
        }
        out.scriptExec = performance.now() - tS;
        out.mockReady = window.__mockReady === true ? performance.now() - t0 : null;
        out.initMarks = window.__initMarks || null;
        out.initTotal = window.__initTotal || null;
        out.mockError = window.__mockError || null;
        if (typeof window.__lensSettled === "function") {
          await window.__lensSettled();
          out.settled = performance.now() - t0;
        }
      }
      out.fontsReady = await fontsReady;
      out.longtasks = window.__longtasks.slice();
      out.paints = window.__paints.slice();
      out.fcpAfterInsert = (function () {
        var p = performance.getEntriesByName("first-contentful-paint")[0];
        return p ? p.startTime - t0 : null;
      })();
      out.lcpAfterInsert = window.__lcp.length ? window.__lcp[window.__lcp.length - 1] - t0 : null;
      out.styleBytes = Array.from(document.querySelectorAll("style")).reduce(
        (n, s) => n + s.textContent.length, 0);
      out.styleRules = Array.from(document.querySelectorAll("style")).reduce((n, s) => {
        try { return n + (s.sheet ? s.sheet.cssRules.length : 0); } catch (e) { return n; }
      }, 0);
      out.fontFaces = (document.body.innerHTML.match(/@font-face/g) || []).length;
      return out;
    },
    [fileHtml, opts.runScripts]
  );
  const metricsAfter = await client.send("Performance.getMetrics");
  const pick2 = (m, n) => (m.metrics.find((x) => x.name === n) || {}).value || 0;
  res.layoutCount = pick2(metricsAfter, "LayoutCount") - pick2(metricsBefore, "LayoutCount");
  res.recalcStyleCount = pick2(metricsAfter, "RecalcStyleCount") - pick2(metricsBefore, "RecalcStyleCount");
  res.layoutDuration = +(pick2(metricsAfter, "LayoutDuration") - pick2(metricsBefore, "LayoutDuration")).toFixed(3);
  res.recalcStyleDuration = +(pick2(metricsAfter, "RecalcStyleDuration") - pick2(metricsBefore, "RecalcStyleDuration")).toFixed(3);
  res.mutObs = null;
  await browser.close();
  return res;
}

function med(a) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function f(n) { return n == null ? "-" : (n / 1000).toFixed(2) + "s"; }

const rows = [];
for (let i = 0; i < RUNS; i++) rows.push(await runOnce(html, { runScripts: true }));
const noScript = await runOnce(html, { runScripts: false });

const pick = (k) => rows.map((r) => r[k]).filter((v) => typeof v === "number");
console.log("=== perf: " + label + " (" + path.relative(here, target) + ") cpu=" + RATE + "x runs=" + RUNS + " ===");
console.log("instrumented:", instrumented);
console.log("dataURI bytes:", (raw.match(/base64,[A-Za-z0-9+/=]+/g) || []).reduce((n, s) => n + s.length, 0));
console.log("file bytes:", Buffer.byteLength(raw));
console.log("nodes:", rows[0].nodes, "styleBytes:", rows[0].styleBytes, "styleRules:", rows[0].styleRules, "fontFaces:", rows[0].fontFaces);
console.log("parse(insertAdjacentHTML):", f(med(pick("parse"))));
console.log("firstPaint:", f(med(pick("firstPaint"))), "| no-script firstPaint:", f(noScript.firstPaint));
console.log("fontsReady:", f(med(pick("fontsReady"))), "| no-script fontsReady:", f(noScript.fontsReady));
console.log("scriptExec:", f(med(pick("scriptExec"))));
console.log("__mockReady:", f(med(pick("mockReady"))));
console.log("__lensSettled:", f(med(pick("settled"))));
console.log("mockError:", rows[0].mockError);
console.log("initTotal(ms):", rows.map((r) => r.initTotal && r.initTotal.toFixed(0)).join(","));
console.log("initMarks:", JSON.stringify(rows[rows.length - 1].initMarks));
console.log("longtasks(ms):", JSON.stringify(rows[rows.length - 1].longtasks));
console.log("LayoutCount:", rows[rows.length - 1].layoutCount,
  "(" + rows[rows.length - 1].layoutDuration + "s)  RecalcStyleCount:", rows[rows.length - 1].recalcStyleCount,
  "(" + rows[rows.length - 1].recalcStyleDuration + "s)");
console.log("no-script LayoutCount:", noScript.layoutCount, "RecalcStyleCount:", noScript.recalcStyleCount);
console.log("FCP-after-insert:", f(med(pick("fcpAfterInsert"))), "| LCP-after-insert:", f(med(pick("lcpAfterInsert"))));
console.log("no-script FCP:", f(noScript.fcpAfterInsert), "LCP:", f(noScript.lcpAfterInsert));
console.log("RAW:", JSON.stringify(rows.map((r) => ({
  parse: Math.round(r.parse), firstPaint: Math.round(r.firstPaint),
  fontsReady: Math.round(r.fontsReady), mockReady: r.mockReady && Math.round(r.mockReady),
  settled: r.settled && Math.round(r.settled),
}))));
