#!/usr/bin/env node
/**
 * build.mjs - inline the eighteen US-27 specimens and the walk screenshots into
 * the founder deck. Adapted from tools/build.us26.mjs (the US-26 deck inliner).
 *
 * Reads deck/src/index.html and writes deck/index.html, one self-contained page:
 *   - every <img src="{{WALK:<file>.jpg|.png}}"> is inlined from ../walk/<file>,
 *     once per file: the first use carries the data URI, and every later use
 *     carries only data-walk="<file>", which the deck's script fills from the
 *     first. A missing file, or a token outside an img src, stops the build.
 *   - every {{SPECIMEN_<SLUG>_<W>}} token becomes the HTML-escaped specimen
 *     specimens/<slug>-<w>.html, for a double-quoted srcdoc attribute.
 *
 * The frame contract comes from specimens/SPEC.md (section 1's area table and
 * section 2.1's register, read the same way specimens/check.mjs reads them):
 *   - every proposed and dark frame is shown exactly once, as an iframe named
 *     for it (name="frame-desk-p1") whose srcdoc is its own area and width;
 *   - every today frame's screenshot is shown, as a {{WALK:*}} image;
 *   - so each token appears exactly as many times as its file has proposed and
 *     dark frames, and every iframe's frame exists in the specimen it loads.
 *
 * Walk screenshots inside the specimens. A specimen's own <img src="../walk/x">
 * cannot resolve inside a srcdoc frame once the deck is published, and a copy
 * per frame would repeat each screenshot up to seven times. The build renames
 * those attributes to data-walk-src="x" (href to data-walk-href), so nothing is
 * fetched, and the bootstrap asks the deck for the frames it shows; the deck
 * answers from its single inlined copy. Every screenshot a specimen references
 * must therefore also be on a deck sheet: the build stops otherwise.
 *
 * The bootstrap (inserted just after the specimen's charset meta):
 *   - hides the specimen's own chrome (.specimen-meta, .frame-bar) and its
 *     marks line, whose proposed figure is still "measured at render": the deck
 *     prints today's walk figure itself and says the proposed count is pending;
 *   - turns the iframe's name (frame-desk-p1) into "#frame-desk-p1&nobar" before
 *     the specimen's script runs, so the specimen shows that one frame with its
 *     pins and pin key, without its caption (the deck captions it);
 *   - posts { deckSpecH } to the parent whenever the body's height changes, so
 *     the deck can size each frame to its content;
 *   - posts { deckWalk: [names] } for walk images in the frame it shows, and
 *     sets each src from the deck's { deckWalkData } reply.
 *
 * The build stops with exit 1 and a named reason when:
 *   - the source, SPEC.md, a specimen or a walk screenshot is missing;
 *   - a specimen's last non-empty line is not exactly <!-- SPECIMEN COMPLETE -->;
 *   - a token count, a frame name or a frame's token is wrong, a proposed or
 *     dark frame is missing or shown twice, or a today screenshot is missing;
 *   - the deck's visible copy says "AI", or the deck or a specimen draws a shadow;
 *   - a colour literal appears outside the :root token blocks of the deck's CSS;
 *   - any {{...}} token is left in the output;
 *   - the output fetches or links any http(s) URL other than Google Fonts;
 *   - the output is over 16 MB.
 *
 *   node artifacts/portal-uplift-2026-10-12/deck/build.mjs
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(HERE, 'src', 'index.html');
const OUT = join(HERE, 'index.html');
const WALK = join(ROOT, 'walk');
const SPEC = join(ROOT, 'specimens', 'SPEC.md');

const SENTINEL = '<!-- SPECIMEN COMPLETE -->';
const LIMIT = 16 * 1024 * 1024;
const SLUGS = ['desk', 'document', 'rooms', 'people', 'library', 'boards', 'papers', 'money', 'chrome'];
const WIDTHS = ['1440', '390'];

const WALK_TOKEN = /\{\{WALK:([A-Za-z0-9._-]+\.(?:jpg|png))\}\}/g;
const WALK_SRC = /(<img\s[^>]*?)src="\{\{WALK:([A-Za-z0-9._-]+\.(?:jpg|png))\}\}"/g;
const IFRAME = /<iframe\b[^>]*>/g;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

const BOOTSTRAP = '<style>.bar,#bar,.frame-bar,.specimen-meta,p.marks,p.marks-line{display:none !important}</style>'
  + '<script>(function(){'
  + 'try{var m=/frame-[a-z]+-[tpd][0-9]+/.exec(window.name||"");if(m){location.hash=m[0]+"&nobar";}}catch(e){}'
  + 'var last=0;function send(){try{var b=document.body;if(!b)return;'
  + 'var h=Math.ceil(Math.max(b.scrollHeight,b.getBoundingClientRect().height));'
  + 'if(h&&Math.abs(h-last)>1){last=h;parent.postMessage({deckSpecH:h},"*");}}catch(e){}}'
  + 'function later(){setTimeout(send,60);setTimeout(send,400);}'
  + 'function shown(){var out=[];try{var imgs=document.querySelectorAll("img[data-walk-src]");'
  + 'for(var i=0;i<imgs.length;i++){var f=imgs[i].closest("[data-frame]");'
  + 'if(!imgs[i].getAttribute("src")&&(!f||!f.classList.contains("is-hidden"))){out.push(imgs[i].getAttribute("data-walk-src"));}}}catch(e){}return out;}'
  + 'function ask(){var n=shown();if(n.length){try{parent.postMessage({deckWalk:n},"*");}catch(e){}}}'
  + 'window.addEventListener("message",function(e){var d=e.data;if(!d||typeof d!=="object"||!d.deckWalkData)return;'
  + 'var imgs=document.querySelectorAll("img[data-walk-src]");for(var i=0;i<imgs.length;i++){'
  + 'var u=d.deckWalkData[imgs[i].getAttribute("data-walk-src")];if(typeof u==="string"&&u.indexOf("data:image/")===0){imgs[i].setAttribute("src",u);}}later();});'
  + 'document.addEventListener("DOMContentLoaded",function(){send();ask();'
  + 'try{if(window.ResizeObserver){new ResizeObserver(send).observe(document.body);}}catch(e){}});'
  + 'window.addEventListener("load",later);window.addEventListener("hashchange",function(){later();ask();});'
  // A height posted before the deck's listener existed is lost, so the deck asks
  // again with { deckAsk } once it is listening, and the frame re-sends.
  + 'window.addEventListener("message",function(e){if(e.data&&e.data.deckAsk){last=0;ask();}later();});'
  + '})();</script>';

function fail(message) {
  console.error(`build.mjs: ${message}`);
  console.error('build.mjs: nothing was written.');
  process.exit(1);
}

/**
 * Escape a full HTML document for a double-quoted attribute. Non-ASCII becomes
 * numeric references, so the srcdoc survives whatever encoding the host reads.
 */
function escapeAttr(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`);
}

/** Rename walk references, then put the bootstrap just after the charset meta. */
function wrap(html) {
  const quiet = html
    .replace(/\ssrc="\.\.\/walk\//g, ' data-walk-src="')
    .replace(/\shref="\.\.\/walk\//g, ' data-walk-href="');
  for (const re of [/<meta\s+charset=[^>]*>/i, /<head(\s[^>]*)?>/i, /<html(\s[^>]*)?>/i]) {
    const m = re.exec(quiet);
    if (m) {
      const at = m.index + m[0].length;
      return quiet.slice(0, at) + BOOTSTRAP + quiet.slice(at);
    }
  }
  return BOOTSTRAP + quiet;
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

function mime(name) {
  return name.endsWith('.png') ? 'image/png' : 'image/jpeg';
}

/** SPEC.md section 1 and 2.1: frames per slug and width, with kind and today file. */
function readSpec(text) {
  const lines = text.split('\n');
  const register = new Map();
  for (const l of lines) {
    const m = /^\|\s*`(frame-[^`]+)`\s*\|\s*(\d+)\s*\|\s*(today|proposed|dark)\s*\|\s*`([^`]+)`\s*\|/.exec(l);
    if (m) register.set(m[1], { id: m[1], width: m[2], kind: m[3][0], pair: m[4] });
  }
  const frames = new Map();
  for (const row of lines.filter((l) => /^\|\s*\*\*/.test(l))) {
    const cells = row.split('|').map((c) => c.trim());
    const slug = /^\*\*([a-z]+)\*\*$/.exec(cells[1])?.[1];
    const ids = (cell) => [...(cell ?? '').matchAll(/`(frame-[^`]+)`/g)].map((m) => m[1]);
    if (!slug) continue;
    frames.set(`${slug}-1440`, ids(cells[3]).map((id) => register.get(id) ?? fail(`SPEC.md lists ${id} but section 2.1 has no row for it.`)));
    frames.set(`${slug}-390`, ids(cells[4]).map((id) => register.get(id) ?? fail(`SPEC.md lists ${id} but section 2.1 has no row for it.`)));
  }
  for (const slug of SLUGS) for (const w of WIDTHS) {
    if (!frames.get(`${slug}-${w}`)?.length) fail(`SPEC.md section 1 has no ${w} frames for ${slug}.`);
  }
  return frames;
}

async function main() {
  if (!(await exists(SRC))) fail(`the deck source does not exist at ${SRC}.`);
  if (!(await exists(SPEC))) fail(`the specimen spec does not exist at ${SPEC}.`);
  const src = await readFile(SRC, 'utf8');
  if (!src.startsWith('<title>')) fail('deck/src/index.html must start with <title>.');
  if (/<\/?(html|head|body)[\s>]/i.test(src) || /<!doctype/i.test(src)) {
    fail('deck/src/index.html must not carry its own doctype, html, head or body tags.');
  }

  // The page has no charset meta of its own, so every non-ASCII character in the
  // deck's markup becomes a numeric reference below. That is only safe outside
  // <script> and <style>, so those must be ASCII already.
  const blocks = [...src.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g)];
  for (const m of blocks) {
    const bad = /[^\x00-\x7f]/.exec(m[2]);
    if (bad) fail(`a <${m[1]}> block carries the non-ASCII character ${JSON.stringify(bad[0])}; escape it.`);
  }

  // Zero shadows is binding (BRIEF section 2).
  const shadow = /box-shadow\s*:|drop-shadow\s*\(/i.exec(src);
  if (shadow) fail(`the deck draws a shadow near ${JSON.stringify(src.slice(shadow.index, shadow.index + 60))}.`);

  // Every colour is a token: no hex, rgb() or hsl() literal in the deck's CSS
  // outside a block that only defines --custom-properties.
  const css = blocks.filter((m) => m[1] === 'style').map((m) => m[2]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const decls = rule[2].split(';').map((d) => d.trim()).filter(Boolean);
    for (const d of decls) {
      if (d.startsWith('--')) continue;
      if (/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i.test(d)) fail(`a colour literal sits outside the :root tokens: ${JSON.stringify(`${rule[1].trim()} { ${d} }`.slice(0, 120))}.`);
    }
  }
  const inlineColour = /\bstyle\s*=\s*"[^"]*(?:#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\()/i.exec(src);
  if (inlineColour) fail(`an inline style carries a colour literal near ${JSON.stringify(src.slice(inlineColour.index, inlineColour.index + 80))}.`);

  // Visible copy says "Designer-Taught Intelligence", never "AI" (BRIEF section 2).
  const copy = src.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '');
  const ai = /\bAI\b|\bA\.I\./.exec(copy);
  if (ai) fail(`the deck's copy says "AI" near ${JSON.stringify(copy.slice(Math.max(0, ai.index - 40), ai.index + 40))}.`);

  // The frame contract, from SPEC.md.
  const frames = readSpec(await readFile(SPEC, 'utf8'));
  const tokenOf = (key) => `{{SPECIMEN_${key.replace('-', '_').toUpperCase()}}}`;
  const shown = new Map();
  for (const tag of src.match(IFRAME) || []) {
    const token = /srcdoc="(\{\{SPECIMEN_[A-Z0-9_]+\}\})"/.exec(tag);
    if (!token) continue;
    const name = /\sname="(frame-[a-z]+-[tpd][0-9]+)"/.exec(tag);
    if (!name) fail(`an iframe using ${token[1]} has no name="frame-<slug>-<kind><n>".`);
    if (!/\ssandbox="allow-scripts"/.test(tag)) fail(`${name[1]}'s iframe must carry sandbox="allow-scripts" and nothing more.`);
    const key = [...frames.keys()].find((k) => frames.get(k).some((f) => f.id === name[1]));
    if (!key) fail(`${name[1]} is not a frame in SPEC.md.`);
    if (tokenOf(key) !== token[1]) fail(`${name[1]} belongs to ${key}.html, but its iframe loads ${token[1]}.`);
    if (frames.get(key).find((f) => f.id === name[1]).kind === 't') fail(`${name[1]} is a today frame; the deck shows today as its own screenshot.`);
    shown.set(name[1], (shown.get(name[1]) || 0) + 1);
  }
  const walkNames = new Set([...src.matchAll(WALK_TOKEN)].map((m) => m[1]));
  const problems = [];
  for (const [key, list] of frames) {
    for (const f of list) {
      if (f.kind === 't' && !walkNames.has(f.pair)) problems.push(`today frame ${f.id} (${f.pair}) has no {{WALK:${f.pair}}} image`);
      if (f.kind !== 't' && (shown.get(f.id) || 0) !== 1) problems.push(`${f.id} is shown ${shown.get(f.id) || 0} time(s), not once`);
    }
    const want = list.filter((f) => f.kind !== 't').length;
    const uses = src.split(tokenOf(key)).length - 1;
    if (uses !== want) problems.push(`${tokenOf(key)} appears ${uses} time(s); ${key}.html has ${want} proposed and dark frame(s)`);
  }
  if (problems.length) fail(`the deck does not match SPEC.md:\n  ${problems.join('\n  ')}`);

  // The specimens.
  const bodies = new Map();
  for (const key of frames.keys()) {
    const file = join(ROOT, 'specimens', `${key}.html`);
    if (!(await exists(file))) fail(`${key}.html does not exist at ${file}.`);
    const text = await readFile(file, 'utf8');
    const last = text.trimEnd().split('\n').at(-1).trim();
    if (last !== SENTINEL) fail(`${key}.html is not complete. Its last non-empty line reads ${JSON.stringify(last.slice(0, 80))}; the build requires exactly ${JSON.stringify(SENTINEL)}.`);
    for (const f of frames.get(key)) if (!text.includes(`data-frame="${f.id}"`)) fail(`${f.id} is not a frame in ${key}.html.`);
    if (/box-shadow\s*:|drop-shadow\s*\(/i.test(text)) fail(`${key}.html draws a shadow.`);
    for (const m of text.matchAll(/\.\.\/walk\/([A-Za-z0-9._-]+\.(?:jpg|png))/g)) {
      if (!walkNames.has(m[1])) fail(`${key}.html references ../walk/${m[1]}, which no deck sheet shows, so the deck cannot hand it to the frame.`);
    }
    bodies.set(key, text);
  }

  // Walk screenshots.
  const names = [...walkNames];
  const missing = [];
  for (const name of names) if (!(await exists(join(WALK, name)))) missing.push(name);
  if (missing.length) fail(`walk screenshot(s) missing from ${WALK}: ${missing.join(', ')}.`);
  const uris = new Map();
  for (const name of names) {
    uris.set(name, `data:${mime(name)};base64,${(await readFile(join(WALK, name))).toString('base64')}`);
  }
  // Each screenshot is inlined once. Its first <img> carries the data URI; every
  // later use carries only data-walk="<file>", and the deck's script copies the
  // src across, so a screenshot shown on four sheets costs its bytes once.
  const uses = (src.match(WALK_TOKEN) || []).length;
  const srcUses = (src.match(WALK_SRC) || []).length;
  if (srcUses !== uses) fail(`${uses - srcUses} {{WALK:*}} token(s) sit outside an <img src="...">; the build inlines screenshots only as an img src.`);
  const seen = new Set();
  let out = src
    .replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`)
    .replace(WALK_SRC, (_, head, name) => {
      if (seen.has(name)) return `${head}data-walk="${name}"`;
      seen.add(name);
      return `${head}src="${uris.get(name)}" data-walk="${name}"`;
    });
  console.log(`{{WALK:*}} -> ${names.length} screenshot(s) inlined once each, ${uses} use(s)`);

  for (const [key, body] of bodies) {
    const token = tokenOf(key);
    const want = frames.get(key).filter((f) => f.kind !== 't').length;
    const wrapped = wrap(body);
    out = out.split(token).join(escapeAttr(wrapped));
    console.log(`${token} -> ${want} frame(s) (${Buffer.byteLength(wrapped, 'utf8')} bytes each)`);
  }

  const left = out.match(/\{\{[^{}]{0,120}\}\}/);
  if (left) fail(`an unreplaced token is left in the output: ${left[0]}`);
  const dataUris = (out.match(/data:image\/[a-z]+;base64,/g) || []).length;
  if (dataUris !== names.length) fail(`the output carries ${dataUris} inlined image(s); expected exactly ${names.length}, one per screenshot.`);

  // Only Google Fonts may be reached over the network.
  const hosts = new Map();
  for (const m of out.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) hosts.set(m[1], (hosts.get(m[1]) || 0) + 1);
  const foreign = [...hosts.keys()].filter((h) => !FONT_HOSTS.has(h));
  if (foreign.length) fail(`the output reaches beyond Google Fonts: ${foreign.join(', ')}.`);
  if (/(?:src|href)\s*=\s*["']?\s*\/\//i.test(out)) fail('the output carries a protocol-relative URL.');
  console.log(`URLs: ${[...hosts].map(([h, n]) => `${h} x${n}`).join(', ')}`);

  const bytes = Buffer.byteLength(out, 'utf8');
  if (bytes > LIMIT) fail(`built page is ${bytes} bytes, over the 16 MB limit.`);
  await writeFile(OUT, out, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`built size: ${bytes} bytes (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
