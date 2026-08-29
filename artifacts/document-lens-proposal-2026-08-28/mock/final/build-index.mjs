/* Emits mock/final/index.html -- ONE file, pure ASCII, zero external requests.
   The generator exists because the same paper is mounted three times (1440,
   1280, 390) and a hand-copied third frame is a frame that drifts. Run:
     node build-index.mjs
   The deliverable is index.html; nothing here is needed to open it. */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS } from './gen/css.mjs';
import { SCRIPT } from './gen/script.mjs';
import { paper, rail, margin, standingSheet, marginSheet, sectionsSheet, drawer, mobileBar }
  from './gen/paper.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCK = join(HERE, '..');

const fonts = readFileSync(join(MOCK, 'assets/fonts/fonts-data-uri.css'), 'utf8');
const tokens = readFileSync(join(HERE, 'tokens.css'), 'utf8');
const lens = readFileSync(join(MOCK, 'lens.css'), 'utf8');
/* RF-01: all five product crops in mock/img/ are inlined, one custom property
   each, named --crop-<basename> so the property names match the ones
   mock/deck-parts/build.mjs mints for the deck. They are backgrounds, never
   <img> elements, and they are data URIs, so external requests stay at 0. */
const cropCss = readdirSync(join(MOCK, 'img')).filter(function (n) { return /\.jpg$/.test(n); })
  .sort().map(function (n) {
    const b64 = readFileSync(join(MOCK, 'img', n)).toString('base64');
    return '  --crop-' + n.replace(/\.jpg$/, '') + ': url(data:image/jpeg;base64,' + b64 + ');';
  }).join('\n');

const DEV = [
  ['rest', 'Rest'],
  ['condensed', 'Condensed'],
  ['ffe', 'Region in focus'],
  ['w1280', '1280'],
  ['w390', '390'],
  ['reduced', 'Reduced motion'],
  ['slow', 'Slow motion 4x']
];

function frame1440() {
  return '' +
  '<p class="frame-caption">1440 x 900 &mdash; rail | paper | margin. Scroll inside the frame; ' +
  'the lens is a function of that scroll.</p>' +
  '<div class="frame-wrap"><div class="frame" id="frame-1440" data-lens-state="rest" ' +
    'data-reading-index="approvals" style="--lens-reserve: 225px" tabindex="0" ' +
    'aria-label="The document at 1440 by 900">' +
    '<div class="doc-shell">' + rail('1440') + paper('1440') + margin('1440') + '</div>' +
    drawer('1440') +
    standingSheet('1440') +
  '</div></div>';
}

function frame1280() {
  return '' +
  '<p class="frame-caption">1280 x 800 &mdash; the rail widens to 136px and prints every label ' +
  'as a word; the margin becomes a sheet behind a printed tab.</p>' +
  '<div class="frame-wrap"><div class="frame" id="frame-1280" data-lens-state="rest" ' +
    'data-reading-index="approvals" style="--lens-reserve: 225px" tabindex="0" ' +
    'aria-label="The document at 1280 by 800">' +
    '<div class="doc-shell">' + rail('1280') + paper('1280') +
      '<div class="margin-tab-col">' +
        '<button type="button" class="margin-tab" data-open-sheet="sheet-margin-1280">' +
        'MARGIN &middot; 7 &middot; 1 OVERDUE</button>' +
      '</div>' +
    '</div>' +
    drawer('1280') +
    standingSheet('1280') + marginSheet('1280') +
  '</div></div>';
}

function frame390() {
  return '' +
  '<p class="frame-caption">390 x 844 &mdash; one column, the same 56px band, the ladder in the ' +
  'Sections sheet, the household in the mobile bar.</p>' +
  '<div class="frame-wrap"><div class="frame" id="frame-390" data-lens-state="mobile" ' +
    'data-reading-index="approvals" style="--lens-reserve: 247px" tabindex="0" ' +
    'aria-label="The document at 390 by 844">' +
    '<div class="doc-shell">' + paper('390') + '</div>' +
    mobileBar('390') +
    standingSheet('390') + sectionsSheet('390') + marginSheet('390') +
  '</div></div>';
}

/* ---- DOCUMENT ORDER IS A LOAD BUDGET (perf fix, 2026-08-29) --------------
   The host streams this file and the parser paints nothing while a <style> is
   still arriving, so every byte declared ahead of the markup is a byte of blank
   screen. The base64 payload -- 199 KB of @font-face plus 158 KB of product
   crops -- is 86% of the CSS and none of it is needed to lay the paper out:
   the three families all carry real fallback stacks and font-display: swap, and
   the crops are backgrounds on 48px thumbs. So the RULES go first (59 KB: the
   register, the lens namespace, the paper), the markup goes second, and the
   PAYLOAD goes last, between the paper and the script. First paint then costs
   the rules plus the first frame instead of the whole file.
   The payload still lands before <script>, so init measures the same declared
   faces it always did and __mockReady keeps meaning what it meant. */
const payloadCss = '' +
'<style>\n/* fonts-data-uri.css -- the six faces, base64. Declared AFTER the paper on\n' +
'   purpose: font-display: swap plus the fallback stacks in --font-display /\n' +
'   --font-body / --font-meta paint the text at once and the real face swaps in. */\n' +
  fonts + '\n</style>\n' +
'<style>\n/* the five product crops, base64, one custom property each (RF-01).\n' +
'   Backgrounds on 48px thumbs -- nothing about the layout waits on them. */\n' +
':root {\n' + cropCss + '\n}\n</style>\n';

const html = '' +
'<title>The Vandersteen Lens</title>\n' +
'<style>\n/* tokens.css -- the R126 register, verbatim (NG4 floor) + the four W4 families */\n' +
  tokens + '\n</style>\n' +
'<style>\n/* lens.css -- this program\'s .lens-* namespace, verbatim */\n' + lens + '\n</style>\n' +
'<style>' + CSS + '\n' +
'/* DECLARED OVERRIDE of lens.css section 1 (FINAL.md deviation D-1): the band\n' +
'   is 56px border-box at every offset and at every width. --lens-height stays a\n' +
'   PUBLISHED measurement of the header organ\'s occupancy of the frame, never a\n' +
'   layout driver -- driving block-size off it would reintroduce the 263px shift\n' +
'   that H5 exists to prevent. */\n' +
'.lens-band.lens-line { block-size: 56px; }\n' +
'</style>\n' +
'<div class="stage" id="stage" data-motion="normal">\n' +
  '<div class="stage-head">' +
    '<p class="stage-title">The Document &mdash; The Smart Lens</p>' +
    '<p class="stage-sub">The Vandersteen residence &middot; Shorewood Hills, Madison WI &middot; ' +
    'three frames, one paper, real scroll</p>' +
  '</div>\n' +
  '<div class="devbar" role="group" aria-label="Mockup states">' +
    '<span class="devbar-label">STATES</span>' +
    DEV.map(function (d) {
      return '<button type="button" class="devbtn" data-go="' + d[0] + '" aria-pressed="' +
        (d[0] === 'rest' ? 'true' : 'false') + '">' + d[1] + '</button>';
    }).join('') +
  '</div>\n' +
  frame1440() + '\n' + frame1280() + '\n' + frame390() + '\n' +
'</div>\n' +
payloadCss +
'<script>' + SCRIPT + '</script>\n';

writeFileSync(join(HERE, 'index.html'), html, 'utf8');
process.stdout.write('wrote index.html ' + Buffer.byteLength(html) + ' bytes\n');
