/* The page's own stylesheet. The R126 register (tokens.css) and the .lens-*
   namespace (lens.css) are inlined ahead of this block, verbatim; nothing here
   restyles either. EVERY duration is written calc(<base> * var(--motion-scale, 1))
   (SPEC C.6). The only box-shadow in the file is lens.css's .doc-elevated. */

export const CSS = `
/* -- base ---------------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--stage-ground);
  color: var(--text-body);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4, p, ul, ol, li, figure, dl, dd, dt { margin: 0; padding: 0; }
ul, ol { list-style: none; }
button {
  font: inherit; color: inherit; background: none; border: 0;
  padding: 0; margin: 0; text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
:focus-visible { outline: 2px solid var(--color-clay-ink); outline-offset: 2px; }
.mobile-bar :focus-visible { outline-color: var(--band-clay-quiet-ink); }

/* -- the stage and the dev bar (chrome, never inside a frame) ------------- */
.stage { padding: 14px 0 56px; background: var(--stage-ground); min-height: 100vh; }
.stage-head { max-width: 1180px; margin: 0 auto 14px; padding: 0 20px; }
.stage-title {
  font-family: var(--font-display); font-size: 20px; font-weight: 500;
  color: var(--text-primary);
}
.stage-sub {
  margin-top: 4px; font-family: var(--font-meta); font-size: 11px;
  letter-spacing: .1em; text-transform: uppercase; color: var(--text-faint);
}
.devbar {
  position: sticky; top: 0; z-index: 40;
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  padding: 10px 20px; margin-bottom: 14px;
  background: var(--stage-ground);
  border-bottom: var(--rule-hair);
  font-family: var(--font-meta); font-size: 11px;
  letter-spacing: .1em; text-transform: uppercase;
}
.devbar-label { color: var(--text-faint); margin-right: 8px; }
.devbtn {
  min-height: 28px; padding: 5px 10px;
  border: 1px solid rgba(44, 41, 38, .22); border-radius: 2px;
  color: var(--text-muted); background: var(--doc-paper);
  transition: background-color calc(150ms * var(--motion-scale, 1)) var(--ease-editorial),
              color calc(150ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.devbtn[aria-pressed="true"] {
  color: var(--band-quiet-ink); background: var(--band-quiet-chrome);
  border-color: var(--band-quiet-chrome);
}
.frame-wrap { display: flex; justify-content: center; width: 100%; margin-bottom: 10px; }
.frame-caption {
  max-width: 1180px; margin: 0 auto 8px; padding: 0 20px;
  font-family: var(--font-meta); font-size: 11px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--text-faint);
}

/* -- a frame: a real scroll container, drawn at native size, scaled DOWN -- */
.frame {
  position: relative; overflow-y: auto; overflow-x: hidden;
  background: var(--doc-paper); color: var(--text-body);
  border: 1px solid rgba(44, 41, 38, .20);
  transform-origin: top center;
  scroll-behavior: auto;
}
#frame-1440 { width: 1440px; height: 900px; }
#frame-1280 { width: 1280px; height: 800px; }
#frame-390  { width: 390px;  height: 844px; }

/* -- the document shell -------------------------------------------------- */
.doc-shell {
  display: grid; align-items: start;
  grid-template-columns: var(--doc-spine-w) minmax(0, 1fr) var(--doc-margin-w);
}
#frame-1280 .doc-shell { grid-template-columns: 136px minmax(0, 1fr) 28px; }
#frame-390 .doc-shell { grid-template-columns: minmax(0, 1fr); }

.spine, .margin {
  position: sticky; top: 0; align-self: start;
  background: var(--rail-stock); overflow-y: auto; overflow-x: hidden;
  min-width: 0;
}
/* RF-05: the rail is a column, and the ladder is the one part of it that gives
   and takes. Everything else in the rail is at its own declared size; the
   ladder is flex:1 over a data-derived basis, so the six segments distribute
   across whatever the rail actually has between the head rule and FILED WITH
   THIS JOB rather than sitting at 443px with slack under them. */
.spine { display: flex; flex-direction: column; }
#frame-1440 .spine, #frame-1440 .margin { height: 840px; }
#frame-1280 .spine { height: 740px; }
.spine { border-right: 1px solid rgba(44, 41, 38, .14); padding: 24px 16px 24px; }
.margin { border-left: 1px solid rgba(44, 41, 38, .14); padding: 24px 16px 40px; }
#frame-1280 .spine { padding: 16px 12px 24px; }

.paper {
  min-width: 0; background: var(--doc-paper);
  /* the foot margin is deep on purpose: the navigator has to be able to land
     THE RECORD's own head 72px below the frame top like every other stop, and a
     sheet of paper ends in a margin, not at its last word (probe item 14). */
  padding: 0 48px 520px;
}
#frame-1280 .paper { padding: 0 40px 460px; }
#frame-390 .paper { padding: 0 28px 560px; }
.paper-measure { max-width: 1040px; margin: 0 auto; }

/* -- the studio drawer (elevation site 3 of 3) --------------------------- */
.drawer {
  position: sticky; bottom: 0; z-index: 6;
  height: var(--doc-drawer-h);
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px;
  border-top: var(--rule-mid); background: var(--doc-paper); padding: 0 22px;
}
.drawer-left, .drawer-center, .drawer-right { display: flex; align-items: center; gap: 14px; }
.drawer-center { justify-self: center; }
.drawer-right { justify-content: flex-end; }
.drawer-word {
  font-family: var(--font-display); font-size: 15px; font-weight: 500;
  text-transform: uppercase; letter-spacing: .2em; color: var(--text-primary);
}
.drawer-crumb, .drawer-hands {
  font-family: var(--font-meta); font-size: 11px; text-transform: uppercase;
  letter-spacing: .1em; color: var(--text-faint);
}
.drawer-hands b { font-weight: 500; color: var(--text-primary); margin-left: 5px; }
.drawer-avatar {
  width: 26px; height: 26px; border-radius: 999px; flex: 0 0 auto;
  background: var(--rail-stock); color: var(--text-body);
  font-family: var(--font-display); font-size: 11px;
  display: flex; align-items: center; justify-content: center;
}

/* -- the act: Scored Ink (R126, globals.css:276-732) ---------------------- */
.act {
  position: relative; isolation: isolate; display: inline-block;
  /* R-02: the Scored Ink pool keeps its shipped inset: 2px -5px 5px, so the
     wash reads wider than the word. Chromium computes scrollWidth off the
     layout overflow rect whatever the clip is -- measured: overflow:clip,
     overflow-clip-margin:0 and contain:paint all still report 35/30 on a bare
     act -- so no clip can make the act report parity, and every one of these
     is contained: 0 elements paint past any frame edge at any of the three
     widths. See FINAL.md "Review responses", R-02. */
  padding: 4px 2px 9px;
  font-family: var(--font-meta); font-size: 11px; font-weight: 500;
  letter-spacing: .1em; text-transform: uppercase; color: var(--text-body);
  transition: transform calc(240ms * var(--motion-scale, 1)) var(--ease-editorial),
              color calc(150ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.act .da-pool {
  position: absolute; inset: 2px -5px 5px; z-index: 0; border-radius: 2px;
  pointer-events: none; background: var(--text-primary);
  clip-path: circle(0px at var(--ink-x, 50%) var(--ink-y, 50%));
  transition: clip-path calc(260ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.act .da-label { position: relative; z-index: 1; display: inline-block; }
.act .da-label::before {
  content: ''; position: absolute; left: 0; right: 0; bottom: -4px; height: 1px;
  background: rgba(44, 41, 38, .28); transform-origin: left center;
  transition: height calc(150ms * var(--motion-scale, 1)) var(--ease-editorial),
              background-color calc(150ms * var(--motion-scale, 1)) linear;
}
.act.is-lead { color: var(--text-primary); }
.act.is-lead .da-label::before { height: 1.5px; background: var(--text-primary); }
.act.is-lead .da-label::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -7.5px; height: 1px;
  background: var(--color-clay);
  transition: height calc(150ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.act.is-quiet { color: var(--text-faint); }
.act.is-quiet .da-label::before {
  transform: scaleX(0); background: var(--text-faint);
  transition: transform calc(300ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.act:hover .da-pool {
  clip-path: circle(3.5px at var(--ink-x, 50%) var(--ink-y, 50%));
  transition-duration: calc(180ms * var(--motion-scale, 1));
}
.act:hover .da-label::before { background: var(--color-clay-ink); }
.act.is-lead:hover .da-label::after { height: 2px; }
.act.is-quiet:hover { color: var(--text-primary); }
.act.is-quiet:hover .da-label::before,
.act.is-quiet:focus-visible .da-label::before { transform: scaleX(1); }
.act:active {
  transform: translateY(1px); color: var(--doc-paper);
  transition-duration: calc(70ms * var(--motion-scale, 1)), calc(120ms * var(--motion-scale, 1));
  transition-delay: 0s, calc(60ms * var(--motion-scale, 1));
}
.act:active .da-pool {
  clip-path: circle(140% at var(--ink-x, 50%) var(--ink-y, 50%));
  transition-duration: calc(200ms * var(--motion-scale, 1));
  transition-timing-function: cubic-bezier(.3, .7, .2, 1);
}

/* -- the letterhead ------------------------------------------------------ */
.lens-sentinel { display: block; min-block-size: var(--lens-reserve, 0px); padding-top: 32px; }
#frame-390 .lens-sentinel { padding-top: 22px; }
.letterhead { padding-bottom: 16px; border-bottom: var(--rule-mid); }
.lh-marks { display: flex; align-items: center; gap: 5px; height: 34px; margin-bottom: 10px; }
.strata-mark { display: inline-flex; flex-direction: column; gap: 2.5px; flex: 0 0 auto; }
.strata-mark i { display: block; height: 2px; border-radius: 999px; background: var(--color-pearl); }
.strata-mark.size-xs { width: 22px; }
.strata-mark.size-sm { width: 30px; }
.strata-mark.size-lg { width: 120px; }
.strata-mark.size-lg i { height: 4px; }
.strata-mark i:nth-child(1) { width: 100%; }
.strata-mark i:nth-child(2) { width: 80%; }
.strata-mark i:nth-child(3) { width: 60%; opacity: .55; }
.strata-mark.state-settled i { background: var(--color-sage); }
.strata-mark.state-active i { background: var(--color-clay); }
.strata-mark.state-future i { background: var(--color-pearl); }
@keyframes doc-breath { 0%, 100% { opacity: 1; } 50% { opacity: .62; } }
.doc-breath { animation: doc-breath calc(3000ms * var(--motion-scale, 1)) ease-in-out infinite; }
.lh-title {
  font-family: var(--font-display); font-size: 40px; font-weight: 500;
  line-height: 1.08; letter-spacing: -.015em; color: var(--text-primary);
}
#frame-390 .lh-title { font-size: 32px; }
.lh-house {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  margin-top: 6px; height: 23px;
}
.lh-household {
  font-family: var(--font-display); font-style: italic; font-size: 16px;
  color: var(--color-clay-ink);
}
.stage-plate {
  display: inline-flex; align-items: center; height: 19px; padding: 0 9px;
  border-radius: 3px; color: #FFFFFF; background: var(--tab-project);
  font-family: var(--font-meta); font-size: 11px; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase;
}
.vitals {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 20px;
  margin-top: 14px; min-height: 21px;
}
.vital {
  font-family: var(--font-meta); font-size: 11px; text-transform: uppercase;
  letter-spacing: .08em; color: var(--text-muted);
}
.vital b { font-weight: 400; color: var(--text-primary); margin-left: 6px; }
.vital-act { margin-left: auto; }
.lh-fold { overflow: hidden; }
.lh-fold-body {
  display: grid; grid-template-rows: 0fr; opacity: 0;
  transition: grid-template-rows calc(300ms * var(--motion-scale, 1)) var(--ease-editorial),
              opacity calc(300ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.lh-fold-body > div { overflow: hidden; min-height: 0; }
.lh-fold[data-open="true"] .lh-fold-body { grid-template-rows: 1fr; opacity: 1; }
.phase-row {
  display: grid; grid-template-columns: 26px 1fr auto auto; align-items: baseline;
  gap: 12px; padding: 8px 0; border-bottom: var(--rule-hair);
}
.phase-num { font-family: var(--font-display); font-size: 14px; color: var(--color-clay-ink); }
.phase-name { font-family: var(--font-display); font-size: 15px; color: var(--text-primary); }
.phase-when, .phase-state {
  font-family: var(--font-meta); font-size: 11px; letter-spacing: .07em;
  text-transform: uppercase; color: var(--text-faint);
}
.phase-row.is-active .phase-name { font-weight: 600; }

/* -- the lens line: the band, 56px border-box, declared, at every width --- */
.lens-line { display: block; }
.lens-band {
  position: sticky; top: 0; z-index: 4;
  height: 56px; padding: 8.8px 0 8.8px;
  background: var(--doc-paper);
  border-bottom: var(--rule-mid);
  display: flex; flex-direction: column; justify-content: center; gap: 2px;
}
.band-1 {
  position: relative; height: 15.4px;
  font-family: var(--font-meta); font-size: 11px; line-height: 1.4;
  letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted);
}
.band-1-layer {
  position: absolute; inset: 0; display: flex; align-items: baseline; gap: 16px;
  white-space: nowrap; overflow: hidden;
  transition: opacity calc(150ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.band-1-left { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.band-1-right { margin-left: auto; flex: 0 0 auto; color: var(--text-primary);
  transition: opacity calc(150ms * var(--motion-scale, 1)) var(--ease-editorial); }
[data-money-slot][data-yield="true"] { opacity: 0; }
.band-1-read { opacity: 1; }
.band-1-rest { opacity: 0; }
[data-lens-open="true"] .band-1-read { opacity: 0; }
[data-lens-open="true"] .band-1-rest { opacity: 1; }
.band-2 {
  display: flex; align-items: baseline; gap: 12px; height: 19.5px;
  font-size: 15px; line-height: 1.3; color: var(--color-terracotta-ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.band-2-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.band-2 .act { padding: 0 2px 4px; flex: 0 0 auto; }
.band-house {
  position: relative; display: inline-block; padding-bottom: 2px; color: var(--text-primary);
}
.band-house::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
  background: var(--text-primary); transform: scaleX(0); transform-origin: left center;
  transition: transform calc(300ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.band-house:hover::after, .band-house:focus-visible::after { transform: scaleX(1); }


/* -- regions ------------------------------------------------------------- */
.region { padding-top: var(--doc-region-gap); }
.region-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px 24px; }
.rh-name {
  font-family: var(--font-display); font-size: 24px; font-weight: 500;
  line-height: 1.2; color: var(--text-primary);
}
.rh-count { margin-top: 4px; font-size: 12.5px; color: var(--text-subtle); }
.rh-ledger { display: flex; align-items: center; gap: 16px; justify-content: flex-end; flex-wrap: wrap; }
.region-rule { height: 6px; border-top: 2px solid var(--text-primary); border-bottom: 1px solid rgba(44, 41, 38, .18); margin: 8px 0 0; }
.region[data-folded="true"] > .region-rule { height: 0; border-top: var(--rule-mid); border-bottom: 0; }
/* L-4 / L-5. A region she has not reached prints its head, its count line and
   its one leader act over BARE PAPER at a declared reserve -- 112px where it
   carries a standing exception, 68px where it does not. The body is put on the
   paper in ONE commit while the whole region is still below the frame's bottom
   edge (the 240px gate in focus()), so the height change is never on screen, and
   it is never taken back. The reserve is a declared constant, never a measured
   one: nothing here reads a rendered height. */
.region-body {
  padding-top: 14px;
  opacity: 1; visibility: visible;
  transition: opacity calc(200ms * var(--motion-scale, 1)) var(--ease-editorial),
              color calc(150ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.region[data-density="condensed"] > .region-body {
  block-size: var(--lens-region-reserve-h, 112px);
  overflow: hidden; opacity: 0; visibility: hidden;
}
.region[data-reserve="short"] { --lens-region-reserve-h: 68px; }
.region[data-density="full"] { color: var(--density-ink-full); }
.region[data-density="reading"] { color: var(--density-ink-reading); }
.region[data-density="condensed"] { color: var(--density-ink-condensed); }
/* the non-visual channel for a quiet region (Dc-20 / M5): a programmatic line
   inside the head, never a printed one -- quieter means FEWER words on paper. */
.rh-quiet {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip-path: inset(50%); margin: -1px; padding: 0; border: 0;
}
/* the line is true only of a region she has not reached, so it leaves the
   accessibility tree entirely the moment the body is on the paper */
.region:not([data-density="condensed"]) .rh-quiet { display: none; }

/* approvals */
.appr-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
  gap: 8px 16px; padding: 10px 0; border-bottom: var(--rule-hair);
}
.appr-name { font-family: var(--font-display); font-size: 15px; font-weight: 500; font-style: italic; color: var(--text-primary); }
.appr-sub {
  display: block; margin-top: 2px; font-family: var(--font-meta); font-size: 11px;
  letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted);
}
.appr-right { display: flex; align-items: center; gap: 14px; }

/* schedule */
.sched-row {
  display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; align-items: baseline;
  gap: 14px; padding: 10px 0; border-bottom: var(--rule-hair);
}
.sched-date { font-family: var(--font-meta); font-size: 11px; letter-spacing: .07em; color: var(--text-primary); }
.sched-what { font-family: var(--font-display); font-size: 15px; color: var(--text-primary); }
.sched-when { font-family: var(--font-meta); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); }
.sched-row.is-late .sched-when { color: var(--color-terracotta-ink); }
.sched-rule {
  position: relative; height: 0; margin: 16px 0 6px;
  border-top: var(--rule-mid);
}
.sched-rule i {
  position: absolute; top: -4px; width: 1.5px; height: 9px; background: var(--text-primary);
}
.sched-rule b {
  position: absolute; top: 8px; font-family: var(--font-meta); font-size: 11px;
  letter-spacing: .08em; text-transform: uppercase; font-weight: 400; color: var(--text-faint);
  transform: translateX(-50%); white-space: nowrap;
}
/* R-02: the last tick is drawn at left:100%, so its own 1.5px hung past the
   rule and every ancestor reported the overflow. It hangs inward instead. */
.sched-rule i:last-of-type { transform: translateX(-100%); }
.sched-rule b:first-of-type { transform: none; }
.sched-rule b:last-of-type { transform: translateX(-100%); }

/* FF&E */
.room-head { display: flex; align-items: baseline; gap: 10px; margin-top: 12px; padding-bottom: 2px; }
.room-name { font-family: var(--font-display); font-size: 15px; font-weight: 500; font-style: italic; color: var(--text-primary); }
.room-alloc { margin-left: auto; font-family: var(--font-meta); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); }
.ffe-row {
  position: relative; isolation: isolate;
  display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 14px;
  align-items: center; padding: 8px 0; border-bottom: var(--rule-hair);
}
.thumb {
  display: block; width: 48px; height: 48px; flex: 0 0 auto;
  border: 1px solid rgba(44, 41, 38, .14); border-radius: 2px;
  background-color: var(--rail-stock); background-size: cover; background-position: center;
}
.thumb.is-unlinked {
  border-color: rgba(44, 41, 38, .22);
  background-image: linear-gradient(to top right, transparent calc(50% - 0.5px), rgba(44, 41, 38, .22) calc(50% - 0.5px), rgba(44, 41, 38, .22) calc(50% + 0.5px), transparent calc(50% + 0.5px));
}
.ffe-name { font-family: var(--font-display); font-size: 15px; font-weight: 500; font-style: italic; color: var(--text-primary); }
.ffe-vendor, .ffe-note {
  display: block; margin-top: 2px; font-family: var(--font-meta); font-size: 11px;
  text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted);
}
.ffe-right { display: flex; align-items: center; gap: 12px; justify-content: flex-end; }
.ffe-price { font-family: var(--font-display); font-size: 15px; font-weight: 500; color: var(--text-primary); white-space: nowrap; }
.ffe-price.is-none { font-family: var(--font-meta); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); }
.ffe-state {
  font-family: var(--font-meta); font-size: 11px; font-weight: 500; letter-spacing: .08em;
  text-transform: uppercase; color: var(--text-faint); white-space: nowrap;
}
/* the pen goes down (L-8): the row's own left rule and ground, no sibling moves */
.lens-row-editing { padding-left: 10px; margin-left: -11.5px; }
.spec-input {
  width: 150px; font: inherit; font-family: var(--font-meta); font-size: 11px;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--text-primary); background: transparent;
  border: 0; border-bottom: 1px solid rgba(44, 41, 38, .28); padding: 2px 0;
}

/* the stamp -- filled, 1.5px pigment border, charcoal word, -1.5deg */
.stamp {
  position: relative; display: inline-block; overflow: hidden; white-space: nowrap;
  transform: rotate(-1.5deg); border-radius: 3px; border: 1.5px solid currentColor;
  padding: 3px 9px; font-family: var(--font-meta); font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .08em;
}
.stamp .stamp-fill {
  position: absolute; inset: 0; z-index: 0; transform: scaleX(0); transform-origin: left center;
  transition: transform calc(260ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.stamp.is-inked .stamp-fill { transform: scaleX(1); }
.stamp .stamp-word { position: relative; z-index: 1; color: var(--text-primary); }
.stamp-ordered { color: var(--color-clay-ink); }
.stamp-ordered .stamp-fill { background: var(--fill-ordered-tint); }
.stamp-decision { color: var(--color-golden-hour-ink); }
.stamp-decision .stamp-fill { background: var(--fill-decision-tint); }
.stamp-damaged { color: var(--color-terracotta-ink); }
.stamp-damaged .stamp-fill { background: var(--fill-damaged-tint); }

/* money */
.money-ladder { border-top: var(--rule-hair); }
.ml-rung {
  display: grid; grid-template-columns: 190px auto minmax(0, 1fr); align-items: baseline;
  gap: 16px; padding: 9px 0; border-bottom: var(--rule-hair);
}
.ml-label { font-family: var(--font-display); font-size: 15px; color: var(--text-primary); }
.ml-value { font-family: var(--font-display); font-size: 17px; font-weight: 500; color: var(--text-primary); white-space: nowrap; }
.ml-note { font-family: var(--font-meta); font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--text-faint); }
.ml-rung.is-out .ml-value { color: var(--color-terracotta-ink); }

/* care + record */
.care-row, .rec-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: baseline;
  gap: 16px; padding: 9px 0; border-bottom: var(--rule-hair);
}
.care-name, .rec-name { font-family: var(--font-display); font-size: 15px; color: var(--text-primary); }
.care-state, .rec-state { font-family: var(--font-meta); font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--text-faint); }
.rec-bars { display: flex; align-items: center; gap: 5px; padding: 2px 0 12px; }

/* colophon */
.colophon {
  display: flex; align-items: baseline; justify-content: space-between; gap: 24px;
  flex-wrap: wrap; margin-top: 34px; padding-top: 14px; border-top: var(--rule-mid);
}
.colophon-line { font-family: var(--font-meta); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); }
.colophon-acts { display: flex; gap: 18px; flex-wrap: wrap; }

/* -- the hover wash (R126) ---------------------------------------------- */
.row-wash {
  position: absolute; inset: 0; z-index: -1; border-radius: 2px;
  pointer-events: none; background: var(--wash-paint, var(--wash, rgba(196, 165, 123, .16)));
  clip-path: circle(0px at var(--ink-x, 50%) var(--ink-y, 50%));
  transition: clip-path calc(200ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.ffe-row:hover > .row-wash {
  clip-path: circle(150% at var(--ink-x, 50%) var(--ink-y, 50%));
  transition-duration: calc(260ms * var(--motion-scale, 1));
}
.ffe-row:focus-within > .row-wash { clip-path: circle(150% at 50% 50%); transition-duration: 0s; }
.ffe-row { --wash: rgba(196, 165, 123, .16); --wash-still: rgba(196, 165, 123, .12); }
.ffe-row.st-decision { --wash: rgba(232, 197, 71, .24); --wash-still: rgba(232, 197, 71, .18); }
.ffe-row.st-damaged { --wash: rgba(212, 160, 144, .16); --wash-still: rgba(212, 160, 144, .12); }
.is-anchored { background-color: var(--fill-anchor-tint); }

/* -- the rail ------------------------------------------------------------ */
.spine-put-down { margin-bottom: 12px; display: block; min-height: 44px; flex: 0 0 auto; }
.rail-head { height: 100px; flex: 0 0 auto; }
.rail-rule-mid, .rail-rule-hair, .doors-head, .door { flex: 0 0 auto; }
.rail-head-btn { display: block; width: 100%; }
.rail-name { display: block; font-size: 13px; font-weight: 500; color: var(--text-primary); line-height: 1.4; height: 18px; }
.rail-arc { display: flex; align-items: center; gap: 3px; height: 44px; }
.rail-stage { display: block; font-family: var(--font-meta); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); line-height: 16px; }
.rail-count { display: block; font-family: var(--font-meta); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--text-primary); line-height: 16px; }
.rail-rule-mid { height: 0; border-top: var(--rule-mid); margin: 8px 0; }
.rail-rule-hair { height: 0; border-top: var(--rule-hair); margin: 10px 0; }
.ladder {
  position: relative; padding-left: 10px;
  display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
}
/* DECLARED OVERRIDE of lens.css section 3, L-2 (FINAL.md deviation D-2): the
   bracket travels on a TRANSFORM, not on inset-block-start. Driving its y with a
   layout property files a layout-shift entry on every scroll frame -- measured,
   the whole of a 0.00022 CLS -- and the row's promise is "position-linked, 1:1
   with scroll", which a translate keeps exactly while moving nothing. */
.ladder .lens-reading-window {
  position: absolute; inset-inline-start: 0; inset-block-start: 0;
  border-inline-start: var(--rule-mid);
  block-size: var(--lens-reading-window-h, 74px);
  transform: translateY(var(--lens-reading-window-y, 0px));
}
/* one slot per stop, at its DECLARED extent. The room sub-rungs open INSIDE the
   Pieces slot's own fixed height, so override 2's give-back costs the rail below
   it not one pixel of reflow -- zero layout shift, by construction. */
.seg-slot { overflow: hidden; border-bottom: var(--rule-hair); }
.seg-slot:last-child { border-bottom: 0; }
.seg { display: block; width: 100%; padding: 6px 0 6px 6px; }
/* ONE register per segment (proposal section 4): a stop that carries a number
   prints its <=30-character VALUE and nothing else; its name is the button's
   accessible name. This is the answer to "the spine is still cluttered". */
.seg-value {
  display: block; font-family: var(--font-meta); font-size: 11px;
  line-height: 1.4; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted);
  transition: opacity calc(150ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.lens-nav-segment[data-reading-index="true"] .seg-value { color: var(--text-primary); }
/* L-3: the segment holding a head that is in frame prints NOTHING -- the paper
   is saying it, at 24px Playfair, in the same frame. */
.seg-value[data-region-head-in-frame="true"] { opacity: 0; }
/* RF-02: the NAME is the other half of that same crossfade, in the same box, at
   the same 11px mono -- so the rail never has a blank run and the reader can
   always read the name of the place she is standing in. */
.seg { position: relative; }
.seg-name {
  position: absolute; left: 6px; right: 0; top: 6px;
  font-family: var(--font-meta); font-size: 11px;
  line-height: 1.4; letter-spacing: .06em; text-transform: uppercase;
  color: var(--text-muted); opacity: 0;
  transition: opacity calc(150ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.seg-name[data-region-head-in-frame="true"] { opacity: 1; }
/* L-6: the household stays printed while the letterhead is in frame; it is the
   stage phrase and the phase count that yield. */
.rail-name[data-letterhead-in-frame="true"],
.rail-count[data-letterhead-in-frame="true"] { color: var(--text-muted); }
.rungs { padding-left: 12px; }
#frame-1280 .rung-name { font-size: 10px; letter-spacing: .04em; }
/* the seven-mark arc keeps its seven marks and its 44px row at 1280; the marks
   themselves narrow to fit the 112px inner measure (7 x 13 + 6 x 2 = 103). */
#frame-1280 .strata-mark.size-xs { width: 13px; }
#frame-1280 .rail-arc { gap: 2px; }
#frame-1280 .spine-put-down .da-label { letter-spacing: .04em; }
/* 1280 rail fix: the room sub-rungs are gated by data-room-visible (override
   2) -- .rung's own 28px floor must not fight that collapse at this width, or
   a rest-state Pieces slot sized for the collapsed state gets four rungs it
   never budgeted for. 1440/390 keep the shared .rung rule untouched. */
#frame-1280 .lens-nav-room-rung { min-height: 0; }
/* 1280 rail fix: FILED WITH THIS JOB wraps to two lines at the 112px inner
   measure (scrollHeight 33px); the shared 20px doors-head has no overflow
   rule, so the second line printed over the first door. Reserve the block. */
#frame-1280 .doors-head { height: 34px; }
.rung { display: block; width: 100%; min-height: 28px; padding: 4px 0; }
.rung-name { font-family: var(--font-meta); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
.doors-head { font-family: var(--font-meta); font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--text-muted); height: 20px; }
.door { width: 100%; height: 32px; display: flex; align-items: center; }
.door-name { font-size: 13px; color: var(--text-primary); }

/* -- the margin ---------------------------------------------------------- */
.margin-note {
  font-family: var(--font-display); font-style: italic; font-size: 14px; line-height: 1.5;
  color: var(--text-subtle);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.margin-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  margin: 18px 0 10px; padding-bottom: 8px; border-bottom: var(--rule-mid);
  font-family: var(--font-meta); font-size: 11px; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase; color: var(--text-primary);
}
/* RF-03: the lift is a COLOUR on the count, on a head whose words never change
   -- the one small state-carrying thing, no layout touched, so probe item 8
   still measures CLS 0 while the reader is told which group is beside her. */
.margin-head[data-beside-head] > span { color: var(--text-muted); transition: color calc(300ms * var(--motion-scale, 1)) var(--ease-editorial); }
.margin-head[data-beside-current="true"] > span { color: var(--text-primary); }
.margin-capture { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-bottom: 4px; }
.margin-chip {
  display: block; width: 100%; margin-bottom: 10px; padding: 10px 12px;
  border: 1px solid rgba(44, 41, 38, .14); border-radius: 5px; background: var(--doc-paper);
  transition: background-color calc(300ms * var(--motion-scale, 1)) var(--ease-editorial);
}
.mc-anchor { display: block; font-family: var(--font-meta); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted); }
.mc-line { display: block; margin-top: 3px; font-size: 13px; line-height: 1.4; color: var(--text-primary); }
.mc-sub { display: block; margin-top: 2px; font-family: var(--font-meta); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--text-faint); }
.composer {
  width: 100%; min-height: 62px; margin-top: 6px; padding: 9px 10px; resize: none;
  font: inherit; font-size: 13px; color: var(--text-primary); background: var(--doc-paper);
  border: 1px solid rgba(44, 41, 38, .14); border-radius: 5px;
}
.margin-file { display: block; font-family: var(--font-meta); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); padding: 4px 0; }
.margin-file b { font-weight: 500; color: var(--text-muted); }

/* -- sheets: the standing sheet, the 1280 margin sheet, the 390 sections -- */
/* A sheet is an overlay on the FRAME, and the frame is the scroll container, so
   an absolutely positioned overlay would otherwise pin itself to the top of six
   thousand pixels of paper rather than to what the reader can see. sheet() sets
   the wrap's top and height to the frame's current scroll window on open; the
   paper beneath keeps its offset and never moves (L-11). */
.sheet-wrap {
  position: absolute; left: 0; right: 0; top: 0; height: 100%;
  z-index: 20; display: none;
}
.sheet-wrap[data-open="true"] { display: block; }
.sheet-scrim { position: absolute; inset: 0; background: rgba(44, 41, 38, .45); }
.lens-sheet-panel {
  position: absolute; overflow-y: auto;
  background: var(--doc-paper); border: 1px solid rgba(44, 41, 38, .18); border-radius: 3px;
  padding: 22px 32px 28px;
}
#frame-1440 .lens-sheet-panel { left: 50%; top: 56px; width: 760px; max-height: 720px; margin-left: -380px; }
#frame-1280 .lens-sheet-panel { right: 20px; top: 40px; width: 360px; max-height: 700px; }
#frame-1280 #sheet-standing-1280 .lens-sheet-panel { left: 50%; right: auto; width: 700px; margin-left: -350px; max-height: 660px; }
#frame-390 .lens-sheet-panel { left: 0; right: 0; bottom: 0; max-height: 640px; border-radius: 12px 12px 0 0; padding: 18px 20px 26px; }
.sheet-head { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding-bottom: 12px; border-bottom: var(--rule-mid); }
.sheet-title { font-family: var(--font-meta); font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--text-primary); }
.sheet-title span { color: var(--text-faint); font-weight: 400; }
.standing-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 18px; padding: 12px 0; border-bottom: var(--rule-hair); }
.standing-when { display: block; font-family: var(--font-meta); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--color-terracotta-ink); }
.standing-line { display: block; margin-top: 3px; font-size: 14px; line-height: 1.45; color: var(--text-primary); }
.standing-owner { display: block; margin-top: 2px; font-family: var(--font-meta); font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--text-faint); }
.sheet-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; width: 100%; min-height: 44px; padding: 8px 0; border-bottom: var(--rule-hair); }
.sheet-row-name { font-size: 15px; color: var(--text-primary); }
.sheet-row-value { font-family: var(--font-meta); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); text-align: right; }

/* -- the 1280 tier: the margin is a sheet, opened from a printed tab ------ */
.margin-tab-col {
  position: sticky; top: 0; align-self: start; height: 740px;
  background: var(--rail-stock); border-left: 1px solid rgba(44, 41, 38, .14);
  display: flex; justify-content: center; padding-top: 96px;
}
.margin-tab {
  writing-mode: vertical-rl; padding: 12px 4px; min-height: 44px;
  font-family: var(--font-meta); font-size: 11px; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase; color: var(--text-primary);
}

/* -- the 390 tier -------------------------------------------------------- */
.mobile-bar {
  position: sticky; bottom: 0; z-index: 8;
  height: var(--doc-mobile-bar-h);
  display: flex; align-items: center; gap: 8px;
  border-top: 1px solid rgba(250, 247, 242, .16);
  background: var(--band-quiet-chrome); padding: 8px 12px;
}
.mb-item { flex: 1 1 0; min-width: 0; padding: 0 6px; min-height: 44px; display: flex; flex-direction: column; justify-content: center; }
.mb-eyebrow { display: block; font-family: var(--font-meta); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--band-clay-quiet-ink); }
.mb-value { display: block; font-family: var(--font-display); font-size: 14px; font-weight: 500; color: var(--band-quiet-ink); white-space: nowrap; overflow: clip; }
/* all six stop names in one fixed box, one visible: naming the stop costs no
   layout. The box is the slot's own measure, so nothing hangs past it. */
.mb-swap { position: relative; height: 20px; overflow: visible; }
.mb-swap > span {
  position: absolute; left: 0; top: 0; right: 0; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; visibility: hidden;
}
.mb-swap > span[data-on="true"] { visibility: visible; }
#frame-390 .ffe-row { grid-template-columns: 48px minmax(0, 1fr); }
#frame-390 .ffe-right { grid-column: 2; justify-content: flex-start; margin-top: 4px; flex-wrap: wrap; gap: 8px; }
#frame-390 .spec-input { width: 120px; }

#frame-390 .ml-rung { grid-template-columns: minmax(0, 1fr) auto; }
#frame-390 .ml-note { grid-column: 1 / -1; }
#frame-390 .sched-row { grid-template-columns: 92px minmax(0, 1fr); }
#frame-390 .sched-when { grid-column: 2; }
#frame-390 .appr-row, #frame-390 .care-row, #frame-390 .rec-row { grid-template-columns: minmax(0, 1fr); }
#frame-390 .region-head { grid-template-columns: minmax(0, 1fr); }
#frame-390 .rh-ledger { justify-content: flex-start; }
#frame-390 .sched-rule b { font-size: 10px; }

/* -- the five crops, one per catalog-linked line (RF-01) ----------------- */
/* NG4 keeps 48px crops on catalog-linked lines. Five of the 36 Pieces lines are
   linked to a real photograph in mock/img/; the rest keep the "no image" glyph,
   which is the truth about them. Every crop is a data URI background, never an
   <img>, so external requests stay at 0. */
.thumb.crop-heirloom-thumb { background-image: var(--crop-heirloom-thumb); }
.thumb.crop-live-edge-coffee-table { background-image: var(--crop-live-edge-coffee-table); }
.thumb.crop-pendant-lamp { background-image: var(--crop-pendant-lamp); }
.thumb.crop-planter-set { background-image: var(--crop-planter-set); }
/* the dining scene, cropped low onto the rug it is standing on */
.thumb.crop-heirloom-oak-dining-table {
  background-image: var(--crop-heirloom-oak-dining-table); background-position: 50% 92%;
}
`;
