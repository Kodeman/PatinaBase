# RC-7: evidence wave synthesis and verdict

US-52 Room Proof 08, step RC-7 (Kody's K8 ruling: an evidence wave before any ship). Written on 2026-10-29. Synthesis base `74a324b26` on `r8-evidence` (RC-6 tip `0088093b7`; 125 commits). The program branch `redesign/designer-portal-round8` is still at `0088093b7`: RC-7 is not merged into it yet.

## Verdict

**Still "ship inactive, once Kody asks to ship". C4/C6 activation is still blocked.**

- **Ship inactive.** RC-7 found and fixed 12 product defects (3 of them through migrations 00900–00902, which ship inactive) and 2 test defects. The merged gate at `00902` passes: SQL pass 2 is 97 of 99 rows exit 0, plus the expected RC7-E1-1 reproducer (exit 3) and the owned seed row (`0/0`). Every lane's browser specs pass on chromium and webkit-iphone, apart from two known gaps:
  - **E2.** No fully green rerun after r1. Final run: <<PENDING: E2 final run counts at the final tip, both projects, and the job F WebKit result (4 of 4 failures at `5386a159e`, cause not isolated at this base)>>.
  - **E8.** The E8 fixes (RC7-E8-1, -2, -4) landed after merged-gate Phase B. <<PENDING: E8H final run counts on the fixed tip>>.
- **Activation is not unblocked.** RC-7 moved 3 criteria to covered (A03, A19, A22) and 2 more provisionally (X04, X06), but 24 of 34 remain weak. What still gates C4/C6:
  1. **Kody's rulings:** §6 a (RC7-E1-1, the C6 client audience) and e (OBS-2, re-requesting returned evidence) bear directly on C4/C6. b, c and d gate C2 and A04/A15/A03.
  2. **A human screen-reader pass.** Not done (X05).
  3. **A device or VoiceOver walk** of the iOS acceptance and care surfaces. The iOS response path (A20) was never run; only the decoders ran (X08d).
  4. **Production data and activation migrations:**
     - the `service_arrangements` catalog is empty (RC7-E3-1): with C2 on, no designer can apply an arrangement;
     - the C2/C4/C6 activation migrations are not written (ROLLOUT §6.5).
  5. **D9 renderer coverage** (RC-5): no activation while any designer who could be asked to act still renders legacy.
  6. **Order:** C2 before or together with C4, then C6.
  7. **Evidence:** the remaining weak criteria (§2) are closed, or Kody accepts them by name.
  8. **Consumer sign-off:** the client-portal and iOS owners.

## Ratings, R3b → RC-7

Ratings apply to the whole criterion. "Before" is R3b ([`rc6-reviews/r3b-evidence-full.md`](rc6-reviews/r3b-evidence-full.md)). "Now" is the lane doc's rating, after its cross-provider review, with merged-gate results applied to fixed defects.

| ID | Criterion | Before | Now | Evidence |
|---|---|---|---|---|
| A01 | Exact subject and origin return | weak | weak | [E6](rc7-e6.md). Next act, search and correspondence are covered. The Orders entry (RC7-E6-2) is fixed and passes in the merged gate (E6 r5/r6 12/12). The full entry × filter/scroll matrix was not run. |
| A02 | Mounted context; singleton instruments | weak | weak | E6. Mounted shell plus the Finish instrument are covered, narrowed: the draft is saved, not held pending. No timer-provider census. |
| A03 | Inquiry → agreed project; lineage | weak | **covered**, open defect RC7-E3-5 | [E3](rc7-e3.md). Exercised: native inquiry, the Direction, sign/countersign as the real actors, and readback through the activated project. RC7-E3-4 was refuted. Not exercised: the trusted-IP client signing route and the UI clicks. ⌘K forks the lineage (RC7-E3-5). |
| A04 | Every arrangement; repeat safely | weak | **defect** (RC7-E3-1) | E3. The catalog has zero rows; only the refusals ran. Content ruling. |
| A05 | Configured placement | covered | not re-run | R3b credit stands. |
| A06 | 36/80-line specialized FF&E work | weak | weak | E6. Stale-save recovery is fixed (RC7-E6-3) and passes (E6 r5/r6). COM/labor/alternate/allowance/issued-value not run. |
| A07 | 500/2,000-line scale | weak | not verified in RC-7 | Not an RC-7 lane. RC-6 records the 2,000-line profile passing. |
| A08 | Asset provenance; private assets | weak | weak | E6. Only the plan-PDF reader, which repeats R3b's credit. |
| A09 | Frozen issues; holdings | weak | weak | E6. No status progression. |
| A10 | Selection decisions bound to editions | weak | weak | [E5](rc7-e5.md): not attempted. E1 selection race has no edition id. |
| A11 | Release holds; truthful ETA | weak | weak | E5: not attempted. |
| A12 | Grouped orders, receipts, claims | weak | weak | E5: a retry on a legacy-origin project only. E1: the overlapping PO race is covered. |
| A13 | Contact/account/consent distinctions | weak | weak | E6. Maker roster vs. job party is covered; consent, authority and work copy were not run. |
| A14 | Subject/audience; uncertain send | weak | weak | E3. A five-audience placeholder only; the `recipient_kind` mapping question is open. |
| A15 | Field provenance; review without completion | weak | **defect** (RC7-E3-2) | E3. Field write and retry are covered; the room label is fixed (RC7-E3-3). Typed print, scope and next owner fail. |
| A16 | Cabinet package; designer-detail route | weak | weak | [E4](rc7-e4.md). Sample, appliance and site facts are opaque JSON. Maker verification identity was not proven. |
| A17 | GC-bought cabinetry, no studio commerce | weak | weak | E4. The lifecycle with 0 POs, 0 studio purchases and 0 invoices is covered. Estimate acceptance, release and paid closeout were not run. |
| A18 | Substitution impacts; partial holds | weak | weak | E4. Readiness ≠ instruction and receipt ≠ acceptance are covered; RC7-E4-1 is fixed (00900). Impact approval and recipient acknowledgement were not enacted. |
| A19 | Time rates, concurrent claim, void | weak | **covered** | E5. Chromium 2/2 and WebKit 2/2; merged gate 2/2. A backdated-rate entry was not tested. |
| A20 | Scoped acceptance, signers, channels | weak | weak | [E2](rc7-e2.md), [E1](rc7-e1.md).<br>Covered: edition and policy, one-of-two pending, supersession, V22, the client-portal response, paper intake.<br>Fixed, now normal tests: signer replacement (RC7-e2-1) and the paper mismatch (RC7-e2-2).<br>Weak: rejection (OBS-2 ruling), iOS response.<br><<PENDING: E2 final run counts for the flipped tests>> |
| A21 | Service shapes; distinct closures | weak | weak | E2. Full, design-only and client-buy shapes, financial-hold separation and `close_project` semantics are covered. GC trade acceptance was not run. |
| A22 | No acceptance by silence; conditional | weak | **covered** | E2. All four clauses covered. |
| A23 | Edition-bound care; post-close | weak | weak | E2. No purchase or warranty records; post-close edits only partly run. |
| A24 | Preserved capabilities | weak, pending | not re-run in RC-7 | RC-5 walk: 44 present, 6 moved, 0 missing, 7 not verified. |
| X01 | Distinct failure states | weak | weak | E6. The role-read defect (RC7-E6-1) is fixed as fail-open (§6 h). The rest of the failure matrix was not run. |
| X02 | Actor matrix: data, RPC, bytes, exports | weak | weak | E1. The SQL reader/object layer and local Storage byte ACL are covered. The mutation matrix is weak (SQLSTATE only). HTTP exports were not run. RC7-E1-1 is open. |
| X03 | Concurrency | weak | weak | E1, E5, E6. Covered races: C4 relink/respond, invoice claim, overlapping PO, print same key, selection choice, C6 completion, FF&E stale save. The full required set was not run. |
| X04 | Visual coherence | weak | **pending E8H final run**; provisional: covered for the named surfaces | [E8](rc7-e8.md). Studio cover, job paper, cabinetry and the activated acceptance/care chapter were compared. Books and the dense sheet were not re-compared. |
| X05 | WCAG 2.2 AA, screen reader | weak | **pending E8H final run**; provisional: weak | E8. Two keyboard-only processes pass in both engines. axe found 0 critical. RC7-E8-1 and -2 are fixed after the gate. No screen reader. |
| X06 | Widths, zoom, content bounds | weak | **pending E8H final run**; provisional: covered at 1280 @ 200% (emulated) | E8. 0 clipped on 5 surfaces. 390 @ 200% clips 6–7 controls (RC7-E8-3, below the WCAG floor). |
| X07 | Scroll CLS, bundles, load targets | weak | **pending E8H final run**; provisional: weak | E8.<br>Covered: settled-scroll CLS 0 (paced and flung); LCP ≤ 2.5 s; request capture repaired.<br>Fixed: cold-load CLS (RC7-E8-4).<br>Not measured: interaction latency, percentiles, bundles.<br>Open: the rail-nav bounce (§4).<br><<PENDING: E8H final CLS/LCP numbers>> |
| X08 | Consumer compatibility | weak | weak (web and iOS covered; Field weak) | [E7](rc7-e7.md). The older approval parser ran over 20 recorded lists; iOS decoders 2,813 tests. RC7-e7-1 is fixed (00901). The Field (X08e) test rebuilds its decode from dictionaries. |
| X09 | Mutation integrity | weak | weak | E1. Response, completion and paper retries plus hashes are covered. No cross-key conflicts or invalidation. |
| X10 | Rollout, replay, renderers | weak, pending | weak | RC-5 populated rehearsal through 00895. 00900–00902 replayed only on fresh stacks (merged gate), never on a populated one. |

Totals now:
- covered: 4 (A03, A19, A22, plus A05 carried);
- covered provisionally, pending E8H: 2 (X04, X06);
- defect: 2 (A04, A15);
- not re-run: 2 (A07, A24);
- weak: the remaining 24.

## Defects found and fixed in RC-7

| ID | Severity | Summary | Fix | Verified / review |
|---|---|---|---|---|
| RC7-E6-1 | P1 | A failed `user_roles` read sent a signed-in designer to `/unauthorized`. | `28e9e624d` (middleware fails open on `{ error }`, as it already did on a throw) | Reproducer enabled (`cb90e7d21`); merged gate E6 r5/r6 12/12. Review verdict not recorded in the repo. |
| RC7-E6-2 | P2 | Return from a job opened from Orders lost the ledger row, scroll and focus. | `e5fba0bb3`, plus review fix `2116982a4` (vendor, sub-page and thread returns) | Merged gate E6 r5/r6 12/12. |
| RC7-E6-3 | P2 | A stale Finish save showed "Refresh before saving", lost the peer value and dropped the retry. | `7cd0f061b`; then review `ab617b618` and reworks `a45b55b05`, `45f903be5`, `937ed121b`, `63f978a02` | Merged gate E6 r5/r6 12/12, after RC7-GATE-2. Workbench and image-clear debt remain (§6 g). |
| RC7-E4-1 | HIGH (00900 header) | A verified installation made a held or uninstructed fulfilment terminal `installed`. | 00900 (`95af3b12a`) | `external_install_hold_guard` 31/31; E4 4/4 ×2 in the merged gate. |
| RC7-e7-1 | MEDIUM | An older client page showed a C5 external line as a $0 studio piece. | 00901 (`ba45b1c86`); `externalSelections` key; client reader in `commercial-documents.ts` | Known-defect test enabled (`d3107a4cd`); payload re-export identical apart from the API port; client jest 104/104. |
| RC7-e2-1 | MEDIUM | The Replace form found no household on composed jobs (`client_profile_id` vs `client_id`). | `1028ea50c` | Codex confirmed the root cause. Flipped to a normal test (`e0a4c46c8`); E2 r1 18/18. <<PENDING: E2 final run>> |
| RC7-e2-2 | MEDIUM–HIGH | PostgREST 14.5 retried a deterministic 40001 forever, so the call hit a 60 s 504 instead of `stale_scope`. | `59d35b07d` (19 raises in 00886–00899 → PT409); `7286479bd` (00868–00883 classified); `f6870be8f` (replayed earlier bodies) | `fix2_stale_refusal_sqlstate` 28 PASS. Flipped test asserts `{409, PT409, stale_scope}`. FIX2 then classified the Strata-live raises: 37 PT409, 7 XX000, 2 transient (§6 i). |
| RC7-E3-3 | MEDIUM | Margin notes showed raw room/capture/print UUIDs as link names. | `4684cca74`, `f9e2c941d`, 00902 | Flipped (`e0a4c46c8`); E3 r1/r2 10 passed. RC7-GATE-1 fixed the test. |
| FIX3 | — (pre-existing in 00869) | `create_service_addendum` took locks in an order that could deadlock (40P01) against `reconcile_scope_edition`. | `71c838378`: project `FOR KEY SHARE` first; test `dc7d270c1`; contract `cb9510b1b` | `fix3_addendum_lock_order` 1/1 ("project first, no 40P01"); scope suites green. Found by Codex. |
| RC7-E8-1 | MEDIUM | Cancel on the resolve-condition form dropped focus to `<body>`. | `3d643ab1f`, plus review follow-up `46fb4d68a` | Review follow-up: Cancel returns focus to the opener. After a successful resolve or revoke, focus goes to the "Studio service" heading. <<PENDING: E8H final run>> |
| RC7-E8-2 | MEDIUM | Paper text contrast below 4.5:1 (aged-oak, sage, terracotta-ink pairs). | `3d643ab1f`, plus review follow-up `46fb4d68a` | Review follow-up: further token swaps in `care-band.tsx`, `phase-section.tsx` and `ghost-add-line.tsx`, plus `contrast.test.ts` cases. <<PENDING: E8H axe counts>> |
| RC7-E8-4 | MEDIUM | Job paper cold-load CLS was 1.16–1.17. | `23879cb5c` (whole-paper hold), superseded by progressive reveal `15ea22fb1`; `750731bc4` after Codex review (reveal before landing scrolls; bounded sampler) | CLS 1.16 → 0.04. WebKit LCP kept at 2.2–2.3 s. <<PENDING: E8H final CLS/LCP numbers>> |
| RC7-GATE-1 | low (test) | The `note_context_labels` withheld case was unreachable (co-member could see the capture). | `b62f0b1c7` | Exits 0; 00902 unchanged. |
| RC7-GATE-2 | medium (test) | The E6 A06 spec had a strict-mode locator, and a blocked event loop miscounted PATCHes. | `882b52b22` | Diagnostic: exactly 2 PATCHes (406, then 200), no replay. E6 r5/r6 12/12. |

**Rejected: FIX6, hydration gating for OBS-1.** It would have made "Review and send" inert until hydration. The premise was false:
- The miss's "active element" text `(self.__next_s=…` is the start of `<body>`'s textContent. It is not evidence of a pre-hydration tap, and WebKit doesn't focus clicked buttons.
- Traced runs show the tap landing on a hydrated button while the arrival landing scroll moves it (merged gate, OBS-1 addendum).

## Open defects and observations

| ID | Severity / confidence | What | State |
|---|---|---|---|
| RC7-E1-1 | low / medium-high | A household signer of an earlier request (r1/r2) reads the C6 client projection of a completion attached to r4. Only client-projection fields are exposed. | A ready row filter for `00895:55` passed under a scratch apply; reproducer `defect_e1_c6_audience.sql` exits 3 as recorded. Ruling a. |
| RC7-E3-1 | medium / high | `service_arrangements` has no rows, by design (00868:125-126). | Content ruling b. |
| RC7-E3-2 | medium / high | `margin_notes` has no scope or next-owner column. The Field writer sends no `subject_kind`/`subject_id`. | Ruling c. The fixme must be rewritten through the product path after the ruling. |
| RC7-E3-5 | medium / high | ⌘K cold start creates a second `design_services` draft for a household with an open Direction. If that one executes, the lineage forks. | Reproduced with DB readback (2 drafts). Ruling d. |
| RC7-E8-3 | low / high | At 390 @ 200% (195 CSS px), 6–7 action controls are hidden past the right edge. | Below the WCAG 1.4.10 floor of 320. Unfixed. |
| OBS-1 | low–medium | The WebKit first tap on "Review and send" missed in 2 of 32 taps. The likely cause is the landing scroll racing the tap (`doc/[id]/page.tsx:1724-1738`; `arrival-mount.tsx:126,130`). | Test fix: wait for arrival and a still scroll. Product question f. |
| OBS-2 | low–medium / high | A returned request's manifest can be re-requested unchanged; `create_service_acceptance_request` has no check. | Ruling e. |
| OBS-3 | low / high | `signer_not_active`, `request_not_open` and `scope_edition_not_active` (SQLSTATE 55000) reach the client as HTTP 500. | Product smell. Exact `{status, code, message}` asserted, so a mapping change shows. |
| Job F (E2) | not established | `@rc7-e2-completion job F` failed 4 of 4 on WebKit at `5386a159e` in the instrumented OBS-1 runs. It passed in Phase B r1/r3 at `c6434e3dd`. | <<PENDING: job F result at the final tip / bisect>> |
| Rail-nav bounce | — | On long papers, the rail navigation bounce gives cold-load CLS 0.12–0.17. | Open. <<PENDING: E8H number>> |
| O-3 readiness | known / by design | The job paper makes 80 `get_project_ffe_readiness` RPCs for 80 lines (one per line). The batch transport is inactive (00880). The count scales with lines. | Recorded. |
| O-1, O-2 (E8) | low | O-1: a focused line button is 3 of 5 covered by the sticky job head (2.4.12 AAA). O-2: chrome takes 48–52% of the height at 200%. | Recorded. |
| C03 | — | `phone-line-editor` was intermittent in E4 (54/61). Waits were raised to 60 s (`f755b1869`). | Merged gate 18/18 ×2. |

## Harness debt

- **54322 fallbacks.** `e2e/helpers/psql.ts:21`, `e2e/round8/global-setup.ts:11` and `global-teardown.ts:8` fall back to the shared stack.
  - The round-8 configs now throw when `SUPABASE_DB_URL` is unset.
  - `helpers/psql.ts` keeps its fallback for the nightly suites.
- **dblink DSNs.** 00845 and 00848 hard-code `port=54322`; the gate ran port-swapped scratch copies. 00848 also embeds an unused 54321 storage URL.
- **C03 timeouts.** The 60 s post-navigation waits (`phone-line-editor.spec.ts:158/:381/:386`) hide a first-paint slowdown rather than explain it.
- **Production Sanity reads.** The help-system hook fetches production Sanity (`kv3qrinl`) from the browser in every e2e run that does not block it. Only E2 blocks it.
- **edge_api coverage.** No RC gate from RC-1 to RC-6 ran `supabase/tests/edge_api/`. RC-7 ran it once, as an orchestrator addition outside the gate runner.
- **`public_sd_hardening_contract_test.sql` is red on main.**
  - It has been red since 2026-10-19 (00835, `cd8b1378b`).
  - It was re-pinned on `r8-evidence` in `d6fe9e12f`.
  - Main needs only the two 00835 pins for `_execute_furnishings_authorization_{authorized,on_paper_authorized}`. The other values in `d6fe9e12f` are round-8 bodies.
- **Hardening-test orphans.** The test's dblink fixtures are deleted in replica mode, leaving FK orphans (11 `user_roles`, 7 `organization_members`, 1 `invoice_links`). A later `owned_seed` then fails.
- **E8 activation fixture.** It hard-codes `patina-rc7-e8`; the gate used a scratch copy.
- **E8 visual captures.** The E8 visual spec overwrites the committed `evidence/rc/visual-rc7/*` captures (and `next-env.d.ts`).
- **Port blocks.** Blocks ≥656 overflow: DB is `B22`, and 65622 > 65535 (`briefs/rc7-common.md` port pattern).
- **Codex context size.** Codex agents hit HTTP 413 on large contexts.
- Also recorded:
  - E2 `global-teardown.ts` cannot purge F01 after an executed agreement (lanes clean up their own jobs);
  - `evidence-folio.spec.ts` checks the hostname only;
  - designer ESLint ignores `e2e/`;
  - `platform_acl_compatibility_test.sql:323` stays red (SQ-459, not round 8);
  - pre-existing swiftlint reds: Patina service-acceptance files, and Capture `SupabaseSiteScanService.swift`.

## Questions for Kody

**a. RC7-E1-1: who is the C6 client audience?**
- Options:
  1. Signers of the contributing request only, via the row filter in `00895:55` (gate unchanged).
  2. Household signers of any sent request on the project (today's behaviour).
- **Recommendation: 1.** The fix is ready and the reproducer is written. Do not tighten the gate instead: that would refuse current signers before any completion exists.

**b. RC7-E3-1: which arrangements ship?**
- Options:
  1. Kody names the launch arrangements; a reviewed data migration loads them before C2 activation.
  2. Activate C2 with an empty catalog: no arrangement can be applied, and A04 stays unprovable.
  3. Defer C2 activation.
- **Recommendation: 1.** Do not import the synthetic test arrangement as product data.

**c. RC7-E3-2: Field typed subject, scope and next owner.**
- Options:
  1. Fund the Field writer to send `subject_kind`/`subject_id` (the schema has them since 00874). Rule separately whether scope and next owner need new `margin_notes` columns.
  2. Narrow A15 to room, author and capture.
  3. Defer, leaving A15 a defect.
- **Recommendation: 1 for the writer.** Defer the new columns. A15 is not a C4/C6 criterion.

**d. RC7-E3-5: ⌘K cold start when a household already has an open Direction.**
- Options:
  1. Offer "Continue the existing Direction" or "Start a separate agreement" (what the reproducer expects).
  2. Block the second draft.
  3. Accept the fork.
- **Recommendation: 1.**

**e. OBS-2: can a returned acceptance request be re-requested on the same manifest?**
- Options:
  1. Yes. A fresh send-time freeze counts as new evidence.
  2. No. Refuse a new request on a returned request's unchanged manifest (a migration plus a refusal test).
- **Recommendation: 2.** It matches A20's "rejection … requires the correct new evidence".

**f. OBS-1: should the landing scroll yield to a scroll that happens after arrival?**
- Options:
  1. Yield to any scroll after arrival, programmatic included.
  2. Keep today's rule: yield to wheel, touchmove and scroll keys only.
- **Recommendation: 1.** A reader who has already moved should not be moved. The test fix stands either way.

**g. Spec-pane debt left by the RC7-E6-3 fix.**
- The debt:
  - the spec-book workbench (`spec-book-workspace.tsx`) still says "Refresh before saving" and does not refetch on conflict;
  - a conflicting chosen image stays as a kept draft, with no control to clear it.
- Options:
  1. A small fix lane before the renderer cohort widens.
  2. Record as debt.
- **Recommendation: 1.**

**h. X01: the middleware role read fails open.**
- The middleware is a shell gate, not an authority; RLS and the route handlers are the data boundary. `28e9e624d` makes `{ error }` match the existing throw and missing-key paths.
- **Recommendation: confirm** it as the accepted contract.

**i. Production 40001 inventory ([`rc7-fix2-40001-inventory.md`](rc7-fix2-40001-inventory.md)).**
- Strata's PostgREST 14.x retries any 40001 without limit.
- **Scope:** 46 retryable raises in 31 Strata-live functions. 37 are deterministic, so they hang and then 504.
- **Tier 1 (homeowner-facing):** `_respond_project_approval_checked`, `_apply_client_decision_authorized` and `approve_client_signoff`.
- **Proposed codes:** rows 1–37 → PT409; rows 38–44 → XX000; rows 45–46 keep 40001, with a comment.
- **`sms-inbound`:** the regexes at `pipeline.ts:2156` and `:3527` need PT409 added, for rows 7–9 only; then redeploy the function.
- **Timing:** a new migration is numbered after 00902, and `db push` cannot skip a file (ROLLOUT §6.1). It therefore ships with or after the round-8 push.
- Options:
  1. A funded forward migration (00903) in the round-8 push.
  2. Tier 1 only.
  3. Defer.
- **Recommendation: 1**, with the test fixtures and doc comments listed in the inventory.

**j. Add a `patina-db-migrations` skill row: raise deterministic refusals as PT409, never 40001.**
- Today the skill has no such row.
- **Recommendation: approve.**

**k. Ship chain items.**
- 00900–00902 must ship together (a ROLLOUT note).
- ROLLOUT §6.1 still says 33 files (00867–00899). With RC-7 it is 36. The lock behaviour of 00900–00902 on `auth.*`/`storage.*` was not measured in RC-7.
- The earlier owed items are resolved: "00892 standalone?" by K7 (hold for the round-8 ship) and "household consent" by K6 (the studio's assertion is enough).
- Still owed at ship time: the `lock_timeout` mechanism (ROLLOUT §6.2).
- **Recommendation:** update ROLLOUT §6 to 36 files with the ship-together note, and measure the locks of 00900–00902 before the ship request.

**l. Fix the red hardening test on main?**
- **Recommendation: yes.** It is a test-only change re-pinning the two 00835 hashes on main. The alternative is to leave main red until round 8 merges.

## Not verified

- **Screen reader:** no VoiceOver or NVDA pass.
- **Real devices:** no physical-device or VoiceOver walk. The iOS response, paper and care surfaces were not run; `webkit-iphone` is a browser emulation.
- **Zoom:** no real browser zoom. 200% was emulated by halving the viewport at DSF 2. 320 px reflow under zoom was not measured.
- **Interaction latency:** ≤200 ms and percentiles were not measured. No representative profile is agreed (WP-00). All performance numbers come from unthrottled localhost `next dev`.
- **Bundle budgets:** not re-run in RC-7 (last pass: RC-6 G5).
- **Production:** Strata, PostHog and Cloudflare were untouched. No row of the 40001 inventory was reproduced on Strata.
- **Populated replay of 00900–00902**, and their lock measurement.
- **Cross-provider review verdicts:** for most fix commits, the final verdict is not recorded in the repo (see the defect table).

## Ship chain reminder

- **Runbook:** [ROLLOUT.md §6](../../ROLLOUT.md).
- **Nothing is deployed.** Strata's head is still 00866.
- **Before any ship:**
  1. Merge RC-7 (`r8-evidence`) into `redesign/designer-portal-round8`.
  2. Update §6 for 00900–00902.
  3. Get Kody's separate "ship".
- RC-7 changed no edge-function source. It changed the designer portal, the client portal (`commercial-documents.ts`), `@patina/supabase` and the migrations.
