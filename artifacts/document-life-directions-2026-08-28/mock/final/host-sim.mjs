#!/usr/bin/env node
// Simulates the Claude Artifact host: a blank page whose <body> has already
// finished loading, into which our file's content is inserted AFTER load —
// then its <script> blocks are re-executed the way a real host does (new
// script elements with the same text, appended — innerHTML-inserted <script>
// text never runs on its own).
//
// Run from mock/final (via the node_modules symlink to the designer-portal
// workspace) so `@playwright/test` resolves, and unsandboxed since Chromium
// needs a real mach port:
//
//   cd /Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28/mock/final
//   node host-sim.mjs
//
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(here, "index.html");
const outDir = path.join(here, "shots");
fs.mkdirSync(outDir, { recursive: true });

const html = fs.readFileSync(filePath, "utf8");

const HOST_SHELL =
  "<!doctype html><html><head><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style></head><body></body></html>";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1560, height: 1060 } });

  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err && err.stack ? err.stack : String(err));
  });
  page.on("request", (req) => {
    const u = req.url();
    if (!u.startsWith("about:") && !u.startsWith("data:")) externalRequests.push(u);
  });

  // 1. Blank host page, load it, wait for load.
  await page.setContent(HOST_SHELL, { waitUntil: "load" });

  // 2. AFTER load, insert our content into <body> via innerHTML-style insertion.
  //    This is the same call a host makes: insertAdjacentHTML parses markup
  //    and CSS but leaves any <script> text inert (never executed).
  const insertResult = await page.evaluate((fileHtml) => {
    document.body.insertAdjacentHTML("beforeend", fileHtml);
    // Report what's visible right after markup insertion, before any script
    // re-execution — this tells us whether static markup + CSS alone paints.
    const desk = document.getElementById("screen-desk");
    return {
      bodyChildCount: document.body.children.length,
      bodyChildTags: Array.from(document.body.children).map((c) => c.tagName),
      titleText: document.title,
      deskExists: !!desk,
      deskIsOn: desk ? desk.classList.contains("is-on") : null,
      frameExists: !!document.getElementById("frame"),
      scriptTags: document.querySelectorAll("script").length,
      frameComputedBg: desk ? getComputedStyle(document.getElementById("frame")).backgroundColor : null,
    };
  }, html);

  // 2b. Screenshot BEFORE any script re-execution, to see whether static
  //     markup + CSS alone (i.e. if the host never ran our script at all)
  //     paints anything.
  await page.screenshot({ path: path.join(outDir, "host-sim-prescript.png") });

  // 3. Re-execute every <script> block the way a real host does: create new
  //    script elements with the same text content and append them (this DOES
  //    execute, unlike the inert innerHTML-inserted originals).
  const execResult = await page.evaluate(() => {
    const originals = Array.from(document.querySelectorAll("script"));
    const errors = [];
    for (const orig of originals) {
      try {
        const s = document.createElement("script");
        // Copy attributes (there are none of interest here — no src/type quirks).
        for (const attr of orig.attributes) s.setAttribute(attr.name, attr.value);
        s.textContent = orig.textContent;
        orig.parentNode.replaceChild(s, orig);
      } catch (e) {
        errors.push(String(e));
      }
    }
    return { reExecuted: originals.length, errors };
  });

  // Give any rAF/setTimeout-driven init a moment to settle.
  await page.waitForTimeout(400);

  const finalState = await page.evaluate(() => {
    const desk = document.getElementById("screen-desk");
    const frame = document.getElementById("frame");
    const cs = frame ? getComputedStyle(frame) : null;
    return {
      mockReady: window.__mockReady === true,
      deskIsOn: desk ? desk.classList.contains("is-on") : null,
      deskDisplay: desk ? getComputedStyle(desk).display : null,
      frameRect: frame ? frame.getBoundingClientRect() : null,
      frameTransform: cs ? cs.transform : null,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    };
  });

  await page.screenshot({ path: path.join(outDir, "host-sim.png") });

  await browser.close();

  console.log("=== host-sim result ===");
  console.log("insertResult:", JSON.stringify(insertResult, null, 2));
  console.log("execResult:", JSON.stringify(execResult, null, 2));
  console.log("finalState:", JSON.stringify(finalState, null, 2));
  console.log("consoleErrors:", JSON.stringify(consoleErrors, null, 2));
  console.log("pageErrors:", JSON.stringify(pageErrors, null, 2));
  console.log(
    "externalRequests:",
    JSON.stringify(externalRequests.filter((u) => !u.startsWith("file:")), null, 2)
  );
}

main().catch((e) => {
  console.error("host-sim FAILED:", e);
  process.exit(1);
});
