# Canon digest — G2 ground:canon-digest (document-lens-proposal)

Source: `docs/design/the-document/DECISIONS.md` (10,108 lines; grep+sed only, verified against the
current file — never read whole). Also `apps/designer-portal/CLAUDE.md`'s Hard constraints
paragraph, and `artifacts/document-wayfinding-directions-2026-08-25/research/11-canon-digest.md`
(prior digest, reused for locations, every line re-verified below — several had drifted or were
mis-anchored to entry headings rather than rule text; corrected inline).

**Framing.** This program (the "smart lens" — a condensing header, spine navigator, sections
yielding out of frame, motion) sits under a CLEAN-SHEET ruling: the ledger below is CONTEXT for
what exists and why, not a constraint list. Only the four items in (A) bind. Everything in (C) is
standing context, explicitly amendable.

---

## (A) The four hard no-gos

**NG1 — D1, strict one-document focus.** `DECISIONS.md:12`:
> "Strict one document at a time. No split view, no peek/hold. Esc or 'Put down' is the only exit;
> switching costs one trip through the Desk or a ⌘K jump."
D12 (`:211`) restates this spatially for the open document: "in hand, the paper IS the screen (D1
expressed spatially)." A lens that peeks at another document, or holds two in view, is out; a lens
that stays inside the one open document (header, spine, motion) is not implicated by D1 itself.

**NG2 — D4 as amended by R126, `--elevation-sheet` at three sites; `.folio-face` deleted.**
Original D4, `DECISIONS.md:15`: *"No shadows. Anywhere. No exceptions. Value contrast + flat
stacked edges + folder tab; mechanically enforced via lint, CI-blocking."* R126 amends it,
`DECISIONS.md:10023-10024`:
> "**D4 is amended.** D4 reads 'No shadows. Anywhere. No exceptions.' R72 already relaxed it for
> the folio pickup and the dock's hairline surface. This ruling replaces that with one token,
> `--elevation-sheet: 0 1px 2px rgba(44,41,38,.08)`, spent at **exactly three sites** — the margin
> chips, the open ledger sheet, and the studio drawer — and nowhere else."
The old `.folio-face` CSS-level exception (a `filter: drop-shadow(...)` in `globals.css`,
referenced by zero components) is what R126 found and deleted — confirmed live-deploy-absent at
`DECISIONS.md:10100`: *"`folio-face` absent"* (one of R126-deploy's probes). R126-deploy's own
text (`:10092`) is explicit that the token is a graft, not canon: *"the one `--elevation-sheet`
token at its three sites (the D4 amendment, **not canon**)."*
The enforcement path, `apps/designer-portal/src/lib/document/__tests__/shadow-gate.test.ts`
(`DECISIONS.md:10027-10036`), gates at the CSS level — the half D4's TSX-only ESLint rule never
covered:
> "a new `lib/document/__tests__/shadow-gate.test.ts` at the CSS level, which is the half that was
> never covered: the D4 `no-restricted-syntax` rules in `eslint.config.mjs` read `.ts`/`.tsx`
> only, no stylelint config exists anywhere in this repo... The gate holds one shadow declaration
> in `globals.css` (`.doc-elevated`...), a frozen inventory for every other stylesheet under
> `src/`..., no drop-shadow or shadow filter anywhere, one `--elevation-sheet` declaration, and
> **at most three TSX files** under `components/document/**` wearing `doc-elevated`."
Net for a lens design: any new elevation/shadow anywhere is out unless it is one of the three
named `--elevation-sheet` sites and the gate's ≤3-file budget has room — a lens surface (a
condensing header bar, a spine rail) is not one of the three named sites today, so it gets zero
shadow budget as currently gated.

**NG3 — the Thumb Index, do-not-re-propose.** R124 item 11, `DECISIONS.md:9676-9678`:
> "11. **Ledger hygiene — the Thumb Index.** Kody removed it verbally in July 2026 ('do not
> re-propose'); a grep of this ledger for it returns zero hits before this entry. This item is
> that record."
No line-number-jump navigator of that specific shape (a thumb-index rail) may be re-proposed,
named or not, per this entry.

**NG4 — the R126 ratified register, verbatim.** `DECISIONS.md:9993-10011`:
> "**The ruling: A, with a little of B's colour.** Direction A — Ink on Paper — is the whole
> skeleton and the whole material register: **three paper stocks and only three** (the desk keeps
> today's cream `#FAF7F2`, the document is one untinted sheet `--doc-paper #FCFAF6`, the spine and
> the margin are one deeper stock `--doc-rail-stock #E8E3DB` with a margin chip drawn as a lifted
> piece of the sheet on it); **three rule weights** for three ranks (`--rule-hair` ends a row,
> `--rule-mid` ends a section, the double rule opens a movement)... **B's colour survives at
> exactly three sites and nowhere else**: the **filled stamps** (one recipe... a **charcoal word**
> at 11.7:1; state is hue, legibility is charcoal), the six saturated **stage tabs** on the roster
> heads (`--tab-brief … --tab-install`... printing as a small plate on the head line — there is no
> tinted band under a stage group), and **48px product crops** on catalog-linked lines... **Typography
> goes no further than the mockup**, and — Kody, same day — **THE STUDIO contents block on the
> desk keeps its deployed typography exactly**: *'the currently deployed studio at the bottom of
> the desk looks great, dont change the typography.'* No direction restyles it."
Any lens work touching type scale, rule weight, stamp fills, stage-tab plates, thumbnail sizing,
or THE STUDIO block inherits this register as fixed visual law, not merely a reference point.

---

## (B) What R126 shipped

**The ruling itself** (`DECISIONS.md:9981-10011`, quoted above under NG4) reversed a first build
that bled six movement-tinted desk bands to the page edge and carried one charcoal band with the
letterhead/instrument-row/red-letter — Kody's verbatim rejection, `:9986-9990`: *"the desk is
starting to look silly with the banded colors edge to edge. and the document with the dark header
and yellow body looks terrible. Direction A would have been better guidance, pulling in a little
more of direction B's color, Maybe an animated color highlight on hover."* The new hover wash
(`:10013-10022`) is Kody's own idea, executed: a warm pigment wash sweeping open under the pointer
on roster/FF&E lines via the Scored Ink `--ink-x`/`--ink-y` mechanic, ~1.12:1 ratio, reduced-motion
falls back to a flat tint.

**Live on prod** (`DECISIONS.md:10082-10108`, R126-deploy): Worker version
`9c0c2cdd-2041-4848-a193-93d9e8fb0b71` (before: `afe63619-002d-4ea2-90b6-244c41a86c81`; rollback
target `4b35e0a94`). What is live, per `:10086-10093`: "Direction A's skeleton — type scale, three
rule weights, the section head, the cream desk ground, untinted paper, the spine/margin rail,
margin chips as lifted paper" plus the three B grafts (filled stamps, stage-tab plates, 48px
thumbs), the hover wash, roster settling once per load, and the one `--elevation-sheet` token.
**Retired / deleted** by this ship: the six `--stock-*` movement tints (the desk's edge-to-edge
banding), the charcoal band that had carried letterhead/instruments/red-letter, the FF&E
"decision-due" resting tint `rgba(232,197,71,0.05)` (`:10057-10061`, superseded by the filled
stamp as the at-a-glance signal), and `.folio-face` (confirmed absent in the live probe, `:10100`).
Signed-in walk of `app.patina.cloud` is still owed to Kody (`:10101-10102`).

---

## (C) Standing context, non-binding

- **D2** · `:13` · Interruptions stay designer-driven, zero break-through rules shipped by default — context; amendable.
- **D3** · `:14` · Mobile: margin items collapse to anchored chips, spine becomes a bottom sheet, gated by a dedicated mobile milestone — context; amendable.
- **D8** · `:19` · Studio Drawer persistent on every screen; ledger sheets open as collapsed-by-default overlays, no badges/pulsing counts — context; amendable.
- **D12** · `:211-224` · Full-bleed document; spine and margin become sticky full-height rails; pick-up = raise-to-fill ~270ms scale (reduced-motion: crossfade) — context; amendable.
- **D13/I21** · no standalone `### D13` heading exists; the mobile-spine-sheet milestone is D3 (`:14`) built out by I21 (`:760-792`, "the D13 mobile build") — `mobile-bar.tsx` unified thumb-edge bar, anchored margin chips, spine-sheet doubling; flip-gate closed for build, Leah's device validation still hers — context; amendable.
- **R8** · `:285-292` · Inert settled bars must not show an "unfold ↓" hint until the unfold ships ("affordances that do nothing teach the document to lie") — context; amendable.
- **R15** · `:381-397` · The breath — one slow ~3s opacity swell on the *active* spine marker only, `prefers-reduced-motion` disables it, "nothing on the Desk ever moves"; "pulsing beyond this is declined — ambient motion is what the no-badge discipline exists to prevent" — context; amendable, but Kody separately locked THE STUDIO block's typography (unrelated surface) and left the breath itself untouched at R124 item (spine timer scope note, `:2561`).
- **R27** · `:1058-1067` · The letterhead instruments — "View as the clients", "Send a note", "The scan" as one quiet DM-mono row under the letterhead subtitle — context; amendable.
- **R35** · `:1432-1445` · Strata Mark three-hue gradient (Mocha/Clay/Dusty Blue per movement), extends R15 — context; amendable.
- **R99** (cited by the brief as "R105/I105"; **correction below**) · `:3016-3018` · The Rule (collapsed schedule header) "pins beneath the project title on scroll at reduced height (labels fold into the line; diamonds and the today rule remain)" — directly relevant to a condensing-header lens — context; amendable.
- **R105** · `:3654-3695` · O8/O9 ruled in direction (client sees date-touching revisions only; tasks fold into items as a future migration); the Rule's line ink goes hybrid (elapsed bold / remaining light) — context; amendable.
- **I105** · `:6121` — unrelated entry (Field Capture P2 camera-pointing policy); **not** the schedule-rule source; flagged so it isn't mistaken for R99's neighbor.
- **R27/R35 note:** no defect found; both stand as written.
- **I107** · `:6584-6600` · Scored Ink — DocumentAction sheds boxes/borders/fills for a bare DM Mono word with proofreader's scoring; wet-ink press bead on hover/press — context; amendable.
- **I135** · `:8377-8424` · Region heads (one inked leader per region, `RegionHead`-enforced); red-letter needs zone; "always-visible row overflow — deviation from the deck" (`···` renders always visible, "nothing actionable exists only on hover"); double-rule motif; sparse-default fold seams — context; amendable.
- **I136** · `:8427-8541` · The Shelved Spine — running index (≥1440px only, four Project regions indexed, IntersectionObserver reading line), rooms block, shelves block; room lens LIFTS not filters; schedule frame (`ScheduleRule`) folds by default under key `schedule-rule` (never `schedule`) — context; amendable.
- **I136-errata** · `:8543-8597` · Corrections before ship: call-sheet shelf row now gated by the `call-sheet` flag; phase-advance control pulled out of the schedule fold (lifecycle act, not a date edit); room-state derivation unified; paper-push threshold moved 1900px → 2020px — context; amendable.
- **I137/C11** · Record-at-foot: `:8608-8613` — "The Record moves to the foot of the paper... after the active section, after the account band and the kickoff band, and immediately before the colophon. History is an appendix, not a preamble." Running-index-from-mount-order: `:8616-8624` — "The running index is derived from the paper order, not declared beside it... One ordered descriptor, `PROJECT_PAPER_ORDER`... **approvals → schedule → ffe → money**" — context; amendable.
- **R124** · `:9626-9701` · The Wayfinding Review's ten rulings: sequencing (A then B, same five files), C14/I138 narrow reading, T4/T2 open-by-choice, ticket-gate sticky-seam redraw, B1/B2 ratified conditionally, the Moved rung, F03 care/install fix, four unowned defects, Thumb Index record (NG3 above), deck republish — context; amendable.
- **R125** · `:9705-9750` · Build rulings on R124's program: one program/one shipment (A then B, never concurrent), **no feature flags anywhere** (`job-ticket` waived), two production deploys only, full scope stated once (F58 Option 3 word set: DELIVERED/RECEIVED/PARTIAL/DAMAGED), I146-I153 as the build's own ledger — context; amendable.
- **I146** · `:9758-9782` · Wave A1 — seven stage sentences, shelved-spine mount widens to install/care, running index reads real mount order via `paperRegionsForSection`, `Add to project` → `Add a line`. Shipped unflagged.
- **I147** · `:9786-9803` · Wave A2 — ten planks land; F55 skip link; F21/F11 focus-restore; F41/SP-20 stamp colour by need-kind (no badge).
- **I148** · `:9815-9842` · Wave A3 — six-rung money ladder (`Budget · Plan · Authorized · Moved · Owed · Not drawn`), spine/shelves lose `knowledge` entry, Desk renames (F24/F38/F39/F65/F90 — **this F24 is a different finding from the life-directions program's F24 below**), ⌘K "WHERE THE WORK STANDS" group, FF&E single-leader election, 390 wrap rule on every region head, mobile bar single primary act.
- **I149** · `:9851-9875` · Wave B1 — the ticket. Spine's rooms/shelves blocks **deleted outright** (no flag, per R125's waiver); new `job-ticket.tsx` (eight rows: Rooms · Pieces · Drawings · Spec · Boards · Money · Dates · People), sticky two-line seam on scroll; room-lens auto-release below 1440 removed.
- **I150** · `:9881-9905` · Wave B2 — ticket grows to every phase (still eight constant rows + a phase cell); Desk's four-up folio grid/Studio Pulse/Recent Boards **unmounted** in favor of `desk-roster.tsx` (one stage-grouped roster line per job, nothing folded on first paint); `deriveTicketLeader` replaces the old guide headline rung.
- **I150-deploy** · `:9907-9939` · Waves A-B2 live (Worker `afe63619...`); signed-in walk owed; Deploy B follows B3.
- **I151** · `:9941-9976` · Wave B3 — F56 repo-wide `-ink` contrast companions (`--color-clay-ink`, `--color-terracotta-ink`); F58's Option 3 word set lands via `lineStampLabel`; owed: signed-in walk of A+B, the I114 session, O10/O11, four e2e fixture defects.
- **R126's still-open Q-list** (from `artifacts/document-life-directions-2026-08-28/RESUME.md:163-168`, **not DECISIONS.md** — R126 references "the standing questions in `13-questions.html`" but does not itself enumerate Q06/Q08-Q12): Q04 close the dead `.folio-face` exception (done, see NG2); Q06 the production Strata `product_id` count, unrun; Q08 whether the planks ship as their own lane first; Q09 `contrast.test.ts`'s `parseTokens` light/dark split; Q10 who fixes the desk's 390 overflow (F24, below) and when; Q11 whether SP-06's hover floor at 1.097:1 clears its own ≥1.09:1 promise; Q12 (new) whether the hover wash ships as its own plank now or waits for the direction — context; amendable, none block a lens design directly except Q10/F24 (layout headroom on the same viewport a condensing header would also compress).
- **Reduced-motion, 39 offenders** — `artifacts/document-life-directions-2026-08-28/RESUME.md:281-282`, **not in DECISIONS.md**: "39 app-wide offenders, unchanged across two walks; ruling needed on whether these are pre-existing scope or should be fixed now." Pre-existing, app-wide, not introduced by R126 — relevant to any lens motion work since it inherits this backlog rather than resolving it.
- **Aged-oak, 3.51:1** — R126 itself fixed the spine's own instance: `DECISIONS.md:10070-10072`, "the spine's rail labels (`On this paper` and the running index's inactive values) moved off `--color-aged-oak` (3.51:1 on `#E8E3DB`) to `--text-muted` (7.52:1)". The **broader, still-open** instance is app-wide: RESUME.md:283-284, "`--color-aged-oak` on paper measuring 3.51:1 (not the presented 4.30:1) at roughly 40 sites — pre-existing token combination, not introduced by this branch; needs a ruling." A lens surface reading rail/spine labels inherits the fixed instance; anything reusing aged-oak elsewhere inherits the open one.
- **F24, desk 390 overflow** — `artifacts/document-life-directions-2026-08-28/RESUME.md:285-286`, **not in DECISIONS.md** (this is a distinct finding ID from I148's F24 above — a genuine cross-program ID collision, same pattern as the ledger's known R113 duplicate): "the desk's 390px viewport overflow (437px of content in a 390px viewport, 47px overflow) — still has no owner; not fixed by anything in this program." Directly relevant: a condensing header or spine navigator on the same 390 viewport inherits this unresolved overflow rather than a clean baseline.
- **I114 owed session** — still outstanding across every wave that touches it: `DECISIONS.md:8679` ("`active_section` remains the sealing authority — I114 is still owed Kody's..."), `:8850` (same, Worktable wave), `:9405` (I143's tail: "The I114 section↔stage mapping session is still owed by Kody. Every wave left `active_section` standing as the sealing authority rather than touch it."), `:9657-9660` (R124 item 7, candidate mapping placed on the agenda, "Nothing built depends on it."), `:9976` (I151, still in the owed list). A lens keyed to section/stage semantics (e.g. a spine navigator that groups by stage) would be building on top of a mapping Kody has not yet ruled.

---

## (D) What a "smart lens" would touch

A condensing header, a spine navigator, sections yielding when out of frame, and lens motion would
touch: **D1** (must stay inside the one open document — no peek/split), **D4/R126's
`--elevation-sheet`** (any new depth cue on a header/spine needs its own budget line, not
implicitly inherited), **D12** (the sticky full-height spine/margin rails and the raise-to-fill
pick-up motion it already owns), **D3/I21** (the existing mobile spine-sheet pattern a condensing
header would sit beside or replace on narrow widths), **R99** (the Rule's own condense-on-scroll
precedent — pins beneath the title at reduced height), **R105** (the Rule's line-ink hybrid
ruling), **R15/R35** (the Strata Mark's one sanctioned motion, the breath, and its three-hue
gradient — precedent for "exactly one" ambient motion), **I135** (region heads, the one-leader
rule, always-visible-never-hover overflow — bears on what a condensing header may hide vs. must
keep visible), **I136/I136-errata** (the running index itself — the closest existing thing to a
"spine navigator," its ≥1440px-only mount gate, its IntersectionObserver reading line, its lift-
not-filter doctrine), **I137/C11** (the canonical mount-order array `PROJECT_PAPER_ORDER` any
navigator must read from, not redeclare), **R124/R125/I146-I151** (the job ticket that replaced
the running-index blocks entirely — `job-ticket.tsx`, its eight constant rows, its sticky
two-line seam on scroll — the most direct existing "condensing header" precedent to reconcile
with or build on), **R126/NG4** (the type scale, rule weights, and hover-wash mechanic any new
lens surface must render in), **the reduced-motion 39-offender backlog** and **F24's 390 overflow**
(both inherited constraints on any lens work touching motion or the 390 viewport), and **I114**
(if a lens organizes by stage rather than by section, it runs into the same still-owed mapping
every prior wave declined to touch).

---

## Gate — 15 citations checked against the live file

Actually run (bash, not zsh — zsh's associative-array quoting choked on this, so the check ran as
a real `bash script.sh`):

```bash
#!/bin/bash
F=/Users/kody/Code/patina-merged/docs/design/the-document/DECISIONS.md

lines=(12 15 211 9981 9993 10003 10007 10009 10024 10027 10036 10082 10092 10100 9676)
words=(Strict shadows Full-bleed amended stocks stamps crops Typography elevation-sheet shadow-gate TSX live canon absent Thumb)

pass=0
fail=0
for i in "${!lines[@]}"; do
  n="${lines[$i]}"
  word="${words[$i]}"
  line=$(sed -n "${n}p" "$F")
  if printf '%s' "$line" | grep -qF "$word"; then
    echo "PASS  :$n  contains '$word'"
    pass=$((pass+1))
  else
    echo "FAIL  :$n  MISSING '$word' -- got: $line"
    fail=$((fail+1))
  fi
done
echo "PASS=$pass FAIL=$fail"
```

Actual output:
```
PASS  :12  contains 'Strict'
PASS  :15  contains 'shadows'
PASS  :211  contains 'Full-bleed'
PASS  :9981  contains 'amended'
PASS  :9993  contains 'stocks'
PASS  :10003  contains 'stamps'
PASS  :10007  contains 'crops'
PASS  :10009  contains 'Typography'
PASS  :10024  contains 'elevation-sheet'
PASS  :10027  contains 'shadow-gate'
PASS  :10036  contains 'TSX'
PASS  :10082  contains 'live'
PASS  :10092  contains 'canon'
PASS  :10100  contains 'absent'
PASS  :9676  contains 'Thumb'
PASS=15 FAIL=0
```

(First pass caught two off-by-one line refs in the draft — `:9992`→`:9993` for "stocks" and
`:10025`→`:10024` for "elevation-sheet" — both corrected above in (A)/NG4 and NG2 before this
final run.)

`wc -l` of this digest file itself:
```
$ wc -l artifacts/document-lens-proposal-2026-08-28/research/11-canon-digest.md
     224 artifacts/document-lens-proposal-2026-08-28/research/11-canon-digest.md
```
