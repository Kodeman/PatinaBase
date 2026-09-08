# Lane H4 — review fixes

**Branch** `portal-polish/h4` · **worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h4`
**Base of the fix** `eb551e3f6` (H4 impl + report) · reviewed at `artifacts/…/waves/w2/h4-review.md`

## Findings → disposition

| id | severity | disposition |
|---|---|---|
| h4-1 | P2 | **fixed** — the Pay act drops native `disabled`; loading gets the sheet's own treatment |
| h4-2 | P3 | **declined** — outside this lane's file list; it is an integration ruling, as both the review and the impl report already say |
| h4-3 | P3 | **declined (nothing to fix)** — reverting the four test files makes the gate red by construction; flagged for integration sign-off, and this fix adds a fifth (disclosed below) |
| h4-4 | P3 | **declined** — out of scope: a portal-wide instrument state no step asks for and no terminal call site uses |

---

### h4-1 — fixed

The review's own minimum was "drop the native `disabled` for `aria-disabled` and add the
`is-loading` label swap by hand". Done, plus `aria-busy` where the sheet puts it.

**`apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx`** (the `:773` region this lane owns):

- `disabled={submitting}` → `aria-disabled={submitting || undefined}`. No native `disabled`
  reaches the DOM, so the checklist line "No `disabled` attribute on any gating act" now holds at
  the one site where it was checkable. No click guard was added because there was nothing to add:
  `handleAct` already opens with `if (submitting || (method === "check" && checkNotified)) return;`
  (`:448`), so a second press during an open request was already refused by the handler, not by the
  attribute.
- `is-loading` is appended to the class list while `submitting`.
- The label swaps: `Pay $9,130.00` → **`Opening payment`** (the sheet's own worked example,
  §A5 "Loading — ink, not a spinner"), and on the check rail
  `Let Nora know a check is coming` → **`Letting Nora know`**.
- `aria-busy={submitting || undefined}` sits on the act's wrapper `<div data-pay-print="hide">` —
  the *wrapper*, not the control, exactly as the sheet specifies.

**`apps/client-portal/src/app/globals.css`** (Scored Ink block — this lane's region), immediately
after the unavailable rule:

```css
.da-terminal.is-loading,
.da-terminal.is-loading:hover {
  background-color: var(--color-charcoal);
  color: var(--ink-paper);
  border: 0;
}
.da-terminal.is-loading .da-label {
  opacity: 1;
}
```

Ordering is load-bearing and is asserted, not assumed. `.da-terminal.is-loading` and
`.da-terminal[aria-disabled='true']` are both `(0,2,0)`; the `:hover` pair are both `(0,3,0)`. The
loading rules are declared *after* the unavailable ones, so an act that is both busy and
`aria-disabled` reads as working. `border: 0` undoes the unavailable hairline; the portal is
`border-box`, so nothing reflows by the 1px.

What a payer now sees mid-submission: the same charcoal fill, paper ink, no border, and a label
that says what is happening — not the rail/faint-ink/bordered face that means "blocked".

**Tests.**

- `instruments/__tests__/scored-action.test.tsx` (lane-owned) — a new case pins the CSS: the
  loading rules exist with the terminal fill and `border: 0`, the `:hover` variant is present, the
  block is declared after `.da-terminal[aria-disabled='true']:hover` (an index comparison, so a
  future re-order fails the test), and there is no `@keyframes spin` in the file.
- `app/pay/[token]/__tests__/invoice-sheet.test.tsx` — a new case holds `fetch` on an unresolved
  promise so `submitting` stays true, then asserts the label is `Opening payment`, the class carries
  `is-loading`, the button is `not.toBeDisabled()` **and** `aria-disabled="true"`, and the wrapper
  carries `aria-busy="true"`. This is a **fifth test file beyond the lane's declared list** — same
  class of breach as h4-3, disclosed for the same sign-off. I chose to take it rather than ship a
  regression fix with no test of the regression: this file is where the Pay act's copy is already
  pinned (`:238`, `Pay $9,130.00`), and the plan's copy rule is "update the test in the same lane".
  One `it()` added; nothing existing was edited.

### h4-2 — declined (out of scope)

`formatCurrency` (cents) beside `moneyInWords` (whole-dollar prose) on the wall gate. Both the
review and the impl report land in the same place: the fix would have to change `SpineGate`'s
caption or the Stamp, and `spine-gate.tsx` / `standing-sentence.tsx` are not this lane's files. The
review states it outright — "not something H4 could fix within its file list". Left for the
integration lane to rule: route the caption through `formatCurrency`, or accept prose caption vs
cents-precision consequence as a deliberate register difference.

### h4-3 — declined (nothing to fix)

`instruments/__tests__/hold-action.test.tsx`, `__tests__/approval-ask.test.tsx`,
`__tests__/scope-change-ask.test.tsx`, `app/trade/[token]/__tests__/trade-agreement-signature.test.tsx`
— four `toBeDisabled()` → `aria-disabled` assertion swaps forced by the shared `HoldAction` change.
The review's own recommended action is "No code fix needed; flag for the integration lane's
awareness / sign-off". Reverting them would make the lane's gate red by construction. Untouched in
this fix; re-flagged here, now with the fifth file named above.

### h4-4 — declined (out of scope)

The `animate-pulse` dot at `scored-action.tsx:178` is on plain `ScoredAction`'s generic loading
state. The file is in this lane's list, but the state is not: no plan step names it, none of the
three terminal call sites render it (the wall and door gates use `HoldAction`, the Pay act is a
hand-built button), and every `ScoredAction loading` consumer across the portal would change with
it — an unrequested refactor with blast radius outside this lane. It is `opacity-70`, so it does not
touch the "no `opacity: .5`" checklist line either. The review agrees: "Not this lane's fix; note
for a future lane/audit". Left for that audit.

---

## Gate — re-run, green

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h4 \
    --filter @patina/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
(no output — clean)

$ pnpm --dir …/agent-pp-h4 --filter @patina/client-portal test -- \
    src/components/threshold src/app/pay
Test Suites: 47 passed, 47 total
Tests:       1126 passed, 1126 total
Time:        11.663 s

$ cd …/agent-pp-h4/apps/client-portal && npx eslint src/components/threshold src/app/pay
approval-ask.tsx  1080:7  error    react-hooks/set-state-in-effect
tracking-row.tsx   104:9  warning  Unused eslint-disable directive
✖ 2 problems (1 error, 1 warning)
```

1124 → **1126** tests (the two new cases). Both eslint problems are the same pre-existing pair the
impl report and the reviewer's independent run both saw, in files this branch does not touch.

Narrower confirmation run over the two touched suites:

```
$ pnpm --dir …/agent-pp-h4 --filter @patina/client-portal test -- \
    src/app/pay src/components/threshold/instruments
Test Suites: 13 passed, 13 total
Tests:       283 passed, 283 total
```

Post-fix grep on the lane's own file:

```
$ grep -n "disabled" apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx
669:                  disabled={submitting}          ← PaymentMethodChooser's own prop
772:                  // No native `disabled` (sheet §A5): the unavailable rule and
780:                    aria-disabled={submitting || undefined}
```

`:669` is a prop on the method-chooser (the radio group), not a gating act, and sits outside the
`:773` region this lane owns. Untouched.

## Diff stat — this fix only

```
 apps/client-portal/src/app/globals.css                              | 16 ++++++
 apps/client-portal/src/app/pay/[token]/__tests__/invoice-sheet.test.tsx | 34 ++++++++++++
 apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx            | 24 ++++++---
 .../threshold/instruments/__tests__/scored-action.test.tsx          | 20 ++++++++
 4 files changed, 88 insertions(+), 6 deletions(-)
```

## What I did not do

- No dev server, no `supabase db reset`, no Chromium/Playwright pass — none is this lane's gate.
- No coverage run; no full 135-suite run (the lane gate is the 47-suite scope, re-run above).
- `spine-gate.tsx`, `standing-sentence.tsx`, `signature-line.tsx`, `review-ask.tsx`, the four test
  files from h4-3, and the plain-`ScoredAction` loading dot are all untouched.
- `--pay-act-bg` / `--pay-act-fg` / `--pay-act-bg-hover` at `invoice-sheet.tsx:80-87` are still
  declared and still unread — outside the `:773` region, still someone's deletion to make (impl
  report, deviation 5).
- `apps/client-portal/tests/threshold.spec.ts:390,664` still assert `toBeDisabled()` on the two gate
  acts — W2 integration's copy-table item, unverified here.
