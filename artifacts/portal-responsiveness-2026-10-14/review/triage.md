# US-33 adversarial triage (SQ-963)

Input: `review/adversarial.md` (SQ-962, GPT-6 Astra cross-provider review of the bytes at `1cfe82721`). The orchestrator's ruling on SQ-963: fix R1–R25; decline only the Google Fonts note in "Rendering, copy and evidence limits". The scope extension allows pronoun and count edits only in `synthesis/pairings.md`, `review/d1-loading.md`, `review/d2-feedback.md` and `review/e1-data-writes.md`.

Verdicts: **FIX** = changed in this pass. **DECLINE** = no change, with the evidence. **NO CHANGE** = the review confirms the current text. Every S1 and S2 finding is FIXED. Nothing is DEFERRED.

Paths are relative to `artifacts/portal-responsiveness-2026-10-14/`. "doc" means `doc/src/index.html`, rebuilt into `doc/index.html`. "strips" means `specimens/build.mjs`, rebuilt into `specimens/action-strips.html` and `SPEC.md`.

## Findings

| ID | Sev | Verdict | Change made |
|---|---|---|---|
| R1 | S1 | FIX | The generic "Nothing was sent." is gone from the send grammar. The S4 copy now keeps the three outcomes `act-draft.tsx:38-40` already tells apart. (1) A definite refusal before the call: "Not sent. The draft is still here." with Try again. (2) An unconfirmed call: "We couldn't confirm this went out — check the thread before sending again." with no resend. (3) Sent but not recorded: existing "Sent. It didn't record here." The absolute "nothing is sent twice by a retry" now reads "never re-sends on its own". A second send needs a definite refusal or a proven idempotent retry (F15d, blocked by O4). Changed in plan §5.1 S4, F15, PQ15; doc grammar S3/S4 rows, P9 caption, pairs F6/F15, tracks F15; strips P9 S4 cell, caption and verdict; SPEC P9. |
| R2 | S2 | FIX | S4 states revocation case by case. (a) Removing only a role does not revoke data: project data rests on ownership (`00168_projects_rls_scope.sql:27-46`) and studio membership (00315/00316), not `user_roles`. With the claim, the shell stays open until the token refreshes or expires. (b) Removing a membership: RLS rejects on the next query. (c) Revoking a session: refresh fails, and the access token works until expiry (TTL unverified, O2). Each case gets its own local test. Changed in plan S4; doc S4 row. |
| R3 | S2 | FIX | N13 states the freshness rule. A revoked known key stays trusted until the key set refreshes, so the refresh is bounded by the SDK's remote-cache window (confirm the auth-js TTL before coding). If the key set is inlined instead, the plan needs a written maximum staleness and a key-removal redeploy and rollback runbook. Revoked-known-key and rotated-new-key cases are tested separately. Risk is now Medium. Changed in plan N13; doc N13 row. |
| R4 | S2 | FIX | F1's cache boundary is any change of signed-in user: none to someone, A to B, with or without a sign-out first. On that change F1 cancels in-flight reads, drops the previous user's cache and channels, and discards late answers. The caller list is fixed from the traces. Gate: switching A to B with no sign-out shows no A rows, and a late A answer is discarded. Changed in plan F1; doc F1 track row and pair. |
| R5 | S2 | FIX | N2 drops whole-snapshot restore for a conflict-safe rollback. A failed write re-applies only its own row's inverse patch to the current cache, or writes to a shared list are serialized at the list's boundary. `scope` is a mutation option, set where the mutation is built, not a per-call variable. The receipt merges into the cache. N15's Undo follows the same rule. Changed in plan N2/N15; doc N2/N15 rows. |
| R6 | S2 | FIX | N3's success condition is a changed-row receipt (the row comes back), not a 2xx. The gate adds an RLS zero-row case that must show the failure, beside the forced 500. Changed in plan N3; doc N3 row and the F5→N3 pair. |
| R7 | S2 | FIX | N4 and M1b merge the receipt into the cache, so the ghost turns into the real row with no gap. Two ghosts of one create are named as a test. Changed in plan N4; doc N4 row and M1 ruling. |
| R8 | S2 | FIX | "48 fewer requests" is now "one duplicate 24-read run, about 24 fewer requests". Changed in plan F2; doc F2 row, P4, chart sub; strips waterfall F2 source line; pairings (count only). |
| R9 | S2 | FIX | Auth-queue savings are labelled EST, with no overlap credit: about −2.7 s per Desk hard load and −4.2 s per Document. The thesis keeps the measured span (3,258–6,485 ms; last lookup about 512 ms; the RPC at 3,253; reads at 5,951 after 15 of 16). Changed in plan thesis, cause list, estimates note, F1; doc thesis, move 1/2, F1, P1; strips waterfall subtitle "(overlap not credited)". |
| R10 | S2 | FIX | The coverage sentence is replaced by a scenario × viewport matrix of what actually ran (P1/P2 at 1440, 390 and hard; P3 rail and hard; P4/P5/P10 at 1440; P6 as E1's three pairs; P7–P9 not measured). "43 projects" is now "16 projects, 11 of them in the studio, not 43". Changed in doc §2 (new matrix table) and plan §2. |
| R11 | S2 | FIX | The arrival hold is marked unverified attribution: the two end points come from different marks (`lab.mjs:60-65`, `:113-117`). Changed in plan cause 4 and §4; doc findings row. |
| R12 | S2 | FIX | F11 adds a `portal_usable` mark that B3 can be read from, because Web Vitals alone cannot establish B3. F11 is blocked by O6. Changed in plan F11; doc F11 row, B3 card, open-checks intro. |
| R13 | S2 | FIX | N13's saving no longer includes S4: the role hop stays until S4 lands. Changed in plan N13, row 2.20; doc N13 row and row 2.20. |
| R14 | S2 | FIX | The navigation rule ends only after the destination has committed (pathname and search equal the target) and that destination's `<main>` has no `aria-busy`. "No busy region" alone would end it on the old page. A superseded navigation moves the rule to the new target, a cancelled one stops it, and a same-URL click ends it at once. The gate adds a forced 1 s server delay on a non-busy old page. Changed in plan N11; doc nav-rule paragraph and N11 row. |
| R15 | S3 | FIX | S2 is limited to unpersonalized responses. S2 and S3 share one combined private-data cache gate. Changed in plan S2/S3; doc S2/S3 rows. |
| R16 | S3 | FIX | S4's rollback says turning the hook off stops only future claims. Tokens that already carry a claim keep it until refresh, so the middleware gets its own switch, through a redeploy, to ignore claims. A test checks that old tokens carrying the claim are refused once the switch is on. Changed in plan S4; doc S4 row. `review/e3-infra-bundle.md` keeps the old sentence: it is outside this ticket's edit scope, and the plan supersedes it. |
| R17 | S3 | FIX | Budget results carry three labels: "pass", "miss as written" and "pass under PQ1". The scorecard intro defines them, and row 2.4 reads "miss as written · pass under PQ1". Changed in plan §2 and row 2.4; doc scorecard intro and row 2.4 chips. |
| R18 | S3 | FIX | "Every measured click misses" now names the passes: the build-room rail scrolls in 31 ms and Library search answers in 15 ms. Changed in doc chart subtitle and plan §2. |
| R19 | S3 | FIX | The counts are corrected from a recount: 9 `onMutate` sites across 6 files, and 51 `['document-state']` invalidations across 36 files. The counting expressions are now written beside the counts. Changed in e1 (counts plus the expressions), doc D3, pairings (count only). |
| R20 | S3 | FIX | P6 is shown as a median duration with its range instead of a synthetic interval: tick 233 ms [179–266], untick 177 ms [175–185], with each run's start→end. Changed in e1 P6 table; plan F17 tolerance (579–789, 27–29); doc P6 chart. |
| R21 | S3 | FIX | "Dependency depth" is now "temporal serial depth (25)", ordering only. Changed in plan cause 3; doc P3. |
| R22 | S3 | FIX | F13 and F15 are split into separate units (F13a–f, F15a–f), with the effort unit "S per unit". F13d–f keep today's loader words until PQ6/PQ7. F15d's keyed retry is blocked by O4, and toast retirement waits on PQ11. Changed in plan §3.1 preamble, F13, F15; doc tracks intro, F13/F15 rows. |
| R23 | S3 | FIX | "None blocks Fix now" is gone: the open-checks intro says O4 blocks F15d's keyed retry and O6 blocks F11. F17 states its tolerance and that `p6.mjs` is a scratch script. Changed in plan F17, §4; doc open-checks intro, O4 row, F17 row. |
| R24 | S3 | FIX | Gendered pronouns are replaced with neutral ones ("they", "the studio member", "the studio"): plan (2.17, thesis); pairings (10 lines); d2 (7 lines). d1 had none. The doc build rejects them, and the render check found 0 in visible text. |
| R25 | S4 | FIX | S3's benefit reads "−0.2 to −0.5 s EST" (it had the wrong sign). Changed in plan S3; doc S3 row ("Saves 0.2 to 0.5 s EST"). |

## Safety and scope disposition

| Note | Verdict | Change made |
|---|---|---|
| Pending-only classes and V23 draft-first stay | NO CHANGE | Kept. R1's change concerns ambiguous outcomes only; sends stay never-optimistic (strip P9 "external send · never optimistic"). |
| `retry: false` is not exactly-once | FIX | F15d and the doc say retry is off, which is not exactly-once delivery. A keyed retry waits on O4. The absolute retry promise is narrowed (R1). |
| N15 concurrent-edit Undo | FIX | N15 requires a conflict-safe restore and a concurrent-edit test. Its "Low" risk is conditional on that (R5). |
| F4 must unify the shape as well as the key | FIX | F4 names the wider shared shape (`use-project-v2.ts:181-211` lifecycle rows) and caller regressions as its risk. |
| F2 per-studio projection is not F1 per-user isolation | FIX | F2 filters studio drafts in each observer's `select`; F1 keeps the per-user boundary. Changed in plan F2 and doc F2. |
| N8 invoker and RLS parity | NO CHANGE | The plan already requires SECURITY INVOKER with RLS parity. |
| Realtime hypotheses stay latent | NO CHANGE | Already demoted to latent and production-unverified. Not restored. |
| Fix-now sizing check | FIX | F4, F9, F11, F13 and F15 carry the prerequisites named there (R12, R22, F4 row). |

## Rendering, copy and evidence limits

| Note | Verdict | Evidence or change |
|---|---|---|
| Google Fonts is a live dependency, not a pinned library | DECLINE | The Artifact page contract allows stylesheets from `fonts.googleapis.com` and fonts from `fonts.gstatic.com`; the "pinned versions" rule covers scripts. Every face has a fallback stack. The render check (`doc/_renders/RENDER-CHECK.md`) found these two hosts are the only external requests, in all four runs. |
| A browser render of the final document was not run | FIX | Done by this ticket: 1440 and 390, light and dark, in headless Chrome. Results are in `doc/_renders/RENDER-CHECK.md`; all three defects it found are fixed (strip contrast, 390 table overflow, frame-height race). |
| Polish (a): action strips squeezed at 1440 | FIX (confirmed) | `doc/build.mjs` lays strips out three stages per row above 900px. Confirmed in `strip-p9-1440-*.jpg`. |
| Polish (b): waterfall axis clips its last tick | FIX (confirmed) | `doc/build.mjs` gives `.lanes` 44px of right padding. Confirmed in `waterfall-p1-1440-*.jpg`. |

## Residue outside this pass's edit scope

The plan supersedes each of these. They are listed so nobody reads them as current.

- `review/e3-infra-bundle.md:132-136` still says role removal revokes access and that turning the hook off rolls claims back (R2, R16). The current contract is plan S4.
- `synthesis/pairings.md` still says "every read waits" (around line 208) and "2–4 s" (around line 229). Only pronoun and count edits were authorized there. The current figures are plan thesis and F1 (EST, no overlap credit).
- `review/d2-feedback.md:74` keeps D2's original S4 cell. The current send grammar is plan §5.1 S4 and strip P9.
- `PQ15`'s "You're offline. Nothing was sent." is intentional, not residue: the refusal happens before any outward call, so the sentence is true.
