# W1W2-portal — round-5 fix

Branch `hour-tracking/portal`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.
Input: `W1W2-portal-review-r5.md` (0 blocker · 2 major · 10 minor · 14 note) plus the
orchestrator's scoping of this round.

**Applied:** M5-02 (major) and the four carried minors named in the brief — n1, n3, n6/n7, n9.
**Scoped out by the orchestrator:** M5-01 (`15-hours.md` + the Sanity push) — deferred to Kody
after the ship. **Recorded, not implemented:** t2 / t3 / t4 / t5 (later-wave scope). No DB reset,
no migration, no `supabase/` path touched, no prod anything.

Nothing in the review was found wrong. One reading inside M5-02 was decided rather than
inherited, and is stated in full below (§1.2).

---

## 1 · M5-02 — the four un-scoped elements

The wave placed four new scopes above content that had never needed a scope, so in the member,
project and studio scopes an owner read a studio-wide money figure, a studio-wide pending band,
an export of **her own** week, and a capture row that writes `user_id = auth.uid()` — all beneath
a caption naming someone else. All four now render in `scope === 'mine'` only, which is the
surface exactly as it stood before the wave (the whole sheet was one scope then).

`apps/designer-portal/src/components/document/hours-ledger.tsx`:

| Element | Now | Why that scope |
|---|---|---|
| `Export week → Accounts` (`:569`) | `scope === 'mine' &&` | `weekUnbilled` derives from the week read, which is `.eq('user_id', me)` — it is the **viewer's** week in every scope, so under another caption it pre-ticked the wrong person's hours into the composer. |
| `PendingTimeAuthorizationBand` (`:665`) | `scope === 'mine' &&` | Keyed on `lensProjectId` alone; after `00605`/`00606` an owner reads the **studio's** pending-authority hours, listing documents that are not the person named above. |
| all-time unbilled balance + `Bill it` (`:806`) | `scope === 'mine' &&` | A money total with a primary billing act, keyed on the lens only. See §1.2 for the project-scope reading. |
| batch-add row + `Add` (`:919`) | `scope === 'mine' &&` | `useCreateTimeEntry` writes `user_id = auth.uid()`. Plan §3's own closing warning: an admin entering an hour on a member's behalf is a deliberate act, not an accident of a shared form. **An admin never gets a capture row under another person's caption.** |

A plain member is unaffected: HT-8 gives her no lens and the landing belt settles her on `'mine'`,
so R75's export, R77's balance, the band and the add row are all still hers.

### 1.2 · The one reading decided here — the project scope's balance

The brief permits the project scope to keep *the project's own unbilled rows-with-total* **only
if the rows are listed beneath it** (HT-30). Measured: they are not, and cannot be without new
work. The balance reads `project_unbilled_time` (all-time, unclaimed). The entries act in that
scope lists `useTimeEntryLedger` rows for the **shown week** — a different set, not the rows that
produced the balance, and rendered *above* it in DOM order besides. So HT-30 is unsatisfiable
here without either listing the unbilled set or moving the block, both of which are new surface,
not a guard. The balance is therefore **hidden in the project scope** rather than captioned into
a half-truth. Recorded in the code comment at `:806` so a later hand does not read the absence as
an oversight.

The alternative the review offered — captioning the balance `unbilled · all time · the studio` —
was rejected for a second reason: in `'mine'` it would be wrong for a plain member, whose
`project_unbilled_time` rows after `00606` are **her own**, not the studio's.

### 1.3 · Pinned

`src/components/document/__tests__/hours-ledger-scope.test.tsx`, three new cases:

- *keeps the week export, the pending band, the balance and the add row out of a scope captioned
  with someone else's name* — opens on the member scope (`Maria Obi` current), asserts all four
  absent (including `Minutes` / `Add`, the capture row), clicks `mine`, asserts all four return.
- *shows no all-time balance in the project scope, where its rows are never listed* — §1.2.
- *leaves a plain member her own week's export, band, balance and add row* — the guards take
  nothing from the viewer with no lens.

To make the balance reachable at all in jest the PostgREST stub gained a `project_unbilled_time`
arm (`unbilledViewRows`, default `[]`, so no existing case changed).

---

## 2 · The carried minors

**n1 — `hours-ledger.tsx:1467`.** *"That note is not yours to read."* → *"That note could not be
read."* An RLS denial on `project_time_entries` returns no row **and no error**, so
`maybeSingle()` yields `{ data: null }` and lands on the existing absence arm (*"No note on this
entry."*) — which is the correct refusal-and-absence arm and is unchanged. Everything `isError`
can actually see is network / 500 / schema-cache, and reporting those as a standing problem told
the viewer something untrue about herself. Pinned: *calls a failed note read a failed read, not a
refusal* (a `noteState` arm on the note stub).

**n3 — `hours-ledger.tsx:1451` (new, `ScopeEntryRow`) and `:1661` (pre-existing, `EntryRow`).**
The billed chip's label moves from `var(--color-sage)` (≈2.1:1 on paper — under AA's 4.5:1 and
under the 3:1 large-text floor) to `var(--color-charcoal)`, one ink token. The sage **border**
stays as the quiet mark; per HT-40 the state is carried by the word (`Billed`), not by a colour,
and the studio scope is where these chips multiply. The unbilled arm is untouched
(pearl border / aged-oak). Pinned: *puts the billed chip's word in the body ink, not in sage*.

**n6 + n7 — `desk-contents.tsx`, `HoursInHandAct`.** Three changes to one act:
- the unbilled arm is now gated on `useViewerStudio().isOwnerOrAdmin` (and waits for
  `isSettled`): drawing an invoice is the studio's act (HT-3), and after `00606` a plain member
  reads her own unbilled rows, so the Desk was offering her the composer. Read as the brief
  states it — *the act only for owner/admin* — so a member gets **no** unbilled act; the Hours
  row above it still opens the sheet for her, so nothing becomes unreachable.
- `isError` now renders the neutral door `hours →` (opening the sheet) instead of nothing:
  `data === undefined` and "no unbilled hours" were the same absence, so a failed money read
  silently removed the act. A terracotta sentence would be wrong on an index of labels and
  doorways (R95), which is why the failure reads as a door.
- `isPending` renders nothing, explicitly.
The running-timer arm above is untouched and still ungated — a member's own timer is hers.
Pinned: four cases in `desk-contents.test.tsx` (owner-with-rows, member, pending, error → the
`hours →` door calls `openLedger('hours')`). The suite's `@patina/supabase` mock gained
`useOrganizations`, which `useViewerStudio` reads.

**n9 — `packages/supabase/src/hooks/use-time-tracking.ts:205`.** `invalidateProjectTime()` now
also invalidates `timeKeys.studioUnbilled()` (`['desk-contents-unbilled-time']`), which sits
outside the module's `['time']` family and had **no** invalidator anywhere in the repo. With the
app client's 5-minute `staleTime` and `refetchOnWindowFocus: false`, a billed-out studio kept
being offered *"hours to bill →"* and the click handed the composer `initialTimeEntryIds` an
invoice had already claimed — `claim_time_entries` then returns fewer ids than asked and the
composer's partial-claim detection rolls the whole draft back. One line, and it covers create,
update, delete and the claim (all four call sites route through `invalidateProjectTime`).

---

## 3 · Gates — run in this worktree, verbatim results

```
pnpm --dir <wt> --filter @patina/supabase type-check           EXIT=0  PASS  (no output)
pnpm --dir <wt> --filter @patina/designer-portal type-check    EXIT=0  PASS  (no output)
pnpm --dir <wt> --filter @patina/designer-portal test \
    …/hours-ledger-scope.test.tsx …/desk-contents.test.tsx     EXIT=0  PASS  2 suites, 39 tests
pnpm --dir <wt> --filter @patina/designer-portal test  (FULL)  EXIT=0  PASS  575 suites,
                                                                             7306 tests, 1 snap
pnpm --dir <wt> --filter @patina/supabase test        (vitest) EXIT=0  PASS  102 files,
                                                                             1255 passed / 12 skipped
pnpm --dir <wt> --filter @patina/designer-portal lint          EXIT=0  PASS  201 problems,
                                                                             0 errors (unchanged)
pnpm --dir <wt> --filter @patina/admin-portal build            EXIT=0  PASS  ✓ Compiled in 18.7s
```

The full jest sweep went 7297 → **7306** (nine new cases; r5's n11 SIGSEGV did not reappear).

The push's `pre-push` hook printed *"Affected verification has advisory failures"* over its
twelve-check affected plan. Run down: the six gates above are six of those twelve and all pass;
`@patina/manufacturer-portal type-check` printed clean in the push output; the failures are
`@patina/admin-portal lint` (**152 problems, 107 errors**) and `@patina/client-portal lint`
(**62 problems, 10 errors**), both measured again here. Both are pre-existing — this diff touches
no file in either portal (five files, all under `apps/designer-portal/src/components/document`
and `packages/supabase/src/hooks`) — and `patina-verification` records that only designer-portal
has a working ESLint config. Advisory, not introduced, not blocking; the push landed
(`3e87ff57f..c68c16d8e`).

Prettier's `pre-commit` warning named all five staged files. Measured against their **HEAD~1**
copies with the repo's own `node_modules/.bin/prettier`: the same five files already drifted
before this round, so the drift is inherited, not introduced. The hook says so itself
(*"advisory locally"*).
`@patina/supabase`'s vitest count is unchanged at 1255 — the n9 change is covered by the existing
invalidation specs' blanket assertions, not by a new one.

**Not run / not verified here:** no `supabase db reset`, no SQL test, no `psql` (this stage does
not own the DB); the e2e suite was not re-run (port 3000 is contended and this stage was not
named its owner) — note that `hours.spec.ts` asserts nothing on the four guarded elements, so it
is unaffected by name; no browser walk, no screenshots, no live-mode render; `packages/supabase`
lint (no resolvable flat config outside designer-portal); client- and manufacturer-portal type
gates (nothing in the diff touches them); PostHog ingest; prod untouched.

---

## 4 · Carried forward — recorded, not implemented

- **M5-01** — `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15`
  and the Sanity push. **Scoped out by the orchestrator this round; deferred to Kody after the
  ship.** The file is untracked on every ref and exists only in the main checkout, so no lane can
  edit it without the git-hygiene landmine §0.25 bans, and the Sanity write is an external
  mutation with no session authorization. The sharpening stands and is still owed: `:15` —
  *"a designer **or the studio's first hire** can see … where the week actually went"* — is now
  **false** (HT-8 gives a plain member no lens; `00606` gives her her own rows only), so that
  sentence wants rewriting, not confirming.
- **t2** (W4 portal follow-commit, stage 4) — `ScopeEntryRow:1402` renders
  `row.project_name ?? 'Project'`, so `00613`'s project-less internal hour prints the literal word
  "Project" as its document. One string, owed to the stage that lands the W4 portal work.
- **t3** (ruling owed) — W1's Done-when #5 ("a two-role member's ledger row prints the role they
  picked") vs plan §4, which assigns the role chip to W3. The implementation follows §4; the
  disagreement is the plan's, not the code's.
- **t4** (W3 scope) — the batch-add row carries no `billable` control and `useCreateTimeEntry`
  still writes `billable: input.billable ?? true`. HT-11 ruled "yes to both"; plan-v2:467 lists
  HT-11 among **W3's** inputs.
- **t5** (ruling owed, Kody's) — HT-29 shipped as "the row always, the act sometimes": the Hours
  doorway row renders unconditionally beneath the act, where plan §3 reads *"act-bearing or
  absent"*. Removing the row would make the Hours sheet unreachable from the Contents index —
  and n6 above now relies on exactly that row for the plain member, so the two are coupled.
- The review's other open minors (**n2** `.t-head` vs `.t-meta`, **n4** two-studio switching,
  **n5** the same-day upsert's `created_by`, **n8** three coverage gaps, **n10** the legacy-row
  rate drift) and notes **t1**, **t6**–**t14** were outside this round's brief and are untouched.

---

## 5 · Commit

```
fix(time): the scopes keep only what is theirs — a guard, a chip, a door and an invalidation
```

Five files, explicit pathspecs, all under `apps/designer-portal/src/components/document` and
`packages/supabase/src/hooks`. `apps/designer-portal/next-env.d.ts` is dirty in this worktree
from a Next build (`./.next/types/…` → `./.next/dev/types/…`); it is pre-existing, was dirty
before this round, and was **not** staged. No `supabase/` path, no `.env`, no `artifacts/` tree in
the commit; `supabase/config.toml` remains skip-worktree'd and unstaged.
