# RC-7: evidence wave synthesis and verdict

US-52 Room Proof 08, step RC-7 (Kody's K8 ruling: an evidence wave before any ship). Written on 2026-10-29. Synthesis base `74a324b26` on `r8-evidence` (RC-6 tip `0088093b7`; 125 commits). The program branch `redesign/designer-portal-round8` is still at `0088093b7`: RC-7 is not merged into it yet.

Updated on 2026-10-30 for RC-8 (Kody's rulings K9–K20) and the final E8H numbers, at `977f734f2` on `r8-evidence`. The RC-7 sections below keep their original wording where RC-8 did not change them.

## Verdict

**Still "ship inactive, once Kody asks to ship". C4/C6 activation is still blocked.**

- **RC-8.** Fix lanes implemented K9–K17 and K19–K20 (see "RC-8 fix lanes" below). K18 is pending Kody's skill edit: the write to `.agents/skills/patina-db-migrations/SKILL.md` was permission-denied. The FIX10 lane (K14, K15, RC7-E8-5) still awaits its Codex re-check and merge. The verdict does not change: ship inactive on Kody's "ship"; C2/C4/C6 activation stays gated.
- **Ship inactive.** RC-7 found and fixed 12 product defects (3 of them through migrations 00900–00902, which ship inactive) and 2 test defects. The merged gate at `00902` passes: SQL pass 2 is 97 of 99 rows exit 0, plus the expected RC7-E1-1 reproducer (exit 3) and the owned seed row (`0/0`). Every lane's browser specs pass on chromium and webkit-iphone, apart from two known gaps:
  - **E2.** Phase B r2/r3 lost WebKit first taps (OBS-1). After the test fix `f484bafd3`, the unmodified runner passed 18/18 on both projects, twice, on fresh stacks (12/12 WebKit first taps). Job F is green: the 4/4 WebKit failure was a diagnostic-harness artifact (bisect at `74a22bd5a`, `5386a159e`, `74a324b26`: 9 passed each). See [merged gate](rc7-merged-gate.md#job-f-bisect-and-the-obs-1-test-fix).
  - **E8.** The E8 fixes (RC7-E8-1, -2, -4) landed after merged-gate Phase B. RC-8 re-ran E8 (E8H) on the merged tree `06fc86aea`, which carries FIX13: chromium 18 passed, 4 skipped, 0 failed (×2); webkit-iphone 15 passed, 7 skipped, 0 failed (×2). The skips are the `fixme`s RC7-E8-3, -5, -6, -7, plus WebKit capability skips (no `layout-shift`). The final zoom and a11y re-check: 11 passed, 3 skipped, 0 failed, ×2 on each engine. Details in [rc7-e8.md](rc7-e8.md) §11–12.
- **Activation is not unblocked.** RC-7 moved 3 criteria to covered (A03, A19, A22) and 2 more for a named scope (X04, X06). RC-8 changed no rating beyond A04 and the E8H rows (see the ratings table), so 25 of 34 remain weak. What still gates C4/C6:
  1. **Kody's rulings:** K9–K20 answered the old questions a–l (see "Questions for Kody"). Still open: the 00905 hold, the K10 content review of the four draft arrangements, O-5 (focus-indicator contrast), the 00867 ship ruling and the `lock_timeout` mechanism.
  2. **A human screen-reader pass.** Not done (X05).
  3. **A device or VoiceOver walk** of the iOS acceptance and care surfaces. The iOS response path (A20) was never run; only the decoders ran (X08d).
  4. **Production data and activation migrations:**
     - the `service_arrangements` catalog is a draft (00905, K10): four arrangements, no fees, unreviewed by Kody. C2 stays inactive;
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
| A04 | Every arrangement; repeat safely | weak | weak (was **defect**, RC7-E3-1) | E3. RC-8 FIX9 (00905) loads four draft arrangements. Apply and replay are covered: E3 A04 2/2 ×2 per project; `arrangement_already_applied` leaves phases unchanged; C2 stays inactive. The content is unreviewed and is a draft (K10 table below). |
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
| A20 | Scoped acceptance, signers, channels | weak | weak | [E2](rc7-e2.md), [E1](rc7-e1.md).<br>Covered: edition and policy, one-of-two pending, supersession, V22, the client-portal response, paper intake.<br>Fixed, now normal tests: signer replacement (RC7-e2-1) and the paper mismatch (RC7-e2-2).<br>Weak: rejection (OBS-2 ruling), iOS response.<br>Flipped tests pass: E2 18/18 ×2 at `f484bafd3`. |
| A21 | Service shapes; distinct closures | weak | weak | E2. Full, design-only and client-buy shapes, financial-hold separation and `close_project` semantics are covered. GC trade acceptance was not run. |
| A22 | No acceptance by silence; conditional | weak | **covered** | E2. All four clauses covered. |
| A23 | Edition-bound care; post-close | weak | weak | E2. No purchase or warranty records; post-close edits only partly run. |
| A24 | Preserved capabilities | weak, pending | not re-run in RC-7 | RC-5 walk: 44 present, 6 moved, 0 missing, 7 not verified. |
| X01 | Distinct failure states | weak | weak | E6. The role-read defect (RC7-E6-1) is fixed as fail-open (§6 h). The rest of the failure matrix was not run. |
| X02 | Actor matrix: data, RPC, bytes, exports | weak | weak | E1. The SQL reader/object layer and local Storage byte ACL are covered. The mutation matrix is weak (SQLSTATE only). HTTP exports were not run. RC7-E1-1 is open. |
| X03 | Concurrency | weak | weak | E1, E5, E6. Covered races: C4 relink/respond, invoice claim, overlapping PO, print same key, selection choice, C6 completion, FF&E stale save. The full required set was not run. |
| X04 | Visual coherence | weak | **covered** for the named surfaces | [E8](rc7-e8.md). Studio cover, job paper, cabinetry and the activated acceptance/care chapter were compared. The facts were re-asserted at the FIX4/FIX5 tip, but the committed images predate it. Books and the dense sheet were not re-compared. |
| X05 | WCAG 2.2 AA, screen reader | weak | weak | E8 (E8H). Two keyboard-only processes pass in both engines; the focus indicator is asserted at every Tab stop (568–574 stops per run). axe: 0 critical, and 0 color-contrast violations on all six surfaces after FIX13. Axe `incomplete` nodes are logged, not asserted (chromium 1/5/8/5/0/0, webkit 0/4/7/3/0/0). Acceptance by keyboard covers refusal and cancel only. Open: RC7-E8-6 (no focus indicator), O-5 (border-only focus at 2.10–2.33:1). No screen reader. |
| X06 | Widths, zoom, content bounds | weak | **covered** at 1280 @ 200% (emulated) | E8 (E8H). 0 clipped on 5 surfaces, with a census floor and a Tab-reach assertion on every surface. 390 @ 200% clips 8–9 controls (RC7-E8-3, below the WCAG floor). RC7-E8-7: forward Tab never reaches the lens to-top button. Real browser zoom and 320 px reflow were not run. |
| X07 | Scroll CLS, bundles, load targets | weak | weak | E8 (E8H), FIX13, FIX10.<br>Covered: settled-scroll CLS 0 (paced, chromium; flung is recorded); LCP ≤ 2.5 s asserted on chromium (job 1,860 / 1,880 ms in the E8H runs); request capture repaired.<br>Fixed, first visit (RC7-E8-4, FIX13): chromium CLS 0.0385 / 0.0385; LCP chromium 1,796 / 1,732 ms, WebKit 1,610 / 1,494 ms.<br>Fixed, returning reader (RC7-E8-5, FIX10): CLS 1.41 / 1.45 → 0.0385 / 0.0482 (chromium ×2). <<PENDING: FIX10 re-check + merge>><br>Not measured: interaction latency, percentiles, bundles, WebKit CLS (no `layout-shift` API), the rail-nav bounce (not re-measured). The profile is unthrottled localhost `next dev`. |
| X08 | Consumer compatibility | weak | weak (web and iOS covered; Field weak) | [E7](rc7-e7.md). The older approval parser ran over 20 recorded lists; iOS decoders 2,813 tests. RC7-e7-1 is fixed (00901). The Field (X08e) test rebuilds its decode from dictionaries. |
| X09 | Mutation integrity | weak | weak | E1. Response, completion and paper retries plus hashes are covered. No cross-key conflicts or invalidation. |
| X10 | Rollout, replay, renderers | weak, pending | weak | RC-5 populated rehearsal through 00895. 00900–00902 replayed only on fresh stacks (merged gate), never on a populated one. |

Totals now:
- covered: 4 (A03, A19, A22, plus A05 carried);
- covered for a named scope: 2 (X04, X06);
- defect: 1 (A15);
- not re-run: 2 (A07, A24);
- weak: the remaining 25 (A04 moved here from defect).

## Defects found and fixed in RC-7

| ID | Severity | Summary | Fix | Verified / review |
|---|---|---|---|---|
| RC7-E6-1 | P1 | A failed `user_roles` read sent a signed-in designer to `/unauthorized`. | `28e9e624d` (middleware fails open on `{ error }`, as it already did on a throw) | Reproducer enabled (`cb90e7d21`); merged gate E6 r5/r6 12/12. Review verdict not recorded in the repo. |
| RC7-E6-2 | P2 | Return from a job opened from Orders lost the ledger row, scroll and focus. | `e5fba0bb3`, plus review fix `2116982a4` (vendor, sub-page and thread returns) | Merged gate E6 r5/r6 12/12. |
| RC7-E6-3 | P2 | A stale Finish save showed "Refresh before saving", lost the peer value and dropped the retry. | `7cd0f061b`; then review `ab617b618` and reworks `a45b55b05`, `45f903be5`, `937ed121b`, `63f978a02` | Merged gate E6 r5/r6 12/12, after RC7-GATE-2. Workbench and image-clear debt remain (§6 g). |
| RC7-E4-1 | HIGH (00900 header) | A verified installation made a held or uninstructed fulfilment terminal `installed`. | 00900 (`95af3b12a`) | `external_install_hold_guard` 31/31; E4 4/4 ×2 in the merged gate. |
| RC7-e7-1 | MEDIUM | An older client page showed a C5 external line as a $0 studio piece. | 00901 (`ba45b1c86`); `externalSelections` key; client reader in `commercial-documents.ts` | Known-defect test enabled (`d3107a4cd`); payload re-export identical apart from the API port; client jest 104/104. |
| RC7-e2-1 | MEDIUM | The Replace form found no household on composed jobs (`client_profile_id` vs `client_id`). | `1028ea50c` | Codex confirmed the root cause. Flipped to a normal test (`e0a4c46c8`); E2 r1 18/18; 18/18 ×2 at `f484bafd3`. |
| RC7-e2-2 | MEDIUM–HIGH | PostgREST 14.5 retried a deterministic 40001 forever, so the call hit a 60 s 504 instead of `stale_scope`. | `59d35b07d` (19 raises in 00886–00899 → PT409); `7286479bd` (00868–00883 classified); `f6870be8f` (replayed earlier bodies) | `fix2_stale_refusal_sqlstate` 28 PASS. Flipped test asserts `{409, PT409, stale_scope}`. FIX2 then classified the Strata-live raises: 37 PT409, 7 XX000, 2 transient (§6 i). |
| RC7-E3-3 | MEDIUM | Margin notes showed raw room/capture/print UUIDs as link names. | `4684cca74`, `f9e2c941d`, 00902 | Flipped (`e0a4c46c8`); E3 r1/r2 10 passed. RC7-GATE-1 fixed the test. |
| FIX3 | — (pre-existing in 00869) | `create_service_addendum` took locks in an order that could deadlock (40P01) against `reconcile_scope_edition`. | `71c838378`: project `FOR KEY SHARE` first; test `dc7d270c1`; contract `cb9510b1b` | `fix3_addendum_lock_order` 1/1 ("project first, no 40P01"); scope suites green. Found by Codex. |
| RC7-E8-1 | MEDIUM | Cancel on the resolve-condition form dropped focus to `<body>`. | `3d643ab1f`, plus review follow-up `46fb4d68a` | Review follow-up: Cancel returns focus to the opener. After a successful resolve or revoke, focus goes to the "Studio service" heading. E8H asserts `toBeFocused` on "Resolve this condition" after Cancel, in the refusal path and in the RC7-E8-1 test, in both engines. Not verified: the same pattern on the revoke form. |
| RC7-E8-2 | MEDIUM | Paper text contrast below 4.5:1 (aged-oak, sage, terracotta-ink pairs). | `3d643ab1f`, plus review follow-up `46fb4d68a` | Review follow-up: further token swaps in `care-band.tsx`, `phase-section.tsx` and `ghost-add-line.tsx`, plus `contrast.test.ts` cases. **FIX13** (RC-8; Codex built, Opus reviewed, 2 rounds): `7035f0043`, `e517fea0b`, `b4463b3cd`; merge `9bc16def1`. The swaps apply to both renderers (orchestrator ruling: AA contrast; `globals.css:16-17` sanctions quiet ink; FIX4 is the precedent). Axe color-contrast violations: 0 on all six surfaces, both engines, both runs. Axe `incomplete`: chromium 1/5/8/5/0/0, webkit 0/4/7/3/0/0, unreviewed. Jest 206/206 (10 suites). Left as is: aged-oak at `account-band.tsx:216` and `proposal-watch.tsx:255`. |
| RC7-E8-4 | MEDIUM | Job paper cold-load CLS was 1.16–1.17. | `23879cb5c` (whole-paper hold), superseded by progressive reveal `15ea22fb1`; `750731bc4` after Codex review (reveal before landing scrolls; bounded sampler); `f52201a12` after Codex re-review (26 scroll call sites in 17 components reveal first through `lib/document/paper-reveal.ts`; hash and restored-position reveal on mount; robust source-scan test). Codex round 3: accept. Low debt: no legacy-paper no-op test for the helpers. Residual: find-in-page or a screen-reader virtual cursor can reach in-view content that is still held, bounded by the 3.5 s failsafe. **FIX13** (RC-8; same lane and merge as RC7-E8-2): `e828ed666`, `bb9b5b1b6`, `b4463b3cd`. The PressBand reserves space only while loading and only in round 8; proposal and brief papers have no reservation. | CLS 1.16 → 0.04. WebKit LCP kept at 2.2–2.3 s. After FIX13, first-visit CLS on chromium is 0.0385 / 0.0385. LCP is 1,796 / 1,732 ms (chromium) and 1,610 / 1,494 ms (WebKit). WebKit CLS is unavailable. Jest 206/206, then 79/79. |
| RC7-GATE-1 | low (test) | The `note_context_labels` withheld case was unreachable (co-member could see the capture). | `b62f0b1c7` | Exits 0; 00902 unchanged. |
| RC7-GATE-2 | medium (test) | The E6 A06 spec had a strict-mode locator, and a blocked event loop miscounted PATCHes. | `882b52b22` | Diagnostic: exactly 2 PATCHes (406, then 200), no replay. E6 r5/r6 12/12. |

**Rejected: FIX6, hydration gating for OBS-1.** It would have made "Review and send" inert until hydration. The premise was false:
- The miss's "active element" text `(self.__next_s=…` is the start of `<body>`'s textContent. It is not evidence of a pre-hydration tap, and WebKit doesn't focus clicked buttons.
- Traced runs show the tap landing on a hydrated button while the arrival landing scroll moves it (merged gate, OBS-1 addendum).

## RC-8 fix lanes (Kody rulings K9–K20)

Kody's rulings are in `DECISIONS.md` (`036aac646`). The lane rules are in `briefs/rc8-fix-common.md` (`062ce1aeb`). Every lane had a cross-provider review: Codex reviewed Opus-built work and Opus reviewed Codex-built work. All merges below are into `r8-evidence`.

| Lane | Ruling | Built by / reviewed by | Commits | Merge | Result |
|---|---|---|---|---|---|
| FIX7 | K9, K11 | Opus / Codex | `d098d6931` (00903), `9e0a9f303`, `596b0a2e4` | `42678296e` | K9: the C6 audience is the contributing signers only, a row filter on the 00895 projection. K11: a re-request on an unchanged manifest raises PT409 `acceptance_rerequest_needs_new_evidence`. Matching is on the manifest hash across all closed or returned requests and deliberately ignores the scope edition; the Codex reviewer agreed. `e1_c6_audience.sql` exits 3 on the 00895 body and 0 with the fix. |
| FIX8 | K12 | Opus / Codex | `23024c7dd`, `78bd72955`, `7db880104` (00904) | `4582106e2` | 33 functions: 38 PT409, 7 XX000, 3 commented-transient 40001. `fix8_refusal_codes.sql` part 1b binds 48 message→code pairs, proven against swapped pairs. `sms-inbound` `pipeline.ts:2156/:3527` accepts PT409. |
| FIX9 | K10 | Codex (re-dispatched after a context overflow) / Opus | `a2c46d36d` (00905), `020a78f7d`, `b8d5d4f26`, `6077c0b7f`, `04307b49b` | `07e577382` | Four draft arrangements (table below). C2 stays inactive, asserted after 00905. The `arrangement_already_applied` refusal (23514) leaves phases unchanged. E3 A04 2/2 ×2 per project. |
| FIX10 | K14, K15, RC7-E8-5 | Opus / Codex | `cd7cc102b`, `3710c3f6c`, `f8c69add5`; review fixes `32c6b90d7`, `d68b533c6`, `2079e6341`, `ba6162cd2` (merge of `r8-evidence` into the lane branch), `d30e988aa`, `b10d4ebe2` | <<PENDING: FIX10 re-check + merge>> | K14: the ⌘K sheet offers Continue or Start separate when an open Direction exists. The open-Direction read is limited to the reader's own active studios, which closes the co-member leak. It uses the `DocSheet` primitive, and a stale lookup is ignored after close. K15: any scroll after the baseline cancels the landing for good. RC7-E8-5: `page.tsx` `scrollIntoRevealed` force-revealed the chapters above the target, and the landing skipped `forceFullThrough`. The fix waits on `whenRevealedThrough`, then forces and scrolls in a microtask. Returning-reader CLS: 1.41 / 1.45 → 0.0385 / 0.0482 (chromium ×2). The earlier 0.060 brief/kickoff shift is gone with FIX13; brief shifts are now ≤ 0.0031. Gates: type-check 0; jest 195 suites, 4246 passed; lint 0 errors; vitest 5/5; E3 lineage 8/8 ×2; E2 journey 18/18 (earlier, at `f8c69add5`). Residual: the 3.5 s `whenRevealedThrough` timeout lets the landing proceed while bodies are still loading. It is a fallback and did not fire. |
| FIX11 | K16 | Codex / Opus | `7a99a952e`, `543fe6f3c`, `c81a2b355` | `fa819cd40` | Spec-pane peer merge, re-alert on a newer peer value, `role=alert`, focusable Save, focus after "Discard my image change". Jest 104/104; E6 1/1 per project. |
| FIX12 | K13 | Codex / Opus (2 rounds) | `852f84aa2`, `06947fd30`, `82b9ef17d` | `764f3adf1` | The Field margin-note writer sends the subjects `project_room` and `field_capture`. It retries once without the subject on PGRST204 or a 00874 subject-guard 23514, and logs the note id plus the trigger code. Capture build passes; CaptureKit 928/928. Simulator only. Field builds carrying K13 ship only after 00874 is live on Strata. |
| FIX13 | RC7-E8-2, RC7-E8-4 | Codex / Opus (2 rounds) | `7035f0043`, `e828ed666`, `bb9b5b1b6`, `e517fea0b`, `b4463b3cd` | `9bc16def1` | Contrast token swaps apply to both renderers (orchestrator ruling). The PressBand reserves space only while loading and only in round 8. Chromium first-visit CLS 0.0385 / 0.0385. LCP: chromium 1,796 / 1,732 ms, WebKit 1,610 / 1,494 ms. Axe color-contrast violations 0; axe `incomplete` per surface 1/5/8/5/0/0 (chromium), 0/4/7/3/0/0 (webkit). Jest 206/206, then 79/79. |
| E8H | E8 observations as assertions | Opus / Codex (2 rounds) | `df56cf345`, `06fc86aea` (merge), `b02a53be7`, `a8060263c` | `6fdc4c9c1` | See [rc7-e8.md](rc7-e8.md) §12. Final re-check runs: chromium 11 passed / 3 skipped ×2; webkit-iphone 11 / 3 ×2 (zoom and a11y). Earlier full E8 runs: chromium 18 / 4 ×2; webkit-iphone 15 / 7 ×2. Census floor 71 at 390 @ 200% (the lens-band act is `display:none`; the duplicate in the fixed mobile bar is asserted present and focusable). H-1: axe now waits for running animations to settle (a terracotta-ink mid-fade frame read 4.11:1). |
| K19 | K19 | Sonnet (doc and measurement) | `977f734f2` | on `r8-evidence` | Populated lock gate for 00896–00905 ([rc8-k19-locks.md](rc8-k19-locks.md)): 569 tables, 25,181 rows. None locks `auth.*` or `storage.*`. 00899 holds an AccessExclusive lock on `service_acceptance_requests` (9.8 ms). 00902 holds one on the `margin_items` view (26.0 ms). 105.7 ms in-transaction in total; 0 errors; 0 lost rows. ROLLOUT §6 now reads 00867 plus 00868–00905, 39 files. |
| Seed | — | orchestrator | `ccaf673c1` | — | Regenerated `seed/00-legacy-grants.sql` for the 00902 `margin_items` grants. |
| main | K20 | orchestrator | `5cf85c0ec` (pushed to `origin/main`) | — | Re-pinned the two 00835 hashes. When main next merges into round 8, resolve those lines to the round-8 side (`d6fe9e12f`). |

K17 needed no code: the middleware fail-open is confirmed as the contract. K18 is pending (see Questions for Kody).

**K10 draft arrangements (00905).** Kody reviews these before C2 activation. No fees are set (`fee_cents = 0`). Responsibility slots run design / purchasing / payer / fabrication contract / installation.

| Key | Title | Phases (weeks) | Slots | Review flags |
|---|---|---|---|---|
| `patina_six` | The Patina Six | Consultation 1 → Schematic 3 → Design Dev 4 → Procurement & Orders 8 → Install & Styling 3 → Completion 1 (20) | studio ×5 | None recorded. |
| `design_only` | Design-Only | Concept 3 → Development 4 → Final Documentation 2 (9) | studio / client / client / none / client | None recorded. |
| `whole_home` | Whole Home Renovation | Programming & Discovery 3 → Schematic 5 → Design Dev 6 → Construction Docs 4 → Construction Admin 12 (30) | studio / studio / studio / other / gc | Labelled design and procurement, but it has no procurement or furnishing phase. Fabrication sits under `other`, which names no party. Furniture install is folded into the GC. |
| `fast_track` | Fast Track Refresh | Discovery+Concept 2 → Procurement+Install 4 (6) | studio / studio / studio / none / studio | The combined phases have no stage classification (00461). |

## Open defects and observations

| ID | Severity / confidence | What | State |
|---|---|---|---|
| RC7-E1-1 | low / medium-high | A household signer of an earlier request (r1/r2) reads the C6 client projection of a completion attached to r4. Only client-projection fields are exposed. | A ready row filter for `00895:55` passed under a scratch apply; reproducer `defect_e1_c6_audience.sql` exits 3 as recorded. Ruling a (K9). **Fixed by RC8-FIX7** (00903, merge `42678296e`): renamed `e1_c6_audience.sql`, inside the `e1_*.sql` gate; it exits 0. |
| RC7-E3-1 | medium / high | `service_arrangements` has no rows, by design (00868:125-126). | Ruling b (K10). 00905 (FIX9) loads four draft arrangements; Kody's content review is open and C2 stays inactive. |
| RC7-E3-2 | medium / high | `margin_notes` has no scope or next-owner column. The Field writer sends no `subject_kind`/`subject_id`. | Ruling c (K13). FIX12 (merge `764f3adf1`): the Field writer now sends the typed subject. Scope and next-owner columns are deferred. The fixme must still be rewritten through the product path. |
| RC7-E3-5 | medium / high | ⌘K cold start creates a second `design_services` draft for a household with an open Direction. If that one executes, the lineage forks. | Reproduced with DB readback (2 drafts). Ruling d (K14). Fixed by FIX10. <<PENDING: FIX10 re-check + merge>> |
| RC7-E8-3 | low / high | At 390 @ 200% (195 CSS px), 6–7 action controls are hidden past the right edge. | Below the WCAG 1.4.10 floor of 320. Unfixed. |
| RC7-E8-5 | medium / high | Job paper cold-load CLS for a returning reader was 1.34–1.42 (chromium). The landing force-revealed the chapters above it before their bodies resolved. | **Fixed by FIX10:** CLS 1.41 / 1.45 → 0.0385 / 0.0482 (chromium ×2). <<PENDING: FIX10 re-check + merge>> |
| RC7-E8-6 | medium (2.4.7 AA) / high | The schedule's "Name a phase" input has no focus indicator (`ghost-add-line.tsx:226`, `focus:outline-none`, no replacement). | Open. Strict `fixme`; the stop is allowlisted in the a11y walk. |
| RC7-E8-7 | low (2.1.1 A) / high | Forward Tab never reaches the lens to-top button: the band opens on Tab-scroll, and the button renders only while the band is closed (`lens-band.tsx:443/455`). | Open. Strict `fixme`; allowlisted in the zoom walk. |
| O-4 | low | WebKit shows "The read failed" when opening `/doc` directly after sign-in. | Unresolved. The hypothesis is a fetch aborted during navigation; it may be a harness artifact. |
| O-5 | medium (1.4.11, likely) | Several controls show focus only as a border-colour change at 2.10–2.33:1; 3:1 is needed. | Needs a ruling. Outside the gate. |
| Draft-proposal delete | pre-existing | A draft proposal can't be deleted once an arrangement has been applied: receipts and events are immutable (00868:146, 00577:298). | Recorded. |
| OBS-1 | low–medium | The WebKit first tap on "Review and send" missed in 2 of 32 taps. The likely cause is the landing scroll racing the tap (`doc/[id]/page.tsx:1724-1738`; `arrival-mount.tsx:126,130`). | Test fix: wait for arrival and a still scroll. Ruling f (K15): any scroll after arrival cancels the landing. Fixed by FIX10. <<PENDING: FIX10 re-check + merge>> |
| OBS-2 | low–medium / high | A returned request's manifest can be re-requested unchanged; `create_service_acceptance_request` has no check. | Ruling e (K11). **Fixed by RC8-FIX7** (00903, merge `42678296e`): PT409 `acceptance_rerequest_needs_new_evidence`. |
| OBS-3 | low / high | `signer_not_active`, `request_not_open` and `scope_edition_not_active` (SQLSTATE 55000) reach the client as HTTP 500. | Product smell. Exact `{status, code, message}` asserted, so a mapping change shows. |
| Job F (E2) | not established | `@rc7-e2-completion job F` failed 4 of 4 on WebKit at `5386a159e` in the instrumented OBS-1 runs. It passed in Phase B r1/r3 at `c6434e3dd`. | **Closed, no defect.** The unmodified bisect is green at all three SHAs. The failure was a `--trace on` and instrumentation artifact. |
| Rail-nav bounce | — | On long papers, the rail navigation bounce gives cold-load CLS 0.12–0.17. | Open. Not re-measured: rc7-e8.md records no figure. |
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
  - **Main is fixed (K20):** `5cf85c0ec`, pushed to `origin/main`, re-pins only the two 00835 pins for `_execute_furnishings_authorization_{authorized,on_paper_authorized}`. The other values in `d6fe9e12f` are round-8 bodies. When main next merges into round 8, resolve those lines to the round-8 side (`d6fe9e12f`).
- **Hardening-test orphans.** The test's dblink fixtures are deleted in replica mode, leaving FK orphans (11 `user_roles`, 7 `organization_members`, 1 `invoice_links`). A later `owned_seed` then fails.
- **E8 activation fixture.** It hard-codes `patina-rc7-e8`; the gate used a scratch copy.
- **E8 visual captures.** The E8 visual spec overwrites the committed `evidence/rc/visual-rc7/*` captures (and `next-env.d.ts`).
- **Port blocks.** Blocks ≥656 overflow: DB is `B22`, and 65622 > 65535 (`briefs/rc7-common.md` port pattern).
- **Codex context size.** Codex agents hit HTTP 413 on large contexts.
- Also recorded:
  - E2 `global-teardown.ts` cannot purge F01 after an executed agreement (lanes clean up their own jobs);
  - `evidence-folio.spec.ts` checks the hostname only;
  - designer ESLint ignores `e2e/`;
  - `platform_acl_compatibility_test.sql:323` stays red (SQ-459, not round 8; it is in `KNOWN_FAILURES`);
  - `client_attention_test` fails on a missing overload (pre-existing);
  - pre-existing swiftlint reds: Patina service-acceptance files, and Capture `SupabaseSiteScanService.swift`.
- **RC-8 additions.**
  - **FIX11:** a draft typed during an in-flight save resets on success, and partial dimensions lose their labels.
  - **FIX13:** axe `incomplete` results are logged, not asserted. Aged-oak remains at `account-band.tsx:216` and `proposal-watch.tsx:255` (pre-existing). A pending edition with a preview is taller than 220 px.
  - **E7 fixtures:** `rc7-e7-fixtures/payloads/mixed-payloads.json` is stale, and the exporter only accepts port 59121.
  - **E8H:** `e2e/round8/global-setup.ts:25` runs before the E8 guard when `ROUND8_ALLOW_SHARED_DB=1`. That is an explicit opt-in to shared F01 writes.
  - **E3 fixtures:** they use `session_replication_role = replica` inside ownership-checked transactions to delete immutable receipts, events and the scope package (the established round-8 pattern).
  - **`paper-order.test.tsx`:** 2 jsdom "Maximum call stack" failures, pre-existing at `062ce1aeb`.

## Questions for Kody

**a. ~~RC7-E1-1: who is the C6 client audience?~~ Answered: K9, option 1. Built in FIX7 (00903).**
- Options:
  1. Signers of the contributing request only, via the row filter in `00895:55` (gate unchanged).
  2. Household signers of any sent request on the project (today's behaviour).
- **Recommendation: 1.** The fix is ready and the reproducer is written. Do not tighten the gate instead: that would refuse current signers before any completion exists.

**b. ~~RC7-E3-1: which arrangements ship?~~ Answered: K10, option 1: The Patina Six, Design-Only, Whole Home Renovation, Fast Track Refresh. Built in FIX9 (00905) as drafts; the content review is open (new question 3).**
- Options:
  1. Kody names the launch arrangements; a reviewed data migration loads them before C2 activation.
  2. Activate C2 with an empty catalog: no arrangement can be applied, and A04 stays unprovable.
  3. Defer C2 activation.
- **Recommendation: 1.** Do not import the synthetic test arrangement as product data.

**c. ~~RC7-E3-2: Field typed subject, scope and next owner.~~ Answered: K13, option 1 for the writer; the scope and next-owner columns are deferred. Built in FIX12.**
- Options:
  1. Fund the Field writer to send `subject_kind`/`subject_id` (the schema has them since 00874). Rule separately whether scope and next owner need new `margin_notes` columns.
  2. Narrow A15 to room, author and capture.
  3. Defer, leaving A15 a defect.
- **Recommendation: 1 for the writer.** Defer the new columns. A15 is not a C4/C6 criterion.

**d. ~~RC7-E3-5: ⌘K cold start when a household already has an open Direction.~~ Answered: K14, option 1. Built in FIX10. <<PENDING: FIX10 re-check + merge>>**
- Options:
  1. Offer "Continue the existing Direction" or "Start a separate agreement" (what the reproducer expects).
  2. Block the second draft.
  3. Accept the fork.
- **Recommendation: 1.**

**e. ~~OBS-2: can a returned acceptance request be re-requested on the same manifest?~~ Answered: K11, option 2 (no). Built in FIX7 (00903).**
- Options:
  1. Yes. A fresh send-time freeze counts as new evidence.
  2. No. Refuse a new request on a returned request's unchanged manifest (a migration plus a refusal test).
- **Recommendation: 2.** It matches A20's "rejection … requires the correct new evidence".

**f. ~~OBS-1: should the landing scroll yield to a scroll that happens after arrival?~~ Answered: K15, option 1. Built in FIX10. <<PENDING: FIX10 re-check + merge>>**
- Options:
  1. Yield to any scroll after arrival, programmatic included.
  2. Keep today's rule: yield to wheel, touchmove and scroll keys only.
- **Recommendation: 1.** A reader who has already moved should not be moved. The test fix stands either way.

**g. ~~Spec-pane debt left by the RC7-E6-3 fix.~~ Answered: K16, option 1 (a small fix lane now). Built in FIX11.**
- The debt:
  - the spec-book workbench (`spec-book-workspace.tsx`) still says "Refresh before saving" and does not refetch on conflict;
  - a conflicting chosen image stays as a kept draft, with no control to clear it.
- Options:
  1. A small fix lane before the renderer cohort widens.
  2. Record as debt.
- **Recommendation: 1.**

**h. ~~X01: the middleware role read fails open.~~ Answered: K17, confirmed as the contract. No code change.**
- The middleware is a shell gate, not an authority; RLS and the route handlers are the data boundary. `28e9e624d` makes `{ error }` match the existing throw and missing-key paths.
- **Recommendation: confirm** it as the accepted contract.

**i. ~~Production 40001 inventory ([`rc7-fix2-40001-inventory.md`](rc7-fix2-40001-inventory.md)).~~ Answered: K12, the full fix in the round-8 push (option 1). Built in FIX8 (00904) plus the `sms-inbound` regexes; `sms-inbound` redeploys in the ship chain.**
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

**j. ~~Add a `patina-db-migrations` skill row: raise deterministic refusals as PT409, never 40001.~~ Answered: K18, approved. The edit is still pending (new question 1).**
- Today the skill has no such row.
- **Recommendation: approve.**

**k. ~~Ship chain items.~~ Answered: K19, update §6 and measure the locks before the ship request. Done: ROLLOUT §6 reads 39 files; locks in `rc8-k19-locks.md`. The older text below is superseded by "Ship chain reminder".**
- 00900–00902 must ship together (a ROLLOUT note).
- ROLLOUT §6.1 still says 33 files (00867–00899). With RC-7 it is 36. The lock behaviour of 00900–00902 on `auth.*`/`storage.*` was not measured in RC-7.
- The earlier owed items are resolved: "00892 standalone?" by K7 (hold for the round-8 ship) and "household consent" by K6 (the studio's assertion is enough).
- Still owed at ship time: the `lock_timeout` mechanism (ROLLOUT §6.2).
- **Recommendation:** update ROLLOUT §6 to 36 files with the ship-together note, and measure the locks of 00900–00902 before the ship request.

**l. ~~Fix the red hardening test on main?~~ Answered: K20, yes. Done on main in `5cf85c0ec`.**
- **Recommendation: yes.** It is a test-only change re-pinning the two 00835 hashes on main. The alternative is to leave main red until round 8 merges.

**New, or still open after RC-8**

1. **K18: the skill edit.** The write to `.agents/skills/patina-db-migrations/SKILL.md` was permission-denied. Kody applies this text, or grants the write:

   > Deterministic refusals raise PT409, never 40001 — PostgREST 14.x retries 40001/40P01 without limit, so a refusal that fails the same way every time hangs until a 504 at 60 s. Use RAISE EXCEPTION ... USING ERRCODE = 'PT409' (HTTP 409); post-lock invariants raise XX000; keep 40001 only for genuinely transient conflicts, with a comment.
2. **00905 hold.** Its catalog rows are immutable. Push it now, so that revisions become version 2, or hold it out of the round-8 push until the arrangements are reviewed? Holding it means pushing 00867–00904 first (ROLLOUT §6.1).
3. **K10 content review** of the four drafts, including the `whole_home` flags (K10 table above).
4. **O-5: focus-indicator contrast.** Fix it before activation, or accept it as debt?
5. **Carried forward from RC-7:** the 00867 ship ruling, the D9 renderer-coverage gate, the `lock_timeout` mechanism, the demo-key allowlist and screen-reader verification. Household consent is also on the RC-8 carry-forward list, but K6 already ruled it: the studio's assertion is enough.

## Not verified

- **Screen reader:** no VoiceOver or NVDA pass.
- **Real devices:** no physical-device or VoiceOver walk. The iOS response, paper and care surfaces were not run; `webkit-iphone` is a browser emulation.
- **Zoom:** no real browser zoom. 200% was emulated by halving the viewport at DSF 2. 320 px reflow under zoom was not measured.
- **Interaction latency:** ≤200 ms and percentiles were not measured. No representative profile is agreed (WP-00). All performance numbers come from unthrottled localhost `next dev`.
- **The rail-nav bounce:** not re-measured.
- **Bundle budgets:** not re-run in RC-7 or RC-8 (last pass: RC-6 G5).
- **Production:** Strata, PostHog and Cloudflare were untouched. No row of the 40001 inventory was reproduced on Strata.
- **A live Strata push.** RC-8 measured 00896–00905 on a populated owned stack (K19: 0 errors, 0 lost rows), not on Strata. The `lock_timeout` mechanism is not verified.
- **WebKit CLS.** WebKit has no `layout-shift` API, so no WebKit CLS number exists.
- **Device or live-server Field writes.** K13 was tested on the simulator only.
- **The FIX10 re-check.** The Codex re-check and merge are pending.
- **Axe `incomplete` nodes.** They are logged, not reviewed.
- **Cross-provider review verdicts:** for most fix commits, the final verdict is not recorded in the repo (see the defect table).

## Ship chain reminder

- **Runbook:** [ROLLOUT.md §6](../../ROLLOUT.md). It was updated in RC-8 (K19).
- **Nothing is deployed.** Strata's head is still 00866.
- **Migrations: 00867 plus 00868–00905, 39 files.** `supabase db push` cannot skip a file, so main's 00867 ships with this push, and Kody's "ship 00867?" ruling is required first.
  - RC-8 adds three files: 00903 (K9/K11), 00904 (K12) and 00905 (K10, a draft catalog). They ship together with the rest.
  - **00905 hold question (open):** its four rows are immutable once inserted, so a revision after Kody's review lands as `version = 2`. Hold 00905 out of the push, or ship it and revise by version? Holding it means pushing 00867–00904 first.
- **Locks (K19):** 00896–00905 take no lock on `auth.*` or `storage.*`. The list of 13 files that do stays as it was. The longest file is 00904 at 34.8 ms with no relation lock, and all ten total 105.7 ms in-transaction. Strata runs with `lock_timeout = 0`. The `lock_timeout` mechanism is still a ship-time decision and is not verified.
- **Field order (K13):** Patina Field builds carrying K13 ship only after 00874 is live on Strata. The PGRST204 and subject-guard 23514 fallbacks are safety nets, not the gate.
- **Edge functions:** ROLLOUT §6 counts 44. K12 also changes `sms-inbound` (`pipeline.ts:2156/:3527`), which redeploys in the chain.
- **Before any ship:**
  1. Merge `r8-evidence` (RC-7 and RC-8) into `redesign/designer-portal-round8`. FIX10 must be re-checked and merged first.
  2. Resolve the 00905 hold question and the K10 content review.
  3. Get Kody's separate "ship".
- **Source changed since RC-7:** RC-7 changed no edge-function source. RC-8 changed `sms-inbound`, the designer portal, the Field (Capture) margin-note writer, the seed grants and the migrations.
