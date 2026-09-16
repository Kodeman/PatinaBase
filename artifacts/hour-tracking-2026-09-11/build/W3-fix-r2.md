# W3 — review round 2 fixes

Branch `hour-tracking/portal`, worktree `.codex/worktrees/agent-portal`. Two findings.
Both accepted; neither was wrong. No migration touched — no `db reset`, no
`run-sql-tests.sh`, no `db:generate`, no grants regeneration owed. No `packages/*` edit,
so the admin-portal build gate is not owed either (§0.24 scopes it to a `packages/*` edit).

---

## W3-R2-M1 — the add row carries no rate readout

**Accepted as a real gap in the plan's literal text; resolved as option (a), DECLARED,
with the reason recorded in the code and pinned by a test.**

plan-v2 §4's hours-ledger line asks for "billable pill + rate readout on the add row and
the entry rows". The finding is correct that `RateReadout` has zero uses in
`hours-ledger.tsx` (its only non-test call site in the whole portal is `log-strip.tsx:188`),
and correct that W3-impl §6 did not declare the omission.

**Why (b) was not built.** The finding's suggested construction — read the matching role
rate off `useProjectBillingAuthority(addProject)` and print it as the rate the server will
apply — cannot be made true. Measured this round:

- The only thing that knows the answer is `public.resolve_time_rate_cents` (00599), and
  **`EXECUTE` is REVOKED from `authenticated`** — `00599:567`, ruling W1-R7-04, with the
  migration's own postcondition at `00599:597-608` keeping it revoked ("a GRANT here is a
  door with no caller behind it"). There is no client-callable rate preview, by decision.
- Re-deriving it in the browser is not a one-liner and not honest. The ladder is
  tier 1 `project_billing_authority_rates` matched on the member's roster role **with a
  single-card fallback when no `roleName` matches** (00599 banner, W1-R1-07; `roleName` is
  free text, not the `TimeRateRole` enum), tier 2 `studio_member_rates`, then `'none'`;
  the project's own designer is pinned to `lead_designer` above any pick (W1-R5-03); and
  which studio prices the hour is HT-3-a/HT-3-b's two-tier derivation over
  `projects.studio_id` and the *designer's* org seats. A browser that prints tier 1 and
  cannot see the rest would say "rate pending" over an hour the server will price at the
  studio rate — a false money fact on the one surface built to stop them (HT-26's "three
  facts wearing one face").
- The plan's own Done-when for the readout is on the written row ("a log-strip entry …
  prints its reason"), not on the pre-write form, so nothing observable is dropped.

**What ships instead.** The add row answers the rate question with the half it genuinely
holds: HT-12's reason sentence beside the pill (`non-billable · no agreement` etc.),
already rendered from `useBillableIntent`. The written rows carry the real readout.

**Fix**

- `apps/designer-portal/src/components/document/hours-ledger.tsx` — the add-row control
  strip's comment now records the decision and the evidence, so a later hand reads it as a
  ruling rather than an omission and does not "repair" it by inventing a figure.
- `apps/designer-portal/src/components/document/__tests__/hours-ledger-add-row.test.tsx` —
  a new case pins it: with a document picked, the add strip prints
  `non-billable · no agreement`, and prints **no** `$` and **no**
  `rate pending` / `rate not recorded` (`timeRateProvenance({})` would return the latter on
  an empty form — the false fact the finding itself flagged).

**Falsified**: inverting the negative assertion to `toMatch(/\$/)` fails
(`1 failed, 7 passed`), so the case reads the real add-row strip, not an empty node.

---

## W3-R2-M2 — "not billable · $150.00": a money figure beside its own negation

**Accepted, confirmed by render, fixed.** Raised as m4 in round 1 and not addressed.

`log-strip.tsx:188-196` passes the **live pill state** as `billable` and the **stored**
`rated_amount_cents` as the amount. `timeRateProvenance` returns
`{kind:'nonbillable', label:'not billable'}` the moment `billable === false`
(`authority-hours.ts:152-154`), while `RateReadout` still appended
`amount > 0 ? fmtUsd(amount) : null`. One tap on the pill after a billable, priced hour
rendered a single span reading **`not billable · $78`** — reproduced verbatim by the
negative control below. The server closes the gap only once the row is written
(`00601:309` zeroes `rated_amount_cents` on the non-billable branch), so the contradiction
is exactly the window between the tap and the write.

**Fix**

- `apps/designer-portal/src/components/document/time-capture.tsx` — `RateReadout` suppresses
  the amount when `provenance.kind === 'nonbillable'`. One comment states the constraint
  (live state vs stored amount, and where the server closes it).
- `apps/designer-portal/src/components/document/log-strip.test.tsx` — a new case on the
  finding's fixture (`billable:true, hourlyRateCents:18000, ratedAmountCents:7800`):
  `$78` renders before the tap, and after clicking the pill `not billable` is present and
  `$78` is gone.

**Falsified**: with the fix reverted the new case fails with
`found <span …>not billable · $78</span>` — the defect, exactly as reported.

**Noted, not changed (scope).** `hours-ledger.tsx:1693-1700` composes the same
`provenance.label` + amount string by hand for the written entry rows. It cannot hold the
contradiction the way the strip did — it reads the **stored** `billable`, and the server
zeroes the amount on the same write — so it is left alone rather than widened into an
unrequested refactor. If a later wave gives `useUpdateTimeEntry` an optimistic cache write,
that row inherits this defect class and should move onto `RateReadout`.

---

## Gates

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` | 578 suites / **7354** tests, all pass (7352 + the two new cases) |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 pre-existing warnings, none on a touched file |

`apps/designer-portal/next-env.d.ts` carries a pre-existing generated drift
(`./.next/types/routes.d.ts` → `./.next/dev/types/routes.d.ts`) that predates this round;
it is left unstaged.
