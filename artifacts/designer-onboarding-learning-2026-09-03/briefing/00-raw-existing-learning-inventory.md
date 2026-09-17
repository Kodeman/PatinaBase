# Raw exploration: what already teaches the designer portal (verified 2026-09-03)

## 1. Onboarding / first-run
- **Desk Walkthrough (R97, live)** — `apps/designer-portal/src/components/document/help/desk-walkthrough.tsx`, gate `desk-walkthrough-gate.ts` (+ tests). WelcomeModal + 6 coachmarks, desk-only. Fresh signups (≥ `DESK_WALKTHROUGH_SHIP_DATE = 2026-07-10T15:10:00Z`) auto-open on first `/desk`; older accounts get a margin-note offer. Steps: "The Desk", "One client, one document", "Rooms and ledgers", "The studio drawer", "Find anything" ("⌘K reaches any folder, person, or book by name — try 'invoice'."), "Begin with a lead". Replay: `/desk?tour=desk-walkthrough` (⌘K row, `/help` pinned row). Modal copy: "Take a brief tour to see how everything fits together, or jump in and explore." Secondary CTA "Skip for now".
- **FirstSigninTour (older, still in tree)** — `apps/designer-portal/src/components/help/first-signin-tour.tsx`, 5-step "First Project Walkthrough" (Sprint 3/Wave 9). Overlaps the Desk Walkthrough.
- **Margin note "desk-first-touch"** — `components/document/margin-note.tsx`, rendered by `app/(document)/desk/page.tsx`: "This is your Desk. Folders that need you gather here; the rest stays quiet. ⌘K …". Recedes forever on first ⌘K or dismissal.
- **Studio setup checklist + whisper** — `components/document/account/studio-setup-checklist.tsx`, `studio-setup-whisper.tsx`, `lib/document/studio-setup.ts`. 5 steps: "Name & brand the studio", "Set your own title", "Invite your crew", "Seed the rolodex", "Open the first project". Whisper after 2+ opens incomplete: "The studio isn't fully set up."
- **Empty states** — `packages/help-system/src/ambient/EmptyState/`, ~17 portal call sites; copy in `lib/document/document-guide.ts`, `closure-derivation.ts`.
- **Match Ceremony / Arrival Arc** — `components/document/ceremony/*`, route `app/(document)/ceremony/[leadId]/page.tsx`; spec `docs/design/the-document/the-document-arrival-arc-package.md`. Client-arrival, NOT designer onboarding.
- **No sample/demo project seeding** for new signups.

## 2. Help system
- `packages/help-system` (`@patina/help-system`): Ambient (EmptyState, FieldHelper, FieldLabel, SectionIntro, SmartDefault); Reactive (Tooltip, InfoIcon, StrataInfoIcon, LearnMore, ContextualHelpPanel); Proactive (Coachmark, WelcomeModal, TourController + tourState.ts, FeatureAnnouncementCoachmark — built, unused); Reference (HelpArticle, HelpSearch, RelatedArticles, VideoPlayer). Persistence `src/persistence/supabaseAdapter.ts` → `profiles.help_state` (00146), designer portal only. Keying `src/surfaceKeys.ts` (`portal/section/component[/state]`).
- Sanity CMS `studios/help-system`: schemas helpContent, helpArticleContent, coachmarkContent, tooltipContent, emptyStateContent.
- Portal: Help Center `/help` (`app/(document-help)/help/page.tsx`: search, pinned walkthrough row, Featured, 8-topic browse grid); shelves in `lib/help-system/help-topics.ts` ("Getting started", "The Desk & the Studio", "Your documents", "Rooms", "Ledgers & money", "Ideas & vocabulary", "How do I…", +1); contextual panel `components/document/help/document-help.tsx` via `openHelp()` (⌘K "Help…" row); glue `lib/help-system/document-surface-keys.ts`, `open-help.ts`, `help-topic-page.ts`.
- Content status (`docs/prds/consolidated/09-help-guidance.md`, 2026-07-06): ~8 of ~150 docs published, 10 videos unrecorded, content-health dashboards unverified.
- Screens: `docs/design/the-document/screenshots/help-walkthrough/`.

## 3. Keyboard shortcuts
- ⌘K palette `components/document/command-bar.tsx` (R93; groups In hand / Recent / This surface / Begin / Rooms & ledgers / Studio), driven by `lib/document/registry.tsx`.
- `g`-chords `components/document/registry-shortcuts.tsx`: `g l` Library, `g p` People, `g r` The Scans, `g o` Orders, `g a` Accounts, `g h` Hours, `g t` The Post. Ignored in inputs/dialogs.
- Scattered ⌘/Ctrl+Enter saves (margin notes, item sheets, mood board).
- NO cheat sheet, NO shortcuts modal, NO central hotkey hook.

## 4. Flags / analytics
- No PostHog flag gates onboarding/help; gating = ship-date constant + one-shot state.
- Typed `help.*` events in `packages/help-system/src/analytics.ts` (welcome_modal.shown/action, tour.started/step_advanced/step_viewed/completed/abandoned/replayed, coachmark.shown/dismissed, panel.opened/closed, tooltip.*, article.opened/scrolled_to_end/feedback_given, search.performed/result_clicked, help_center.viewed, empty_state.shown/cta_clicked, field_helper.shown, smart_default.applied/overridden, feature_announcement.*, video.started/completed).
- Portal-local `lib/analytics/document-events.ts`: document_wayfinding_door_opened, document_help_opened (source palette/sheet-head/front-matter/court-bar), document_margin_note, document_walkthrough_started (first_signin/command_bar/margin_note), document_desk_contents_acted. Some direct `window.posthog.capture` calls bypass the typed taxonomy.

## 5. Email drip
- "The First Six Weeks": `docs/marketing/founding-onboarding/copy-deck.md` (17 emails + 10 in-app Post notes); engine `supabase/functions/automation-processor/index.ts`; migrations 00291, 00293, 00294, 00310, 00404, 00405.

## 6. Docs / vocabulary
- `docs/vision/VISION.md`, `VISION-DECISIONS.md`; `docs/design/the-document/DECISIONS.md` (R-log), `CODEBASE-MAP.md`, prototypes.
- No user-facing designer-portal glossary. (`docs/design/ios-ux-review-2026-07/glossary.md` is iOS strings.)

## 7. Prior audits
- `docs/design/the-document/discoverability-review-2026-07.html` — KEY: Middlewest pilot (2026-07-09), why Leah fled to the legacy portal; 8 failure classes (palette-only verbs, contextual-only surfaces, silent Bell…), rulings, roadmap.
- `docs/prds/consolidated/09-help-guidance.md` — as-built status ledger.
- `docs/qa/designer-portal-audit/sec-06-07-help-content-status-2026-05-28.md`; `docs/_archive/handoffs/help-system-sprint-{1..4}-report.md`, `help-system-production-verification-report.md`.

## Gaps (facts)
No shortcut cheat sheet · no glossary page · no onboarding flag · no demo project · two overlapping tours · typed analytics inconsistently used · ~142 Sanity docs placeholder · admin/client portals have no tours.
