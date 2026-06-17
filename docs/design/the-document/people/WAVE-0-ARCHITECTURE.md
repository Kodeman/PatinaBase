# The People Room — Wave 0 architecture (frozen contracts)

Wave 0 is built and verified. Tracks A–D build their view bodies against the
contracts below. **Do not change the frozen files except where your track owns
them** (the ownership map prevents merge conflicts).

## What's live (reuse, don't rebuild)

- **Read model:** `public.people_directory` (migration `00221`). One row per
  party — `client | lead | maker | gc | team`. Columns:
  `person_id, role, display_name, email, phone, profile_id, project_id,
  designer_id, status_raw, last_touch_at, meta (jsonb)`. security_invoker —
  RLS scopes it to the querying designer.
- **Hook:** `@patina/supabase` → `usePeopleDirectory({ role?, search? })`,
  `usePerson(personId, role?)`. Returns `PeopleDirectoryRow[]`.
- **Derivation contract:** `apps/designer-portal/src/lib/document/people-derivation.ts`
  - Types: `DirectoryPerson` (= `PeopleDirectoryRow`), `PartyStatus`,
    `JourneyEvent`, `JourneyType`, `NurtureEntry`, `JourneyInputs`.
  - Thresholds: `NURTURE_DUE_DAYS=240`, `NURTURE_DORMANT_DAYS=180`,
    `LEAD_RESPOND_HOURS=24`, `MAKER_WARM_DAYS=75`.
  - Implemented: `deriveStatusDot`, `deriveRelationshipLine`, `isNurtureDue`,
    `deriveNurtureQueue`, `roleLabel`, `humanizeSince`, `sortJourney`.
  - **Stub (Track B fills):** `deriveRelationshipJourney(inputs: JourneyInputs, now)`.
  - **Model rule:** the directory **status dot** and the nurture **"due" accent**
    are SEPARATE — a `proposal` client reads a *warm* dot but is *nurture-due*.
    Use `deriveStatusDot` for the dot, `isNurtureDue` for the accent/band.
- **Room shell + nav contract:**
  - `components/document/people/people-room.tsx` — RoomShell + ask bar + the
    Strata-ruled left rail + the live Engine nudge + the view state machine.
    **(Track A owns.)**
  - `components/document/people/types.ts` — `PeopleView`, `PeopleViewProps`
    (`openPerson`, `openThread`, `goView`, `notify`), `ThreadsViewProps`,
    `PersonProfileProps`. **Frozen.**
  - `components/document/people/person-bits.tsx` — `Avatar`, `RoleBadge`,
    `StatusDot`, `initials`. **Shared — reuse, don't fork.**
  - `components/document/people/view-shell.tsx` — `ViewHeader`, `ViewPlaceholder`.
  - Route: `app/(document)/people/page.tsx` → `/people` (flag `the-document-pilot`).
  - Drawer: People is now a **Room** (`weight:'room'`) in `studio-drawer.tsx` +
    `mobile-sheets.tsx`.

## File-ownership map (disjoint — keep it that way)

| Track | Owns (edit/create) | Reuses (read only) |
|---|---|---|
| **A** Directory | `people-room.tsx`, `views/directory-view.tsx`, ask-bar polish | hook, person-bits, derivation helpers |
| **B** Profile + journey | `views/person-profile.tsx`, new `people/profile/*`, **fills `deriveRelationshipJourney` in people-derivation.ts** | `use-clients`/`use-vendors`/`use-projects`/`use-proposals`/`use-decisions`/`use-comms`/`use-nurture`/`use-reviews`/`use-styles` for journey inputs; person-bits |
| **C** Relationship ops | `views/{threads,nurture,reviews,portfolio}-view.tsx`, new `people/ops/*` | `use-comms` (shared thread model — DO NOT duplicate), `use-nurture`, `use-reviews`, `useProjects`; `deriveNurtureQueue` (done) |
| **D** Outreach + Desk | `views/outreach-view.tsx`, new `people/outreach/*`, **sole writer of `desk-derivation.ts`** (nurture-due need-line) | `use-campaigns`/`use-templates`/`use-audience-segments`; the directory for audience preview |

**Only Track B edits `people-derivation.ts`** (the journey body). **Only Track D
edits `desk-derivation.ts`.** **Only Track A edits `people-room.tsx`.** Everything
else is per-track files under `components/document/people/`.

## Hard constraints (every track)
- **D4 zero shadows**; **D1 strict focus** (the Room is full-bleed; only the
  drawer/sheets coexist); typography-first; reuse brand tokens (`globals.css`),
  never redefine.
- **Threads are the one shared model** (`use-comms`) — render here AND on the
  margin; never a copy.
- **The journey is a derivation** — no activity table; do not extend
  `client_activity_log`.
- Tests: add `*.test.ts` under `lib/document/__tests__/` for any new derivation
  (Jest; mirror `people-derivation.test.ts`).

## Verify your track
- `pnpm --filter @patina/designer-portal type-check 2>&1 | grep document/people` → 0
- `pnpm --filter @patina/designer-portal test -- <your-derivation>` → green
- The view bodies render at `/people` behind `the-document-pilot`
  (`NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`).
