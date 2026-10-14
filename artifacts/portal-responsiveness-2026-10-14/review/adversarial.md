# US-33 adversarial review

**SQ-962 · 2026-10-14 · independent Codex review, high effort**

**Verdict: revise before publication.** The measured slowness is real, and most raw figures reproduce. The document overstates causal savings and coverage, and several implementation contracts lose important safety distinctions. This is a review of a proposal, not a claim that its unimplemented changes are already production vulnerabilities.

Reviewed repository revision: `f0665a38b83ec94eaf4847aff4d2e5d8265193f5`.

| Reviewed input | SHA-256 |
|---|---|
| `doc/index.html` | `0cd73b209d05dfa9f76f27ffab22816f1f44d410959851e9f5dea94706eaa1ea` |
| `doc/src/index.html` | `808bf4930230a86ac4caba34d8f327265b5fb87314c18aececf7688325b7fe4c` |
| `synthesis/plan.md` | `87dd00e80cbc195edd71d7b106a79b80d6953fa71a7eb74f9592f858b4903f88` |

Paths below are relative to `artifacts/portal-responsiveness-2026-10-14/` unless they begin `apps/`, `packages/`, `supabase/`, or `infra/`. HTML prose references use `doc/src/index.html`; the built document contains that prose. Severity: S1 blocks publication; S2 must fix; S3 should fix; S4 nit. Confidence describes the finding, not confidence in a future implementation's failure.

## Findings

### R1 — S1 · high — Generic send failure copy reverses an existing honesty safeguard

**Evidence:** `synthesis/plan.md:169`, `doc/src/index.html:556` prescribe “Nothing was sent.” for pending-only failure. `apps/designer-portal/src/components/document/acts/act-draft.tsx:34-43,125-136` already distinguishes definite refusal, an unconfirmed outward call, and sent-but-unrecorded success.

A network response can disappear after delivery. Replacing that distinction with “Nothing was sent” invites another send and violates the non-waived honesty rule. The later PQ16 idempotency condition does not repair the generic S4 failure row.

**Correction:** Preserve the existing three outcomes in the grammar, examples and tests. Offer a second send only after a definite pre-send refusal or an authoritative idempotent retry path; an uncertain outcome must say to check the thread. This does not require a new product decision.

### R2 — S2 · high — Role removal does not automatically revoke data access

**Evidence:** `review/e3-infra-bundle.md:132-136` says deleting a designer role leaves only shell access because data is “already cut off by RLS at revocation time.” `supabase/migrations/00168_projects_rls_scope.sql:27-46` authorizes project ownership using `auth.uid()`. `00316_studio_shared_workspace_rls.sql:28-36` adds studio access; `00315_studio_comember_helper.sql:29-48` checks ownership or active organization membership, not `user_roles`.

Deleting `user_roles` alone is therefore not the same operation as removing ownership/membership. A still-valid token can retain the relevant data rights. This is a false safety premise for S4, not evidence of a new cross-studio leak.

**Correction:** State precisely which revocation is being discussed, what rows change, which server/RLS checks reject it, and what survives until token expiry. Retain PQ20 deferral. Add local tests for role-only removal, membership removal, and session revocation separately; do not claim production policy verification from migration text.

### R3 — S2 · high — Inlined JWKS has no specified revoked-key freshness bound

**Evidence:** `review/e3-infra-bundle.md:67-89` distinguishes the SDK's ten-minute fetched-key cache from caller-supplied JWKS, then recommends a wrangler literal and argues that an unknown `kid` safely fetches. `synthesis/plan.md:125` labels this low risk.

A revoked **known** key is the missing case. It still matches the supplied set; the unknown-key fallback does not remove it. Without replacing that set, an old key can remain trusted by this middleware beyond the normal remote-cache freshness window. Token expiry does not bound a compromised signing key's ability to sign a new token. Independent API/RLS verification may still reject that token; that does not make the shell verifier's trust policy correct.

**Correction:** Use a bounded-refresh/revocation-aware key source or explicitly specify and test key removal, maximum staleness, and emergency redeploy/rollback. Test revoked-known-key and rotated-new-key separately. The installed auth-js implementation was not available in this checkout, so the SDK's exact precedence/TTL should be confirmed before coding; no live key-revocation experiment was performed.

### R4 — S2 · high — F1's account-switch mechanism only handles sign-out

**Evidence:** `synthesis/plan.md:88` says `queryClient.clear()` on `SIGNED_OUT`, while its acceptance criterion covers account switches. `packages/supabase/src/hooks/use-inbox.ts:82-107` uses user-independent keys such as `['inbox','notifications',filters]`; `apps/designer-portal/src/lib/react-query.ts:217-241` uses a shared client and five-minute freshness.

A session can change subjects through sign-in/session replacement without the proposed handler receiving a preceding sign-out. The old subject's fresh cached rows then outlive the identity update. RLS does not protect already-cached browser data.

**Correction:** Make subject change, including null↔user and user A↔B, the cache boundary. Specify disposal/cancellation of previous-subject work and subscriptions, not just clearing after sign-out. Test A→B without SIGNED_OUT and a late A response. Keep this store browser-only. The sampled inbox mark-read server route independently calls `getUser()` and filters by that returned user (`apps/designer-portal/src/app/api/inbox/mark-read/route.ts:16,51,68,102`); replacing a browser lookup is not itself an authorization bypass. No blanket assertion that every server caller is safe is justified by this sample.

### R5 — S2 · high — Whole-snapshot rollback is not safe under the proposed row scopes

**Evidence:** `review/e1-data-writes.md:155-192` specifies whole-query snapshots, reverse restoration, and `scopeId(vars)`; `synthesis/plan.md:114-115` treats this as safe uniform behavior.

Concrete counterexample: A and B are different task IDs in the same cached list. A snapshots the list and patches A; B snapshots that result and patches B. B succeeds; A fails and restores its whole old list, erasing B's confirmed change. Different task scopes cannot serialize that shared-cache conflict. Reverse restoration of multiple keys does not address it. Also, `scope` is a mutation option: the proposal must explain how its per-call variables become an actual configured scope rather than assuming this pseudocode is directly usable.

**Correction:** Specify conflict-safe rollback/merge or serialization at the shared resource boundary. Test different rows sharing a list, reverse-order settlements, first-fails/second-succeeds, and repeated same-row actions. A two-call same-row success test is insufficient.

### R6 — S2 · high — Legitimate RLS denial can be a zero-row success, not the forced 500 in N3's gate

**Evidence:** `apps/designer-portal/src/hooks/use-section-work.ts:141-159` updates by ID, checks only `error`, and requests no returned row/count. N3 (`synthesis/plan.md:115`) proposes immediate optimistic truth plus a forced-500 rollback test.

An update whose target is invisible under RLS can affect zero rows without a database error. The proposed optimistic path then takes its success branch even though nothing changed; a later refetch may remove or revert the row without the promised explanation.

**Correction:** Require an authoritative changed-row/receipt check for this mutation, and test a real inaccessible or concurrently removed row as well as a thrown 500. Keep the optimistic value explicitly unconfirmed until that receipt. This is a trust-boundary requirement, not a reason to forbid all optimistic ticks.

### R7 — S2 · medium — M1b and create ghosts leave a receipt-to-cache gap

**Evidence:** `synthesis/plan.md:114` ends `isPending` at the write and reconciles unawaited; N3/N4 use create ghosts. D2's create treatment derives pending ghosts from mutation state. `apps/designer-portal/src/hooks/use-document-rooms.ts:40-70` currently only invalidates on success, with no success insertion into the cache.

Applied literally, the ghost disappears when the write resolves, before the new row arrives through refetch. Multiple creates also need independent pending entries, not one observer's latest variables.

**Correction:** Specify receipt merge/ghost replacement before ending the pending presentation, or retain a reconciliation state. Test a delayed post-write refetch and two concurrent creates. The present proposal lacks that completion contract; this is not a tested implementation defect.

### R8 — S2 · high — “48 fewer requests” double-counts the duplicated Desk read

**Evidence:** F2 in `synthesis/plan.md:89` and `doc/src/index.html:621`. The hook performs 24 reads per invocation, including the separately started outbound-drafts read. `baseline/traces/local-desk-waterfall.json` has two `document_state` reads, starting at approximately 5,957 and 7,241 ms, consistent with the two Desk keys.

Collapsing two 24-read runs into one saves approximately **24**, not 48, absent additional measured effects. Several tables legitimately occur more than once *inside* one Desk computation, so “each Desk table requested once” is also the wrong gate.

**Correction:** Count invocations or full request signatures; report 48→24 for this component of the waterfall and keep dependent RPC savings separate. Re-measure the total rather than promising to halve all 95 requests. Moving the studio-draft projection into observer `select` is plausible: the outbound fetch itself is not organization-filtered (`use-desk-engagements.ts:706-714`); the projection currently is (`:1071`). Preserve that projection per observer.

### R9 — S2 · high — Measured auth queue duration is presented as measured removable latency

**Evidence:** `doc/src/index.html:230,235,480,620` and the plan thesis promise about 2.7 seconds per hard load, including “every data read waits behind them.” The Desk trace has a REST RPC at 3,253 ms, reads beginning at 5,952 ms, and the last auth lookup ending at 6,485 ms. The last lookup also takes about 512 ms, not 172 ms.

The trace supports a substantial serialized auth queue, but not the universal dependency statement or a measured before/after speedup. Downloads, CPU, locks and reads overlap. F1's exact hot-path migration subset has not been measured as a candidate.

**Correction:** Label the 2.7/4.2-second savings as estimates with an overlap assumption, narrow the causal wording, and require before/after critical-path measurements. Likewise mark the headline 220–390 KB removable bundle range as estimated; bundle component weights are measurements, removal totals are not.

### R10 — S2 · high — The baseline coverage sentence claims runs that do not exist

**Evidence:** `doc/src/index.html:271` says P1–P10 were timed three cold runs each at 1440 and 390. Only P1 and P2 have 390 data files. P6's original runs failed; E1 later supplied a 1440 tick/untick series. P7–P9 were not measured. `baseline/BASELINE.md` discloses those limitations.

**Correction:** Print the actual scenario/viewport matrix and distinguish hard loads, SPA transitions, the failed P6 attempt and the later measurement. Also correct `doc/src/index.html:272`: the baseline has 16 projects total, **11** in the studio, not 16 in the studio.

### R11 — S2 · high — Arrival hold is inferred from two different end points

**Evidence:** `synthesis/plan.md:151` attributes a 2–4-second Document hold to arrival; the rationale pairs usable 6,773 ms with LCP 10,728 ms. `baseline/harness/lab.mjs:60-65` explicitly records `usable` only after `arr-pre` and `arr-on` are absent. Its Document content selector is just the visible `h1` (`:36`).

Thus LCP minus usable is not a measurement of the arrival hold: the measured usable point already excludes that hold. Later content, image or text paint can cause later LCP. The recommendation may still be desirable, but this evidence does not establish the attributed savings.

**Correction:** Instrument arrival start/end and the actual usable surface separately, record the LCP element, and label the hold/savings claim as an unverified attribution until then. Keep the arrival choice as PQ3 rather than selling a proven four-second removal.

### R12 — S2 · high — F11 cannot establish B3 using Web Vitals alone

**Evidence:** F11 (`synthesis/plan.md:98`, `doc/src/index.html:630`) calls the proposed WebVitals event “the only proof of B3 p75 in prod.” B3 is **usable content**, including SPA navigations. The baseline itself distinguishes Document usable 6,773 from LCP 10,728 ms.

LCP is not the custom usable-content metric, and a conventional page Web Vitals event does not measure every client-side route's click-to-usable interval.

**Correction:** Add a narrowly specified usable-content/navigation measurement and denominator if B3 is the objective, or stop claiming F11 verifies it. Specify route templates, no entity IDs/raw URLs, cohort/network/device limitations, and the distinction between field distributions and the fixed throttled lab.

### R13 — S2 · high — N13's savings silently include deferred S4

**Evidence:** `synthesis/plan.md:69,125` and `doc/src/index.html:658,724` describe approximately zero network after N13. S4/PQ20 still defer eliminating the role query. Current middleware calls that query on protected page navigations (`apps/designer-portal/src/middleware.ts:19-28`). `/api` already returns before the role gate.

**Correction:** N13 removes the user lookup on supported tokens, not the protected-page role lookup. Attribute roughly one hop to `/api` matcher exclusion, retain the role hop for page navigation, and reserve zero-auth-network claims for the separately ruled S4. Do not credit two cold handshakes to the inlined JWKS alone.

### R14 — S2 · high — Navigation progress can finish against the old page

**Evidence:** `synthesis/plan.md:122` starts N11 on an anchor/push and ends when no `aria-busy` exists in main. The current page is ordinarily already non-busy while the destination RSC is still in flight.

**Correction:** Restore the destination-commit condition from D1, then wait for that destination's readiness. Specify canceled/superseded navigation and same-URL behavior. Test a one-second server response while the old main remains visible and non-busy; merely testing a busy destination is insufficient.

### R15 — S3 · medium — S2/S3 need a combined private-data cache gate

**Evidence:** `synthesis/plan.md:135-136` independently proposes static shell interception and Desk server hydration. S2's gate checks only signed-out 307/signed-in 200. E2 correctly specifies a per-request QueryClient and user-cookie Supabase client (`review/e2-page-architecture.md:164-166`); the current `open-next.config.ts` has dummy caches, not the proposed shared cache.

Those are good starting boundaries, but the combined plan does not explicitly remove a personalized Desk response from the static-shell set or test HTML/RSC and prefetch-header paths across users/studios. Prefetch matcher exclusions are not an authorization mechanism.

**Correction:** State that personalized/dehydrated data must not enter shared shell caches; keep request-local clients and server authorization independent of middleware. Add alternating-user/studio tests for normal and RSC/prefetch requests, including signed-out and membership-revoked cases. This is a missing combined acceptance gate, **not** a demonstrated current cache leak.

### R16 — S3 · high — Disabling the token hook does not immediately roll back existing role claims

**Evidence:** `review/e3-infra-bundle.md:108-111` treats absent-claim DB fallback as making rollout reversible. Existing tokens retain a present claim until refresh/expiry.

**Correction:** Separate stopping future claim issuance from immediately stopping claim consumption. Document the middleware rollback switch/redeploy and test old present-claim tokens after hook disable. For the signed-cookie alternative, preserve binding to both user and session and document its separate five-minute revocation window. Production token TTL is still O2, not a verified one-hour bound.

### R17 — S3 · high — Proposed budgets are already printed as passes

**Evidence:** `doc/src/index.html:370` labels a 687 ms hard-load placeholder a B2 pass against the stated 200 ms budget; the reinterpretation “at first paint” remains a PQ1 ruling. `:723` labels navigation B3 p75 passed using three-run medians.

**Correction:** Distinguish “miss under current definition,” “would pass under proposed PQ1 definition,” and “sample median below threshold.” The sampled navigation maxima are also under 1.5 seconds, but three lab runs do not establish a population p75 or production pass. The first-change metric is DOM mutation, not a verified visible paint; preserve that caveat beside B1 claims.

### R18 — S3 · high — “Every measured click misses” omits the measured passes

**Evidence:** `doc/src/index.html:311,721`; the same document's scorecard includes P3 rail response 31 ms and P5 search response 15 ms.

**Correction:** Say “the navigation and task actions shown here miss” or include all measured actions. Do not turn a selected chart into a universal result.

### R19 — S3 · high — Two revised inventory file counts are still wrong

**Evidence:** `review/e1-data-writes.md:34-44`, `doc/src/index.html:430`. Nine `onMutate:` definitions occupy **six**, not seven, files: availability, coordination, scope-builder, comms, orders, piece-field. The report's own list contains six. A non-test `.ts/.tsx` line scan across the two named source roots finds 51 single-line whole-document invalidations in **36**, not 38, files.

**Correction:** Fix the file counts and publish the exact counting expression/exclusions. The headline 655 and 212 counts do reproduce when interpreted as `useMutation` call/generic lines and literal `auth.getUser()` sites; do not reinterpret them as AST-proven independent behaviors.

### R20 — S3 · high — P6's displayed write interval is synthetic

**Evidence:** `review/e1-data-writes.md:62` prints tick write 214→447, duration 233 ms. Raw `baseline/data/e1-P6-1440.json` intervals are 236→502, 87→320 and 214→393. Median start is 214, median end is **393**, median duration is 233. Adding independent medians created an interval no run observed.

**Correction:** Report median duration with its range, or print one explicitly identified run. Keep 748 ms new state and 1,368 ms settled: those medians reproduce.

### R21 — S3 · high — “Dependency depth” is only temporal ordering

**Evidence:** `baseline/harness/lab.mjs:113-117` computes the longest sequence whose next request starts after the previous ends, without initiator/data-dependency edges. The document describes a 25-deep dependency chain.

**Correction:** Call it temporal serial depth, or instrument actual dependency edges. Do not infer 25 causal awaits or React rerenders from this value/DOM-mutation batches. S1's separate Profiler prerequisite is appropriate and should remain.

### R22 — S3 · medium — Fix-now bundles exceed their stated unit of effort and blur PQ boundaries

**Evidence:** Plan §3.1 says each item is about a day or less. F13 spans nine route families and three mount points; the HTML correctly says **S per route**, not one S total. F15 combines form retention, swatch rollback, two delete flows, retries across sends/payments, background error policy and multiple inline-error surfaces. Pairings also classify several constituent changes per hook/route.

F13 includes Library and drafting/ceremony loaders, while sweep demotion and prose retirement are assigned to PQ6/PQ7. F15's new error presentation can overlap PQ11, beyond the non-negotiable requirement to avoid false success.

**Correction:** Split these into independently bounded units and explicitly preserve existing loader/error language until its PQ is ruled, or identify which approved baseline rule permits each replacement. Do not promise the whole bundle fits a day. F1's identity-isolation work also needs an explicit scoped caller list before its S estimate is reliable.

### R23 — S3 · high — “None blocks Fix now” contradicts the open-check table

**Evidence:** `doc/src/index.html:821` says none of the open checks blocks Fix now, but O4 names F15 and O6 names F11; the plan already says O6 first.

**Correction:** Say these checks block the named sub-items, not the whole track. In F17, replace “reproduces 748 ms” with a tolerance/distribution and a stable assertion for 27 refetches; a timing median is not an exact deterministic acceptance value. The retained E1 JSON names a scratch `p6.mjs`, not a committed runnable P6 runner, so preserving/promoting that runner is a real prerequisite.

### R24 — S3 · high — Neutral-pronoun rule is not applied to the written plan

**Evidence:** `synthesis/plan.md:17,66,169` uses “her work,” “wipes her text,” and “keep her typed words” for the studio member. `synthesis/pairings.md` and D1/D2 prose have further instances. The non-waived rule covers these deliverables, not just the final HTML.

**Correction:** Use neutral pronouns throughout the authored review/plan copy. The built document's extracted static prose and 18 embedded documents had no forbidden pronouns or “AI” matches. Keep clearly labelled simulated names and “Would feel” projections; those labels are present, and I found no basis to call them genuine interview testimony.

### R25 — S4 · high — Structural benefit uses the wrong sign

**Evidence:** S3 in `synthesis/plan.md:136` says “+0.2 to 0.5 s hard load” while the gate requires a latency reduction.

**Correction:** Use a minus sign or “saves,” and keep it explicitly estimated. This is not a measured benefit yet.

## Numeric audit

Independently recomputing medians from `baseline/data/local-P*.json` reproduced **167 numeric summary entries**. The following 38 named samples trace the document/plan's central figures to raw rows, not merely another author's prose. Times are ms; all listed medians have three samples. “Matches” validates transcription, not the metric's causal interpretation or a p75 claim.

| # | Raw scenario file suffix / field | Median | Result |
|---:|---|---:|---|
| 1 | P1-1440 / firstChange | 159 | Matches |
| 2 | P1-1440 / placeholder | 2476 | Matches |
| 3 | P1-1440 / usable | 7153 | Matches |
| 4 | P1-1440 / settled | 21177 | Matches |
| 5 | P1-1440 / apiRequests | 100 | Matches |
| 6 | P1-1440 / authUser | 18 | Matches |
| 7 | P1-1440 / depth | 23 | Matches; R21 |
| 8 | P1-1440 / longTaskMs | 400 | Matches |
| 9 | P1hard-1440 / ttfb | 39 | Matches |
| 10 | P1hard-1440 / fcp | 704 | Matches |
| 11 | P1hard-1440 / usable | 6974 | Matches |
| 12 | P1hard-1440 / apiRequests | 95 | Matches |
| 13 | P1hard-1440 / authUser | 16 | Matches |
| 14 | P2-1440 / firstChange | 215 | Matches |
| 15 | P2-1440 / placeholder | 1004 | Matches |
| 16 | P2-1440 / usable | 1464 | Matches; range 1454–1481 |
| 17 | P2-1440 / noBusy | 3574 | Matches |
| 18 | P2-1440 / apiRequests | 81 | Matches |
| 19 | P2-1440 / authUser | 5 | Matches |
| 20 | P2-1440 / rpc | 16 | Matches |
| 21 | P2-1440 / domMutationBatches | 62 | Matches; not React commits |
| 22 | P2hard-1440 / ttfb | 44 | Matches |
| 23 | P2hard-1440 / fcp | 728 | Matches |
| 24 | P2hard-1440 / usable | 6773 | Matches |
| 25 | P2hard-1440 / noBusy | 9372 | Matches |
| 26 | P2hard-1440 / lcp | 10728 | Matches; R11 |
| 27 | P2hard-1440 / apiRequests | 145 | Matches |
| 28 | P2hard-1440 / authUser | 21 | Matches |
| 29 | P2hard-1440 / depth | 25 | Matches; R21 |
| 30 | P2hard-1440 / domMutationBatches | 130 | Matches; not React commits |
| 31 | P2hard-1440 / longTaskMs | 1044 | Matches |
| 32 | P3hard-1440 / usable | 6154 | Matches |
| 33 | P3hard-1440 / apiRequests | 72 | Matches |
| 34 | P4-1440 / usable | 1136 | Matches |
| 35 | P4-1440 / apiRequests | 9 | Matches |
| 36 | P5-1440 / usable | 862 | Matches |
| 37 | P10-1440 / usable | 1415 | Matches |
| 38 | P10-1440 / apiRequests | 33 | Matches |

Additional checks: E1 P6 tick/untick state medians 748/465, settle medians 1368/1126, and refetch medians 27/27 reproduce. The write-interval exception is R20. `local-jsweight.json` agrees with sign-in 1074.7 KB and Desk 1586.0 KB transferred gzip; analyzer gzip and transferred gzip are distinct measurements and should retain their labels. The document file has **4,112 lines** at `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`. Source scans reproduce **655** `useMutation\s*[(<]` lines and **212** `auth\.getUser\(\)` lines. Nine actual `onMutate:` definitions span six files. The 24-read Desk structure and its extra per-claim RPC are consistent with the inspected hook; R8 concerns the claimed removal, not that base count.

## Safety and scope disposition

- Payments, outward sends and deletes without Undo are correctly assigned pending-only in the class matrix. Retain that boundary and the V23 draft-first authority. R1 concerns ambiguous outcomes, not permission to make sends optimistic.
- `retry: false` is useful but not a proof of exactly-once delivery, protection against deliberate repeated clicks, or prevention of a first mutation paused offline and sent on reconnect. Keep O3/PQ15 and idempotency verification explicit; narrow the absolute “nothing is sent twice by a retry” promise in `doc/src/index.html:487,634`.
- N15's previous-list Undo needs a concurrent-edit test: restoring an entire old image list can overwrite someone else's intervening change. Its “Low” risk is conditional on a conflict-safe restore; no production Undo implementation was evaluated.
- F4 must unify the fetched shape as well as the key. The current `use-project-v2.ts:181-211` intentionally separates lifecycle-rich rows. E2's wider-embed proposal addresses this; a key-only implementation would not.
- F2's per-studio projection and F1's per-user cache boundary are different concerns. Do not remove identity isolation merely because two authorized observers can share one raw query.
- N8 appropriately calls for SECURITY INVOKER and RLS parity. Do not replace it with service-role aggregation to make the benchmark pass.
- The realtime echo and mounted-double-subscription hypotheses were correctly demoted to latent/production-unverified concerns. Do not restore them as measured causes. No live production publication check was performed here.

### Fix-now sizing check, all 17 entries

F2, F3, F5–F8, F10 and F12 are plausible bounded changes once their stated prerequisites and consumers are included; this is an estimate, not measured implementation time. F4 is plausible only with the wider shared shape and caller regressions. F9 depends on an analyzer experiment rather than a guaranteed byte saving. F11 needs O6 and the corrected metric contract (R12). F14 must preserve chrome and global-error behavior, not merely create files. F16 is per-surface work and needs measured 44 px/keyboard/assistive feedback. F1's safety boundary, F13/F15's aggregate size and F17's missing runner/fixture work are the uncertain estimates identified above. No product code was changed to prove those estimates.

## Rendering, copy and evidence limits

Executed `node artifacts/portal-responsiveness-2026-10-14/specimens/check.mjs` against the reviewed bytes: **PASS 65 frames in 6 files · 13 departure tokens · 30 contrast pairs × 2 themes**. This deterministic gate checks source/build equality, frame/departure metadata, declared targets, contrast and reduced-motion rules; it is not a browser or screen-reader test.

Static parsing of the built document found **1,146,441 bytes**, **18 srcdoc embeds**, inlined screenshot resources, and no unresolved template tokens. Resource references in the main page and decoded embeds point only to Google Fonts; no external script resource was found. Google Fonts is a live CSS/font dependency, not a pinned immutable library: if “only pinned CDNs” is literal, embed the fonts or expressly permit this exception. The document source contains no fetch/XHR/WebSocket/sendBeacon calls. References in prose are ordinary links, not automatic requests. The generated specimens' own deterministic external-reference checks passed.

The plan, synthesis, baseline prose, six seat reviews, builder contracts, generated-sketch samples, raw timing data and the scoped source authorities above were inspected. Two screenshots were visually inspected: P2 at 1000 ms shows “Picking up…” on largely blank paper; P4 at 200 ms still shows the previous Document, so that particular screenshot is not evidence of an already-mounted blank People page. Generated HTML was inspected statically, not exhaustively visually. This review does **not** certify every screenshot, every displayed number, external citation currency, or live runtime behavior merely because those files are present.

**Not run:** a browser render of the final single-file document, 390/dark/zoom/keyboard/screen-reader walks, live production requests or mutations, a portal build, auth/RLS execution, or performance before/after runs. No dependencies are installed in this worktree. Seat 13's render pass remains required; the report-presence verifier is not a substitute. No production state was changed. Complexity/coverage is not applicable to this report-only delta; no measured product function changed.

Only `review/adversarial.md` is delivered by this ticket. All findings refer to the immutable input revision above; no fixes to that input are included.
