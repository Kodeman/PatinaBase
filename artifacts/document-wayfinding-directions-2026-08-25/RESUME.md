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

**Workflow run ids:** `wf_5fdcbeaf-22f` (grounding — code anatomy + canon digest), `wf_887b4bac-02c` (shots — 86 verified + probe), `wf_b4800970-c1b` (panel + verify — 9 seats, collation, three refuters), `wf_783f6f10-2ea` (directions — A/B v1, critiques, v2, judges), `wf_662a99a0-5f1` (mocks + deck — kit, fragments, presentation.html, fact-check, visual QA)

## NOT DONE / OWED
- **Kody's read of the deck and rulings on its ten questions:**
  1. **B1** — may the shelved spine's mount gate (I136, ≥1440px only) move so Direction B's map clips to the paper at every tier?
  2. **B2** — may a held room survive below 1440px (unwinding the I136 auto-release clause)?
  3. **C14 narrow reading** — does "flag off is main's composition exactly" (I138) bind only the worktable guard, or freeze all unflagged shipping?
  4. **Thumb-Index DECISIONS entry** — Kody removed it verbally ("do not re-propose"); zero grep hits in the ledger. Needs one entry recording the removal + reason.
  5. **I114 candidate** — Direction B's section↔stage mapping (brief→Consultation … care→Completion) offered as a candidate for the agenda, not a ruling now.
  6. **T4/T2 stance** — "no fleet view" / "install is a label on project mode, not a mode," the two most severe findings ever recorded against this surface, still never ruled. Is a quarter of eleven-open-documents acceptable, and should T4/T2 finally get a ledger entry?
  7. **F03 hotfix** — the care spread's FF&E section mounts with `mode="install"` (heading literally reads "Install" in production). Shared plank SP-01 fixes it in two strings + one condition; ask is whether to hotfix now, independent of either direction.
  8. **/room/<id> PostgREST defect** — verified screenshot shows a live app error ("Cannot coerce the result to a single JSON object") on screen; outside this review's scope (Room View internals excluded) but needs an owner and a bug.
  9. **F56 contrast pass** — clay/terracotta text (~374 sites) at ~2.2:1, under WCAG 2.2 AA's 4.5:1; sibling F55 is a missing skip link. Neither direction touches it. Schedule, defer, or accept as known exception?
  10. **The Moved rung** — on this specimen, Moved = Authorized ($141,600) because no vendor-payout figure exists on the document; both directions print the ambiguity rather than inventing arithmetic. Needs a data-model answer, not a design one.
- **Nothing built.** Both directions are proposals only — no code changes landed against either lane.
- **DECISIONS.md untouched** — do not append until Kody rules on the above.

## Environment notes
- **Sandbox denies `.env` reads and caps file descriptors**, which breaks turbo's git-status scan and floods `next dev`'s watcher with `EMFILE`. Boot the portal via an unsandboxed steward — recipe in `research/02-steward-boot-off.md` (`dangerouslyDisableSandbox: true` on boot/kill only; zero `EMFILE` occurrences unsandboxed vs. 17 sandboxed).
- **Local DB was reset/reseeded mid-run.** Fixed-UUID seed rows survived; `gen_random_uuid()` rows did not. Chen Residence (project-rich stand-in) drifted from `67b836e8-9167-4f39-b25d-39270d412a3f` to `2992a486-b2bd-4139-9e51-33ed1621c59c` — re-verified via `psql` as still the correct pick (ties Olsen Lake House on richness, wins tiebreak). See `research/01-shot-ledger.md` "Harness notes."
- **Redis was down** (`ECONNREFUSED 127.0.0.1:6379`) — `docker compose up -d` wasn't part of this boot mandate; orders/projects logged repeated errors but the portal itself ran fine over HTTP. Flag for any downstream agent touching a Redis-backed path (rate limiting, cache/queue).
- **The shots carry the Next.js devtools badge** (dev-mode indicator) — expected artifact of a local-dev capture, not a product defect.

## Resume prompt (paste into a new session)
"Read `artifacts/document-wayfinding-directions-2026-08-25/RESUME.md`. The wayfinding review is complete and the deck is published; nothing is built. Get Kody's read of the deck (URL in RESUME.md) and his rulings on the ten questions listed under NOT DONE/OWED, then: log the Thumb-Index removal and any other resolved questions to `docs/design/the-document/DECISIONS.md`, and only then scope implementation of whichever direction (or hybrid) Kody picks."
