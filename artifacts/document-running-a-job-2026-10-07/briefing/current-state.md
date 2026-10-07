# The Document: current-state action inventory

Scope: factual inventory only — no recommendations. All paths relative to `apps/designer-portal/src/` unless noted. Breakpoints marked "unverified" mean the researching pass found no central source (CSS variable / Tailwind config) for that number; each consuming component repeats the literal value independently.

## 1. Shell and wayfinding devices

Shell mount order (`app/(document)/layout.tsx`): providers, then children, then `LogStrip, StudioDrawer, RegistryShortcuts, KeysShortcut, KeysSheet, CommandBar,` overlays, `MobileBar, MobileSheets, DeskWalkthrough, DeskDoorway`. No `ToastProvider` — failures render as inline quiet bands at the act site, never floating toasts.

Four independent breakpoint systems exist, none centrally defined: the Document's own 1180px/1440px tiers (repeated per-component), the walkthrough's own 980px (`desk-walkthrough.tsx`), and margin notes' own 860px (`margin-note.tsx`, `teaching-anchor-note.tsx:25-26`).

| Device | What it shows / when it appears | Position at 1440 / below 1180 | file:line |
|---|---|---|---|
| **Desk** | Greeting, date, "Capture a lead" / "Open a project" / "Find anything ⌘K", roster. Always at `/desk`. | Single column `max-w-[1120px]`; identical at every width. | `app/(document)/desk/page.tsx` |
| **StudioDrawer bar + breadcrumb** | Breadcrumb, room doors (Library/People/Rooms), "Ledgers" menu (Orders/Accounts/Hours/The Post/Call sheet), "Find anything", in-hand readout, Post bell. Fixed bottom bar. | 60px grid bar `hidden ... min-[1180px]:grid`; **hidden below 1180**. "Find anything" text label hides below 1440 (`hidden min-[1440px]:inline`). | `studio-drawer.tsx:282,452` |
| **Spine + lens ladder** | Stage phrase, ladder segments, room rungs, "Filed with this job" doors (Plan room/Spec book/Boards/Call sheet). | `hidden ... min-[1180px]:block`; narrow 1180–1439, full width from 1440; room rungs `hidden ... min-[1440px]:flex` — **room rungs never show below 1440**, gated separately by `printRooms`. | `doc-spine.tsx:140`; `spine/lens-ladder.tsx` |
| **Letterhead** | Title (fixed 34px at all widths), vitals (dates/budget), instruments ("Message {family}", "Preview", scan, sharing tier, call sheet). | Single column below 1180; two-column (`min-[1180px]:grid-cols-[...]`) from 1180. Vitals wrap below 1180, nowrap from 1180. | `doc-letterhead.tsx`; `letterhead-vitals.tsx` |
| **Lens band** | Line 1: identity+stage / money. Line 2: guide sentence + act button + "+N more". Guide copy sourced from `lib/document/document-guide.ts`. | Fixed 56px sticky band; **no 1180/1440 breakpoint at all** — identical chrome every width; pins via `IntersectionObserver`, not viewport. | `lens-band.tsx`; `lib/document/lens-band-derivation.ts` |
| **Red-letter zone** | "Needs attention · in one place" + urgent rows. Returns `null` when `rows.length === 0`. | No responsive classes at all. | `red-letter-zone.tsx` |
| **Phase-advance control** | "Phase handoffs"; "Complete phase"/"Resume phase"; empty/loading copy. | No 1180/1440 classing (only an unrelated `sm:` 640px inside one row). | `phase-advance-control.tsx` |
| **Margin rail** | "In the margin" panel; tab "Margin · {count}{· worst}"; "+ Decision"/"+ Note"; drafts/settled groups. | Hidden below 1180; overlay drawer 1180–1439 (`COMPACT_MARGIN_QUERY`); persistent sticky column from 1440 (`FULL_MARGIN_QUERY`). | `margin-rail.tsx:144-145` |
| **Settled bars + the Record** | Fold/unfold previous work; "The record" head, approvals doorway. | No responsive classes; fold state is lens-density-driven (`useLensDensityStore`), not width-driven. | `settled-bar.tsx`; `previous-work.tsx` |
| **Shelves** | Plan room / Spec book / Boards / Call sheet / Client's copy. | `fixed ... hidden ... min-[1440px]:block` — **hidden entirely below 1440**; a shelf with a route redirects to its own page below 1440 instead of rendering invisible chrome. | `lib/document/shelves.ts:49-136`; `shelves/shelf-panel.tsx` |
| **Command bar / ⌘K** | Modal palette; empty-query sections ("Where the work stands", "In hand", "Rooms & ledgers"...); typed query always offers "Ask about…". | `fixed inset-0`; **no breakpoint gating** — identical fluid modal at every width. | `command-bar.tsx` |
| **`g` keys** | `g,l` Library · `g,p` People · `g,r` Rooms · `g,o` Orders · `g,a` Accounts · `g,h` Hours · `g,t` The Post. Disabled when an overlay is open or focus sits in an editable field. | Keyboard-only; no responsive styling. | `lib/document/registry.tsx`; `registry-shortcuts.tsx` |
| **Keys sheet** | "The keys" reference list, opened by bare `?`. | Not inventoried for breakpoints. | `overlays/keys-sheet.tsx`; `keys-shortcut.tsx` |
| **Help panel** | `ContextualHelpPanel` (shadow-none); footer "Browse all help →" + "What changed" (if `teaching-notes` on). Full Help Center lives at `/help`. | Not inventoried for breakpoints. | `help/document-help.tsx`; `app/(document-help)/help/` |
| **Walkthrough** | 6-step tour (Desk, "One client, one document", Rooms & ledgers, the drawer, "Find anything", "Begin with a lead"); teammate variant. Auto-opens for fresh signups after 2026-07-10; offered quietly to existing designers otherwise. | Own 980px gate (`matchMedia`). | `help/desk-walkthrough.tsx:131-229`; `desk-walkthrough-gate.ts` |
| **Margin notes** | One-time dismissible note, caption "Appears once · Recedes on use". Synced per-person via `profiles.help_state.marginNotes`. | Own 860px breakpoint: stacked below, two-column (left-border) from 860. | `margin-note.tsx`; `hooks/use-margin-notes.ts` |
| **Workshop Notes** | Label "WORKSHOP NOTE"; slots `desk`/`anchor`/`act`; renders as a note or, after ≥30-day absence, a collapsed "Since you were last here" disclosure (max 3). Fail-closed on PostHog flag `teaching-notes`. | Reuses margin-note's 860px rule when a note is present. | `lib/teaching/{select,types,constants}.ts`; `teaching-anchor-note.tsx:55`; `teaching-act-note.tsx:25` |

## 2. Per-stage action inventory

Guide copy source throughout: `lib/document/document-guide.ts` (stage default + rest-state copy), `lib/document/desk-derivation.ts` (stage/need derivation, `NEED_ACTION_LABELS`), `lib/document/workflow-gate.ts` (handoff gates, outrank everything when open).

### Brief

| Action | Where | Status | Notes |
|---|---|---|---|
| "Accept and begin" | lens band default, `document-guide.ts:155` | suggested | Anchors to the brief section generically. |
| "Respond to the inquiry" | `needVerb('new_lead')`, `document-guide.ts:614` | suggested | No `focusId`; lands generically. |
| "Accept · begin" | `TriageBar`, `triage-bar.tsx:220-229` | available-visible | The real control; routes via `arrival-arc` flag to ceremony or `/doc/{id}`. |
| "Nurture" / "Pass" | `triage-bar.tsx:230-248` | available-visible | Reconnect presets / `useDeclineLead`; named by neither guide nor Desk. |
| "Send — and begin the Document" / "Put down for now" | `ceremony-surface.tsx:456-473` | available-hidden | Only via Accept·begin + `arrival-arc` + `arrivalEligible`. |
| "Continue the introduction" | `needVerb('ceremony_pending')`, `document-guide.ts:615` | suggested | Matches Desk's label exactly here. |
| (no footer act) | `desk-derivation.ts:169` `NEED_ACTION_LABELS.new_lead = null` | absent (by design) | Comment: TriageBar carries the choice instead. |
| "Nothing to decide yet." | `restCopy.brief`, `document-guide.ts:224` | absent (quiet rest) | Default once no need fires. |

### Discovery

| Action | Where | Status | Notes |
|---|---|---|---|
| "Add {dynamic label}" | `document-guide.ts:521-536`; labels from `document-guide-inputs.ts:22-28` | suggested | e.g. "Project type and named rooms" — vocabulary differs from the page itself. |
| "Add scope & rooms" (fallback) | `document-guide.ts:162` | suggested | Used while readiness is loading. |
| "Run the discovery call" / "Attach the room scan" / "Add inspiration" | `discovery-section.tsx:424-458` | available-visible | |
| "View the scan" | `discovery-section.tsx:441-451` | available-visible (conditional) | Only if `room_scan_id` set; jumps to Room View. |
| "Move back to New Lead" | `discovery-section.tsx:468-510` | gated | `aria-disabled` when `returnCheck.allowed===false`; exact server refusal sentence unverified (SQL RPC not read). |
| 5 essentials (Scope & rooms / Budget comfort / Timeline / Style & inspiration / How they live) | `discovery-section.tsx:331-364` | available-visible | |
| "Begin the direction" / "Open the direction" | `restCopy.discovery`, `document-guide.ts:225,960-961` | suggested | Fires once all 5 essentials done; no equivalent button inside `DiscoverySection` itself. |

### Direction

| Action | Where | Status | Notes |
|---|---|---|---|
| "Open the Contract Room" (lens band default) | `document-guide.ts:169` | suggested | Overridden to the proposal href once `proposal_id` exists. |
| "Send the agreement" (rest) | `document-guide.ts:226` | suggested | Destination is the same Contract Room href, not an actual send. |
| "Continue drafting" | `proposal-instruments.tsx:387-397` | available-visible | Same destination, a third distinct label; inline copy nearby reads a fourth ("open the Contract Room", `:373`). |
| "Open the Contract Room" (⌘K, continue) | `command-bar.tsx:875-885` | available-hidden | Only when `draftingProposalId` exists. |
| "Open the Contract Room" (Desk index, create) | `desk-contents.tsx:403-412` | available-hidden | Same label, different operation — creates a new draft. |
| (no control) | `page.tsx:2696-2745`, gated on `proposal_id` | absent | Spread body renders `null` if no `proposal_id` yet; reachability of that state is unverified. |
| Gate eyebrow (11-stage vocabulary) | `workflow-gate.ts:64-87` ← `residential-workflow.ts:128-161` | n/a | Swaps the document's 3-word stage name when a gate is open; likely unreachable pre-project (gates need `project_id`). |

### Proposal

| Action | Where | Status | Notes |
|---|---|---|---|
| "Open Contract Room" (draft) | `document-guide.ts:722` | suggested | Missing "the" vs. Direction's identical doorway. |
| "Continue drafting" | `proposal-instruments.tsx:397` | available-visible | Same draft state, different label than the guide's. |
| "Countersign the design agreement" / "Open the project" / "Review signing controls" | `document-guide.ts:731,742,751` | suggested | Per-state (`client_signed`/`executed`/`accepted`). |
| "Open the project" (real control) | `proposal-watch.tsx:452-472` | available-visible | For `accepted`; diverges from guide's "Review signing controls". |
| "Review follow-up controls" | `document-guide.ts:760` | suggested | Generic, covers declined/expired/superseded/revised. |
| "Mark signed" | `proposal-watch.tsx:311-320` | available-visible | Concrete act, including for `expired` — guide never names it. |
| "Nudge {client}" | `document-guide.ts:777-784` / `proposal-instruments.tsx:200-208` | suggested + available-visible | Consistent pairing. |
| "Send to {family}" | `send-sheet.tsx:1059` | gated | `canSend` needs client/email/readiness/fingerprint/snapshot; no single surfaced reason. |
| "Record signed" | `mark-signed-sheet.tsx:138` | available-hidden | Behind the Mark-signed sheet. |
| Gate acts (Nudge/Approve/Redo/Close/Publish) | `workflow-gate.ts:177-192,314-330` via `document-guide.ts:569-593` | suggested, outranks all | |

### Project

| Action | Where | Status | Notes |
|---|---|---|---|
| "Open the FF&E schedule" | `document-guide.ts:187,876-888` | suggested | |
| "Release the next room" (rest) | `document-guide.ts:228` | suggested | No on-page control literally named this. |
| "Release for authorization" | `ffe-section.tsx:1408-1419,1764-1775` | gated | Reason shown: "No lines are currently eligible for release." |
| "Send for signature" | `review-release-sheet.tsx:625-640` | gated | Exact reason via `title`: "Waiting on {client} to acknowledge the checkpoint…" |
| "Add a line" / "Build the FF&E schedule"→"Open the spec book" | `ffe-section.tsx:1403-1406,1838-1843` | available-visible | Second is empty-state only. |
| "Open the plan room" | `plan-room-band.tsx:77-89` | available-visible | |
| "Plan room" / "Spec book" / "Boards" (rooms) | `registry.tsx:386-424,475-478`; `mobile-bar.tsx` | available-hidden | ⌘K / drawer / mobile menu only. |
| "Mark {N} installed" / "Put back" | `ffe-section.tsx:1859-1870,852-873` | available-visible / gated | Shared with Install. |
| Needs-attention verbs | `document-guide.ts:604-635` vs. `desk-derivation.ts:160-189` | suggested | 6 kinds worded differently guide-vs-Desk (discrepancy below). |

### Install

| Action | Where | Status | Notes |
|---|---|---|---|
| "Check what's arriving" | `document-guide.ts:194,880-890` | suggested | |
| Dated headline ("Install is N days out…") | `document-guide.ts:337-353` | suggested | |
| "Install day is {date}." template | `document-guide.ts:229` | absent/dead | By the file's own comment this literal string never actually renders. |
| "Hold the window" (rest actionLabel) | `document-guide.ts:229,931-986` | suggested | Destination is the FF&E movement anchor, not the real hold-window control. |
| "Hold/Confirm/Release the window" (real ceremony) | `install-window-ceremony.tsx:580,591,602` | available-visible / gated | Lives in `schedule-spine.tsx:1074`, a different region. |
| "Open the schedule" | `desk-derivation.ts:1504-1519` | suggested | Label matches Desk exactly here. |
| "Mark {N} installed" / "Put back" | `ffe-section.tsx:1859-1870,852-873` | available-visible / gated | |
| "Closing the book" (Care band unfolds early) | `care-band.tsx:145-147,253-259` | available-visible | Care's close act reachable from Install near project end. |

### Care

| Action | Where | Status | Notes |
|---|---|---|---|
| "Run the closeout checklist" / "Close the book" (rest) | `document-guide.ts:201,230,891-893` | suggested | |
| "Close the book" (real control) | `care-band.tsx:413-422` | gated | Disabled until ready; label matches the guide exactly. |
| Blocker reasons (balance/items/milestones) | `closure-derivation.ts:174-282`; `care-band.tsx:477-491` | gated reasons | Only place the real reasons are named; guide gives none. |
| Final-payment row | `care-band.tsx:513-553` | gated (always) | `aria-disabled` unconditionally, billing-verified only. |
| Owner-only lock | `care-band.tsx:322-346` | gated (whole band) | Non-owner sees text only, no button — guide is not ownership-aware. |
| "Not yet — fold it away" | `care-band.tsx:629-640` | available-visible | Not in the guide's vocabulary. |
| "The book is closed." | `care-band.tsx:302-365` | absent (terminal) | |

### Contradictions — two devices naming different next steps for the same state

1. Brief: guide's "Accept and begin" (`document-guide.ts:155`) vs. the real control's "Accept · begin" (`triage-bar.tsx:228`).
2. Brief new-lead: guide says "Respond to the inquiry" (`document-guide.ts:614`); Desk folio deliberately prints none (`desk-derivation.ts:169`); TriageBar itself offers three different verbs (`triage-bar.tsx:220-248`).
3. Discovery: guide's dynamic labels (`document-guide-inputs.ts:22-28`, e.g. "Project type and named rooms") differ from the page's own facet names (`discovery-section.tsx:331-364`, e.g. "Scope & rooms").
4. Direction: four labels for the same draft-continuation act, visible on one screen at once — "Open the Contract Room" (`document-guide.ts:169`), "Send the agreement" (`document-guide.ts:226`), "Continue drafting" (`proposal-instruments.tsx:397`), inline "open the Contract Room" (`proposal-instruments.tsx:373`).
5. Direction: "Open the Contract Room" means a different operation per device — continues a draft from ⌘K (`command-bar.tsx:879`) vs. creates a new one from the Desk index (`desk-contents.tsx:407`).
6. Proposal draft: guide's "Open Contract Room" (`document-guide.ts:722`) vs. the real control's "Continue drafting" (`proposal-instruments.tsx:386-398`) — same destination.
7. Proposal accepted: guide's generic "Review signing controls" (`document-guide.ts:751`) vs. the real control's "Open the project" (`proposal-watch.tsx:452-472`).
8. Proposal expired: guide says "follow up" (`document-guide.ts:760`) but the surface still offers a concrete "Mark signed" (`proposal-watch.tsx:311-320`).
9. The largest, code-acknowledged mismatch: `document-guide.ts:596-602` states outright that its own `needVerb` labels diverge from `desk-derivation.ts`'s `NEED_ACTION_LABELS` on 6 needs kinds recurring across Project/Install/Care — e.g. `overdue_decision`: "Chase the approval" vs. "Review decisions"; `damage_claim`: "File the claim" vs. "Review the claim" (full six at `document-guide.ts:604-635` vs. `desk-derivation.ts:160-189`).
10. Project rest state: "Release the next room" (`document-guide.ts:228`) names no real control; the actual one reads "Release for authorization" (`ffe-section.tsx:1409-1410`).
11. Install rest state: "Hold the window" (`document-guide.ts:229`) points at the FF&E movement anchor, not the real "Hold the window" ceremony, which lives in a different region (`install-window-ceremony.tsx:580` / `schedule-spine.tsx:1074`).
12. Care: the guide is not ownership-aware and will still direct a non-owner toward "Close the book," while `care-band.tsx:322-346` refuses to render any control for a non-owner at all.
13. Any gated stage: an open workflow gate swaps the document's own 3-word stage names for an 11-stage canonical vocabulary (`workflow-gate.ts:64-87`) — live for Proposal/Project/Install/Care, likely unreachable for Brief/Discovery/Direction.

## 3. Cross-room jumps

| Destination | Outbound | Return |
|---|---|---|
| Contract Room | `draft-proposal-opener.tsx:140` | Generic `RoomShell` leave link (origin-stash, default `/desk`), `room-shell.tsx:124-148`. |
| People | `studio-drawer.tsx:306-324` door | Same `RoomShell` leave. |
| Library | Drawer door; `/library/[id]` via shelf tap | `RoomShell`; `/library/judgments` hardcodes its return to `/library` (`library/judgments/page.tsx:110-114`). |
| Rooms (`/rooms`, `/room/[id]`) | Drawer door; `discovery-section.tsx:446` `?from=document` deep link | `/rooms`: `RoomShell`. `/room/[id]` via `?from=document`: phase-qualified "the Document · {Phase}" link (`room/[id]/page.tsx:150-176`); falls back to origin-stash otherwise. |
| Room File (`/room/[id]/file`) | From a Room | **No `RoomShell`** — mounts bare, carries its own back-to-room line (`room/[id]/file/page.tsx:17-19`). |
| Orders / Accounts | Drawer "books" menu / ⌘K → sheet overlay (`studio-drawer.tsx:225-274,546-581`) | Not a room jump — sheet closes in place, pathname never changes (`studio-drawer.tsx:171-172`). |
| Buying | — | Not a destination: no route or registry entry exists. "Buying" names order-line *readings* rendered inside the Orders ledger's line-unfold cells. |
| Boards | Two distinct surfaces: per-document `/doc/[id]/boards` and global `/boards` | Per-doc: "← Back to the document" (`project-boards-view.tsx:157-186`). Global: "← Desk" (`studio-boards-view.tsx:142-147`) — not back to a document. `/board/[boardId]` editor closes via a return-target priority chain (`navigation.ts:91-121`); never a dead end. |
| Plan room | `registry.tsx:386-401`, document-scoped ⌘K | "← Back to the document" / "← {projectName}" (`plan-room-workspace.tsx:105-172`). |
| Spec book | `registry.tsx:403-424` | "← {projectName}" (`spec-book-workspace.tsx:1095-1100`). |

No true dead end was found. Room File is the one surface relying on its own bespoke return line instead of the shared `RoomShell` mechanic.

## 4. Help-in-context reality

`document-surface-keys.ts` (85 lines) holds no content at all — 42 string-literal routing keys (`:14-81`), each a pointer into Sanity via the shared `ContextualHelpPanel`. There is no real-vs-placeholder split to count inside this file, because none of the 42 entries is itself copy. ⌘K's "Help…" row (`command-bar.tsx:628-630`) calls `openHelp()` (`open-help.ts:34-43`), which `document-help.tsx:85-157` picks up and hands to `@patina/help-system`'s `ContextualHelpPanel` — the actual key-to-content lookup happens one package hop outside the files a reader would expect.

The walkthrough teaches 6 steps per persona — Desk, "One client, one document," Rooms & ledgers, the drawer, "Find anything," "Begin with a lead" (`desk-walkthrough.tsx:131-229`) — as explicitly Sanity-overridable fallback copy (`:122-129`); this is what renders when Sanity content is unpublished.

Workshop Notes confirm a hide-on-empty behavior, not an empty shell: both `teaching-anchor-note.tsx:55` and `teaching-act-note.tsx:25` `return null` when no note is selected, and `use-teaching-note.ts:656-698,488-539` only populate a note when Sanity content actually resolves. With no published Sanity notes, every teaching surface renders nothing.

## 5. Flags

`use-feature-flag.ts`/`use-feature-flags.ts` fail closed twice: initial state defaults `value: false` (`:119-120`), and the terminal "PostHog unreachable" branch leaves every flag `false` (`:158-164`; `use-feature-flags.ts:101`). 21 call sites were found under `components/document` and `app/(document)`, including `teaching-notes`, `tester-notes`, `arrival-arc`, `agreement-parts`/`library`, `studio-invoice`, `field-line-trades`, `client-invite-letter`, `design-build`, `room-file`, `studio-workspaces`, and `worktable` (`doc/[id]/page.tsx:931`).

`worktable` is explicitly commented fail-closed at `doc/[id]/page.tsx:927-930` ("with the flag off this page prints exactly the composition it has always printed"), confirming the **non-Worktable path is the default**. Whether `worktable` was ever created in PostHog is unverified from code alone, but `docs/design/field-companion/research/03-portal-project-flow.md:440` ("the flag has never been seen by a human") and `DECISIONS.md`'s R124 (naming a still-owed flag-on walk) corroborate the substance of that claim.
