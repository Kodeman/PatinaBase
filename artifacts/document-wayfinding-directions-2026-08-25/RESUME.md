# RESUME — The Document, Wayfinding Review & Two Directions (paused 2026-08-25)

## The ask (Kody, verbatim intent)
"Assemble a team of right sized agents to review the doc page layout and navigation on the designer portal. Have a UX UI team and an Interior Design team weigh in on the layout and flow of the doc interface in the designer portal. Propose changes needed to tighten up the UX so that it is always obvious to the designer what to do and how to get to the items they need. Present the proposal with UI mockups in an HTML document. Propose two directions we can go."

## Kody's three plan-time rulings (2026-08-25)
1. **Direction A tightens *within* doctrine. Direction B *may amend* doctrine** — every amendment named and priced against the ruled canon (DECISIONS.md through I143) it touches.
2. **Evidence = local dev, both flag states** — no prod walk this round.
3. **Baseline = both compositions** — live flag-off composition AND the Worktable (flag `worktable`, ruled "the destination" 2026-08-15, never rendered before this run). Each direction states how it lands on each baseline.

## State at pause — DONE
Nine-seat review (5 UX/UI lenses U1–U5 + 4 practitioner personas P1–P4) of `/desk` + `/doc/[id]`, evidence-first, every finding surviving three refuters before an author saw it:

- **86 verified shots** incl. the first-ever render of the Worktable (flag on) — `shots/*.png`, ledger `research/01-shot-ledger.md` ("These are the Worktable's first screenshots.")
- **Probe log** — 166 supplementary/repro captures, `probe/*.png` + code-truth and canon-truth verification passes `research/33-verify-code-truth.{json,md}`, `research/34-verify-canon-truth.{json,md}`
- **Anatomy + canon digest** — `research/10-code-anatomy.md` (structural map of the document route group), `research/11-canon-digest.md` (DECISIONS.md distilled)
- **9 panel reports** — `research/20-panel-u1.md` … `research/28-panel-p4.md` (U1–U5 UX/UI lenses, P1–P4 Interior Design practitioner personas)
- **203 → 101 → 92 findings** — 203 raw findings from the nine seats collated to 101 (`research/30-collated-findings.{json,md}`), 92 survive three refuters in `research/31-verified-findings.{json,md}`
- **20 shared planks** — cross-direction fixes both lanes carry, `source/shared-planks.md`
- **Direction A — "Everything Prints"** (within doctrine, zero canon amendments, new ledger entries I144–I149 all additive/revertable) and **Direction B — "The Shop Ticket"** (two named amendments to I136), both v2 after critique: `source/direction-a.md`, `source/direction-b.md`, critiques `source/critique-{a,b}-{feasibility,practitioner}.md`
- **Two judge reports** — J1 practitioner-workflow, J2 product/engineering feasibility, scored separately (never averaged): `source/judge-practitioner-workflow.md`, `source/judge-feasibility.md`
- **Mock kit + ten fragments** — `mock/kit.css`, `mock/KIT.md`, `mock/kit-demo.html` + 5 mockups per direction (`mock/a/M1–M5`, `mock/b/M1–M5`)
- **presentation.html** — 2.6 MB, fact-checked and visual-QA'd (`research/60-deck-factcheck.md`, `research/61-deck-visualqa.md`, revision logs `research/62-deck-revision-log.md`, `research/63-deck-revision-2.md`), published at https://claude.ai/code/artifact/b8c4ac51-b7a8-473f-9b23-3a3a21a7a03d
- **Kody's rulings on all ten deck questions, taken 2026-08-25** — recorded as **`docs/design/the-document/DECISIONS.md` R124** and in friendlier long form at `source/rulings-2026-08-25.md`. Headline shape: sequence is A-then-B, never concurrent, with B's own rulings (B1/B2 amendments to I136, both conditional on a sticky-seam ticket-gate redraw Kody reviews himself) taken now, ahead of B's build; C14/I138 reads NARROW (binds only the `worktable` guard); T4/T2 accepted as open-by-choice; F03 fixed with A's first slice as SP-01; the Thumb-Index removal is now on the ledger; I114's candidate mapping goes on Kody's agenda, not ruled; the Moved rung gets a vendor-payout read; four defects (`/room/<id>` PostgREST error, F56 contrast + F55 skip link, F58 Received/Delivered) are scheduled as independent tickets. The deck itself gains a "Ten questions, ten answers" section and republishes at the same URL (tracked separately).

**Workflow run ids:** `wf_5fdcbeaf-22f` (grounding — code anatomy + canon digest), `wf_887b4bac-02c` (shots — 86 verified + probe), `wf_b4800970-c1b` (panel + verify — 9 seats, collation, three refuters), `wf_783f6f10-2ea` (directions — A/B v1, critiques, v2, judges), `wf_662a99a0-5f1` (mocks + deck — kit, fragments, presentation.html, fact-check, visual QA)

## NOT DONE / OWED
Rulings are DONE (R124, 2026-08-25 — see above). What's still owed:

- **Kody's sticky-seam review.** The ticket gate must be redrawn as a sticky seam (collapsing to
  B's two-line 390 form once the letterhead scrolls past, at every width) and Kody reviews the
  redraw himself before B1/B2 take effect — no P1/P3 stand-in walk.
- **Kody's flag-on Worktable walk.** Still owed since I143; the narrow C14 reading (R124) means it
  no longer blocks A's unflagged slice or B's `job-ticket` flag from shipping, but it is still owed.
- **The I114 session.** Direction B's candidate section↔stage mapping (brief→Consultation …
  care→Completion) is on its agenda as the opening proposal; the session itself hasn't happened.
- **The build program itself — not started.** Direction A's shared planks + first slice
  ("the sentence and the spine," 5–7 days, unflagged) haven't begun; A's remaining waves and then
  B's waves (behind `job-ticket`, gated on the sticky-seam review) follow. No code changes have
  landed against either lane.
- **The four scheduled defect tickets** (R124 item 10), each independent of both directions:
  (a) `/room/<id>` PostgREST error ("Cannot coerce the result to a single JSON object") — owner:
  Room View; (b) F56 contrast pass — clay/terracotta text at ~2.2:1, red-letter eyebrow ~2.95:1,
  vs. WCAG 2.2 AA's 4.5:1; (c) F55 — no skip link / bypass-blocks control in the `(document)`
  layout; (d) F58 — the same FF&E line reads "Received" on the paper and "Delivered" in the spec
  book, a data-model ruling not a rename.
- **The Moved-rung vendor-payout read.** Money region needs a read on the accounts data the band
  already holds so `Moved` = ordered − paid out to makers, differing from `Authorized`. Until it
  lands, both lanes keep SP-03 and SP-04's existing gloss.

## Environment notes
- **Sandbox denies `.env` reads and caps file descriptors**, which breaks turbo's git-status scan and floods `next dev`'s watcher with `EMFILE`. Boot the portal via an unsandboxed steward — recipe in `research/02-steward-boot-off.md` (`dangerouslyDisableSandbox: true` on boot/kill only; zero `EMFILE` occurrences unsandboxed vs. 17 sandboxed).
- **Local DB was reset/reseeded mid-run.** Fixed-UUID seed rows survived; `gen_random_uuid()` rows did not. Chen Residence (project-rich stand-in) drifted from `67b836e8-9167-4f39-b25d-39270d412a3f` to `2992a486-b2bd-4139-9e51-33ed1621c59c` — re-verified via `psql` as still the correct pick (ties Olsen Lake House on richness, wins tiebreak). See `research/01-shot-ledger.md` "Harness notes."
- **Redis was down** (`ECONNREFUSED 127.0.0.1:6379`) — `docker compose up -d` wasn't part of this boot mandate; orders/projects logged repeated errors but the portal itself ran fine over HTTP. Flag for any downstream agent touching a Redis-backed path (rate limiting, cache/queue).
- **The shots carry the Next.js devtools badge** (dev-mode indicator) — expected artifact of a local-dev capture, not a product defect.

## Resume prompt (paste into a new session)
"Read `artifacts/document-wayfinding-directions-2026-08-25/RESUME.md`. The wayfinding review is complete, the deck is published, and Kody has ruled on all ten questions (`docs/design/the-document/DECISIONS.md` R124, friendlier form at `source/rulings-2026-08-25.md`). Nothing is built yet. Start Direction A's shared planks + first slice ('the sentence and the spine,' unflagged), per the NOT DONE/OWED list — the build program, the sticky-seam ticket-gate redraw, the four scheduled defect tickets, the I114 session, and the Moved-rung payout read are all still open."
