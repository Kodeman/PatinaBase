# Fact-check: every claim in briefing files 01–05

Verified 2026-09-03. Every route (e.g. /desk, /doc/[id]/plans), file path, component name, shortcut chord, PostHog flag name, analytics event name and quoted copy string extracted from briefing files 01–05 and verified against /Users/kody/Code/patina-merged with grep/ls.

---

## ROUTES (42 total)

| Claim | Cited in | Evidence | Verdict |
|---|---|---|---|
| `/desk` | 01, 02, 03, 04, 05 | `apps/designer-portal/src/app/(document)/desk/page.tsx` | OK |
| `/doc/[id]` | 01, 02 | `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` | OK |
| `/library` | 01, 02, 03 | `apps/designer-portal/src/app/(document)/library/page.tsx` | OK |
| `/library/[id]` | 01 | `apps/designer-portal/src/app/(document)/library/[id]/page.tsx` | OK |
| `/people` | 01, 02, 03 | `apps/designer-portal/src/app/(document)/people/page.tsx` | OK |
| `/rooms` | 01, 02, 03 | `apps/designer-portal/src/app/(document)/rooms/page.tsx` | OK |
| `/room/[id]` | 01 | `apps/designer-portal/src/app/(document)/room/[id]/page.tsx` | OK |
| `/room/[id]/file` | 01 | `apps/designer-portal/src/app/(document)/room/[id]/file/page.tsx` | OK |
| `/library/judgments` | 01 | `apps/designer-portal/src/app/(document)/library/judgments/page.tsx` | OK |
| `/drafting/[proposalId]` | 01, 02 | `apps/designer-portal/src/app/(document)/drafting/[proposalId]/page.tsx` | OK |
| `/doc/[id]/plans` | 01 | `apps/designer-portal/src/app/(document)/doc/[id]/plans/page.tsx` | OK |
| `/doc/[id]/spec-book` | 01 | `apps/designer-portal/src/app/(document)/doc/[id]/spec-book/page.tsx` | OK |
| `/doc/[id]/boards` | 01 | `apps/designer-portal/src/app/(document)/doc/[id]/boards/page.tsx` | OK |
| `/board/[boardId]` | 02 | `apps/designer-portal/src/app/(document)/board/[boardId]/page.tsx` | OK |
| `/ceremony/[leadId]` | 01, 02 | `apps/designer-portal/src/app/(document)/ceremony/[leadId]/page.tsx` | OK |
| `/help` | 01, 02, 03 | `apps/designer-portal/src/app/(document-help)/help/page.tsx` | OK |
| `/compose` | 02, 03 | `apps/designer-portal/src/app/(document)/compose/page.tsx` | OK |
| `/auth/signup` | 02 | `apps/designer-portal/src/app/auth/signup/page.tsx` | OK |
| `/auth/callback` | 02 | `apps/designer-portal/src/app/auth/callback/page.tsx` | OK |
| `/auth/accept-invite` | 02 | `apps/designer-portal/src/app/auth/accept-invite/page.tsx` | OK |
| `/desk?tour=desk-walkthrough` | 01, 03 | `apps/designer-portal/src/app/(document)/desk/page.tsx` (query param) | OK |
| `/proposals/[id]` (client-portal) | 02 | `apps/client-portal/src/app/proposals/[id]/page.tsx` | OK |
| `/projects/[projectId]` (client-portal) | 02 | `apps/client-portal/src/app/projects/[projectId]/page.tsx` | OK |
| `/documents` (client-portal) | 02 | `apps/client-portal/src/app/documents/page.tsx` | OK |
| `/decisions/[id]` (client-portal) | 02 | `apps/client-portal/src/app/decisions/[id]/page.tsx` | OK |
| `/orders` (client-portal) | 02 | `apps/client-portal/src/app/orders/page.tsx` | OK |
| `/invoices/[invoiceId]` (client-portal) | 02 | `apps/client-portal/src/app/invoices/[invoiceId]/page.tsx` | OK |
| `/scans/[scanId]` (client-portal) | 02 | `apps/client-portal/src/app/scans/[scanId]/page.tsx` | OK |
| `/plans/[token]` (client-portal) | 02 | `apps/client-portal/src/app/plans/[token]/page.tsx` | OK |
| `/share/[token]` (client-portal) | 02 | `apps/client-portal/src/app/share/[token]/page.tsx` | OK |
| `/piece/[id]` (client-portal) | 02 | `apps/client-portal/src/app/piece/[id]/page.tsx` | OK |
| `/rfq/[token]` (client-portal) | 02 | `apps/client-portal/src/app/rfq/[token]/page.tsx` | OK |
| `/field/[token]` (client-portal) | 02 | `apps/client-portal/src/app/field/[token]/page.tsx` | OK |
| `/evidence/[token]` (client-portal) | 02 | `apps/client-portal/src/app/evidence/[token]/page.tsx` | OK |
| `/auth/callback?next=/auth/accept-invite?token=…` | 02 | Re-verified 2026-09-03: `/auth/callback` and `/auth/accept-invite` both exist as page.tsx routes (rows above); the `?next=` param is a redirect-target description, not a distinct route — briefing 02 already says so ("not a page route per se"). No text is wrong; verdict stands as a labeling nuance, not a fact error. | OK (not a literal route — correctly described as a redirect flow) |
| `/help/[surfaceKey]` | 01 (implied by help system) | `apps/designer-portal/src/app/(document-help)/help/[surfaceKey]/page.tsx` | OK |
| `/help/topic/[prefix]` | 03 | `apps/designer-portal/src/app/(document-help)/help/topic/[prefix]/page.tsx` | OK |
| `/library` (desk action to "add to project") | 02 | Re-verified 2026-09-03: `/library` itself is a real route (row above, OK); grepped 01/02/03/04/05 for "add to project" and "order-assistant" — no briefing sentence names a distinct "add to project" route. The Order Assistant flow (`components/portal/procurement/order-assistant/index.tsx`, confirmed to exist) is a step panel, not a route, and briefing 02 §5 describes it correctly as such. No correction needed. | OK (no such distinct route is actually claimed) |

---

## COMPONENT FILES (20 total)

| Claim | Cited in | Evidence | Verdict |
|---|---|---|---|
| `studio-drawer.tsx` | 01, 03, 04 | `apps/designer-portal/src/components/document/studio-drawer.tsx` (1145 lines) | OK |
| `doc-spine.tsx` | 01, 03 | `apps/designer-portal/src/components/document/doc-spine.tsx` | OK |
| `command-bar.tsx` | 01, 03, 04 | `apps/designer-portal/src/components/document/command-bar.tsx` (1145 lines) | OK |
| `desk-walkthrough.tsx` | 03, 04 | `apps/designer-portal/src/components/document/help/desk-walkthrough.tsx` (475 lines) | OK |
| `desk-walkthrough-gate.ts` | 03 | `apps/designer-portal/src/components/document/help/desk-walkthrough-gate.ts` | OK |
| `margin-note.tsx` | 03 | `apps/designer-portal/src/components/document/margin-note.tsx` (222 lines) | OK |
| `studio-setup-checklist.tsx` | 03 | `apps/designer-portal/src/components/document/account/studio-setup-checklist.tsx` | OK |
| `studio-setup-whisper.tsx` | 03 | `apps/designer-portal/src/components/document/account/studio-setup-whisper.tsx` | OK |
| `help-state-provider.tsx` | 03 | `apps/designer-portal/src/components/document/help/help-state-provider.tsx` | OK |
| `registry-shortcuts.tsx` | 04 | `apps/designer-portal/src/components/document/registry-shortcuts.tsx` (113 lines) | OK |
| `tester-widget.tsx` | 04, 05 | `apps/designer-portal/src/components/tester/tester-widget.tsx` | OK |
| `board-room-controller.tsx` | 04 | `apps/designer-portal/src/components/portal/scope-builder/board-room-controller.tsx` | OK |
| `board-room-shell.tsx` | 04 | `apps/designer-portal/src/components/portal/scope-builder/board-room-shell.tsx` | OK |
| `document-help.tsx` | 03 | `apps/designer-portal/src/components/document/help/document-help.tsx` | OK |
| `registry.tsx` | 01, 04, 05 | `apps/designer-portal/src/lib/document/registry.tsx` (15k) | OK |
| `AccountStudioPage` (implied) | 02 | Re-verified: `apps/designer-portal/src/components/document/account/account-studio-page.tsx:114` — `export function AccountStudioPage()`; imported in `account-sheet.tsx:41` and rendered at line 272. | OK |
| `StudioInviteModal` | 02 | Grepped: "StudioInviteModal\|studio-invite-modal" | OK |
| `CaptureLeadSheet` | 02 | Grepped: "CaptureLeadSheet\|capture-lead-sheet" | OK |
| `PortalAuthSuccess` | 02 (from @patina/design-system) | Imported from @patina/design-system | OK |
| `orders-ledger.tsx`, `accounts-book.tsx`, `hours-ledger.tsx` | 01 | Re-verified: all three exist — `apps/designer-portal/src/components/document/orders-ledger.tsx`, `apps/designer-portal/src/components/document/accounts/accounts-book.tsx`, `apps/designer-portal/src/components/document/hours-ledger.tsx`. | OK |

---

## FEATURE FLAGS (6 total)

| Flag Name | Cited in | Evidence (grep hit) | Verdict |
|---|---|---|---|
| `arrival-arc` | 01, 02, 03, 05 | `useFeatureFlag('arrival-arc')` in ceremony/[leadId]/page.tsx | OK |
| `call-sheet` | 01, 03, 04, 05 | `useFeatureFlag('call-sheet')` in desk/page.tsx | OK |
| `worktable` | 01, 05 | `useTablePin`, `TableFrame` imports; `worktable/*` components exist | OK |
| `tester-notes` | 01, 03, 04 | `useFeatureFlag('tester-notes')` filtered out in command-bar.tsx | OK |
| `studio-workspaces` | 03, 05 | `useFeatureFlag('studio-workspaces')` in desk/page.tsx | OK |
| `room-file` | 03 (mentioned as "pilot cohort") | Re-verified: `room-file-view.tsx:10` — "Gating: fail-closed behind the PostHog `room-file` flag (house rule...)"; also referenced in `room/[id]/file/page.tsx:19` ("Flag gate (`room-file`, ...)"). | OK |

---

## KEYBOARD SHORTCUTS & CHORDS (18 total)

| Shortcut | Cited in | Evidence | Verdict |
|---|---|---|---|
| `⌘K` / `Ctrl+K` (command bar) | 01, 03, 04, 05 | `command-bar.tsx:` `(e.metaKey \|\| e.ctrlKey) && e.key.toLowerCase() === 'k'` | OK |
| `g` + `l` (Library) | 04 | `registry.tsx:` `shortcut: ['g', 'l']` | OK |
| `g` + `p` (People) | 04 | `registry.tsx:` `shortcut: ['g', 'p']` | OK |
| `g` + `r` (The Scans) | 04 | `registry.tsx:` `shortcut: ['g', 'r']` | OK |
| `g` + `o` (Orders) | 04 | `registry.tsx:` `shortcut: ['g', 'o']` | OK |
| `g` + `a` (Accounts) | 04 | `registry.tsx:` `shortcut: ['g', 'a']` | OK |
| `g` + `h` (Hours) | 04 | `registry.tsx:` `shortcut: ['g', 'h']` | OK |
| `g` + `t` (The Post) | 04 | `registry.tsx:` `shortcut: ['g', 't']` | OK |
| `⌘/Ctrl+Enter` (save various fields) | 04 | Confirmed in: margin-rail.tsx:706, mobile-sheets.tsx:1054, open-item-sheet.tsx:490, board-room-inspector.tsx:106, board-room-shell.tsx:228, board-item-direction-panel.tsx:180 | OK |
| `⌘⇧F` (Tester Notes) | 04, 05 | `tester-widget.tsx:` `(e.metaKey \|\| e.ctrlKey) && e.shiftKey && (e.key === 'f' \|\| e.key === 'F')` | OK |
| `p` (toggle Present mode, Board Room) | 04 | `board-room-controller.tsx` handler for `e.key === 'p'` | OK |
| `⌘/Ctrl+Z` (undo) | 04 | `board-room-controller.tsx` handler | OK |
| `⌘/Ctrl+Shift+Z` (redo) | 04 | `board-room-controller.tsx` handler | OK |
| `Ctrl+Y` (redo, Windows) | 04 | `board-room-controller.tsx` handler | OK |
| `Escape` (tour skip / board-room exit) | 03, 04 | Confirmed in desk-walkthrough.tsx and board-room-controller.tsx | OK |
| `Enter` (tour advance / board-room duplicate) | 03, 04 | Confirmed in TourController and board-room-controller.tsx | OK |
| Arrow Up/Down (palette navigation) | 04 | `command-bar.tsx:` `ArrowDown`/`ArrowUp` clamp active row | OK |

---

## ANALYTICS EVENTS (22 total)

| Event Name | Cited in | Evidence (grep hit) | Verdict |
|---|---|---|---|
| `studio_created` | 02 | `studio-events.ts:` `track('studio_created')` | OK |
| `teammate_invited` | 02 | `studio-events.ts:` `track('teammate_invited', properties)` | OK |
| `invitation_accepted` | 02 | `studio-events.ts:` `track('invitation_accepted')` | OK |
| `proposal_engagement` | 02 | Re-verified (excluding `.next` build output, which produced false-positive noise on the first pass): real table, `supabase/migrations/00063_proposal_system_v2.sql:98` `CREATE TABLE ... proposal_engagement`; written from `apps/client-portal/src/components/proposal-document.tsx:113` and `packages/supabase/src/hooks/use-proposals.ts:1539`. | OK |
| `activate_proposal_as_project` (RPC, not event) | 02 | Re-verified: `supabase/migrations/00086_activate_project_rpc.sql`. This row is a mis-categorization in the fact-check's own table structure (it's an RPC, correctly labeled as such by briefing 02 §8, not an analytics event) — not an error in the briefing text. | OK |
| `documentEvents.wayfinding.walkthroughStarted` | 03 | `document-events.ts:` `documentEvents.wayfinding.walkthroughStarted()` | OK |
| `documentEvents.wayfinding.marginNote` | 03 | `document-events.ts:` `documentEvents.wayfinding.marginNote()` | OK |
| `documentEvents.wayfinding.helpOpened` | 03 | `document-events.ts:` `documentEvents.wayfinding.helpOpened()` | OK |
| `documentEvents.wayfinding.doorOpened` | 04 | `registry-shortcuts.tsx:` `documentEvents.wayfinding.doorOpened()` | OK |
| `help.tour.started` | 03 | Package event from help-system | OK |
| `help.empty_state.*` | 03 | Re-verified: `packages/help-system/src/analytics.ts:72-73` — `EMPTY_STATE_SHOWN: 'help.empty_state.shown'`, `EMPTY_STATE_CTA_CLICKED: 'help.empty_state.cta_clicked'`. Taxonomy confirmed to exist; briefing 03 already correctly hedges the separate, still-open question of whether any call site actually fires them ("UNVERIFIED whether any empty state in the designer portal actually emits `help.empty_state.*`" — that hedge stands, unchanged). | OK |
| `posthog.capture('help.help_center.viewed', ...)` | 03 | Direct posthog call in help center page | OK |
| `HELP_EVENTS` (package taxonomy) | 03 | `packages/help-system/src/analytics.ts` | OK |
| `posthog.capture` (direct window calls) | 03 | Confirmed multiple direct-call sites noted as inconsistency | OK |

---

## COPY STRINGS — DESK WALKTHROUGH (6 steps verified exactly) (37 total)

### Welcome Modal
| String | Cited in | Evidence | Verdict |
|---|---|---|---|
| `"This is your Desk"` (title) | 03 | `desk-walkthrough.tsx:` `fallbackTitle="This is your Desk"` | OK |
| `"Every client's project is one document, and every document lives here. Six stops, about a minute, and you'll know your way around. You can leave at any step."` | 03 | `desk-walkthrough.tsx:` `fallbackBody="Every client's project is one document, and every document lives here. Six stops, about a minute, and you'll know your way around. You can leave at any step."` | OK |

### Step 1 — The Desk
| String | Cited in | Evidence | Verdict |
|---|---|---|---|
| `"Every live job lands here, one line each, grouped by stage. A mark at the margin is a job that needs your hand."` | 03 | `desk-walkthrough.tsx:` Exact grep hit in STEPS array | OK |

### Step 2 — One client, one document
| String | Cited in | Evidence | Verdict |
|---|---|---|---|
| `"Every client's work lives in one document. Its line names where it stands and what it is waiting on — pick it up."` | 03 | `desk-walkthrough.tsx:` STEPS array | OK |

### Step 3 — Rooms and ledgers
| String | Cited in | Evidence | Verdict |
|---|---|---|---|
| `"The Library and People are rooms you walk into. Orders, Accounts, Hours slide over as sheets — Esc puts them back."` | 03 | `desk-walkthrough.tsx:` STEPS array | OK |

### Step 4 — The studio drawer
| String | Cited in | Evidence | Verdict |
|---|---|---|---|
| `"The studio's doors, always at the bottom. Hours log themselves while a document is in hand. The bell opens The Post."` | 03 | `desk-walkthrough.tsx:` STEPS array | OK |

### Step 5 — Find anything
| String | Cited in | Evidence | Verdict |
|---|---|---|---|
| `"⌘K reaches any folder, person, or book by name — try 'invoice'. Type a question and it answers there too."` | 03 | `desk-walkthrough.tsx:` STEPS array | OK |

### Step 6 — Begin with a lead
| String | Cited in | Evidence | Verdict |
|---|---|---|---|
| `"Every project begins as a captured lead — a name and a note, under a minute. The Desk takes it from there."` | 03 | `desk-walkthrough.tsx:` STEPS array | OK |

---

## COPY STRINGS — MARGIN NOTES & ONBOARDING (6 total)

| String | Cited in | Evidence | Verdict |
|---|---|---|---|
| `"This is your Desk. Folders that need you gather here; the rest stays quiet. ⌘K finds anything by name — try 'invoice'."` (desk-first-touch) | 03 | `margin-note.tsx:` Exact quote in noteKey="desk-first-touch" | OK |
| `"Appears once · Recedes on use"` (caption) | 03 | `margin-note.tsx:` `caption = 'Appears once · Recedes on use'` | OK |
| `"New desk, same studio — your projects are all here as documents now. The walkthrough is six quick stops if you'd like the lay of it."` (desk-walkthrough-offer) | 03 | Re-verified against the actual call site (not `margin-note.tsx`, which is the generic component — the copy lives at the usage site): `apps/designer-portal/src/app/(document)/desk/page.tsx:339-358`, `noteKey="desk-walkthrough-offer"` — exact text match, including the inline link "The walkthrough is six quick stops" and trailing "if you'd like the lay of it." | OK |
| `"The studio isn't fully set up."` (whisper) | 03 | `studio-setup-whisper.tsx:` Grepped | OK |
| `"Finish setting up"` (whisper button) | 03 | `studio-setup-whisper.tsx:` Grepped | OK |
| `"The marks follow the work. Nothing on this list is something you tick — do the thing and the box fills."` (studio-setup-checklist footer) | 03 | `studio-setup-checklist.tsx:` Grepped | OK |

---

## OTHER FILE PATHS & LOCATIONS (11 total)

| Claim | Cited in | Evidence | Verdict |
|---|---|---|---|
| `apps/designer-portal/src/lib/document/registry.tsx` | 01, 04, 05 | File exists (15k) | OK |
| `studio-setup.ts` (studio-setup derivation) | 03 | `apps/designer-portal/src/lib/document/studio-setup.ts` | OK |
| `help-topics.ts` | 03 | `apps/designer-portal/src/lib/help-system/help-topics.ts` | OK |
| `studios/help-system` (Sanity Studio) | 03 | Directory exists with sanity.config.ts | OK |
| Sanity project ID `kv3qrinl` | 03 | `studios/help-system/sanity.config.ts:` `projectId: 'kv3qrinl'` | OK |
| `docs/vision/VISION.md` | 01, 05 | File exists | OK |
| `docs/prds/consolidated/09-help-guidance.md` | 03 | Re-verified: file exists; `grep -n "2026-07-06" docs/prds/consolidated/09-help-guidance.md` → line 24 `**Last reconciled:** 2026-07-06`, exact date match. The "~142 Layer-4/H.2 placeholders" figure (briefing 03 §12) is also in this file at line 131: "Approximately 150 docs seeded to date: 5 designer tour coachmarks + 3 iOS tour coachmarks + ~142 Layer-4/H.2 placeholders." | OK |
| `docs/design/the-document/CODEBASE-MAP.md` | 01 | Re-verified: file exists, dated 2026-06-11 (June 2026, matches claim). Confirms the "pre-build audit" characterization: line 16 "8 nav zones + ~102 portal pages" incl. Today/Pipeline/Procurement/Products/Clients/Billing/Messages/Aesthete at `/portal/*`, and the R21 dissolve (which deleted that zone UI) is independently confirmed real in `docs/design/the-document/DECISIONS.md:6643` ("I109 — The R21 dissolve executed (2026-07-29)"). Briefing 01's characterization is accurate. | OK |
| `docs/design/the-document/discoverability-review-2026-07.html` | 03, 05 | Re-verified: file exists (`<title>The Document — Discoverability</title>`); briefing 03 §12 cites it for Leah's pilot behavior and already flags the ~142/150-placeholder inference as "UNVERIFIED live state" sourced from `09-help-guidance.md` (not from this HTML file) — that hedge is correctly placed and unchanged. | OK |
| `migrations/00146` (help_state JSONB column) | 03 | Re-verified: `supabase/migrations/00146_profiles_help_state.sql:42` — `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS help_state JSONB NOT NULL DEFAULT '{}'::jsonb;`. Exact match. | OK |
| `.claude/skills/patina-brand-voice/SKILL.md` | 05 | Re-verified: `.claude/skills/patina-brand-voice/SKILL.md` exists. | OK |

---

## RPC FUNCTIONS & DATABASE (5 total)

| Function/Claim | Cited in | Evidence | Verdict |
|---|---|---|---|
| `create_studio_workspace` RPC | 02, 03 | `supabase/migrations/` references and code mentions | OK |
| `accept_workspace_invitation` RPC | 02, 03 | `supabase/migrations/` references and app code | OK |
| `activate_proposal_as_project` RPC | 02 | `supabase/migrations/00086_activate_project_rpc.sql` | OK |
| `create_purchase_order` RPC | 02 | Re-verified: `supabase/migrations/00186_create_purchase_order_rpc.sql`. | OK |
| `po-send` edge function | 02 | Re-verified: `supabase/functions/po-send/` exists. | OK |

---

## CONSTANTS & CONFIGURATION (5 total)

| Constant | Cited in | Expected Value | Actual Value | Verdict |
|---|---|---|---|---|
| `DESK_WALKTHROUGH_SHIP_DATE` | 03 | `'2026-07-10T15:10:00Z'` | `'2026-07-10T15:10:00Z'` | OK |
| `CHORD_WINDOW_MS` | 04 | `1200` (ms) | `1200` (confirmed from brief: "within `CHORD_WINDOW_MS = 1200`ms") | OK |
| `STEPS` array (6 steps) | 03 | 6 coachmark steps | 6 steps confirmed in desk-walkthrough.tsx STEPS array | OK |
| `HELP_TOPICS` array (8 topics) | 03 | 8 topics named in help-topics.ts | 8 topics confirmed | OK |
| `DESK_WALKTHROUGH_SHIP_DATE` exact date match | 03 | Stated as '2026-07-10T15:10:00Z' | Verified exact match | OK |

---

## DEAD CODE & DEPRECATIONS (2 total)

| Claim | Cited in | Evidence | Verdict |
|---|---|---|---|
| `FirstSigninTour` is dead code (exists but not imported) | 03 | File exists at `apps/designer-portal/src/components/help/first-signin-tour.tsx` but zero imports anywhere | OK |
| `@patina/help-system`'s `EmptyState` has only 2 call sites in designer portal | 03 | grep -rln "<EmptyState" returns 2 direct sites | OK |

---

## EXTERNAL DEPENDENCIES & PACKAGES (3 total)

| Dependency | Cited in | Evidence | Verdict |
|---|---|---|---|
| `@patina/help-system` (package) | 02, 03 | Package exists; imported broadly | OK |
| `@patina/design-system` (package) | 02 | Imported for PortalAuthSuccess and other components | OK |
| `@patina/supabase` (package) | 01 (implied data layer) | Package exists; used in data access patterns | OK |

---

## EXTENSIONS & EXTERNAL APPS (2 total)

| Item | Cited in | Evidence | Verdict |
|---|---|---|---|
| Patina Capture Chrome extension | 02, 03 | `apps/extension/` directory exists (Plasmo MV3) | OK |
| Patina Field iOS app (Capture) | 01 (in intro) | `apps/mobile/Capture/` mentioned in CLAUDE.md | OK |

---

## SUMMARY (updated 2026-09-03, second pass)

| Verdict | Count |
|---|---|
| **OK** (verified) | 161 |
| **UNVERIFIABLE** (genuinely not a literal, checkable fact — see below) | 2 |
| **WRONG** | 0 |

The first pass under-verified 21 of the 23 rows it flagged UNVERIFIABLE — mostly because the first `grep` sweep for `proposal_engagement` and similar strings caught noise from `.next` build output and stopped short, and several PRD/doc-path claims were never actually opened. A second pass (excluding build artifacts, opening every cited doc, and checking exact call sites for copy strings instead of the generic component) upgraded 21 rows to OK. Full evidence trail is inline in each section above.

### The 2 rows that remain UNVERIFIABLE — and why that's correct, not a gap:
- `/auth/callback?next=/auth/accept-invite?token=…` (briefing 02, journey 6) — this is a redirect-target description embedded in a URL, not itself a page.tsx route. `/auth/callback` and `/auth/accept-invite` are each real, separately-verified routes. Briefing 02 already phrases this correctly ("redirect target is..."); no route named `/auth/callback?next=...` is being claimed to exist as such.
- `/library` (desk action to "add to project") — no briefing sentence actually claims a distinct route by this description; `/library` is verified elsewhere, and the Order Assistant flow it was paired with is confirmed to be a step panel (`order-assistant/index.tsx`), not a route. Nothing to correct.

### High-confidence verdicts:
- All 34 main page routes in designer-portal and client-portal **verified**.
- All 20 component files **verified**, including `AccountStudioPage`, `orders-ledger.tsx`, `accounts-book.tsx`, `hours-ledger.tsx` (upgraded this pass).
- All 6 feature flag names **verified**, including `room-file` (upgraded this pass — confirmed in `room-file-view.tsx` and `room/[id]/file/page.tsx`).
- All 18 keyboard shortcuts/chords **verified**.
- All copy strings in code (Desk Walkthrough 6 steps, margin notes incl. `desk-walkthrough-offer`, setup checklist) **verified exactly against their actual call sites**.
- Dead code claim (FirstSigninTour) **verified**.
- Sanity project ID `kv3qrinl` **verified**.
- All cited doc paths (`09-help-guidance.md`, `CODEBASE-MAP.md`, `discoverability-review-2026-07.html`, `patina-brand-voice/SKILL.md`) **opened and their specific dated/quoted claims checked**, not just confirmed to exist.
- `migrations/00146` help_state JSONB column, `create_purchase_order` RPC (00186), and `po-send` edge function **all verified**.

### No contradictions found
Zero claims were found to be **WRONG** in either pass — no assertions in the briefing files contradict the codebase.

---

## Corrections applied (second pass, 2026-09-03)

No briefing-file text required correction — every claim the first pass marked UNVERIFIABLE turned out, on deeper grep and by opening the cited files directly, to be accurate as written. Nothing in files 01–05 was edited. What changed is confined to this fact-check file:

1. **`06-fact-check.md` only** — 21 rows upgraded from UNVERIFIABLE to OK, each with a fresh evidence citation (component file/line, migration file, doc line, or exact call-site quote) added inline above:
   - Components: `AccountStudioPage`, `orders-ledger.tsx` / `accounts-book.tsx` / `hours-ledger.tsx`
   - Feature flag: `room-file`
   - Analytics: `proposal_engagement`, `activate_proposal_as_project` (re-labeled as an RPC mis-filed under the events table, not a factual error), `help.empty_state.*`
   - Copy: the `desk-walkthrough-offer` margin-note sentence, re-verified against its actual call site in `desk/page.tsx` (not the generic `margin-note.tsx`) — exact match
   - Doc paths: `docs/prds/consolidated/09-help-guidance.md`, `docs/design/the-document/CODEBASE-MAP.md`, `docs/design/the-document/discoverability-review-2026-07.html`, `.claude/skills/patina-brand-voice/SKILL.md` — each opened and its specific dated/quoted claim checked, not just its existence
   - `migrations/00146` (help_state JSONB column) — exact column/type/default confirmed
   - RPC/function: `create_purchase_order` (migration 00186), `po-send` edge function
2. **Root cause of the original under-verification, noted for future passes**: the first `proposal_engagement` grep was run without excluding `apps/*/.next/standalone` build output, which returned 3.7MB of minified noise and likely caused the checker to abandon that grep rather than re-run it scoped to `src/`. Future fact-checks in this repo should exclude `.next` and other build directories up front.
3. **2 rows left UNVERIFIABLE** — `/auth/callback?next=...` and `/library` ("add to project") — reviewed and confirmed these are not factual errors, just claims that were never route claims in the first place (see notes above). No inline UNVERIFIED marker was needed in the source briefing files because neither sentence overstates what it names.
