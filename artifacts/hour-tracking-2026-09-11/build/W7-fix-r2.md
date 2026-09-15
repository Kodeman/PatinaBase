# W7 — fix round 2

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal` · **branch** `hour-tracking/portal`
**Findings applied:** W7-R2-01 (blocker), W7-R2-02 (major), W7-R2-03 (major). All three closed.
**Migrations touched:** none. `00618`/`00619` are unchanged, so no `db reset`, no `db:generate`, no grants regeneration is owed by this round.

---

## W7-R2-01 — `pnpm --filter @patina/designer-portal test` was red after 19:00 CDT

**Reproduced before touching anything**, at 19:34 CDT (00:34 UTC):

```
● the Hours add row › sends the date it shows as started_at …
    Expected: "2026-08-04"   Received: "2026-08-05"
● ⌘K · Log time › writes source='command_bar' with the date …
    Expected: "2026-09-01"   Received: "2026-09-02"
Test Suites: 2 failed, 2 total · Tests: 2 failed, 23 passed
```

The reviewer's mechanism is exact. `startedAtFromDateValue` (`time-capture.tsx:286-297`) copies `now`, calls `setFullYear(y, m-1, d)` — which moves the **local** date and keeps the **local** time-of-day — and returns `toISOString()`, which is UTC. `next/jest` loads the app's `.env`, which pins `TZ=America/Chicago`, so between 19:00 CDT and midnight the constructed instant is past 00:00 UTC and the UTC date is the next day. Neither assertion is W7's; both are W3's (`014d81ad4`, `0dd74dde8`).

**Fix — the clock is pinned, in both suites.** A file-level `beforeEach` installs `jest.useFakeTimers(FAKE_DATE_ONLY)` and an `afterEach` restores real timers.

- `PINNED_NOW = new Date('2026-09-13T12:00:00.000Z')`. Midday **UTC** rather than midday local: every zone from UTC-11 to UTC+11 reads that instant as the same calendar day, so the assertion holds wherever the suite runs, not only in Chicago.
- `doNotFake` lists every fakeable API **except `Date`** — `setTimeout`, `setInterval`, `queueMicrotask`, `performance`, `requestAnimationFrame`, `nextTick`, `setImmediate` and their clears all stay real. React Query's gc timers and RTL's `waitFor` therefore behave exactly as they do under the real clock; nothing in either suite needed an `advanceTimersByTime`.
- The fixture dates (`2026-08-04`, `2026-09-01`) and the pin are all inside CDT, so no DST offset change is in play.

Both suites now pass, and will pass at any hour: `2 passed, 25 tests`. Full portal suite is `580 passed / 580`, `7412 tests` (7407 before + 5 added below).

No production file was changed for this finding. The KNOWN_FAILURES route was deliberately not taken — a pinned clock makes the assertion true rather than documenting it as false.

---

## W7-R2-02 — the HT-35 disclosure band removed itself as its own stamp came back

**Confirmed.** `useMarkTimeAutostartDisclosed.onSuccess` invalidates `timeAutostartKeys.preference`; the mounted `useTimeAutostartPreference` refetches; `disclosedAt` turns non-null; the old `showDisclosure = … && disclosedAt === null && !dismissed` went false and the band unmounted. One UPDATE plus one SELECT of dwell, `Understood` never reachable, and the column stamped — "once and never again", with the once spent on a flash.

**Fix — the band is latched on the showing, and let go only by her own act.** `apps/designer-portal/src/hooks/document-time-provider.tsx:790-820`:

```
const undisclosed = held && settled && !optedOut && disclosedAt === null;
const showDisclosure =
  held && !dismissed && (latched || (undisclosed && !stamped.current));
```

The stamping effect now keys off `undisclosed` and sets `latched` as it stamps, so:

- first render with `disclosedAt === null` → band up, stamp written, `autostartDisclosed` fired **once** (unchanged — the ruling's own test that she has been told even if she navigates past);
- the stamp round-trips → `undisclosed` goes false, `latched` holds the sentence on the page;
- `Understood` → `dismissed`, gone;
- she leaves the document without dismissing → a second effect drops `latched`, and `stamped.current` keeps it from ever coming back on the next document in that session;
- a fresh mount with a non-null `disclosedAt` → never shows.

The stamp mutation still invalidates the preference query — the latch, not a missing invalidation, is what holds the band, so the profile page and the spine keep reading a fresh preference.

**Two regression cases added** to `document-time-provider.test.tsx` (the seven existing HT-35 cases could not see this, because `useTimeAutostartPreference` is mocked static):

1. *holds the sentence up while its own stamp round-trips back* — `markDisclosedMutate` now flips `autostartPreference.disclosedAt`, the hook is re-rendered, the band must still be on screen, `Understood` takes it down, and exactly one stamp was written.
2. *does not follow her onto the next document if she never dismissed it* — release, then hold a second project: silent, still one stamp.

**Falsifier checked.** With `showDisclosure` reverted to the shipped `undisclosed && !dismissed`, case 1 fails (`✕ holds the sentence up while its own stamp round-trips back`). The fix was restored immediately afterwards.

That describe block's `beforeEach` was changed from `markDisclosedMutate.mockClear()` to `.mockReset()` so a per-case implementation cannot leak forward (`clearMocks: true` in `jest.config.js` clears calls, not implementations).

---

## W7-R2-03 — `+ Add a role` seeded a bound role at $0/hr and nothing refused it

**Confirmed, chain and all.** After W7 both seeds (`part-editor.tsx:493-503`, `account-studio-page.tsx:1213-1222`) write `{ roleName: <label>, rosterRole: <enum>, hourlyRateCents: 0 }`. The empty `roleName` that used to be the guard is gone, so `BLANK_ROLE_BLOCKER` and `rateCardForSave`'s trim filter both pass. Nothing downstream asks for a positive number:

- `readiness.ts:287-294` (R-7) asks only that **one** role be named and priced;
- `UNBOUND_ROLE_BLOCKER` is satisfied — the row **is** bound;
- `upsert_agreement_parts` (`00618:592-596`) refuses only an **absent or JSON-null** `hourlyRateCents`;
- `_agreement_assert_cents` accepts `0`;
- tier 1 of both pricing legs (`00618:1279-1293` resolver, `:1706-1722` classifier) matches on `roster_role` alone and does not filter on a positive rate.

Result: `rate_source='authority'`, `hourly_rate_cents=0`, `rated_amount_cents=0`, `billing_state='authorized'` — reads as priced, bills nothing, and `guard_invoiced_time_entry` freezes it at $0 on invoice. Immutable after countersign.

**Fix — a readiness blocker, the reviewer's option (a).** `readiness.ts`:

```
export const ZERO_RATE_BLOCKER =
  "Every role on the rate card needs an hourly rate above zero.";
…
} else if (roles.some((role) => !(role.hourlyRateCents > 0))) {
  add(part.id, ZERO_RATE_BLOCKER);
}
```

It is an `else` on R-7 deliberately: a card with **no** priced role already earns R-7's own sentence, and two blockers for one defect would make the readiness panel count two things where there is one. The new sentence therefore fires exactly where R-7 is silent — the dangerous case, a seeded $0 row standing beside a real rate. R-7's condition, message and its three existing tests are untouched.

The RPC was left alone. Option (b) — dropping `hourlyRateCents` from the seed so `upsert_agreement_parts` refuses it — would make `+ Add a role` un-**savable** as well as un-sendable, and a draft is allowed to be unfinished (the same reasoning `UNBOUND_ROLE_BLOCKER` already ships on).

**Copy, at the surface that seeds it.** `account-studio-page.tsx:1230-1233` now reads "…the agreement it seeds asks for the role — and for a rate above zero — before it can be sent." No test asserted the old sentence.

**Three cases added** to `readiness.test.ts`: a seeded $0 role beside a priced one is blocked and `ready` is false; an all-$0 card earns R-7's sentence and **not** the new one (no doubling); the nine standard parts say nothing about rates.

### Residual, named rather than closed

`assessAgreementReadiness` is client-side — its only call sites are `agreement-composer.tsx:371` and `service-agreement-instruments.tsx:157`. A caller that reaches `upsert_agreement_parts` directly can still park a $0 bound rate. That is exactly the posture `UNBOUND_ROLE_BLOCKER` already shipped with in round 1, so this round matched it rather than inventing a new guard shape. If the orchestrator wants the money guard in the database, the shape is a `hourlyRateCents > 0` refusal beside `00618:592-596`'s absent-rate refusal — an unmerged-migration edit, one line, plus the grants/types re-run it would drag in.

---

## 390 / 1440

No layout was changed. Both impl edits are logic: `showDisclosure`'s derivation, and one added blocker string. The disclosure band's markup is byte-identical to what round 1 shipped — `flex flex-wrap items-center justify-between gap-x-4 gap-y-1` inside `mx-auto max-w-[1180px] px-4 py-2`, the paragraph `t-body-sm`, the act `min-h-11 shrink-0` (44px, house sheet §A). No fixed width and no `min-width` anywhere in it, so at 390 the sentence wraps and `Understood` drops onto its own full-height line; at 1440 it sits right of the sentence inside the 1180px measure. The new readiness sentence renders through the existing blocker list, at a length between two sentences already in that list.

This is a **static audit of unchanged markup**, not a browser walk — stated plainly because the band's one showing was previously a flash, so round 1's own device pass could not have seen it standing. A live 390 look at the band is worth one minute of Kody's prod walk.

---

## Gates run (this worktree)

| Command | Result |
|---|---|
| `jest command-bar-log-time hours-ledger-add-row` (before) | **RED** — 2 suites / 2 tests failed (reproduction) |
| `pnpm --dir …/apps/designer-portal test` | **580 suites passed / 580 · 7412 tests passed** |
| `turbo run type-check --filter=@patina/designer-portal` | green (`tsc --noEmit`, 7 tasks successful) |
| `pnpm --dir …/apps/designer-portal lint` | **0 errors**, 201 pre-existing warnings; none on a touched file |
| `turbo run build --filter=@patina/admin-portal` | green (8 tasks successful) — the type-integrity gate |

SQL gates (`supabase db reset`, `run-sql-tests.sh`, `db:generate`, `generate-legacy-grants.py`) were **not** re-run: this round touched no migration, no seed and no generated type. `git status` for the round is seven files, all under `apps/designer-portal/src`.

## Files changed

- `apps/designer-portal/src/components/document/__tests__/command-bar-log-time.test.tsx` — clock pinned
- `apps/designer-portal/src/components/document/__tests__/hours-ledger-add-row.test.tsx` — clock pinned
- `apps/designer-portal/src/hooks/document-time-provider.tsx` — the disclosure latch
- `apps/designer-portal/src/hooks/document-time-provider.test.tsx` — 2 cases
- `apps/designer-portal/src/components/document/rooms/drafting/agreement/readiness.ts` — `ZERO_RATE_BLOCKER`
- `apps/designer-portal/src/components/document/rooms/drafting/agreement/__tests__/readiness.test.ts` — 3 cases
- `apps/designer-portal/src/components/document/account/account-studio-page.tsx` — one help sentence
