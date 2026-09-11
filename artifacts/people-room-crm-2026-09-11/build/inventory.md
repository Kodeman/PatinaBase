Inventory for the "Everyone on the Job" build sheet, gathered at worktree HEAD `b88fd4c51`
(`build/people-room-crm-2026-09-11`, based on `origin/main`).

## (a) Every consumer of `useFeatureFlag('call-sheet')`

14 call sites, all in `apps/designer-portal`:

1. `apps/designer-portal/src/app/(document)/desk/page.tsx:83`
2. `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1890`
3. `apps/designer-portal/src/components/document/command-bar.tsx:273`
4. `apps/designer-portal/src/components/document/letterhead-instruments.tsx:283`
5. `apps/designer-portal/src/components/document/coordination/item-composer.tsx:217`
6. `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:111`
7. `apps/designer-portal/src/components/document/roster/kickoff-band.tsx:52`
8. `apps/designer-portal/src/components/document/roster/project-team-roster.tsx:36`
9. `apps/designer-portal/src/components/document/roster/call-sheet.tsx:76`
10. `apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:435`
11. `apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:100`
12. `apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:209`
13. `apps/designer-portal/src/components/document/people/views/directory-view.tsx:220`
14. `apps/designer-portal/src/components/document/account/account-studio-page.tsx:159`

Program ruling (rulings.md §6): the `call-sheet` flag is retired — Call Sheet goes live for every
studio at deploy. All 14 call sites are candidates for removal/simplification at build time.

## (b) Highest migration number

Highest hand-numbered migration in `supabase/migrations/`: **00591**
(`00591_*` — email-deliverability's `notification_log` delivery columns/RLS, per
`docs/superpowers/plans/2026-09-11-email-deliverability-delivery-status.md`).

One non-hand-numbered migration also present: `20260910152111_*` (an imported website migration,
per project memory `project_phase_header_standing_head_panel_2026_09_10.md` — timestamp-style, not
part of the NNNNN sequence). The next hand-numbered migration for this program should mint from
**00592**, re-checked against the integration target's tip immediately before merge per
patina-parallel-work.

## (c) PostHog flag ids — skipped per instructions

## (d) `create_field_link` RPC location and expiry

- Originally defined: `supabase/migrations/00283_field_links.sql:86` —
  `CREATE OR REPLACE FUNCTION public.create_field_link(p_party_id UUID)`.
- Superseded (current live definition): `supabase/migrations/00284_field_dispatch_wiring.sql:37` —
  same body, widened to let service-role/internal callers (`auth.uid() IS NULL`) mint links for the
  field-daily cron and sms-dispatch.
- Expiry line: `supabase/migrations/00283_field_links.sql:33` —
  `expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')` — a table-level default on
  `field_link_tokens`, not set inside the function body itself; 00284 does not touch it.
- Per rulings.md PR-d, the program **retires this 90-day link clock**: a grant ends with the
  engagement window and renews on use instead.

## (e) Edge functions importing `_shared/send-email.ts`

26 files (`grep -rl "_shared/send-email" supabase/functions`):

1. `supabase/functions/_tests/fulfillment-po.test.ts`
2. `supabase/functions/apns-send/index.ts`
3. `supabase/functions/client-invite/index.ts`
4. `supabase/functions/commercial-document-notify/index.ts`
5. `supabase/functions/designer-invite/index.ts`
6. `supabase/functions/digest-dispatcher/index.ts`
7. `supabase/functions/fulfillment-notify/index.ts`
8. `supabase/functions/fulfillment-po/core.ts`
9. `supabase/functions/fulfillment-po/index.ts`
10. `supabase/functions/invoice-reminders/index.ts`
11. `supabase/functions/invoice-send/index.ts`
12. `supabase/functions/morning-brief/index.ts`
13. `supabase/functions/notification-digest/index.ts`
14. `supabase/functions/notification-dispatch/index.ts`
15. `supabase/functions/po-send/index.ts`
16. `supabase/functions/proposal-nudge/index.ts`
17. `supabase/functions/proposal-send/index.ts`
18. `supabase/functions/proposal-sign-confirmation/index.ts`
19. `supabase/functions/quote-request-send/index.ts`
20. `supabase/functions/review-requests/index.ts`
21. `supabase/functions/selection-review-send/index.ts`
22. `supabase/functions/stripe-webhook/index.ts`
23. `supabase/functions/trade-agreement-send/index.ts`
24. `supabase/functions/trade-rfq-send/index.ts`
25. `supabase/functions/waitlist-notify/index.ts`
26. `supabase/functions/workspace-member-invite/index.ts`

Per AGENTS.md/CLAUDE.md, any `_shared/*` edit requires redeploying every one of these 26 importers
(25 functions + 1 test file, which does not deploy).

## (f) Patina Field app root + Xcode scheme names

App root: `apps/mobile/Capture` (Xcode project `apps/mobile/Capture/Capture.xcodeproj`; also present
in this checkout: `apps/mobile/Mobile.xcworkspace`).

Shared schemes (`Capture.xcodeproj/xcshareddata/xcschemes/*.xcscheme`):
- `Capture`
- `CaptureKit`

Other top-level members of the app root: `CaptureKitMocks`, `CaptureTests`, `README.md`, `scripts`.

## (g) People help seed scripts under `studios/help-system/scripts`

4 files, all for the "editing details" help article:
- `studios/help-system/scripts/people-editing-details-help-content.ts`
- `studios/help-system/scripts/people-editing-details-help-content.json`
- `studios/help-system/scripts/seed-people-editing-details-help.ts`
- `studios/help-system/scripts/run-people-editing-details-help-seed.mjs`

Per rulings.md §6, this program's help articles (Directory, Call Sheet, site access, the trade
upload door) get their own drafts pushed to Sanity, following this same
content/seed/run-seed pattern.
