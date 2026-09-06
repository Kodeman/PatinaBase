# Raw lane B — recorded designer/tester feedback and documented flow (Explore agent, 2026-09-06)

## Who "Middle West" and "Leah" are

- Middle West Studio LLC is the legal entity behind Patina — Kody's company (Apple Developer team `VP22LXHT7L`; TestFlight external group `MiddleWest Client`; tester-feedback author `kody@middlewest.studio`). Not a partner studio.
- Open ruling V4 (Entity) in `docs/vision/VISION-DECISIONS.md:47-51`: stay a venture of Middle West Studio or form a separate LLC before Design Chicago — matters for co-founder equity, IP chain-of-title, trademarks, Pledge contract counterparty.
- Leah is the co-founder / design director (Madison, WI) and Patina's first daily designer user (`CLAUDE.md:19` "Leah's studio first"; `docs/design/the-document/leah-session-05-one-pager.md`).
- "Middlewest Studio (Madison)" / "Leah Kochaver, Middle West Studio · Madison" also appear as the fictional specimen studio in mocks; "Leah Hartwell" is the persona name used in prototypes.
- No design-build / turnkey model exists in the repo. GC/subcontractor exist only as directory roles (`DIRECTORY_ROLES`: clients, leads, makers, team, field, GC, subs, installers, receivers — `artifacts/designer-onboarding-learning-2026-09-03/briefing/01-concepts-and-navigation.md:83`) and as the `trade_scope` commercial document kind. Contractor markup appears once as market research: "a 10 to 15% markup is standard" (`artifacts/pricing-mechanics-2026-09-05/research/01-how-designers-price.md:60`).

## Where tester feedback lands

- Widget: `apps/designer-portal/src/components/tester/tester-widget.tsx` + `feedback-form.tsx` (buckets `working | not_working | missing | change`, weight, auto-context, optional screenshot).
- Tables: `public.feedback`, `public.feedback_events` (`supabase/migrations/00255_feedback_layer.sql`); screenshots in private bucket `feedback-screenshots` (00256).
- `00558_feedback_bug_reports_github.sql` adds `report_kind ('note'|'bug')` and a trigger calling edge function `feedback-github-issue`, which opens a GitHub issue labeled `tester-report, bug` on `Kodeman/PatinaBase`.

## Recorded feedback touching Agreement / Contract Room / scope / signature

GitHub tester notes (`Kodeman/PatinaBase`, author Kody, 2026-09-03):
- #43 — "The Drafting room from direction is really the design agreement. We should change the verbiage so that it lines up with the activity." (bucket Change, screen Document)
- #44 — "The Concept / Schematic * Core * Stage section is confusing. What is this trying to show? Be more precise."
- #42 — smoke test of the widget itself.

Shipped in response (branch `fix/prod-flow-2026-09-04`, merged `6600cc069`):
- `c0238136a` — "fix(document): the direction step opens the Contract Room" — Drafting Room → Contract Room across copy, help topics, command-bar labels, feedback strings and tests. Closes #43.
- `ad74e34c8` — "feat(discovery): Full house and Custom scope options (00567)".
- `00566` — a designer in two studios could not have a paper signature recorded on an origin agreement; fixed by resolving the studio rather than counting studios.

Prod walk friction log — `artifacts/doc-ux-review-2026-08-13/04-journey-walk.md` (real walked prod journey):
- "Discovery → Direction skips the doc. 'Begin the Direction' hard-navigates into the Drafting Room proposal editor… with 4 of 7 facets silently pre-filled — no Direction-phase landing section." MEDIUM.
- "Client-select auto-sends an invite… fired the link/invite immediately — no confirm, no undo." HIGH.
- "Facets 3–7 (Role rates, Rates & ceiling, Retainer, Terms) needed manual fill despite '4 of 7 facets written' claim; $0 defaults."
- "HARD WALL: 'Review & Send' → 'Send for the client signature' modal offers only 'Send later' or 'Send agreement →' (real email to the client). No in-portal designer-side mark-as-signed / simulate-acceptance… designers can't dry-run the lifecycle." HIGH.
- "Doc URL breaks permanently once Direction starts… canonical URL silently became /doc/{proposalId}." HIGH.
- "Nurture mislabels a draft as sent… for a proposal only ever SAVED, never sent." HIGH.
- "Proposal phase never advances in the rail even at '7 of 7 facets written' + saved… gated entirely behind the send+signature wall."

Simulated-practitioner panel findings (not real testers):
- `artifacts/client-approval-experience-2026-09-03/discovery/02-client-portal-journey.md:294` — "Design authorization ceiling / retainer can display 'Not yet set' in italic on a document the client is being asked to sign."
- `artifacts/client-approval-experience-2026-09-03/build/waves/w3/walk-web-r3.md:344` — the DB refuses with "design services agreement requires terms and at least one role rate" (`00477:306`).
- `artifacts/pricing-mechanics-2026-09-05/research/01-how-designers-price.md:99` — "Presenting one total figure without itemization increases rejection risk and blocks selective approval."
- `artifacts/document-lens-proposal-2026-08-28/research/31-verified-findings.md:87` — F77: at the document foot, "No authorizations recorded yet" with no way up and no client name.

Drift: published help content still teaches "Drafting Room" — `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/02-sending-and-signing.md:9`, `01-what-is-the-desk.md:15`, `glossary/room.md:11`, `the-keys.md:45` (Sanity loader inputs via `content/loader/run-onboarding-content-load.mjs`).

## The agreement flow as documented for users

Source of record: `artifacts/designer-onboarding-learning-2026-09-03/content/`. Surface keys `designer-portal/document/guide/sending-and-signing`, `designer-portal/document/how-to/change-project-scope`.

Sending and signing (`content/wave-1/02-sending-and-signing.md`):
- Drafted in the Drafting Room (now Contract Room), which exists once a proposal is begun — eight facets (Rooms, FF&E, Palette, Boards, Phases, Exclusions, Payments, Terms), self-saving, any order.
- Send is the hinge: "before you send, the document is yours to shape; after, it's parked. Nothing you do advances a sent proposal — only your client can, by signing, declining, or letting it expire." The Proposal section becomes a watch.
- Two signature paths: the client signs their own copy, or the designer records paper consent (`record_offline_signature`, 00254, consent method `'paper'` — `DECISIONS.md:2835`).
- Once signed, the watch collapses to SIGNED, carrying "open the project" if none exists.
- Revise is retired: "A proposal that's been revised travels as a new design services agreement rather than a resend of the old one" (`DECISIONS.md:8960`, I91).

Scope change (`content/wave-1/19-change-project-scope.md`): scope is not edited in place once work is underway; ⌘K → "Add a change" (amendment workflow), available only in install or care; earlier, "revising scope means revising the proposal itself, before it's signed."

Commercial model — "Two Yeses, One Document" (`docs/design/the-document/design-services-before-ffe-review.html`): Yes 01 = Design Services Agreement (services, deliverables, exclusions, role rates, design authorization ceiling, retainer, terms). Yes 02 = Furnishings Authorization for a named wave. Between them a non-binding working budget and an agreed checkpoint. Signature is a two-act hinge (client signs, studio countersigns); "The agreement becomes effective only when both signatures exist. That final act creates one project and one billing authority—atomically." Four client-facing document kinds: proposal, design services agreement (+ service_addendum), furnishings authorization, trade scope. Legacy proposal signing retired (410 `legacy_signing_retired`).

## Open decisions / rulings touching agreements

- `docs/design/the-document/the-document-needs-ruling-2026-07.md` — PRJ-04 (where scope-change requests live), PRJ-05 (does an SCR need fee/timeline impacts + a send act), PRJ-06 (the Document act for scope change), PRO-07 (free-text terms body — partially answered by R85a, `DECISIONS.md:2765`).
- `DECISIONS.md:9014` — "The Drafting Room is a press (Q5 step 2), with two doors deliberately left open": the `?flagged=1` walk-in and design-services agreements and their addenda (`ServiceAgreementDraftingRoom`) are explicit carve-outs, "recorded as debts."
- `artifacts/client-approval-experience-2026-09-03/build/rulings-2026-09-04.md` — R1 typed legal name + press-and-hold; R2 drawn signatures closed permanently; R3/P-29 no co-approver/partner login for twelve months; R4 no login-less door; "Signature only on Approve"; "'{Studio} has your signature. You'll have a copy.' replaces the unsubstantiated 'countersigns' line".
- `docs/design/workflow-completion/CAPABILITY-LEDGER.md:21` — capability 03 "Scope & Engagement" marked Deepen: "Bind proposals and agreements to one immutable studio service-package version and the project's commercial responsibility profile." Capability 09 "Contract Administration" also Deepen.
- `docs/vision/VISION-DECISIONS.md` — V4 (entity / Pledge contract counterparty) and V6 (Pledge × subscription) are the agreement-adjacent open rulings; both legal-gated.
