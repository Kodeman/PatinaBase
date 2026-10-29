# RC-6: release review, fix wave and verdict

US-52 Room Proof 08, step RC-6. Written on 2026-10-29. Code tip `c066bc47a`; the evidence commits after it hold only docs.

## Verdict

**Ready to ship inactive, once Kody asks to ship. Not ready to activate C4 or C6.**

- Each finding the four frontier reviews raised has one of three outcomes:
  - fixed, with the fix reviewed by the other provider;
  - corrected in the docs, where the behaviour was by design;
  - carried below as an activation gate or as recorded debt.
- At the final tip, every gate passes (G1–G5, SQL, edge, locks and policy). The only failures are two flaky tests that pass when rerun alone, plus 7 edge failures that also fail on main.
- **Shipping inactive is safe.** Every consequential capability (C4 service acceptance and C6 completion) stays off on the server until a separate activation migration turns it on. The round-8 renderer stays behind `designer-paper-round8`, which is targeted to identified people only.
- **Activation is not ready.** Most acceptance criteria have only *weak* end-to-end evidence (R3b), no screen-reader pass has been done, and the household-card consent ruling is still open.

The four reviews (Codex Astra, run on the pre-fix tip) each ended NOT-READY with "fix-then-ship". They are copied verbatim in [`rc6-reviews/`](rc6-reviews/). **No whole-range Astra re-review was run after the fixes.** Instead, the cross-provider review of each lane confirmed that lane's findings were closed (table below).

## Findings and what happened to them

| Finding | Severity | Outcome | Where |
|---|---|---|---|
| R1-1: relink lets one person answer two household slots | HIGH | Fixed. Respond locks the slots' cards, and more than one active match is refused with `signer_identity_collision`. | 00896 |
| R1-2 / R2-5: a relink after compose sends to the stale account | MED | Fixed. Send rejects a stale recipient and validates the live acceptance email. | `f568d7727`, `3faba159b` (`_shared/outbound-kinds`) |
| R1-3: suspended-studio admins keep acceptance and completion authority | MED | Fixed. Authority requires an active studio, and the designer-of-record branch is closed too. | 00897 |
| R1-4: `is_studio_comember` is cross-studio | HIGH | Inherited, not introduced here. It belongs to the co-member tenancy program and is dormant (no multi-studio users). | — |
| R1-5: populated rollout evidence missing | MED | Closed by RC-5. | [`rc5-rollout-rehearsal.md`](rc5-rollout-rehearsal.md) |
| R1-6 / R2-2: household relink transfers signer authority without consent | HIGH | **Open: Kody's ruling.** Activation gate. | — |
| R2-1 / R3b-4: client accepts without seeing the scope evidence | HIGH | Fixed. Client-portal and iOS hold the controls until bound evidence loads; QuickLook previews; clearer labels and dates. | `6a1d3b407`, `24d8ef2c5`, `ccc343c02`, `9baa3714b` |
| R2-3: an excluded package's phase still blocks completion | HIGH | Fixed. Obligations read only included packages. | 00898 |
| R2-4: an all-paper household can never reach paper intake | MED | Fixed. An audited offline presentation exists, admin-only and active-studio-only, with the designer confirm. | 00899, `db07100fd`, `5dbade9eb`, `8e4ad9d30`, `c066bc47a` |
| R2-6: purchase-lens read errors are discarded | LOW | Fixed. Errors surface, and retry keeps focus. | `da64b9384` |
| R2-7: the paper-hash lookup stops after 20×100 pages | LOW | Fixed. Unbounded lookup is refused; listing progress is guarded. | `f568d7727`, `3faba159b` |
| R2-8 / R1-4 note: 00892 is independent of the redesign | INFO | **Open: Kody's ruling** (ship standalone?). | — |
| R3a-1/2: DNT does not force legacy; the fallback restores the tab latch | HIGH | By design ([`flag-inventory.md`](../flag-inventory.md) §4, P10). HANDOFF wording corrected. The kill-switch caveat is recorded in ROLLOUT. | `c40f78f66` |
| R3a-3: a fresh TRUE answer skips the identity check | MED | Two code fixes regressed, so the renderer was reverted to `1faae43c0`. Constraint added: the cohort targets **identified people only**, never an anonymous percentage. Remaining risk: one legacy load after identify (the safe direction). | `c40f78f66` (ROLLOUT) |
| R3a-4: the client door renders null on its first RPC failure | LOW | Fixed. The door stays quiet while pending and errors only when the first read fails. | F-C lane |
| R3b-1: no final-tip SQL gate for 00890–00895 | HIGH | Closed. 81 rows; actor, ACL, concurrency and race suites through 00899. | [`rc6-final-tip-sql.md`](rc6-final-tip-sql.md) |
| R3b-12: 200% zoom clips the skip links | MED | Probe artifact (CSS `zoom` at 1440 never fired a media query). Now covered by a real-zoom spec at 512/640/720/960/1280 at DPR 2. All 30 pass. | `72debb7cb`, `12301862c`, `b08cf9eb5` |
| R3b-13: scale profile is diagnostic only | MED | The silent truncation behind it (the PostgREST 1,000-row cap) is fixed on about 16 readers. The 2,000-line profile passes on both projects. The cold-load metrics are still unthrottled dev-server numbers. | `ee0d512df`, `b994a2de8`, `7dc42d064`, FF&E keyset `ffc8c52ac` |
| R3b-14: stale `/doc` budget in VERIFICATION | LOW | Fixed. | `c40f78f66` |
| R3b-2, 3, 5–11: transitions, iOS and older parsers on mixed records, commerce scenarios, the relink race, visual review of activated states, screen reader | HIGH/MED | **Open: coverage gaps.** Kody decides between another evidence wave and recording them as activation gates. | — |

RC-5 defects D1–D10 are closed (ship-chain docs, harness pin `a7efddc42`, doors `1768e5353`/`40a16ed83`, copy `c63fa6046`). D9 is an activation gate.

## Fix lanes and reviews

| Lane | Built by | Reviewed by | Rounds |
|---|---|---|---|
| F-A DB (00896–00899 + designer UI) | Opus | Codex | REQUEST-CHANGES → APPROVE |
| F-B edge (stale recipient, paper lookup) | Codex | Opus | APPROVE |
| F-C client and iOS evidence | Codex | Opus | REQUEST-CHANGES ×2 → APPROVE |
| F-D designer (purchase errors, renderer revert) | Codex | Opus | APPROVE after the revert decision |
| F-E FF&E keyset paging | Opus | Codex | REQUEST-CHANGES → APPROVE |
| F-G UI (doors, held presentation, zoom) | Codex | Opus | REQUEST-CHANGES → APPROVE |
| F-H readers past the row cap | Codex | Opus | APPROVE |

## Final-tip gates

- [`rc6-final-tip-sql.md`](rc6-final-tip-sql.md): the SQL/ACL/concurrency gate passes on all 81 rows. Migrations 00896–00899 take **no** AccessExclusiveLock on `auth.*`/`storage.*`, and in total hold locks for 27.9 ms. The `database.types.ts` and legacy-grants diffs are empty. `check-send-authority` exits 0. Edge: 729 pass and 7 fail; the same 7 fail on main `0bd6306e9` (5 in `invoice-subject`, 2 `spec-pdf` byte pins).
- [`rc6-final-tip-matrix.md`](rc6-final-tip-matrix.md) (G1–G5):

  | Gate | Result |
  |---|---|
  | Designer type-check, lint | Pass; lint 0 errors |
  | Admin build | Pass |
  | `@patina/supabase` | 2,122 pass |
  | Client portal | 3,406 pass; coverage floors met |
  | G2 | 14,186 / 14,186 |
  | G3 legacy | 18 pass, 0 fail |
  | G3 pieces | 40 pass; 1 flaky (a local Kong 502) |
  | G4 | 239 pass, 4 skips (each declared in its spec); 1 flaky |
  | G4 2,000-line scale | Pass on chromium and webkit-iphone |
  | G5 `/desk` | 63,515 B under budget |
  | G5 `/doc/[id]` | 7,776 B under budget |

## Activation gates (C4 / C6 stay off until each holds)

1. ~~Kody's household-card consent ruling (R1-6 / R2-2).~~ Resolved 2026-10-29 (K6): the studio's assertion is enough.
2. **D9 renderer coverage:** no C4/C6 activation while any designer still renders legacy.
3. **Order:** C2 before or together with C4, then C6.
4. **Evidence:** the R3b coverage gaps are closed, or Kody accepts them by name. A human screen-reader pass is required either way.
5. **Consumer sign-off:** the client-portal and iOS owners.

## Ship prerequisites (inactive ship, on Kody's "ship")

The ship chain is in [ROLLOUT.md §6](../../ROLLOUT.md):
1. 33 migrations, **including main's 00867**: any round-8 `db push` carries it.
2. 13 files that lock `auth`/`storage`, run in a low-traffic window. The `lock_timeout` mechanism is a ship-time decision.
3. 44 edge functions.
4. Designer and client portals via `deploy-portal.sh`, with the Supabase trio exported.
5. The flag cohort for identified people only.

## Recorded debt (not fixed)

- **F9:** `replace_service_acceptance_signer` and paper-intake review are not held in the UI for inactive studios. The server refuses (00897), but the UI does not explain why.
- **Paging:**
  - Offset paging is not a snapshot.
  - Invoice recompute should become keyset or a server aggregate.
  - `fetchAllRows` relies on the caller applying `.range` (it throws at 100,000 rows).
  - Procurement readers reuse one builder across pages.
- **Performance:**
  - A full 2,000-line read takes 7–9 s; the lead-time function runs twice (a possible 00900).
  - Dead `today-procurement-counts` invalidations.
- **iOS:**
  - `evidenceChanged` is not announced.
  - The document cache is not cleaned.
  - Two "Reload request" buttons appear.
- **Design hardening:** snapshot phase names into edition content. This is mitigated today because phases can't be renamed after draft (00399, 00390, 00401).
- **Harness:**
  - webkit-iphone does not model desktop zoom (N3).
  - `phone-line-editor.spec.ts:165` at 320 has now flaked at both RC-5 and RC-6, with a different assertion each time. Both passed alone. The cause is WebKit settling past 5 s and is not yet explained.
  - G3 needs `scripts/the-document-lens-seed.sql` loaded.
- **Edge:** 7 failures that already fail on main, outside US-52.
- **Process (RC-5):**
  - P1: one read-only `docker exec` SELECT ran on the shared DB container.
  - P2: a grep printed the committed public anon and PostHog keys to a session log. Both keys are public by design; nothing secret was exposed.
- Earlier accepted debt is still listed in [HANDOFF.md](../../HANDOFF.md).

## Not verified

- Production, Strata and PostHog: untouched.
- A whole-range frontier re-review after the fixes (lane reviews only).
- A screen-reader pass, axe scans, and iOS on device or simulator at the final tip.
- The RC-2 consumer journey and a renderer-off pass at the final tip (last run at RC-3b and RC-5).
- A second full G4 matrix; each flaky test was rerun once on its own.
