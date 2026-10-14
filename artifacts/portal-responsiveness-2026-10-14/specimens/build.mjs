#!/usr/bin/env node
/**
 * build.mjs - writes the US-33 specimens (SQ-960) from one source.
 *
 *   node artifacts/portal-responsiveness-2026-10-14/specimens/build.mjs
 *
 * Outputs, next to this file: SPEC.md, index.html, skeletons-q.html, skeletons-x.html,
 * nav-progress.html, action-strips.html, waterfalls.html. check.mjs imports build() and
 * fails if a file on disk differs from what this script would write, so edit here and rebuild.
 * Writes no product code; nothing here is imported by the portal.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const SENTINEL = '<!-- SPECIMEN COMPLETE -->';

/* ── departures: token → marker class → PQ (plan.md §6) ───────────────────────── */
export const DEPARTURES = [
  ['nav-rule', 'nav-rule', 'PQ4', "Q's 1 px ink rule at 40% on the top edge of the paper, shown from 300 ms"],
  ['breath', 'breathe', 'PQ5', 'Placeholders breathe on R15 (3 s, opacity 1 → 0.62); still under reduced motion'],
  ['arrival-c', 'arrival-c', 'PQ3', 'Arrival option C: the skeleton is the arrival; the job title is set at first paint'],
  ['slow-line', 'slow-line', 'PQ7', 'Words only when slow (4 s), stalled (10 s) or failed; the prose loading lines retire'],
  ['pending-word', 'pending-word', 'PQ8', '"saving…" in the row meta from 400 ms, held at least 500 ms'],
  ['still-working', 'still-working', 'PQ16', 'The 8 s line on a pending-only act ("Still working.", "Still sending.")'],
  ['optimistic', 'optimistic', 'PQ9', 'Ink shows the new value before the receipt (internal acts only, never §5.2)'],
  ['inline-failure', 'inline-fail', 'PQ11', 'An R83 inline line with a 44 px Try again, instead of the red global toast'],
  ['undo', 'undo-row', 'PQ14', 'An in-flow Undo where a restore path exists'],
  ['shimmer', 'shimmer', 'PQ13', "X: a highlight sweeps the blocks every 1.4 s"],
  ['glow-bar', 'glow-bar', 'PQ13', "X: a 2 px clay bar at the top of the viewport with an 8 px glow"],
  ['toast', 'toast', 'PQ13', 'X: a slow or failure toast in the corner'],
  ['shadow', 'shadow', 'PQ13', 'Any drop shadow (D4 says depth never comes from shadows)'],
];

/* ── text pairs the specimens print (fg on ground), gated at 4.5:1 in both themes ── */
export const PAIRS = [
  ['ink', ['paper', 'paper-doc', 'rail', 'lift']],
  ['ink-muted', ['paper', 'paper-doc', 'rail', 'lift']],
  ['ink-subtle', ['paper', 'paper-doc', 'rail', 'lift']],
  ['ink-faint', ['paper', 'paper-doc', 'rail', 'lift']],
  ['clay-ink', ['paper', 'paper-doc', 'rail', 'lift']],
  ['terracotta-ink', ['paper', 'paper-doc', 'lift']],
  ['sage-ink', ['paper', 'paper-doc', 'lift']],
  ['bar-ink', ['bar']],
  ['paper', ['ink', 'ink-muted', 'terracotta-ink']],
];

/* ── tokens: light = globals.css; dark = docs/design/house-sheet/SPEC.md §A1 ────── */
const LIGHT = {
  paper: '#FAF7F2', 'paper-doc': '#FCFAF6', rail: '#E8E3DB', lift: '#FFFFFF',
  ink: '#2C2926', 'ink-muted': '#4E4339', 'ink-subtle': '#5A4E43', 'ink-faint': '#65594E',
  'clay-ink': '#7C5E30', 'terracotta-ink': '#9C5340', 'sage-ink': '#5F6B57',
  bar: '#2C2926', 'bar-ink': '#FAF7F2',
  clay: '#C4A57B', pearl: '#E5E2DD', 'rail-ph': 'rgba(44, 41, 38, .11)', warm: '#EEE6DB', shine: 'rgba(255, 255, 255, .75)',
  hair: 'rgba(44, 41, 38, .10)', edge: 'rgba(44, 41, 38, .18)', 'card-edge': '#8F8C88', 'rule-strong': '#2C2926',
  'press-in': 'rgba(196, 165, 123, .14)', 'viz-measured': '#7C5E30', 'viz-est': '#C4A57B',
};
const DARK = {
  paper: '#2A2622', 'paper-doc': '#26221E', rail: '#3A3530', lift: '#1C1A17',
  ink: '#F2EDE6', 'ink-muted': '#D6CEC4', 'ink-subtle': '#C7BEB3', 'ink-faint': '#B8AEA2',
  'clay-ink': '#D8B98A', 'terracotta-ink': '#E2A895', 'sage-ink': '#AFC0A6',
  bar: '#1C1A17', 'bar-ink': '#F2EDE6',
  clay: '#B39572', pearl: 'rgba(242, 237, 230, .12)', 'rail-ph': 'rgba(242, 237, 230, .12)', warm: '#3A3530', shine: 'rgba(242, 237, 230, .10)',
  hair: 'rgba(242, 237, 230, .14)', edge: 'rgba(242, 237, 230, .22)', 'card-edge': '#77736E', 'rule-strong': '#F2EDE6',
  'press-in': 'rgba(216, 185, 138, .14)', 'viz-measured': '#D8B98A', 'viz-est': '#8B7355',
};
const decl = (o) => Object.entries(o).map(([k, v]) => `--${k}:${v};`).join('');

/* ── shared CSS ───────────────────────────────────────────────────────────────── */
const BASE_CSS = `
:root,[data-theme="light"]{color-scheme:light;${decl(LIGHT)}}
[data-theme="dark"]{color-scheme:dark;${decl(DARK)}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;${decl(DARK)}}}
:root{--ease:cubic-bezier(.22,1,.36,1);--f-display:'Playfair Display',Georgia,serif;--f-body:'Inter',-apple-system,'Segoe UI',sans-serif;--f-meta:'DM Mono','SF Mono',ui-monospace,monospace}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0}
body{background:var(--paper);color:var(--ink);font:15px/1.55 var(--f-body)}
.wrap{max-width:1560px;margin:0 auto;padding:24px 16px 80px}
h1.page{font:500 32px/1.2 var(--f-display);margin:8px 0 6px}
.lede{max-width:76ch;color:var(--ink-muted);margin:0 0 12px}
.lede code,.fcap code,.fnote code{font:12px var(--f-meta)}
.t44{min-height:44px;min-width:44px}
.gobar{position:sticky;top:0;z-index:20;background:var(--paper);border-bottom:1px solid var(--edge);display:flex;flex-wrap:wrap;gap:6px;padding:8px 0;margin:0 0 16px}
.gobar button,.ctl button{font:500 12px/1 var(--f-meta);letter-spacing:.04em;padding:0 12px;background:var(--lift);color:var(--ink);border:1px solid var(--edge);border-radius:2px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.gobar button:focus-visible,.ctl button:focus-visible,.ctl input:focus-visible,[tabindex="0"]:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid var(--clay-ink);outline-offset:2px}
.ctl button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
a.t44{display:inline-flex;align-items:center;color:var(--clay-ink)}
.frame{background:var(--paper);color:var(--ink);margin:0 0 40px;border-top:2px solid var(--rule-strong);padding-top:10px}
.fcap{font:500 12px/1.5 var(--f-meta);letter-spacing:.03em;color:var(--ink-muted);margin:0 0 8px;display:flex;flex-wrap:wrap;gap:4px 14px}
.fcap b{color:var(--ink);font-weight:500}
.fnote{font-size:13px;color:var(--ink-faint);margin:8px 0 0;max-width:110ch}
body.nobar .fcap,body.nobar .fnote{display:none}
body.single .wrap{padding:0;max-width:none}
body.single .gobar,body.single .intro{display:none}
body.single .frame{margin:0;border-top:0;padding:0}
body.single .fcap,body.single .fnote{padding:8px 16px;margin:0}
.vpwrap{overflow-x:auto;max-width:100%}
.vp{border:1px solid var(--edge);width:max-content}
.vp.v1440{zoom:.5}.vp.v390{zoom:.8}
body.single .vp{zoom:1;border:0}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

const SCREEN_CSS = `
.screen{position:relative;overflow:hidden;background:var(--paper-doc);color:var(--ink);display:flex;flex-direction:column}
.s1440{width:1440px;height:900px}.s390{width:390px;height:844px}
.main{position:relative;flex:1;min-height:0;overflow:hidden}
.drawer{height:64px;flex:none;border-top:1px solid var(--edge);background:var(--lift);display:flex;align-items:center;justify-content:space-between;padding:0 24px;font-size:14px;color:var(--ink-muted)}
.mbar{height:72px;flex:none;background:var(--bar);color:var(--bar-ink);display:flex;align-items:center;justify-content:space-between;padding:0 20px}
.mbar .lnk{color:var(--bar-ink)}
.mono{font:500 12px/1 var(--f-meta);letter-spacing:.12em;text-transform:uppercase}
.lnk{display:inline-flex;align-items:center;font-size:14px;color:var(--clay-ink);text-decoration:none}
.rail .lnk{color:var(--ink-muted)}
.ln{display:flex;align-items:center;gap:10px;margin:0;min-width:0}
.ln-title{height:52px}.ln-h1{height:42px}.ln-job{height:28px}.ln-body{height:26px}.ln-small{height:21px}.ln-meta{height:18px}
.ph{display:block;flex:none;width:var(--w);max-width:100%}
.eb .ph{height:7px}.ln-title .ph{height:24px}.ln-h1 .ph{height:16px}.ln-job .ph{height:12px}.ln-body .ph{height:9px}.ln-small .ph{height:8px}.ln-meta .ph{height:7px}
.tx{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ln-title .tx{font:500 40px/52px var(--f-display);color:var(--ink)}
.ln-h1 .tx{font:500 30px/42px var(--f-display);color:var(--ink)}
.ln-job .tx{font:500 19px/28px var(--f-display);color:var(--ink)}
.ln-body .tx{font-size:15px;color:var(--ink)}
.ln-small .tx{font-size:13px;color:var(--ink-muted)}
.ln-meta .tx{font:500 11px/18px var(--f-meta);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted)}
.tx.need{color:var(--terracotta-ink)}
.eb{display:flex;align-items:center;gap:10px;font:500 11px/16px var(--f-meta);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-muted);margin:0 0 10px;min-height:18px}
.orn{width:34px;height:12px;flex:none;stroke:var(--clay);stroke-width:1.2;fill:none}
hr{border:0;margin:16px 0}
.r-strong{border-top:2px solid var(--rule-strong)}.r-hair{border-top:1px solid var(--hair)}
/* Q material: pearl bars, charcoal 11% on the rail */
.q .ph{background:var(--pearl)}
.q .rail .ph{background:var(--rail-ph)}
.breathe .ph{animation:breath 3s ease-in-out infinite}
@keyframes breath{0%,100%{opacity:1}50%{opacity:.62}}
.stalled .ph{opacity:.45;animation:none}
/* X material: warm blocks, radius 4, one shared sweep */
.x .ph{background:var(--warm);border-radius:4px;position:relative;overflow:hidden}
.x .rail .ph{background:var(--rail-ph)}
.shimmer .ph::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,var(--shine),transparent);transform:translateX(-100%);animation:shim 1.4s ease-in-out infinite}
@keyframes shim{to{transform:translateX(100%)}}
/* indicators */
.nav-rule{position:absolute;top:0;left:0;height:1px;width:calc(var(--p) * 100%);background:color-mix(in srgb,var(--ink) 40%,transparent);z-index:4;transition:width .6s var(--ease),opacity .2s linear}
.nav-rule.done{width:100%;opacity:.35}
.nav-rule.fail{background:var(--terracotta-ink);height:1.5px}
.glow-bar{position:absolute;top:0;left:0;height:2px;width:calc(var(--p) * 100%);background:linear-gradient(90deg,var(--clay),var(--clay-ink));box-shadow:0 0 8px var(--clay);z-index:5}
.slow-line{position:absolute;top:10px;left:0;right:0;text-align:center;font:italic 400 15px/1.4 var(--f-display);color:var(--ink-muted);z-index:4}
.toast{position:absolute;left:24px;bottom:84px;z-index:6;background:var(--bar);color:var(--bar-ink);padding:12px 16px;display:flex;gap:12px;align-items:center;font-size:14px;max-width:420px}
.s390 .toast{left:16px;right:16px;bottom:84px}
.shadow{box-shadow:0 8px 24px rgba(0,0,0,.22)}
.sweep{display:flex;flex-direction:column;gap:3px;flex:none}
.sweep b{display:block;height:2px;width:22px;background:var(--clay)}.sweep b:nth-child(2){width:16px}.sweep b:nth-child(3){width:10px}
/* Desk */
.desk{padding:48px 0 0}.desk>*{margin-left:auto;margin-right:auto;max-width:980px}
.s390 .desk{padding:24px 16px 0}
.d-head{display:flex;align-items:flex-end;justify-content:space-between}
.h-desk{font:500 38px/46px var(--f-display);margin:0}
.s390 .h-desk{font-size:28px;line-height:36px}
.d-acts{display:flex;gap:18px}
.cards{display:grid;gap:24px;grid-template-columns:repeat(3,1fr)}
.s390 .cards{grid-template-columns:1fr;gap:12px}
.card{border:1px solid var(--card-edge);background:var(--paper-doc);padding:14px 18px;min-height:150px}
.card.pressed{background:var(--press-in)}
.rows .row{display:grid;grid-template-columns:1fr 140px 120px;gap:18px;align-items:center;border-bottom:1px solid var(--hair);padding:6px 0}
.s390 .rows .row{grid-template-columns:1fr auto}
.s390 .rows .row>:nth-child(2){grid-column:1;grid-row:2}
/* Document */
.docp{display:grid;grid-template-columns:220px 1fr;flex:1;min-height:0}
.rail{background:var(--rail);padding:20px 18px;overflow:hidden}
.strata{display:flex;flex-direction:column;gap:4px;margin:16px 0 18px}
.strata b{display:block;height:3px;border-radius:9px;background:var(--ink-muted);width:98px}
.strata b:nth-child(2){background:var(--clay);width:78px}.strata b:nth-child(3){background:var(--card-edge);width:58px}
.sp{padding:3px 0 5px 12px;border-left:2px solid transparent}
.sp.on{border-left-color:var(--ink)}
.rail .eb{margin:18px 0 4px}
.rail .lnk{display:flex}
.dmain{display:grid;grid-template-columns:1fr 238px;position:relative;min-height:0;overflow:hidden}
.paper{padding:52px 56px 0;overflow:hidden}
.s390 .paper{padding:20px 16px 0}
.arrival-c .tx{font:500 40px/52px var(--f-display)}
.s390 .ln-title .tx,.s390 .arrival-c .tx{font-size:30px}
.act-ph{display:inline-block;height:44px;width:var(--w);margin:0 10px 10px 0;vertical-align:top}
.q .act-ph{background:var(--pearl)}.x .act-ph{background:var(--warm);border-radius:4px}
.next{border-top:2px solid var(--rule-strong);border-bottom:1px solid var(--hair);padding:6px 0;margin:8px 0 6px}
.next .lbl{font:500 11px/18px var(--f-meta);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted);flex:none}
.region{border-bottom:1px solid var(--hair);padding:16px 0 8px}
.reserve{min-height:68px}.reserve.exc{min-height:112px}
.margin{border-left:1px solid var(--hair);padding:24px 18px;background:var(--paper-doc)}
.mcard{border:1px solid var(--card-edge);padding:12px 14px;margin:0 0 12px;background:var(--lift)}
.err{padding:28px 0}.err-line{font:400 19px/1.5 var(--f-display);color:var(--terracotta-ink);margin:0 0 10px}
.btn{display:inline-flex;align-items:center;padding:0 16px;font:500 12px/1 var(--f-meta);letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--edge);background:var(--lift);color:var(--clay-ink);margin-right:8px}
.btn.quiet{border-color:transparent;background:none;color:var(--ink-muted)}
/* People, Library */
.people,.library{padding:40px 108px 0}.s390 .people,.s390 .library{padding:24px 16px 0}
.field{height:54px;border:1px solid var(--edge);background:var(--lift);display:flex;align-items:center;padding:0 16px;margin:6px 0 16px}
.tabs{display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin:4px 0 14px;min-height:22px}
.helper{font-size:13px;color:var(--ink-muted);margin:-4px 0 18px}
.prow{display:flex;align-items:center;gap:16px;padding:10px 0;border-bottom:1px solid var(--hair)}
.grow{flex:1;min-width:0}
.av{width:40px;height:40px;border-radius:50%;flex:none}
.thumb{width:54px;height:54px;flex:none}.s390 .thumb{width:44px;height:44px}
.q .av,.q .thumb{background:var(--pearl)}.x .av,.x .thumb{background:var(--warm)}
.x .thumb{border-radius:4px}
.chip{display:inline-flex;align-items:center;border:1px solid var(--edge);padding:6px 10px;flex:none;width:72px;height:24px}
.chip .ph{height:7px}
/* Build room */
.group-head{display:flex;align-items:center;gap:12px;margin:18px 0 4px}
.group-head .ln:last-child{margin-left:auto}
/* Room view */
.rv-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px 36px;border-bottom:1px solid var(--edge)}
.s390 .rv-head{padding:10px 16px}
.rv-head .eb{margin:0}
.board{position:relative;width:880px;height:500px;margin:44px auto 18px}
.s390 .board{width:358px;height:358px;margin:24px 16px 14px}
.corner{position:absolute;width:22px;height:22px;border-color:var(--ink-faint);border-style:solid;border-width:0}
.corner.tl{top:0;left:0;border-top-width:1px;border-left-width:1px}.corner.tr{top:0;right:0;border-top-width:1px;border-right-width:1px}
.corner.bl{bottom:0;left:0;border-bottom-width:1px;border-left-width:1px}.corner.br{bottom:0;right:0;border-bottom-width:1px;border-right-width:1px}
.rv-cap{max-width:880px;margin:0 auto}.s390 .rv-cap{margin:0 16px}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
}
`;

/* ── tiny HTML helpers ────────────────────────────────────────────────────────── */
const P = (w) => `<i class="ph" style="--w:${w}"></i>`;
const T = (t, c = '') => `<span class="tx${c ? ' ' + c : ''}">${t}</span>`;
const L = (k, ...xs) => `<div class="ln ln-${k}">${xs.join('')}</div>`;
const ORN = '<svg class="orn" viewBox="0 0 34 12" aria-hidden="true"><path d="M1 6h12M21 6h12M17 2l4 4-4 4-4-4z"/></svg>';
const lnk = (t) => `<span class="lnk t44">${t}</span>`;
const drawer = () => `<div class="drawer">${lnk('Studio inbox')}<span>Hartwell Studio</span></div>`;
const mbar = () => `<div class="mbar"><span class="mono">Patina</span>${lnk('Menu')}</div>`;
const foot = (w) => (w === 390 ? mbar() : drawer());
const busy = (what) => `<span class="sr">Loading ${what}.</span>`;

/* ── rooms: each takes w (1440 | 390) and o {loaded, title, pressed, error, busy} ── */
function deskRoom(w, o = {}) {
  const m = w === 390;
  const v = (pw, t, c) => (o.loaded ? T(t, c) : P(pw));
  const cardsData = [
    ['Holloway Den', 'Send the reminder', 'INV-2026-0721 · $3,800', '14 days overdue', 'Leah Hartwell'],
    ['Ines Calder', 'Reply', 'New inquiry at 6:35 am', 'Living room · $40–60k', 'Leah Hartwell'],
    ['Pell Court Dining', 'Release the order', 'Deposit in · $9,200', '2 hours ago', 'Leah Hartwell'],
  ];
  const cards = cardsData.slice(0, m ? 2 : 3).map(([job, act, b1, b2, who], i) =>
    `<div class="card${o.pressed && i === 0 ? ' pressed' : ''}">${L('meta', v('42%', job))}${L('job', v(['78%', '52%', '70%'][i], act))}${L('body', v('92%', b1))}${L('body', v('64%', b2, i === 0 ? 'need' : ''))}${L('small', v('36%', who))}</div>`).join('');
  const rowsData = [['Holloway Den', 'Buying', 'Owed by you'], ['Pell Court Dining', 'Ordering', 'Owed by you'], ['Linden Place Living Room', 'Proposal', 'Declined'], ['Thornfield', 'Signed', 'Open the project'], ['Garnet Hill', 'Proposal', 'Declined']];
  const rws = rowsData.slice(0, m ? 3 : 5).map(([a, b, c], i) =>
    `<div class="row">${L('body', v(['46%', '58%', '38%', '50%', '42%'][i], a))}${L('small', v('90px', b))}${L('small', v('80px', c))}</div>`).join('');
  return `<div class="main desk"${o.loaded ? '' : ' aria-busy="true"'}>${o.loaded ? '' : busy('the desk')}
    <div class="d-head"><h2 class="h-desk">Hello.</h2>${m ? '' : `<div class="d-acts">${lnk('+ Record an inquiry')}${lnk('+ Create a project file')}</div>`}</div>
    <hr class="r-strong"><div class="eb">Today ${o.loaded ? T('Monday 12 October') : P('120px')}</div>
    <div class="cards">${cards}</div>
    <div class="eb" style="margin-top:22px">${o.loaded ? T('Every job') : P('90px')}</div>
    <div class="rows">${rws}</div></div>`;
}

function docRail(active) {
  const spine = ['Overview', 'Rooms', 'Pieces', 'Money', 'Client', 'Notes'];
  return `<aside class="rail">${lnk('← Back to studio overview')}<div class="strata" aria-hidden="true"><b></b><b></b><b></b></div>
    ${spine.map((s, i) => `<div class="sp${s === active ? ' on' : ''}">${s === active ? L('small', T(s)) : L('small', P(['62%', '48%', '56%', '44%', '52%', '40%'][i]))}${L('meta', P('40%'))}</div>`).join('')}
    <div class="eb">Filed with this job</div>${['Specification book', 'Drawing sets', 'Boards', 'Project directory'].map(lnk).join('')}</aside>`;
}

function docPaper(w, o = {}) {
  const m = w === 390;
  if (o.error) {
    return `<div class="paper"><div class="err" role="alert"><p class="err-line">This document could not be picked up.</p><span class="btn t44 act">Try again</span><span class="btn quiet t44 act">Back to the desk</span></div>
      <div class="stalled">${L('meta', P('30%'))}${L('title', P('46%'))}</div></div>`;
  }
  const v = (pw, t, c) => (o.loaded ? T(t, c) : P(pw));
  const title = o.title === 'arrival'
    ? `<div class="ln ln-title arrival-c">${T('Holloway Den')}</div>`
    : L('title', v('46%', 'Holloway Den'));
  const next = `<div class="next"><div class="ln ln-job"><span class="lbl">Next —</span>${v('52%', 'Send the reminder for INV-2026-0721', 'need')}</div></div>`;
  const regions = [['Rooms', '3 rooms'], ['Pieces', '14 lines · 1 PO unanswered, 12 days'], ['Money', '↑ owed $3,800']].map(([h, c], i) =>
    `<div class="region"><div class="ln ln-job">${ORN}${v(['28%', '22%', '25%'][i], h)}</div>${L('small', v('34%', c))}<div class="reserve${i === 1 ? ' exc' : ''}"></div></div>`).join('');
  const acts = o.loaded ? '' : `<div><span class="act-ph" style="--w:180px"></span><span class="act-ph" style="--w:140px"></span>${m ? '' : '<span class="act-ph" style="--w:120px"></span>'}</div>`;
  const client = L('meta', v('30%', 'Nora and Sam Holloway'));
  return m
    ? `<div class="paper">${next}${client}${title}${acts}${regions}</div>`
    : `<div class="paper">${client}${title}${acts}${next}${regions}</div>`;
}

function docMargin(o = {}) {
  const v = (pw, t) => (o.loaded ? T(t) : P(pw));
  return `<aside class="margin"><div class="eb">In the margin</div>
    <div class="mcard">${L('meta', v('50%', 'From Nora'))}${L('small', v('86%', 'Can the den sofa'))}${L('small', v('60%', 'go a shade darker?'))}</div>
    <div class="mcard">${L('meta', v('40%', 'Fenmoor Joinery'))}${L('small', v('80%', 'PO-HD-0412 sent 30 Sep'))}</div></aside>`;
}

function docRoom(w, o = {}) {
  const busyAttr = o.loaded || o.error ? '' : ' aria-busy="true"';
  const sr = o.loaded || o.error ? '' : busy('the document');
  const rule = o.rule || '';
  if (w === 390) return `<div class="main"${busyAttr}>${sr}${rule}${docPaper(390, o)}</div>`;
  return `<div class="docp">${docRail(null)}<div class="dmain"${busyAttr}>${sr}${rule}${docPaper(1440, o)}${o.error ? '<aside class="margin"></aside>' : docMargin(o)}</div></div>`;
}

function peopleRoom(w) {
  const m = w === 390;
  const rows = Array.from({ length: m ? 4 : 6 }, (_, i) =>
    `<div class="prow"><span class="av"></span><div class="grow">${L('body', P(['32%', '40%', '28%', '36%', '30%', '44%'][i]))}${L('small', P(['22%', '18%', '26%', '20%', '24%', '16%'][i]))}</div>${m ? '' : `<span class="chip">${P('100%')}</span><span class="chip">${P('100%')}</span>`}</div>`).join('');
  return `<div class="main people" aria-busy="true">${busy('the directory')}<h2 class="h-desk">Studio contacts</h2><hr class="r-strong">
    <div class="eb">Search the directory</div><div class="field">${L('body', P('30%'))}</div>
    <div class="tabs">${['60px', '70px', '54px', '64px', '58px'].map((x) => L('meta', P(x))).join('')}</div>${rows}</div>`;
}

function libraryRoom(w) {
  const m = w === 390;
  const rows = Array.from({ length: m ? 4 : 5 }, (_, i) =>
    `<div class="prow"><span class="thumb"></span><div class="grow">${L('body', P(['38%', '30%', '44%', '34%', '40%'][i]))}${L('small', P(['20%', '26%', '18%', '24%', '22%'][i]))}</div></div>`).join('');
  return `<div class="main library" aria-busy="true">${busy('the shelves')}<h2 class="h-desk">Resource library</h2>
    <p class="helper">Exact matches update as you type. Enter asks the Library.</p>${L('meta', P('110px'))}
    <div class="field">${L('body', P('26%'))}</div><div class="tabs">${['70px', '62px', '80px'].map((x) => L('meta', P(x))).join('')}</div>
    <div class="eb">${P('140px')}</div>${rows}</div>`;
}

function piecesRoom(w) {
  const m = w === 390;
  const line = (i) => `<div class="prow"><span class="thumb"></span><div class="grow">${L('body', P(['42%', '36%', '48%'][i]))}${m ? L('small', P('30%')) : ''}</div>${m ? '' : `<span class="chip">${P('100%')}</span>${L('small', P('70px'))}`}</div>`;
  const group = (n) => `<div class="group-head">${ORN}<div class="ln ln-job">${P('22%')}</div>${L('meta', P('80px'))}</div>${Array.from({ length: n }, (_, i) => line(i)).join('')}`;
  const paper = `<div class="paper" style="padding-top:40px"><div class="ln ln-title">${T('Pieces')}</div>
    <div class="next"><div class="ln ln-job"><span class="lbl">Next —</span>${P('44%')}</div></div>
    ${L('small', P('28%'))}${L('small', P('22%'))}<div style="margin-top:8px"><span class="act-ph" style="--w:150px"></span><span class="act-ph" style="--w:120px"></span></div>
    ${group(m ? 2 : 3)}${group(m ? 1 : 2)}</div>`;
  if (m) return `<div class="main" aria-busy="true">${busy('the pieces')}${paper}</div>`;
  return `<div class="docp">${docRail('Pieces')}<div class="main" aria-busy="true">${busy('the pieces')}${paper}</div></div>`;
}

function roomRoom() {
  return `<div class="main" aria-busy="true">${busy('the room drawing')}<div class="rv-head">${lnk('← The desk')}<div class="eb">A room</div><span></span></div>
    <div class="board" aria-hidden="true"><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i></div>
    <div class="rv-cap">${L('job', P('180px'))}${L('small', P('120px'))}</div></div>`;
}

const ROOMS = {
  desk: ['Desk', '/desk', deskRoom],
  doc: ['Document', '/doc/[id]', docRoom],
  people: ['People', '/people', peopleRoom],
  library: ['Library', '/library', libraryRoom],
  pieces: ['Build room', '/doc/[id]/pieces', piecesRoom],
  room: ['Room view', '/room/[id]', roomRoom],
};

/* ── frames ───────────────────────────────────────────────────────────────────── */
/** frame: {id, file, label, departures[], theme?, w?, caption, note, body} */
function frameHtml(f) {
  const deps = f.departures.length ? f.departures.join(' ') : 'none';
  const depText = f.departures.length
    ? f.departures.map((d) => `${d} (${DEPARTURES.find((x) => x[0] === d)[2]})`).join(', ')
    : 'none';
  const theme = f.theme ? ` data-theme="${f.theme}"` : '';
  return `<!-- frame:${f.id} -->
<section class="frame" data-frame="${f.id}"${theme} data-departures="${deps}" aria-labelledby="cap-${f.id}">
<header class="fcap" id="cap-${f.id}"><b>${f.id}</b><span>${f.label}</span><span>${f.caption}</span><span>Departures: ${depText}</span></header>
${f.body}
<p class="fnote">${f.note ? f.note + ' ' : ''}Illustrative fixture · not a real studio.</p>
</section>
<!-- /frame:${f.id} -->`;
}

const screen = (w, cls, inner) => `<div class="vpwrap"><div class="vp v${w}"><div class="screen s${w} ${cls}">${inner}${foot(w)}</div></div></div>`;

function clientCommon() {
  const root = document.documentElement;
  function apply() {
    const parts = decodeURIComponent(location.hash.slice(1)).split('&');
    const id = parts[0];
    const toks = new Set(parts.slice(1));
    const frames = Array.from(document.querySelectorAll('[data-frame]'));
    const one = frames.find((f) => f.dataset.frame === id);
    document.body.classList.toggle('single', !!one);
    frames.forEach((f) => { f.hidden = !!one && f !== one; });
    document.body.classList.toggle('nobar', toks.has('nobar'));
    if (toks.has('dark')) root.dataset.theme = 'dark';
    else if (toks.has('light')) root.dataset.theme = 'light';
    else delete root.dataset.theme;
    if (one) window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  window.addEventListener('hashchange', apply);
  apply();
}

function page({ title, lede, frames, css = '', scripts = [] }) {
  const go = frames.map((f) => `<button type="button" class="t44" data-go="${f.id}">${f.id.replace(/^frame-/, '')}</button>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<style>${BASE_CSS}${SCREEN_CSS}${css}</style>
</head>
<body>
<div class="wrap">
<div class="intro"><h1 class="page">${title}</h1><p class="lede">${lede}</p></div>
<nav class="gobar" aria-label="Frames">${go}</nav>
${frames.map(frameHtml).join('\n')}
</div>
<script>
(${clientCommon.toString()})();
${scripts.map((s) => `(${s.toString()})();`).join('\n')}
</script>
</body>
</html>
${SENTINEL}
`;
}

/* ── skeleton files ───────────────────────────────────────────────────────────── */
const WIDTHS = [1440, 390];
const THEMES = ['light', 'dark'];

function skeletonFrames(dir, rooms) {
  const out = [];
  for (const key of rooms) {
    const [name, route, fn] = ROOMS[key];
    for (const w of WIDTHS) {
      for (const theme of THEMES) {
        const deps = dir === 'q' ? ['nav-rule', 'breath'] : ['shimmer', 'glow-bar'];
        if (dir === 'q' && key === 'doc') deps.push('arrival-c');
        const indicator = dir === 'q' ? '<i class="nav-rule" style="--p:.9"></i>' : '<i class="glow-bar" style="--p:.6"></i>';
        const o = { title: dir === 'q' && key === 'doc' ? 'arrival' : 'bar' };
        let inner;
        if (key === 'doc' && dir === 'q') inner = docRoom(w, { ...o, rule: indicator });
        else if (dir === 'q') inner = fn(w, o).replace('aria-busy="true">', `aria-busy="true">${indicator}`);
        else inner = (key === 'doc' ? docRoom(w, o) : fn(w, o)) + indicator;
        const cls = dir === 'q' ? 'q breathe' : 'x shimmer';
        out.push({
          id: `frame-${dir}-${key}-${w}-${theme}`,
          label: `${name} · ${dir === 'q' ? 'Q, Quiet paper' : 'X, Expressive'} · ${w} · ${theme}`,
          caption: `${route} · t ≈ 200 ms (commit + 150 ms placeholders)`,
          departures: deps,
          theme,
          note: theme === 'dark'
            ? 'Dark uses the house-sheet §A1 companions; the portal paints no dark set today (globals.css:56), so this is a preview, not a change.'
            : (dir === 'q' && key === 'doc' ? 'Arrival C: "Holloway Den" comes from the arrival token (KEYS.ARRIVE) and is set at first paint; nothing is hidden.' : ''),
          body: screen(w, cls, inner),
        });
      }
    }
  }
  return out;
}

function slowFrames() {
  const out = [];
  for (const theme of THEMES) {
    out.push({
      id: `frame-q-doc-slow-1440-${theme}`, label: `Document · Q · slow at 4 s · 1440 · ${theme}`,
      caption: '/doc/[id] · t = 4 s, still busy', departures: ['nav-rule', 'breath', 'arrival-c', 'slow-line'], theme,
      note: 'One italic line under the rule, role="status". At 10 s it adds a 44 px "Reload the page" link. No toast.',
      body: screen(1440, 'q breathe', docRoom(1440, { title: 'arrival', rule: '<i class="nav-rule" style="--p:.9"></i><p class="slow-line" role="status">Still reading. The connection is slow.</p>' })),
    });
    out.push({
      id: `frame-x-doc-slow-1440-${theme}`, label: `Document · X · slow at 3 s · 1440 · ${theme}`,
      caption: '/doc/[id] · t = 3 s, still busy', departures: ['shimmer', 'glow-bar', 'toast', 'shadow'], theme,
      note: 'X speaks earlier (3 s) and from the corner. Shown for comparison; plan §4 recommends Q.',
      body: screen(1440, 'x shimmer', docRoom(1440, { title: 'bar' }) + '<i class="glow-bar" style="--p:.82"></i><div class="toast shadow" role="status"><span class="sweep" aria-hidden="true"><b></b><b></b><b></b></span>Still loading Holloway Den…</div>'),
    });
  }
  return out;
}

/* ── navigation progress ──────────────────────────────────────────────────────── */
function navFrames() {
  const out = [];
  const rule = (p, c = '') => `<i class="nav-rule${c ? ' ' + c : ''}" style="--p:${p}"></i>`;
  const states = [
    ['start', 'Start · 300 ms', 'The Desk is still on screen; the pressed card warms at 0 ms. Under 300 ms nothing else shows, so a cached page lands with no flash.', ['nav-rule'], (w) => screen(w, 'q', deskRoom(w, { loaded: true, pressed: true }).replace('<div class="main desk">', `<div class="main desk">${rule(0.08)}`))],
    ['route', 'Progress · route stroke', 'The route is being fetched: the rule runs to 60% on the editorial ease. The Desk stays until the route commits.', ['nav-rule'], (w) => screen(w, 'q', deskRoom(w, { loaded: true, pressed: true }).replace('<div class="main desk">', `<div class="main desk">${rule(0.6)}`))],
    ['data', 'Progress · data stroke', 'The route has committed: frame and placeholders are up, the title is set by arrival C, and the rule runs to 90% while any aria-busy region remains. It never fakes completion.', ['nav-rule', 'breath', 'arrival-c'], (w) => screen(w, 'q breathe', docRoom(w, { title: 'arrival', rule: rule(0.9) }))],
    ['complete', 'Complete', 'No busy region for one frame: the rule draws to 100% in 120 ms, then fades over 200 ms. Content lands in the same boxes with a 120 ms fade.', ['nav-rule'], (w) => screen(w, 'q', docRoom(w, { loaded: true, title: 'bar', rule: rule(1, 'done') }))],
    ['fail', 'Failure', 'The rule stops where it was and turns terracotta-ink at 1.5 px. The paper says what happened, with a 44 px Try again; the placeholders stop breathing. The rail and drawer stay.', ['nav-rule', 'inline-failure'], (w) => screen(w, 'q', docRoom(w, { error: true, rule: rule(0.7, 'fail') }).replace('class="err"', 'class="err inline-fail"'))],
  ];
  for (const [key, label, caption, deps, body] of states) {
    for (const w of WIDTHS) {
      for (const theme of THEMES) {
        out.push({ id: `frame-nav-${key}-${w}-${theme}`, label: `Navigation rule · ${label} · ${w} · ${theme}`, caption: 'P2 Desk → Holloway Den', departures: deps, theme, note: caption, body: body(w) });
      }
    }
  }
  out.push({
    id: 'frame-nav-live', label: 'Navigation rule · live', caption: 'Press Play to run P2 at today\'s local timings (placeholder 1,004 ms, usable 1,464 ms; BASELINE.md:47)',
    departures: ['nav-rule', 'breath', 'arrival-c', 'inline-failure'],
    note: 'Under reduced motion the rule steps between 8%, 60%, 90% and done, and the placeholders do not breathe.',
    body: `<div class="ctl" style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px"><button type="button" class="t44" data-nav="play">Play</button><button type="button" class="t44" data-nav="fail" aria-pressed="false">Fail at 1.5 s</button><output class="clock" data-nav="clock" style="font:500 13px/44px var(--f-meta);color:var(--ink-muted)">0 ms</output></div>
<div class="vpwrap"><div class="vp v1440 navlive"><div class="screen s1440 q breathe" data-nav="screen"><div data-nav="desk">${deskRoom(1440, { loaded: true }).replace('<div class="main desk">', `<div class="main desk">${rule(0)}`)}</div><div data-nav="doc" hidden>${docRoom(1440, { title: 'arrival', rule: rule(0.6) })}</div><div data-nav="err" hidden>${docRoom(1440, { error: true, rule: rule(0.9, 'fail') }).replace('class="err"', 'class="err inline-fail"')}</div><div data-nav="ok" hidden>${docRoom(1440, { loaded: true, title: 'bar', rule: rule(1, 'done') })}</div>${drawer()}</div></div></div>`,
  });
  return out;
}

function clientNav() {
  const q = (k) => document.querySelector(`[data-nav="${k}"]`);
  const play = q('play'); const failBtn = q('fail'); const clock = q('clock');
  if (!play) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers = [];
  const show = (k) => { ['desk', 'doc', 'err', 'ok'].forEach((n) => { q(n).hidden = n !== k; }); };
  const setRule = (k, p) => { const r = q(k).querySelector('.nav-rule'); if (r) r.style.setProperty('--p', p); };
  failBtn.addEventListener('click', () => failBtn.setAttribute('aria-pressed', String(failBtn.getAttribute('aria-pressed') !== 'true')));
  play.addEventListener('click', () => {
    timers.forEach(clearTimeout); timers = [];
    const fail = failBtn.getAttribute('aria-pressed') === 'true';
    const card = q('desk').querySelector('.card');
    show('desk'); setRule('desk', 0); card.classList.add('pressed'); clock.textContent = '0 ms';
    const at = (ms, fn) => timers.push(setTimeout(() => { clock.textContent = ms + ' ms'; fn(); }, reduce ? ms * 1.5 : ms));
    at(300, () => setRule('desk', 0.08));
    at(340, () => setRule('desk', 0.6));
    at(700, () => { show('doc'); setRule('doc', 0.6); });
    at(1004, () => setRule('doc', 0.9));
    if (fail) at(1500, () => show('err'));
    else at(1464, () => show('ok'));
  });
  const fit = () => { const vp = document.querySelector('.navlive'); if (vp && document.body.classList.contains('single')) vp.style.zoom = String(Math.min(1, (window.innerWidth - 2) / 1440)); else if (vp) vp.style.zoom = ''; };
  window.addEventListener('resize', fit); window.addEventListener('hashchange', fit); fit();
}

/* ── action-feedback strips ───────────────────────────────────────────────────── */
const STRIP_CSS = `
.strip-head{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;margin:0 0 6px}
.strip-head h2{font:500 22px/1.3 var(--f-display);margin:0}
.cls{font:500 11px/1.4 var(--f-meta);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted)}
.cls.never{color:var(--terracotta-ink)}
.cite{font:12px/1.4 var(--f-meta);color:var(--ink-faint);overflow-wrap:anywhere;margin:0 0 4px}
.verdict{max-width:100ch;color:var(--ink-muted);margin:0 0 10px;font-size:14px}
.ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
.ctl [role="group"]{display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center}
.ctl .gl{font:500 11px/1 var(--f-meta);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);margin-right:2px}
.rng{width:min(420px,100%);accent-color:var(--clay-ink);margin:0}
.clock{font:500 13px/44px var(--f-meta);min-width:8ch;color:var(--ink-muted)}
.live{font-size:13px;color:var(--ink-muted);margin:0;min-height:20px;flex-basis:100%}
.stages{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.stage{border-top:1px solid var(--edge);padding-top:6px;min-width:0}
.stage>h3{font:500 11px/1.4 var(--f-meta);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted);margin:0 0 6px}
.cell{border:1px solid var(--hair);background:var(--paper-doc);padding:8px;margin:0 0 8px;min-height:96px;transition:outline-color .15s linear}
.cell.on{outline:2px solid var(--clay-ink);outline-offset:1px}
.cell .who{font:500 10px/1.4 var(--f-meta);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);margin:0 0 6px}
.cell .cap{font-size:12px;line-height:1.45;color:var(--ink-faint);margin:6px 0 0;overflow-wrap:anywhere}
.cell.na{display:flex;flex-direction:column;justify-content:center}
.mrow{display:flex;align-items:center;gap:10px;padding:0 8px;border-bottom:1px solid var(--hair);background:var(--paper-doc);font-size:14px;color:var(--ink)}
.mrow.short{min-height:29px}
.mrow.pressed{background:var(--press-in)}
.mrow.ghost .t{color:var(--ink-faint);font-style:italic}
.mrow .t{flex:1;min-width:0}
.mrow .m{font:500 11px/1 var(--f-meta);letter-spacing:.04em;color:var(--ink-faint)}
.mrow .m.ok{color:var(--sage-ink)}
.tick{width:20px;height:20px;border:1.5px solid var(--ink-muted);display:grid;place-items:center;font-size:13px;color:var(--sage-ink);flex:none}
.act{display:inline-flex;align-items:center;gap:8px;padding:0 14px;margin:6px 0 0;font:500 12px/1 var(--f-meta);letter-spacing:.04em;background:var(--ink);color:var(--paper);border:1px solid var(--ink)}
.act.sec{background:var(--lift);color:var(--clay-ink);border-color:var(--edge)}
.act.pressed{background:var(--ink-muted);border-color:var(--ink-muted);color:var(--paper)}
.act.busy{background:var(--lift);color:var(--ink);border-color:var(--edge)}
.line{font-size:13px;line-height:1.45;margin:6px 0 0;color:var(--ink)}
.line.err{color:var(--terracotta-ink)}
.line.ok{color:var(--sage-ink)}
.line.st{color:var(--ink-muted);font-style:italic}
.today-toast{margin:6px 0 0;padding:8px 10px;background:var(--terracotta-ink);color:var(--paper);font-size:12px}
.today-toast b{display:block}
.draft{font-size:13px;line-height:1.45;color:var(--ink-muted);border-left:2px solid var(--card-edge);padding:4px 8px}
.fieldm{display:flex;align-items:center;gap:8px;border:1px solid var(--edge);background:var(--lift);padding:0 10px;font-size:14px;color:var(--ink)}
.fieldm .phx{color:var(--ink-faint)}
.none{font:italic 13px/1.4 var(--f-display);color:var(--ink-faint)}
.folio{display:flex;gap:6px}
.folio i{width:40px;height:40px;background:var(--pearl);display:block}
.folio i.going{opacity:.45}
.folio i.gone{display:none}
.undo-row{display:flex;align-items:center;gap:8px;margin:6px 0 0;font-size:13px;color:var(--ink)}
.phases{font:500 11px/1.6 var(--f-meta);letter-spacing:.04em;color:var(--ink-muted)}
.phases .stale{color:var(--terracotta-ink)}
@media (max-width: 900px){.stages{grid-template-columns:1fr 1fr}}
@media (max-width: 560px){.stages{grid-template-columns:1fr}}
`;

const tick = (done) => `<span class="tick" aria-hidden="true">${done ? '✓' : ''}</span>`;
const mrow = (t, m, o = {}) => `<div class="mrow tgt${o.short ? ' short' : ' t44'}${o.c ? ' ' + o.c : ''}"${o.short ? ' data-today' : ''}${o.pressed !== undefined ? ` aria-pressed="${o.pressed}"` : ''}${o.busy ? ' aria-busy="true"' : ''}>${o.tick === false ? '' : tick(o.done)}<span class="t">${t}</span><span class="m${o.ok ? ' ok' : ''}${o.word ? ' pending-word' : ''}">${m}</span></div>`;
const act = (l, o = {}) => `<span class="act t44${o.sec ? ' sec' : ''}${o.p ? ' pressed' : ''}${o.busy ? ' busy' : ''}"${o.busy ? ' aria-busy="true"' : ''}>${l}</span>`;
const line = (k, t) => `<p class="line ${k}">${t}</p>`;
const fail = (t, retry = 'Try again', extra = '') => `<div class="inline-fail" role="alert">${line('err', t)}${act(retry, { sec: true })}${extra}</div>`;
const todayToast = (t) => `<div class="today-toast"><b>Error</b>${t}</div>`;
const fieldm = (v) => `<div class="fieldm t44 tgt">${v ? v : '<span class="phx">Room name</span>'}</div>`;
const draft = () => '<div class="draft">Nora and Sam, a reminder that INV-2026-0721 for $3,800 was due on 28 September…</div>';
const NA = (cap) => ({ html: '', cap, na: true });
const F = (html, cap) => ({ html, cap });
const TASK = 'Confirm sofa fabric';

const STRIPS = [
  {
    id: 'p6', title: 'P6 · Tick a task', cls: 'toggle · optimistic', kind: 'opt', undo: false,
    deps: ['optimistic', 'pending-word', 'inline-failure'],
    cite: 'work-block.tsx:314 → use-section-work.ts:141-159 · measured: value at 748 ms, settled 1,368 ms, 27 refetches (baseline/data/e1-P6-1440.json)',
    verdict: 'Today nothing answers until the write and its 27 refetches return. The proposal ticks at once (N3, behind optimistic-ink), shows "saving…" only past 400 ms, and settles on the write itself (F5).',
    today: [F(mrow(TASK, 'due 16 Oct', { short: true }), 'No press state; the row is 29 px, under 44.'), F(mrow(TASK, 'due 16 Oct', { short: true }), 'Nothing yet.'), F(mrow(TASK, 'due 16 Oct', { short: true }), 'Still nothing.'), F(mrow(TASK, 'done · 14 Oct', { short: true, done: true }), '✓ arrives with the refetch, at 748 ms.'), F(mrow(TASK, 'due 16 Oct', { short: true }) + todayToast('new row violates row-level security…'), 'The red global toast, far from the row.'), NA('No Undo.')],
    prop: [F(mrow(TASK, 'due 16 Oct', { c: 'pressed', pressed: false }), 'The row warms on press. 44 px row (F16).'), F(mrow(TASK, 'done · today', { c: 'optimistic', done: true, pressed: true, ok: true }), '✓ in sage-ink; aria-pressed="true".'), F(mrow(TASK, 'saving…', { done: true, pressed: true, busy: true, word: true }), 'Only past 400 ms, then held at least 500 ms.'), F(mrow(TASK, 'done · 14 Oct', { done: true, pressed: true, ok: true }), 'Settles on the write; nothing celebrates.'), F(mrow(TASK, 'due 16 Oct', { pressed: false }) + fail('Didn’t save. Still open.'), 'Restored to the truth; one role="alert" line; focus stays on the row.'), NA('A tick is its own undo: press it again.')],
  },
  {
    id: 'p7', title: 'P7 · Advance a phase', cls: 'server-decided · pending-only', kind: 'pend', undo: false,
    deps: ['still-working', 'inline-failure'],
    cite: 'phase-advance-control.tsx:324-347, :404-447 → use-project-v2.ts:626-642 · not measured; ≥29 refetches, 1.05–1.6 s prod EST (e1-data-writes.md #4)',
    verdict: 'Never optimistic (§5.2 item 4). "Completing…" already answers at the press. The fix is agreement: the receipt is written into the phase list (N5), so the list and the notice change together.',
    today: [F(act('Complete the phase', { p: true }), 'Ink floods on press.'), F(act('Completing…', { busy: true }) + line('st', 'Completing Concept…'), 'Word at once; aria-busy; guarded.'), F(act('Completing…', { busy: true }), 'Same.'), F('<div class="phases"><span class="stale">Concept · in progress</span> · Refinement · next</div>' + line('ok', 'Concept is complete. Refinement is next.'), 'The notice says complete; the list disagrees until its refetch.'), F(line('err', 'Couldn’t complete Concept.'), 'Inline alert exists.'), NA('Never.')],
    prop: [F(act('Complete the phase', { p: true }), 'Same press.'), F(act('Completing…', { busy: true }) + line('st', 'Completing Concept…'), 'The verb is the answer.'), F(act('Completing…', { busy: true }) + `<p class="line st still-working" role="status">Still working. You can leave this open.</p>`, 'Only at 8 s.'), F('<div class="phases">Concept · complete · Refinement · in progress</div>' + line('ok', 'Concept is complete. Refinement is next.'), 'List and notice agree (N5).'), F(fail('Couldn’t complete Concept. It is still in progress.'), 'Says what is true now.'), NA('Never: the server decides.')],
  },
  {
    id: 'p8', title: 'P8 · Add a room', cls: 'create · optimistic ghost', kind: 'opt', undo: false,
    deps: ['optimistic', 'pending-word', 'inline-failure'],
    cite: 'ffe-section.tsx:934-946 · rooms-rail.tsx:71-86 · not measured; 0.73 s p50, 2.4 s p90 prod EST, 3 serial round trips (plan §2 row 2.17)',
    verdict: 'Today the field closes and clears the typed name before the write, and a failure loses it. Fix now holds "Adding…" and keeps the name (F15); Next draws a ghost row confirmed in one round trip (N4).',
    today: [F(fieldm('Sunroom') + act('Add', { sec: true, p: true }), 'Enter.'), F('<p class="none">field closed · name cleared</p>', 'Closes before the server answers.'), F('<p class="none">nothing on the paper</p>', 'Blank.'), F(mrow('Sunroom', '$0 budget', { short: true, tick: false }), 'The room arrives with the refetch.'), F('<p class="none">no room · name lost</p>' + todayToast('duplicate key value…'), 'The typed name is gone.'), NA('—')],
    prop: [F(fieldm('Sunroom') + act('Add', { sec: true, p: true }), 'Press.'), F(mrow('Sunroom', '', { c: 'ghost optimistic', tick: false }) + fieldm(''), 'A ghost row from the typed name; the field is empty and focused for the next.'), F(mrow('Sunroom', 'adding…', { c: 'ghost', tick: false, busy: true, word: true }), 'Word past 400 ms.'), F(mrow('Sunroom', '$0 budget', { tick: false }) + '<span class="sr" role="status">Sunroom added.</span>', 'Ink goes solid; a polite "Sunroom added."'), F(mrow('Sunroom', 'not added', { c: 'ghost', tick: false }) + fail('Didn’t add Sunroom. The name is kept.', 'Try again', act('Discard', { sec: true })), 'The ghost keeps the typed name.'), NA('Not offered for a create.')],
  },
  {
    id: 'p9', title: 'P9 · Send the Holloway reminder', cls: 'external send · never optimistic', never: true, kind: 'pend', undo: false,
    deps: ['still-working', 'inline-failure'],
    cite: 'outbound-draft-review.tsx:228-229, :281-287 · act-draft.tsx:40-51, :354 · V23 draft-first · not measured (sending is never allowed in the lab)',
    verdict: 'Already honest: no frame claims "sent" before the receipt, and a failure already says how far the send got. Additions: the 8 s line, the Desk card clears after a send (F6), no automatic retry; a second send only after a definite refusal or a proven idempotent retry (F15d, O4).',
    today: [F(draft() + act('Send to Nora and Sam', { p: true }), 'Press.'), F(draft() + act('Sending', { busy: true }), 'The verb at once; the draft is unchanged.'), F(draft() + act('Sending', { busy: true }), 'Same.'), F(line('ok', 'Sent to Nora and Sam Holloway.'), 'Only on the server’s receipt.'), F(line('err', 'Not sent — email to this client is paused right now. Nothing went out.'), 'Existing honest copy (act-draft.tsx:46).'), NA('Never.')],
    prop: [F(draft() + act('Send to Nora and Sam', { p: true }), 'Same.'), F(draft() + act('Sending', { busy: true }), 'Same: nothing reads as sent.'), F(draft() + act('Sending', { busy: true }) + `<p class="line st still-working" role="status">Still sending.</p>`, 'At 8 s. "Nothing is sent twice." only if O4 proves idempotency.'), F(line('ok', 'Sent to Nora and Sam Holloway.'), 'The receipt; the Desk card clears (F6).'), F(fail('Not sent. The draft is still here.') + `<div class="inline-fail" role="alert">${line('err', 'We couldn’t confirm this went out — check the thread before sending again.')}</div>`, 'Two of the three outcomes act-draft.tsx:38-40 already tells apart. A definite refusal before the call offers Try again; an unconfirmed call offers no resend. The third, sent but not recorded here, says “Sent. It didn’t record here.” and retries only the recording.'), NA('Never.')],
  },
  {
    id: 'pay', title: 'Record the Holloway payment', cls: 'money · never optimistic', never: true, kind: 'pend', undo: false,
    deps: ['still-working', 'inline-failure'],
    cite: 'plan §5.2 item 2 · use-invoices.ts:1058,1111 (retry: false, F15) · not measured; today’s behaviour was not read by the US-33 seats',
    verdict: 'Money is never optimistic. The invoice keeps saying "owed" until the server records the payment; a failure says what is still true.',
    today: [NA('Not read in US-33.'), NA('—'), NA('—'), NA('—'), NA('—'), NA('—')],
    prop: [F('<div class="phases">INV-2026-0721 · $3,800 · 14 days overdue</div>' + act('Record $3,800', { p: true }), 'Press.'), F('<div class="phases">INV-2026-0721 · $3,800 · owed</div>' + act('Recording…', { busy: true }), 'The verb answers; the invoice still says owed.'), F(act('Recording…', { busy: true }) + `<p class="line st still-working" role="status">Still recording.</p>`, 'At 8 s.'), F(line('ok', 'Payment recorded · $3,800 · 14 Oct. INV-2026-0721 is paid.'), 'Only on the receipt.'), F(fail('Not recorded. INV-2026-0721 still shows $3,800 owed.'), 'No retry without a key (F15).'), NA('Never.')],
  },
  {
    id: 'undo', title: 'Remove a folio image (after PQ14)', cls: 'delete · pending-only, with Undo', kind: 'undo', undo: true,
    deps: ['still-working', 'inline-failure', 'undo'],
    cite: 'piece-folio.tsx:96 (remove), :283-286 (error) · N15 · not measured',
    verdict: 'Today the image disappears before the server answers, behind a window.confirm. With PQ14 the removal answers at once with an honest "Removing…" and an Undo; "Removed" appears only on the receipt.',
    today: [F('<div class="folio"><i></i><i></i><i></i></div>' + line('st', 'window.confirm: Remove this image?'), 'A browser dialog.'), F('<div class="folio"><i></i><i></i><i class="gone"></i></div>', 'Gone at once, before the receipt.'), F('<div class="folio"><i></i><i></i></div>', '—'), F('<div class="folio"><i></i><i></i></div>', 'Nothing confirms.'), F('<div class="folio"><i></i><i></i></div>' + line('err', 'Couldn’t remove the image.'), 'Error at :283-286; the image is not back.'), NA('No Undo.')],
    prop: [F('<div class="folio"><i></i><i></i><i></i></div>' + act('Remove', { sec: true, p: true }), 'Press; no dialog.'), F('<div class="folio"><i></i><i></i><i class="going"></i></div><div class="undo-row">Removing… ' + act('Undo', { sec: true }) + '</div>', 'Dimmed, not gone; Undo takes focus.'), F('<div class="folio"><i></i><i></i><i class="going"></i></div><p class="line st still-working" role="status">Still working.</p>', 'At 8 s.'), F('<div class="folio"><i></i><i></i></div><div class="undo-row undo-host">Removed · ' + act('Undo', { sec: true }) + '</div>', '"Removed" only on the receipt.'), F('<div class="folio"><i></i><i></i><i></i></div>' + fail('Not removed. The image is still on the folio.'), 'Restored at full ink.'), F('<div class="folio"><i></i><i></i><i></i></div><div class="undo-row">' + line('ok', 'Restored.') + '</div>', 'The previous list is saved again (N15).')],
  },
];

const STAGES = ['S0 · press · 0 ms', 'S1 · answer · ≤100 ms', 'S2 · pending', 'S3 · settled', 'S4 · failure · restore', 'S5 · Undo'];

function stripFrame(s) {
  const out = [];
  const cells = (rows) => STAGES.map((h, i) => `<div class="stage" data-col="${i}"><h3>${h}${i === 2 ? (s.kind === 'opt' ? ' · 400 ms' : ' · 8 s') : ''}</h3>${rows.map(([who, frames]) => {
    const f = frames[i];
    return `<div class="cell${f.na ? ' na' : ''}" data-col="${i}"><p class="who">${who}</p>${f.html || ''}${f.cap ? `<p class="cap">${f.cap}</p>` : ''}</div>`;
  }).join('')}</div>`).join('');
  const outcome = `<button type="button" class="t44" data-out="ok" aria-pressed="true">Saved</button><button type="button" class="t44" data-out="fail" aria-pressed="false">Fails</button>${s.undo ? '<button type="button" class="t44" data-out="undo" aria-pressed="false">Undo pressed</button>' : ''}`;
  const ctl = `<div class="ctl scrub" data-kind="${s.kind}">
<button type="button" class="t44" data-act="play">Play</button>
<input class="rng t44" type="range" min="0" max="1000" step="1" value="0" aria-label="Time since the press, ${s.title}">
<output class="clock">0 ms</output>
<div role="group" aria-label="The server answers at"><span class="gl">Server</span><button type="button" class="t44" data-t="250" aria-pressed="true">250 ms</button><button type="button" class="t44" data-t="800" aria-pressed="false">800 ms</button><button type="button" class="t44" data-t="9000" aria-pressed="false">9 s</button></div>
<div role="group" aria-label="Outcome"><span class="gl">Outcome</span>${outcome}</div>
<p class="live" aria-live="polite"></p></div>`;
  out.push(`<div class="strip-head"><h2>${s.title}</h2><span class="cls${s.never ? ' never' : ''}">${s.cls}</span></div>
<p class="cite">${s.cite}</p><p class="verdict">${s.verdict}</p>${ctl}<div class="stages">${cells([['Today', s.today], ['Proposed · Q', s.prop]])}</div>`);
  return out.join('');
}

function clientStrips() {
  const msOf = (v) => (v <= 600 ? Math.round((v / 600) * 1000) : Math.round(1000 + ((v - 600) / 400) * 9000));
  const vOf = (ms) => (ms <= 1000 ? Math.round((ms / 1000) * 600) : Math.round(600 + ((ms - 1000) / 9000) * 400));
  const names = ['S0 press', 'S1 answer', 'S2 pending', 'S3 settled', 'S4 failure, restored', 'S5 Undo'];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stageAt(kind, t, T, out) {
    if (t < 50) return 0;
    const settleAt = kind === 'opt' ? (T > 400 ? Math.max(T, 900) : T) : T;
    if (t < settleAt) {
      if (kind === 'opt') return t < 400 ? 1 : 2;
      return t >= 8000 ? 2 : 1;
    }
    if (out === 'fail') return 4;
    if (out === 'undo' && t >= settleAt + 600) return 5;
    return 3;
  }
  document.querySelectorAll('.scrub').forEach((ctl) => {
    const frame = ctl.closest('[data-frame]');
    const kind = ctl.dataset.kind;
    const rng = ctl.querySelector('.rng'); const clock = ctl.querySelector('.clock'); const live = ctl.querySelector('.live');
    let T = 250; let out = 'ok'; let last = -1; let raf = 0;
    const press = (sel, btn) => ctl.querySelectorAll(sel).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    function update() {
      const t = msOf(Number(rng.value));
      clock.textContent = t >= 1000 ? (t / 1000).toFixed(1) + ' s' : t + ' ms';
      const c = stageAt(kind, t, T, out);
      frame.querySelectorAll('.cell').forEach((el) => el.classList.toggle('on', Number(el.dataset.col) === c));
      if (c !== last) { live.textContent = 'Live stage: ' + names[c]; last = c; }
    }
    ctl.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { T = Number(b.dataset.t); press('[data-t]', b); update(); }));
    ctl.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', () => { out = b.dataset.out; press('[data-out]', b); update(); }));
    rng.addEventListener('input', update);
    ctl.querySelector('[data-act="play"]').addEventListener('click', () => {
      cancelAnimationFrame(raf);
      const end = Math.min(10000, Math.max(T, 900) + 1400);
      if (reduce) {
        const marks = [0, 60, 400, 900, T, 8000, T + 700].filter((m) => m <= end).sort((a, b) => a - b);
        const now = msOf(Number(rng.value));
        const nxt = marks.find((m) => m > now);
        rng.value = String(vOf(nxt === undefined ? 0 : nxt));
        update();
        return;
      }
      rng.value = '0';
      const t0 = performance.now();
      const step = (now) => {
        const ms = Math.min(end, (now - t0) * (end > 2000 ? 2.5 : 1));
        rng.value = String(vOf(ms)); update();
        if (ms < end) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    update();
  });
}

/* ── waterfalls ───────────────────────────────────────────────────────────────── */
const WF_CSS = `
.wf{position:relative;margin:4px 0 16px}
.wf h3{font:500 14px/1.4 var(--f-body);margin:14px 0 2px}
.wf .sub{font-size:13px;color:var(--ink-muted);margin:0 0 8px;max-width:100ch}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--ink-muted);margin:0 0 6px}
.legend i{display:inline-block;width:14px;height:10px;margin-right:6px;vertical-align:middle;border-radius:0 2px 2px 0}
.legend .k-m{background:var(--viz-measured)}.legend .k-e{background:var(--viz-est)}
.legend .k-r{width:14px;height:2px;background:var(--viz-est);border-radius:0}
.lanes{display:grid;grid-template-columns:minmax(120px,230px) 1fr}
.axis{grid-column:2;position:relative;height:22px;font:11px/22px var(--f-meta);color:var(--ink-faint)}
.axis span{position:absolute;transform:translateX(-50%)}
.lane{display:contents}
.lab{grid-column:1;font-size:13px;line-height:1.3;color:var(--ink);padding:6px 10px 6px 0;border-top:1px solid var(--hair);display:flex;flex-direction:column;justify-content:center}
.lab small{font:11px/1.3 var(--f-meta);color:var(--ink-faint)}
.lab.grp{font-weight:600;padding-top:12px}
.track{grid-column:2;position:relative;border-top:1px solid var(--hair);display:block;outline:none}
.track:hover .bar,.track:focus-visible .bar{filter:brightness(1.08)}
.track:focus-visible{outline:2px solid var(--clay-ink);outline-offset:-2px}
.gl{position:absolute;top:0;bottom:0;width:1px;margin-left:-1px;background:var(--hair)}
.budget{position:absolute;top:0;bottom:0;width:1px;background:color-mix(in srgb,var(--terracotta-ink) 55%,transparent)}
.bar{position:absolute;top:13px;height:14px;border-radius:0 4px 4px 0}
.bar.m{background:var(--viz-measured)}.bar.e{background:var(--viz-est)}
.whisk{position:absolute;top:19px;height:2px;background:var(--viz-est)}
.whisk::after{content:'';position:absolute;right:0;top:-5px;width:2px;height:12px;background:var(--viz-est)}
.val{position:absolute;bottom:3px;font:11px/1 var(--f-meta);color:var(--ink-muted);white-space:nowrap}
.blab{position:absolute;top:2px;font:10px/1 var(--f-meta);color:var(--terracotta-ink);padding-left:3px;white-space:nowrap}
.tip{position:fixed;z-index:30;pointer-events:none;background:var(--lift);color:var(--ink);border:1px solid var(--edge);padding:8px 10px;font-size:13px;max-width:320px}
.tip strong{display:block;font:600 15px/1.3 var(--f-body)}
.tip span{color:var(--ink-muted)}
details.tbl{margin:8px 0 0}
details.tbl summary{display:inline-flex;align-items:center;cursor:pointer;font:500 12px var(--f-meta);letter-spacing:.06em;text-transform:uppercase;color:var(--clay-ink)}
.tbl table{border-collapse:collapse;font-size:13px;margin:6px 0 0;width:100%;max-width:980px}
.tbl th,.tbl td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--hair);vertical-align:top}
.tbl th{font:500 11px var(--f-meta);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted)}
.tbl td.n{font-variant-numeric:tabular-nums;white-space:nowrap}
.tblwrap{overflow-x:auto}.tbl td{overflow-wrap:anywhere}
@media (max-width: 560px){.lanes{grid-template-columns:104px 1fr}.val{font-size:10px}}
`;

const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s` : `${ms} ms`);

/** row: {label, sub, kind:'m'|'e', from, to, hi?, text, src, grp?} */
function lanesChart({ id, title, sub, max, budgets, rows, legendRange }) {
  const pct = (ms) => `${((ms / max) * 100).toFixed(2)}%`;
  const ticks = [];
  for (let s = 0; s <= max; s += 1000) ticks.push(s);
  const grid = ticks.map((s) => `<i class="gl" style="left:${pct(s)}"></i>`).join('') + budgets.map(([ms]) => `<i class="budget" style="left:${pct(ms)}"></i>`).join('');
  const axis = ticks.filter((s, i) => s < max && (max <= 6000 || i % 2 === 0)).map((s) => `<span style="left:${pct(s)}">${s / 1000}</span>`).join('');
  const body = rows.map((r) => {
    if (r.grp) return `<div class="lab grp">${r.label}</div><div class="track" aria-hidden="true">${grid}</div>`;
    let marks = '';
    if (r.to !== undefined) {
      marks += `<span class="bar ${r.kind}" style="left:${pct(r.from)};width:${pct(Math.max(r.to - r.from, max / 300))}"></span>`;
      if (r.hi !== undefined) marks += `<span class="whisk" style="left:${pct(r.to)};width:${pct(r.hi - r.to)}"></span>`;
      const end = r.hi !== undefined ? r.hi : r.to;
      marks += end / max > 0.5 ? `<span class="val" style="right:calc(100% - ${pct(end)})">${r.text}</span>` : `<span class="val" style="left:${pct(end)}">${r.text}</span>`;
    } else {
      marks += `<span class="val" style="left:0">${r.text}</span>`;
    }
    const budgetLabels = r.first ? budgets.filter(([, l]) => l).map(([ms, l]) => `<span class="blab" style="left:${pct(ms)}">${l}</span>`).join('') : '';
    const tip = `${r.text} | ${r.label}${r.sub ? ' · ' + r.sub : ''} | ${r.src}`;
    return `<div class="lab">${r.label}${r.sub ? `<small>${r.sub}</small>` : ''}</div><div class="track t44" tabindex="0" data-tip="${tip.replace(/"/g, '&quot;')}" aria-label="${(r.label + ': ' + r.text).replace(/"/g, '&quot;')}">${grid}${budgetLabels}${marks}</div>`;
  }).join('');
  const table = `<details class="tbl"><summary class="t44">Table view</summary><div class="tblwrap"><table><thead><tr><th>Row</th><th>Kind</th><th>From</th><th>To</th><th>Source</th></tr></thead><tbody>${rows.filter((r) => !r.grp).map((r) => `<tr><td>${r.label}${r.sub ? ' · ' + r.sub : ''}</td><td>${r.kind === 'm' ? 'measured' : r.kind === 'e' ? 'EST' : '—'}</td><td class="n">${r.to !== undefined ? fmt(r.from) : '—'}</td><td class="n">${r.text}</td><td>${r.src}</td></tr>`).join('')}</tbody></table></div></details>`;
  return `<div class="wf" id="${id}"><h3>${title}</h3><p class="sub">${sub}</p>
<div class="legend"><span><i class="k-m"></i>Measured, local lab</span><span><i class="k-e"></i>EST, low end</span>${legendRange ? '<span><i class="k-r"></i>EST range to the high end</span>' : ''}<span>Vertical line: budget · axis in seconds from the click</span></div>
<div class="lanes"><div class="axis">${axis}</div>${body}</div>${table}</div>`;
}

const D_TRACE = 'baseline/traces/local-desk-waterfall.json via e2-page-architecture.md §0';
const DOC_TRACE = 'baseline/traces/local-doc-waterfall.json via e2-page-architecture.md §0';
const PLAN = (row) => `synthesis/plan.md §2 row ${row}`;

function trackRows(spec) {
  // spec: [{label, sub, today:[ms,src], fix, next, struct}] where each track = [lo, hi?, text] or null
  const rows = [];
  spec.forEach((m, i) => {
    rows.push({ grp: true, label: m.label });
    rows.push({ label: 'Today', sub: m.sub, kind: 'm', from: 0, to: m.today[0], text: `${m.today[0].toLocaleString('en-US')} ms`, src: m.today[1], first: i === 0 });
    for (const [name, tr] of [['After Fix now', m.fix], ['After Next', m.next], ['After Structural', m.struct]]) {
      if (!tr) { rows.push({ label: name, kind: '-', text: 'not estimated', src: m.row }); continue; }
      rows.push({ label: name, kind: 'e', from: 0, to: tr[0], hi: tr[1] === undefined || tr[1] === tr[0] ? undefined : tr[1], text: `${tr[2]} EST`, src: PLAN(m.row) });
    }
  });
  return rows;
}

function waterfallFrames() {
  const p1Lanes = lanesChart({
    id: 'wf-p1-lanes', title: 'P1 hard-load lanes: before (measured) and after Fix now (EST)',
    sub: 'Lanes from the /desk hard-load trace that P1 lands on (usable 6,926 ms in that trace; 7,153 ms across the P1 runs). The after lanes are this seat’s arithmetic from the plan’s item savings: F8–F10 remove 220–390 KB at about 1 MB/s; F1 takes the session from a local store, so the Desk reads no longer start behind 16 serial auth calls (overlap not credited); F2 drops the second copy of the Desk reads. Read the usable range from the milestone chart below, which is the plan’s own figure.',
    max: 9000, budgets: [[1500, 'B3 1.5 s']], legendRange: true,
    rows: [
      { grp: true, label: 'JavaScript, CSS, fonts' },
      { label: 'Today', kind: 'm', from: 0, to: 3016, text: '0–3.0 s', src: D_TRACE, first: true },
      { label: 'After Fix now', sub: 'F8, F9, F10', kind: 'e', from: 0, to: 2626, hi: 2796, text: 'ends 2.6–2.8 s EST', src: 'plan.md §3.1 F8–F10; §2 estimates note' },
      { grp: true, label: 'auth/v1/user, serial' },
      { label: 'Today', sub: '16 calls, ~172 ms each', kind: 'm', from: 3258, to: 6485, text: '3.3–6.5 s', src: D_TRACE },
      { label: 'After Fix now', sub: 'F1: ≤2 calls, off the critical path', kind: 'e', from: 2868, to: 3212, text: '≤2 calls, ~0.3 s EST', src: 'plan.md §3.1 F1 (gate: 16–21 → ≤2)' },
      { grp: true, label: 'Desk reads, 24 in parallel' },
      { label: 'Today', sub: 'start after 15 of 16 auth calls', kind: 'm', from: 5951, to: 6926, text: '6.0–6.9 s', src: D_TRACE },
      { label: 'After Fix now', sub: 'start at hydration', kind: 'e', from: 2868, to: 3843, hi: 4013, text: '2.9–4.0 s EST', src: 'this seat: today’s 975 ms read span moved to hydration' },
      { grp: true, label: 'Second copy of the Desk reads, need facts' },
      { label: 'Today', kind: 'm', from: 6926, to: 8372, text: '6.9–8.4 s', src: D_TRACE },
      { label: 'After Fix now', sub: 'F2: one Desk key', kind: '-', text: 'removed', src: 'plan.md §3.1 F2 (one duplicate 24-read run, about 24 fewer requests)' },
    ],
  });
  const p1Ms = lanesChart({
    id: 'wf-p1-ms', title: 'P1 sign-in → Desk: when each moment arrives, by track',
    sub: 'Bars run from the click. Today is measured (baseline/data/local-P1-1440.json, run 2). Track figures are the plan’s cumulative estimates; a whisker runs to the high end of a range.',
    max: 8000, budgets: [[100, ''], [200, 'B1 B2'], [1500, 'B3']], legendRange: true,
    rows: trackRows([
      { label: 'First visible change (B1 ≤100 ms)', row: '2.1', today: [159, 'baseline/data/local-P1-1440.json (firstChange)'], fix: [100, 100, '≤100 ms'], next: [100, 100, '≤100 ms'], struct: [100, 100, '≤100 ms'] },
      { label: 'Shaped placeholder (B2 ≤200 ms)', row: '2.2', today: [2476, 'baseline/BASELINE.md:46 (placeholder)'], fix: [2300, 2300, '~2.3 s'], next: [200, 200, '≤200 ms'], struct: [200, 200, '≤200 ms'] },
      { label: 'Usable (B3 ≤1.5 s)', row: '2.3', today: [7153, 'baseline/BASELINE.md:46 (usable)'], fix: [3600, 4200, '3.6–4.2 s'], next: [3100, 3700, '3.1–3.7 s'], struct: [2700, 3400, '2.7–3.4 s'] },
      { label: 'Hard load /desk, usable', row: '2.4', today: [6974, 'baseline/BASELINE.md:47 (P1hard usable)'], fix: [3500, 4000, '3.5–4.0 s'], next: [3000, 3500, '3.0–3.5 s'], struct: [2600, 3200, '2.6–3.2 s'] },
    ]),
  });
  const p2Ms = lanesChart({
    id: 'wf-p2-ms', title: 'P2 Desk → Document (SPA): when each moment arrives, by track',
    sub: 'Today is measured locally (baseline/data/local-P2-1440.json, run 2); prod first change was 608 ms (BASELINE.md, prod walk). The plan estimates first change, placeholder and usable; no-busy and settle are not estimated.',
    max: 5000, budgets: [[100, ''], [200, 'B1 B2'], [1500, 'B3']], legendRange: true,
    rows: trackRows([
      { label: 'First visible change (B1 ≤100 ms)', row: '2.5', today: [215, 'baseline/data/local-P2-1440.json (firstChange)'], fix: [100, 100, '≤100 ms'], next: [100, 100, '≤100 ms'], struct: [100, 100, '≤100 ms'] },
      { label: 'Shaped placeholder (B2 ≤200 ms)', row: '2.6', today: [1004, 'baseline/data/local-P2-1440.json (placeholder)'], fix: [1000, 1000, '~1.0 s'], next: [200, 200, '≤200 ms'], struct: [200, 200, '≤200 ms'] },
      { label: 'Usable (B3 ≤1.5 s)', row: '2.7', today: [1454, 'baseline/data/local-P2-1440.json (usable)'], fix: [700, 1000, '0.7–1.0 s'], next: [600, 900, '0.6–0.9 s'], struct: [600, 900, '0.6–0.9 s'] },
      { label: 'No busy region', row: '2.7', today: [3582, 'baseline/data/local-P2-1440.json (noBusy)'], fix: null, next: null, struct: null },
      { label: 'Settled', row: '2.7', today: [4513, 'baseline/data/local-P2-1440.json (settled)'], fix: null, next: null, struct: null },
    ]),
  });
  const p2Lanes = lanesChart({
    id: 'wf-p2hard-lanes', title: 'P2 hard load /doc/[id]: today’s lanes (measured)',
    sub: 'From the Document hard-load trace. Where the trace gives only a start, the lane is drawn to the next level’s start and says so. The after state is in the milestone chart below; the plan gives no lane-level estimate for the Document.',
    max: 11000, budgets: [[1500, 'B3 1.5 s']], legendRange: false,
    rows: [
      { label: 'Doc page chunk', kind: 'm', from: 0, to: 3302, text: 'ends 3.3 s', src: DOC_TRACE, first: true },
      { label: 'auth/v1/user × 15', sub: 'back to back', kind: 'm', from: 3588, to: 6269, text: '3.6–6.3 s', src: DOC_TRACE },
      { label: 'Level 1', sub: 'document_state + ~25 Desk tables; drawn to Level 2', kind: 'm', from: 6275, to: 7893, text: 'from 6.3 s', src: DOC_TRACE },
      { label: 'auth/v1/user × 5 more', kind: 'm', from: 6296, to: 7863, text: '6.3–7.9 s', src: DOC_TRACE },
      { label: 'Level 2', sub: '33 project reads; drawn to Level 3', kind: 'm', from: 7893, to: 8267, text: 'from 7.9 s', src: DOC_TRACE },
      { label: 'Level 3', sub: 'plans, identity → FF&E, margin; last start', kind: 'm', from: 8267, to: 10032, text: 'starts to 10.0 s', src: DOC_TRACE },
    ],
  });
  const p2HardMs = lanesChart({
    id: 'wf-p2hard-ms', title: 'P2 hard load /doc/[id]: usable and largest paint, by track',
    sub: 'Today: usable 6,773 ms and LCP 10,728 ms, because the arrival hides the finished paper (BASELINE.md:49). Under arrival C (Next) the largest paint lands with usable.',
    max: 11000, budgets: [[1500, 'B3']], legendRange: true,
    rows: trackRows([
      { label: 'Usable', row: '2.8', today: [6773, 'baseline/BASELINE.md:49 (P2hard usable)'], fix: [3600, 4100, '3.6–4.1 s'], next: [3300, 3800, '3.3–3.8 s'], struct: [3100, 3600, '3.1–3.6 s'] },
      { label: 'Largest contentful paint', row: '2.8', today: [10728, 'baseline/BASELINE.md:49 (LCP)'], fix: [5000, 6000, '5–6 s'], next: [3300, 3800, '≈ usable, 3.3–3.8 s'], struct: [3100, 3600, '≈ usable, 3.1–3.6 s'] },
    ]),
  });
  const note = 'Local lab: 4× CPU, Fast 4G (165 ms latency, ~1 MB/s), headless Chromium against localhost. Every EST is an estimate, not a measurement.';
  return [
    { id: 'frame-wf-p1', label: 'P1 sign-in → Desk · before / after', caption: 'plan.md §2 rows 2.1–2.4', departures: [], note, body: p1Lanes + p1Ms },
    { id: 'frame-wf-p2', label: 'P2 Desk → Document · before / after', caption: 'plan.md §2 rows 2.5–2.8', departures: [], note, body: p2Ms + p2Lanes + p2HardMs },
  ];
}

function clientTips() {
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  function showFor(el, x, y) {
    const [v, lbl, src] = el.dataset.tip.split(' | ');
    tip.textContent = '';
    const s = document.createElement('strong'); s.textContent = v; tip.appendChild(s);
    const a = document.createElement('span'); a.textContent = lbl; tip.appendChild(a);
    tip.appendChild(document.createElement('br'));
    const b = document.createElement('span'); b.textContent = src; tip.appendChild(b);
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, x + 12)) + 'px';
    tip.style.top = Math.max(8, y - r.height - 12) + 'px';
  }
  document.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointermove', (e) => showFor(el, e.clientX, e.clientY));
    el.addEventListener('pointerleave', () => { tip.hidden = true; });
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); showFor(el, r.left + r.width / 3, r.top); });
    el.addEventListener('blur', () => { tip.hidden = true; });
  });
}

/* ── files ────────────────────────────────────────────────────────────────────── */
function files() {
  const qFrames = skeletonFrames('q', ['desk', 'doc', 'people', 'library', 'pieces', 'room']);
  const xFrames = skeletonFrames('x', ['desk', 'doc']);
  const slow = slowFrames();
  const nav = navFrames();
  const strips = STRIPS.map((s) => ({
    id: `frame-strip-${s.id}`, label: s.title, caption: s.cls, departures: s.deps,
    note: 'Server times on the scrubber are design assumptions set against prod request durations (p50 243 ms, p90 803 ms; BASELINE.md, request durations). Use &dark in the hash for the dark theme.',
    body: stripFrame(s),
  }));
  const wf = waterfallFrames();
  const out = {
    'skeletons-q.html': { title: 'Skeletons, Quiet paper', frames: [...qFrames, ...slow.filter((f) => f.id.startsWith('frame-q'))], lede: 'Direction Q, the recommendation in synthesis/plan.md §4, with arrival option C (PQ2, PQ3). Six rooms at 1440 and 390, light and dark, at about 200 ms after a navigation: the frame is real, placeholders are pearl bars in the real line boxes, they breathe on R15, and the 1 px ink rule runs at the top of the paper. Open one frame with #frame-…; add &nobar to hide the captions.' },
    'skeletons-x.html': { title: 'Skeletons, Expressive', frames: [...xFrames, ...slow.filter((f) => f.id.startsWith('frame-x'))], lede: 'Direction X, the alternate (plan.md §4), for the Desk and the Document: warm shimmering blocks, a 2 px glowing bar at the top of the viewport, and a corner toast at 3 s. Every PQ13 extra is listed per frame. Same geometry as Q, so the two compare directly.' },
    'nav-progress.html': { title: 'Navigation rule', frames: nav, lede: 'The navigation indicator of Q (PQ4), on P2 from the Desk to Holloway Den: start at 300 ms, the route stroke, the data stroke, complete, and failure, at 1440 and 390, light and dark. The live frame runs the sequence at today’s local timings.' },
    'action-strips.html': { title: 'Action feedback strips', frames: strips, lede: 'The plan §5.1 grammar, stage by stage, for P6–P9, plus a payment (never optimistic, §5.2) and a folio image removal with Undo (PQ14). Each strip has a scrubber: set when the server answers and how it ends, then drag or Play; the live stage is outlined. Today’s row is a code read by D2, not a measurement, unless the cite says measured.' },
    'waterfalls.html': { title: 'Before and after waterfalls', frames: wf, lede: 'P1 and P2 from the baseline, set against the plan’s three tracks (synthesis/plan.md §2). Measured bars are dark; every estimate is light and labelled EST. Hover or focus a row for its source; each chart has a table view.' },
  };
  const result = {};
  const scriptsFor = { 'nav-progress.html': [clientNav], 'action-strips.html': [clientStrips], 'waterfalls.html': [clientTips] };
  const cssFor = { 'action-strips.html': STRIP_CSS, 'waterfalls.html': WF_CSS };
  for (const [name, f] of Object.entries(out)) {
    result[name] = page({ title: f.title, lede: f.lede, frames: f.frames, css: cssFor[name] || '', scripts: scriptsFor[name] || [] });
  }
  result['index.html'] = indexPage(out);
  result['SPEC.md'] = spec(out);
  return result;
}

function indexPage(out) {
  const list = Object.entries(out).map(([name, f]) => `<li><a class="t44" href="${name}">${f.title}</a> <span class="n">${f.frames.length} frames</span></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>US-33 specimens</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<style>${BASE_CSS}ul{padding:0;list-style:none}li{border-bottom:1px solid var(--hair);display:flex;gap:12px;align-items:center}.n{font:12px var(--f-meta);color:var(--ink-faint)}</style>
</head>
<body>
<div class="wrap"><h1 class="page">US-33 specimens</h1>
<p class="lede">Mockups for the designer portal responsiveness review (SQ-960). Frame list, fixture and gate: SPEC.md. Illustrative fixture · not a real studio.</p>
<ul>${list}</ul></div>
</body>
</html>
${SENTINEL}
`;
}

/* ── SPEC.md ──────────────────────────────────────────────────────────────────── */
function spec(out) {
  const frameRows = Object.entries(out).flatMap(([name, f]) => f.frames.map((fr) =>
    `| \`${fr.id}\` | \`${name}\` | ${fr.label.replace(/\|/g, '/')} | ${fr.departures.length ? fr.departures.join(' ') : 'none'} |`)).join('\n');
  const vocab = DEPARTURES.map(([t, m, pq, what]) => `| \`${t}\` | \`.${m}\` | ${pq} | ${what} |`).join('\n');
  const pairs = PAIRS.flatMap(([fg, grounds]) => grounds.map((g) => `| \`--${fg}\` | \`--${g}\` |`)).join('\n');
  const tok = (o) => Object.entries(o).filter(([k]) => !k.startsWith('viz')).map(([k, v]) => `\`--${k}\` ${v}`).join(' · ');
  const count = Object.values(out).reduce((n, f) => n + f.frames.length, 0);
  return `# US-33 specimens: build spec and gate

**14 October 2026 · SQ-960, seat 10 (Mockups).** Mockups for the responsiveness review: skeletons for six rooms in
the recommended loading direction, the alternate for the Desk and the Document, the navigation rule, action-feedback
strips for P6–P9 with a scrubbable timeline, and before/after waterfalls for P1 and P2. Inputs:
\`../synthesis/plan.md\` (§2 scorecard, §4 loading direction, §5 action grammar, §6 PQ rulings),
\`../synthesis/pairings.md\`, \`../review/d1-loading.md\` and \`../review/d1-sketches/\`, \`../review/d2-feedback.md\` and
\`../review/d2-sketches/\`. Pattern copied from \`artifacts/designer-portal-uplift-2026-10-09/specimens/\`.

Specimens are **static illustrations**. They prove nothing about time. Every time printed on them is either measured
(with its \`baseline/\` file) or an estimate marked **EST**. No product code is written here.

## 1. Files

| File | What it holds |
|---|---|
| \`skeletons-q.html\` | Q, Quiet paper, with arrival C: Desk, Document, People, Library, build room, Room view at 1440 and 390, light and dark; plus the Document at 4 s (slow) |
| \`skeletons-x.html\` | X, Expressive: Desk and Document at 1440 and 390, light and dark; plus the Document at 3 s with its toast |
| \`nav-progress.html\` | Q's navigation rule on P2: start, route stroke, data stroke, complete, failure; plus a live run |
| \`action-strips.html\` | P6 tick, P7 phase advance, P8 add a room, P9 send, a payment, a folio image removal with Undo; each with a scrubber |
| \`waterfalls.html\` | P1 and P2 before and after, from the baseline and the plan's track estimates |
| \`index.html\` | Links to the five files |
| \`build.mjs\` | Writes every file above and this SPEC from one source. Edit there, then \`node build.mjs\` |
| \`check.mjs\` | The gate (§7) |

## 2. Frame table

\`check.mjs\` reads this table. Every row is one frame: id, file, what it shows, and the canon departures it uses (§3).
${count} frames.

| Frame | File | Shows | Departures |
|---|---|---|---|
${frameRows}

## 3. Canon departures

The design canon is waived for US-33 (contract), so a frame may depart from it, but every departure is named on the
frame as \`data-departures\` and maps to a founder question in \`plan.md\` §6. The marker class is how \`check.mjs\` knows a
frame uses it: a frame lists a departure **if and only if** its markup carries the marker class. A frame with none says
\`none\`.

| Token | Marker class | PQ | What |
|---|---|---|---|
${vocab}

Not departures, and not drawn as any: the pearl placeholder bar (SectionLoadingLine's material today), "Completing…"
and "Sending" (today's verbs), and today's red global toast where it appears in a Today row as evidence
(class \`.today-toast\`, never \`.toast\`). F13 in Fix now ships pearl bars with no breath; breath is N10, behind
\`loading-register\`.

## 4. Tokens, fonts and the dark set

- **Light** values are the real tokens in \`apps/designer-portal/src/app/globals.css\` (lines 10-47, 64-121), under the
  house-sheet short names: ${tok(LIGHT)}.
- **Dark** values are the house-sheet companions recorded in \`docs/design/house-sheet/SPEC.md\` §A1 and
  \`globals.css:2209-2216\`. The portal paints no dark paper set today (\`globals.css:56\`), so the dark frames preview the
  documented set; they change nothing. Three dark values are not documented and are this seat's choice, used only as
  fills, never as text: \`--pearl\` and \`--rail-ph\` (ink at 12%) and \`--warm\` (#3A3530): ${tok(DARK)}.
- **Fonts**: Inter (\`--font-inter\`) and Playfair Display (\`--font-heading\`) as \`app/font-config.ts\` loads them through
  \`next/font/google\`; DM Mono for meta, as the portal's typography uses it. The specimens load the same three from
  Google Fonts.
- **Charts** (\`waterfalls.html\`) use one hue in two steps: measured \`#7C5E30\` and EST \`#C4A57B\` in light, \`#D8B98A\` and
  \`#8B7355\` in dark. Both pairs pass the dataviz ordinal validator (single hue, monotone lightness, the light end clears
  2:1 on the surface). Row labels carry identity; colour only separates measured from EST, and the legend and the
  "EST" suffix say it in words.

## 5. Contrast pairs

Every text colour in the specimens is one of these tokens, printed on one of these grounds. \`check.mjs\` computes each
pair from the token values in every HTML file, in light and in dark, and requires at least **4.5:1**. On the rail, the
terracotta and sage inks never print (R126). Placeholder bars, rules and chart marks are not text.

| Text | Ground |
|---|---|
${pairs}

## 6. Fixture: Leah's studio [illustrative]

These names are the US-24 fixture (\`artifacts/designer-portal-uplift-2026-10-09/specimens/SPEC.md\` §3). They are
invented; no real client, maker or company appears, and none may be added.

- **Hartwell Studio.** Owner Leah Hartwell; the hire, Jordan Reyes. Copy refers to either by name or as "they", never
  with a gendered pronoun.
- **Holloway Den** for Nora and Sam Holloway: INV-2026-0721, $3,800, 14 days overdue; PO-HD-0412 to Fenmoor Joinery,
  sent 30 Sep. This is the Document opened in P2, the job of the P6 task and P8 room, the P9 reminder and the payment.
- **The Desk's other lines:** Ines Calder (a new inquiry), Pell Court Dining (deposit in, $9,200), Linden Place Living
  Room, Thornfield, Garnet Hill.
- **New for these specimens, equally invented:** the Holloway Den task "Confirm sofa fabric", the room
  "Sunroom", the phases "Concept" and "Refinement", and the spine section names.

## 7. Loading and feedback rules drawn

- **Thresholds** (PQ8): placeholders at 150 ms, navigation rule at 300 ms, pending word at 400 ms held at least 500 ms,
  slow at 4 s, still working at 8 s, stall at 10 s. The skeleton frames are drawn at about 200 ms.
- **Q** (plan §4): pearl bars inside the real line boxes, breathing on R15; the rule is 1 px of ink at 40% on the top
  edge of the paper, never the browser chrome; failure stops it in terracotta-ink at 1.5 px; it never fakes
  completion. Arrival C sets the job title at first paint and hides nothing.
- **X** (alternate): warm blocks with one shared shimmer; a 2 px clay bar with an 8 px glow; a toast at 3 s. No success
  toast, ever.
- **Honesty** (not waived): H1–H4 from \`d1-loading.md\` §2; every loading region has \`aria-busy="true"\` and an \`sr-only\`
  sentence; errors are \`role="alert"\`, slow lines \`role="status"\`. Only plain links are drawn as real in a skeleton.
- **Feedback** (plan §5.1 stages S0–S5): optimistic only for internal acts (P6, P8). Pending-only for P7, P9, the
  payment, and the removal (§5.2). P9's failure keeps the outcomes \`act-draft.tsx:38-40\` already distinguishes: a
  definite refusal reads "Not sent." with Try again; an unconfirmed call reads "We couldn't confirm this went out — check
  the thread before sending again." with no resend. The payment never reads "paid" before the receipt.
  Undo appears only where a restore path exists (PQ14).
- **Scrubber** stage rule: S0 before 50 ms; optimistic acts show S1 until 400 ms, then S2 until
  max(server, 900 ms), so the word holds at least 500 ms; pending-only acts hold S1 and show S2 only from 8 s; then S3
  or S4 by the outcome; S5 600 ms after the settle when "Undo pressed" is chosen. Server times are 250 ms, 800 ms
  (prod p50 243 ms, p90 803 ms) and 9 s.

## 8. Build rules

1. **Self-contained HTML.** Inline CSS and JS. Nothing is fetched except Google Fonts.
2. **Frames.** Each frame is one \`<section class="frame" data-frame="…" data-departures="…">\` between
   \`<!-- frame:id -->\` and \`<!-- /frame:id -->\`. Skeleton and navigation frames carry their own \`data-theme\`; the
   strips and waterfalls follow the page theme.
3. **The hash shows one frame.** \`#frame-…\` shows only that frame at 1:1 with no page chrome. \`&nobar\` hides the
   caption and note; \`&dark\` or \`&light\` sets the page theme. With no hash every frame shows, scaled, with a sticky bar
   of \`data-go\` buttons. Pages listen to \`hashchange\`.
4. **No horizontal scroll** in any single 390 frame at a 390 viewport.
5. **Targets.** Every real control and every drawn target (\`.act\`, \`.lnk\`, \`.tgt\`) carries \`.t44\`
   (\`min-height\` and \`min-width\` 44px). A drawn target that shows today's undersized row carries \`data-today\`
   instead, as evidence.
6. **Motion.** Any animation or transition sits under one \`@media (prefers-reduced-motion: reduce)\` rule that sets both
   to none. Scripts that animate check \`prefers-reduced-motion\` and step instead.
7. **Copy.** No gendered pronouns; "Designer-Taught Intelligence", never the two-letter abbreviation.
8. **Sentinel.** The last non-empty line of every HTML file is \`${SENTINEL}\`.

## 9. Gate

\`\`\`
node artifacts/portal-responsiveness-2026-10-14/specimens/check.mjs
\`\`\`

It exits 0 when every check passes and 1 otherwise, naming each failure:

- every file on disk matches what \`build.mjs\` writes (so this SPEC and the HTML cannot drift);
- every frame id in §2 exists once, in the file §2 names, and no file has a frame §2 does not list;
- each frame's \`data-departures\` equals §2's list, uses only §3 tokens, and matches the marker classes in its markup;
- every interactive element (\`button\`, \`a\`, \`input\`, \`select\`, \`summary\`, \`tabindex="0"\`) and every drawn target
  carries \`.t44\`, and \`.t44\` declares min-height and min-width of at least 44px;
- every file with an animation or transition has the reduced-motion rule that removes both, and every script that calls
  \`requestAnimationFrame\` checks \`prefers-reduced-motion\`;
- every §5 pair is at least 4.5:1 in light and in dark, in every file, and every \`color:\` in the CSS is a §5 text token
  (or inherit, currentColor, transparent);
- the sentinel, no fetch outside Google Fonts, no gendered pronoun, no two-letter abbreviation for intelligence.

**Render check** (outside the gate, evidence kept under the ticket's verification folder, never in the repo): every
single 390 frame at a 390 viewport has \`scrollWidth\` ≤ 390, and no page logs a console error.
`;
}

export function build() { return files(); }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [name, text] of Object.entries(build())) writeFileSync(join(DIR, name), text);
  console.log('wrote', Object.keys(build()).join(', '));
}
