# W1W2-portal — implementation report (lane B, phase 2)

Branch `hour-tracking/portal`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`,
fast-forwarded onto `origin/hour-tracking/integration` @ `a9841c8de` before the first line was written
(`git merge --ff-only`, no conflicts — W2's lane-A DB, `00604`–`00607`, `00615`, `00620`, came in with it).

Two commits, in the brief's order:

| Commit | What |
|---|---|
| `29b72c644` | `feat(time): W1 portal — the studio rate card, and an hour that says what it is worth` |
| `2c83cb4d3` | `feat(time): W2 UI — four scopes in one sheet, and the studio's hours said plainly` |

No migrations. No flags. No backfill. No new hours table, route, page or tab bar.

---

## 1 · Files

### W1 (commit `29b72c644`)

| File | C/M | What |
|---|---|---|
| `apps/designer-portal/src/components/document/account/studio-rate-rows.tsx` | **create** (125) | HT-3 — one member's rate field (blur-save, no Save button) + the dated append-only rows beneath it. Empty or ≤ 0 is "no answer", never "worth nothing" (the 00598 CHECK). |
| `apps/designer-portal/src/components/document/account/account-studio-page.tsx` | modify (+46) | HT-3 — a **Studio rates** section on `/desk?account=studio`, owner/admin only (the page's own `canManage`), one row per active member with a `user_id`, reading `useStudioMemberRates`. |
| `apps/designer-portal/src/lib/document/authority-hours.ts` | modify | HT-26 — `timeRateProvenance` no longer returns `null`: a discriminated `TimeRateProvenance` (`rated` · `nonbillable` · `pending` · `unrecorded`), every arm carrying a label and `rateRole`. New `timeRateRoleLabel` (HT-41). |
| `apps/designer-portal/src/lib/document/__tests__/authority-hours.test.ts` | modify | the two existing provenance cases re-pinned to the new shape + 4 new: the studio-rate leg, "never null / rate pending", non-billable vs unrecorded, the role through every arm. 11/11. |
| `apps/designer-portal/src/components/document/hours-ledger.tsx` | modify | the rate column — rate + provenance + role + money, **never a blank**; the week read now also selects `projects.studio_id` (one column read, HT-3-g); the `pending_authorization` chip became a doorway to the authority band, its pill unchanged (HT-40); a `'none'` row carries the repair, owner/admin only (stamp act where no pricing studio is named, the rate card where one is); `documentEvents.time` calls on add / adjust / delete. |
| `apps/designer-portal/src/components/document/pending-time-authorization-band.tsx` | modify | HT-26 — the band gains a **Studio rates →** door for owner/admin beside its per-document doors. |
| `apps/designer-portal/src/lib/analytics/document-events.ts` | modify (+85) | HT-27 — `documentEvents.time`: `entryLogged`, `timerStarted`, `timerStopped`, `entryAdjusted`, `entryDeleted`, `scopeViewed`, `rateUnresolved` (deduped per entry per session), `exportTaken`; the canonical event-name list as the module's doc comment (plan §5's owed comment for lane C's `posthog-ios` call sites). |
| `packages/supabase/src/hooks/use-time-tracking.ts` | modify (+39) | `useStampProjectPricingStudio` — the HT-3-g repair act, invalidating the project's time reads and `projects`. Exported from `hooks/index.ts`. |
| 3 existing account suites | modify (+3 each) | their `@patina/supabase` factories gained `useStudioMemberRates` / `useSetStudioMemberRate`, which the page now reads. |

### W2 (commit `2c83cb4d3`)

| File | C/M | What |
|---|---|---|
| `apps/designer-portal/src/components/document/hours-ledger.tsx` | modify (+616) | **the scope lens** (`mine · this person · this document · the studio`, scored DM-mono words, `da-score-on`/`da-score-hover`), absent for a plain member; the project scope reads the 00604 fact view with **no `user_id` leg** (HT-9); `ScopeRollup` (00607, grand total above its buckets — HT-30 — cut by person/document/day/week/activity, with an explicit `— internal —` group); `MemberProjectTotal` (`project_hours_total`, HT-10-a, and it says "not on it" rather than showing a zero); `ScopeEntries` behind one act (HT-36 aggregate-by-default) with `ScopeEntryNote` reading `notes` from the **table**, per entry, by an act; `PricingStudioLine` (HT-3-e(3)) with the repair beside it. |
| `apps/designer-portal/src/lib/document/open-hours-scope.ts` | **create** (30) | the one door into the member scope (`openHoursForMember`), dispatching `document:open-ledger` itself — importing `command-bar.tsx` drags the help package into every consumer's jest run (the known `@portabletext/react` ESM trap; it broke `person-profile.test.tsx` at import time until this module existed). |
| `apps/designer-portal/src/components/document/people/views/person-profile.tsx` | modify (+22) | HT-8 — an **Hours** act on a studio teammate's profile, the only door to the member scope; `TeamProfile` now receives `profileId`. |
| `apps/designer-portal/src/components/document/desk-contents.tsx` | modify (+93) | HT-29 — the Hours line is act-bearing or absent: **hours to bill →** (the composer when one document owes, the sheet when several) or **a timer is still running from yesterday →**. No number on the index (R95, HT-30). `ContentsRow` gained an optional `act` rendered outside the doorway button. |
| `apps/designer-portal/src/components/document/__tests__/hours-ledger-scope.test.tsx` | **create** (289) | the sheet's first spec — 6 cases, the plan's five assertions plus HT-10-a. |
| `apps/designer-portal/src/components/document/__tests__/desk-contents.test.tsx` | modify | a `QueryClientProvider` + a `@patina/supabase` stub, because the index now reads two facts. |

---

## 2 · Gates (verbatim commands, verbatim results)

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
(no output — PASS)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
(no output — PASS)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal --filter @patina/designer-portal test -- src/lib/document/__tests__/authority-hours.test.ts src/components/document/__tests__/hours-ledger-scope.test.tsx
  studio rate provenance
    ✓ resolves the agreed role and rate without carrying internal IDs
    ✓ keeps legacy rates readable when no authority exists
    ✓ names the studio rate card as the leg that priced the hour
    ✓ never returns null, and says 'rate pending' where the resolver found no card
    ✓ distinguishes a legitimately non-billable hour from an unpriced one
    ✓ carries the role the member picked through every arm (HT-41)
  the Hours scope lens
    ✓ is absent for a plain member and present for an owner
    ✓ asks the project scope about the document, not about the holder (HT-9)
    ✓ puts the total above the rows that produced it (HT-30)
    ✓ stands internal time in its own group in the studio scope
    ✓ opens the member scope from the person, aggregate first, notes behind an act (HT-36)
    ✓ gives a plain member the project total rather than the studio rollup (HT-10-a)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal --filter @patina/designer-portal test
Test Suites: 574 passed, 574 total
Tests:       7270 passed, 7270 total
(the WHOLE designer-portal jest suite, run to catch collateral — exit 0)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal --filter @patina/designer-portal lint
✖ 203 problems (0 errors, 203 warnings)          ← 0 errors; the warnings are the repo's standing
                                                   unused-eslint-disable set (201 before this work)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal --filter @patina/admin-portal build
✓ Compiled successfully in 34.1s
✓ Generating static pages using 13 workers (137/137) in 405ms
  Finalizing page optimization ...
Route (app) …
```

**One gate footnote worth carrying to the next lane.** The admin build first failed
`Module not found: Can't resolve '@patina/api-client'` — this worktree had **no `dist/`** for the
dist-resolved packages. `pnpm --dir <wt> exec turbo build --filter=@patina/api-client
--filter=@patina/types --filter=@patina/utils` fixed it, and the build then passed. It is the
incident class §0 names (dist-resolved packages), pre-existing in the worktree, not caused by this
work — but the §0.24 gate silently fails for any lane that hasn't built those dists.

## 3 · Live verification (DATA_MODE=live, the port-isolated stack)

`.env.local` written by hand (gitignored) against **API `http://127.0.0.1:54421`**, anon + service keys
from `supabase status --workdir <wt>`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`.

- **Port 3000 was not free.** `lsof` showed PID 70482 listening, cwd
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/apps/designer-portal` — the peer
  people-room program's dev server. It was **not** touched; this lane's server ran on **3100** instead and
  was killed afterwards (no orphan; `lsof -ti:3100` empty).
- Signed in as the seeded studio owner (`designer@patina.dev`, Local Dev Studio
  `b0000000-…-000000000001`) by minting a GoTrue password-grant session and setting the `@supabase/ssr`
  cookie — the Chrome extension was **not connected** (`Browser extension is not connected`), so there is
  no screenshot walk in this report; what follows is SELECTs and the live route.
- `GET /desk` → **200**, compiled under live mode, the Hours line present ("time in hand").
- **The rate card's write, as the owner** (the blur-save upsert, verbatim payload):
  `studio_member_rates` ← `15500` for `2026-09-13` → returned the row, and
  `useStudioMemberRates`' read returned it back.
- **An hour on a studio-stamped project** (`Cedar Lane Study`, `studio_id` set), logged with the add row's
  payload and **no rate sent** → stored `hourly_rate_cents 15500 · rated_amount_cents 23250 ·
  rate_source studio_member · rate_role lead_designer · billing_state pending_authorization`. That is the
  row the ledger now prints as `Studio rate · $155.00/hr · lead designer · $232.50`.
- **An hour on a NULL-studio project** (`Aspen Loft Refresh`) → `hourly_rate_cents NULL ·
  rate_source 'none'` — the sheet's **"rate pending"** and the repair door, exactly HT-26's case.
- **The project scope's read**: `time_entry_ledger?project_id=eq.…` → 1 row, `member_name "Leah
  Hartwell"`, `studio_id` present (the pricing-studio fact), `resolved_rate_cents 15500`,
  `amount_cents 23250`, and **`notes` absent from the row's keys** (HT-36 at the type level).
- **The studio scope's rollup**: `studio_hours_rollup(member)` → one bucket, `Leah Hartwell · 1 entry ·
  90 min · 90 billable · 23250 · internal 0`.
- **The member's project total**: `project_hours_total` → `{90, 90, 23250}`.
- **The repair door's act**: `stamp_project_pricing_studio` as this owner → **refused `42501`**, "a studio
  prices this project's hours only from inside the tier that EMPLOYS its designer … A studio she OWNS is
  nobody's to name here (HT-3-g)". The door surfaces that sentence inline (HT-3-g cost note (iii): the
  principal's own stamp is refused, and `00620` at ship is what hands her the studio).
- Every probe row was deleted afterwards (`DELETE 2` entries, `DELETE 1` rate); the stack was never reset
  by this lane (lane A owns resets).

## 4 · Judgment calls, reported rather than buried

1. **The Desk line carries an act, never a figure.** HT-29 says "act-bearing or nothing"; HT-30 refuses a
   total with no rows beneath it and R95 forbids counts/metrics on the Contents index outright. So the line
   shows `hours to bill →` or `a timer is still running from yesterday →` and **no minutes and no dollars**.
   If the ruling intended a figure there, it is one span to add — and it would breach R95 as written.
2. **The member's name appears once per page.** The Studio rates row renders `"{name} · {role}"` as one
   string. Two separate `<p>`s with the bare name collided with the roster's own rows (the existing
   `account-studio-page` suite's `getByText(name)` found two); one line also reads better than the name
   printed twice on one page.
3. **The opener is its own module, not an export of `hours-ledger.tsx`.** Importing the ledger (hence
   `command-bar.tsx`, hence the Post sheet's help package) from `person-profile.tsx` made
   `person-profile.test.tsx` die at import time on the `@portabletext/react` ESM trap. `open-hours-scope.ts`
   dispatches the drawer's own event; the event's shape is command-bar's contract, mirrored with a comment
   saying so.
4. **`command-bar.tsx` was not touched** (it is W3's file, §11): the member scope rides on a module value,
   not a new `OpenLedgerContext` field.
5. **The ledger's provenance for fact-view rows** reads `resolved_rate_cents`, not `hourly_rate_cents` —
   the view's own name, and `0` where nothing priced the hour.

## 5 · Deferred, with reasons

| Item | Why |
|---|---|
| `apps/designer-portal/e2e/document/hours.spec.ts` (plan §3's e2e) | Not in this brief's enumerated deliverables, and its gate (`test:e2e`) is not in this brief's gate list. It needs port 3000 (held by the peer program this whole run) plus seeded actors at 1440/1024/390. The lens is covered by the new jest spec plus the live SELECT walk above. |
| HT-35 — the auto-start disclosure band (`document-time-provider.tsx`) and the per-member opt-out (`account-profile-page.tsx`), and the `time_autostart_disclosed` / `_opted_out` emitters | Not in this brief's list of items; `document-time-provider.tsx` is a shared file under §11's one-owner-per-stage rule. The two event names are recorded in `document-events.ts`'s canonical list as owed with that ruling, so the lane that lands it adds two emitters and nothing else moves. |
| `desk-doorway.tsx`'s `sheet`-as-`book` alias + `docs/marketing/founding-onboarding/copy-deck.md` | Plan §3 items not in this brief's list (and `desk-doorway.tsx` is nobody's shared file in this phase — it is a one-character fix someone should still land). |
| The Sanity help article (`…/wave-1/15-hours.md`) and `portal-vs-desk-feature-gap-matrix-v2.md` | Content/doc items of W2, not in this brief's list. The sheet now makes the article's two studio-scope sentences TRUE, so the push is safe whenever it is taken. |
| `useStudioTimeReport`'s deletion, `use-studio-member-rates.test.ts` | Already landed by lane A (W0/W1 DB) — verified present/absent on the integrated tip, nothing owed here. |
| An admin **adjust** UI for another member's entry (HT-22's policies) | The policies shipped in `00605`; no portal item for an adjust surface is assigned to this lane in §3's portal table. Scoped rows are read-only, and the note act is the only detail act. |

## 6 · Shared-file state for the next stage

- `hours-ledger.tsx` — this lane holds the last word on it for W1+W2. W3's add-row date/pill lands **after**
  these two commits as a follow-commit (§11), onto `ScopeRollup`'s sibling region, not into it.
- `document-events.ts` — this lane wrote it this phase; `documentEvents.time` is the single namespace, and
  its doc comment names every canonical event, including the two HT-35 still owes.
- `use-time-tracking.ts` — one addition (`useStampProjectPricingStudio`), exported; no other line changed.
- `supabase/config.toml` stays skip-worktree'd and unstaged in this worktree.
