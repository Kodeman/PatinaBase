# W3b review — The Invoice, Standing Alone: retiring settle-in-place, the chooser, and the print sheet

Adversarial reviewer, separate context, 2026-09-06. Read-only; I wrote no code and edited nothing in either worktree. Branch `invoice-standalone/w3b` at `f640e74b8` (2 commits over `origin/invoice-standalone/w3`'s **old** head `d5ad7308c`; 14 files, +126/−2063), worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-inv-w3b`. Binding inputs: `delivery/RULINGS-K4-K11.md` (K9), `review/04-rulings.md` (D1), `architecture/02-system-design.md` v2 §6 "Letterbox"/"The print sheet" + §14, `delivery/reviews/w3-review.md` (F5, F6, F13). Every finding is reported; no severity filter.

## Verdict

**FIX FIRST**, then merge after the main ship per K9.

On its own branch W3b is clean and its gates are green — type-check 0 errors, 121 suites / 1808 tests pass, coverage 73.23/68.34/73.13/75.27 against floors 70/60/70/70, lint 12 errors = the unchanged baseline, worktree clean, no stashes. The retirement itself is done properly: `settlement.tsx`, `payment-method-chooser.tsx` and the print page are gone with their tests, the print URL folds through `retired-routes.ts` with a 308 that the middleware test now pins, the letterbox's ledger line still states number · total · paid · balance · due, and `useNamedInvoice` still honours `?invoice=`.

The problem is everywhere W3b touches ground it did not branch from. Three things:

1. **The merge does not just conflict — it silently mis-compiles.** W3b branched before W3's fix commit `e475a3850`, which deleted the letterbox's `origin` state and rewrote the act to `invoiceLinkPath` + `prefetch={false}`. W3b kept `origin` and added a *new* consumer of it (`linkOrigin={origin}` on `EarlierInvoices`). Git resolves the deletion cleanly outside the two marked hunks, leaving `linkOrigin={origin}` pointing at a variable that no longer exists — and `origin` is a **DOM global** (`lib.dom.d.ts:39127`, `declare var origin: string`), so `tsc` accepts it, jsdom defines it so jest stays green, and the value is wrong on the server. This passes every gate and reaches the Worker. (M1)
2. **`earlier-invoices.tsx` re-introduces exactly what W3's F6 and F13 retired**, and it does *not* conflict, so a correct conflict resolution in `letterbox.tsx` still ships it: N `next/link`s to `/pay/<token>` with default viewport prefetching, built through `invoiceLinkUrl(origin, …)`. F6's argument — a prefetch that ever renders records a view and spends the `PAY_LINK_RATELIMIT` budget — applies to every earlier invoice at once. (M2, M3)
3. **Nothing on the threshold consumes `?checkout=` any more on most households.** The letterbox was one of the two readers; the other, `RoadOrders`, is rendered only when `orders.length > 0 || closedOrders.length > 0` (`the-road.tsx:220-227`), and is not rendered at all on the `LetterboxDoor` path — which is precisely the no-project, studio-invoice household this program exists for. Till params are then never struck out, and `consumeNamedInvoice` returns null *before* its own cleanup whenever `checkout` is present, so `?invoice=` is silently ignored too. `letterbox-door.tsx:27-29` still states the now-false premise this component was built on. (M4, M5)

None of this is large. M1 and M2 are the conflict resolution plus about ten lines in `earlier-invoices.tsx`; M4 is one hook call. But merging as-is ships a client portal that type-checks and tests green and is wrong on the server.

## Findings

| # | Severity | Confidence | Where | Finding | Fix |
|---|---|---|---|---|---|
| M1 | **major** | high | merge result, `letterbox.tsx` (auto-merged region) | The trial merge's `letterbox.tsx` keeps W3b's `<EarlierInvoices … linkOrigin={origin} …>` while integration's deletion of `const [origin, setOrigin] = useState('')` + its mount effect applies cleanly — that region is outside both conflict hunks, so nothing warns. `origin` then binds to the lib.dom global `declare var origin: string` (`node_modules/typescript/lib/lib.dom.d.ts:39127`): **type-check passes**, and jsdom defines `origin` so **jest passes**. In the browser it coincidentally equals the page origin; on the server render (`app/page.tsx` is a server component rendering `'use client'` `LetterboxDoor`/`Threshold`, so `Letterbox` is prerendered) `origin` is not a Node or Workers global — a ReferenceError on the threshold, or at best a value the code does not mean. Both gates are green either way. | Resolve by deleting the prop: `linkOrigin` goes away entirely (see M2). Do not "fix" it by restoring the `origin` state — that reverts F13. |
| M2 | **major** | high | `apps/client-portal/src/components/threshold/earlier-invoices.tsx:79-100, 106-120, 162` | `FoldedInvoiceLink` builds its href with `invoiceLinkUrl(linkOrigin, token)` and `EarlierInvoices` takes `linkOrigin?: string` (default `''`) threaded down from the letterbox's mount effect. This is F13's machinery, re-created in a second file *after* W3's fix commit removed it from the first, and it is the sole reason `origin` still exists in W3b's letterbox. `/pay` is a route of this very portal; `invoiceLinkPath(token)` alone is correct, hydration-safe and free. No conflict marks this file, so it survives a correct `letterbox.tsx` resolution untouched. | Drop the `linkOrigin` prop and its default, import `invoiceLinkPath` instead of `invoiceLinkUrl`, use `href={invoiceLinkPath(invoiceLink.token)}`; update `earlier-invoices.test.tsx:132`, which currently asserts the absolute form via `linkOrigin="https://client.test"`. |
| M3 | **major** | high | `earlier-invoices.tsx:88-98` | The per-row act carries **no `prefetch={false}`**. `ScoredAction` with `href` renders `next/link` (`scored-action.tsx:198-217`) and integration's `e475a3850` explicitly named the prop on the link type for this exact reason. Expanding "Earlier invoices" puts every row's `/pay/<token>` in the viewport at once — F6's harm (a view recorded, `PAY_LINK_RATELIMIT` 30/60s per IP spent) multiplied by the row count, on a household with a long invoice history. W3's own F6 fix protected only the one letter in the slot. | Add `prefetch={false}` to `FoldedInvoiceLink`'s `ScoredAction`, and extend `pay-link.spec.ts`'s "opening the threshold issues no request to `/pay/`" assertion to cover expanding the earlier-invoices fold. |
| M4 | **major** | high | `letterbox.tsx` (checkout-return removal); `the-road.tsx:220-227`; `checkout-return.ts:65-78, 94-110`; `letterbox-door.tsx:139-146` | The letterbox no longer calls `useCheckoutReturn()`, and the only remaining caller is `RoadOrders`, which `TheRoad` renders **only** when `orders.length > 0 \|\| closedOrders.length > 0` — and which `LetterboxDoor` (the no-projects front door, `app/page.tsx:74`) does not render at all. So for a household with no direct orders — every studio-invoice-only household, the case this program was built for — `consumeCheckoutReturn()` never runs. Two consequences: (a) a stale `?checkout=success&session_id=…&invoice=<id>` from an old mail, bookmark or shared address is never struck out and persists for the whole SPA session, in anything the client copies; (b) `consumeNamedInvoice()` (`:98-100`) returns null when `checkout` is present and returns **before** its own `replaceState`, so `?invoice=<id>` is ignored *and* left on the address — the letterbox shows the soonest-due letter, not the named one, with no self-healing. Before W3b the letterbox's own consumer cleaned the address on every such load. | Keep one till reader on the threshold. Cheapest correct form: call `useCheckoutReturn()` in `Letterbox` for its cleanup effect only (render nothing from it), or hoist a single `consumeCheckoutReturn()` to `Threshold`/`LetterboxDoor`. Either restores the address hygiene and lets `?invoice=` resolve on the next load. |
| M5 | minor | high | `letterbox-door.tsx:26-33` | The doc comment that justifies this component's existence now says the opposite of the truth: *"it mounts no letterbox, and the letterbox is the only thing that reads the return from the till: a client who paid would come back to 'no active projects yet' and no receipt"*, and *"the same settlement ceremony unfolding in place"*. After W3b the letterbox reads nothing from the till and there is no ceremony. Left unrevised, the next reader restores settle-in-place on the strength of it. | Rewrite the paragraph with W3b's actual rationale (the door exists for the letterhead and the letter's own address), once M4 is decided — the two answers are coupled. |
| M6 | minor | high | `apps/client-portal/src/components/threshold/letter-payee.ts` | Orphaned. `useLetterPayee` had exactly three importers — `settlement.tsx`, `earlier-invoices.tsx`, `letterbox.tsx` — and W3b removed all three. No test file covers it. It is 100% dead code left in the tree by a wave whose whole purpose is deletion. | Delete the file with the wave. (§14's Delete list does not name it, but §14 also could not know the import graph.) |
| M7 | minor | high | `apps/client-portal/src/components/threshold/instruments/spine-toll.tsx` | Orphaned in production. Its sole non-test importer was `settlement.tsx:17,152,194` (verified on `origin/invoice-standalone/integration`); W2's `app/pay/[token]/invoice-sheet.tsx` does **not** use it. Only `instruments/__tests__/open-chapter.test.tsx:175-241` exercises it now, so ~70 lines of dead component sit inside the coverage numerator. | Delete `spine-toll.tsx` and its `describe('SpineToll')` block, or log it explicitly as a follow-up so it is not mistaken for live scaffolding. Note two comments still cite it as a live precedent (`house-ledger.tsx:30`, `lib/threshold/standing.ts:250`) — those readings survive it and can stay. |
| M8 | minor | medium | deploy sequencing (K9 step 6) | `create-checkout-session/index.ts:502-503` returns legacy invoice payers to `…&checkout=success&session_id={CHECKOUT_SESSION_ID}`. K9 holds W3b's deploy until after soak, which guarantees a window where sessions created by settle-in-place are still open — ACH settles in 3–5 business days. After W3b's deploy those payers land on the threshold and are told **nothing**: no receipt sentence, no confirming state, and (per M4) not even a cleaned address. | Decide the answer explicitly in the deploy report: either keep a minimal legacy receipt line in the letterbox for one deploy cycle, or confirm that no invoice Checkout session created through the letterbox can still be open at cutover. M4's fix does not by itself restore the receipt. |
| M9 | minor | medium | `earlier-invoices.tsx:149-165` | One `useInvoiceLink` query per row, uncapped — `visibleInvoices(invoices)` minus the letter in the slot. Mitigated: rows mount only when the disclosure is `open` (`:148`, `{open && …}`), so a threshold load costs nothing. Still, expanding a long-running project's history fires N `get_invoice_link` RPCs in one frame, and nothing caps N. A dozen is fine; forty is not, and nothing in the code says which this is. | Acceptable to ship. If a cap is wanted, slice the list or add a batched `get_invoice_links(p_invoice_ids)`; either way the current behaviour deserves one sentence in the component doc. |
| M10 | nit | high | `letterbox.tsx:52-58, 108-112` | `designerName` and `onRefetch` are kept on `LetterboxProps` as documented no-ops "so callers that still hand it down need no change of their own". There are exactly two callers (`threshold.tsx:897-903`, `letterbox-door.tsx:139-145`), both in this repo, both a two-line edit. Dead props hide the retirement from the type system: nothing now tells `threshold.tsx` that `refetchInvoices` is no longer wanted here. | Contest: drop both props and both call sites. If M4 is fixed by keeping a till reader, `onRefetch` may earn its place back — decide M4 first. |
| M11 | nit | high | `app/decisions/[id]/record/page.tsx:26,31`; `app/proposals/[id]/record/page.tsx:31`; `components/record/record-sheet.tsx:12`; `app/decisions/[id]/record/__tests__/page.test.tsx:379` | Four live doc comments still cite `/invoices/[id]/print` as the standing precedent for a print sheet that keeps its own route — the exact ruling W3b reverses. `retired-routes.ts:92-97` was rewritten correctly; these were not. The Record of Decision carve-out itself is still right (it has no in-page equivalent); only its cited precedent is gone. | One-line edits: point them at the carve-out's own reasoning rather than at a route that now folds. |
| M12 | nit | high | `components/layout/__tests__/app-chrome.test.tsx:47` | `it.each(['/', '/projects/proj-1', '/invoices/inv-1/print'])` still uses the retired path as a "chrome is shown here" fixture. The test is a pure-function assertion so it passes, but it now asserts chrome behaviour for a URL the middleware 308s away before any page renders. | Swap the fixture for a live path. |
| M13 | nit | medium | `middleware.ts:270-293` | The fold is a **308 permanent** with `Cache-Control: private, max-age=3600`. K9 requires W3b to be separately revertible; after a revert, browsers that already followed the fold hold it for up to an hour and cannot reach the restored print page. The one-hour ceiling is the existing mitigation and is adequate — worth naming in the rollback note, not worth changing. | Record in the deploy report: a W3b rollback needs up to an hour before `/invoices/<id>/print` is reachable again for clients who hit it. |
| M14 | nit | high | branch hygiene | W3b was never rebased onto `e475a3850` or onto `origin/invoice-standalone/integration` (`83f829377`). Every conflict below, and M1's silent breakage, follow from that alone. | Rebase before merging, then re-run the gates on the rebased tip — not on `f640e74b8`. The gate results in this review do **not** cover the merged state. |

Counts: **4 major · 5 minor · 5 nit**, 14 total.

## Trial merge — conflicts and resolutions

The scratch worktree could not be created (the sandbox refuses to write `*/.env.example` during checkout — `services/projects/.env.example: Operation not permitted`), so the merge was computed in-memory with `git merge-tree --write-tree origin/invoice-standalone/integration origin/invoice-standalone/w3b`, which performs the identical three-way merge and writes a real tree (`fb00dac8454b4c980a524ee01dac55652f67a2a4`). No worktree was created and none needs removing.

**2 conflicted files, 4 conflict hunks.** Everything else auto-merges — including, correctly, the deletion of `components/threshold/settlement.tsx`, `components/threshold/payment-method-chooser.tsx` and both their `__tests__` files, while **W2's `app/pay/[token]/payment-method-chooser.tsx` and `app/pay/[token]/__tests__/payment-method-chooser.test.tsx` survive intact** (git recorded W2's as an add, not a rename, so no rename/delete conflict). `app/invoices/` is empty in the merged tree. `middleware.test.ts`, `retired-routes.ts`, `retired-routes.test.ts`, `README.md`, `earlier-invoices.tsx` and `earlier-invoices.test.tsx` all auto-merge.

### `apps/client-portal/src/components/threshold/letterbox.tsx` — 2 hunks

**Hunk 1 (imports, ~:6-11)**
```
<<<<<<< integration
import { invoiceBalanceCents } from '@patina/shared';
import { invoiceLinkPath } from '@patina/utils';
=======
import { invoiceLinkUrl } from '@patina/utils';
>>>>>>> w3b
```
Resolution: **`import { invoiceLinkPath } from '@patina/utils';` alone.** Integration's `invoiceBalanceCents` served `rowSettled` in the checkout-return block that W3b deletes — keeping it is an unused import (lint error). W3b's `invoiceLinkUrl` must lose: `invoiceLinkPath` is F13's fix and the auto-merged body already calls it. Also delete the file's `import { useEffect, useState } from 'react';` line — after this merge neither hook remains in the file.

**Hunk 2 (the link comment, ~:128-135)**
```
<<<<<<< integration
  // the till on it. Additive here: the settle-in-place below stays until W3b.
  // `/pay/[token]` is a route of this very portal, so the root-relative path is
  // the whole address: correct on the server and the client alike, with no
  // origin to read and nothing to reconcile at hydration.
=======
  // the till on it. This is the letter's only act now (W3b).
>>>>>>> w3b
```
Resolution: **keep integration's last three lines** (they explain `invoiceLinkPath`, which survives) and **replace its first line with W3b's**, i.e. `// the till on it. This is the letter's only act now (W3b).` followed by the three `/pay/[token]` lines.

**The unmarked hazard in this same file (M1).** Outside both hunks the merge deletes `origin`/`setOrigin` and keeps W3b's `linkOrigin={origin}`. **Delete the `linkOrigin` prop from the `<EarlierInvoices>` call** as part of this resolution, and apply M2 to `earlier-invoices.tsx` in the same commit. Verified survivors after resolution: `href={invoiceLinkPath(invoiceLink.token)}`, the `prefetch={false}` prop with its comment, and — untouched by W3b — F1's `['invoice-link', id]` invalidations in `packages/supabase/src/hooks/use-invoices.ts` and F2's null-on-refusal.

### `apps/client-portal/src/components/threshold/__tests__/letterbox.test.tsx` — 2 hunks

**Hunk 1 (imports, ~:3-4)**
```
<<<<<<< integration
import type { ReactNode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
=======
import { render, screen } from '@testing-library/react';
>>>>>>> w3b
```
Resolution: **take W3b's line.** `act`/`within`/`userEvent`/`ReactNode` were used only by tests W3b deletes, and the one integration test that must be preserved (below) uses `render`/`screen` only.

**Hunk 2 (the act's assertions, ~:326-365)** — integration holds the F6 prefetch test plus `'keeps the letterbox, the print sheet and the settle-in-place beside it'`; W3b holds the root-relative-vs-absolute href line plus the two negative assertions.

Resolution, in order:
1. `expect(open).toHaveAttribute('href', `/pay/${LINK_TOKEN}`);` — **integration's** root-relative form. W3b's `https://client.test/pay/…` assertion must go; it is F13's absolute form and would fail against the resolved source.
2. **Keep integration's whole F6 test verbatim** — `it('never warms the pay page by scrolling past it')` asserting `data-prefetch` is `'false'`, with its comment.
3. **Delete integration's `'keeps the letterbox, the print sheet and the settle-in-place beside it'` test entirely** (it asserts a `Print` link and an `Open the letterbox` toggle that no longer exist) and **keep W3b's two negative assertions** in its place — no `open the letterbox` button, no `Print` link.

A merge that takes W3b wholesale here silently drops the F6 regression test while M3 leaves an unprefetched link one file away.

## Gate tails (branch `f640e74b8`, worktree `.codex/worktrees/agent-inv-w3b`)

`pnpm --dir <wt> --filter @patina/client-portal type-check` — **exit 0**
```
> @patina/client-portal@0.1.0 type-check .../apps/client-portal
> tsc --noEmit
```

`pnpm --dir <wt> --filter @patina/client-portal test` — **exit 0**
```
Test Suites: 121 passed, 121 total
Tests:       1808 passed, 1808 total
Snapshots:   0 total
Time:        11.967 s
```

`pnpm --dir <wt> --filter @patina/client-portal test:coverage` — **exit 0** (the floors live here, not in `test`: `"test": "jest"`, `"test:coverage": "jest --coverage"`, `jest.config` `coverageThreshold.global` lines 70 / branches 60 / functions 70 / statements 70)
```
All files | 73.23 | 68.34 | 73.13 | 75.27 |
Test Suites: 121 passed, 121 total
Tests:       1808 passed, 1808 total
```

`pnpm --dir <wt> --filter @patina/client-portal lint` — **exit 1, 57 problems (12 errors, 45 warnings)** = the baseline; **delta 0**.
```
✖ 57 problems (12 errors, 45 warnings)
  0 errors and 42 warnings potentially fixable with the `--fix` option.
```
The twelve errors, by file: `app/auth/invite/[token]/page.tsx:111`, `app/auth/verify-otp/page.tsx:131` (×2), `app/field/[token]/site-request-guest.tsx:609`, `app/quiz/results/results-view.tsx:348`, `components/auth/ClientPortalLogin.tsx:120`, `components/proposal-document.tsx:109`, `components/threshold/approval-ask.tsx:1080`, **`components/threshold/letterbox.tsx:129`**, `hooks/use-aesthete-matches.ts:84`, `hooks/use-feature-flag.ts:144`, `hooks/use-hydrated.ts:23`. Every one is pre-existing; the letterbox's is `react-hooks/set-state-in-effect` on `useEffect(() => setOrigin(window.location.origin), [])` — the same line the base carried, moved. Worth noting: **resolving the merge as prescribed removes that effect, so the merged tip should lint at 11 errors, not 12.** A merged tip that still reports 12 with a letterbox line in the list means `origin` was restored and F13 reverted.

Worktree hygiene: `git -C <wt> status --porcelain` empty, `git -C <wt> stash list` empty. The `git stash` the implementer used to measure the lint baseline left nothing behind.

## Deviation rulings

| Deviation | Ruling |
|---|---|
| **`earlier-invoices.tsx` rewritten**, though §6/§14's W3b paragraph names only `letterbox.tsx`, `settlement.tsx`, `retired-routes.ts` and the print page | **Accept the rewrite as in scope, contest its content.** The file imported `Settlement` and `useLetterPayee` directly (`:29-30` at base) and rendered a per-row settle panel and a per-row `/invoices/<id>/print` link; deleting `settlement.tsx` and retiring the print sheet makes touching it unavoidable, and §14 simply did not trace the import graph. What is not accepted is that the rewrite re-created the `origin`/`invoiceLinkUrl` pattern (M2) and shipped unprefetched links (M3) — both regressions against fixes that had already landed on the branch it should have been rebased onto. |
| **`middleware.test.ts` edited** — `/invoices/inv-1/print` moved out of the "leaves %s alone" list and into the fold table | **Accept, required.** Not editing it would have left a test asserting the exact behaviour the wave reverses; the move is the minimal correct edit and the 308 + `#letterbox` + `?invoice=` assertions all come with it. `retired-routes.test.ts`'s renamed case is likewise correct. |
| **Stale doc mentions left** in `decisions/[id]/record/page.tsx` ×2, `proposals/[id]/record/page.tsx`, `record-sheet.tsx`, and the `app-chrome.test.tsx` fixture | **Contest — M11, M12.** `retired-routes.ts:92-97` was rewritten because the brief named it; the four sibling comments cite the same retired ruling and were missed. Each is one line. The Record of Decision carve-out itself remains correct and must not be folded. |
| **Not rebased** onto `e475a3850` / `83f829377` | **Contest — M14.** This is the root cause of M1, M2, M3 and both conflict sets. Rebase, resolve as prescribed, re-run the four gates on the rebased tip. |
| **`designerName` / `onRefetch` kept as documented no-op props** | **Contest — M10.** Two in-repo callers; keeping dead props to avoid a two-line edit hides the retirement from the type system. |
| **iOS untouched** despite §14 listing `InvoicesAPIClient.swift:257-277` and `InvoiceDetailView.swift:255` under W3b's modify set | **Accept.** K9 makes iOS a W4 follow-up TestFlight build, and K9 wins over v2. Verified independently: no Swift source under `apps/mobile/Patina` emits an `/invoices/<id>/print` URL, and `InvoicesAPIClient.startCheckout` (`:257-277`) invokes `create-checkout-session`, which W3b does not touch and which stays live for iOS and the designer portal. Nothing iOS reaches breaks on this deploy. |

## Verified correct

- **Deletions are complete and land cleanly through the merge**: `components/threshold/settlement.tsx` (217 lines), `components/threshold/payment-method-chooser.tsx` (207), `__tests__/settlement.test.tsx` (287), `__tests__/payment-method-chooser.test.tsx` (178), `app/invoices/[invoiceId]/print/page.tsx` (391). `app/invoices/` is empty in the merged tree; **W2's moved chooser at `app/pay/[token]/` survives with its tests**.
- **No dangling imports** anywhere under `apps/client-portal/src` for `settlement`, `payment-method-chooser`, `useLetterPayee` or `/invoices/<id>/print` as a *link producer*. The only remaining `Settlement` identifiers are `road-orders.tsx`'s own local `settlement` variable (the road's return, unrelated) and prose in comments.
- **No link producer anywhere in the repo still emits `/invoices/<id>/print`** — checked `apps/client-portal/src`, `apps/designer-portal/src`, `packages/`, `supabase/functions/`, and `apps/mobile/Patina` Swift. Remaining hits are comments, a test fixture (M12) and the fold itself.
- **The print fold is correct.** `retired-routes.ts:147-162` widens the `invoices` case to `segments.length === 2 || (segments.length === 3 && third === 'print')`, mirroring the `proposals`/`sign` pattern exactly, and keeps `?invoice=<second>` gated on `ID_SEGMENT`. `third` is in scope (`:114`). The `:89-101` comment block correctly removes the print sheet from the carve-out list and keeps `/decisions/<id>/record` and `/proposals/<id>/record` on it with their reasoning intact. `middleware.ts:270-293` issues the 308 with the anchor after the query, and `middleware.test.ts:421` + `retired-routes.test.ts:59-65` both pin the new behaviour.
- **The letterbox's ledger line is intact**: `${number} · ${total} total · ${paid} paid. Balance ${balance}${, due …}` (`:176-186`), with the studio-invoice `From the studio · not for a house` and `regarding` lines preserved, `data-never-dim` preserved, and the empty state unchanged.
- **`useNamedInvoice` still honours `?invoice=`** (`:115-118`), so the print fold's `?invoice=<id>` names the right letter — subject to M4, which is the case where a `checkout` param suppresses it.
- **"Open the invoice" is the only act**, rendered only when `invoiceLink` resolves — no greyed-out act with no reason (R51, consistent with W3's F8).
- **The client portal no longer calls `create-checkout-session` at all** — `useStartCheckout`, `useInvoicePaymentOptions` and `useNotifyCheckIntent` have zero consumers under `apps/client-portal/src` after this wave. That is the intended end state (the pay page goes through `invoice-link-checkout` server-side), and the function stays deployed for iOS and the designer portal.
- **`threshold.test.tsx`'s deletions are honest**: the three now-unused `@patina/supabase` mocks and the payee test (`"makes the check out to the letter's studio…"`) covered settle-in-place only, and coverage still clears every floor with margin after removing ~800 lines of tests.
- **README route map** gains the `/invoices/[id]/print` → `#letterbox` row in the right table and documents `/pay/[token]` in the public-routes list.
- **Commit hygiene**: two Conventional-Commit `refactor(...)` commits, cleanly split (the retirement, then the print fold), each independently revertible as K9 requires.
