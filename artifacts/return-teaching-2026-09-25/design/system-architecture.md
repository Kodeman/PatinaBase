# Return teaching: system architecture

SQ-261 · 25 September 2026 · base `main` 4fdbd9a26 (migrations head 00670). Inputs: `research/external-patterns.md` §4–§6, `research/patina-inventory.md`, `research/vision-framing.md` §2 and §5, and the SQ-257 promotions on this ticket.

**Revision 2 (SQ-266)** answers the SQ-262 review (`design/review.md`), findings 1–29, 31, 35, 37–47 and 50–52. The orchestrator's rulings on those findings are final and appear here and in `ux-options.md` in identical words where the two docs overlap.

**Which code is which.** `components/document/margin-note.tsx` is the teaching primitive: one-shot, "Appears once · Recedes on use", persisted in `profiles.help_state.marginNotes`. `hooks/use-margin-notes.ts` and the `margin_notes` table are the R14 designer-authored annotations, and this design does not touch them. Because the two collide, the new store and content type are named **teaching notes** (`teachingNote`, `teaching_note_state`), and the user-facing name is **ruling R-RT1**.

## Two findings that shape the design

**F1. `help_state` is readable well beyond the person (finding 4).** `can_view_profile` (00555 L560–643) admits studio co-members, but also invoice counterparties (the homeowner client), engaged leads, direct orders, room-scan shares, message-thread participants, a teammate's engaged lead, and the org-roster legs (L624–643). `profiles_select_counterparty` (L705–707) then exposes every column, `help_state` included (L217–227). 00555 L198–212 records that `projects`, `comms_thread_participants`, `project_team_members` and `room_scan_associations` rows can be self-inserted, so a signed-up designer can manufacture a relationship and read a target's `help_state`. Clients can already read a designer's `marginNotes` today. Anything written there about which note a person read, and when, breaks guardrail 8 ("the owner never sees which hand read what") at the data layer. **So teaching state leaves `help_state` entirely (F2 ruling, §1.3).**

**F2. `help_state` writes clobber each other.** `saveHelpState` overwrites the whole column, and three independent full-blob caches write through it. The tour cache hydrates as `{tours, featureAnnouncements}` only, so a Desk Walkthrough step erases `marginNotes` and `firstAuthoredAt`. The iOS `SupabaseHelpStateAdapter.swift` (L43–58, L298–313) and `e2e/helpers/help-state.ts` (L57, L65) also write whole blobs (findings 7, 51). All three are **SQ-265** writers. SQ-265 stays a separate defect about tours and margin notes. It is a Phase 0 prerequisite only for those existing primitives, not for teaching state, and when to fix it is ruling R-RT6. Phase 1 does not touch `help_state` or any of its write paths.

## §1 Entities

### 1.1 `teachingNote` (Sanity, studio `kv3qrinl`)

This is a new document type beside `helpContent`. It is not a new `contentType` value: its eligibility fields don't fit the per-surface content union. Wire type: `TeachingNote` in `packages/help-system/src/contentTypes.ts`.

| Field | Type | Notes |
|---|---|---|
| `noteKey` | slug, required, unique | Versioned exactly like today (`galley-po@1`). A re-cut re-arms once. |
| `kind` | `release` \| `unused_benefit` \| `faster_way` \| `owner_capability` \| `client_promise` | Taxonomy a–e (framing §3). |
| `audience` | `owner` \| `hand` \| `all` | Owner is `organization_members.role IN ('owner','admin')`, or a solo designer with no membership row. Admins count as owners (decided: HT-10). |
| `trigger` | `return` \| `anchor` \| `act` \| `pull_only` | `act` is the consequence sentence at a send act, for `workflow_changing` releases only: in place, exempt from the visit ceiling, once only (finding 24). |
| `surfaceKey` | string | Slash form, validated with the existing `surface-key-format` rule against `surfaceKeys.ts` (finding 31), e.g. `designer-portal/document/accounts`. |
| `anchor` | string, optional | A `DocumentActionGroup` `regionKey` inside the surface. |
| `releaseId` | string, required when kind = `release` | Must match a manifest entry (§1.2). |
| `flag` | string | PostHog flag. A flag that is loading or off makes the note ineligible. **Every non-release note requires a `flag` or a `releaseId`** (validation, finding 46), so a note about unshipped behaviour cannot go live on publish. |
| `featureKey` | enum (`galley`, `ledger`, `hours`, `people`, `field_capture`, `client_page`, `purchase_orders`, `seats`) | Joins to usage signals (§4). An eligibility input for `unused_benefit` notes only, and the must-have-used feature for `faster_way` notes (§2). |
| `boundary` | `invoice_sent` \| `time_logged` \| `part_saved` \| `invite_sent` \| `client_page_sent`, required for `anchor` and `faster_way` | The named completion act the note waits for (§2, finding 11). |
| `body` | text, ≤140 chars (validation) | One sentence of outcome. It may carry `{binding}` tokens (below). Brand-voice lint happens at review. |
| `act` | `{ label: string; hrefTemplate: string }`, optional | The note's one act (finding 18). Both may carry `{binding}` tokens, e.g. `{ label: 'Print {invoiceNumber}', hrefTemplate: '/invoices/{invoiceId}/print' }`. |
| `bindings` | map of token → source | Resolved client-side from already-cached data: `projectName`, `personName`, `invoiceNumber`, `invoiceId`. A note without bindings is generic. A binding that cannot resolve makes the note ineligible for that render; it never prints a hole. |
| `successSignal` | enum, optional | The DB-backed signal in `teaching_signals()` that proves the downstream task happened (§3). It decides `already_knew` (§2). A note without one is never `already_knew`. |
| `successEvent` | string | The PostHog event for the same downstream outcome, never the note's own act (finding 14). Measurement only. |
| `priority` | 1–5 | Tie-break only. |
| `publishedAt` | datetime, set by the Studio publish action | The instant non-release notes measure `already_knew` against. |
| `expiresAt` | datetime, optional | After this, the note is not eligible. |
| `recedeOn` | string[] | Window CustomEvent names, passed straight to `MarginNote.actionEvents`. These are the note's own recede events, not task boundaries. |
| `maxDisplays` | int, default 3 | Three visits (finding 26). Then the outcome is `retired_max`. |
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
| **Committed manifest** | **Picked.** It ships inside the Worker it describes, so it can't announce code that isn't live, and what the bundle announces stays truthful through a rollback. It needs no deploy-time prod write. Its order is the release order, so "since" is a cursor comparison, not a date guess. The cursor itself lives in the database, so a rollback or an old tab can meet a cursor it doesn't know; §1.3 defines that case. |
| Sanity `release` doc by date | Rejected as the source of truth: an early publish would teach unshipped work. Sanity keeps the copy only. |
| `NEXT_PUBLIC_RELEASE_ID` baked by deploy-portal.sh | Rejected. It names a build, not a feature, so it would still need this manifest. |
| `portal_releases` table written at deploy | Rejected. It adds a prod write to every deploy that can fail on its own, and a rollback leaves a lying row. |

A unit test (`teaching-releases.test.ts`) enforces unique ids, a known `sizeClass`, and append-only order: the ids in a committed snapshot file, `content/teaching-releases.snapshot.json`, must be a prefix of the manifest's ids (finding 40). Appending a release means appending to both, so any reorder or removal shows up as a snapshot diff in review. The same test covers the unknown-cursor rule in §1.3: a cursor id absent from the manifest resolves to head and produces no write (finding 10). `minor` releases never produce a return note.

### 1.3 Designer teaching state: `teaching_note_state` (F2 ruling)

Teaching state leaves `help_state` entirely. One migration (the next free number) adds an own-row table:

```sql
CREATE TABLE public.teaching_note_state (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teaching_note_state ENABLE ROW LEVEL SECURITY;
-- Own row only, for SELECT and every write. No other leg, no view, no agent_reader grant.
CREATE POLICY teaching_note_state_select_own ON public.teaching_note_state
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY teaching_note_state_insert_own ON public.teaching_note_state
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY teaching_note_state_update_own ON public.teaching_note_state
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY teaching_note_state_delete_own ON public.teaching_note_state
  FOR DELETE TO authenticated USING (user_id = auth.uid());
```

The state is metadata only, with no copy text and no project ids:

```jsonc
{
  "v": 1,
  "cursor": {
    "lastSeenReleaseId": "2026-09-25-galley-po"  // written once, at initialisation (below); a floor, not a read marker
  },
  "visit": {
    "startedAt": "2026-09-25T14:02:00Z",          // a visit = the first Desk load after 30 minutes away (finding 25)
    "prevStartedAt": "2026-08-14T09:10:00Z",      // drives the since-line (≥30 d gap)
    "lastActiveAt": "2026-09-25T14:40:00Z",       // written on a Desk load and on a tagged boundary; no timers
    "unsolicitedShown": "galley-po@1"             // the visit's one unsolicited note (finding 42: moved here from memory)
  },
  "recentUnsolicited": ["2026-09-24T09:10:00Z"],  // ≤2 instants, rolling 7 d cap
  "ignoredStreak": 0,
  "quiet": { "off": false, "until": null },        // per-person switch; auto-quiet sets `until`
  "seen": {
    "galley-po@1": { "n": 1, "first": "…", "last": "…",
                     "out": "acted" }  // acted | dismissed | retired_max | superseded | null (still live)
  }
}
```

**Cursor (findings 9, 10).** On first load (no row, or no `cursor`), `lastSeenReleaseId` is set to the newest manifest entry whose `shippedOn` ≤ the person's `profiles.created_at`, or `null` when none is that old. The cursor starts at account creation: nobody is taught history, and designers who existed at launch still get every release shipped after they joined. Nothing else moves it. The changes page never touches it (finding 20), and per-note `seen` outcomes decide what she has met. A cursor id absent from the bundle's manifest (a rollback, an old tab, a mixed deploy) is treated as head for that session, and nothing is written.

**Outcomes (SQ-257 promotion 1).** × means `dismissed`, and a dismissal is permanent. A show that ends without × or the named act is a *close*: it adds to `n` and `ignoredStreak`, and at `maxDisplays` the note becomes `retired_max`. `already_knew` is **not** a stored outcome. It is derived on every evaluation from `teaching_signals()` (§2, finding 1), and it is reported by the event in §7, not written. The person cursor is per person, never per studio (promotion 2).

**Write path.** One SECURITY DEFINER function, pinned to `auth.uid()`:

```sql
CREATE OR REPLACE FUNCTION public.teaching_note_state_patch(p_path text[], p_value jsonb)
RETURNS jsonb                      -- the resulting state; the caller adopts it (finding 41: never a silent no-op)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_state jsonb;
  i       int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_path IS NULL OR cardinality(p_path) NOT BETWEEN 1 AND 3
     OR p_path[1] NOT IN ('v','cursor','visit','recentUnsolicited','ignoredStreak','quiet','seen')
     OR (p_path[1] = 'seen' AND (cardinality(p_path) <> 3 OR p_path[3] NOT IN ('n','first','last','out')))
     OR pg_column_size(p_value) > 1024
  THEN RAISE EXCEPTION 'teaching_note_state_patch: path or value refused' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.teaching_note_state (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT state INTO v_state FROM public.teaching_note_state WHERE user_id = v_uid FOR UPDATE;

  -- A terminal `out` is sticky: dismiss = forever, on every device (finding 5).
  IF p_path[1] = 'seen' AND p_path[3] = 'out'
     AND v_state #>> ARRAY['seen', p_path[2], 'out'] IS NOT NULL THEN
    RETURN v_state;
  END IF;

  -- COALESCE each missing parent to '{}' so jsonb_set never no-ops (finding 6).
  FOR i IN 1 .. cardinality(p_path) - 1 LOOP
    v_state := jsonb_set(v_state, p_path[1:i], COALESCE(v_state #> p_path[1:i], '{}'::jsonb), true);
  END LOOP;
  v_state := jsonb_set(v_state, p_path, p_value, true);

  UPDATE public.teaching_note_state SET state = v_state, updated_at = now() WHERE user_id = v_uid;
  RETURN v_state;
END $$;
REVOKE EXECUTE ON FUNCTION public.teaching_note_state_patch(text[], jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.teaching_note_state_patch(text[], jsonb) TO authenticated;
```

The backend (`createSupabaseTeachingNoteBackend`) writes leaves only. `out` is patched separately from the counters, so a stale device can bump `n` but can never clear a dismissal. Counters remain last-writer-wins across two tabs; a lost `n` bump errs toward one more display, bounded by `maxDisplays`. Two tabs racing inside one round trip can each claim `visit.unsolicitedShown`; that residual is accepted (finding 42). The grants require regenerating `seed/00-legacy-grants.sql`.

**What this settles.** Findings 5, 6 and 8 are moot for this feature, because teaching state never goes through `help_state` or an invoker function that needs column SELECT on `profiles`. Findings 7 (iOS) and 51 (the e2e helper) are recorded as SQ-265 writers (F2). No other reader exists: neither iOS app reads `teaching_note_state`, and no view or agent role is granted it.

## §2 Eligibility engine

**Where: a client hook over cached state, plus one read-only SQL RPC.** Selection is a pure TypeScript function, `selectTeachingNote(inputs)`, in `apps/designer-portal/src/lib/teaching/`. It is unit-testable and needs no server round-trip per surface. **It writes nothing** (finding 1). State is written only when a note is displayed, closed, dismissed or acted on. Its inputs:

| Input | Source |
|---|---|
| Notes | Sanity `teachingNote`, published perspective and CDN (the existing `sanityClient.ts`), React Query `['teaching-notes']`, staleTime 30 min |
| Releases | Bundled manifest ∩ published `teachingRelease` |
| Seen state, cursor, visit | `teaching_note_state` via the teaching backend (`['teaching-note-state']`) |
| Lifecycle, usage, boundary and success instants | `teaching_signals()` RPC (§3–§4), `['teaching-signals']`, staleTime 5 min, invalidated on a tagged boundary |
| Flags | `teaching-notes` (the system gate, finding 22) plus a new `useFeatureFlags(names[])` beside `useFeatureFlag`, same fail-closed rule, for the flags the candidate notes name |
| Audience | `teaching_signals().role` |
| At rest | `useTeachingAtRest(surface)` (below) |
| Ranking | `pinnedProjectIds`: the jobs holding her pen (finding 19) |

An edge function and a SQL selector were rejected: nothing has to run server-side, the flags live in PostHog, and the copy lives in Sanity.

**At rest, per surface (F3 ruling).** "At rest" is defined per surface. The sheet or dialog that hosts the anchor **is** the surface, so an open DocSheet does not block its own in-place note. A dialog opened on top of the surface does. In-place notes render inside the hosting sheet's margin after the completion act, with the sheet still open, exactly as mockups 05 and 06 draw. `useTeachingAtRest({ surfaceKey, host })`, where `host` is the hosting dialog element (or `null` for the Desk page), is true only when all of these hold:

1. `useIsMutating() === 0`. No act is pending.
2. `document.activeElement` is not an `input`, `textarea`, `select` or `[contenteditable]`. No composer has focus.
3. No open `[role="dialog"]` other than `host`, and none stacked above `host`. On the Desk (`host = null`), any open dialog blocks.
4. Nothing is registered in the hold registry (below).
5. For `anchor` and `act` slots: none of the above has changed for 1.5 s. The Desk slot uses no settle (finding 13, below).

**Hold registry (finding 12).** `holdTeaching(key)` / `releaseTeaching(key)`, registered by each editor that holds dirty state. `use-drafting-state.ts` is a read-only progress hook and does not take part. A grep of the Document for dirty or unsaved state finds these registration points:
- `hooks/use-buffered-autosave.ts`: one registration while `pending` or `inFlight` is non-empty. It covers its six consumers: `terms-agreement-body.tsx` and the scope-builder `phase-builder`, `payment-milestones-builder`, `change-order-terms-editor`, `deliverables-editor` and `board-room-controller`.
- The Galley and agreement editors: `agreement-composer.tsx`, `galley/galley-fold.tsx` (a part's unsaved clause) and `template-picker-sheet.tsx`.
- `overlays/send-sheet.tsx`, `schedule/schedule-confirm-strip.tsx`, `account/account-studio-page.tsx`, `rooms/piece/piece-configuration-workspace.tsx` (`configurationDirty`), and `people/directory/makers-marketplace.tsx` (unsaved rows).

That is one hook plus nine components. Sheet-local forms without a dirty flag (the invoice composer, the log-time form, Capture a lead) are covered by rules 1–2 and by the boundary rule: nothing in place renders before their completion act. The cost is in Phase 2 (§8).

**Unit of work completed: tagged boundaries (finding 11).** One global `MutationCache` `onSuccess` subscriber in `src/lib/react-query.ts` counts **only** mutations whose `meta.teachingBoundary === true`, alongside `meta.boundaryKey`. This follows the existing `meta.errorSurface` convention on these hooks. Autosaves, fire-and-forget writes and `useMarkFirstDocumentOpened` never count. No CustomEvents are involved. The named completion acts that set the tag:

| boundaryKey | Mutation |
|---|---|
| `invoice_sent` | `useSendInvoice` (`packages/supabase/src/hooks/use-invoices.ts:1114`) |
| `time_logged` | `useCreateTimeEntry` (`use-time-tracking.ts:534`) |
| `part_saved` | `useSaveAgreementPart` (`use-agreement-library.ts:230`) |
| `invite_sent` | `useInviteMember` (`use-organizations.ts:330`) |
| `client_page_sent` | `useInviteAndLinkClient` (`use-clients.ts:727`, R73 invite-on-send); confirm at build that it is the only client-page send path |

The subscriber records `{boundaryKey, at, surfaceKey}` in memory for anchors and patches `visit.lastActiveAt`. An `anchor` note is eligible only if its `boundary` fired on its surface after the surface mounted and the surface is at rest. In-place notes never fire on mount (promotion 3).

**The Desk slot (finding 13).** The Desk is itself a boundary (US-12 decision 3b). The Desk note renders **below the roster head**, and is never inserted above content after paint. It must resolve before the roster's first paint, from notes, state, signals and flags already in cache, with no dialog open and no mutation pending. If it cannot resolve by then, it waits for the next visit.

**Caps, ceiling and ranking (findings 16, 19, 24, 25).**

```ts
function selectTeachingNote(slot: 'desk' | 'anchor' | 'act', surface: string, x: Inputs): TeachingNote | null {
  const t = x.state;                                              // teaching_note_state.state
  if (!x.flags['teaching-notes']?.value) return null;             // system gate, fail closed (finding 22)
  if (t.quiet.off || (t.quiet.until && x.now < t.quiet.until)) return null;   // silences every slot, act included (finding 16)
  if (!x.atRest[slot]) return null;                               // per-surface at rest (F3)
  const exempt = slot === 'act';                                  // consequence sentence, workflow_changing releases only
  if (!exempt) {
    if (t.visit.unsolicitedShown) return null;                    // ONE unsolicited note per visit, across all slots (finding 24)
    if (t.recentUnsolicited.filter(ts => x.now - ts < 7 * DAY).length >= 2) return null;  // 2 per rolling 7 days
  }
  const candidates = x.notes.filter(n =>
       n.trigger === slotTrigger(slot)                            // desk → 'return'; anchor → 'anchor'; act → 'act'
    && (slot === 'desk' || n.surfaceKey === surface)
    && audienceMatches(n.audience, x.signals.role)
    && (!n.flag || x.flags[n.flag]?.value === true)               // loading counts as off
    && (!n.expiresAt || x.now < n.expiresAt)
    && !isTerminal(t.seen[n.noteKey])
    && (!n.prerequisite || isTerminal(t.seen[n.prerequisite]))
    && (n.kind !== 'release' || releaseSinceCursor(n.releaseId, t.cursor, x.manifest))  // unknown cursor → head
    && (n.kind !== 'release' || sizeOf(n.releaseId) !== 'minor')
    && (!exempt || (n.kind === 'release' && sizeOf(n.releaseId) === 'workflow_changing'))
    && !alreadyKnew(n, x)                                         // derived, never written (finding 1)
    && (n.kind !== 'unused_benefit' || (slot === 'anchor' && !x.signals.used[n.featureKey]))  // (b) never on return
    && (n.kind !== 'faster_way' || fasterWayReady(n, slot, surface, x))  // has-used + named boundary (finding 19)
    && (n.trigger !== 'anchor' || x.boundaries.firedOn(surface, n.boundary))
    && bindingsResolve(n, x)                                      // finding 18
    && lifecycleAllows(n, x.signals));                            // §3 table
  // In place is preferred: the Desk defers a note that has an anchor placement on a surface she has used.
  const live = slot === 'desk' ? candidates.filter(n => !hasAnchorTwin(n, x)) : candidates;
  return live.sort(byRank(x.pinnedProjectIds))[0] ?? null;
}

// already_knew: the note's successSignal fired AFTER the release shipped (release notes)
// or AFTER the note was published (all others). "Has ever used the feature" is never a terminal outcome.
const alreadyKnew = (n, x) => !!n.successSignal && (x.signals.lastAt[n.successSignal] ?? 0) >
  (n.kind === 'release' ? shippedOn(n.releaseId, x.manifest) : n.publishedAt);

// faster_way (Phase 2): has-used booleans plus a named boundary, nothing else. Slow-path counters are Phase 3+.
const fasterWayReady = (n, slot, surface, x) => x.signals.used[n.featureKey] && (slot === 'anchor'
  ? x.boundaries.firedOn(surface, n.boundary)                             // this session, on this surface
  : (x.signals.lastAt[n.boundary] ?? 0) > x.state.visit.prevStartedAt);  // Desk: the boundary happened last visit
// byRank: notes bound to a pinned project first → never-seen → oldest last-seen → priority desc → manifest/created order asc
```

Displaying a non-exempt note patches `visit.unsolicitedShown` and appends to `recentUnsolicited`. A visit is the first Desk load after 30 minutes away (no Desk load and no tagged boundary for 30 minutes). The caps are 1 per visit and 2 per 7 days; there is no 24-hour spacing rule (finding 25). Act-slot sentences are exempt from the ceiling, but each is shown once only.

**The Desk arbiter from Phase 1 (finding 17).** Every Desk line goes through one arbiter from Phase 1, which renders at most one of them per visit: `desk-first-touch`, `desk-walkthrough-offer`, `hire-handoff`, `StudioSetupWhisper`, and the new teaching note. Priority, per UX shared addition 3: a person's words (`hire-handoff`), then `desk-first-touch` (first hour only), the walkthrough offer, (d) owner, (a) release, (c) faster way, and last the setup whisper. The whisper is a live derivation, not a once-only note, so it remains a candidate on every visit at the lowest priority. Today all five can stack at once (`desk/page.tsx` L355–425).

**Nothing to teach.** The function returns `null`, and the slot renders nothing: no placeholder, no "you're all caught up", no space kept.

**Ignored → quiet.** A close adds 1 to `ignoredStreak`. Acting or dismissing resets it to 0, because a dismissal is a decision, not an ignore. At 3 the engine sets `quiet.until = now + 30d` and resets the streak.

## §3 Lifecycle stage detection

`teaching_signals()` is `LANGUAGE sql STABLE SECURITY INVOKER`, with search_path pinned and EXECUTE granted to `authenticated` only. It returns booleans and instants about **the caller** (and their own studio membership), computed at read time: `role`, `used.<featureKey>`, `lastAt.<boundaryKey>`, and `lastAt.<successSignal>`. It persists nothing, so it is not a stored profile of the person.

| Stage | Signal | Confidence | Gap |
|---|---|---|---|
| First hour | `profiles.created_at`; `organization_members.joined_at`; `help_state.firstAuthoredAt` absent | High | — |
| First week | `profiles.created_at` ≤7d and `EXISTS projects WHERE designer_id = me` | High | — |
| First client page sent | `min(client_invitations.sent_at)` where `designer_id = me` (revoked excluded) | High | — |
| First agreement signed | `min(proposals.signed_at)` where `designer_id = me`; `commercial_document_signatures.signed_at` for the Galley's signed parts | Medium | Which `document_kind` counts as "agreement" needs one line from the Galley owner |
| First invoice | `min(invoices.sent_at)` where `designer_id = me` or `studio_id` = my studio | High | — |
| First hands | Hand: own `organization_members.joined_at`, `first_document_opened_at`. Owner: active member count >1 (`status = 'active'`) | High | — |
| Return after 7/30/90 d | `teaching_note_state.visit.prevStartedAt` | Phase 2 | `profiles.last_active_at` (00037) has no writer, `user_sessions.last_active_at` is written once at login (00164), and Supabase `last_sign_in_at` misses long-lived refresh sessions. The visit record is the instrumentation |
| Release since cursor | Manifest order vs `cursor.lastSeenReleaseId` | High (P1) | — |
| Feature untouched 60 d | §4 first-use absent and account ≥60d | High for "never used" | **No slow-path signal exists** (e.g. hours typed into notes). Phase 2 teaches `faster_way` only on has-used booleans plus a named boundary; slow-path counters are Phase 3+ and live in `teaching_note_state` (finding 19) |
| Dormant studio (90+ d) | None in the product, and none built here | — | **No signal yet**, and none planned in-product. Ruling R-RT5 |

## §4 Feature-usage signals

The database is authoritative. PostHog is not consulted for eligibility: ad-blockers and `isAnalyticsEnabled` would turn "blocked" into "never used", and the client cannot query PostHog anyway. Each row becomes a `used.<featureKey>` boolean in `teaching_signals()`. "Has used" is an eligibility input for `unused_benefit` notes and the precondition for `faster_way` notes. It is never a terminal outcome for any note (finding 1).

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
| ⌘K, help panel, previews | PostHog only (`document_help_opened`, `document_margin_note`) | — | **Missing in DB.** These drive nothing |

`lastAt.<boundaryKey>` is the latest instant of the same rows: `invoices.sent_at`, `project_time_entries.created_at`, the saved agreement part's timestamp, `organization_members` invited by me, and `client_invitations.sent_at`. Each `successSignal` is one named query over the same tables (§D of `ux-options.md` lists the eight samples' signals). Each query is `EXISTS … LIMIT 1` or `max(…)` on an indexed owner column. Phase 2 verifies each with `EXPLAIN`.

## §5 Delivery surfaces: one hook contract

All three UX options consume this contract (`apps/designer-portal/src/hooks/use-teaching-note.ts`):

```ts
export type TeachingSlot = 'desk' | 'anchor' | 'act';
export interface TeachingNoteView {
  noteKey: string; kind: TeachingKind;
  body: string;                                   // bindings already resolved
  label: string;                                  // release notes: "<NAME> · 11 SEP" (the RELEASE date);
                                                  // others: "<NAME>", no date (finding 27); NAME per R-RT1
  act: { label: string; href: string } | null;    // from act.label + act.hrefTemplate + bindings (finding 18)
  recedeOn: string[]; learnMoreHref?: string;
}
export interface TeachingNoteBinding {        // spread onto the existing <MarginNote>
  noteKey: string; seen: false; actionEvents: string[]; label: string;
  onSeen: (how: 'dismissed' | 'acted' | 'closed') => void;
}
export function useTeachingNoteFor(surfaceKey: string, opts: { slot: 'anchor' | 'act'; host: HTMLElement | null; anchor?: string }):
  { note: TeachingNoteView | null; bind: TeachingNoteBinding | null };
export function useReturnNote(opts: { pinnedProjectIds: string[] }):          // Desk only; ranking input (finding 19)
  { note: TeachingNoteView | null; bind: TeachingNoteBinding | null;
    sinceLine: { items: TeachingReleaseItem[] /* releases only, ≤3 */; changesHref: '/help/changes' } | null };
export function useChangesList():                                 // pull; uncapped; writes nothing
  { releases: TeachingReleaseEntry[]; also: TeachingNoteView[] };
```

Rendering always goes through the existing `MarginNote`, in its controlled mode (`seen` + `onSeen`, already supported). **Changes to the primitive (findings 18, 28, 29):**
1. `onSeen` receives `'dismissed' | 'acted' | 'closed'`. This is backwards compatible, because current callers ignore arguments.
2. A `label` line printed **above** the sentence. Today `caption` renders below it as a footnote (`margin-note.tsx:262`). Existing notes keep their footnote.
3. An `act` slot: one link at 44 px (`min-h-11`, as the whisper's act today). The × stays as it is: about 18 px live (`p-0.5` around an `h-3.5` icon, `margin-note.tsx:266–273`), 24×24 in the mockups. Both clear WCAG 2.5.8 AA; only the act is proposed at 44 px.
4. A `placement: 'anchor'` variant that sets the note in a sheet's margin column.
5. A way to switch off the primitive's own `document_margin_note` capture for teaching notes, so no teaching display is captured with a person identity (§7, finding 15).

- **Desk note.** `useReturnNote({ pinnedProjectIds }).bind` goes into the Desk arbiter's single slot, below the roster head.
- **In place.** `useTeachingNoteFor('designer-portal/document/accounts', { slot: 'anchor', host })` inside the Accounts sheet, and likewise in Hours (`designer-portal/document/hours`) and the Galley. The Galley has no surface key today; this design proposes `designer-portal/document/drafting/galley`, and `designer-portal/document/account/members` for the invite (finding 31). The act slot (`slot: 'act'`) sits above a send act for `workflow_changing` releases only.
- **Collapsed since-you-were-here line.** It appears only when `visit.prevStartedAt` is ≥30 d old. It is one line, and discloses at most 3 **releases** (finding 37), ranked against `pinnedProjectIds` (ruling R-RT3). It never shows a count or a date (finding 43). It is the visit's one unsolicited note. Its link to the changes page is the one permitted pointer to that page (finding 35).
- **Changes page (finding 20, one spec).** The route is `/help/changes` in the Help Center shell (`(document-help)/help`). The ⌘K row label is "What changed". It is reachable from ⌘K, the help panel, and the since-line only, and it never carries a dot or badge. Opening it marks nothing and moves no cursor. It lists every published note filtered to her role and flags: releases grouped by release, newest first, and every other note under "Also", dismissed ones included (finding 23).

## §6 Authoring and release workflow

1. **Agent drafts.** An agent writes a `teachingNote` (and `teachingRelease`) into Sanity as a **draft**, `provenance: 'agent'`, via a draft-only token (the mechanism is an engineering choice made at build: Sanity's Contributor role if the plan offers it, otherwise a Studio `document.actions` override that hides Publish for everyone except Leah's user id). The portal reads only the `published` perspective (`sanityClient.ts` L29), so a draft is the `awaiting_review` state and never reaches a designer.
2. **Leah reviews and publishes.** Publishing is approval, and it stamps `publishedAt`. Sanity's document history keeps who published and when.
3. **Code ships first.** The manifest entry merges with the feature. A release note published before its release reaches the bundle stays dark (§1.2). A non-release note must carry a `flag` or a `releaseId`, so it stays dark too (finding 46).
4. **Release checklist line.** Add one line to the `patina-deploy` skill's portal section: "If `teaching-releases.ts` gained an entry, confirm its `teachingRelease` + notes are published after the deploy verifies. Unpublished copy keeps the release dark." Nothing changes in `deploy-portal.sh`, because the manifest needs no deploy-time step.
5. **Help-article linking.** `learnMore` references an existing `helpContent` helpArticle. The note's link opens it through the existing `ContextualHelpPanel` (`open-help.ts`), never a new tab.
6. **Owner letter (only if ruling R-RT4 allows it).** An agent composes a draft with `branded-email.ts` and enqueues it via `enqueue_agent_task`, landing in `awaiting_review`. It sends only after Leah approves, through `sendCompliantEmail`. No automated send.

## §7 Measurement

**Events.** These follow the `help.*` dot-snake convention and are defined in the help-system `analytics.ts` event map. Teaching events are captured with `$process_person_profile: false`, and under an anonymous per-event `distinct_id` rather than the identified one, so no teaching event is tied to a person (finding 15). Only per-note aggregates exist. Today anyone with access to PostHog project 326191 can open person and event views; that means Patina staff, and Leah reviews as staff while owning customer one. With personless capture, those views hold no teaching event for any person. (The project's member list was not checked from here.)

`help.teaching_note.shown` · `help.teaching_note.dismissed` · `help.teaching_note.acted` · `help.teaching_note.receded` (closed, retired_max, superseded, or expired) · `help.teaching_note.already_knew` (emitted by the hook, not the selector, the first time a note is excluded for that reason) · `help.teaching_changes.opened`

Properties are `note_key, kind, trigger, surface_key, release_id, size_class, audience`. There is no `dwell_bucket` (finding 14), no body text, and no project or client id.

**Per-note aggregates (the only metrics):**
1. **Task shortened.** The share of people shown note N whose `successEvent` fires within 14 days of `shown`, compared with the same event's rate among eligible people in the 14 days before. The `successEvent` is always the downstream task outcome, never the note's own act (finding 14): for example an invoice sent whose delivery row she reads on a later visit, a PO drawn from a signed part, or a time entry logged via the keystroke. There is no holdout (decided).
2. **`already_knew` rate.** Above 50% means the note teaches the obvious: cut it.
3. **Harm.** The dismissal rate and the auto-quiet trigger count per note. A note dismissed by more than 40% of the people shown it is retired at review.

Supporting only: `help.learnmore.expanded` and `document_help_opened` for the note's surface.

**Scale (finding 45).** Insights are built in PostHog project 326191, and any cell with fewer than 5 people is suppressed. At about 24 prod profiles (00555 L236), almost every per-note aggregate is suppressed. **Phase 3 is deferred until scale.**

**Refused metrics:** time in app or on a surface; sessions, DAU, WAU; return frequency or return rate; streaks; open rate or click-through as a target; per-person or per-hand reads, outcomes or last-visit visible to owners; studio leaderboards; any count or dot shown to the designer.

## §8 Phasing and cost

| | Phase 1: walking skeleton | Phase 2: full lifecycle, Option 3 anchors and the changes page | Phase 3: measurement and slow paths (deferred until scale) |
|---|---|---|---|
| Migrations | One (next free number): `teaching_note_state` + RLS + `teaching_note_state_patch` + grants + legacy-grants seed regen. No `help_state` change | `teaching_signals()` (used, boundary and success instants) | None; slow-path counters live in `teaching_note_state` |
| Sanity | `teachingNote` (with `act`, `bindings`, `successSignal`, `boundary`, `publishedAt`), `teachingRelease`; publish guard; flag-or-release validation | `audience`/`trigger`/`prerequisite` validation tightened | None |
| Package | `TeachingNote` type; `createSupabaseTeachingNoteBackend` | — | `analytics.ts` event map (personless) |
| Portal | `teaching-releases.ts` + snapshot + test; `lib/teaching/select.ts` (pure; release kind, Desk slot); `use-teaching-note.ts` (`useReturnNote({ pinnedProjectIds })`, bindings); `teaching-notes` flag gate; **the Desk arbiter over all five lines, below the roster head**; `margin-note.tsx` changes 1–3 and 5; `patina-deploy` line | `useTeachingAtRest` (per surface); **hold registry: 1 hook + 9 components**; **tagged boundaries on 5 mutations** + subscriber; **anchor placement (primitive change 4) in Accounts, Hours, the Galley and the members section**; act slot; visit, caps, ceiling, quiet and streak; `useFeatureFlags`; owner/hand audience; quiet switch in the Account sheet; `/help/changes`, the ⌘K row, the help-panel entry and the since-line; `FeatureAnnouncementCoachmark` retired into the anchor placement | Events and insights; **slow-path counters** and their first detectors; optional owner-letter draft (R-RT4) |
| Lane-days | ~8 | ~16 | ~6 |
| Risks | Sanity role availability; pre-paint resolution on a cold cache (the note waits a visit, which is the safe failure) | `teaching_signals` query cost; at-rest false negatives (the note never shows, which is the safe failure); the hold registry misses an editor added later | Cell suppression hides nearly everything at current scale; events blocked by ad-blockers undercount (aggregates only, accepted) |
| Reversibility | `teaching-notes` flag off (fail closed, finding 22); unpublish notes (instant); the table is additive and no existing write path moved | Same flag; the per-person quiet switch; unpublish | Page and events are removable; no data migration |

**Lane-days: ~30 in all (~24 before scale), against ~21–23 in revision 1 (finding 21).** The increase buys Option 3's anchors, the tagged boundaries and the hold registry in Phase 2, and slow-path counters in Phase 3. The changes page moves from Phase 3 into Phase 2 because Phase 3 is deferred until scale, and dismissed notes must stay findable from the first anchor note on (finding 23). The SQ-265 fix is costed on SQ-265, not here.

**Phase 1** is gated by the `teaching-notes` PostHog flag from day one (fail closed) and touches no existing write path (finding 22). It teaches only `release` notes, one on the Desk per visit, through the arbiter. The cursor starts at account creation (§1.3).

## §9 What happens to existing machinery (finding 44)

- **The 2026-09-03 onboarding deck** (`artifacts/designer-onboarding-learning-2026-09-03/synthesis/decisions.md`). Three of its decisions are superseded for teaching notes: decision 6 ("No flags, except one for the teammate persona"), because teaching notes ship behind `teaching-notes`; decision 7 ("Agents draft to Leah's voice; Kody approves in batches"), because Leah reviews and publishes each teaching note (§6); and the derived "Invite your crew" checklist row in its consequences, which guardrail 7 refuses. Decisions 1 and 2 (the tour's acting last step and "Show me later") stand or fall with the Desk Walkthrough, ruling R-RT2. Decisions 3 and 5 (teach on the real first document; version-suffixed re-arm) are kept.
- **The "First Six Weeks" drip (00561)** stays as it is. Teaching notes are in-product only, and an owner letter exists only if R-RT4 allows it.
- **`FeatureAnnouncementCoachmark`** is retired into the anchor placement. Its Radix popover, pulse ring and dialog role go; its per-feature persistence and `shippedAt` age become the note's `releaseId` and `seen` state.
- **The Desk Walkthrough** (R97) is ruling R-RT2: retire it, or keep it as the one sanctioned exception. Either way it joins the Desk arbiter and teaching notes hold while it runs.
- **Patina Field** is out of scope for this story. No note renders in either iOS app.
- **Empty-state first-use notes** are not part of this system. The existing `emptyState` content type already covers first use (finding 47).
- **"Draw an invoice · new"** (`desk-contents.tsx:397`) is live copy that does the registry's job by hand. It is logged here for retirement once its release note exists (finding 50).
- **SQ-265 writers.** The web adapter, the iOS `SupabaseHelpStateAdapter.swift` and `e2e/helpers/help-state.ts` all write whole `help_state` blobs. They are SQ-265's to fix (R-RT6), not this story's (findings 7, 51).

## Rulings for Kody

- **R-RT1 User-facing name.** Workshop Notes is the evidence-backed default: the designer's own notes are announced as "Margin note actions" (`margin-rail.tsx:748`), and Option 3 sets Patina's notes in the margin she writes in. The alternates are Margin Notes, or no visible name at all (the label carries only a release date), which serves "the studio won't notice Patina" best.
- **R-RT2 The Desk Walkthrough.** Its WelcomeModal and six coachmarks contradict guardrail 2. Retire it, or keep it as the one sanctioned exception. Either way it joins the Desk arbiter, and teaching notes hold while it runs (the existing `suppressed` prop).
- **R-RT3 Since-line relevance input.** Rank the since-line's releases against the jobs holding her pen (`useReturnNote({ pinnedProjectIds })`, as mockup 03 draws), or show the line in the margin of the first document she opens.
- **R-RT4 Owner letter** (framing ruling 2). Whether an owner (d) note may be followed by a letter, drafted by an agent into `awaiting_review` and sent only after Leah approves.
- **R-RT5 Dormant studios** (framing ruling 5). Whether Leah keeps a staff-run, studio-level list of studios dormant 90+ days. Nothing in the product detects dormancy, and nothing here builds it.
- **R-RT6 SQ-265.** Fix the `help_state` clobber (web adapter, iOS adapter, e2e helper) before Phase 1 or alongside it. Teaching state no longer depends on it; tours and margin notes do.

**Decided from evidence (not rulings):** admins count as owners (HT-10: the 00606 header has "owner/admin" read the studio's hours); there is no holdout at this scale (about 24 prod profiles, and cells under 5 are suppressed); the Sanity draft-only token mechanism is an engineering choice made at build.
