# W0-fix — review fixes

Lane: W0 FIX (wrote none of the code under review).
Worktree `.codex/worktrees/agent-lens-w0-fix`, branch `document-lens/w0-fix`,
cut from `document-lens/integration` @ `70cd06747`. Date 2026-08-29.

Sources: `build/w0-review-correctness.md` ("Fixes required before ship" +
"Should fix"), `build/w0-review-fidelity.md` (same two sections),
`build/design/technical-design.md` OD-16, `build/seed/seed-notes.md`.

---

## 1 · Seed — `damage_claims` for the console

**Finding:** fidelity **L2-5** (high, 0.9).

**What changed:** `scripts/the-document-lens-seed.sql` — new declared id
`v_claim_fdl = b0000000-0000-0000-0005-00000c1a0901`; a `damage_claims` INSERT
after the receiving inspections, hung off `v_ri_fdl`, with `ffe_item_id` = the
console (FF&E n=1), `state = 'drafted'`, `vendor_notified_at NULL` (drafted,
not filed) and a description carrying the same `CURRENT_DATE + INTERVAL '1 day'`
carrier-claim window the line's `blocked_reason` prints. A `DELETE FROM
damage_claims` is placed **before** the `receiving_inspections` DELETE, because
`damage_claims.receiving_inspection_id` is `ON DELETE RESTRICT` (the ordering
00151 documents for the app's own delete path) — without it, run 2 would fail.
`build/seed/seed-verify.sql` gains **"open damage_claims on a line of this
project = 1"**, joined through `project_ffe_items`.

**Evidence:** traced `deriveLineStamp` (`stamp-derivation.ts:97-108`) — the
`'damaged'` branch reads `item.item_claims`, the PostgREST embed
`item_claims:damage_claims!ffe_item_id(id,state,created_at)`
(`packages/supabase/src/hooks/use-project-v2.ts:192`), for a row in
`drafted`/`vendor_notified`; `damage_claims` schema is 00150 (+ `ffe_item_id`
in 00196). No trigger drafts one — 00184's `receiving_inspection_side_effects()`
touches only `purchase_orders`/`po_payments`/item statuses; 00150's
"auto-drafted" comment describes `useCreateReceivingInspection`. Verify now
reads `open damage_claims on a line of this project = 1 | = 1 | PASS`.

---

## 2 · Seed — `blocked = true` on the COM line

**Finding:** fidelity **L2-6** (high, 0.85).

**What changed:** the FF&E insert's `blocked` value goes from `(n = 1)` to
`(n IN (1, 2))`, and the `blocked_reason` CASE gains an `n = 2` arm
("Customer's own material — held for the client's fabric decision."). Verify
gains **"blocked lines = 2 (console + COM)"**.

**Evidence:** `deriveLineStamp`'s `'decision_due'` branch requires
`item.blocked === true` **and** a pending `blocking_decision`; line n=2 carried
`blocked_by_decision_id = v_dec_com` (a genuinely pending decision) with
`blocked = false`, so it would have printed as an ordinary line and read as
orderable everywhere `.blocked` gates authorization. Margin split is unmoved —
00194's decision branch joins `blocked_by_decision_id` directly, not the
boolean — and verify still reads 3 / 4 / 7.

---

## 3 · Seed — install date exactly `now() + 21d`

**Finding:** fidelity **L2-7** (medium, 0.7) and **L2-8** (medium, 0.9).

**What changed:** `v_install_date := CURRENT_DATE + 21`, replacing
`(CURRENT_DATE + 21) + ((2 - EXTRACT(DOW FROM CURRENT_DATE + 21)::int + 7) % 7)`
("next Tuesday on/after +21d"). Verify gains **"install milestone =
current_date + 21"**, which prints the actual anchor date beside the expected
one rather than a bare boolean.

**Evidence:** the old expression ranged 21–27d by run day; on 2026-08-29 it
computed 2026-09-22 (+24d), and a +27d landing rounds to four weeks, not the
reconciliation's required "3 WEEKS". Verify now reads
`install milestone = current_date + 21 | 2026-09-19 | 2026-09-19 | PASS`.

---

## 4 · Seed — local-only guard

**Finding:** correctness **L2-1** (high, 0.85).

**What changed:** line 1 of the script is now `LOCAL DEV ONLY — never run
against Strata (or any other hosted database).`; the "safe to re-run against a
live DB" phrase is deleted; and a `DO $$ … $$` guard runs **above** the main
block, refusing on either of two independent conditions — `auth.users` has no
`designer@patina.dev` fixture, or `inet_server_addr()` is a routable address
(NULL, `127.0.0.0/8`, `::1`, `10/8`, `172.16/12`, `192.168/16` allowed). Per
the brief, the `server_version_num` clause was dropped; only the fixture check
and the address check ship.

**Evidence:** both halves proven, not assumed.

```
# fixture half — email substituted in a scratch copy under $TMPDIR
ERROR:  the-document-lens-seed: local dev only (designer@patina.dev fixture not found)
CONTEXT:  PL/pgSQL function inline_code_block line 6 at RAISE

# address half — predicate evaluated against a sample set
127.0.0.1/32   t     52.1.2.3/32    f
::1/128        t     2600::1/128    f
172.17.0.3/32  t
10.1.2.3/32    t
192.168.1.9/32 t

# live server, over the socket docker exec uses
inet_server_addr() → NULL (unix socket)
```

---

## 5 · Seed — idempotency and id families

**Findings:** correctness **L2-4** (low, 0.95), **L2-3** (medium, 0.8),
**L2-5** (low, 0.8 — the single-transaction proof).

**What changed:**

- **`po_payments.due_date`.** `delivered_date` is now a column of the
  `purchase_orders` upsert (NULL for all four) and is reset on conflict
  (`delivered_date = EXCLUDED.delivered_date`). Trigger C shifts a net-30
  balance's `due_date` only when `delivered_date` transitions **from NULL**
  (00184's `v_delivered_was_null`), so a run-1 value left in place made run 2
  re-insert the payments with `due_date NULL`.
- **Id families.** The four `client_decisions` constants move from
  `b0000000-0000-0000-0005-00000000080{1,2,3,4}` to the sub-prefix `dec`:
  `…-00000dec080{1,2,3,4}`. FF&E ids are minted `lpad(to_hex(2000 + n), 12, '0')`
  = `0x7d1…0x80e`, so the old decimal-looking constants were literally the ids
  of FF&E lines n=49…52 — `v_dec_com` was both the id of FF&E line n=50 and the
  value of line n=2's `blocked_by_decision_id`. The FF&E band is untouched, so
  no line id moves.

**Evidence:**

```
# po_payments, run 1 vs run 2 in one transaction (was: run 2 = NULL)
RUN1|CM-1187|balance|2026-09-24|pending|2026-08-25
RUN2|CM-1187|balance|2026-09-24|pending|2026-08-25
RUN1|FDL-0912|balance|2026-09-22|pending|2026-08-23
RUN2|FDL-0912|balance|2026-09-22|pending|2026-08-23
```

Re-validation, twice, in rollback transactions, diffed:

1. Seed ×2 back-to-back in ONE `BEGIN; … ROLLBACK;`, verify after each →
   17/17 PASS each; `diff` of the two tables → **identical**.
2. TWO independent `BEGIN; <seed>; <verify>; ROLLBACK;` transactions — so the
   proof is not confined to one frozen `now()`, which is exactly what
   correctness L2-5 said the original harness could not show → 17 rows each,
   `diff` → **identical**.

Both unsandboxed (`docker exec` needs the bypass), logged in
`build/seed/seed-notes.md`.

**For-keeps apply.** Done once, at the end, after validation. The local DB
held the four decisions at the OLD colliding band; since `client_decisions` is
create-once, they were removed first in a one-off outside the seed (options
before parent, as `postgres`, which takes the guard's `v_maintenance` branch):
`DELETE 6` options, `DELETE 4` decisions. Then the seed and the verify. The
first verify read `total = 8` because of an ambient idle `project_time_entries`
row (`timer_auto`, `raw_seconds = idle_seconds = 1082`, from a document left
open in a browser) — not seed data; the seed creates no time entries. Removed,
then:

```
                       check_name                       |   actual   |  expected  | result
--------------------------------------------------------+------------+------------+--------
 a non-clean receiving_inspections row exists           | 1          | >= 1       | PASS
 a separate PO reaches clean-delivered >= 1             | 1          | >= 1       | PASS
 blocked lines = 2 (console + COM)                      | 2          | = 2        | PASS
 damaged = 1                                            | 1          | = 1        | PASS
 install milestone = current_date + 21                  | 2026-09-19 | 2026-09-19 | PASS
 lines >= 60                                            | 62         | >= 60      | PASS
 lines with product >= 40                               | 58         | >= 40      | PASS
 margin_items beside Pieces (anchor=line) = 3           | 3          | = 3        | PASS
 margin_items total = 7                                 | 7          | = 7        | PASS
 margin_items whole job (anchor=letterhead/section) = 4 | 4          | = 4        | PASS
 open damage_claims on a line of this project = 1       | 1          | = 1        | PASS
 overdue approvals = 2                                  | 2          | = 2        | PASS
 PO unacknowledged >= 14d = 1                           | 1          | = 1        | PASS
 pre-work doc d6 exists (sent, unopened)                | 1          | = 1        | PASS
 purchase orders >= 3                                   | 4          | >= 3       | PASS
 rooms >= 4                                             | 5          | >= 4       | PASS
 unspecified = 2                                        | 2          | = 2        | PASS
(17 rows)
```

Status distribution and counts unchanged: approved 11 · delivered 3 ·
installed 10 · ordered 2 · production 2 · quoted 11 · shipped 10 ·
specified 13; rooms 5 / lines 62 / with product 58.

---

## 6 · `contrast.test.ts` — glob and floor

**Findings:** correctness **L1-1** (medium, 0.95) and **L1-2** (medium, 0.85);
fidelity L1-6.

**What changed:** `resolveRailFiles()` now excludes `*.test.tsx` in **both**
arms (top-level `spine*.tsx` and the `spine/` subdirectory). The floor moves
from `>= 5` to `>= 3`, with a comment naming OD-16's deletions as the reason —
`spine-timer.tsx` in W1, `spine-running-index.tsx` + `spine-shelved-blocks.tsx`
in W2, leaving `doc-spine.tsx` + `spine/lens-ladder.tsx` + `margin-rail.tsx`.
The test's name changed accordingly ("…at least the floor the ladder leaves
standing"). The `PAPER_FILES` slot is untouched, as instructed.

**Evidence:** the resolver was enumerated by temporarily raising the floor to
99 and reading the failure's `Received:` line.

| tree state | files resolved |
|---|---|
| before the exclusion (per the correctness review) | 6 — five sources plus `doc-spine.test.tsx` |
| after the exclusion, no `spine/` dir | **5** |
| after the exclusion, with `spine/_probe.tsx` **and** `spine/_probe.test.tsx` | **6** |

The last row proves both things at once: the `spine/` subdirectory arm works
(5 → 6 when the probe lands), and the exclusion applies there too (the sibling
`_probe.test.tsx` is not counted). The probe directory was removed immediately;
`git status` on `src/components/document/` came back clean.

`contrast.test.ts` alone: **53 passed**.

---

## 7 · E2E re-pointing (fidelity L3-3 / L3-4 / L3-5 / L3-6)

Full table, per-item evidence and the un-sandboxed command list are in
`build/e2e-baseline.md` → "W0-fix — quarantine re-points". In brief:

| item | disposition | one line |
|---|---|---|
| (a) `plan-room.spec.ts` | **un-quarantined, green** | Empty state re-pointed at the copy and control that print (`plan-room-set.tsx:150-152`), scoped by `[data-action-key="choose-plan-pdf-empty"]` because the intake strip carries a second "Choose a PDF". 1 passed. |
| (b) `margin-handoffs.spec.ts` — the sentence | **un-quarantined, green** | Re-pointed at the red-letter sentence that actually prints ("3 decisions overdue — oldest due Aug 24"), and the supersession itself (`#document-next-up` count 0) is now asserted. The fixture is shared across sibling specs and out of this lane's file list, so adjusting it was not an option. |
| (b) `margin-handoffs.spec.ts` — the guide act | **stays fixme, reason re-verified** | Measured: the zone's act routes to `needGuideAction`'s `document-decision-controls` anchor (`document-guide.ts:504-506`), a node with count 0 on this page; the margin trigger stays `aria-expanded="false"` and focus lands on `doc-section-install`. Ruling V's behaviour exists nowhere here, so it is fixme'd with that fact rather than re-pointed to something weaker. |
| (c) `action-visibility.spec.ts:213` | **un-quarantined, green** | Rewritten to the current act at 390 on `/desk`: the bar is the one edge owner but carries no `capture-lead` and prints its `In hand / Today` glance; the head keeps the one primary; pressing it opens a `Capture a lead` sheet whose fields and panel fit inside 390px. Needed a hydration barrier (wait for a `[data-roster-line]`) — under `next dev` the first press was landing on unhydrated markup and being lost. |
| (c) page-level scroll assertion | **new fixme, split out** | `/desk` at 390 has 47px of latent horizontal overflow **before anything opens** (`scrollWidth` 437 vs `innerWidth` 390), from the desk roster's own lines (`li.has-wash.doc-rule-hair` 410 vs 336). Not the sheet, not the dev overlay (removing `<nextjs-portal>` still leaves 437), no rect crosses the right edge; `body` has `overflow-x: hidden` so nothing scrolls today. Pre-existing on `main@dab057537`. Split out rather than dropped. **Owner-owed.** |
| (d) `arrival-arc.spec.ts` | **stays fixme, reworded OBSOLETE** | "the component this spec drives is unmounted on every route since I150 — DELETE THIS TEST WITH THE COMPONENT". Added to `e2e-baseline.md` as owner-owed. |

Never weakened: no timeout raised, no `toBeVisible` softened, no assertion
dropped without a fixme carrying the measurement behind it.

---

## 8 · The landing-clearance spec, run explicitly

**Finding:** correctness **L1-10** (high, 0.95) — the wave's ship gate.

```
npx playwright test e2e/document/quiet-responsive-shell.spec.ts --project=chromium --workers=1 --reporter=list
→ 7 passed (40.2s)
```

The new test's line:

```
✓  7 [chromium] › e2e/document/quiet-responsive-shell.spec.ts:271:7 › Quiet Work responsive document shell › at 1440, a running-index jump to Money lands clear of the pinned ticket seam (6.0s)
```

---

## 9 · Bookkeeping

**Finding:** correctness **X-1**; fidelity **L1-7**, **L1-8**, **X-1**.

- `build/test-impact.md` — "W0: +1 test" reconciled to **+3**, 0 suites, with
  all three named (the `page.test.tsx` mount-order test plus the two
  `contrast.test.ts` additions) and the measured pair 458/5170 → 458/5173.
  Noted that W0-fix itself adds no test: it edits the two `contrast.test.ts`
  additions in place.
- `build/design/deviations.md` — the stub gains its first two rows:
  - `D-B3 · landing-clearance spec targets --doc-seam-height until W3 retargets
    to --doc-landing-clear · ruled by ARCHITECT (pre-agreed in OD-9)`
  - `D-B4 · contrast rail floor ≥3 (OD-16 deletions)`
- `build/e2e-baseline.md` — new "W0-fix — quarantine re-points" section: the
  updated quarantine table, the three owner-owed items, the L1-10 run, and
  "Commands run unsandboxed (W0-fix)".
- `build/seed/seed-notes.md` — the five seed corrections, the validation
  harness, the for-keeps apply and its verify table, the ambient-timer caveat,
  and the "re-run after every `supabase:reset`" reminder (correctness L2-6).

---

## Gates (in the worktree)

| Gate | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal test -- --ci --silent` | **458 suites / 5173 tests, all passed** — matches the reconciled arithmetic exactly; no test added or removed by this lane |
| `pnpm --filter @patina/designer-portal lint` | 202 problems — **2 errors, 200 warnings**. The two errors are the known do-not-touch pair: `piece-room-save-gate.test.tsx:159` (`Definition for rule 'import/first' was not found`) and `use-commercial-documents.test.ts:930` (`react-hooks/rules-of-hooks` in `mutationFnOf`). Neither is in a file this lane touched. |
| `quiet-responsive-shell.spec.ts` | 7 passed |
| `plan-room.spec.ts` | 1 passed |
| `margin-handoffs.spec.ts` | 4 passed, 1 skipped |
| `action-visibility.spec.ts` | 3 passed, 1 skipped |
| `arrival-arc.spec.ts` | 1 skipped |
| `desk-walkthrough.spec.ts` | 3 passed |

## Not done, deliberately

- **Correctness L1-9** ("run one `pnpm --filter @patina/designer-portal build`
  so the `browserslist` change is exercised") is in the review's gating list
  but not in this lane's fix list, and `package.json` is not in this lane's
  file list. Left for whichever lane owns it. Flagged here so it is not lost.
- The "should fix, not gating" items outside the brief (L1-3 offender form 2,
  L1-4 `lens-band.tsx` path, L1-6, L1-11 seam floor, L2-2 hard-coded "Aug 13",
  L2-11 `psql -U postgres` header line, L3-2, L3-3 rename, L3-6 `limit 1`,
  L3-8) were not touched — no unrequested changes.
