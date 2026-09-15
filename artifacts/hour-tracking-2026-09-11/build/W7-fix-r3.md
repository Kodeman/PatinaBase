# W7 — fix round 3

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal` · **branch** `hour-tracking/portal`
**Findings in scope:** W7-R3-01 (major) — **closed in code**. W7-R3-02 (major, cross-wave, ruling-gated) — **named in code, ship-report line drafted below, ruling row drafted for the orchestrator; NOT resolved in code, deliberately.**
**Migrations touched:** none. `00618` / `00619` are byte-unchanged, so this round owes no `db reset`, no `db:generate`, no `generate-legacy-grants.py`, and no SQL-suite run. Three portal files changed, one of them a test.

---

## W7-R3-01 — the latched disclosure survived the opt-out it invites, and swallowed the fallback act

**Confirmed exactly as written, and it is this stage's own regression** — the latch that closed W7-R2-02 introduced it.

The chain, re-read end to end:

- `AccountSheet` is mounted unconditionally in `(document)/layout.tsx:112`, beside `KeysSheet`, `LogTimeOverlay`, `CommandBar` and the rest of the always-mounted overlay family. It is opened by event (Studio Drawer nameplate, mobile drawer, ⌘K), **not** navigated to — so the document underneath stays held, `DocumentTimeProvider` never unmounts, and `latched` is still `true` while she is looking at her own profile.
- `latched` was dropped only by `held` going false (`:817-819`) or by `dismissed`. Nothing dropped it on `optedOut`.
- `showDisclosure` is the **first** branch of `AutostartBand`; the HT-35 fallback (`The clock is yours to start on this document.` + `Start the clock`) is the second. A stale `showDisclosure` therefore did not merely say the wrong thing — it returned before the one-tap act the ruling makes the opt-out fall back to could render.

So the shipped sequence was: she reads *"You can turn that off on your profile"*, does precisely that, comes back, and the sentence still asserts *"Patina keeps the time for you"* over a document whose clock will not start, with no act offered.

**Fix — two lines, both in `apps/designer-portal/src/hooks/document-time-provider.tsx`.**

```ts
const showDisclosure =
  held && !dismissed && !optedOut && (latched || (undisclosed && !stamped.current));
…
useEffect(() => {
  if (latched && (!held || optedOut)) setLatched(false);
}, [latched, held, optedOut]);
```

1. `!optedOut` on `showDisclosure` — the finding's own prescription. The sentence stops the instant the preference reads declined, and the fallback branch beneath it becomes reachable in the same render.
2. The un-latch effect now also fires on `optedOut`. This is not belt-and-braces on (1): without it, a member who opts out and then changes her mind **inside the same held document** would find the sentence back on screen, because `latched` was still true and would win the `||`. With it, `latched` is gone by then and `undisclosed` is false (her profile carries the stamp), so HT-35's "once, and never again" holds through the round trip both ways.

The stamping effect, the event, the `stamped.current` session guard and both bands' markup are untouched.

**Regression case added** (`document-time-provider.test.tsx`, HT-35 block):
*"stops asserting the automatic clock the moment she declines it, and offers her the manual one instead"* — hold with `disclosedAt: null`, wait for the band, flip the mocked preference to `{optedOut: true, disclosedAt: <stamp>}` and re-render, then assert (a) `Patina keeps the time for you` is **gone**, (b) `The clock is yours to start on this document.` is on screen, (c) the `Start the clock` button is present. It reproduces the live shape rather than a proxy: the document is still held and the band still latched at the moment the preference changes, which is exactly what the always-mounted sheet produces.

**Falsifier run.** With both lines reverted to the round-2 text, that one case fails and the other 22 pass:

```
✕ stops asserting the automatic clock the moment she declines it, and offers her the manual one instead (4 ms)
Tests: 1 failed, 22 passed, 23 total
```

The fix was restored from the pre-falsifier copy immediately afterwards and the suite re-run green (23/23).

---

## W7-R3-02 — the evening hour that carries two dates

**Confirmed. Not repaired in code, and that is the correct outcome, not an omission.**

Re-read, all four sites:

| Site | What it says the day is |
|---|---|
| `components/document/time-capture.tsx:286-296` (`startedAtFromDateValue`, W3) | keeps the **local** time-of-day, moves only the **local** date, returns `toISOString()` |
| `public.time_entry_ledger` viewdef (W2, `00604`) | `(started_at AT TIME ZONE 'UTC')::date AS day` |
| `hours-ledger.tsx:458` (her own Hours list) | `new Date(e.started_at).toDateString()` — **local** |
| `hours-ledger.tsx:1810` (scope lens) and `:625` (`useTimeEntryLedger`, W5's CSV/statement) | `row.day` — the view's **UTC** date |

A Chicago designer who names `2026-09-01` at 19:30 CDT stores `2026-09-02T00:30Z`: her list prints Sep 1, her admin's lens prints Sep 2, the bookkeeper's export prints Sep 2. Every evening from 19:00 CDT / 17:00 PDT, which is ordinary working time for this program's customer. `isBackdatedEntry`, the day buckets and every period filter inherit the same shift.

**Why no code fix.** Both repairs the finding names change what a day *means*, for every row and every surface at once:

- deriving `day` `AT TIME ZONE` a studio timezone requires a studio timezone column that does not exist, and a rule for the studio-less legacy project (`rate_source='none'` today);
- storing a date column beside the instant decides that the day the member **named** is authoritative over the instant, which is a different contract for the invoice, the CSV and `guard_invoiced_time_entry`'s frozen `started_at`.

Neither is this program's to pick under §0's "don't resolve an unruled question in code", and W2's view plus W3's helper are both merged and shipped-adjacent. A third option — "tidy" `startedAtFromDateValue` into UTC — is actively wrong and is named as such in the code, because it would move the day she named, which is the half that is already right.

**What this round did do:**

1. **A named, unmissable comment at the origin** — `time-capture.tsx`, on `startedAtFromDateValue`: the two zones, the worked 19:30 CDT example, the three read sites, the owed ruling, and an explicit "do not tidy this into UTC on its own". A later hand meeting this helper now cannot re-derive the divergence from scratch or half-fix it.
2. **The ship-report line, drafted verbatim** (below) — the finding's stated minimum.
3. **A ruling row, drafted for the orchestrator to file** (below). I did not edit `rulings.md` myself: it is the panel's sheet, this is a new question rather than an amendment to an existing row, and a fix agent minting ruling ids in a shared append-only file is the collision class §0.2b exists for.

> ### Ship-report line (paste as-is)
>
> **Known, unruled — the evening hour carries two dates.** An hour whose date is typed on the Hours add row or the ⌘K verb is stored at the member's *local* time of day on the day she named, while `public.time_entry_ledger` derives its `day` in UTC. From 19:00 CDT (17:00 PDT) onward the two disagree by one day: her own Hours list shows the day she typed; the studio scope lens, the CSV export and the weekly statement show the next one. **Do not reconcile a bookkeeper's export against a designer's own Hours view for evening hours until the zone is ruled.** No money is wrong — rates, amounts and the invoice lock read the instant, not the day — only which calendar day an hour is filed under, and therefore which week a boundary-evening hour lands in on the export. Origin: `time-capture.tsx:286` (W3) against `00604`'s view (W2); found W7 review round 3 (W7-R3-02).

> ### Owed-ruling row, drafted (for `rulings.md` → "Sub-rulings and owed rulings"; id is the orchestrator's to mint — HT-13-a is the natural parent)
>
> | **HT-13-a** | HT-13 (sub-ruling) | Which zone does an hour's *day* belong to — the member's local one, or the studio's? `startedAtFromDateValue` files the day she typed at her local time of day; `time_entry_ledger.day` is `(started_at AT TIME ZONE 'UTC')::date`, so from 19:00 CDT onward her Hours list and the CSV/statement/scope lens name different days for the same hour. | The studio's, almost certainly — it is the bookkeeper's week that the export has to close. Then either derive `day` `AT TIME ZONE` a studio timezone column (new column, plus a rule for a studio-less legacy project), or store a named date beside the instant and let every surface read that. Ruling first; neither shape is safe to guess, and both touch W2's view and W5's export. | W7 review round 3 (W7-R3-02) | *unruled* | — |

**What remains uncovered, stated plainly.** The suite still cannot see this: round 2's clock pin (`PINNED_NOW = 2026-09-13T12:00:00.000Z`, midday UTC, in `command-bar-log-time.test.tsx` and `hours-ledger-add-row.test.tsx`) keeps both assertions true at every hour, which is right for a gate but means no test goes red on the product defect. Unpinning would buy a suite that is red every evening and still would not repair anything. The right coverage — one SQL case asserting that the ledger's `day` equals the day the member named, in the ruled zone — is writable only once the zone is ruled, and is named here so it is not forgotten with the ruling.

---

## 390 / 1440

**No control was added, removed, or re-styled.** Both bands' markup is byte-identical to what round 1 shipped and round 2 audited — `mx-auto max-w-[1180px] px-4 py-2`, `flex flex-wrap items-center justify-between gap-x-4 gap-y-1`, paragraph `t-body-sm`, act `min-h-11 shrink-0` (44px, house sheet §A), no fixed width and no `min-width` anywhere. The change is which of the two branches renders in one state.

What *is* new is that the fallback band is now **reachable** in a state it could not previously be reached in (opted out while a latched disclosure stood). That band is the same element the round-1 pass and the existing HT-35 case *"and the one-tap start is offered on the page while she holds a document"* already cover, so there is no unmeasured layout — but it is a **static audit of unchanged markup plus a jsdom render**, not a browser walk at 390, and I am saying so rather than implying a device pass. The comment-only edit in `time-capture.tsx` renders nothing.

---

## Gates run (this worktree, absolute paths)

| Command | Result |
|---|---|
| `pnpm --dir …/apps/designer-portal test -- src/hooks/document-time-provider.test.tsx` (falsifier, fix reverted) | **RED — 1 failed / 22 passed**, and the failure is the new case (reproduction of the defect) |
| `pnpm --dir …/apps/designer-portal test -- src/hooks/document-time-provider.test.tsx` (fix restored) | **23 passed / 23** |
| `pnpm --dir …/apps/designer-portal type-check` (`tsc --noEmit`) | **clean, no output** |
| `pnpm --dir …/apps/designer-portal test` (full suite) | **580 suites passed / 580 · 7413 tests passed / 7413** (7412 before + the 1 added) |
| `pnpm --dir …/apps/designer-portal lint` (`eslint .`) | **0 errors**, 201 warnings — identical count to round 2, all pre-existing "unused eslint-disable", none on a touched file |

Not run, and why: `supabase db reset`, `run-sql-tests.sh`, `pnpm db:generate`, `generate-legacy-grants.py` — no migration, no SQL, no schema-shaped file was touched this round, so each would measure the round-2 state, not this one. `pnpm --filter @patina/admin-portal build` — §0.24 makes it the mandatory gate **after a `packages/*` edit**; this round edits `apps/designer-portal` only, and the designer portal's own `tsc --noEmit` is its real type gate.

> `turbo run type-check --filter=@patina/designer-portal` aborts in this sandbox with `Git error: …/apps/designer-portal/.env.local: Operation not permitted` — turbo's own git scan touching a denied path, not a type error. The package script (`tsc --noEmit`) was run directly instead; it is the same compiler invocation turbo would have made.

---

## Files changed

| Path | Change |
|---|---|
| `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal/apps/designer-portal/src/hooks/document-time-provider.tsx` | W7-R3-01: `!optedOut` on `showDisclosure`; un-latch on `optedOut`; the two comments that carry the overlay-not-a-route constraint the code cannot show |
| `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal/apps/designer-portal/src/hooks/document-time-provider.test.tsx` | W7-R3-01: one regression case (+38 lines) |
| `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal/apps/designer-portal/src/components/document/time-capture.tsx` | W7-R3-02: comment only on `startedAtFromDateValue` — the two zones, the owed ruling, and the half-fix to refuse |

## Carried to the orchestrator

1. **File the HT-13-a row** (drafted above) and **carry the ship-report line** into the program's ship report. W7-R3-02 is closed only when the zone is ruled.
2. Untouched by this round and still open from review round 3: **W7-R3-03** ($0 bound rate, server side), **W7-R3-04** (internal hour invalidates no cache), **W7-R3-05** (⌘K studio door untested + stale comment), **W7-R3-06** (multi-studio internal hour, ruling owed), and whatever follows them — none were in this brief's scope.
