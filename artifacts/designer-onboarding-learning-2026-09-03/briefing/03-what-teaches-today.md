# What teaches the designer portal today — full inventory, verified 2026-09-03

Every path below was opened and read (or grepped for the specific claim) in this session. Anything not directly confirmed is marked UNVERIFIED.

---

## 1. The Desk Walkthrough (R97, live) — welcome modal + 6-step tour

**Files:** `apps/designer-portal/src/components/document/help/desk-walkthrough.tsx` (475 lines), `desk-walkthrough-gate.ts` (pure gate logic, unit-tested).

**Mount:** once in the `(document)` layout; self-guards — renders nothing off `/desk` (`if (pathname !== '/desk') return null;`).

**Trigger logic (quoted from `desk-walkthrough-gate.ts`):**

- Ship-date constant: `export const DESK_WALKTHROUGH_SHIP_DATE = '2026-07-10T15:10:00Z';`
- Auto-modal gate (`shouldAutoOpenDeskWalkthrough`) — TRUE iff: `helpStateReady` is true, the persisted tour record is not `completed`/`abandoned`, `profile.created_at ≥ DESK_WALKTHROUGH_SHIP_DATE`, pathname is `/desk`, the desk-engagements query has resolved, and `window.matchMedia('(min-width: 980px)').matches` (desktop only — mobile gets neither the modal nor a written state).
- Existing-designer offer gate (`shouldOfferDeskWalkthrough`) — same shape but requires `created_at < ship date`; renders a margin-note offer instead of an auto-modal.
- Replay gate (`hasDeskWalkthroughReplayParam`): `params.get('tour') === 'desk-walkthrough'` on `/desk?tour=desk-walkthrough` — entered from the ⌘K "Take the walkthrough" row or the Help Center's pinned row.

**Decline/dismiss semantics:** Any close without a CTA outcome (Esc, backdrop, "Skip") writes `{ abandoned: true, atStep: 0 }` to the cross-device tour record — so it "never re-offers on any device" (comment, line 14).

**Pause:** while the ⌘K palette is open (`document:command-bar-opened`/`closed` events), the tour is `paused` — Enter/Esc don't leak through.

**Fallback content policy:** every step and the modal carry a hard-coded fallback so "a Sanity outage or pre-publish state can NEVER render an invisible, un-advanceable tour" (spec §13.4, quoted in the file doc).

**Exact copy — WelcomeModal (fallback, persona `designer`):**
- Title: *"This is your Desk"*
- Body: *"Every client's project is one document, and every document lives here. Six stops, about a minute, and you'll know your way around. You can leave at any step."*

**Exact copy — the 6 steps** (`STEPS` array, `fallbackHeading`/`fallbackBody`, all quoted verbatim):

| # | Anchor | Heading | Body |
|---|---|---|---|
| 1 | `desk-needs-your-hand` | **The Desk** | "Every live job lands here, one line each, grouped by stage. A mark at the margin is a job that needs your hand." |
| 2 | `desk-folio` | **One client, one document** | "Every client's work lives in one document. Its line names where it stands and what it is waiting on — pick it up." |
| 3 | `desk-contents` | **Rooms and ledgers** | "The Library and People are rooms you walk into. Orders, Accounts, Hours slide over as sheets — Esc puts them back." |
| 4 | `studio-drawer` | **The studio drawer** | "The studio's doors, always at the bottom. Hours log themselves while a document is in hand. The bell opens The Post." |
| 5 | `desk-find-anything` | **Find anything** | "⌘K reaches any folder, person, or book by name — try 'invoice'. Type a question and it answers there too." |
| 6 | `desk-capture-lead` | **Begin with a lead** | "Every project begins as a captured lead — a name and a note, under a minute. The Desk takes it from there." |

Step 6's CTA label ("To work") is CMS-only — the type carries no fallback, so the package default "Done" shows during a CMS outage.

**Replay:** `/desk?tour=desk-walkthrough` — entry points are the ⌘K "Take the walkthrough" row (`command-bar.tsx`) and the Help Center's pinned row (`/help`).

**Suppression coupling:** the `desk-first-touch` margin note is suppressed via React context while the modal/tour is on screen, and is marked permanently seen on tour completion — "the tour taught ⌘K, so the note has nothing left to teach" (comment).

**D4 note:** the package's coachmark popover ships `shadow-lg`; this tour overrides to `shadow-none` via `coachmarkClassName` — the Document's zero-shadow rule (D4) reaches even into a shared-package primitive.

**Analytics:** `documentEvents.wayfinding.walkthroughStarted({ source: 'first_signin' | 'command_bar' | 'margin_note' })` (portal-local, parallel to the package's `help.tour.started`, which carries no source). Package events fire through `TourController` — see §9 below.

**Persistence:** `profiles.help_state.tours['desk-walkthrough']` via `@patina/help-system`'s Supabase-backed `TourStateBackend` (see `help-state-provider.tsx`, §8).

**Known problems:**
- Desktop-only (≥980px) — no mobile onboarding tour exists.
- The auto-open decision reads `getTourState()` synchronously rather than trusting the `tourRecord` React-state mirror, because (per the code comment) the mirror "lags one commit behind `helpStateReady`" — a documented race the team worked around rather than fixed structurally.
- `next build` requires a `Suspense` boundary around the inner component (CSR-bailout otherwise) — a pre-existing, env-triggered Next.js quirk noted inline.

---

## 2. FirstSigninTour — dead code, still in the tree

**File:** `apps/designer-portal/src/components/help/first-signin-tour.tsx` (280 lines). Header comment: *"FirstSigninTour — Sprint 3 / Wave 9 / W1"*, a 5-step "First Project Walkthrough."

**Mount check — grepped exhaustively:** `grep -rn "first-signin-tour|FirstSigninTour" apps/designer-portal/src` returns **exactly one hit**, and it is a comment in `help-state-provider.tsx` describing it as *"the legacy `first-signin-tour.tsx`"*. There is **no import of `FirstSigninTour` anywhere under `apps/designer-portal/src/app`** — the `(portal)/portal/layout.tsx` this component was written for does not exist in the current tree (`find apps/designer-portal/src/app -path "*\(portal\)/portal/layout.tsx"` returns nothing).

**Conclusion: FirstSigninTour is dead code.** It is not mounted. `docs/prds/consolidated/09-help-guidance.md` (dated 2026-07-06, i.e. *before* R97's 2026-07-10 ship) still describes it as live — that PRD is stale on this specific point and should not be trusted for the current onboarding surface.

**Its fallback copy** (for reference, since a persona team may reuse the pattern): Title *"Welcome to Patina"*, body *"Let's get you oriented. We can walk through the essentials in about 60 seconds, or you can dive in and explore."* Its 5 steps target `[data-tour-anchor="today|pipeline|aesthete|products|profile"]` — anchors that belong to the old `(portal)` zone navigation, not the Desk.

---

## 3. The `desk-first-touch` margin note

**Primitive:** `apps/designer-portal/src/components/document/margin-note.tsx` (222 lines). Mounted at `apps/designer-portal/src/app/(document)/desk/page.tsx:320`.

**Contract (quoted from the file doc):** *"A single pencil-idiom note in the page margin: a Playfair-italic line with an en-dash lead, a narrow measure, a tiny × dismiss, and a DM-mono footnote that states the contract in words — 'Appears once · Recedes on use'. It is NOT a tour, NOT a coachmark sequence, and carries no step counter (R94 forbids all of those)."*

**Exact copy (desk/page.tsx, `noteKey="desk-first-touch"`):**
> *"This is your Desk. Folders that need you gather here; the rest stays quiet. ⌘K finds anything by name — try 'invoice'."*
> Caption: *"Appears once · Recedes on use"*

**Recede conditions:** first ⌘K open (`commandBar` prop — listens for the hotkey in capture phase, and `document:open-command-bar`) OR the × dismiss — whichever comes first, permanently, cross-note (not cross-tour).

**A second margin note lives right beside it** — the R97 existing-designer walkthrough offer (`noteKey="desk-walkthrough-offer"`), shown only when `showWalkthroughOffer` is true:
> *"New desk, same studio — your projects are all here as documents now. **The walkthrough is six quick stops** if you'd like the lay of it."*
(The bolded phrase is the inline CTA button that dispatches `START_DESK_WALKTHROUGH_EVENT`.)

**Persistence:** `localStorage['patina:margin-note:<noteKey>']` — device-local, NOT cross-device (unlike the tour state). A note dismissed on desktop can reappear on mobile.

**Analytics:** `documentEvents.wayfinding.marginNote({ key: noteKey, action: 'shown' | 'dismissed' | 'acted' })`.

**Reused pattern, not a MarginNote:** `StudioSetupWhisper` (§4) borrows the *visual* idiom (Playfair-italic, en-dash) but not the once-only localStorage contract — it's a live derivation instead, "so it comes and goes with the checklist itself."

---

## 4. Studio setup checklist + whisper

**Files:** `apps/designer-portal/src/components/document/account/studio-setup-checklist.tsx`, `studio-setup-whisper.tsx`, pure derivation `apps/designer-portal/src/lib/document/studio-setup.ts`. Mounted from `account-studio-page.tsx`; the whisper is rendered inline on `/desk` (desk/page.tsx, gated by `studioWorkspacesEnabled` flag).

**5 steps (exact labels, `STEP_LABELS` in `studio-setup.ts`):**
1. "Name & brand the studio" — always done (a studio row can't exist without a name).
2. "Set your own title" — done iff `myJobTitle` is set.
3. "Invite your crew" — done iff `memberCountBeyondSelf > 0`; row is a button opening the invite sheet.
4. "Seed the rolodex" — done iff `contactsCount > 0 || seedSkipped`; Wave-2 (Call Sheet) row, opens the rolodex review; SKIP affordance is role-gated (owner/admin only via `onSkipSeed`).
5. "Open the first project" — done iff `projectsCount > 0`; button calls `openOpenProject()`.

**Settled state:** once `allDone`, the whole block collapses to one mono line: `"Set up · <Month Year>"`.

**Footer copy (checklist, when not all done):**
> *"The marks follow the work. Nothing on this list is something you tick — do the thing and the box fills."*

**Whisper trigger:** `!isOwner || openCount < 2` → renders nothing. So it needs BOTH: viewer is the studio owner AND ≥2 steps still open.

**Whisper copy:**
> *"The studio isn't fully set up."* → button *"Finish setting up"* (opens the Account sheet's Studio page).

**No dedicated persistence** — this is a pure derivation off live studio state (member count, project count, contact count), not a dismissible localStorage/Supabase record. It reappears every time the condition is true; there is no "seen" bit.

---

## 5. Empty states

**Two distinct mechanisms exist**, and the "17 call sites" figure from the raw inventory does not hold up under a direct grep — documented below as corrected.

**(a) `GuidedEmptyState`** — portal-local primitive, `apps/designer-portal/src/components/document/guided-empty-state.tsx`. Renders a title, description, an "Start with · X · Y · Z" input hint line, and 1–2 `DocumentAction` buttons. **6 confirmed call sites** (`grep -rln "<GuidedEmptyState"`):

| Site | Title | Description |
|---|---|---|
| `project-mood-boards.tsx` | "Start the project's visual direction" | "Use a working mood board to collect references, compose the room, and keep the visual decisions close to the project." |
| `work-block.tsx` | "Plan the {section} work" | "List the concrete work here so the next action and due date stay visible in the document." |
| `ffe-section.tsx` | "Build the FF&E schedule" | "Add the pieces and allowances the studio will specify, price, authorize, procure, and install." |
| `plans/plan-room-set.tsx` | "Start the current drawing set" | "Choose a PDF set; the light table splits it and proposes where each page belongs before anything becomes current." |
| `roster/project-team-roster.tsx` | "Build the project team" | "Add the GC or trades who need project context and will appear on the call sheet." |
| `commercial/authorizations-ledger.tsx` | "No authorizations recorded yet" | "Release furnishings from the FF&E schedule when prices are ready for client approval, or begin a trade scope here." |

**(b) `@patina/help-system`'s `EmptyState` primitive** — only **2 direct call sites** in the designer portal: `room-file-view.tsx` (`<EmptyState />`, no props visible at the call site — likely reads a surface key internally, UNVERIFIED beyond this) and `feedback/feedback-ledger.tsx` (`<EmptyState filtered={isFiltered} onNew={onNew} />`).

**(c) Locally-defined "EmptyState" components** that are NOT the shared primitive — e.g. `components/catalog/empty-state.tsx` has its own copy table (4 states: "No products found", "No matches for these filters", "No products available", "Unable to load products").

**Correction to the raw inventory:** the claimed "~17 portal call sites" citing `lib/document/document-guide.ts` and `closure-derivation.ts` does not resolve directly — `document-guide.ts` exists but describes the **retired** `DocumentGuide` component (per `document-events.ts`'s own comment: *"`guideShown`/`guideSelected` are retired with the strip that fired them: `DocumentGuide` no longer mounts"*). The true count of distinct empty/guided-empty states across the portal is closer to **8 confirmed + an unknown number of ad hoc bespoke ones** (catalog, others) — UNVERIFIED as an exhaustive count; a full census would need a broader grep than this pass ran.

**Analytics:** the package's `HELP_EVENTS.EMPTY_STATE_SHOWN` / `EMPTY_STATE_CTA_CLICKED` exist in the taxonomy but the local `GuidedEmptyState`/catalog components do not appear to fire them (they use plain `DocumentAction` click handlers) — UNVERIFIED whether any empty state in the designer portal actually emits `help.empty_state.*`.

---

## 6. Help Center shelves

**Route:** `apps/designer-portal/src/app/(document-help)/help/page.tsx`. Three sections, always in this order:

1. **Pinned walkthrough row** — links to `/desk?tour=desk-walkthrough`, label "The Desk walkthrough", trailing "about a minute".
2. **Featured** — `RelatedArticles` in exact-keys mode over `FEATURED_SURFACE_KEYS` (5 keys, all under `designer-portal/document/guide/*` or `concept/*`); the whole section (eyebrow included) is CSS-hidden when the article list is empty (`:has()` gate) — "Articles are Sanity drafts until publish, so the list can be empty" (comment). **Given the PRD's ~142/150-placeholder status (§9 below), this section is likely dark in production today** — UNVERIFIED live state, inferable from the content-status ledger.
3. **By topic** — the 8 `HELP_TOPICS` shelves.

**Copy:** intro line — *"Search the articles, browse by topic, or start with one of the featured guides."*

**The 8 topic shelves** (`apps/designer-portal/src/lib/help-system/help-topics.ts`, `HELP_TOPICS` array — label + description quoted verbatim):

| Label | Description |
|---|---|
| Getting started | "Your first hour with the Desk: what it is, and how a project moves from a lead to a signed proposal." |
| The Desk & the Studio | "The one screen you start from, and the index of every room, ledger, and way in." |
| Your documents | "A project is one document, brief through care — sections, stamps, the margin, and the client's copy." |
| Rooms | "The places you walk into: the Library, the People room, the Drafting Room, Composing." |
| Ledgers & money | "The books that slide over your work: Orders, Accounts, Hours, and The Post." |
| Ideas & vocabulary | "The words Patina uses on purpose — stamps, courts, the margin, the Engine — and why." |
| How do I… | "Short answers to the everyday moves: send a proposal, chase an invoice, log a delivery." |
| For your clients | "What your client sees in their portal, and how to help them read and respond." |

**Analytics:** `posthog.capture('help.help_center.viewed', { source: 'page_view' })` — fired directly via `window.posthog`, bypassing the typed `HELP_EVENTS` constant (a direct-call site the PRD flags as a broader pattern).

---

## 7. Contextual help panel (⌘K "Help…")

**File:** `apps/designer-portal/src/components/document/help/document-help.tsx`. The `(document)` shell has no utility bar (unlike `(portal)`), so this is the panel's only home.

**Open path:** ⌘K's "Help…" row (`kind: 'action', key: 'help-panel'`, label "Help…", sub "about this surface") dispatches the `openHelp()` custom event; other doorways (sheet-head, front-matter, court-bar) also fire it with a `source`.

**Intro blurb:** before/instead of Sanity article content, the panel shows a one-line DM-mono eyebrow pulled from the Studio Surface Registry's `help.blurb` field for the ancestor-or-equal surface key (longest match wins) — e.g. for Library: *"Three shelves and a librarian — every ask teaches your eye."* Every registry entry (room/ledger/verb) carries one of these — see the full table in `registry.tsx` excerpted in file 04.

**Footer doorway:** *"Browse all help →"* links to `/help` — the "F5 two-step R89 door" (comment): the panel answers "what's this surface," the footer is the door to everything else.

**Analytics:** `documentEvents.wayfinding.helpOpened({ surface_key, source: 'palette' | 'sheet-head' | 'front-matter' | 'court-bar' })` — fires once per closed→open transition.

**D4 note:** the shared panel ships a heavy drop-shadow by default; the Document neutralizes it with an appended `shadow-none` class (twMerge ordering trick, same idiom used elsewhere).

---

## 8. Persistence layer

**Cross-device (tours, feature announcements):** `profiles.help_state` JSONB column (migration `00146`), shape:
```json
{ "tours": { "<tourId>": { "completed": bool, "abandoned": bool, "atStep": number, ... } },
  "featureAnnouncements": { "<key>": { "dismissedAt": ts } } }
```
Installed via `HelpStateProvider` (`apps/designer-portal/src/components/document/help/help-state-provider.tsx`) on an authenticated mount: installs the Supabase-backed `TourStateBackend`/`FeatureAnnouncementStateBackend`, hydrates, sweeps any localStorage state into Supabase (one-time migration), then exposes `{ helpStateReady }` via context. Default backend absent a signed-in user: localStorage. RLS: inherits `public.profiles`'s existing write-self policy — no new policy for this column.

**Device-local only (margin notes, welcome-shown markers):** `localStorage['patina:margin-note:<noteKey>']`, plus the retired FirstSigninTour's own `localStorage['help-system.welcome-shown.<tourKey>']` key (dead, not read by anything live).

---

## 9. Analytics taxonomy

**Package taxonomy of record** — `packages/help-system/src/analytics.ts`, `HELP_EVENTS` constant object, routed through the single guarded `safeCapture()` (SSR-safe, never throws, no-ops if `window.posthog` is absent). Full event list (grouped by the package's 4-layer architecture — Ambient/Reactive/Proactive/Reference):

- **Ambient:** `empty_state.shown`, `empty_state.cta_clicked`, `field_helper.shown`, `section_intro.shown`, `smart_default.applied`, `smart_default.overridden`
- **Reactive:** `tooltip.shown`, `tooltip.dismissed`, `learnmore.expanded`, `learnmore.collapsed`, `panel.opened`, `panel.closed`
- **Proactive:** `coachmark.shown`, `coachmark.dismissed`, `feature_announcement.shown`, `feature_announcement.dismissed`, `welcome_modal.shown`, `welcome_modal.action`, `tour.started`, `tour.step_advanced`, `tour.step_viewed` (covers step 0), `tour.completed`, `tour.abandoned`, `tour.replayed`
- **Reference:** `article.opened`, `article.scrolled_to_end`, `article.feedback_given`, `related_article.clicked`, `search.performed`, `search.result_clicked`, `video.started`, `video.completed`, `help_center.viewed`

All prefixed `help.` (e.g. `help.tour.started`), snake_case props.

**Portal-local taxonomy** — `apps/designer-portal/src/lib/analytics/document-events.ts` (303 lines), routed through `posthog.capture` directly guarded by `isAnalyticsEnabled()`:
- `document_command_bar_opened` / `_queried` / `_zero_result` / `_selected` (F1)
- `document_wayfinding_door_opened`, `document_wayfinding_room_entered`, `document_help_opened`, `document_margin_note`, `document_desk_contents_acted`, `document_walkthrough_started` (with `source`)
- Plus a large family of unrelated document-lifecycle events (lens line, region-fold, desk-rendered, ceremony_*, design_request_claimed, etc.) not specific to onboarding.

**Known inconsistency (confirmed by the PRD, §7 "Reconciliation & Gaps"):** *"Components fire `window.posthog?.capture('help.*', ...)` directly... the typed `helpEvents` taxonomy... still exists but is unused by components."* Several Sprint 1–2 components (Coachmark, EmptyState, SectionIntro, LearnMore, FieldHelper, SmartDefault, HelpSearch, HelpArticle) carry local inline-string posthog helpers that predate `analytics.ts` and have not been consolidated onto it.

---

## 10. Sanity CMS content status

**Studio:** `studios/help-system` (Sanity project `kv3qrinl`, dataset `production`). Schemas: `helpContent`, `tooltipContent`, `emptyStateContent`, `helpArticleContent`, `coachmarkContent` — 5 total (spec called for `welcomeModalContent` and `videoContent` too; neither was built — `WelcomeModal` reuses the `tooltipContent` shape as a workaround).

**Content-health figures, quoted from `docs/prds/consolidated/09-help-guidance.md` (2026-07-06):**
- *"~142 of the ~150 Sanity docs are still literal 'PLACEHOLDER — pending Leah review' stubs."*
- *"5 designer tour coachmarks + 3 iOS tour coachmarks + ~142 Layer-4/H.2 placeholders"* (§4, Data Model).
- *"10 video walkthroughs (H4) not recorded — blocked on the still-open video-hosting decision."*
- *"PostHog dashboards unverified: the 5 required content dashboards... were reported as built by Kody but never verified via query."*
- The `isPlaceholderContent` guard (in `@patina/help-system`) treats any body starting with `PLACEHOLDER` or containing `pending Leah review` as a miss, "so production users currently see each component's inline `fallback` prop (or nothing), not CMS copy."

**Practical read:** almost every piece of contextual/reference help a designer sees today is the hard-coded fallback copy baked into the component, not authored Sanity content. Treat every fallback string quoted in this document as the *actual, current, production copy* — not a placeholder for something richer that already exists.

**Caveat:** this PRD is dated before R97 shipped and still describes `first-signin-tour.tsx` as live and mounted in `(portal)/portal/layout.tsx` — that layout no longer exists (§2 above). Everything else in the PRD not contradicted by a direct code-read in this session should be treated as reliable-but-unverified-post-R97.

---

## 11. The email drip — "The First Six Weeks"

**Source of truth:** `docs/marketing/founding-onboarding/copy-deck.md`. Engine: `supabase/functions/automation-processor/index.ts`. Migrations: 00291, 00293, 00294, 00310, 00404, 00405 (UNVERIFIED against current migration ledger — not re-checked in this session beyond the raw inventory's citation).

**17 emails, by slug/subject/moment** (`^## ` headings in the copy deck):

| Slug | Track | Subject | Moment |
|---|---|---|---|
| T0 — designer-invite | invite | "An invitation to Patina" | the invite itself |
| N1 — designer-invite-nudge-1 | invite | "Holding your seat" | link likely expired, re-send |
| N2 — designer-invite-nudge-2 | invite | "Is the timing wrong?" | final invite nudge, plain-text |
| W0 — designer-welcome | onboarding | "Your desk is ready" | first sign-in confirmation |
| E2 — onboarding-document-model | onboarding | "One client, one document" | teaches the document model |
| E3 — onboarding-capture | onboarding | "Your eye, everywhere" | teaches Capture |
| E4 — onboarding-library | onboarding | "Three shelves" | teaches the Library |
| E5 — onboarding-drafting-room | onboarding | "From shelf to proposal" | teaches the Drafting Room |
| E6 — onboarding-open-requests | onboarding | "Work, waiting on the desk" | teaches Open requests |
| E7 — onboarding-hours | onboarding | "Hours that keep themselves" | teaches the timer/Hours ledger |
| E8 — onboarding-books | onboarding | "The books, in order" | teaches the ledgers generally |
| E9 — onboarding-aesthete | onboarding | "Teach it your taste" | teaches the Aesthete Engine |
| E10 — onboarding-six-weeks | onboarding | "Six weeks in" | closes the drip, personalized `{{firsts_summary}}` |
| M1 — milestone-proposal-sent | milestone | "It's in their hands now" | first proposal sent |
| M2 — milestone-proposal-signed | milestone | "Signed." | first proposal signed |
| M3 — milestone-request-claimed | milestone | "It's yours" | first pool request claimed |
| M4 — milestone-first-payment | milestone | "First money through the books" | first payment recorded |

**10 in-app Post notes** (the "In-app note" field under each email that has one — 4 milestone emails and the 3 invite-track emails carry none):

| From email | Post note copy | Deep link |
|---|---|---|
| W0 | "Welcome. Replay the walkthrough anytime from the Help shelf." | `/help` |
| E2 | "Your first folder starts with a name. Under a minute." | `/desk` |
| E3 | "The clipper takes two minutes to set up. Then anything you find is yours to keep." | `/library` |
| E4 | "Three shelves: yours, your studio's, the makers'." | `/library` |
| E5 | "Your first board is one blank page away." | `/desk` |
| E6 | "Requests are on your desk. Claim what fits." | `/desk` |
| E7 | "Hours logged themselves this week. Have a look." | `/desk?sheet=hours` |
| E8 | "Signed work is waiting on an invoice. Two minutes." | `/desk?sheet=accounts` |
| E9 | "Aesthete is in the Library when you have ten minutes." | `/library` |
| E10 | "Six weeks in. The letter's in your email — and the desk is yours." | `/desk` |

Note the W0 note references "the Help shelf" for tour replay — consistent with the Help Center's pinned walkthrough row (§6).

**Status per the raw inventory:** UNVERIFIED whether this drip is live-sending in production — not re-checked this session (would require reading the automation-processor + migration ledger, out of this pass's scope).

---

## 12. The discoverability review (2026-07-09) — the key prior audit

**Source:** `docs/design/the-document/discoverability-review-2026-07.html`, prepared for Kody, "Middlewest Studio pilot," research by 3 agents, findings code-verified.

**The trigger.** Leah (the pilot) fled to the legacy `/portal` at least twice in two structured sessions; her own words: *"Very slick," "It almost seems too easy," "Loves where this is going — but still needs the complete functionality available in the portal."* A `zone_flight` PostHog event had been recording every escape to a legacy zone the entire time, unread; its counterpart `command_palette_open` had zero call sites — "we cannot yet see what designers reach for, only where they land."

**The 8 failure classes** (marked on an annotated reconstruction of the Desk/drawer/⌘K):

1. **Palette-only verbs** — core actions (Draw an invoice, Draft a proposal, Open a project, Help, Settings) exist nowhere on screen; only behind ⌘K.
2. **Contextual-only surfaces** — the Drafting Room only opens from a proposal's work-band, Compose is one small button inside Library, Boards is a facet buried in Drafting; none independently reachable.
3. **The silent Bell, the invisible field** — the Bell opens "The Post" but that name appears nowhere on screen; Field coordination renders nothing when quiet — unlearnable by looking.
4. **The unlinked room** — `/help` had zero inbound links.
5. **The legacy fallthrough** — absent paths (vendor creation, invoice settle/void/print, scope changes) drop back to `/portal`; the parity matrix read 66 FULL / 51 XFRM / 50 PART / 33 ABSENT across 202 rows.
6. **The affordance that lies** — People free-text search looked live but was a toast stub returning nothing.
7. **The second palette** — legacy pages still mounted an older ⌘K with the old vocabulary; the same key meant two different things.
8. **The blind ledger** — exactly three document events existed; `command_palette_open` had no call sites while `zone_flight` recorded every departure, unread.

**Foundation items (no ruling needed, "the floor under all four options"):** F1 instrument wayfinding; F2 read the accumulated `zone_flight` ledger; F3 make People search real; F4 person rows land on the person; F5 give `/help` a door; F6 name the Bell. Plus the structural repair underneath all six: **one shared studio-surface registry** feeding the drawer, the palette, and any future index from the same list — "One definition, one icon, no surface described twice."

**The four rulings — all recommended together as "one move":**

- **R93 — The Populated Palette.** *"Within canon — R5 already made ⌘K the front door; this only finishes it."* ⌘K opens already furnished (grouped, iconed, shortcut-labeled, alias-matched) instead of a blank prompt; a dry query recovers to the Help Center rather than going silent. → **This is the R93 the command bar (file 04) implements today**, confirmed live: groups, icons, `g`-shortcuts, alias matching, and a recovery path all exist in `command-bar.tsx` as shipped.
- **R94 — The Marginalia.** *"Within canon — empty states and inline notes touch no ruling."* Empty states and first-touch notes teach in the document's own voice, appear once, recede on use, never a modal, never a step counter. → **This is exactly the `margin-note.tsx` contract**, confirmed live and unit-described in §3 above, including the review's own sample copy for `desk-first-touch`, which matches production verbatim: *"This is your Desk. Folders that need you gather here; the rest stays quiet. ⌘K finds anything by name — try 'invoice'."*
- **R95 — The Contents Page.** *"Amends R5 — adds a visible standing surface alongside ⌘K and the drawer."* A permanent "Studio" front-matter block of labels and doorways (Rooms / Ledgers / Begin) — "names and destinations only, never counts or dashboard chrome." → Referenced live in `registry.tsx`'s own module doc (R95 is cited as governing "the Desk's Contents page"); this session did not open the Contents page component itself — UNVERIFIED beyond the registry's cross-reference.
- **R96 — The Laid Sheet.** *"Amends D14's presentation — the two weights and their physics stand; supersedes nothing."* Converges the dark bottom-slide ledger sheets onto the same paper-folio treatment the rooms already use — recommended over keeping the disjoint or making everything a room. Guardrail carried forward: *"a sheet stays one page."* UNVERIFIED whether this shipped as described — not directly re-checked this session; DECISIONS.md line 2957 shows R96 was ratified and describes the same paper-folio convergence.

**Roadmap (§6 of the review):** Phase 0 (Foundation, no ruling, starts on approval) → Phase 1 (ship all four rulings together) → Phase 2 (read the now-live instrumentation, close P0 legacy-fallthrough gaps in the order the flight-ledger names, revisit any ruling the numbers contradict).

**Sources cited by the review** (for context on its evidentiary basis): NN/g "Hamburger Menus and Hidden Navigation Hurt UX Metrics" (>20% discoverability drop, ≥39% slower for desktop users under hidden nav), NN/g "Recognition vs. Recall," NN/g "The Right Way to Do Onboarding Tutorials," NN/g "Tables of Contents," Superhuman's "How to Build a Remarkable Command Palette," the Arc browser post-mortem (beloved novel UI, features stranded, product abandoned — "a caution, not a template").

**What this means for a persona team:** R93/R94 are shipped and are the load-bearing onboarding surfaces today (populated palette + marginalia). R95/R96 appear ratified per DECISIONS.md but were not independently re-verified live in this pass. The review's central finding — that Patina had already built two onboarding mechanisms (tours, and now the walkthrough) while the *ambient, always-visible* wayfinding underneath them was full of dead ends — is the frame any new onboarding proposal must reckon with: a tour teaches once; the palette, the registry, and the margin notes are what a designer relies on the other 999 times.
