# D2 Action feedback: a feedback grammar for every click (US-33, seat 6)

Seat: D2, UI/UX designer. Read-only on the product. The sketches are in `review/d2-sketches/`:
`grammar.html` (the timeline and a live bench you can click) and `frame-strips.html` (P6–P9 and
the 9 components, each with a scrubber). Both use the real tokens from
`apps/designer-portal/src/app/globals.css`. The design canon is waived. Every departure from it is
listed as a candidate ruling in §8 as **D2-PQn**. Synthesis gives them their final PQ numbers.

## 0. What I designed against

**No click timings exist yet.** The baseline did not measure P6–P9 (`baseline/BASELINE.md`, "Why
the write scenarios were not measured"). E1 is measuring P6 in parallel with this seat. Until it
reports, every threshold here is set against the measured prod request durations (BASELINE.md,
"Request durations"), plus the orchestrator's note on SQ-957:

| Fact | Value | Source |
|---|---|---|
| One API request, prod | p50 243 ms, p90 803 ms | BASELINE.md, prod walk |
| `auth/v1/user`, prod | p50 104 ms, p90 367 ms | same |
| Click → settled today | write, then 2–4 serial invalidation refetches: **about 0.5–3 s** | SQ-957 comment 1 (estimate, not measured) |
| SPA first change, prod | 248–608 ms | BASELINE.md, SPA navigations |

Two consequences shape the whole grammar:

1. **A single write at p50 (243 ms) finishes before 400 ms.** At p90 (803 ms) it does not. So a
   pending word that waits for 400 ms stays hidden on most writes and appears on the slow tail,
   which is when it is useful.
2. **Today, "settled" means the refetch has landed, not the write.** Every write is followed by
   broad invalidation. For example, `useToggleSectionTask` invalidates `['section-tasks']`,
   `['document-state']` and the project workflow (`hooks/use-section-work.ts:154-158`). The
   grammar settles on **the write's own response**. The refetch then reconciles silently. That
   only holds if E1 changes the hooks (§7).

## 1. What already exists (the grammar is mostly assembled from parts the portal has)

The portal already has every stage. They are spread across different components and have never
been named as one grammar.

| Stage | Existing part | File:line |
|---|---|---|
| Press, 0 ms | `.da-act:active`: the word drops 1 px on the 70 ms in-clock, and the ink opens from the contact point | `globals.css:211-212` (`--press-in` 70 ms, `--press-out` 240 ms), `globals.css:943-955` |
| 44 px target | `.da-act` `min-width/min-height: 44px` | `globals.css:689-702` |
| Pending word | `DocumentAction` `loading` + `loadingLabel` swaps the word at once, adds a pulse dot, sets `aria-busy` and stills under reduced motion | `document-action.tsx:206-219`, `:235` |
| Pending line + double-click guard | Phase handoff: a ref guard, a `role="status"` line "Completing Concept…", an inline error | `phase-advance-control.tsx:324-347`, `:404-417` |
| Honest send states | "Sending", "Sent to …" only on receipt, "Not sent — …", "Sent. It didn't record here — …" | `acts/act-draft.tsx:40-51`, `:354`; `outbound/outbound-draft-review.tsx:228-229`, `:281-287`; `outbound/ready-to-send-sheet.tsx:203-206` |
| Inline failure (R83) | `meta: { errorSurface: 'inline' }` opts a mutation out of the global toast so the act site renders "a quiet inline band … with the reason and a retry act" | `lib/react-query.ts:14-22`, `:112-163` |
| Undo, delete | The build-room Undo row: in the flow, never fixed. It takes focus, counts down 10 s and is announced | `pieces/undo-toast.tsx:15`, `:66-87` |
| Undo, text apply (US-32) | Whisper "Undo", then "Undone." / "Changed since — left as is." / "Undo did not save. Try again." | `field/text-undo.tsx:25-27`, `:60-90` |
| Optimistic, with rollback | 10 `onMutate` sites, including reorder (`use-scope-builder.ts:235`, `:285`), resolve (`use-coordination.ts:1291`) and piece fields (`hooks/use-piece-field.ts:64`) | — |

**Correction to the sweep:** there are 10 `onMutate` sites, not 5 (`grep onMutate` across
`packages/supabase/src/hooks` and `apps/designer-portal/src`). Three of them are cart lines in
`hooks/use-orders.ts`. Another is `use-availability.ts:82`, and another is `use-comms.ts:71`.

**What "silent" really means today.** An untagged mutation that fails is not silent. The global
`MutationCache.onError` raises a destructive toast titled "Error", which shows the raw message for
5 s (`lib/react-query.ts:165-166`, `lib/error-handler.ts:811-820`). So a failed task tick shows a
red toast, far from the row, worded as a database error. Network errors are also **retried once**
for every mutation by default (`lib/react-query.ts:242-249`). On a lost network, that doubles the
wait before anything is said. It also means a non-idempotent write could run twice (§6.2).

## 2. The grammar: one timeline for every click

There are six stages. The rule that holds them together: **within 100 ms, exactly one thing
answers the click.** For an optimistic class, it is the new value. For a pending-only class, it is
the verb in progress. A second signal is shown only when the first one is not enough.

| Stage | When | Optimistic classes (tick, edit, create, reorder) | Pending-only classes (advance, send, money, delete without Undo) |
|---|---|---|---|
| **S0 Press** | 0 ms (pointerdown / keydown) | The control deepens on `--press-in`: the word drops 1 px and the row warms to `--bg-warm` | Same press |
| **S1 Answer** | ≤100 ms (budget B1) | **The value changes.** The tick stamps ✓ in sage and the title goes muted. A new row appears as a faint "ghost" row | **The word changes.** "Complete the phase" becomes "Completing…". The control is held (`aria-busy`, guarded against a second press). A `role="status"` line names what is happening |
| **S2 Pending** | Only if not settled by **400 ms** | The row's meta column reads `saving…` in `--text-muted`. Once shown, it stays at least 500 ms so it never flashes | Nothing new: the word has been showing since S1. At **8 s** a second line appears: "Still working. You can leave this open." |
| **S3 Settled** | When the **write** responds (not the refetch) | The meta goes back to the server's truth (`done · 14 Oct`). No flourish | The word goes back. The status line gives the receipt in plain words ("Concept is complete. Refinement is next."), politely announced |
| **S4 Failure** | On error | **Restore server truth** (roll back). One plain line under the row in `--color-terracotta-ink`, `role="alert"`, plus a 44 px **Try again**. Focus stays on the control | The word goes back. The same one-line alert says what state things are in **now** ("Nothing was sent."), plus Try again where a retry is safe |
| **S5 Undo** | Only where Undo already exists (§2.3) | The Undo row, in the flow, takes focus | Not offered |

### 2.1 Why 100 / 400 / 500 ms / 8 s

- **100 ms** is budget B1 (contract). It matches Nielsen's "feels instantaneous" limit and RAIL's
  100 ms input response (`r-patterns.md` §2, "Response-time thresholds").
- **400 ms** is the Doherty heuristic (`r-patterns.md` §2; the source flags it as a heuristic, not
  a boundary). It sits between the measured p50 (243 ms) and p90 (803 ms), so the word appears only
  on the slow tail. The practice range for flash delays is 100–600 ms (`r-patterns.md`,
  "Flash-of-loading-state thresholds"). 400 ms is inside it.
- **500 ms minimum hold** comes from the Vue practice write-up cited in `r-patterns.md` (200 ms
  delay plus 500 ms minimum). React also throttles Suspense reveals to 300 ms. No primary study sets
  this number. It is a design choice: D2-PQ2.
- **8 s** comes from NN/G: past about 10 s, attention is lost (`r-patterns.md` §2). The second
  line appears before that point. It never promises that the write will complete.

### 2.2 Quiet vs expressive treatment of each stage

Both directions are drawn in `grammar.html`. The quiet one is built only from parts the portal
already has. The expressive one is what the waived canon allows. Each of its departures is listed
in §8.

| Stage | Quiet (paper, ink words, no motion beyond the press) | Expressive (canon waived) |
|---|---|---|
| S0 | `.da-act:active` press. The row warms to `--bg-warm` | The ink pool opens from the contact point (the `.da-pool` clip-path, now on rows too) |
| S1 | Value swap in ink. The ghost row is in `--text-faint`, with a dashed `--color-pearl` rule | The ✓ stamps in over 120 ms (opacity and a 0.92→1 scale, no bounce). The ghost row slides open over 150 ms |
| S2 | The mono word `saving…` in the row's own meta column | A 2 px `--color-clay` hairline draws under the row, plus the band's `Saving…` indicator (§6.1) |
| S3 | The meta reads true. Nothing else moves | A `--wash-direction-still` wash fades out under the row over 600 ms. The band shows "Saved · 10:42" for 2 s |
| S4 | The inline R83 line, `role="alert"`, with Try again | The same line, plus a `--wash-terracotta` wash on the row. **Never** a shake, and never a red global toast |
| S5 | The in-flow Undo row (`undo-toast.tsx`) | The same row pinned to the bottom of the viewport, with an elevation shadow (D2-PQ6) |

**Never, in either direction** (the studio promise): no confetti, no checkmark burst, no counters
that animate up, no streaks, no "nice work", and no sound. An S3 settle is a return to truth, never
a reward. The work-block tally ("3 of 5 done") changes as plain text.

**Reduced motion:** each stage keeps its words and colours, and every transition, wash and hairline
is dropped. The hairline becomes the static word `saving…`. `DocumentAction` already does this for
its pulse dot (`motion-reduce:animate-none`, `document-action.tsx:209`).

### 2.3 Undo: only where it already exists

Undo is a stage, not a promise. It appears where a restore path exists today:

- **Build-room Remove** (`pieces/undo-toast.tsx`, US-21): 10 s, focus on Undo, announced.
- **Text apply** (US-32, `field/text-undo.tsx`, `revert_model_apply_group`).
- **Return to lead** (`return-to-lead-undo.tsx`) and the Desk and Day Sheet rows that import Undo
  (from `grep -l Undo`; their Undo behaviour was not read).

**Honesty wording for an optimistic delete with Undo.** Until the server confirms, the row reads
"Removing Rattan lounge chair… Undo". It changes to "Removed …" only on receipt. This keeps the
rule that nothing says "deleted" before the server does, while still answering within 100 ms.

## 3. Classes of action, and which grammar each gets

| Class | Grammar | Why | Today's examples |
|---|---|---|---|
| **Toggle / tick** | Optimistic, via the cache (`onMutate`), because the tally, the Desk need-list and the phase gates read the same rows | Reversible and idempotent: the final state wins. Two fast ticks serialize (§6.3) | `work-block.tsx:314`, `coordination-work.tsx:152`, `:160` |
| **Edit in place** (a field on blur, a select) | Optimistic by nature: the input already shows the value. S2 `saving…` sits beside the field. On S4, **keep the typed text** and show the line. Never wipe what she typed | Data-loss prevention | `palette-swatch-editor.tsx:50`, `:62`; `use-piece-field.ts:64` |
| **Create** (room, piece, task) | Optimistic **ghost row**, drawn from the mutation's `variables`, which is TanStack's "simpler variant" with no cache surgery (`r-patterns.md` §3). The ghost keeps her words through failure. Try again / Discard | Never clear the input before the server confirms. Today two sites do (§4) | `ffe-section.tsx:940`, `rooms-rail.tsx:74`, `work-block.tsx:225`, `coordination-work.tsx:93` |
| **Reorder** | Optimistic (this already exists). On S4 the item snaps back with one line. Keyboard moves announce "Moved Sofa to 3 of 7" | Fully reversible | `use-scope-builder.ts:235`, `:285` |
| **Status advance** (phase) | **Pending-only.** Not optimistic | `advance_project_phase` is guarded by an expected status and returns a receipt that decides the outcome text. It fans out into gates, the margin and the Strata Mark. Showing the next phase early could show a phase the RPC refuses | `phase-advance-control.tsx:417` → `use-project-v2.ts:626-642` |
| **Draft approve / send** (V23 draft-first) | **Pending-only, never optimistic.** "Sending" at S1. "Sent to …" only on receipt. "Not sent" when it is known that nothing went | A client or vendor send is an external fact. The existing outbound and ActDraft code is already right: keep it as the reference | `outbound-draft-review.tsx:228`, `ready-to-send-sheet.tsx:314`, `act-draft.tsx:354`, `act-sheets.tsx:125`, `:238` |
| **Money** (invoice reminder, PO release, payments) | **Pending-only, never optimistic.** Amounts and balances never change on screen before the server. Retry is offered only with an idempotency key | Internal payable state is the source of truth (Agent OS rules) | `act-sheets.tsx:176` (invoice reminder), `:278` (PO release); `plan-issue-ceremony.tsx:191-193` already carries an `idempotencyKey` |
| **Delete** | **Only with Undo** may it be optimistic, and then with the "Removing…" wording (§2.3). Without Undo it is pending-only: "Deleting…", and the row leaves only on receipt | Honesty rule | Optimistic with Undo: build-room Remove. **Breaches**: `palette-swatch-editor.tsx:73`, folio image remove (`piece-folio.tsx:96`) |
| **In-app nudge** | Pending-only ("Nudging…"), "Nudge sent to …" on receipt. This is correct today | Checked: `stamp_client_decision_reminder` inserts a `delivered` in-app `notification_log` row for the client (`supabase/migrations/00465_project_approval_notification_traceability.sql`), so "sent" is true once it returns | `resolve-signoff.tsx:63-74` |
| **Background / best-effort** (telemetry, link stamps) | No UI by design. A failure is logged and never toasted | It is not the studio's act | `board-suggestions-rail.tsx:81`, `com-slot.tsx:187`, `compose-decision-sheet.tsx:81` |

## 4. The 9 no-feedback components, verified

The plan says "9 components call `mutate` with no pending state at all" (plan, lines 51-53). I
reproduced it with a heuristic: every `.tsx` under `apps/designer-portal/src` that calls
`.mutate(`/`.mutateAsync(` and contains no `isPending|isLoading|pending|saving|busy|submitting`.
It returns 11 files. Two of them are not components: `app/auth/accept-invite/page.tsx` has a
`status` state machine, and `hooks/document-time-provider.tsx` is a provider. **That leaves
exactly 9.** On reading them, only 4 are genuinely silent at the act site.

| # | Component | Call sites | Verdict | Strip |
|---|---|---|---|---|
| 1 | `components/document/acts/act-sheets.tsx` | 97, 99, 125, 176, 182, 238, 278 | **Has feedback**, delegated: each `mutateAsync` runs inside `<ActDraft onSend>`, which owns `pending`, "Sending…"/"Approving…" and the honest error states (`act-draft.tsx:127`, `:354`). This is the reference for P9 | `#frame-c1` |
| 2 | `components/document/coordination/compose-decision-sheet.tsx` | 81 | **Background by design.** It is a best-effort link stamp after the decision exists ("a lost link never blocks"). Untagged, so a failure raises the global "Error" toast for a link she never asked for → tag it `errorSurface: 'inline'` and log only | `#frame-c2` |
| 3 | `components/document/coordination/coordination-work.tsx` | 93 (create), 152, 160 (tick) | **Silent.** The tick waits 0.5–3 s with no change. A create clears the input and closes the field before the server answers (`:93-100`) | `#frame-c3` |
| 4 | `components/document/plans/plan-issue-ceremony.tsx` | 191, 209 | **Has feedback** (`sending` state, `loadingLabel="Sending…"`, a per-recipient unsent list, `idempotencyKey`). The heuristic missed the word `sending`. Reference for money/send retries | `#frame-c4` |
| 5 | `components/document/rooms/piece/piece-folio.tsx` | 39 | **Optimistic, no pending, and a delete with no Undo.** `usePieceField` writes the cache and rolls back (`use-piece-field.ts:64-80`). There is no S2 word, the error `<p>` has no `role="alert"` (`:283-286`), and image **remove** (`:96`) is an optimistic delete with no Undo | `#frame-c5` |
| 6 | `components/document/work-block.tsx` | 225 (create), 314 (tick) | **Silent. This is P6.** The tick is a raw `<button>` with hover only and no `:active` (`:312-317`). Its row is about 29 px tall (`py-1.5` + 12 px text, from the classes, not measured), **under 44 px** | `#frame-p6`, `#frame-c6` |
| 7 | `components/portal/procurement/order-paper/com-slot.tsx` | 187 | **Background by design**: `.catch(() => undefined)` on a reconstructible link | `#frame-c7` |
| 8 | `components/portal/scope-builder/board-suggestions-rail.tsx` | 81, 100, 117 | **Telemetry only.** Dismiss hides at once in local state (`:115`). Accept hands off to the parent's `onAdd`. Missing: a polite "Dismissed …" announcement and focus moving to the next suggestion | `#frame-c8` |
| 9 | `components/portal/scope-builder/palette-swatch-editor.tsx` | 50, 62, 73 | **Silent, and it misstates state on failure.** Role is set locally before the write and never rolled back (`:61-62`), so a refused write leaves the select showing a value the database does not hold. Delete uses `window.confirm`, then a silent remove with no pending and no Undo (`:72-73`) | `#frame-c9` |

**Three more silent failures the heuristic cannot see**, because those files mention `isPending`
somewhere:

- `ffe-section.tsx:934-946` (**P8, add a room**): it clears the name and budget and closes the
  field **before** the write. Nothing appears for 0.5–3 s. On failure the global toast fires and
  **her typed name is gone**. This is the worst create in the portal.
- `rooms-rail.tsx:74-86`: it has a guard and "Adding…", but no `onError`, so failure means a
  global toast while the field sits there unchanged.
- `resolve-signoff.tsx:48-75`: it has "Recording…"/"Nudging…", but no `onError`, so failure means
  a global toast and the panel returns to idle with no line.

## 5. Frame strips: P6–P9

Every strip in `frame-strips.html` has a **Today** row, a **Quiet** row and an **Expressive** row,
at S0 / S1 / S2 (400 ms) / S3 / S4, with S5 where it applies. A scrubber (0–3,000 ms, plus a
"server fails" switch) highlights the frame that is live at time *t*. The anchors are
`#frame-p6` … `#frame-p9` and `#frame-c1` … `#frame-c9`.

- **P6, tick a task** (`work-block.tsx:314` → `use-section-work.ts:141-159`). Today, S0 to
  about 0.5–3 s shows **no change at all**, then the ✓ appears when the refetch lands. A failure
  is a red global toast. Proposed: ✓ at S1, `saving…` only after 400 ms, settle on the write, roll
  back with an inline line at S4. The row grows to a 44 px target.
- **P7, advance a phase** (`phase-advance-control.tsx:417`). Today it is already the best act in
  the portal: press, "Completing…", a status line, receipt notice, inline error, ref guard. The
  one gap: the notice settles at the write, but **the phase list itself changes only after five
  invalidations** (`use-project-v2.ts:637-642`, including `['document-state']`), so the page
  disagrees with the notice for 0.5–3 s. Proposed: write the receipt into
  `['project-phases', id]` on success (E1). Add the 8 s "still working" line.
- **P8, add a room or piece** (`ffe-section.tsx:940`, `rooms-rail.tsx:74`). Today the field
  closes and goes blank, and the room arrives 0.5–3 s later (or never, with her words lost).
  Proposed: a ghost row at S1 with her words in faint ink, and the input stays open, empty and
  focused for the next room. "adding…" at 400 ms. On S3 the ink goes solid and "Sunroom added." is
  announced politely. On S4 the ghost keeps the name, with Try again / Discard.
- **P9, approve or send a draft** (`outbound-draft-review.tsx:228`, `ready-to-send-sheet.tsx:314`).
  **No optimistic frame exists in any row.** S1 is the word "Sending", and the draft text stays as
  it is. S3 is "Sent to {recipient}." only on receipt. S4 uses the existing honest lines ("Not sent
  — …", or "Sent. It didn't record here — try marking it again." when the send went but the record
  did not). The proposed change is the 8 s line, worded so it promises nothing: "Still sending.
  Nothing is sent twice." That wording is allowed **only if** E1 confirms the send path is
  idempotent (§7). Otherwise the line is "Still sending."

## 6. Global affordances

### 6.1 A quiet "saving…" indicator
One indicator per paper, at the right end of the lens band (`--doc-band-height`, 56 px). It shows
`saving…` in mono 11px `--text-muted` when `useIsMutating()` is above 0 for more than 400 ms. It is
`role="status"` and silent to screen readers: each act announces its own result, and a second
announcement would only add noise. In the quiet direction it disappears when nothing is pending.
In the expressive direction it shows "Saved · 10:42" for 2 s. It is never a persistent badge (the
studio promise). **beforeunload:** while a write is pending, closing the tab asks first. This is
data-loss prevention and does not need a ruling.

### 6.2 Offline and retry
- **Optimistic classes** may wait while offline. TanStack pauses mutations under the default
  `networkMode: 'online'`. The band then reads "Offline. Ticks and edits will save when you're
  back." Pausing has to be confirmed by E1.
- **Sends and money must not queue.** A send that fires minutes later, on reconnect, is a surprise
  send. They should fail fast (`networkMode: 'always'`, `retry: false` unless idempotent) with
  "You're offline. Nothing was sent."
- **The global one-retry-on-network-error** (`react-query.ts:242-249`) applies to *every* mutation
  today, sends and money included. E1 should confirm that each send and money mutation is
  idempotent or opts out (§7, item 7).
- **Try again** re-runs the same variables. For a create, it reuses the ghost's client id, so a
  retry after an ambiguous failure cannot make two rooms (E1: needs an idempotency key or upsert).

### 6.3 Double-click guards
- Pending-only acts: hold the control with a ref guard plus `disabled`/`aria-busy`. This exists in
  `phase-advance-control.tsx:408`, `rooms-rail.tsx:72` and `DocumentAction`.
- Toggles: **do not block a fast second tick.** Last intent wins. Serialize the writes per task
  with a mutation scope id `task:{id}`, so the server ends at the state she last saw. E1 should
  confirm TanStack v5 `scope` support in 5.90.21.
- Creates: Enter while a ghost is pending creates a *second* ghost, never a duplicate of the first.

### 6.4 Focus management
- Focus **never moves on success** of a tick, edit or reorder.
- Pending: focus stays on the held control, which stays focusable (`DocumentAction` `held`
  semantics).
- Failure: focus stays put. The line is `role="alert"`, and Try again comes next in tab order.
- Create: focus returns to the empty input (add another). The new row is announced.
- Delete with Undo: focus goes to Undo. On expiry it moves to the next row (existing
  `undo-toast.tsx` behaviour).
- The tick should expose its state: `aria-pressed` on the row button (or `role="checkbox"` +
  `aria-checked`). Today its glyph is `aria-hidden` and the state is heard only through the meta
  text (`work-block.tsx:337-349`).

## 7. Dependencies on E1 (for seat 9 to pair)

These are the mutations that must change for the grammar to hold.

| # | Mutation (file:line) | Needed change | Grammar it unblocks |
|---|---|---|---|
| 1 | `useToggleSectionTask` (`hooks/use-section-work.ts:141-159`) | `onMutate` on `['section-tasks', projectId]` + rollback. Settle on the write. Narrow `['document-state']` (`:156`). De-dupe the realtime echo so the ✓ does not flicker (`use-coordination.ts:1602`). Scope id per task. `errorSurface: 'inline'` | P6, C3, C6 |
| 2 | `useCreateSectionTask` (`use-section-work.ts:105-138`) | Expose `variables`/`isPending` for the ghost row. Make it idempotent with a client id. `errorSurface: 'inline'` | C3, C6 create |
| 3 | `useAddDocumentRoom` (`hooks/use-document-rooms.ts:40`) | The same ghost-row contract, plus a component change at `ffe-section.tsx:934-946` so it stops clearing before the write | **P8** |
| 4 | `useAddScopeRoom` (`packages/supabase/src/hooks/use-scope-builder.ts:98`) | `errorSurface: 'inline'`, and the caller renders the line | P8 (rail) |
| 5 | `useUpdateProjectPhaseStatus` (`use-project-v2.ts:626-642`) | Stays **pending-only**. On success, write the receipt into `['project-phases', id]` so the list changes with the notice. Narrow the five invalidations | **P7** S3 |
| 6 | `useUpsertSwatch` / `useDeleteSwatch` (`use-palettes.ts:263`, `:329`) | Upsert: optimistic with rollback, replacing the component's local `setRole`. Delete: a restore path for Undo, **or** stay pending-only (D2-PQ8) | C9 |
| 7 | All send and money mutations (outbound send, `sendInvoice`, PO release, transmittals) | Confirm idempotency. `networkMode: 'always'`. `retry: false` unless idempotent. **No `onMutate` ever** | P9, money |
| 8 | `usePieceField` (`use-piece-field.ts:64`) | Already optimistic. It needs the folio caller to show S2/S4, and Undo for image remove (re-persist the previous list) | C5 |
| 9 | `useResolveCoordinationItem` / `useNudgeCoordinationItem` (`use-coordination.ts:1291`, `:1460`) | Already right. The caller (`resolve-signoff.tsx`) needs `onError` → an inline line | sign-off |
| 10 | Shared `useOptimisticMutation` (E1 spec) | It must expose `isPending`, `variables`, the start time (for the 400 ms rule) and rollback. A global `useIsMutating` count feeds §6.1 | all |
| 11 | Background stamps (`compose-decision-sheet.tsx:81`, `com-slot.tsx:187`, `board-suggestions-rail.tsx:81`) | `errorSurface: 'inline'` (or a new `'silent'`) so a background failure never raises "Error" | C2, C7, C8 |

## 8. Candidate PQ rulings

| ID | Ruling Kody would make | Canon departure? | D2 recommends |
|---|---|---|---|
| D2-PQ1 | Adopt **optimistic ink** for toggles, edits, creates and reorder, behind a flag (the plan's US-34 rule) | Yes: the state shown is the studio's intent before the server's confirmation | Yes |
| D2-PQ2 | The **400 ms** pending threshold and **500 ms** minimum hold, for optimistic classes only. Pending-only acts keep the immediate word | Changes `DocumentAction`'s immediate swap for optimistic callers only | Yes |
| D2-PQ3 | A **band-level `saving…` indicator** (§6.1): quiet (disappears) or expressive ("Saved · 10:42") | New chrome on the paper | Quiet |
| D2-PQ4 | The expressive **hairline progress** and **settle wash** | Motion on surfaces the canon keeps still ("Nothing on the Desk ever moves", `globals.css:307`) | No |
| D2-PQ5 | Retire the red global "Error" toast for (document) mutations. Every Document act uses R83 inline lines | Extends R83 everywhere. Removes a fixed-position element | Yes |
| D2-PQ6 | The expressive **fixed Undo row with a shadow** | Two departures: fixed position (`undo-toast.tsx` "never fixed") and a shadow (D4 zero shadows, `globals.css:196-198`) | No |
| D2-PQ7 | Task rows grow to a **44 px target** | Denser work blocks get taller, a density change | Yes (not waivable anyway) |
| D2-PQ8 | Palette swatch delete: **add Undo** (needs a restore path) or **keep a confirm**, made in-page instead of `window.confirm`, and pending-only | The native dialog is already off-canon | Undo |
| D2-PQ9 | **Offline**: optimistic classes wait and save later; sends and money refuse offline | New offline language in the band | Yes |
| D2-PQ10 | The 8 s **"still working"** line, and whether "Nothing is sent twice" may be said (only if idempotent) | New copy | Yes, conditional on E1 |
| D2-PQ11 | Folio image **remove gets Undo**. Every optimistic delete reads "Removing…" until receipt | New Undo surface | Yes |

## 9. Limits of this seat

- No click was timed. Every stage time is a design threshold set against BASELINE.md request
  durations and the 0.5–3 s settle estimate. E1's P6 measurement should replace that estimate.
- The ~29 px task-row height was derived from Tailwind classes, not measured in a browser.
- TanStack `scope` serialization and offline pausing are stated from library knowledge, not tested
  on 5.90.21. They are listed for E1 to confirm.
- The sketches are standalone. They copy token values from `globals.css` and run no portal code.
  The portal paints no dark paper set (`globals.css:56-58`), so the sketches are light only and
  declare `color-scheme: light`.
