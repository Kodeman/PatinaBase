#!/usr/bin/env node
// Done-oracle for the homeowner design canvas.
// Usage: node check-canvas.mjs [--only Main,Arrival-Studio] [--skip-missing-index]
// Checks canvas.json shape, each listed board's .dc.html format rules,
// spec-required literal copy, and retired copy that must not reappear.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'canvas', 'project');
const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim().replace(/\.dc\.html$/, '')) : null;
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const norm = (s) => s.replace(/[‘’]/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const REQUIRED = {
  Main: ['Pay invoices, review approvals, and follow your project here.', 'Invoices', 'Approvals', 'Progress'],
  'Arrival-Studio': [
    "Your project isn't connected to this page yet. You can still view and pay your studio invoices.",
    'Contact your designer using the phone number or email you already use.',
  ],
  'Arrival-Desktop': ['Pay invoices, review approvals, and follow your project here.', 'Invoices', 'Approvals', 'Progress'],
  'Invoices-List': ['Invoices to pay', 'Payment history', 'View invoice', 'Total outstanding'],
  'Invoices-Pay': ['Continue to secure payment', 'Close payment details'],
  'Invoices-States': [
    "We couldn't load your invoices.",
    'No invoices to pay.',
    'Payments in progress',
    'Payment needs review',
    'Check expected',
  ],
  'Approval-Ask': [
    'Approve this edition',
    'Request changes',
    'Pause to discuss',
    'Type your full name before approving.',
    "Tell your designer what you'd like changed before sending.",
    'Send change request',
    'Confirm pause',
  ],
  'Approval-States': [
    'Confirm review',
    'Your review is confirmed. Your designer prepares the approval next. Nothing is waiting on you.',
    'Refresh review',
    "We couldn't load the information needed to confirm this review. Refresh the review or contact your designer.",
    'Loading document',
    "This document isn't available. Contact your designer for help.",
  ],
  Invitation: [
    'Open your project',
    'This invitation has already been used. Sign in to continue.',
    'This invitation link has expired.',
    'Send a new invitation link',
    "If a new invitation can be sent, you'll receive an email.",
    "We couldn't request a new link. Try again or contact your designer.",
  ],
  Progress: ['Project progress', 'Now', 'Next', 'Your designer will share the next step here.', 'Waiting on you'],
  System: [],
  Words: ['A toll on the line', 'Settle the balance'],
};

// Retired copy and banned patterns; Words.dc.html shows the "before" side on purpose.
const BANNED = [
  'A toll on the line',
  'Settle the balance',
  'Earlier invoices',
  'letters are waiting',
  'gone stale',
  'frozen authority revision',
  '% complete',
  'Email sent',
];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const indexPath = join(root, 'canvas.json');
let index = null;
if (!existsSync(indexPath)) fail('canvas.json', 'missing');
else {
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (e) {
    fail('canvas.json', `invalid JSON: ${e.message}`);
  }
}
if (index) {
  if (index.v !== 3) fail('canvas.json', 'v must be 3');
  if (!index.createdOnFiles || index.createdOnFiles.v !== 1) fail('canvas.json', 'createdOnFiles {v:1,at} missing');
  const keys = Object.keys(index.boards || {});
  const order = index.order || [];
  if (keys.length !== order.length || keys.some((k) => !order.includes(k))) fail('canvas.json', 'order must list exactly the boards keys');
  if (!keys.includes('Main.dc.html')) fail('canvas.json', 'Main.dc.html entry missing');
  for (const [id, n] of Object.entries(index.notes || {})) {
    if (typeof n.x !== 'number' || typeof n.y !== 'number' || typeof n.text !== 'string') fail('canvas.json', `note ${id} needs x,y,text`);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fail('canvas.json', `note id ${id} invalid`);
    if (n.fill && !['gray', 'red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink'].includes(n.fill)) fail('canvas.json', `note ${id} fill ${n.fill} invalid`);
  }
}

const boards = index ? Object.entries(index.boards || {}) : [];
for (const [file, frame] of boards) {
  const stem = file.replace(/\.dc\.html$/, '');
  if (only && !only.includes(stem)) continue;
  const where = file;
  const p = join(root, file);
  if (!existsSync(p)) {
    fail(where, 'file missing');
    continue;
  }
  if (!(frame.w >= 40 && frame.w <= 8000 && frame.h >= 40 && frame.h <= 8000)) fail(where, 'w/h out of 40–8000');
  const src = readFileSync(p, 'utf8');
  if (!src.includes('<script src="./support.js"></script>')) fail(where, 'support.js head line missing or altered');
  if (!/<x-dc>[\s\S]*<\/x-dc>/.test(src)) fail(where, '<x-dc> block missing');
  if (!/<script type="text\/x-dc" data-dc-script/.test(src)) fail(where, 'data-dc-script block missing');
  if (!/class Component extends DCLogic/.test(src)) fail(where, 'class Component extends DCLogic missing');
  if (/\b(import|export)\s/.test((src.match(/data-dc-script[\s\S]*?<\/script>/) || [''])[0].replace(/data-props='[^']*'/, ''))) fail(where, 'import/export in logic script');
  const props = src.match(/data-props='([^']*)'/);
  if (!props) fail(where, "data-props='…' missing");
  else {
    try {
      const decoded = props[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const pv = JSON.parse(decoded).$preview;
      if (!pv) fail(where, '$preview missing');
      else if (pv.width !== frame.w || pv.height !== frame.h) fail(where, `$preview ${pv.width}x${pv.height} ≠ canvas ${frame.w}x${frame.h}`);
    } catch (e) {
      fail(where, `data-props not JSON: ${e.message}`);
    }
  }
  if (/\{\{[^}]*[+!()?:<>=][^}]*\}\}/.test(src)) fail(where, 'expression inside {{ }} (holes are dotted lookups only)');
  if (/style="[^"]*var\(--/.test(src)) fail(where, 'CSS var() in inline style; use literal values');
  if (/<(iframe|object|embed)\b/i.test(src)) fail(where, 'iframe/object/embed not allowed');
  if (/innerHTML|appendChild/.test(src)) fail(where, 'script-built UI not allowed');
  if (EMOJI.test(src)) fail(where, 'emoji found');
  if (/\bAI\b/.test(src.replace(/<script[\s\S]*?<\/script>/g, ''))) fail(where, '"AI" in copy (vision: Designer-Taught Intelligence, never AI)');
  const text = norm(src);
  for (const s of REQUIRED[stem] || []) if (!text.includes(norm(s))) fail(where, `required copy missing: "${s}"`);
  if (stem !== 'Words') for (const s of BANNED) if (text.toLowerCase().includes(s.toLowerCase())) fail(where, `retired copy present: "${s}"`);
}

if (only) for (const s of only) if (!boards.some(([f]) => f === `${s}.dc.html`)) fail(`${s}.dc.html`, 'not listed in canvas.json boards');

if (errors.length) {
  console.error(`FAIL (${errors.length})\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`PASS ${only ? only.join(', ') : 'all boards'} (${boards.length} listed)`);
