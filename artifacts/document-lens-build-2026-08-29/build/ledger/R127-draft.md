### R127 · The Smart Lens — the proposal ratified as written; nine build rulings taken — 2026-08-29

Kody's ask, verbatim (`source/brief.md`, `source/instruments.md`, `mock/deck-parts/02-ask.html`):

> "We are getting close to a design that feels right on the document. The spine on the left is still
> cluttered and could be better utilized to navigate the ins and outs of the document. The main header
> contains great info but takes up most of the screen height when opened up, each section is crammed
> into the next and the margin seems cramped for the space needed for the functionality it contains.
> Have a team of UI and UX designers sit down with the Patina engineering and interior design teams. Work
> with them to design the document so that it contains the needed information and actions, while feeling
> uncluttered and peaceful. Explore animations, content that appears when it needs to and lends to space
> when it isn't needed in frame. Think of the document as a smart lens that is always adjusting focus on
> what is needed as the designers move through the document. Present your strongest proposal to achieve
> this in an html document accompanied with a high fidelity mockup showcasing how the team will
> accomplish this challenging User experience and UI requirements."

**The ruling: the proposal ships as written.** `artifacts/document-lens-proposal-2026-08-28/source/proposal.md`
— the merge of J1 (practitioner) and J2 (feasibility), third-seat-ruled at its one point of disagreement
(the header: the band lives, declared 56px rather than measured, per proposal §0) — is R127, unchanged.
Deck `932d66c0…`, scroll-driven mockup `65b060ad…`. Engineering deviated from the mockup only where real
data contradicted it; every deviation is logged in `build/design/deviations.md` (50 numbered rows,
D-B1…D-B50, plus two CLOSED companions, 52 rows total, closed against `main` with zero unlogged drift —
architect audit, `build/w6-architect-audit.md`) and carried below and into I152.

**The nine rulings taken in the interview (Kody, 2026-08-29):**

1. **R127 = the proposal as written.** Engineering deviates only where real data contradicts the mockup; every deviation logged and carried into I152.
2. **All six waves, one production deploy at the end.** Rollback = `wrangler rollback 9c0c2cdd-2041-4848-a193-93d9e8fb0b71` (the version live now, per `R126-deploy`) or a revert of the single merge.
3. **No feature flag — GA.** Every "flag off restores…" line in proposal §9 is void; replacement law: **the tree is shippable at every wave merge** (gates green, walk clean, `desk-walkthrough.spec.ts` green).
4. **Two Fable seats** (`subagent_type: fork`): ARCHITECT (technical design; rules engineering deviations) and DESIGN LEAD (mockup as visual target; rules what prints; final visual walk). Both review, neither implements.
5. **Precedence when mockup and proposal disagree:** proposal governs MECHANICS (one-direction density, fold→density, no seam var, declared 56px); mockup governs WHAT PRINTS (yielded segments print their name, L-6 partial yield, 1280 collapse form, foot reserve). Design lead wrote the reconciliation in Wave 0 and extended it through every wave (`build/design/reconciliation.md`, W3-R1…R7, W4-R1, W5-R1…R6, W6-R1).
6. **Seed:** hand-run `scripts/the-document-lens-seed.sql` (idempotent, deterministic ids); ≥4 rooms, ≥60 FF&E lines with `product_id` links, POs, one damage, one overdue approval. Not wired into `config.toml`. Three fixed papers ship: **`…d5`** ("Aspen Loft — the long paper," 5 rooms/62 lines, two-line title), **`…d6`** (a pre-work proposal), **`…d7`** (a one-line-title 5-phase letterhead-shaped paper, added in W5 for the D-B48 title gates — not `…d4`, which was already owned by `schedule-extremes.sql`). Steady state: `seed-verify.sql` **19/19 PASS**.
7. **Acceptance:** agents walk every wave; Kody walks **prod after deploy** (rollback if wrong). No Kody session before ship.
8. **Debts:** Wave 0 fixed the e2e baseline (9 failures → 0, quarantine only truly environmental with a written reason); aged-oak / reduced-motion offenders fixed only on files the lens rewrites; F24 and I114 out of scope.
9. **Freeze:** `components/document/**`, `app/(document)/doc/[id]/**`, `lib/document/**`, `hooks/use-document-running-index.ts`, `src/app/globals.css` are frozen on `main` for the program; exceptions land only at wave boundaries, re-verified at Wave 6 (freeze check: `main` `dab057537` is an ancestor of the tip with **zero** frozen-path drift).

**The mechanics, L-1…L-11 (proposal §3), one line each — unchanged from the ratified table, walked and confirmed at Wave 6 on `…d5`, 1440/1280/390:**

| # | Mechanic | One line | W6 walk |
|---|---|---|---|
| L-1 | The sentence turns | On a committed reading stop, the band's line 2 crossfades to the new exception/guide sentence; the box never resizes. | seen — line 2 at y **26.19** in every cell, both forms (`long`/`short`) |
| L-2 | The reading window travels | A `--rule-mid` bracket in the ladder's gutter rides position-linked with scroll, drawing the frame's share of the paper's data-derived extent. | seen — `[data-lens-window]` top/height tracked at 1440 and 1280; the 390 bar prints `AT <STOP>` instead |
| L-3 | A segment changes register | A stop's ladder value yields to blank while its own `[data-region-head]` is in frame, and returns the moment the head leaves. | seen — value line goes `invisible` + `aria-hidden` **in place** (D-B37: same box, same row height, never a layout change) |
| L-4 | A region ahead opens | A region's body mounts at full ink, in one commit, once its reserved box's top comes within 240px of the frame's bottom edge — always below the frame. | seen — D-B16's density map exact at s0/s2/s3 on all three widths |
| L-5 | A region behind is never taken back | A passed region keeps its real height and stays full; `content-visibility` is not used (D-B33: deleted, see below). | seen — foot: all six roots `data-passed` + full, real heights; find-in-page reaches everything passed |
| L-6 | The rail head yields at s0 | While the letterhead's own box is in frame, the rail head's stage phrase stops printing (RF-02: the name and arc stay, muted); the arc and the `--rule-mid` stay. | seen |
| L-7 | She folds a region | An explicit `Fold ↑`/`Unfold ↓` unmounts/mounts the body and prints the seam with `CLOSED BY YOU`; focus lands on the `FoldSeam` control; persists across reload. | seen — pressed Money, reloaded, `CLOSED BY YOU` stood |
| L-8 | The pen goes down | An editable control taking focus turns that line's rule 1.5px clay-ink and freezes the lens (`data-lens-state="editing"`, D-B19); no sibling changes, no body mounts. | seen at W4 |
| L-9 | The lens settles | Scroll velocity under 40px/frame for 120ms (D-B32's restated form) sets `data-lens-settled` and fires at most one `aria-live` announcement per distinct reading stop. | seen — `data-lens-settled="true"` at every sample |
| L-10 | The press lands | A press forces every region between the offset and the target to full in one commit (`forceFullThrough`, flushed — D-B18), then scrolls, then focuses the target `<h2>`. | seen — landing measured within 4px of `--doc-landing-clear` on the stationary read |
| L-11 | The standing sheet opens | `+N MORE` opens a `DocSheet` listing every standing exception with its own act, plus an `INPUT NEEDED` section (W3-R2); close returns focus to the word. | seen — `Standing · 11` (9 exception rows + `INPUT NEEDED · 2`) |

**The design-lead rulings, W0 through W6 (full text in `build/design/reconciliation.md`) — the ones that changed what prints, in the order they were ruled:**

- **D-1/D-4/RF-02/RF-03/RF-05/OD-14's 1280 form/R-02** (Wave 0) — no published `--lens-height`; two density values (`full|quiet`) plus `data-passed`, no third "reading" value; a yielded segment prints its **name**, not blank, and the rail head at s0 yields the stage phrase only; margin groups drop the "nothing beside" empty line; the rail gates on **≤14 distinct labels**, never on ink percentage; room sub-rungs never print at 1180–1439.
- **W3-R1…R7** — line 2 and the standing sheet rank by **deadline distance**, never by kind; the guide's dropped `Input needed` rows survive in the standing sheet's own `INPUT NEEDED · N` section; the letterhead ledger prints at every width (never hidden below 1180), drops to the 11px mono floor there, and `SHARING` prints alone at every width; the 390/1440 letterhead budgets and the engine allowance (chromium vs WebKit) are stated as one number per width with the allowance named beside it.
- **W4-R1** — a quiet stop prints its head, **its own status line** (the count line, sentence case, per-region), **one leader act**, and one sr-only line — no invented second sentence, no generic sr-only string (closing fidelity F1–F3).
- **W5-R1…R6** — the 390 Margin sheet is the **whole margin**, grouped `THE WHOLE JOB` / `BESIDE <stop>`, not the mockup's flat seven-item list; the loading register prints **inside** the head's own count line (an inline pulse, never a line that unmounts and shifts the reader — D-B39); the sheet's `CAPTURE A NOTE` composer ships **text-only**, re-hosting the desktop rail's real `useCreateMarginNote` (not omitted, as first ruled — the premise correction is D-B44); the pre-work regions' `scope`/`vision`/`investment` stops are re-parented off `proposal-blocks-readonly.tsx` so no stop stands bodyless; a wrapped project title never clips (D-B48, mechanism by the architect).
- **W6-R1** — the short line-2 form's subject is the item's **object per need kind** (a schedule conflict's subject is the week, never the sentence's first word); `Fold ↑` printing beside the one leader at quiet is a **signed deviation** (D-B50) — the fold is L-7's own voice, not one of the region's acts, and stays reachable at quiet.

**The final walk's verdict (`build/w6-walk.md`, DESIGN LEAD, `document-lens/integration@975fdf6b7`): SHIP.** One wiring-sized fix (the short-form subject rule, W6-R1 §1) and one signed deviation (`Fold ↑` at quiet, D-B50) are the only things that differ from the ratified design. Nothing else does.

**Kody's first look on prod, in the walker's own order:** (1) open the long paper at 1440 — the letterhead, then one 56px band, first head at ~360px; scroll once and watch line 2 name the worst standing thing with its act and `+N MORE`; (2) press **Money** on the ladder, then **Fold ↑**, reload — **`CLOSED BY YOU`**; (3) on the phone — the name wraps to two lines, line 2 prints the short form (`OVERDUE 7D · INV-2026-114 SEND`), **More → Margin · 7 → CAPTURE A NOTE**; (4) turn on Reduce Motion — nothing moves, the same words print; (5) open a proposal — `CLIENT USER · PROPOSAL` on line 1, `Scope & engagement · Core · stage 03`, nothing between the band and the first head.

**The amended acceptance numbers**, final, measured on `document-lens/integration@975fdf6b7` (`build/w6-walk.md`, chromium; WebKit carries a stated engine allowance per W3-R7/D-B48 where noted):

| Criterion | Gate | Measured | Verdict |
|---|---|---|---|
| SC1 — first `[data-region-head]` at 1440/s0 | ≤ 405px | **359.06** (`…d5`); `…d7` 359.06; `…d6` 330.06; 1280 identical to 1440 | seen |
| SC2 — condensed band height | ≤ 108px | **56px** | seen |
| Band height, every cell | 56, stable | **56** in all 12 `…d5` cells (3 widths × 4 states) + `…d6` ×3 + `…d7` ×2 | seen — the falsifiable sentence holds exactly |
| Landing clearance | 72 | **72** everywhere (laid-out probe) | seen |
| Region gap, block-to-block | 24 | **24 · 24 · 24** between adjacent stops (non-adjacent pairs read wider only because a non-indexed frame sits between them — B7's per-side accounting) | seen |
| Rail labels at 1440/s0 | ≤ 14 | **13** on `…d5`/1280; `…d6` **7** (ceiling 9) | seen |
| Letterhead, 1440 | ≤ 205px | `…d5` **191.06** · `…d7` 191.06 · `…d6` 190.06 | seen |
| Letterhead, 390, one-line title | ≤ 265px | `…d7` **254.17** | seen |
| Letterhead, 390, two-line title | ≤ 300px | `…d5` **288.72** · `…d6` 268.97 | seen (D-B48) |
| First head, 390, gross | ≤ 435px (one-line) / ≤ 470px (two-line) | `…d7` **422.17** · `…d5` **456.72** · `…d6` 408.97 | seen |
| D-B16 density map at s0 | 1440/1280: approvals+schedule full; 390: approvals only | as gated | seen, all three widths |
| D-B31 fling s0→s3 | 0 blank frames | **0 / 73 frames**, all three widths | seen |
| D-B34 paper CLS | 0 | **0 paper, 0 chrome**, 30-step settled scroll, all widths, both motion registers | seen |
| D-B37 rail stability during a yield | 0 segment resizes | **0** steps with a segment box change (only the value line's visibility changes) | seen |
| D-B38 line-2 vertical position | one y at rest and pinned | **{26.19}**, all widths | seen |
| D-B46 cold-load promotion | quiet until resolved, then the map | fresh contexts, cleared storage: correct map at first sample after `data-lens-resolved` | seen |
| D-B47 mobile bar inset | `scroll-padding-bottom = max(72, bar height)` | bar **93.39px**, `--doc-mobile-bar-height: 93px` | seen |
| Reduced motion, 1440 s0/s2 | 0 running animations; word sets identical | **0** (vs 1 no-preference, the `doc-breath`); word sets **310/310** (s0), **512/512** (s2) | seen |
| Standing sheet | every exception + inputs, ranked by deadline | **`Standing · 11`** = 9 exception rows + `INPUT NEEDED · 2` | seen |
| Margin sheet, 390 | whole margin, grouped, one composer | **`Margin · 7 · 2 OVERDUE`**, `THE WHOLE JOB · 4` / `BESIDE PIECES · 3`, `CAPTURE A NOTE` composer, 7 rows | seen |
| Hover-only acts | 0 | **0**, every cell | seen |
| Console errors of a Wave-N class | 0 | none name a lens file; one unattributed 403 resource named for phase C | seen |

**Test basket** (`document-lens/integration@975fdf6b7`, production standalone, chromium): **149 passed · 3 failed · 1 did not run**. Two of the three failures are closed as of this ruling (a fixed spec bug; a basket-order artefact, reproduces PASS in isolation); the third (`lens-contrast.spec.ts:183`) is a real, newly-exposed finding — D-B49 ("promotion fetches" via a body-mounted query hook) — ruled and specified, landing at phase C. **The WebKit half of this basket, behind local TLS, is OWED** (D-B41): it needs Kody's one-time `mkcert -install` before it can run at all — WebKit refuses the standalone's CSP `upgrade-insecure-requests` directive and its `Secure` session cookie over plain `http://localhost`, so a WebKit run against the un-TLS'd rehearsal server yields no signal whatsoever, not a false pass.

**What R127 supersedes**, in earlier `DECISIONS.md` entries (unchanged from the design ruling; verified again at Wave 6's freeze check):

- **The job ticket** (`### I149 · Wave B1 — the ticket — 2026-08-26`, `DECISIONS.md:9851`) — `job-ticket.tsx`, its eight-row table and its sticky two-line seam are **deleted as a component**. The eight rows' derivation (`ticket-derivation.ts`) is byte-untouched (`git diff main --stat -- ticket-derivation.ts` → empty, confirmed at the Wave 6 audit).
- **`--doc-seam-height`** — the intent named in `### R99 · The Schedule master direction — the Spine and the Rule — 2026-07-15` (`DECISIONS.md:3002`) and formalized as plank SP-04 is **amended, not honored**: the variable is deleted from the tree entirely (0 uses, both source and e2e, at the Wave 6 audit), replaced by declared constants `--doc-band-height`/`--doc-landing-clear`.
- **The spine timer** — `### R69 · The running-timer readout rests at minute resolution — 2026-06-23` (`DECISIONS.md:2555`). R127 evicts it from the rail outright (Wave 1, OD-16); R69's minute-resolution formatting survives wherever the drawer and the mobile timer sheet still read it.
- **`PHASES ▸`** — `### I134 · Letterhead date vitals move to SET via the Calendar Folio — 2026-08-14` (`DECISIONS.md:8360`) carried the Phases fold forward untouched. R127 deletes `PHASES ▸` from `letterhead-vitals.tsx` outright (D-6).
- **The running index** — `### I136 · "The Shelved Spine" ratified — 2026-08-15` (`DECISIONS.md:8427`) gated the running index `≥1440px only`. R127 turns it into the ladder, printing at **both** desktop tiers, on all seven spreads; `spine-running-index.tsx` and `spine-shelved-blocks.tsx` are deleted (Wave 2, OD-16, confirmed absent at the audit).
- **Region heads and fold seams** — `### I135 · "The Project, Composed" ratified — 2026-08-14` (`DECISIONS.md:8377`) is carried forward for the one-leader rule (amended by D-B50: the fold is a voice, not one of the leader's acts) and always-visible overflow; its "needs zone" is superseded by the band's line 2 plus the standing sheet.
- **The no-feature-flag law** — `### R125 · The Wayfinding Review — build rulings — 2026-08-25` (`DECISIONS.md:9705`). R127 repeats it: no `doc-lens` flag anywhere in the shipped tree, confirmed (`min-[1440px]:block` 0 hits at the audit).

**Not superseded:** the R15 ambient breath (`DECISIONS.md:381`) stays exactly where it is — the proposal's one ambient move, confirmed at 3s/0s (no-preference/reduced) in the final walk. The R126 register (type scale, stock and ink, rule weights, stamps, the hover wash) is the floor this document does not touch.

**Debts carried into I152, not closed by this ruling:** D-B41's TLS WebKit ship-bar run (OWED, Kody); D-B44's per-stop margin-note anchor, which needs a schema change (`margin_notes.anchor_key`) — the program's first, explicitly deferred past this deploy; D-B5's `estimated_hours` editor, still unreachable since its Wave-1 fold deletion; the `/desk` `welcome-modal-overlay` help-system defect (pre-existing, unrelated to any lens file); the `get_project_ffe_readiness` per-line RPC fan-out (D-B28, logged not owned); a battery of non-gating nits across three review passes (N2-01…06, ~13 W4-correctness minors/nits, ~18 W4F3 items — 2 still open, P2-01…08, W5F2-01…03) — none gate, all named in I152.


*Entries add: R127 · last id = R127*
