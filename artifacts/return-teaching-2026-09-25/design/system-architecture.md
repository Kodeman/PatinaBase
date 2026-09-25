# Return teaching: system architecture

SQ-261 · 25 September 2026 · base `main` 4fdbd9a26 (migrations head 00670). Inputs: `research/external-patterns.md` §4–§6, `research/patina-inventory.md`, `research/vision-framing.md` §2 and §5, and the SQ-257 promotions on this ticket.

**Which code is which.** `components/document/margin-note.tsx` is the teaching primitive: one-shot, "Appears once · Recedes on use", persisted in `profiles.help_state.marginNotes`. `hooks/use-margin-notes.ts` and the `margin_notes` table are the R14 designer-authored annotations, and this design does not touch them. Because the two collide, the new store and content type are named **teaching notes** (`teachingNotes`, `teachingNote`), and the user-facing name "Margin Notes" is **open ruling R-1**.

## Two findings that shape the design

**F1. `help_state` is readable by studio co-members.** 00555 L624–637 admits any active co-member of the same studio to `profiles`, and row visibility covers every column, `help_state` included (00555 §2). An owner can already read a hand's `marginNotes` timestamps. A visit cursor, ignored streak or note outcomes there would break guardrail 8 ("the owner never sees which hand read what") at the data layer. So Phase 1 writes only coarse data, in the exposure class DM-1a already accepts, and Phase 2 waits until `help_state` is own-row-only (**open ruling R-2**; §8).

**F2. `help_state` writes clobber each other.** `saveHelpState` overwrites the whole column, and three independent full-blob caches write through it. The tour cache hydrates as `{tours, featureAnnouncements}` only, so a Desk Walkthrough step erases `marginNotes` and `firstAuthoredAt` (filed as **SQ-265**). More sub-keys would make it worse, so Phase 1 switches to a server-side merge of one path (§1.3).

## §1 Entities

### 1.1 `teachingNote` (Sanity, studio `kv3qrinl`)

This is a new document type beside `helpContent`. It is not a new `contentType` value: its eligibility fields don't fit the per-surface content union. Wire type: `TeachingNote` in `packages/help-system/src/contentTypes.ts`.

| Field | Type | Notes |
|---|---|---|
| `noteKey` | slug, required, unique | Versioned exactly like today (`galley-po@1`). A re-cut re-arms once. |
| `kind` | `release` \| `unused_benefit` \| `faster_way` \| `owner_capability` \| `client_promise` | Taxonomy a–e (framing §3). |
| `audience` | `owner` \| `hand` \| `all` | Owner is `organization_members.role = 'owner'`, or a solo designer with no membership row. Admins get `hand` notes until ruled (R-4). |
| `trigger` | `return` \| `anchor` \| `act` \| `pull_only` | `act` is the consequence sentence at a send act (in place, cap-exempt, once only). |
| `surfaceKey` | string | Validated with the existing `surface-key-format` rule against `surfaceKeys.ts`. |
| `anchor` | string, optional | A `DocumentActionGroup` `regionKey` inside the surface. |
| `releaseId` | string, required when kind = `release` | Must match a manifest entry (§1.2). |
| `featureKey` | enum (`galley`, `ledger`, `hours`, `people`, `field_capture`, `client_page`, `purchase_orders`, `seats`) | Joins to usage signals (§4). |
| `flag` | string, optional | PostHog flag. A flag that is loading or off makes the note ineligible. |
| `body` | text, ≤140 chars (validation) | One sentence of outcome. Brand-voice lint happens at review. |
| `priority` | 1–5 | Tie-break only. |
| `expiresAt` | datetime, optional | After this, the note is not eligible. |
| `recedeOn` | string[] | Window CustomEvent names, passed straight to `MarginNote.actionEvents`. |
| `successEvent` | string | The PostHog event that proves the task happened. Used for measurement only. |
| `maxDisplays` | int, default 2 | Then the outcome is `retired_max`. |
| `prerequisite`, `supersedes` | noteKey refs | Seen-state semantics from §4 of the research. |
| `learnMore` | reference → `helpContent` (helpArticle) | Optional help-article link. |
| `provenance` | `agent` \| `leah` | Who drafted it (§6). |

### 1.2 Release: a committed manifest (the pick)

`apps/designer-portal/src/content/teaching-releases.ts` is an append-only ordered array:

```ts
export const TEACHING_RELEASES = [
  { id: '2026-09-25-galley-po', shippedOn: '2026-09-25', sizeClass: 'workflow_changing',
    featureKeys: ['galley', 'purchase_orders'], flag: 'agreement-parts' },
] as const satisfies readonly TeachingRelease[];   // sizeClass: minor | useful | workflow_changing
```

Its copy (headline and prose for the changes page) lives in a Sanity `teachingRelease` doc keyed by the same `id`. Only releases in both the bundle and published Sanity render.

| Candidate | Verdict |
|---|---|
| **Committed manifest** | **Picked.** It ships inside the Worker it describes, so it can't announce code that isn't live, and rollbacks stay truthful for free. It needs no deploy-time prod write. Its order is the release order, so "since her last visit" is a cursor comparison, not a date guess. |
| Sanity `release` doc by date | Rejected as the source of truth: an early publish would teach unshipped work. Sanity keeps the copy only. |
| `NEXT_PUBLIC_RELEASE_ID` baked by deploy-portal.sh | Rejected. It names a build, not a feature, so it would still need this manifest. |
| `portal_releases` table written at deploy | Rejected. It adds a prod write to every deploy that can fail on its own, and a rollback leaves a lying row. |

A unit test (`teaching-releases.test.ts`) enforces unique ids, append-only order (compared against the previous committed ids list in the file header), and a known `sizeClass`. `minor` releases never produce a return note.

### 1.3 Designer teaching state (the `help_state` extension)

This adds one sub-key to `HelpStateBlob` (`packages/help-system/src/persistence/types.ts`). It is metadata only, with no copy text and no project ids:

```jsonc
"teachingNotes": {
  "v": 1,
  "cursor": {
    "lastSeenReleaseId": "2026-09-25-galley-po",  // P1. Set to manifest head on first-ever load (new person → first-run, not history)
    "lastVisitAt": "2026-09-25T14:02:00Z",         // P2 (after R-2). Written once per visit (≥4h since previous)
    "lastUnsolicitedAt": "2026-09-24T09:10:00Z"    // P2
  },
  "recentUnsolicited": ["2026-09-24T09:10:00Z"],   // P2. ≤2 instants, rolling 7d cap
  "ignoredStreak": 0,                               // P2
  "quiet": { "off": false, "until": null },         // P2. Per-person switch; auto-quiet sets `until`
  "seen": {                                          // P1
    "galley-po@1": { "n": 1, "first": "…", "last": "…",
                     "out": "acted" }  // acted | dismissed | retired_max | already_knew | superseded | null (still live)
  }
}
```

Outcomes (SQ-257 promotion 1): × means `dismissed`, and a dismissal is permanent. A show that ends without × or the named action is a *close*: it adds to `n` and `ignoredStreak`, and at `maxDisplays` the note becomes `retired_max`. `already_knew` is written, without a display, when the eligibility pass finds that the feature was used before the note ever showed. The person cursor is per person, never per studio (promotion 2).

**Write path (fixes F2):** one migration adds

```sql
CREATE OR REPLACE FUNCTION public.help_state_patch(p_path text[], p_value jsonb)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$
  UPDATE public.profiles
     SET help_state = jsonb_set(help_state, p_path, p_value, true)
   WHERE id = auth.uid()
     AND p_path[1] IN ('tours','featureAnnouncements','marginNotes','firstAuthoredAt','teachingNotes');
$$;
REVOKE EXECUTE ON FUNCTION public.help_state_patch(text[], jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.help_state_patch(text[], jsonb) TO authenticated;
```

It runs as the invoker, so the existing own-row UPDATE policy still decides. Every backend in `supabaseAdapter.ts` switches from `saveHelpState(blob)` to `help_state_patch(<its path>, <its leaf>)`. The teaching backend (`createSupabaseTeachingNoteBackend`) patches leaves such as `{teachingNotes,seen,galley-po@1}`, so no sub-key can erase another. `jsonb_set` does not create missing parents. So when `teachingNotes` was absent at hydrate, the backend's first write patches the whole `{teachingNotes}` sub-tree, and only later writes patch leaves. The GRANT/REVOKE requires regenerating `seed/00-legacy-grants.sql`.

## §2 Eligibility engine

**Where: a client hook over cached state, plus one read-only SQL RPC.** Selection is a pure TypeScript function, `selectTeachingNote(inputs)`, in `apps/designer-portal/src/lib/teaching/`. It is unit-testable and needs no server round-trip per surface. Its inputs:

| Input | Source |
|---|---|
| Notes | Sanity `teachingNote`, published perspective and CDN (the existing `sanityClient.ts`), React Query `['teaching-notes']`, staleTime 30 min |
| Releases | Bundled manifest ∩ published `teachingRelease` |
| Seen state and cursor | `teachingNotes` via the help-state backend (sync reads, like `hasSeen`) |
| Lifecycle and usage | `teaching_signals()` RPC (§3–§4), `['teaching-signals']`, staleTime 5 min, invalidated on boundary |
| Flags | A new `useFeatureFlags(names[])` beside `useFeatureFlag`, with the same fail-closed rule, for the flags the candidate notes name |
| Audience | `teaching_signals().role` |
| At rest | `useTeachingAtRest()` (below) |

An edge function and a SQL selector were rejected: nothing has to run server-side, the flags live in PostHog, and the copy lives in Sanity.

**At rest.** `useTeachingAtRest(surfaceKey)` is true only when all of these hold:
1. `useIsMutating() === 0`. No act is pending. Every Document act is a React Query mutation, and the send sheet already uses this signal.
2. `document.activeElement` is not an `input`, `textarea`, `select` or `[contenteditable]`. No composer has focus.
3. No open `[role="dialog"]` or sheet. A dirty form in the Document lives inside a sheet or composer.
4. Nothing is registered in a small hold registry, `holdTeaching(key)` / `releaseTeaching(key)`. `use-drafting-state.ts` and `send-sheet.tsx` opt in while they are dirty. This is the only per-surface wiring.
5. None of the above has changed for 1.5 s.

**Unit of work completed (task boundary).** Add one global `MutationCache` `onSuccess` subscriber to the portal QueryClient (`src/lib/react-query.ts`). It records `lastBoundaryAt` for the current route's surfaceKey. An `anchor` note is eligible only if `lastBoundaryAt` falls after the surface mounted and the surface is at rest. This needs no mutation keys and no per-feature code. In-place notes never fire on mount (promotion 3). The Desk is itself a boundary (US-12 decision 3b), so the Desk slot needs only the at-rest check.

**Caps and ranking.**

```ts
function selectTeachingNote(slot: 'desk' | 'anchor' | 'act', surfaceKey, x): TeachingNote | null {
  const t = x.state.teachingNotes;
  if (t.quiet.off || (t.quiet.until && x.now < t.quiet.until)) return slot === 'act' ? actOnly(x) : null;
  const unsolicitedOk = slot !== 'act'
    && !x.visit.unsolicitedShown                                   // 1 per visit
    && t.recentUnsolicited.filter(ts => x.now - ts < 7 * DAY).length < 2   // 2 per week
    && (!t.cursor.lastUnsolicitedAt || x.now - t.cursor.lastUnsolicitedAt >= DAY); // HIG 24h
  if (slot !== 'act' && !unsolicitedOk) return null;
  if (!x.atRest) return null;
  const candidates = x.notes.filter(n =>
       n.trigger === slotTrigger(slot)                 // desk → 'return'; anchor → 'anchor'; act → 'act'
    && (slot === 'desk' || n.surfaceKey === surfaceKey)
    && audienceMatches(n.audience, x.signals.role)
    && (!n.flag || x.flags[n.flag]?.value === true)    // loading counts as off
    && (!n.expiresAt || x.now < n.expiresAt)
    && !isTerminal(t.seen[n.noteKey])
    && (!n.prerequisite || isTerminal(t.seen[n.prerequisite]))
    && (n.kind !== 'release' || releaseSinceCursor(n.releaseId, t.cursor, x.manifest))
    && (n.kind !== 'release' || sizeOf(n.releaseId) !== 'minor')
    && (n.kind !== 'unused_benefit' || slot === 'anchor')   // (b) never on return
    && lifecycleAllows(n, x.signals));                       // §3 table
  for (const n of candidates) if (x.signals.used[n.featureKey]) markOutcome(n, 'already_knew');
  const live = candidates.filter(n => !x.signals.used[n.featureKey] || n.kind === 'faster_way');
  return live.sort(byRank)[0] ?? null;
}
// byRank: never-seen → oldest last-seen → priority desc → manifest/created order asc
```

**Nothing to teach.** The function returns `null`, and the slot renders nothing: no placeholder, no "you're all caught up". Over the course of a visit the Desk renders at most one note. The existing static Desk notes (`desk-first-touch`, `desk-walkthrough-offer`, `hire-handoff`) join the same arbiter in Phase 2 as fixed candidates of priority 5. Today all three can stack at once (`desk/page.tsx` L363–416).

**Ignored → quiet.** A close adds 1 to `ignoredStreak`. Acting or dismissing resets it to 0, because a dismissal is a decision, not an ignore. At 3 the engine sets `quiet.until = now + 30d` and resets the streak.

## §3 Lifecycle stage detection

`teaching_signals()` is `LANGUAGE sql STABLE SECURITY INVOKER`, with search_path pinned and EXECUTE granted to `authenticated` only. It returns booleans and instants about **the caller** (and their own studio membership), computed at read time. It persists nothing, so it is not a stored profile of the person.

| Stage | Signal | Confidence | Gap |
|---|---|---|---|
| First hour | `profiles.created_at`; `organization_members.joined_at`; `help_state.firstAuthoredAt` absent | High | — |
| First week | `profiles.created_at` ≤7d and `EXISTS projects WHERE designer_id = me` | High | — |
| First client page sent | `min(client_invitations.sent_at)` where `designer_id = me` (revoked excluded) | High | — |
| First agreement signed | `min(proposals.signed_at)` where `designer_id = me`; `commercial_document_signatures.signed_at` for the Galley's signed parts | Medium | Which `document_kind` counts as "agreement" needs one line from the Galley owner |
| First invoice | `min(invoices.sent_at)` where `designer_id = me` or `studio_id` = my studio | High | — |
| First hands | Hand: own `organization_members.joined_at`, `first_document_opened_at`. Owner: active member count >1 (`status = 'active'`) | High | — |
| Return after 7/30/90 d | `teachingNotes.cursor.lastVisitAt` (the previous value, snapshotted at hydrate) | Phase 2 | **No signal yet.** `profiles.last_active_at` (00037) has no writer. `user_sessions.last_active_at` is written once at login (00164) and never refreshed. Supabase `last_sign_in_at` misses refresh-token sessions that stay signed in for weeks. Instrumentation: the cursor write |
| Release since last visit | Manifest order vs `cursor.lastSeenReleaseId` | High (P1) | — |
| Feature untouched 60 d | §4 first-use absent and account ≥60d | High for "never used" | **The live task signal is missing** (e.g. hours typed into notes). No slow-path detectors exist. Those notes stay silent until one is built |
| Dormant studio (90+ d) | None in the product, and none built here | — | **No signal yet**, and none planned in-product. Leah's 1:1 list (ruling framing-5) would be an admin-only, studio-level query run by staff, out of scope here |

## §4 Feature-usage signals

The database is authoritative. PostHog is not consulted for eligibility: ad-blockers and `isAnalyticsEnabled` would turn "blocked" into "never used", and the client cannot query PostHog anyway. Each row becomes a `used.<featureKey>` boolean in `teaching_signals()`.

| featureKey | "Has used" | Scope | Gap |
|---|---|---|---|
| `galley` | `EXISTS proposals WHERE designer_id = me AND sent_at IS NOT NULL` (agreement kinds) | Person | The agreement-kind filter (as §3) |
| `purchase_orders` | `EXISTS purchase_orders WHERE created_by = me AND sent_at IS NOT NULL` | Person | — |
| `ledger` | `EXISTS invoices WHERE designer_id = me AND sent_at IS NOT NULL` | Person | — |
| `hours` | `EXISTS project_time_entries WHERE user_id = me` | Person | — |
| `people` | `EXISTS studio_contacts WHERE created_by = me` | Person | Reading the People room leaves no row. Only adding does |
| `field_capture` | A `room_files` row reachable through the caller's scans | Person | `room_files` has no owner column. The join path through `scan_id` must be confirmed |
| `client_page` | `EXISTS client_invitations WHERE designer_id = me AND sent_at IS NOT NULL` | Person | — |
| `seats` | Owner: `organization_members` rows invited by me (`invited_by = me`) | Person | — |
| ⌘K, help panel, previews | PostHog only (`document_help_opened`, `document_margin_note`) | — | **Missing in DB.** These drive nothing, and appear in measurement only |

Each query is `EXISTS … LIMIT 1` on an indexed owner column. Phase 2 verifies each with `EXPLAIN`.

## §5 Delivery surfaces: one hook contract

All three UX options consume this contract (`apps/designer-portal/src/hooks/use-teaching-note.ts`):

```ts
export type TeachingSlot = 'desk' | 'anchor' | 'act';
export interface TeachingNoteView {
  noteKey: string; kind: TeachingKind; body: string;
  label: string;                  // "MARGIN NOTE · 25 SEP" (name pending R-1)
  recedeOn: string[]; learnMoreHref?: string;
}
export interface TeachingNoteBinding {        // spread onto the existing <MarginNote>
  noteKey: string; seen: false; actionEvents: string[]; caption: string;
  onSeen: (how: 'dismissed' | 'acted') => void;
}
export function useTeachingNoteFor(surfaceKey: string, opts?: { slot?: 'anchor' | 'act'; anchor?: string }):
  { note: TeachingNoteView | null; bind: TeachingNoteBinding | null };
export function useReturnNote():                                  // Desk only
  { note: TeachingNoteView | null; bind: TeachingNoteBinding | null;
    sinceLine: { items: TeachingReleaseItem[] /* ≤3 */; changesHref: '/changes' } | null };
export function useChangesList():                                 // pull; uncapped
  { releases: TeachingReleaseEntry[]; markRead: () => void };     // markRead advances lastSeenReleaseId
```

Rendering always goes through the existing `MarginNote`, in its controlled mode (`seen` + `onSeen`, already supported). The only change to the primitive: `onSeen` receives `'dismissed' | 'acted'`. That is backwards compatible, because current callers ignore arguments.

- **Desk note.** `useReturnNote().bind` goes into the Desk's single slot, which replaces the stacked notes.
- **In place.** `useTeachingNoteFor('designer.document.galley', { slot: 'act' })` sits above the send act. The consequence sentence is cap-exempt and once only.
- **Collapsed since-you-were-here line.** It appears only when the previous `lastVisitAt` is ≥30 d old. It is one line, and discloses ≤3 items relevant to the project she opens. It never shows a count, and replaces the Desk note for that visit.
- **Changes page.** A new `(document)/changes/page.tsx` is reachable from ⌘K ("What's changed") and the help panel. It never carries a dot or badge. Opening it calls `markRead`.

## §6 Authoring and release workflow

1. **Agent drafts.** An agent writes a `teachingNote` (and `teachingRelease`) into Sanity as a **draft**, `provenance: 'agent'`, via a draft-only token: Sanity's Contributor role if the plan offers it; otherwise a Studio `document.actions` override that hides Publish for everyone except Leah's user id. The portal reads only the `published` perspective (`sanityClient.ts` L29), so a draft is the `awaiting_review` state and never reaches a designer.
2. **Leah reviews and publishes.** Publishing is approval. Sanity's document history keeps who published and when.
3. **Code ships first.** The manifest entry merges with the feature. A note published before its release reaches the bundle stays dark (§1.2).
4. **Release checklist line.** Add one line to the `patina-deploy` skill's portal section: "If `teaching-releases.ts` gained an entry, confirm its `teachingRelease` + notes are published after the deploy verifies. Unpublished copy keeps the release dark." Nothing changes in `deploy-portal.sh`, because the manifest needs no deploy-time step.
5. **Help-article linking.** `learnMore` references an existing `helpContent` helpArticle. The note's link opens it through the existing `ContextualHelpPanel` (`open-help.ts`), never a new tab.
6. **Owner letter (only if ruling framing-2 allows it).** An agent composes a draft with `branded-email.ts` and enqueues it via `enqueue_agent_task`, landing in `awaiting_review`. It sends only after Leah approves, through `sendCompliantEmail`. No automated send.

## §7 Measurement

**Events.** These follow the `help.*` dot-snake convention and are defined in the help-system `analytics.ts` event map. They replace the unprefixed `document_margin_note` for teaching notes; the static notes keep it until Phase 3 migrates them.

`help.teaching_note.shown` · `help.teaching_note.dismissed` · `help.teaching_note.acted` · `help.teaching_note.receded` (closed, retired_max, superseded, or expired) · `help.teaching_note.already_knew` · `help.teaching_changes.opened`

Properties are `note_key, kind, trigger, surface_key, release_id, size_class, audience, dwell_bucket` (<3 s, 3–30 s, >30 s). They carry no body text and no project or client id.

**Per-note aggregates (the only metrics):**
1. **Task shortened.** The share of people shown note N whose `successEvent` fires within 14 days of `shown`. Compare it with the same event's rate among eligible people in the 14 days before the release (a before/after baseline; a holdout is **open ruling R-5** at this scale).
2. **`already_knew` rate.** Above 50% means the note teaches the obvious: cut it.
3. **Harm.** The dismiss-within-3 s rate and the auto-quiet trigger count per note. A note above 40% quick-dismiss is retired at review.

Supporting only: `help.learnmore.expanded` and `document_help_opened` for the note's surface.

Insights are built in PostHog project 326191 and viewed only by Patina staff. Any cell with fewer than 5 people is suppressed. Leah's own studio is customer one, so a count of 1 is a person.

**Refused metrics:** time in app or on a surface; sessions, DAU, WAU; return frequency or return rate; streaks; open rate or click-through as a target; per-person or per-hand reads, outcomes or last-visit visible to owners; studio leaderboards; any count or dot shown to the designer.

## §8 Phasing and cost

| | Phase 1: walking skeleton | Phase 2: full lifecycle | Phase 3: measurement and changes page |
|---|---|---|---|
| Migrations | One (next free number): `help_state_patch` + grants + legacy-grants seed regen | Gate (R-2): own-row-only `help_state`, via DM-1b column narrowing or moving the column to `profile_help_state` (readers: web adapter, iOS `SupabaseHelpStateAdapter.swift`, `e2e/helpers/help-state.ts`). Then `teaching_signals()` | None |
| Sanity | `teachingNote`, `teachingRelease` schemas; publish guard | `audience`/`trigger`/`prerequisite` validation tightened | None |
| Package | `types.ts` `teachingNotes`; adapter per-path writes (fixes SQ-265); `createSupabaseTeachingNoteBackend`; `TeachingNote` type | — | `analytics.ts` event map |
| Portal | `content/teaching-releases.ts` + test; `lib/teaching/select.ts` (release kind, Desk slot only); `use-teaching-note.ts` (`useReturnNote`); `margin-note.tsx` `onSeen(how)`; `help-state-provider.tsx` wiring; `desk/page.tsx` slot | `useTeachingAtRest`, hold registry (drafting, send sheet), boundary subscriber in `react-query.ts`, `useFeatureFlags`, full caps/quiet/streak, owner/hand audience, in-place `act` slot, Desk arbitration of static notes, quiet switch in the Account sheet | `(document)/changes/page.tsx`, ⌘K row, since-you-were-here line, events and insights, `patina-deploy` line, optional owner-letter draft |
| Lane-days | ~5 | ~10 (+2 if R-2 goes the table-move way, because iOS is touched) | ~6 |
| Risks | Adapter write change regresses tours (cover with the SQ-265 regression test); Sanity role availability | R-2 unresolved means Phase 2 cannot ship; `teaching_signals` query cost; at-rest false negatives (the note never shows, which is the safe failure) | PostHog cell suppression is manual; events blocked by ad-blockers undercount (aggregates only, accepted) |
| Reversibility | Unpublish notes (instant); the RPC is additive; the manifest is ignorable | Quiet switch per person; unpublish; flag the engine behind `teaching-notes` (fail closed) | Page and events are removable; no data migration |

Phase 1 cursor semantics: a designer's first load sets `lastSeenReleaseId` to the manifest head, so she is never shown history. Phase 1 teaches only `release` notes, one on the Desk per visit. A per-visit flag is kept in memory, because `lastVisitAt` waits for R-2.

**Open rulings for Kody:** R-1 user-facing name (the R14 collision): "Margin Notes" is the working name, with "Workshop Notes" as the alternate. R-2 own-row-only `help_state` (DM-1b or a move), which blocks Phase 2. R-3 Sanity draft-only token mechanism. R-4 whether admins count as owners for money notes. R-5 holdout at a few dozen studios. Framing rulings 2 (email) and 5 (dormant list) stand as they are.
