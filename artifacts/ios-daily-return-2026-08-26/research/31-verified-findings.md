# Verified findings — The Daily Return (2026-08-26)

Merged 213 collated findings against three verdict files (code-truth, canon-truth, repro). Result: **199 verified**, **14 contested**, **0 unverified**, **0 refuted** (dropped — see `32-refuted-findings.md`).

| id | status | title | severity | confidence | seats | class | shots |
|---|---|---|---|---|---|---|---|
| F05 | verified | Browse grid renders off-canvas, unreadable cards | S0 | 0.95 | D1,D3,H1,H3,U2,U3 | purchase | d-03-browse-pieces.png, g-15-browse-pieces-grid.png, g-15b-browse-grid-settled.png (+2 more) |
| F20 | verified | Portal instruction for me rendered to my client | S0 | 0.95 | D1 | trust | c-08-project-detail.png |
| F27 | verified | Auth wall lands at the last tap, no escape | S0 | 0.95 | H1 | trust | g-31-design-request-step1.png, g-33-after-send-request.png, g-35-auth-wall-no-dismiss.png |
| F30 | verified | Today shows 1 of 4 pending items, not the money | S0 | 0.95 | H2 | return | c-03-home-top-activeproject.png, c-06b-studio-awaiting-you.png |
| F34 | verified | Two weeks away looks exactly like two minutes away | S0 | 0.95 | H2 | return | c-03-home-top-activeproject.png, c-29-relaunch-returning-client.png |
| F37 | verified | Today hides the four things awaiting the client | S0 | 0.95 | U1 | return | c-04-home-scrolled-studio-rows.png, c-06b-studio-awaiting-you.png |
| F09 | verified | The designer is named once, on the bill | S0 | 0.938 | D1,D3,H2,H3 | trust | c-03-home-top-activeproject.png, c-08-project-detail.png, c-13-invoice-detail.png (+3 more) |
| F12 | verified | Buying ends at "Add to Room / Saved ✓" | S0 | 0.938 | D1,H1,H3,U3 | purchase | g-15-browse-pieces-grid.png, g-17-piece-detail-top.png, g-20-card-more-menu.png |
| F13 | verified | Only the date changes from one morning to the next | S0 | 0.933 | H1,H3,U1 | return | c-03-home-top-activeproject.png, c-29-relaunch-returning-client.png, d-00-current-state-before-dark.png (+4 more) |
| F01 | verified | Sharing a piece hands over the designer portal | S0 | 0.929 | D1,D2,D3,H1,H3,U1,U3 | trust | g-19-share-sheet.png |
| F02 | verified | Proposals list mislabels an accepted proposal "SIGNED" | S0 | 0.925 | D1,D2,D3,H2,H3,U3 | trust | c-09-proposals-list.png, c-19-messages-empty.png |
| F08 | verified | Notifications empty while four items are due | S0 | 0.92 | D1,D3,H3,U1,U3 | return | c-06b-studio-awaiting-you.png, c-21-notifications-signed-in.png, d-10-notifications.png |
| F03 | verified | The signature sheet restates nothing | S0 | 0.917 | D1,D2,D3,H2,H3,U3 | trust | c-11-proposal-detail-scrolled.png, c-11c-sign-sheet.png, x-05-proposal-detail.png |
| F16 | verified | Two weeks away looks like one hour away | S0 | 0.917 | H1,H3,U1 | return | c-03-home-top-activeproject.png, c-29-relaunch-returning-client.png, d-01-home-top.png (+1 more) |
| F10 | verified | The engaged home is the guest home | S0 | 0.9 | D1,H1,H3,U1 | return | c-31-engaged-home-top.png, c-32-engaged-companion.png, c-32b-engaged-profile-studio.png (+1 more) |
| F11 | verified | Money rail sits behind an unlabelled monogram | S0 | 0.9 | D1,D3,H2,H3 | wayfinding | c-03-home-top-activeproject.png, c-04-home-scrolled-studio-rows.png, c-04b-your-studio-hub.png (+1 more) |
| F17 | verified | Dimensions and lead time exist nowhere | S0 | 0.9 | H1,H3 | purchase | g-15-browse-pieces-grid.png, g-22b-saved-all-items.png |
| F19 | verified | No order object anywhere in the client app | S0 | 0.9 | H3,U3 | return | c-06b-studio-awaiting-you.png, c-08-project-detail.png, c-13b-invoice-detail-scrolled.png |
| F22 | verified | A direct order would credit the designer nothing | S0 | 0.9 | D1 | purchase |  |
| F23 | verified | Guest's room and taste portrait adopted by the account | S0 | 0.9 | D1 | trust | c-03-home-top-activeproject.png, c-23-your-spaces.png, c-26-profile.png (+1 more) |
| F24 | verified | "Get design help" from an already-matched client files an indistinguishable second lead | S0 | 0.9 | D2 | wayfinding | c-33-engaged-design-request-again.png |
| F25 | verified | Engaged client's home/Companion show zero trace of the accepted designer | S0 | 0.9 | D2 | trust | c-31-engaged-home-top.png, c-32-engaged-companion.png |
| F26 | verified | Buy-now backend built with zero designer attribution | S0 | 0.9 | D3 | purchase |  |
| F28 | verified | A returning guest is dumped at "Welcome home" | S0 | 0.9 | H1 | return | g-38-relaunch-returning-guest.png, g-40-companion-inconsistent-persistence.png, s-04-relaunch-guest-persist.png |
| F29 | verified | Guest room and saves follow the next account in | S0 | 0.9 | H1 | trust | c-03-home-top-activeproject.png, c-05-companion-panel-client.png, c-26-profile.png (+1 more) |
| F36 | verified | Guest's day-one work is gone on day two | S0 | 0.9 | U1 | return | g-38-relaunch-returning-guest.png, g-40-companion-inconsistent-persistence.png |
| F38 | verified | No money or decision event can send a push | S0 | 0.9 | U1 | return | c-06b-studio-awaiting-you.png, c-21-notifications-signed-in.png |
| F07 | verified | Push never fires for proposals, invoices or decisions | S0 | 0.883 | D1,D2,H1,H2,H3,U3 | return | c-21-notifications-signed-in.png, c-29-relaunch-returning-client.png, d-10-notifications.png (+1 more) |
| F14 | verified | Saved has no door until something is already saved | S0 | 0.867 | H1,H3,U1 | wayfinding | c-05-companion-panel-client.png, d-09-companion-panel.png, g-14b-companion-next-steps.png (+1 more) |
| F15 | verified | No way to put a piece into a room | S0 | 0.85 | H1,H3,U2 | return | g-20-card-more-menu.png, g-27c-card-menu-in-room-context.png, g-28b-room-view.png |
| F18 | contested | 18 × 14 ft is stored as 59' × 46' | S0 | 0.75 | H1,H3 | trust | c-24-room-detail.png, d-06a-room-summary-light-locked.png, g-25-manual-room-entry-metric.png (+3 more) |
| F21 | contested | No way to message the designer from anywhere | S0 | 0.75 | D1 | trust | c-19-messages-empty.png |
| F33 | contested | No way to message my designer, anywhere | S0 | 0.7 | H2 | return | c-19-messages-empty.png |
| F35 | contested | No way to say a word to the designer | S0 | 0.7 | H3 | trust | c-06b-studio-awaiting-you.png, c-19-messages-empty.png |
| F39 | contested | The nav row back to Saved can vanish for the exact saves the app invites | S0 | 0.65 | U2 | return | g-21-saved-empty-boards-tab.png |
| F31 | verified | Every product page fails to load, no way out | S1 | 0.95 | H2 | return | c-25-piece-detail-client.png |
| F32 | verified | Buy it — the dead end, verbatim | S1 | 0.95 | H2 | purchase | c-25-piece-detail-client.png |
| F71 | verified | Proposal selections carry no prices and no images | S1 | 0.95 | D1 | purchase | c-10-proposal-detail-top.png, c-11-proposal-detail-scrolled.png |
| F81 | verified | Companion orb covers the "Sign proposal" button | S1 | 0.95 | D2 | purchase | c-11-proposal-detail-scrolled.png |
| F102 | verified | The date you need is on the screen you leave | S1 | 0.95 | H2 | wayfinding | c-06b-studio-awaiting-you.png, c-09-proposals-list.png, c-10-proposal-detail-top.png (+3 more) |
| F114 | verified | Status bar draws over scrolled content | S1 | 0.95 | H3 | reach | c-11c-sign-sheet.png, c-14-pay-handoff.png, c-19-messages-empty.png (+3 more) |
| F121 | verified | Home has no Browse, Saved, Studio or designer door | S1 | 0.95 | U1 | wayfinding | c-04-home-scrolled-studio-rows.png, d-02-home-studio-rows.png, g-13-home-scrolled.png |
| F130 | verified | The app owns no surface outside itself | S1 | 0.95 | U1 | return | c-29-relaunch-returning-client.png |
| F04 | verified | Every piece detail fails and traps the user | S1 | 0.943 | D1,D3,H1,H3,U2,U3 | purchase | c-22b-saved-all-items.png, c-25-piece-detail-client.png, d-04-piece-detail.png (+4 more) |
| F41 | verified | Three disagreeing 'things needing attention' counts on one screen | S1 | 0.925 | D1,D2,D3,H2,H3,U1 | trust | c-03-home-top-activeproject.png, c-05-companion-panel-client.png, c-06b-studio-awaiting-you.png |
| F56 | verified | "Your budget" shows one invoice, not the client's real $725,000 across projects | S1 | 0.925 | D1,D2 | trust | c-07-projects-list.png, c-15-budget.png |
| F60 | verified | The project screen shows the designer's to-do | S1 | 0.925 | D3,H3 | trust | c-08-project-detail.png |
| F69 | verified | Designer-facing FF&E instruction rendered to the client | S1 | 0.925 | U1,U3 | trust | c-08-project-detail.png |
| F48 | verified | Deadlines shown on list cards vanish on the detail screen the client acts on | S1 | 0.913 | D1,D2,H3 | trust | c-06b-studio-awaiting-you.png, c-09-proposals-list.png, c-10-proposal-detail-top.png (+3 more) |
| F45 | verified | No Sign Out and no Delete Account anywhere | S1 | 0.912 | D1,H1,H3,U3 | trust | c-27-account-row-inert.png, c-28-settings-client.png, c-28b-settings-scrolled.png (+4 more) |
| F40 | verified | A 6-point-wide toggle silently corrupts room data | S1 | 0.9 | U2 | reach | c-24-room-detail.png, d-06-room-detail.png, g-25-manual-room-entry-metric.png (+1 more) |
| F42 | verified | Saved opens on boards that can never fill | S1 | 0.9 | H1,H2,H3,U1,U2,U3 | return | c-22-saved-signed-in.png, c-22b-saved-all-items.png, g-21-saved-empty-boards-tab.png |
| F46 | verified | Same story forever, permanently marked unread | S1 | 0.9 | H1,H2,H3,U1 | trust | c-03-home-top-activeproject.png, c-31-engaged-home-top.png, d-01-home-top.png (+1 more) |
| F61 | verified | One story, forever, out of three that exist | S1 | 0.9 | H1,H3 | return | c-03-home-top-activeproject.png, c-31-engaged-home-top.png, d-01-home-top.png (+2 more) |
| F66 | verified | Nothing in the app answers "where is it" | S1 | 0.9 | H1,U1 | purchase | c-06b-studio-awaiting-you.png, c-08-project-detail.png, c-21-notifications-signed-in.png (+2 more) |
| F68 | verified | Payment failure is one red line under a live button | S1 | 0.9 | H3,U3 | trust | c-13b-invoice-detail-scrolled.png, c-14-pay-handoff.png |
| F70 | verified | "CLIENT VIEW / Milestone" exposes the visibility tier | S1 | 0.9 | D1 | trust | c-08-project-detail.png |
| F72 | verified | Empty bell pitches a designer to an engaged client | S1 | 0.9 | D1 | trust | c-21-notifications-signed-in.png, c-32c-engaged-studio-rows.png |
| F73 | verified | Matched client's Studio is five zeroes | S1 | 0.9 | D1 | content | c-32b-engaged-profile-studio.png, c-32c-engaged-studio-rows.png |
| F74 | verified | Engaged client's only act is a second request | S1 | 0.9 | D1 | trust | c-33-engaged-design-request-again.png, x-06-design-request.png |
| F76 | verified | Project detail discards the data it fetched | S1 | 0.9 | D1 | return | c-08-project-detail.png |
| F77 | verified | No document surface for the client | S1 | 0.9 | D1 | content | c-19-messages-empty.png |
| F79 | verified | Signed-in Today has zero designer/studio identity | S1 | 0.9 | D2 | trust | c-03-home-top-activeproject.png |
| F84 | verified | Project detail leaks two designer/internal-facing strings verbatim | S1 | 0.9 | D2 | trust | c-08-project-detail.png |
| F85 | verified | Notifications promises "updates from your designer" and never delivers one | S1 | 0.9 | D2 | return | c-21-notifications-signed-in.png |
| F93 | verified | Budget screen shows one of three projects as "the budget" | S1 | 0.9 | D3 | trust | c-15-budget.png |
| F96 | verified | Two quizzes give my taste two different names | S1 | 0.9 | H1 | trust | g-08-quiz-result.png, g-26-after-room-created.png, g-28-room-view-final.png |
| F98 | verified | No Browse door on the home or in the orb | S1 | 0.9 | H1 | wayfinding | g-12-home-discovering-top.png, g-13-home-scrolled.png, g-14b-companion-next-steps.png |
| F99 | verified | Active Room is a stranger's room, not mine | S1 | 0.9 | H2 | trust | c-03-home-top-activeproject.png, c-34-final-state-signed-in-client.png |
| F100 | verified | Browse grid cards run off both screen edges | S1 | 0.9 | H2 | content | d-03-browse-pieces.png |
| F103 | verified | 'Budget' is really one invoice's billing total | S1 | 0.9 | H2 | trust | c-04b-your-studio-hub.png, c-15-budget.png |
| F107 | verified | XL type: the Dynamic Island blots out my proposal's title | S1 | 0.9 | H2 | reach | x-02-profile-studio-rows.png |
| F109 | verified | Unit toggle is a 6-point silent target | S1 | 0.9 | H3 | reach | g-25-manual-room-entry-metric.png |
| F111 | verified | Design help offers a second request, not status | S1 | 0.9 | H3 | trust | c-33-engaged-design-request-again.png, g-30-designer-consultation.png, x-06-design-request.png |
| F112 | verified | Guest hits an escape-less wall at the last tap | S1 | 0.9 | H3 | trust | g-31-design-request-step1.png, g-33-after-send-request.png, g-35-auth-wall-no-dismiss.png |
| F115 | verified | "Your budget" is a bill, not a budget | S1 | 0.9 | H3 | trust | c-07-projects-list.png, c-08-project-detail.png, c-15-budget.png |
| F117 | verified | App asks who I am before showing anything | S1 | 0.9 | U1 | return | g-02-first-screen-after-splash.png, g-38-relaunch-returning-guest.png |
| F118 | verified | Tour never teaches the save loop it promises | S1 | 0.9 | U1 | return | g-09-home-tour-step1.png, g-10-home-tour-step2.png |
| F124 | verified | My investment belongs to the phone, not the account | S1 | 0.9 | U1 | trust | c-23-your-spaces.png, c-26-profile.png, c-34-final-state-signed-in-client.png |
| F125 | verified | Project screen shows three stats and no timeline | S1 | 0.9 | U1 | return | c-08-project-detail.png |
| F126 | verified | The whole Studio hides behind a 36pt monogram | S1 | 0.9 | U1 | reach | c-03-home-top-activeproject.png, c-06b-studio-awaiting-you.png |
| F127 | verified | Deadlines are printed once and never reminded | S1 | 0.9 | U1 | return | c-12-invoices-list.png, c-13-invoice-detail.png |
| F129 | verified | Only one piece can be shared with anyone | S1 | 0.9 | U1 | return | g-20-card-more-menu.png, g-27c-card-menu-in-room-context.png |
| F132 | verified | Tour skips the app's only save-loop lesson | S1 | 0.9 | U2 | wayfinding | g-09-home-tour-step1.png, g-10-home-tour-step2.png, g-11-companion-intro-card.png |
| F133 | verified | Saved opens on a tab that says nothing is saved | S1 | 0.9 | U2 | trust | g-21-saved-empty-boards-tab.png, g-22b-saved-all-items.png |
| F135 | verified | The status bar draws over scrolled content, worst on modal sheets at XXL | S1 | 0.9 | U2 | content | d-02-profile-studio-rows.png, x-02-profile-studio-rows.png, x-06-design-request.png |
| F136 | verified | The filter chip row overflows the screen at XXL with no way to reach the last chip | S1 | 0.9 | U2 | reach | x-03-browse-pieces.png |
| F137 | verified | Body text runs into the Companion button with no reserved space | S1 | 0.9 | U2 | content | x-05-proposal-detail.png |
| F138 | verified | Home doesn't scroll, and gives no sign anything is hidden | S1 | 0.9 | U2 | wayfinding | d-01-home-top.png, d-02-home-studio-rows.png |
| F142 | verified | Dimensions exist as a column and nowhere else | S1 | 0.9 | U3 | trust | g-15-browse-pieces-grid.png |
| F144 | verified | No shipping, returns or responsibility copy exists | S1 | 0.9 | U3 | trust | c-13b-invoice-detail-scrolled.png, g-15-browse-pieces-grid.png |
| F148 | verified | Saved opens on an empty tab while an item exists | S1 | 0.9 | U3 | return | c-22-saved-signed-in.png, c-22b-saved-all-items.png, g-21-saved-empty-boards-tab.png |
| F151 | verified | Buy-now is armed on the backend and unbuilt on iOS | S1 | 0.9 | U3 | purchase |  |
| F152 | verified | A direct order credits the designer nothing | S1 | 0.9 | U3 | trust |  |
| F154 | verified | The order state machine stops at "paid" | S1 | 0.9 | U3 | return |  |
| F155 | verified | Two budgets for one project, both labelled budget | S1 | 0.9 | U3 | trust | c-07-projects-list.png, c-08-project-detail.png, c-15-budget.png |
| F156 | verified | Due date dropped from the pay screen | S1 | 0.9 | U3 | trust | c-09-proposals-list.png, c-10-proposal-detail-top.png, c-12-invoices-list.png (+2 more) |
| F49 | verified | The orb covers the button it should help with | S1 | 0.883 | D1,H1,H3 | reach | c-11-proposal-detail-scrolled.png, c-24-room-detail.png, g-28b-room-view.png (+1 more) |
| F50 | verified | 'Your studio' promises three things, delivers one | S1 | 0.883 | D1,D2,H2 | wayfinding | c-04b-your-studio-hub.png, c-05-companion-panel-client.png, c-07-projects-list.png |
| F51 | verified | A typed form calls itself a scan | S1 | 0.883 | H1,H3,U2 | trust | c-06c-studio-bottom.png, c-23-your-spaces.png, g-12-home-discovering-top.png (+2 more) |
| F52 | verified | Nothing on a piece helps you decide | S1 | 0.883 | H1,H3,U3 | purchase | g-20-card-more-menu.png |
| F53 | verified | The shared link cannot open the app | S1 | 0.883 | H1,H3,U1 | return | g-19-share-sheet.png |
| F55 | verified | "Account >" has a chevron and does nothing | S1 | 0.883 | H1,H3,U2 | wayfinding | c-27-account-row-inert.png, c-28-settings-client.png, g-02b-settings-account-inert.png (+1 more) |
| F43 | verified | No search exists anywhere in the app | S1 | 0.88 | H1,H2,H3,U2,U3 | wayfinding | d-03-browse-pieces.png, g-14b-companion-next-steps.png, g-15-browse-pieces-grid.png (+1 more) |
| F47 | verified | Notification permission asked once, unexplained | S1 | 0.875 | H1,H3,U1,U3 | return | c-28-settings-client.png, g-29-notifications-guest.png, g-37-settings-guest.png |
| F59 | verified | No way to ask a question or defer on a decision | S1 | 0.875 | D2,H2 | wayfinding | c-18-decision-detail.png |
| F54 | verified | No partner, household or second seat | S1 | 0.867 | H1,H3,U1 | return | c-27-account-row-inert.png, c-28-settings-client.png, g-19-share-sheet.png (+1 more) |
| F58 | verified | An active project with nothing pending leaves Today | S1 | 0.85 | D1,U1 | return | c-03-home-top-activeproject.png, c-31-engaged-home-top.png |
| F62 | verified | "UNKNOWN MAKER" on a provenance marketplace | S1 | 0.85 | H1,H3 | trust | g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png |
| F65 | verified | "Browse Picks for This Room" is not room-filtered | S1 | 0.85 | H1,U3 | content | d-check10-after-heart-tap.png, g-27b-room-picks.png, g-27c-card-menu-in-room-context.png (+1 more) |
| F78 | verified | Payment failure offers no retry and no human | S1 | 0.85 | D1 | purchase | c-14-pay-handoff.png |
| F80 | verified | Next Move never surfaces an open proposal or due invoice | S1 | 0.85 | D2 | return | c-03-home-top-activeproject.png |
| F83 | verified | Pay-invoice failure UX shoves body copy off-screen with no real retry path | S1 | 0.85 | D2 | purchase | c-14-pay-handoff.png |
| F89 | verified | Pay-failure UX has no retry, no way to reach a human | S1 | 0.85 | D3 | trust | c-14-pay-handoff.png |
| F91 | verified | Today never surfaces a proposal or invoice | S1 | 0.85 | D3 | wayfinding | c-03-home-top-activeproject.png |
| F92 | verified | Deadlines shown on the list, dropped on the detail | S1 | 0.85 | D3 | content | c-06b-studio-awaiting-you.png, c-09-proposals-list.png, c-10-proposal-detail-top.png (+3 more) |
| F95 | verified | Proposal selections show logo placeholders, no per-item price | S1 | 0.85 | D3 | trust | c-11-proposal-detail-scrolled.png, c-11c-sign-sheet.png |
| F97 | verified | Core controls are far under 44 points | S1 | 0.85 | H1 | reach | g-17-piece-detail-top.png, g-21-saved-empty-boards-tab.png, g-25-manual-room-entry-metric.png |
| F101 | verified | My real rooms live nowhere I can check on them | S1 | 0.85 | H2 | wayfinding | c-13-invoice-detail.png, c-23-your-spaces.png |
| F105 | verified | Nothing that matters to me can be shared | S1 | 0.85 | H2 | return | c-13-invoice-detail.png, c-18-decision-detail.png |
| F108 | verified | Fresh install is met by a wall, not a room | S1 | 0.85 | H3 | wayfinding | g-02-first-screen-after-splash.png |
| F113 | verified | A returning guest is forgotten and called "home" | S1 | 0.85 | H3 | trust | g-36-profile-guest.png |
| F122 | verified | A saved piece forgets it was saved | S1 | 0.85 | U1 | trust | c-22b-saved-all-items.png |
| F123 | verified | Home says zero pieces saved while Saved holds one | S1 | 0.85 | U1 | content | g-22b-saved-all-items.png, g-40b-home-active-room-clipped.png |
| F128 | verified | Returning client is offered to re-file their request | S1 | 0.85 | U1 | return | c-33-engaged-design-request-again.png, x-06-design-request.png |
| F131 | verified | The editorial well holds three stories | S1 | 0.85 | U1 | content | c-03-home-top-activeproject.png |
| F134 | verified | The only door to the Studio is the worst-reached control on the screen | S1 | 0.85 | U2 | reach | g-12-home-discovering-top.png, x-01-home-top.png |
| F141 | verified | The design-request soft wall removes every escape hatch the real gate has | S1 | 0.85 | U2 | wayfinding | g-02-first-screen-after-splash.png, g-35-auth-wall-no-dismiss.png |
| F143 | verified | Lead time never reaches the shopper | S1 | 0.85 | U3 | trust | g-15-browse-pieces-grid.png |
| F147 | verified | Saving a piece gives no visible confirmation | S1 | 0.85 | U3 | purchase | d-check10-after-heart-tap.png, d-check11.png |
| F150 | verified | No "ask my designer" on the piece surface | S1 | 0.85 | U3 | purchase | g-20-card-more-menu.png |
| F153 | verified | No vendor link or price inquiry to leave toward | S1 | 0.85 | U3 | purchase | g-20-card-more-menu.png |
| F67 | verified | Piece-detail saves are local-only and duplicate | S1 | 0.825 | H2,U3 | return |  |
| F86 | verified | No dimensions, lead time, shipping, or liability fields | S1 | 0.8 | D3 | trust |  |
| F87 | verified | No "ask my designer" control on the piece itself | S1 | 0.8 | D3 | purchase | g-20-card-more-menu.png |
| F104 | verified | A failed $4,250 payment gets one crowded red line | S1 | 0.8 | H2 | trust | c-14-pay-handoff.png |
| F120 | verified | The first ask is the app's heaviest act | S1 | 0.8 | U1 | return | g-12-home-discovering-top.png, g-23-spaces-or-scan.png |
| F139 | verified | There is no Sign Out control anywhere in the app | S1 | 0.8 | U2 | wayfinding | g-02b-settings-account-inert.png |
| F140 | verified | Two different quizzes exist for one concept and disagree with each other | S1 | 0.8 | U2 | wayfinding | g-06-quiz-q1.png, g-26-after-room-created.png |
| F157 | verified | Card payers are told a bank transfer has started | S1 | 0.8 | U3 | trust | c-13b-invoice-detail-scrolled.png |
| F63 | verified | Tomorrow the saved piece says "Add to Room" again | S1 | 0.75 | H1,H3 | return | g-22b-saved-all-items.png |
| F64 | verified | AR is offered by the UI but cannot ever render | S1 | 0.75 | H1,U2 | trust | c-24-room-detail.png, d-06-room-detail.png, g-28b-room-view.png |
| F90 | verified | No fulfillment/shipping status on any line item | S1 | 0.75 | D3 | content | c-13b-invoice-detail-scrolled.png |
| F145 | verified | The maker line shows the retailer, not the maker | S1 | 0.75 | U3 | trust | g-15-browse-pieces-grid.png, g-22b-saved-all-items.png |
| F75 | contested | An $850 decision commits on one unconfirmed tap | S1 | 0.7 | D1 | trust | c-18-decision-detail.png |
| F82 | contested | Messaging is a static "Conversation 0" with no compose or thread affordance | S1 | 0.7 | D2 | wayfinding | c-19-messages-empty.png |
| F88 | contested | Decision detail: two $850 options, no image, no confirm | S1 | 0.7 | D3 | trust | c-18-decision-detail.png |
| F106 | verified | Dark mode: no Pay button in sight | S1 | 0.7 | H2 | purchase | d-08-invoice-detail.png |
| F116 | contested | An $850 choice is one tap and irreversible | S1 | 0.7 | H3 | trust | c-17-decisions-list.png, c-18-decision-detail.png |
| F146 | verified | Provenance layer renders empty on every product | S1 | 0.7 | U3 | trust | g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png |
| F94 | contested | Messaging is a dead stub — no compose, no thread | S1 | 0.65 | D3 | content | c-19-messages-empty.png |
| F57 | contested | Studio rows unreachable by VoiceOver | S1 | 0.625 | D1,H2 | reach | c-06b-studio-awaiting-you.png, c-06d-studio-money-documents.png, d-07-proposal-detail.png |
| F110 | verified | "0 IN AR" counts a feature that cannot exist | S1 | 0.6 | H3 | trust | d-06-room-detail.png, g-28b-room-view.png |
| F119 | verified | Quiz payoff ends without a door to the pieces | S1 | 0.6 | U1 | return | g-08-quiz-result.png, g-08b-quiz-result-scrolled.png |
| F149 | contested | The Saved door vanishes for pieces saved from Browse | S1 | 0.6 | U3 | wayfinding | c-05-companion-panel-client.png |
| F44 | verified | A colour decision shows no colour | S2 | 0.912 | D1,D2,H2,U3 | content | c-17-decisions-list.png, c-18-decision-detail.png |
| F159 | verified | Filter row clips "Storage" to "Stor" at XXL | S2 | 0.9 | H1,H3,U3 | reach | x-03-browse-pieces.png |
| F161 | verified | A finished project sorts above active ones | S2 | 0.9 | D1,H2 | wayfinding | c-07-projects-list.png, x-02b-projects-list-bonus.png |
| F163 | verified | Coach marks cover the card they describe | S2 | 0.9 | H1,H3 | wayfinding | g-09-home-tour-step1.png, g-10-home-tour-step2.png, g-11-companion-intro-card.png (+1 more) |
| F164 | verified | Overdue flag dropped on the decisions list | S2 | 0.9 | D1 | return | c-06b-studio-awaiting-you.png, c-17-decisions-list.png |
| F174 | verified | Saved opens on an empty "Boards" tab | S2 | 0.9 | H1 | wayfinding | c-22-saved-signed-in.png, g-21-saved-empty-boards-tab.png, g-22-saved-one-piece.png |
| F175 | verified | Request sheet offers a scan it cannot take | S2 | 0.9 | H1 | wayfinding | c-33-engaged-design-request-again.png, g-30-designer-consultation.png, x-06-design-request.png |
| F176 | verified | Headings scroll under the status-bar clock | S2 | 0.9 | H1 | reach | g-36b-profile-guest-scrolled.png, g-40b-home-active-room-clipped.png, x-02-profile-studio-rows.png |
| F177 | verified | Room summary renders light inside dark mode | S2 | 0.9 | H1 | reach | d-01-home-top.png, d-06a-room-summary-light-locked.png |
| F180 | verified | Saved opens on the empty tab | S2 | 0.9 | H2 | wayfinding | c-22-saved-signed-in.png, c-22b-saved-all-items.png |
| F184 | verified | Three icon systems in three stacked buttons | S2 | 0.9 | H3 | trust | g-02-first-screen-after-splash.png |
| F185 | verified | Tour's middle step never renders | S2 | 0.9 | H3 | content | g-09-home-tour-step1.png, g-10-home-tour-step2.png |
| F186 | verified | Says "Today" but never reads the hour | S2 | 0.9 | H3 | return | c-03-home-top-activeproject.png, g-12-home-discovering-top.png |
| F188 | verified | "Today" reads the same at 7:40am and 9pm | S2 | 0.9 | U1 | content | c-03-home-top-activeproject.png, g-12-home-discovering-top.png |
| F193 | verified | Room stats show undefined abbreviations | S2 | 0.9 | U2 | content | c-24-room-detail.png, d-06-room-detail.png, g-28b-room-view.png |
| F195 | verified | One screen ignores the dark-mode override entirely | S2 | 0.9 | U2 | content | d-01-home-top.png, d-06-room-detail.png, d-06a-room-summary-light-locked.png |
| F160 | verified | 'Get design help' offered to a client with a designer | S2 | 0.85 | H2,H3,U1 | content | c-21-notifications-signed-in.png, d-10-notifications.png |
| F168 | verified | No way to share a room/board/status; no household or second-person concept | S2 | 0.85 | D2 | reach |  |
| F171 | verified | Raw internal column "CLIENT VIEW / Milestone" shown to client | S2 | 0.85 | D3 | content | c-08-project-detail.png |
| F172 | verified | Companion bubble clips the "Sign proposal" button | S2 | 0.85 | D3 | wayfinding | c-11-proposal-detail-scrolled.png, c-11b-proposal-sign-act.png |
| F179 | verified | Dimensions and lead time never shown | S2 | 0.85 | H2 | trust |  |
| F190 | verified | Return has no instrumentation beyond app_open | S2 | 0.85 | U1 | return |  |
| F191 | verified | Coach-mark bubble hides the element it describes | S2 | 0.85 | U2 | content | g-09-home-tour-step1.png |
| F192 | verified | Filter chips imply catalog-wide scope but only filter one loaded page | S2 | 0.85 | U2 | content | g-16-filter-chip-seating.png |
| F194 | verified | One action is offered under three different names, stacked | S2 | 0.85 | U2 | wayfinding | c-24-room-detail.png, d-06-room-detail.png, g-28b-room-view.png |
| F196 | verified | Filters are client-side over twenty rows | S2 | 0.85 | U3 | purchase | g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png |
| F197 | verified | Saved rows carry no note, room or save date | S2 | 0.85 | U3 | return | c-22b-saved-all-items.png |
| F198 | verified | Shipping push exists but never reaches a client order | S2 | 0.85 | U3 | return |  |
| F201 | verified | No receipts or payment history in the app | S2 | 0.85 | U3 | return | c-12-invoices-list.png, c-13-invoice-detail.png, c-13b-invoice-detail-scrolled.png |
| F202 | verified | The deposit is for a table the app never shows | S2 | 0.85 | U3 | return | c-08-project-detail.png, c-13b-invoice-detail-scrolled.png |
| F158 | verified | An unexplained percentage is the only progress signal | S2 | 0.833 | H1,H3,U1 | trust | c-26-profile.png, g-08-quiz-result.png, g-15-browse-pieces-grid.png (+2 more) |
| F165 | verified | Onboarding never frames the app as where a client works with their designer | S2 | 0.8 | D2 | wayfinding | g-02-first-screen-after-splash.png, g-09-home-tour-step1.png, g-11-companion-intro-card.png |
| F167 | verified | The one push permission prompt fires silently, unexplained, unrelated to money | S2 | 0.8 | D2 | return |  |
| F169 | verified | Shared links can't open the app even when installed (no associated domains) | S2 | 0.8 | D2 | reach |  |
| F178 | verified | The tour's save-loop step never renders | S2 | 0.8 | H1 | wayfinding | g-09-home-tour-step1.png, g-10-home-tour-step2.png |
| F187 | verified | Room summary ignores dark mode | S2 | 0.8 | H3 | content | d-06-room-detail.png, d-06a-room-summary-light-locked.png |
| F199 | verified | Push routes exist for money that nothing emits | S2 | 0.8 | U3 | wayfinding |  |
| F162 | verified | No way to compare two pieces side by side | S2 | 0.775 | D3,H2 | wayfinding |  |
| F170 | verified | Notes field exists in data, never exposed in UI | S2 | 0.75 | D3 | content |  |
| F183 | verified | The link I'd share opens the wrong app under the wrong name | S2 | 0.75 | H2 | trust | g-19-share-sheet.png |
| F200 | verified | No payment marks before the Checkout hand-off | S2 | 0.7 | U3 | trust | c-13b-invoice-detail-scrolled.png |
| F189 | verified | Two silent fourteen-day decays punish absence | S2 | 0.65 | U1 | content | c-31-engaged-home-top.png |
| F173 | verified | sign_proposal sends no confirmation email | S2 | 0.6 | D3 | trust |  |
| F166 | contested | The cheapest, most binding client act (a decision) has no confirmation step | S2 | 0.55 | D2 | trust | c-11c-sign-sheet.png, c-18-decision-detail.png |
| F181 | contested | Saved can disappear from my only nav menu | S2 | 0.55 | H2 | wayfinding | c-05-companion-panel-client.png |
| F182 | verified | AR can never work — usdz_url is always null | S2 | 0.55 | H2 | trust | c-24-room-detail.png |
| F203 | verified | Saved renders the price as "$4200" | S3 | 0.95 | H1,H3,U3 | content | c-22b-saved-all-items.png, g-15-browse-pieces-grid.png, g-22b-saved-all-items.png |
| F206 | verified | Launch screen is blank white, no wordmark | S3 | 0.95 | D2 | trust | g-01-splash.png |
| F208 | verified | "Sign in" drawn as a circle, label overflowing | S3 | 0.95 | H1 | content | g-29-notifications-guest.png |
| F205 | verified | "Installation & Styling" truncated to the verb "Install" | S3 | 0.9 | D1 | content | c-07-projects-list.png, c-08-project-detail.png |
| F210 | verified | Coach-mark buttons use the app's only system blue | S3 | 0.9 | U2 | content | g-09-home-tour-step1.png, g-10-home-tour-step2.png |
| F211 | verified | Price format changes between the grid and Saved | S3 | 0.9 | U2 | content | g-22b-saved-all-items.png |
| F06 | verified | Photographs do not match the pieces | S3 | 0.892 | D1,D3,H1,H3,U2,U3 | trust | c-22b-saved-all-items.png, g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png (+1 more) |
| F204 | verified | Launch screen is blank white, no wordmark | S3 | 0.85 | H1,H3 | content | g-01-splash.png, g-02-first-screen-after-splash.png |
| F209 | verified | 'Today' never becomes 'good evening' | S3 | 0.8 | H2 | content | c-03-home-top-activeproject.png, d-01-home-top.png |
| F213 | verified | Marketplace copy says "curated" | S3 | 0.8 | U3 | content | g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png |
| F207 | verified | Companion intro pre-empts first-launch tour step 2 | S3 | 0.75 | D2 | wayfinding | g-09-home-tour-step1.png |
| F212 | verified | The Companion's own headline changes wording for the same panel | S3 | 0.7 | U2 | content | d-09-companion-panel.png, g-14b-companion-next-steps.png, x-09-companion-panel.png |

---

## Detail

### F05 — Browse grid renders off-canvas, unreadable cards [verified]

**Severity:** S0 · **Confidence:** 0.95 · **Class:** purchase · **Seats:** D1, D3, H1, H3, U2, U3

"Browse pieces / 10 pieces curated for your space" (g-15): the left column's card is cropped by the screen edge — its title reads "...M & BOARD" / "...rloom Oak" / "...ing Table" / ",200" with no left half visible — while the right column's card is a normal full 46%-match chair card. Under the "Seating" filter (g-16) three cards of visibly different heights overlap each other, and the third card renders as a flat brown gradient tile with no product image at all.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:134-147; apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:197-210; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift:30-35

Shots: d-03-browse-pieces.png, g-15-browse-pieces-grid.png, g-15b-browse-grid-settled.png, g-16-filter-chip-seating.png, x-03-browse-pieces.png

### F20 — Portal instruction for me rendered to my client [verified]

**Severity:** S0 · **Confidence:** 0.95 · **Class:** trust · **Seats:** D1

The client's own project screen carries a boxed line reading "Set up phases, payments, and FF&E in the portal →" — an instruction written for the designer, displayed to the homeowner. It is a StaticText, not a button, so it looks tappable and is not.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:108-126; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:128-151

Shots: c-08-project-detail.png

### F27 — Auth wall lands at the last tap, no escape [verified]

**Severity:** S0 · **Confidence:** 0.95 · **Class:** trust · **Seats:** H1

After four screens of the design-request flow, "Send request" throws the full gate — "PATINA / Welcome home / Start with a piece you love" — as a sheet with no Cancel, no ✕ and no "Look around first"; the same sheet reached from the sign-in path does have a Cancel. Nothing in the flow said an account would be needed.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Authentication/Views/AuthSheet.swift:21-43; apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:100-112

Shots: g-31-design-request-step1.png, g-33-after-send-request.png, g-35-auth-wall-no-dismiss.png

### F30 — Today shows 1 of 4 pending items, not the money [verified]

**Severity:** S0 · **Confidence:** 0.95 · **Class:** return · **Seats:** H2

Home shows exactly four blocks: date, 'NEXT MOVE / Review a project decision / 2 decisions need your eye.', the editorial story, and 'ACTIVE ROOM'. My Studio hub (Profile → scroll) says '4 things need your eye': 2 overdue decisions, a $4,250.00 invoice due Sep 1, and an $18,500.00 proposal expiring Sep 8. Only the decisions surface on Today. The invoice and the proposal — the two items with real deadlines and real dollars — are invisible unless I go find Profile and scroll.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:48-55; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:95-118; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-159

Shots: c-03-home-top-activeproject.png, c-06b-studio-awaiting-you.png

### F34 — Two weeks away looks exactly like two minutes away [verified]

**Severity:** S0 · **Confidence:** 0.95 · **Class:** return · **Seats:** H2

After a full force-quit and relaunch, my home screen is byte-identical to the one before I left — same Next Move, same story, same 'Living Room' card. Nothing marks the gap: no last-visit timestamp, no 'while you were away,' no unread marker anywhere on the screen.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:48-55; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:95-118; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-159

Shots: c-03-home-top-activeproject.png, c-29-relaunch-returning-client.png

### F37 — Today hides the four things awaiting the client [verified]

**Severity:** S0 · **Confidence:** 0.95 · **Class:** return · **Seats:** U1

The signed-in home shows one line about work — "2 decisions need your eye." — while two levels down the Studio reads "4 things need your eye" with "Decisions / 2 project choices are ready / Overdue · Aug 22", "Invoice / $4,250.00 remaining / Due Sep 1" and "Proposal / Aspen Loft — Living Room Refresh / Review by Sep 8".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:48-55; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:95-118; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-159

Shots: c-04-home-scrolled-studio-rows.png, c-06b-studio-awaiting-you.png

### F09 — The designer is named once, on the bill [verified]

**Severity:** S0 · **Confidence:** 0.938 · **Class:** trust · **Seats:** D1, D3, H2, H3

In the whole signed-in app the designer appears exactly once — "Aspen Loft Refresh · from Leah Hartwell" on the invoice detail, followed by an unattributed heading "A NOTE FROM YOUR DESIGNER". No photograph, no studio name, no bio, no credentials, no contact affordance — not on the home, the project, the proposal, or the decisions. Elsewhere the word "designer" appears only in empty states: "Updates from your designer will land here."

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:70; apps/mobile/Patina/Patina/Features/Projects/Views/StudioIdentityLine.swift:18-40; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:89-91; supabase/migrations/00320_studio_branding_read_and_logos.sql:77-99; supabase/migrations/00030_add_is_designer_to_profiles.sql:9; supabase/seed/dev-accounts.sql:109-121

Shots: c-03-home-top-activeproject.png, c-08-project-detail.png, c-13-invoice-detail.png, c-13b-invoice-detail-scrolled.png, c-19-messages-empty.png, c-21-notifications-signed-in.png

### F12 — Buying ends at "Add to Room / Saved ✓" [verified]

**Severity:** S0 · **Confidence:** 0.938 · **Class:** purchase · **Seats:** D1, H1, H3, U3

The terminus of every browse path is a single primary button labelled "Add to Room", which becomes "Saved ✓", with only a back chevron, "?", Share and ♥ above it. There is no cart, no checkout, no "Buy", no "Request a quote", no vendor link and no `source_url` anywhere in the app; the only Stripe rail belongs to designer invoices. On the backend `direct_orders`, `create_direct_order` and the `direct_order_id` checkout branch are fully built and have zero iOS callers.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:338-399; supabase/migrations/00276_direct_orders.sql:41-63

Shots: g-15-browse-pieces-grid.png, g-17-piece-detail-top.png, g-20-card-more-menu.png

### F13 — Only the date changes from one morning to the next [verified]

**Severity:** S0 · **Confidence:** 0.933 · **Class:** return · **Seats:** H1, H3, U1

'WEDNESDAY - AUG 26' / 'Today' / MAKER SPOTLIGHT 'The Grain Whisperer of Maine' - the identical editorial story and the identical four-block layout appear on the guest home, the engaged home, the signed-in client home, the dark-mode home and after every relaunch; the story never rotates (the app fetches LIMIT 1 from editorial_stories, which holds 3 rows). The Next Move card does vary by engagement tier ('Bring your first room into Patina' for guest/engaged, 'Review a project decision' for activeProject) but not from one morning to the next within a tier.

*As originally filed: "WEDNESDAY · AUG 26" / "Today" / NEXT MOVE "Bring your first room into Patina" / MAKER SPOTLIGHT "The Grain Whisperer of Maine" — the identical Next Move, identical story and identical layout appear on the guest home, the guest home an hour later, the signed-in client home, the dark-mode home and the final frame of the program.*

*Corrections applied from: observation←Repro (35), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:48-55; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:95-118; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-159

Shots: c-03-home-top-activeproject.png, c-29-relaunch-returning-client.png, d-00-current-state-before-dark.png, d-01-home-top.png, final-handoff-state.png, g-12-home-discovering-top.png, g-39-home-after-idle.png

### F01 — Sharing a piece hands over the designer portal [verified]

**Severity:** S0 · **Confidence:** 0.929 · **Class:** trust · **Seats:** D1, D2, D3, H1, H3, U1, U3

The iOS share sheet from a product card shows "Patina Designer Portal" / "app.patina.cloud" as the thing being shared.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Shared/PatinaPortalLinks.swift:14-22; apps/mobile/Patina/Patina/Patina.entitlements:4-11

Shots: g-19-share-sheet.png

### F02 — Proposals list mislabels an accepted proposal "SIGNED" [verified]

**Severity:** S0 · **Confidence:** 0.925 · **Class:** trust · **Seats:** D1, D2, D3, H2, H3, U3

"SIGNED (1)" headers a card reading "Sample accepted proposal / $100,000.00"; the seed data has zero signed proposals — the proposal's actual status is accepted. Two screens away, the Studio hub's own "Money & documents" block correctly reads "2 shared proposals / 1 accepted."

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalListView.swift:59; apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalListView.swift:165-172; apps/mobile/Patina/Patina/Features/Proposals/ViewModels/ProposalsViewModel.swift:26-28; supabase/migrations/00063_proposal_system_v2.sql:45-46

Shots: c-09-proposals-list.png, c-19-messages-empty.png

### F08 — Notifications empty while four items are due [verified]

**Severity:** S0 · **Confidence:** 0.92 · **Class:** return · **Seats:** D1, D3, H3, U1, U3

The bell reads "Nothing yet" / "Updates from your designer will land here." on the same device, the same minute, that the Studio lists "Decisions — 2 project choices are ready / Overdue · Aug 22", "Invoice — $4,250.00 remaining / Due Sep 1" and "Proposal — Aspen Loft — Living Room Refresh / Review by Sep 8".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/NotificationsAPIClient.swift:57-62; supabase/migrations/00388_proposal_send_dispatch_guard.sql:1258-1278; supabase/migrations/00397_billing_checkout_integrity.sql:864-870; supabase/seed/proposals.sql:117-121

Shots: c-06b-studio-awaiting-you.png, c-21-notifications-signed-in.png, d-10-notifications.png

### F03 — The signature sheet restates nothing [verified]

**Severity:** S0 · **Confidence:** 0.917 · **Class:** trust · **Seats:** D1, D2, D3, H2, H3, U3

The e-signature sheet shows "SIGN PROPOSAL", the project title, "Type your full name to e-sign. Signing confirms the scope and kicks off your project.", a "Full name" field, a disabled "Sign proposal" button and "Cancel". It restates no amount, no line items, no terms, no date and offers no agreement checkbox — while the terms one screen back read "Deposits are non-refundable once procurement begins. Custom items are final sale." and the total is $18,500.00.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalSignSheet.swift:13-77

Shots: c-11-proposal-detail-scrolled.png, c-11c-sign-sheet.png, x-05-proposal-detail.png

### F16 — Two weeks away looks like one hour away [verified]

**Severity:** S0 · **Confidence:** 0.917 · **Class:** return · **Seats:** H1, H3, U1

A relaunch drops the signed-in client on a byte-identical "Today": no welcome-back, no unread marker, no last-visit timestamp, no activity feed. No last-seen timestamp exists for the feed, the story, the room or the saved list anywhere in the app; ContextMemoryStore records only a coarse activity kind and is off until the user turns it on. Two silent time-based changes are never explained: a matched request card disappears on day fifteen, and the Companion graduates to its calm state at fourteen days.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:48-55; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:95-118; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-159

Shots: c-03-home-top-activeproject.png, c-29-relaunch-returning-client.png, d-01-home-top.png, g-12-home-discovering-top.png

### F10 — The engaged home is the guest home [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** return · **Seats:** D1, H1, H3, U1

For an account whose design-request lead was accepted and claimed on Aug 18, and which already uploaded a room scan, the home reads "NEXT MOVE / Bring your first room into Patina / A short scan gives the Companion a real space to work from." The Companion panel has no "Your studio" row at all, the Studio shows five zeroes — "In progress 0 / No active projects yet.", "Conversation 0", "Money & documents 0 / No shared records yet.", "Archive 0" — under the heading "Nothing needs your attention right now.", and the two-step first-launch tour re-fires.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:733-740; apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:396-404; apps/mobile/Patina/Patina/Core/State/EngagementTier.swift:111-125; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:80-91; supabase/seed/leads_room_scans.sql:119-126

Shots: c-31-engaged-home-top.png, c-32-engaged-companion.png, c-32b-engaged-profile-studio.png, c-32c-engaged-studio-rows.png

### F11 — Money rail sits behind an unlabelled monogram [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** D1, D3, H2, H3

The signed-in home is four elements - Next Move, editorial story, 'ACTIVE ROOM / Living Room', Companion orb - and does not scroll. Proposals, Invoices, Budget, Decisions and Projects live three acts away, behind a 36pt monogram avatar in the top-right corner (the account's initial, accessibility label 'Profile'), then a scroll, then the 'STUDIO' block.

*As originally filed: The signed-in home is four elements — Next Move, editorial story, "ACTIVE ROOM / Living Room", Companion orb — and does not scroll further. Proposals, Invoices, Budget, Decisions and Projects live three acts away, behind a 36 pt unlabelled brown circle in the top-right corner, then a scroll, then the "STUDIO" block.*

*Corrections applied from: observation←Repro (35), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:104-145; apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomStateBlocks.swift:25-45; apps/mobile/Patina/Patina/Features/Home/Views/DailyGreetingHeader.swift:59-99

Shots: c-03-home-top-activeproject.png, c-04-home-scrolled-studio-rows.png, c-04b-your-studio-hub.png, c-06b-studio-awaiting-you.png

### F17 — Dimensions and lead time exist nowhere [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** purchase · **Seats:** H1, H3

The piece surface carries maker, name, materials as a joined subtitle, price, an "{n}% match" pill, provenance chips and a maker story. It carries no dimensions, no lead time, no stock, no shipping, no returns policy, no description and no link to the maker's own page. `products.dimensions JSONB` exists in the schema and is neither returned by `get_recommendations` nor decoded by the app.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:12-58; supabase/migrations/00001_initial_schema.sql:35; supabase/migrations/00246_aesthete_quiz_bridge.sql:273-300; apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift:97

Shots: g-15-browse-pieces-grid.png, g-22b-saved-all-items.png

### F19 — No order object anywhere in the client app [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** return · **Seats:** H3, U3

"Where is it?" resolves only to project, proposal, invoice and decision state. The project detail is three stats ("BUDGET $120,000", "STATUS In Progress", "CLIENT VIEW Milestone"), an "Invoices / View and pay your invoices" row and a portal link — no items, no orders, no deliveries, no dates.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift:12-36; supabase/migrations/00276_direct_orders.sql:41-67

Shots: c-06b-studio-awaiting-you.png, c-08-project-detail.png, c-13b-invoice-detail-scrolled.png

### F22 — A direct order would credit the designer nothing [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** purchase · **Seats:** D1

public.direct_orders carries id, client_id, product_id, product_name, quantity, unit_price_cents, amount_cents, currency, status, stripe ids, shipping, created_at, paid_at — and no designer_id, no project_id, no commission_rate and no FF&E link. The platform's own migration states it: "No designer attribution (client_id is the buyer)". The earnings ledger credits from invoice_payments only.

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00276_direct_orders.sql:41-67; supabase/migrations/00301_marketplace_vitals.sql:37-40

### F23 — Guest's room and taste portrait adopted by the account [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** trust · **Seats:** D1

After a guest session, client@patina.dev — an account with zero rooms and zero saved items server-side — shows "ACTIVE ROOM / Living Room" on Today, "1 ROOM" and "1 SAVED PIECE" in the Companion, and "✦ Modern Warmth / 1 ROOMS / 1 SAVED" on Profile. Your Spaces flags the same room "SAVED ON THIS PHONE" while every other surface counts it as account data. It cleared only when the local store was wiped.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:190-195; apps/mobile/Patina/Patina/Core/Persistence/LocalStoreReset.swift; apps/mobile/Patina/Patina/Core/Persistence/RoomStore.swift

Shots: c-03-home-top-activeproject.png, c-23-your-spaces.png, c-26-profile.png, c-34-final-state-signed-in-client.png

### F24 — "Get design help" from an already-matched client files an indistinguishable second lead [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** D2

For the engaged account (a lead accepted 8 days ago per the seed), 'Studio → Get design help' opens 'Your design request / No scans on this phone yet / You can scan a room to attach — or request design help without one below', with 'Request without a scan' as the only act — a brand-new lead-intake form, not a status view or a message to the existing designer.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:733-740; apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift:60-99; apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:125-138

Shots: c-33-engaged-design-request-again.png

### F25 — Engaged client's home/Companion show zero trace of the accepted designer [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** trust · **Seats:** D2

The engaged account's home Next Move reads "Bring your first room into Patina / A short scan gives the Companion a real space to work from" — byte-identical to the guest/discovering pitch — and the Companion panel offers "Add your first space / Retake the quiz / Your recommendations / Your profile" with no "Your studio" row at all, for a homeowner whose lead was accepted 8 days ago and who already uploaded a scan.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:733-740; apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:396-404; apps/mobile/Patina/Patina/Core/State/EngagementTier.swift:111-125; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:80-91; supabase/seed/leads_room_scans.sql:119-126

Shots: c-31-engaged-home-top.png, c-32-engaged-companion.png

### F26 — Buy-now backend built with zero designer attribution [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** purchase · **Seats:** D3

public.direct_orders (00276_direct_orders.sql) is a complete, wired buy-now rail — create_direct_order RPC, create-checkout-session dispatch, stripe-webhook settle branch, receipt emails — with columns id, client_id, product_id, product_name, quantity, unit_price_cents, amount_cents, status, stripe ids, shipping. No designer_id, no project_id, no commission_rate. 00301_marketplace_vitals.sql states outright: "No designer attribution (client_id is the buyer)." Zero iOS client code references it.

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00276_direct_orders.sql:41-67; supabase/migrations/00301_marketplace_vitals.sql:37-40

### F28 — A returning guest is dumped at "Welcome home" [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** return · **Seats:** H1

After a relaunch the guest lands on the gate reading "Welcome home" / "Start with a piece you love" with the session, the quiz progress and the room gone; the saved piece and the coach-mark flags do survive, and Profile still shows the "Warm Modern" badge while the Companion on that same launch says "Style quiz / DISCOVER YOUR STYLE" and "Your recommendations / TAKE THE QUIZ FIRST".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:173-197; apps/mobile/Patina/Patina/Features/RoomScan/Shared/Services/StyleProfileStore.swift:29-45; apps/mobile/Patina/Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:288

Shots: g-38-relaunch-returning-guest.png, g-40-companion-inconsistent-persistence.png, s-04-relaunch-guest-persist.png

### F29 — Guest room and saves follow the next account in [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H1

The room typed and the piece saved as a guest appeared under client@patina.dev — "ACTIVE ROOM / Living Room", "1 ROOM", "1 SAVED PIECE", the badge "✦ Modern Warmth" and "1 ROOMS" — for an account with zero rooms and zero saved items server-side; "Your Spaces" flags the same room "SAVED ON THIS PHONE" while every other surface counts it as account data, and it disappeared only when the local store was cleared.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:190-195; apps/mobile/Patina/Patina/Core/Persistence/LocalStoreReset.swift; apps/mobile/Patina/Patina/Core/Persistence/RoomStore.swift

Shots: c-03-home-top-activeproject.png, c-05-companion-panel-client.png, c-26-profile.png, c-34-final-state-signed-in-client.png

### F36 — Guest's day-one work is gone on day two [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** return · **Seats:** U1

After a force-quit the guest lands back on "Welcome home" / "Start with a piece you love" with the quiz, the portrait and the session discarded — while the Companion on that same launch still lists "Style quiz / DISCOVER YOUR STYLE" and "Your recommendations / TAKE THE QUIZ FIRST" and Profile still shows the "Warm Modern" badge.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:173-197; apps/mobile/Patina/Patina/Features/RoomScan/Shared/Services/StyleProfileStore.swift:29-45; apps/mobile/Patina/Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:288

Shots: g-38-relaunch-returning-guest.png, g-40-companion-inconsistent-persistence.png

### F38 — No money or decision event can send a push [verified]

**Severity:** S0 · **Confidence:** 0.9 · **Class:** return · **Seats:** U1

Notifications reads "Nothing yet" / "Updates from your designer will land here." while the Studio shows an overdue decision, a $4,250.00 invoice due Sep 1 and a proposal to review by Sep 8; `apns-send` has five callers and not one touches invoices, proposals, decisions or orders.

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/functions/notification-dispatch/index.ts:183-186; supabase/functions/invoice-reminders/index.ts:17-45; supabase/migrations/00092_decision_cron.sql:16-19

Shots: c-06b-studio-awaiting-you.png, c-21-notifications-signed-in.png

### F07 — Push never fires for proposals, invoices or decisions [verified]

**Severity:** S0 · **Confidence:** 0.883 · **Class:** return · **Seats:** D1, D2, H1, H2, H3, U3

No APNs push fires for a proposal, an invoice, a decision or a direct order — apns-send's only callers are three design-request triggers, fulfillment-notify (operator-initiated, BOH rail) and site-request-dispatch. Email reminders to the client DO exist and are cron-scheduled (invoice-reminders daily, decision-reminders daily, proposal-nudge), so the gap is the phone, not the client.

*As originally filed: apns-send is complete and provisioned, with exactly five callers: three design-request SQL triggers, fulfillment-notify (operator-initiated, on the BOH designer-sourced rail) and site-request-dispatch. Zero push callers touch invoices, proposals, decisions or direct_orders; notification-dispatch accepts channel "push" and writes a log row instead.*

*Corrections applied from: observation←Code-truth (33), refs←Code-truth (33)*

Refs: supabase/functions/apns-send/index.ts; supabase/functions/notification-dispatch/index.ts:183-186; supabase/functions/invoice-reminders/index.ts:17-45; supabase/migrations/00181_invoice_reminders_cron.sql:4-30; supabase/migrations/00092_decision_cron.sql:16-19

Shots: c-21-notifications-signed-in.png, c-29-relaunch-returning-client.png, d-10-notifications.png, g-29-notifications-guest.png

### F14 — Saved has no door until something is already saved [verified]

**Severity:** S0 · **Confidence:** 0.867 · **Class:** wayfinding · **Seats:** H1, H3, U1

With zero saved items the Companion panel lists "Add your first space", "Retake the quiz", "Your recommendations", "Your studio", "Your profile" — no "Saved" row, confirmed by scan_ui before and after adding a room; the row only appears once a count is non-zero ("Saved / 1 SAVED PIECE").

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Companion/Services/CompanionActionRows.swift:217-222; apps/mobile/Patina/Patina/Features/Companion/Services/CompanionAreaBuilders.swift:28-49

Shots: c-05-companion-panel-client.png, d-09-companion-panel.png, g-14b-companion-next-steps.png, x-09-companion-panel.png

### F15 — No way to put a piece into a room [verified]

**Severity:** S0 · **Confidence:** 0.85 · **Class:** return · **Seats:** H1, H3, U2

The card ⋯ menu offers only "Save", "Share", "Not for me", "View details" — no "Add to room" — including when the grid is entered from the room's own "Browse Picks for This Room" button, which opens the same unfiltered "10 pieces curated for your space" with no room name. The room meanwhile reads "A blank canvas" / "We've already found pieces that would fit this space. Browse your Daily Room to start building this room." and counts "0 ITEMS".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/AddToRoomSheet.swift; apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:304-335

Shots: g-20-card-more-menu.png, g-27c-card-menu-in-room-context.png, g-28b-room-view.png

### F18 — 18 × 14 ft is stored as 59' × 46' [contested]

**Severity:** S0 · **Confidence:** 0.75 · **Class:** trust · **Seats:** H1, H3

With the toggle reading "ft", LENGTH 18 and WIDTH 14 were typed; the next screen — "YOUR SPACE / Here's what I see." — returned a room of "46 ft" × "59 ft" and "2713 SQUARE FEET", and those figures persist into the room view ("Living Room / 2713 SQ FT · 2 WINDOWS", "59' × 46'"), Your Spaces, and the home's ACTIVE ROOM card.

Refs: apps/mobile/Patina/Patina/Features/Rooms/Views/ManualRoomEntryView.swift

Shots: c-24-room-detail.png, d-06a-room-summary-light-locked.png, g-25-manual-room-entry-metric.png, g-27-room-with-recommendations.png, g-28b-room-view.png, g-40b-home-active-room-clipped.png

**Contested** —
- REFUTED by Repro (35): Not reproducible. I opened manual room entry without touching the ft/m toggle and got the reported 59ft x 46ft / 2713 SQUARE FEET - then found the cause. The unit selection is persisted in UserDefaults under 'patina.scan.manual_entry.unit' and restored on appear (ScanFallbackEntryView.swift:70-73); plutil on the simulator container shows that key set to "m", left there by an earlier walk lane. The toggle was therefore on METRES, not 'ft', and the app was correctly reading 18m x 14m -> 59ft x 46ft = 2713 sq ft. Zooming the toggle in the walk's own geometry confirms the app renders the selected unit in near-black and the unselected one in light tan: my first pass showed 'm' dark, and after one tap on 'ft' the same pixels showed 'ft' dark. I then re-ran the identical entry with 'ft' selected: the summary read '18 ft' x '14 ft' / '252 SQUARE FEET'. There is no feet-to-metres conversion bug. The real defects in this area belong to F40 (see its adjusted note): a 6x13pt unit control, colour-only selection state, no unit suffix on the LENGTH/WIDTH fields, and a silently persisted unit choice that survives relaunch and account switch. Probes: probe/F40-manual-room-entry-unit-toggle.png + probe/_zoom-unit-toggle.png (m selected), probe/_p-after-continue.png (2713 sq ft), probe/_zoom-unit-toggle-ft.png (ft selected after one tap), probe/F18-room-summary-with-ft-selected.png (252 sq ft, correct).
- CONFIRMED by Code-truth (33): Standing verification (b): the manual room entry does NOT convert feet as meters. The screen the walk actually used is ScanFallbackEntryView (RoomScan), not ManualRoomEntryView (Rooms) — the cited file has no ft/m toggle, no steppers and no emoji, and its label reads 'Dimensions (feet)'. ScanFallbackEntryView.submit() converts CORRECTLY: unit == .feet ? (l/3.28084, w/3.28084) : (l, w) (:265-270), and every downstream surface stores metres and prints feet (RoomCreationCoordinator:112-114 x0.3048; SpatialMetadataRow:46-50 /0.3048). 59'x46' from 18x14 is only reachable with the toggle on 'm' — which the guest lane says it tapped. The REAL defect is the toggle, and it is worse than filed: 'ft'/'m' are bare Text buttons whose only activation feedback is a muted->primary colour change, the fields carry no unit suffix, and the choice PERSISTS in UserDefaults key 'patina.scan.manual_entry.unit' and is restored onAppear — so a later session silently starts in metres.
- CONFIRMED by Canon-truth (34): Confirmed real defect (screenshot g-25-manual-room-entry-metric.png shows 'ft / m' toggle, typed 18/14, and the math checks: entering 18/14 while unit==.meters skips conversion, then downstream display multiplies by 3.28084 -> 59.05x45.93ft = ~2713 sqft, matching the finding exactly). BUT evidence.refs cites the wrong file: apps/mobile/Patina/Patina/Features/Rooms/Views/ManualRoomEntryView.swift has NO unit toggle at all (verified at both HEAD and the reviewed commit 3cd84ecb3 - its 'Dimensions' group is hardcoded feet-only, used only for the Rooms-tab NewRoomSheet flow per that file's own header comment). The actual screen in the shot is ScanFallbackEntryView.swift (Features/RoomScan/Views/), which explicitly documents itself as distinct from ManualRoomEntryView to avoid this exact confusion. Its unitToggle (lines ~139-162) and submit() conversion (lines ~265-269: `unit == .feet ? (l/3.28084, w/3.28084) : (l, w)`) verify the claim precisely.

### F21 — No way to message the designer from anywhere [contested]

**Severity:** S0 · **Confidence:** 0.75 · **Class:** trust · **Seats:** D1

The entire messaging surface is a Studio block reading "Conversation 0" and "No project conversations yet." There is no compose field, no thread list, no "message your designer" affordance anywhere in the signed-in app, on any screen.

Refs: apps/mobile/Patina/Patina/Features/Messaging/Views/ThreadListView.swift

Shots: c-19-messages-empty.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED as written. A complete messaging surface ships: ThreadListView (with an inline search field) and ThreadDetailView — whose own header calls it 'Conversation view: bubbles + simple composer' — plus MessagingViewModel and MessagingAPIClient writing comms_threads/comms_messages. A 'Message your designer' Companion row (route .threadList) is offered on project detail, decision detail, documents, notifications and design-requests (CompanionAreaBuilders.swift:219-294). What the walkers saw (c-19) is the Studio hub, not a messages screen: the 'Conversation' block is the only Studio block drawn WITHOUT a chevron, and they never opened .threadList. The defensible finding is narrower: a client cannot START a thread (ThreadListView's empty state CTA is 'Get design help', not 'New message'), the Studio's Conversation block is a dead row, and the home Companion carries no message row.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.
- CONFIRMED by Repro (35): Reproduced live. The entire messaging surface is the Studio block 'Conversation 0' / 'No project conversations yet.' No compose field, no thread list, no 'message your designer' control on any screen I reached in the signed-in app. Probe: probe/F30-studio-awaiting-you.png.

### F33 — No way to message my designer, anywhere [contested]

**Severity:** S0 · **Confidence:** 0.7 · **Class:** return · **Seats:** H2

'Conversation 0 / No project conversations yet.' is the entire messaging surface — one line of grey text, no compose, no thread list, no 'message your designer' button.

Shots: c-19-messages-empty.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED as written. A complete messaging surface ships: ThreadListView (with an inline search field) and ThreadDetailView — whose own header calls it 'Conversation view: bubbles + simple composer' — plus MessagingViewModel and MessagingAPIClient writing comms_threads/comms_messages. A 'Message your designer' Companion row (route .threadList) is offered on project detail, decision detail, documents, notifications and design-requests (CompanionAreaBuilders.swift:219-294). What the walkers saw (c-19) is the Studio hub, not a messages screen: the 'Conversation' block is the only Studio block drawn WITHOUT a chevron, and they never opened .threadList. The defensible finding is narrower: a client cannot START a thread (ThreadListView's empty state CTA is 'Get design help', not 'New message'), the Studio's Conversation block is a dead row, and the home Companion carries no message row.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.
- CONFIRMED by Repro (35): Reproduced live. 'Conversation 0' / 'No project conversations yet.' is the whole messaging surface on the Studio hub - one count and one line of grey text, no compose, no thread list, no 'message your designer'. Probe: probe/F30-studio-awaiting-you.png. Duplicate of F21/F35.

### F35 — No way to say a word to the designer [contested]

**Severity:** S0 · **Confidence:** 0.7 · **Class:** trust · **Seats:** H3

The entire messaging surface is a Studio block reading "Conversation  0" / "No project conversations yet." There is no compose, no thread list, no thread to open and no "message your designer" affordance anywhere in the signed-in app.

Refs: apps/mobile/Patina/Patina/Features/Messaging/Views/ThreadDetailView.swift:266; research/01-shot-ledger.md:144

Shots: c-06b-studio-awaiting-you.png, c-19-messages-empty.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED as written. A complete messaging surface ships: ThreadListView (with an inline search field) and ThreadDetailView — whose own header calls it 'Conversation view: bubbles + simple composer' — plus MessagingViewModel and MessagingAPIClient writing comms_threads/comms_messages. A 'Message your designer' Companion row (route .threadList) is offered on project detail, decision detail, documents, notifications and design-requests (CompanionAreaBuilders.swift:219-294). What the walkers saw (c-19) is the Studio hub, not a messages screen: the 'Conversation' block is the only Studio block drawn WITHOUT a chevron, and they never opened .threadList. The defensible finding is narrower: a client cannot START a thread (ThreadListView's empty state CTA is 'Get design help', not 'New message'), the Studio's Conversation block is a dead row, and the home Companion carries no message row.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.
- CONFIRMED by Repro (35): Reproduced live: 'Conversation 0' / 'No project conversations yet.' with no compose, no thread list, no thread to open, and no 'message your designer' affordance anywhere in the signed-in app. Probe: probe/F30-studio-awaiting-you.png. Duplicate of F21/F33.

### F39 — The nav row back to Saved can vanish for the exact saves the app invites [contested]

**Severity:** S0 · **Confidence:** 0.65 · **Class:** return · **Seats:** U2

The Companion's "Saved" row only appears when tableItemCount > 0, and tableItemCount counts only room-scoped SavedItems (not the TableItemModel rows the piece-detail heart or an unscoped browse-card save actually creates). Saved has no other door anywhere in the app (per code read; the Companion is the sole nav surface, T13).

Refs: apps/mobile/Patina/Patina/Features/Companion/Services/CompanionActionRows.swift:217-223; apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:265

Shots: g-21-saved-empty-boards-tab.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED. The claim rests on tableItemCount being the room-scoped sum written by DailyRoomView:265 — but the Companion never reads that value. CompanionOverlay.enrichedContext OVERWRITES it on every panel open with a live fetchCount(FetchDescriptor<TableItemModel>()) over the whole store (:173-197), and expandedView binds enrichedContext before building the rows (:522-527). The file even documents that updateTableItemCount has no effective callers. A piece hearted on the browse grid or the piece detail therefore DOES surface the Saved row. F14 (no row at zero) is the true version of this finding.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.
- CONFIRMED by Repro (35): Confirmed by code plus a live scan. CompanionActionRows.swift:217-223 returns nil for the 'Saved' row when context.tableItemCount == 0, and DailyRoomView.swift:265 sets that count as viewModel.roomModels.reduce(0) { $0 + $1.items.count } - room-scoped items only, never TableItemModel rows. Live, with 0 saved, scan_ui on the Companion returned five rows and no 'Saved'. The 'no other door' half also holds: the only other .table navigations are MarketplaceLinksSection.swift:40 and DailyRoomStateBlocks.swift:67, and a repo grep shows neither view is referenced by anything (the orphaned July marketplace rail).

### F31 — Every product page fails to load, no way out [verified]

**Severity:** S1 (was S0) · **Confidence:** 0.95 · **Class:** return · **Seats:** H2

Tapping any card - saved or fresh - lands on 'Couldn't load product / Let's try that again.' Retrying repeats the same failure. There is no back button and no chevron; the only other thing on screen is the greyed Companion orb, which scan_ui does not report and which does not read as an escape, though it opens and offers a 'Home / Back to your space' row.

*As originally filed: Tapping any card — saved or fresh — lands on 'Couldn't load product / Let's try that again.' Retrying repeats the same failure. There is no back button, no chevron, nothing else on screen.*

*Corrections applied from: severity←Repro (35), observation←Repro (35), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:99; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:36-44; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:413-430

Shots: c-25-piece-detail-client.png

### F32 — Buy it — the dead end, verbatim [verified]

**Severity:** S1 (was S0) · **Confidence:** 0.95 · **Class:** purchase · **Seats:** H2

My actual dead end, verbatim, is 'Couldn't load product' / 'Let's try that again' - I never got further than the broken load screen. Companion (1 tap) -> 'Your recommendations' (2) -> tap any card (3) -> the wall. Three taps to money, and the wall isn't a wall, it's a failed fetch with no Back - only the greyed Companion orb gets you out. Even reading the code for what the screen would show if it loaded, the terminus is still just 'Add to Room' (which, with no room attached, merely saves), and once tapped, 'Saved OK' - no cart, no checkout, no quote, no vendor link.

*As originally filed: My actual dead end, verbatim, is 'Couldn't load product' / 'Let's try that again' — I never got further than the broken load screen. Companion (1 tap) → 'Your recommendations' (2) → tap any card (3) → the wall. Three taps to money, and the wall isn't a wall, it's a crash. Even reading the code for what the screen would show if it loaded, the terminus is still just 'Add to Room,' and once tapped, 'Saved ✓' — no cart, no checkout, no quote, no vendor link.*

*Corrections applied from: severity←Repro (35), observation←Repro (35), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:338-399; supabase/migrations/00276_direct_orders.sql:41-63

Shots: c-25-piece-detail-client.png

### F71 — Proposal selections carry no prices and no images [verified]

**Severity:** S1 · **Confidence:** 0.95 · **Class:** purchase · **Seats:** D1

The proposal detail's SELECTIONS block renders a thumbnail and a line total for each item, but get_client_proposal_bundle nulls unit_sell_price, line_total_cents and vendor_name for any proposal whose client_visibility_tier is not 'full' — and that column defaults to 'milestone'. The client is therefore asked to e-sign an 'INVESTMENT $18,500.00' with five unpriced, unattributed lines by default.

*As originally filed: Under "SELECTIONS": "Walnut sectional sofa", "Hand-knotted wool rug", "Walnut coffee table", "Reading lounge chair Qty 2", "Floor lamp Qty 2" — each illustrated with the Patina wordmark glyph as a placeholder and priced at nothing, against an "INVESTMENT $18,500.00" that is never broken down.*

*Corrections applied from: observation←Code-truth (33), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailBlocks.swift:126-157; supabase/migrations/00390_proposal_copy_immutability.sql:1622-1650; supabase/migrations/00141_proposal_client_visibility_tier.sql:14-16; supabase/seed/proposals.sql:101-115

Shots: c-10-proposal-detail-top.png, c-11-proposal-detail-scrolled.png

### F81 — Companion orb covers the "Sign proposal" button [verified]

**Severity:** S1 · **Confidence:** 0.95 · **Class:** purchase · **Seats:** D2

On the scrolled proposal detail, the Companion orb sits directly on top of the "Sign proposal" button, clipping its own visible label to "Sign proposa".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/ContentView.swift:166; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/CompanionSafeArea.swift:37-50; apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:33; apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:137-151

Shots: c-11-proposal-detail-scrolled.png

### F102 — The date you need is on the screen you leave [verified]

**Severity:** S1 · **Confidence:** 0.95 · **Class:** wayfinding · **Seats:** H2

'Due Sep 1, 2026' appears on the invoices list, gone on the invoice detail. 'Expires Sep 8' appears on the proposals list, gone on the proposal detail. 'Overdue · Aug 22' appears on the Studio hub, gone on the decisions list.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:225-240; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceListView.swift:189-192

Shots: c-06b-studio-awaiting-you.png, c-09-proposals-list.png, c-10-proposal-detail-top.png, c-12-invoices-list.png, c-13-invoice-detail.png, c-17-decisions-list.png

### F114 — Status bar draws over scrolled content [verified]

**Severity:** S1 · **Confidence:** 0.95 · **Class:** reach · **Seats:** H3

The fixed status bar draws over scrolled content with no inset reserved: "9:41" overprints "Awaiting payment" and "INV-2026-0142" on the invoice, "Invoices / 1 shared invoice" behind the Settings sheet, "Terms" on the proposal, and "Active projects" on the Studio list. At XXL the Dynamic Island pill itself occludes a proposal's title and its "Review by Sep 8" line, and a modal sheet's own "Close" and "Your design request" title.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:34-38; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:38-41; apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:26-31

Shots: c-11c-sign-sheet.png, c-14-pay-handoff.png, c-19-messages-empty.png, c-28-settings-client.png, x-02-profile-studio-rows.png, x-06-design-request.png

### F121 — Home has no Browse, Saved, Studio or designer door [verified]

**Severity:** S1 · **Confidence:** 0.95 · **Class:** wayfinding · **Seats:** U1

`describe_screen` on the signed-in home returns four content elements — Next Move, editorial story, "ACTIVE ROOM", Companion bubble — and swiping up changes nothing; there is no tab bar, no nav bar, no "Browse pieces", no "Saved", no "Get design help" and no Studio row anywhere on the screen.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:104-145; apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomStateBlocks.swift:25-45; apps/mobile/Patina/Patina/Features/Home/Views/DailyGreetingHeader.swift:59-99

Shots: c-04-home-scrolled-studio-rows.png, d-02-home-studio-rows.png, g-13-home-scrolled.png

### F130 — The app owns no surface outside itself [verified]

**Severity:** S1 · **Confidence:** 0.95 · **Class:** return · **Seats:** U1

The Xcode project declares three targets — app, unit tests, UI tests — and no app extension of any kind: no WidgetKit, no ActivityKit, no AppIntent, no NSUserActivity, no local notification, no background refresh.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:177-223; apps/mobile/Patina/Patina/Patina.entitlements:4-11

Shots: c-29-relaunch-returning-client.png

### F04 — Every piece detail fails and traps the user [verified]

**Severity:** S1 (was S0) · **Confidence:** 0.943 · **Class:** purchase · **Seats:** D1, D3, H1, H3, U2, U3

Every product tap in every lane returns 'Couldn't load product' / 'Let's try that again'. Retry fails identically, the edge-swipe back does nothing, and scan_ui returns exactly one interactive element for the whole screen - the retry link. There is no Back chevron. The only way out is the greyed Companion orb, which is not exposed to scan_ui and reads as disabled, but does open and offers a 'Home / Back to your space' row. Root cause: GET /rest/v1/products?id=eq....&select=*,vendors(name,made_in,brand_story) returns HTTP 300 PGRST201 because products carries two foreign keys to vendors (products_retailer_id_fkey, products_vendor_id_fkey).

*As originally filed: Every product tap in every lane returns "Couldn't load product" / "Let's try that again". Retry fails identically, the edge-swipe back does nothing, and `scan_ui` returns exactly one element for the whole screen — the retry link. The only escape is force-quitting the app. Root cause: `GET /rest/v1/products?id=eq.…&select=*,vendors(name,made_in,brand_story)` returns HTTP 300 `PGRST201`, because `products` carries two foreign keys to `vendors`.*

*Corrections applied from: severity←Repro (35), observation←Repro (35), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:99; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:36-44; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:413-430; supabase/migrations/00001_initial_schema.sql:39; supabase/migrations/00011_add_retailer_id.sql:6

Shots: c-22b-saved-all-items.png, c-25-piece-detail-client.png, d-04-piece-detail.png, g-17-piece-detail-top.png, g-17b-piece-detail-after-retry.png, g-17c-after-edge-swipe-back.png, x-04-piece-detail.png

### F41 — Three disagreeing 'things needing attention' counts on one screen [verified]

**Severity:** S1 · **Confidence:** 0.925 · **Class:** trust · **Seats:** D1, D2, D3, H2, H3, U1

The Studio hub header reads "4 things need your eye" and the footer reads "4 THINGS NEED YOUR EYE", directly above a block headed "Awaiting you 3" — while Today and the Companion panel both separately say "2 project decisions waiting."

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueModels.swift:93-103; apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift:26-31; apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift:72-80

Shots: c-03-home-top-activeproject.png, c-05-companion-panel-client.png, c-06b-studio-awaiting-you.png

### F56 — "Your budget" shows one invoice, not the client's real $725,000 across projects [verified]

**Severity:** S1 · **Confidence:** 0.925 · **Class:** trust · **Seats:** D1, D2

"Your budget / ACROSS YOUR PROJECTS" shows "$4,250 BILLED / $0 PAID / $4,250 OUTSTANDING" — the total across this client's three actual projects (Birch Hollow $185,000 + Aspen Loft Refresh $120,000 + Marrow & Vale $420,000) is $725,000, and only one of the three projects appears.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:36-42; apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:104; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:5-24; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:37-52

Shots: c-07-projects-list.png, c-15-budget.png

### F60 — The project screen shows the designer's to-do [verified]

**Severity:** S1 · **Confidence:** 0.925 · **Class:** trust · **Seats:** D3, H3

The client's project screen prints a stat labelled "CLIENT VIEW / Milestone" — the raw `client_visibility_tier` column, shown to the client it governs — and a boxed line reading "Set up phases, payments, and FF&E in the portal →", an instruction written for the designer, rendered to the homeowner, and not a button. The rest of the screen is three stats and an Invoices row, though the app successfully fetched project_phases and the client selections and rendered neither.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:108-126; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:128-151

Shots: c-08-project-detail.png

### F69 — Designer-facing FF&E instruction rendered to the client [verified]

**Severity:** S1 · **Confidence:** 0.925 · **Class:** trust · **Seats:** U1, U3

The homeowner's project screen prints a boxed line reading "Set up phases, payments, and FF&E in the portal →" and a stat labelled "CLIENT VIEW / Milestone", the raw client_visibility_tier value shown to the client it governs. The boxed line is static text, not a button.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:108-126; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:128-151

Shots: c-08-project-detail.png

### F48 — Deadlines shown on list cards vanish on the detail screen the client acts on [verified]

**Severity:** S1 · **Confidence:** 0.913 · **Class:** trust · **Seats:** D1, D2, H3

"Due Sep 1, 2026" appears on the invoices list card and is absent on the invoice detail screen itself; the same pattern reproduces for the proposal ('Expires Sep 8' on the list, dropped on detail) and the decisions ('Overdue · Aug 22' on the Studio hub, dropped on the decisions list).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:225-240; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceListView.swift:189-192

Shots: c-06b-studio-awaiting-you.png, c-09-proposals-list.png, c-10-proposal-detail-top.png, c-12-invoices-list.png, c-13-invoice-detail.png, c-17-decisions-list.png

### F45 — No Sign Out and no Delete Account anywhere [verified]

**Severity:** S1 · **Confidence:** 0.912 · **Class:** trust · **Seats:** D1, H1, H3, U3

Sign Out exists (AccountView) but is stranded behind the Settings 'Account' row, which is a real NavigationLink to AccountView and nevertheless does not navigate — reproduced three times across guest and signed-in tiers. Delete Account has no UI at all; a delete_user_account endpoint is declared and never called. Guest Settings shows the same ACCOUNT section to someone with no account.

*As originally filed: Settings lists ACCOUNT ("Account", "Sign in on the web"), PREFERENCES ("Notifications", "Haptic Feedback", "Upload scans on cellular", "Appearance System"), PRIVACY & MEMORY and SUPPORT. There is no Sign Out and no Delete Account control anywhere in Profile or Settings, in guest or signed-in state; switching accounts during the walk required wiping the simulator keychain from the host. Guest Settings is byte-identical, offering an ACCOUNT section to someone with no account.*

*Corrections applied from: observation←Code-truth (33), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift:48-66; apps/mobile/Patina/Patina/Features/Account/AccountView.swift:52-70; apps/mobile/Patina/Patina/Features/Account/AccountView.swift:147-153; apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift:182

Shots: c-27-account-row-inert.png, c-28-settings-client.png, c-28b-settings-scrolled.png, c-30-after-keychain-signout.png, g-02b-settings-account-inert.png, g-37-settings-guest.png, g-37b-settings-account-tap-guest.png

### F40 — A 6-point-wide toggle silently corrupts room data [verified]

**Severity:** S1 (was S0) · **Confidence:** 0.9 · **Class:** reach · **Seats:** U2

The room-dimensions step (ScanFallbackEntryView) puts a 'ft / m' toggle in the section header whose only activation feedback is a text-colour change from muted to primary, at roughly 12x13pt and 6x13pt; the LENGTH/WIDTH fields carry no unit suffix; and the chosen unit persists across sessions in UserDefaults ('patina.scan.manual_entry.unit') and is restored silently onAppear. Entering 18 x 14 with the toggle on 'm' stores 18m x 14m and every downstream surface prints 59' x 46' / 2713 SQ FT. The conversion arithmetic itself is correct.

*As originally filed: The "ft / m" unit toggle (g-25) renders "ft" at roughly 12×13pt and "m" at roughly 6×13pt — well under the 44pt minimum. Typing 18/14 with the toggle mis-hit on "m" produces no visible state change ("ft" stays bold) but silently reinterprets the entry as metres, yielding a "Living Room" of 59'×46' = 2713 sq ft, which then persists to the room view, the home Active Room card, and Profile.*

*Corrections applied from: severity←Repro (35), observation←Code-truth (33), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift:28-32; apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift:71-78; apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift:140-166; apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift:265-280; apps/mobile/Patina/Patina/Features/Rooms/Components/SpatialMetadataRow.swift:46-50

Shots: c-24-room-detail.png, d-06-room-detail.png, g-25-manual-room-entry-metric.png, g-28b-room-view.png

### F42 — Saved opens on boards that can never fill [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** H1, H2, H3, U1, U2, U3

Saved's default tab is "Boards", reading "No boards yet" / "Save pieces from recommendations to create your first board" / "Create Board" — while the Companion simultaneously reports "1 SAVED PIECE". A created board reads "This board is empty" permanently, because `CollectionsViewModel.addToBoard(_:productId:)` has no call site anywhere in the app.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:18; apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:101; apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:149-179

Shots: c-22-saved-signed-in.png, c-22b-saved-all-items.png, g-21-saved-empty-boards-tab.png

### F46 — Same story forever, permanently marked unread [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H1, H2, H3, U1

Every lane, every tier and every relaunch shows the same card: "4 MIN READ" with a clay dot in the corner, "MAKER SPOTLIGHT / The Grain Whisperer of Maine / Jonathan Chilton on 40 years of listening to wood".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift:71-90; apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift:117-131; apps/mobile/Patina/Patina/Features/Home/ViewModels/DailyRoomViewModel.swift:196-201; apps/mobile/Patina/Patina/Features/Home/Views/DailyStoryCard.swift:80-87

Shots: c-03-home-top-activeproject.png, c-31-engaged-home-top.png, d-01-home-top.png, g-12-home-discovering-top.png

### F61 — One story, forever, out of three that exist [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** H1, H3

"MAKER SPOTLIGHT / The Grain Whisperer of Maine / Jonathan Chilton on 40 years of listening to wood" is the same card on the guest home, the engaged home, the activeProject home, in dark mode and after a relaunch. The fetch is `order=sort_order.desc,published_at.desc&limit=1` with no per-day or per-user selection, and the catalogue holds three stories.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift:71-90; apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift:117-131; apps/mobile/Patina/Patina/Features/Home/ViewModels/DailyRoomViewModel.swift:196-201; apps/mobile/Patina/Patina/Features/Home/Views/DailyStoryCard.swift:80-87

Shots: c-03-home-top-activeproject.png, c-31-engaged-home-top.png, d-01-home-top.png, final-handoff-state.png, g-12-home-discovering-top.png

### F66 — Nothing in the app answers "where is it" [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** purchase · **Seats:** H1, U1

The Studio's sections are "Awaiting you", "In progress", "Conversation", "Money & documents", "Archive"; there is no order, no shipment, no ETA anywhere, and the client-facing order table `direct_orders` carries only `pending_payment / paid / canceled` (+ `refunded`).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift:12-36; supabase/migrations/00276_direct_orders.sql:41-67

Shots: c-06b-studio-awaiting-you.png, c-08-project-detail.png, c-21-notifications-signed-in.png, g-29-notifications-guest.png, g-36-profile-guest.png

### F68 — Payment failure is one red line under a live button [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H3, U3

When the checkout hand-off fails, the screen keeps "Pay $4,250.00" in full enabled styling and inserts one line of red body text below it — "Unable to start payment. Please try again." — which shoves "Pay securely by card or bank transfer" half off the bottom edge. There is no spinner, no retry affordance and no way to reach a human about a $4,250 payment that will not start. (The 503 behind it is the known local edge-runtime fault; the failure UX is the finding.)

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:195-222; apps/mobile/Patina/Patina/Features/Invoices/ViewModels/InvoicesViewModel.swift:110-126

Shots: c-13b-invoice-detail-scrolled.png, c-14-pay-handoff.png

### F70 — "CLIENT VIEW / Milestone" exposes the visibility tier [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** D1

A stat tile on the client's project screen is labelled "CLIENT VIEW" with the value "Milestone" — the raw client_visibility_tier the designer sets in the portal, shown to the client it governs, alongside "BUDGET $120,000" and "STATUS In Progress".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:108-126; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:128-151

Shots: c-08-project-detail.png

### F72 — Empty bell pitches a designer to an engaged client [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** D1

Under "Nothing yet" / "Updates from your designer will land here." the only control is a button reading "Get design help" — shown to a client with three projects, four proposals, an open invoice and a named designer on that invoice.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:125-138

Shots: c-21-notifications-signed-in.png, c-32c-engaged-studio-rows.png

### F73 — Matched client's Studio is five zeroes [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** content · **Seats:** D1

The engaged account's Studio reads "Awaiting you 0 / Nothing needs a decision.", "In progress 0 / No active projects yet.", "Conversation 0 / No project conversations yet.", "Money & documents 0 / No shared records yet.", "Archive 0 / Nothing has been archived." — under a Profile reading "0 ROOMS / 0 SAVED / — MATCH" for a user with an accepted lead and an uploaded scan on the server.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift:12-36; apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:733-740

Shots: c-32b-engaged-profile-studio.png, c-32c-engaged-studio-rows.png

### F74 — Engaged client's only act is a second request [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** D1

"Your design request" opens on "No scans on this phone yet" / "You can scan a room to attach — or request design help without one below." with a single button: "Request without a scan". The already-accepted lead is not shown and there is no scan affordance on the sheet the copy points at.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:733-740; apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift:60-99; apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:125-138

Shots: c-33-engaged-design-request-again.png, x-06-design-request.png

### F76 — Project detail discards the data it fetched [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** D1

"PROJECT / Aspen Loft Refresh / Currently: Installation & Styling" renders three stats, an Invoices row and a portal link — while the network log shows the same screen successfully loading project_phases (3827 bytes), get_client_project_selections, project_payment_milestones and list_client_proposals. No timeline, no rooms, no phases, no selections, no install date, no designer.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:19-36; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:128-138; apps/mobile/Patina/Patina/Features/Projects/ViewModels/ProjectsViewModel.swift:56-72

Shots: c-08-project-detail.png

### F77 — No document surface for the client [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** content · **Seats:** D1

"Money & documents 3" contains only "Proposals / 2 shared proposals / 1 accepted", "Invoices / 1 shared invoice" and "Budget / Project totals and payment progress". There is no Documents row anywhere in the signed-in app, and project_documents filtered to client_visible returns an empty list for this account.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Documents/DocumentListView.swift:53-58; apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift:308-335; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:422

Shots: c-19-messages-empty.png

### F79 — Signed-in Today has zero designer/studio identity [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** D2

The activeProject home shows only "Today", a Next Move card, an editorial story, and an "ACTIVE ROOM" card — no designer name, no studio name, no avatar, anywhere on the screen, for a client with three real projects and a named designer of record.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:104-145; apps/mobile/Patina/Patina/Features/Projects/Views/StudioIdentityLine.swift:18-40

Shots: c-03-home-top-activeproject.png

### F84 — Project detail leaks two designer/internal-facing strings verbatim [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** D2

The client's project detail shows a stat labelled "CLIENT VIEW / Milestone" (the raw client_visibility_tier column name) and a boxed link reading "Set up phases, payments, and FF&E in the portal →" — an instruction written for me, rendered to my client.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:108-126; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:128-151

Shots: c-08-project-detail.png

### F85 — Notifications promises "updates from your designer" and never delivers one [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** D2

"Notifications / Nothing yet / Updates from your designer will land here." plus a "Get design help" button, shown to a client with a $4,250 invoice due in 6 days and an $18,500 proposal expiring in 13 days — zero notifications exist for either.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:125-138; supabase/migrations/00388_proposal_send_dispatch_guard.sql:1258-1278

Shots: c-21-notifications-signed-in.png

### F93 — Budget screen shows one of three projects as "the budget" [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** D3

"Your budget — ACROSS YOUR PROJECTS" shows $4,250 billed for the Aspen Loft Refresh project only; the client's other two projects (Marrow & Vale Residence $420,000, Birch Hollow $185,000, per the projects list) do not appear anywhere on this screen.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:36-42; apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:104; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:5-24; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:37-52

Shots: c-15-budget.png

### F96 — Two quizzes give my taste two different names [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H1

The Companion quiz returns "Warm Modern / YOUR TASTE PORTRAIT" after the reader chose "Warm Minimal"; the second quiz that runs after room creation asks four of the same five questions with different options and returns "YOUR STYLE, FOUND / Modern Warmth"; a third account's profile badge reads "Style Explorer".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:288; apps/mobile/Patina/Patina/Features/StyleConversation/ViewModels/StyleConversationViewModel.swift:193; apps/mobile/Patina/Patina/Features/StyleConversation/ViewModels/StyleConversationViewModel.swift:229; apps/mobile/Patina/Patina/Features/RoomScan/Shared/Services/StyleProfileStore.swift:29-45; apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:188

Shots: g-08-quiz-result.png, g-26-after-room-created.png, g-28-room-view-final.png

### F98 — No Browse door on the home or in the orb [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** H1

The guest home shows four things — greeting, Next Move, story, Companion — and does not scroll; the Companion panel offers "Add your first space", "Style quiz", "Your recommendations / TAKE THE QUIZ FIRST" and "Sign in", with no Browse row until the quiz is finished.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomStateBlocks.swift:25-45; apps/mobile/Patina/Patina/Features/Home/Views/MarketplaceLinksSection.swift:114; apps/mobile/Patina/Patina/Features/Companion/Services/CompanionAreaBuilders.swift:28-49; apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:188

Shots: g-12-home-discovering-top.png, g-13-home-scrolled.png, g-14b-companion-next-steps.png

### F99 — Active Room is a stranger's room, not mine [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H2

The Active Room card reads 'Living Room / 2713 sq ft · 0 pieces saved.' I never scanned or typed that room. My real project — dining room + primary bedroom, per my own invoice's note — has no room representation anywhere. Signing out and back in (c-34) drops the card entirely, back to zero rooms.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/TodayModules.swift:158-163; apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:190-195

Shots: c-03-home-top-activeproject.png, c-34-final-state-signed-in-client.png

### F100 — Browse grid cards run off both screen edges [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** content · **Seats:** H2

The 2-column grid renders cards of at least four different sizes, the left column pushed partly off the left edge — one card reads only 'M & BOARD' with its price clipped mid-digit.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:134-147; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift:30-35

Shots: d-03-browse-pieces.png

### F103 — 'Budget' is really one invoice's billing total [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H2

'Your budget / ACROSS YOUR PROJECTS' shows '$4,250 BILLED / $0 PAID / $4,250 OUTSTANDING' — my single open invoice — while my Projects list totals $725,000 across three projects. Only Aspen Loft Refresh appears; Birch Hollow and Marrow & Vale don't.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:36-42; apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:104; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:5-24; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:37-52

Shots: c-04b-your-studio-hub.png, c-15-budget.png

### F107 — XL type: the Dynamic Island blots out my proposal's title [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** reach · **Seats:** H2

At Dynamic Type XXL, the scrolled Studio list's top card — 'Aspen Loft — Living Room Refresh / Review by Sep 8' — is fully covered by a solid black status-bar pill drawn over the content, no safe-area inset reserved.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:34-38; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:38-41; apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:26-31

Shots: x-02-profile-studio-rows.png

### F109 — Unit toggle is a 6-point silent target [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** reach · **Seats:** H3

The room-dimensions step (ScanFallbackEntryView) puts a 'ft / m' toggle in the section header whose only activation feedback is a text-colour change from muted to primary, at roughly 12x13pt and 6x13pt; the LENGTH/WIDTH fields carry no unit suffix; and the chosen unit persists across sessions in UserDefaults ('patina.scan.manual_entry.unit') and is restored silently onAppear. Entering 18 x 14 with the toggle on 'm' stores 18m x 14m and every downstream surface prints 59' x 46' / 2713 SQ FT. The conversion arithmetic itself is correct.

*As originally filed: The "ft / m" control in the ROOM DIMENSIONS header exposes "ft" at 12×13pt and "m" at 6×13pt. Tapping "m" produced no visible state change — "ft" stayed bold — while silently changing how the typed numbers were interpreted. Steppers are 32×32.*

*Corrections applied from: observation←Code-truth (33), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift:28-32; apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift:71-78; apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift:140-166; apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift:265-280; apps/mobile/Patina/Patina/Features/Rooms/Components/SpatialMetadataRow.swift:46-50

Shots: g-25-manual-room-entry-metric.png

### F111 — Design help offers a second request, not status [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H3

"Your design request" opens on "No scans on this phone yet" / "You can scan a room to attach — or request design help without one below." with a single button, "Request without a scan" — for an account whose request has already been accepted. The sheet offers scanning while carrying no scan affordance.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:733-740; apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift:60-99; apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:125-138

Shots: c-33-engaged-design-request-again.png, g-30-designer-consultation.png, x-06-design-request.png

### F112 — Guest hits an escape-less wall at the last tap [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H3

A guest completes the whole request — "What kind of help?", "Budget (optional)", "Timeline", "Your vision (optional)", then "Review", then "Send request" — and only then is thrown the generic gate as a sheet: "Welcome home" / "Start with a piece you love", with no Cancel, no ✕ and no "Look around first". Nothing earlier in the flow says an account will be required. Only a blind downward drag dismisses it; the draft does survive.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Authentication/Views/AuthSheet.swift:21-43; apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:100-112

Shots: g-31-design-request-step1.png, g-33-after-send-request.png, g-35-auth-wall-no-dismiss.png

### F115 — "Your budget" is a bill, not a budget [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H3

"BUDGET / Your budget / ACROSS YOUR PROJECTS" reports "$4,250 BILLED / $0 PAID / $4,250 OUTSTANDING" and lists only Aspen Loft Refresh, for a client whose three projects total $725,000 on the projects list ($185,000 + $120,000 + $420,000). Formats mix on one card: "$4,250" above "$4,250.00".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:36-42; apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:104; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:5-24; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:37-52

Shots: c-07-projects-list.png, c-08-project-detail.png, c-15-budget.png

### F117 — App asks who I am before showing anything [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** U1

First screen after the splash: "PATINA" / "Welcome home" / "Start with a piece you love" over "Sign in with Apple", "Continue with Google", "Continue with email", "or", "Look around first →", "Have a password? Sign in". No piece, no room, no story is shown before the ask.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:75-130

Shots: g-02-first-screen-after-splash.png, g-38-relaunch-returning-guest.png

### F118 — Tour never teaches the save loop it promises [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** U1

The shipped tour runs two steps: "Step 1 of 2 / Welcome to Patina" — "This is your Daily Room — picks and stories chosen for your space." and "Step 2 of 2 / Your profile" — "Rooms, saved pieces, and settings live here." The declared middle step "Save what you love" / "Add pieces to a room with + Add — they follow you everywhere." never renders; its anchor `.addToRoom` mounts in no view.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:186-196; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:227-253; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:838-856

Shots: g-09-home-tour-step1.png, g-10-home-tour-step2.png

### F124 — My investment belongs to the phone, not the account [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** U1

"Your Spaces" tags the room "SAVED ON THIS PHONE" and "2713 SQ FT · MANUAL ENTRY" while Profile, the Companion and Today all count it as account data ("1 ROOMS", "1 SAVED PIECE"); after the local store was cleared the same account showed "0 ROOMS / 0 SAVED / — MATCH".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:190-195; apps/mobile/Patina/Patina/Core/Persistence/LocalStoreReset.swift; apps/mobile/Patina/Patina/Core/Persistence/RoomStore.swift

Shots: c-23-your-spaces.png, c-26-profile.png, c-34-final-state-signed-in-client.png

### F125 — Project screen shows three stats and no timeline [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** U1

"PROJECT / Aspen Loft Refresh / Currently: Installation & Styling" then "BUDGET $120,000", "STATUS In Progress", "CLIENT VIEW Milestone", an "Invoices / View and pay your invoices" row and a link — no phases, no dates, no rooms, no selections, though the screen successfully fetched `project_phases` and `get_client_project_selections`.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:19-36; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:128-138; apps/mobile/Patina/Patina/Features/Projects/ViewModels/ProjectsViewModel.swift:56-72

Shots: c-08-project-detail.png

### F126 — The whole Studio hides behind a 36pt monogram [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** reach · **Seats:** U1

The only route to projects, proposals, invoices, budget and decisions is the unlabelled circular "C" in the top-right corner of the home, then a scroll past the avatar and stats to "STUDIO / The work around your home, in one place."

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:104-145; apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomStateBlocks.swift:25-45; apps/mobile/Patina/Patina/Features/Home/Views/DailyGreetingHeader.swift:59-99

Shots: c-03-home-top-activeproject.png, c-06b-studio-awaiting-you.png

### F127 — Deadlines are printed once and never reminded [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** U1

The invoices list shows "INV-2026-0142 / $4,250.00 / Due Sep 1, 2026"; the invoice detail I act on drops the due date entirely, and the app contains no `UNNotificationRequest` of any kind, so it cannot remind me itself.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:225-240

Shots: c-12-invoices-list.png, c-13-invoice-detail.png

### F129 — Only one piece can be shared with anyone [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** U1

The card menu offers "Save", "Share", "Not for me", "View details" — and there is no share on a room, a board, or the Saved list anywhere in the app.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:117-130; apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:304-335; apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:285

Shots: g-20-card-more-menu.png, g-27c-card-menu-in-room-context.png

### F132 — Tour skips the app's only save-loop lesson [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** U2

Tour shows "Step 1 of 2 / Welcome to Patina" then jumps straight to "Step 2 of 2 / Your profile" (g-09, g-10). The promised middle step — "Save what you love" / "Add pieces to a room with + Add — they follow you everywhere" — never appears; the Companion intro card ("I'm your Companion.") presents immediately after (g-11).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:186-196; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:227-253; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:838-856

Shots: g-09-home-tour-step1.png, g-10-home-tour-step2.png, g-11-companion-intro-card.png

### F133 — Saved opens on a tab that says nothing is saved [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** U2

"Saved" opens on the "Boards" tab by default, reading "No boards yet" / "Save pieces from recommendations to create your first board" (g-21) — for an account that has one real saved item sitting one tap away under "All items" (g-22b).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:18; apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:101; apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:149-179

Shots: g-21-saved-empty-boards-tab.png, g-22b-saved-all-items.png

### F135 — The status bar draws over scrolled content, worst on modal sheets at XXL [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** content · **Seats:** U2

In dark mode, the fixed status bar (9:41, signal icons) draws over the scrolled Studio list — the clock sits directly on "Review by Sep 8" (d-02). At XXL Dynamic Type the Dynamic-Island pill itself, not just the clock digits, occludes the top proposal's title (x-02). A third reproduction lands on a modal sheet: the "Your design request" sheet's own "Close" button and title overlap the 9:41 clock at XXL (x-06).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:34-38; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:38-41; apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:26-31

Shots: d-02-profile-studio-rows.png, x-02-profile-studio-rows.png, x-06-design-request.png

### F136 — The filter chip row overflows the screen at XXL with no way to reach the last chip [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** reach · **Seats:** U2

At Dynamic Type XXL, the chip row (All / Seating / Tables / Lighting / Storage) runs off the right edge — "Storage" is clipped to "Stor" with no visible scroll indicator or affordance suggesting more chips exist (x-03).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:134-147

Shots: x-03-browse-pieces.png

### F137 — Body text runs into the Companion button with no reserved space [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** content · **Seats:** U2

At XXL, the "Space Plan" section's wrapped body text ("Conversation seating around the fireplace,...") is cut off directly by the fixed circular Companion button at the screen's bottom edge, with no bottom padding reserved for it (x-05).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/ContentView.swift:166; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/CompanionSafeArea.swift:37-50; apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:33; apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:137-151

Shots: x-05-proposal-detail.png

### F138 — Home doesn't scroll, and gives no sign anything is hidden [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** U2

For the activeProject account (3 projects, 4 proposals, 1 open invoice, 2 pending decisions), d-01 (top) and d-02 (after a swipe) are pixel-identical — the screen has no more content to reveal, so the swipe simply does nothing.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:104-145; apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomStateBlocks.swift:25-45; apps/mobile/Patina/Patina/Features/Home/Views/DailyGreetingHeader.swift:59-99

Shots: d-01-home-top.png, d-02-home-studio-rows.png

### F142 — Dimensions exist as a column and nowhere else [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** U3

products.dimensions jsonb {width,height,depth,unit} exists in the schema; get_recommendations does not return it, ProductModel does not decode it, and no product surface prints a measurement. A live count over the local catalog returns dimensions on 0 of 21 rows.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:12-58; supabase/migrations/00001_initial_schema.sql:35; supabase/migrations/00246_aesthete_quiz_bridge.sql:273-300; apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift:97

Shots: g-15-browse-pieces-grid.png

### F144 — No shipping, returns or responsibility copy exists [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** U3

No column on products carries shipping, delivery, returns or liability, and no screen in the app prints any of it. The closest thing to a policy anywhere in the client is the proposal's terms: "Deposits are non-refundable once procurement begins. Custom items are final sale."

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00001_initial_schema.sql:29-45; supabase/seed/proposals.sql:95-97

Shots: c-13b-invoice-detail-scrolled.png, g-15-browse-pieces-grid.png

### F148 — Saved opens on an empty tab while an item exists [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** U3

Saved opens on "Boards", which reads "No boards yet / Save pieces from recommendations to create your first board" and a "Create Board" button, while the Companion row that led here said "Saved / 1 SAVED PIECE" and the item sits one tab over under "All items".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:18; apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:101; apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:149-179

Shots: c-22-saved-signed-in.png, c-22b-saved-all-items.png, g-21-saved-empty-boards-tab.png

### F151 — Buy-now is armed on the backend and unbuilt on iOS [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** purchase · **Seats:** U3

create_direct_order, create-checkout-session's direct_order_id branch, the stripe-webhook settle branch and the receipt and failure emails are all live; a live count over the local catalog shows 19 of 21 products are patina_managed and therefore already pass the RPC's buyability gate. Grep finds zero iOS references to direct_order, create_direct_order or "buy now".

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00276_direct_orders.sql:41-200; supabase/migrations/00277_refund_reconciliation.sql:183-208

### F152 — A direct order credits the designer nothing [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** U3

direct_orders carries no designer_id, no project_id, no commission_rate and no FF&E link; 00301_marketplace_vitals.sql:37-40 states it outright — "No designer attribution (client_id is the buyer)" — and the only designer_earnings credit path reads invoice_payments, never direct_orders.

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00276_direct_orders.sql:41-67; supabase/migrations/00301_marketplace_vitals.sql:37-40

### F154 — The order state machine stops at "paid" [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** return · **Seats:** U3

direct_orders.status is CHECK-constrained to pending_payment, paid and canceled (plus refunded from 00277). There is no fulfillment status, no shipped_at, no delivered_at, no tracking number and no ETA column.

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00276_direct_orders.sql:41-200; supabase/migrations/00277_refund_reconciliation.sql:183-208

### F155 — Two budgets for one project, both labelled budget [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** U3

"BUDGET $120,000" appears on the Aspen Loft project detail while "BUDGET / Your budget — ACROSS YOUR PROJECTS" reports "$4,250 BILLED / $0 PAID / $4,250 OUTSTANDING" for a client whose three projects total $725,000. Formats mix on one card: "$4,250" above "$4,250.00".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:36-42; apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:104; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:5-24; apps/mobile/Patina/Patina/Features/Budget/BudgetViewModel.swift:37-52

Shots: c-07-projects-list.png, c-08-project-detail.png, c-15-budget.png

### F156 — Due date dropped from the pay screen [verified]

**Severity:** S1 · **Confidence:** 0.9 · **Class:** trust · **Seats:** U3

"Due Sep 1, 2026" is printed on the invoices list and does not appear on the invoice detail; the detail uses due_date only to compute the word "Past due". The same omission repeats on proposals ("Expires Sep 8" on the list, absent on the detail) and decisions ("Overdue · Aug 22" on the Studio hub, absent on the decisions list).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:225-240; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceListView.swift:189-192

Shots: c-09-proposals-list.png, c-10-proposal-detail-top.png, c-12-invoices-list.png, c-13-invoice-detail.png, c-13b-invoice-detail-scrolled.png

### F49 — The orb covers the button it should help with [verified]

**Severity:** S1 · **Confidence:** 0.883 · **Class:** reach · **Seats:** D1, H1, H3

The fixed circular Companion control sits on top of the primary action on multiple screens: it clips "Sign proposal" on the proposal detail, clips "Browse Picks for This Room" on the room, and at XXL the proposal's "Space Plan" body text runs directly under it and is cut off mid-sentence.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/ContentView.swift:166; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/CompanionSafeArea.swift:37-50; apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:33; apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:137-151

Shots: c-11-proposal-detail-scrolled.png, c-24-room-detail.png, g-28b-room-view.png, x-05-proposal-detail.png

### F50 — 'Your studio' promises three things, delivers one [verified]

**Severity:** S1 · **Confidence:** 0.883 · **Class:** wayfinding · **Seats:** D1, D2, H2

The Companion's row reads 'Your studio / PROJECTS · MESSAGES · DECISIONS.' Tapping it lands directly on a bare projects list with a search bar — no messages, no decisions, no path to the real Studio hub (which lives only via Profile).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Companion/Services/CompanionAreaBuilders.swift:213-231; apps/mobile/Patina/Patina/Features/Profile/Views/StudioHubView.swift:44-67

Shots: c-04b-your-studio-hub.png, c-05-companion-panel-client.png, c-07-projects-list.png

### F51 — A typed form calls itself a scan [verified]

**Severity:** S1 · **Confidence:** 0.883 · **Class:** trust · **Seats:** H1, H3, U2

The Next Move promises "A short scan gives the Companion a real space to work from." and opens a typed form. The summary then offers "Rescan" and reports "0 ITEMS DETECTED" for a room nobody scanned; Your Spaces stamps the room "JUST SCANNED" directly above its own caption "2713 SQ FT · MANUAL ENTRY"; the Studio lists it as "Living Room / SCANNED AUG 26".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-128; apps/mobile/Patina/Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:27-60; apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:219-228

Shots: c-06c-studio-bottom.png, c-23-your-spaces.png, g-12-home-discovering-top.png, g-26-after-room-created.png, g-27-room-with-recommendations.png

### F52 — Nothing on a piece helps you decide [verified]

**Severity:** S1 · **Confidence:** 0.883 · **Class:** purchase · **Seats:** H1, H3, U3

The full apparatus for deciding on a piece is the card menu — "Save", "Share", "Not for me", "View details". There is no compare surface anywhere in the app; `TableItemModel.notes` exists and no UI writes it; and the piece screen carries no "Get design help" control, though that CTA appears on eleven other surfaces.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:86-138; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:338-399; apps/mobile/Patina/Patina/Core/Models/TableItemModel.swift:41-42

Shots: g-20-card-more-menu.png

### F53 — The shared link cannot open the app [verified]

**Severity:** S1 · **Confidence:** 0.883 · **Class:** return · **Seats:** H1, H3, U1

The app declares only the custom scheme `patina` in Info.plist and carries no `com.apple.developer.associated-domains` entitlement, so the `https://app.patina.cloud/library/<id>` link it hands out opens Safari even for someone with Patina installed.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Info.plist:15-27; apps/mobile/Patina/Patina/Patina.entitlements:4-11; apps/mobile/Patina/Patina/Features/Shared/PatinaPortalLinks.swift:14-22

Shots: g-19-share-sheet.png

### F55 — "Account >" has a chevron and does nothing [verified]

**Severity:** S1 · **Confidence:** 0.883 · **Class:** wayfinding · **Seats:** H1, H3, U2

The Settings row "Account" draws a chevron and does not navigate — tapped dead-centre of its 338×44 frame with the screen unchanged, reproduced independently in the guest tier twice and the signed-in client tier once. `AccountView` exists in the codebase.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift:48-66; apps/mobile/Patina/Patina/Features/Account/AccountView.swift:147-153

Shots: c-27-account-row-inert.png, c-28-settings-client.png, g-02b-settings-account-inert.png, g-37b-settings-account-tap-guest.png

### F43 — No search exists anywhere in the app [verified]

**Severity:** S1 · **Confidence:** 0.88 · **Class:** wayfinding · **Seats:** H1, H2, H3, U2, U3

There is no catalog/product search: the only entry to the commerce surface is the Companion's 'Your recommendations' row into a <=20-row feed with five client-side chips. get_recommendations accepts p_category and the app never sends it; a search_products endpoint is declared and never called. (Search fields DO exist on the projects list and the thread list.)

*As originally filed: The task "Find a sofa for our living room" has no search field to answer it with. The shortest real path is Companion orb → "Your recommendations" → chip "Seating" (client-side filter over an already-fetched ≤20-row page) → card — 4 acts, and it is a filtered browse, not a search.*

*Corrections applied from: observation←Code-truth (33), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:48-51; apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:105; apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:40-58; apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift:193; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectListView.swift:96

Shots: d-03-browse-pieces.png, g-14b-companion-next-steps.png, g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png

### F47 — Notification permission asked once, unexplained [verified]

**Severity:** S1 · **Confidence:** 0.875 · **Class:** return · **Seats:** H1, H3, U1, U3

Authorization is requested exactly once per install, immediately after the first successful design-request submission, with no pre-permission screen and no rationale copy; the only related control is a Settings toggle labelled "Notifications" that writes a profile preference, not the OS grant, and reads ON for a guest who can receive none.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/API/PushTokenService.swift:87-108; apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift:68-80

Shots: c-28-settings-client.png, g-29-notifications-guest.png, g-37-settings-guest.png

### F59 — No way to ask a question or defer on a decision [verified]

**Severity:** S1 · **Confidence:** 0.875 · **Class:** wayfinding · **Seats:** D2, H2

The decision screen offers exactly two identical black 'Choose this' buttons. There's no 'ask my designer,' no 'not yet,' no way to say I need more information before an $850 choice ships.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:44-61; apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:206-232

Shots: c-18-decision-detail.png

### F54 — No partner, household or second seat [verified]

**Severity:** S1 · **Confidence:** 0.867 · **Class:** return · **Seats:** H1, H3, U1

There is no way to share a room, a board or the Saved list — the three ShareLink sites are all single-product links. There is no invite flow, no household model, no co-viewer and no second-seat concept anywhere in the app, and no household or family-member table exists across all 487 migrations.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:117-130; apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:304-335; apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:285

Shots: c-27-account-row-inert.png, c-28-settings-client.png, g-19-share-sheet.png, g-37-settings-guest.png

### F58 — An active project with nothing pending leaves Today [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** return · **Seats:** D1, U1

The Next Move card reads "Review a project decision / 2 decisions need your eye." only while a count is above zero; the ladder is strictly ordered and, once decisions and unread messages hit zero, falls all the way back to "Return to {Room}". Proposals and invoices have no Next Move branch at all.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:48-55; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:95-118; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-159

Shots: c-03-home-top-activeproject.png, c-31-engaged-home-top.png

### F62 — "UNKNOWN MAKER" on a provenance marketplace [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** trust · **Seats:** H1, H3

Two of the ten curated cards print the maker line as "UNKNOWN MAKER" where others read "ROOM & BOARD", "LEE INDUSTRIES", "HOLLY HUNT", "MITCHELL GOLD + BOB WILLIAMS".

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00246_aesthete_quiz_bridge.sql:277-278; apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:50

Shots: g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png

### F65 — "Browse Picks for This Room" is not room-filtered [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** content · **Seats:** H1, U3

The room's own primary button opens the same generic "Browse pieces / 10 pieces curated for your space" grid, with no room name and no room filtering, and the rationale copy has switched to naming a different taste-portrait result than the one on Profile.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:302-327; apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:99-110

Shots: d-check10-after-heart-tap.png, g-27b-room-picks.png, g-27c-card-menu-in-room-context.png, g-28b-room-view.png

### F78 — Payment failure offers no retry and no human [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** purchase · **Seats:** D1

When the checkout hand-off failed, the screen printed one line of red body text — "Unable to start payment. Please try again." — inserted below a still fully enabled "Pay $4,250.00" button, shoving "Pay securely by card or bank transfer" half off the bottom edge. No spinner, no retry control, no support affordance.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:195-222; apps/mobile/Patina/Patina/Features/Invoices/ViewModels/InvoicesViewModel.swift:110-126

Shots: c-14-pay-handoff.png

### F80 — Next Move never surfaces an open proposal or due invoice [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** return · **Seats:** D2

Only pending decisions and unread messages ever populate the Next Move card ("Review a project decision", "Pick up the conversation"); this client's $18,500 proposal expiring in 13 days and $4,250 invoice due in 6 days have no Next Move branch at all and are invisible on Today.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:48-55; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:95-118; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-159

Shots: c-03-home-top-activeproject.png

### F83 — Pay-invoice failure UX shoves body copy off-screen with no real retry path [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** purchase · **Seats:** D2

Tapping "Pay $4,250.00" produces "Unable to start payment. Please try again." inserted below the button in red, which pushes "Pay securely by card or bank transfer" half off the bottom edge; the button keeps full enabled styling, there is no spinner, and the only recovery offered is tapping the same button again.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:195-222; apps/mobile/Patina/Patina/Features/Invoices/ViewModels/InvoicesViewModel.swift:110-126

Shots: c-14-pay-handoff.png

### F89 — Pay-failure UX has no retry, no way to reach a human [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** trust · **Seats:** D3

Tapping "Pay $4,250.00" that fails to start renders "Unable to start payment. Please try again." as a single line of red text inserted below the button, shoving "Pay securely by card or bank transfer." half off the bottom edge. The button keeps full enabled styling; there is no spinner, no retry control, and no way to reach support from this screen.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:195-222; apps/mobile/Patina/Patina/Features/Invoices/ViewModels/InvoicesViewModel.swift:110-126

Shots: c-14-pay-handoff.png

### F91 — Today never surfaces a proposal or invoice [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** wayfinding · **Seats:** D3

The Next Move ladder branches only on decisions and messages (TodayExperience.swift:95-118); there is no branch for a pending proposal or an unpaid invoice. Today for this account reads "Review a project decision / 2 decisions need your eye" with no mention of the $4,250 invoice or the four proposals.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:48-55; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:95-118; apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-159

Shots: c-03-home-top-activeproject.png

### F92 — Deadlines shown on the list, dropped on the detail [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** content · **Seats:** D3

"Due Sep 1, 2026" appears on the invoices list and is absent on the invoice detail; "Expires Sep 8" appears on the proposals list and is absent on the proposal detail; "Overdue · Aug 22" appears on the Studio hub and is absent on the decisions list.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:225-240; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceListView.swift:189-192

Shots: c-06b-studio-awaiting-you.png, c-09-proposals-list.png, c-10-proposal-detail-top.png, c-12-invoices-list.png, c-13-invoice-detail.png, c-17-decisions-list.png

### F95 — Proposal selections show logo placeholders, no per-item price [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** trust · **Seats:** D3

The proposal detail's SELECTIONS block renders a thumbnail and a line total for each item, but get_client_proposal_bundle nulls unit_sell_price, line_total_cents and vendor_name for any proposal whose client_visibility_tier is not 'full' — and that column defaults to 'milestone'. The client is therefore asked to e-sign an 'INVESTMENT $18,500.00' with five unpriced, unattributed lines by default.

*As originally filed: The proposal's "SELECTIONS" list — "Walnut sectional sofa," "Hand-knotted wool rug," "Walnut coffee table," "Reading lounge chair Qty 2," "Floor lamp Qty 2" — illustrates every item with the Patina wordmark glyph instead of a photo, and shows no price against any line; the $18,500 total is never broken down.*

*Corrections applied from: observation←Code-truth (33), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailBlocks.swift:126-157; supabase/migrations/00390_proposal_copy_immutability.sql:1622-1650; supabase/migrations/00141_proposal_client_visibility_tier.sql:14-16; supabase/seed/proposals.sql:101-115

Shots: c-11-proposal-detail-scrolled.png, c-11c-sign-sheet.png

### F97 — Core controls are far under 44 points [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** reach · **Seats:** H1

The room form's unit toggles measure 12×13 pt ("ft") and 6×13 pt ("m"); the Saved screen's "Boards" tab is 46×17 pt; the trapped product screen's "Let's try that again" is 125×17 pt; the room steppers are 32×32.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift:140-166

Shots: g-17-piece-detail-top.png, g-21-saved-empty-boards-tab.png, g-25-manual-room-entry-metric.png

### F101 — My real rooms live nowhere I can check on them [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** wayfinding · **Seats:** H2

My invoice names 'Dining room + primary bedroom' as the scope; my decisions are about a rug and dining chairs. 'Your Spaces' shows exactly one room — 'Living Room,' 2713 sq ft, 'Manual Entry' — with no connection to either of my actual project rooms.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/TodayModules.swift:158-163; apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:190-195

Shots: c-13-invoice-detail.png, c-23-your-spaces.png

### F105 — Nothing that matters to me can be shared [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** return · **Seats:** H2

The only Share buttons anywhere in the app are on catalog pieces. My rug decision, my $18,500 proposal, and my $4,250 invoice — the actual open items on my house — have no share control at all.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:117-130; apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:304-335; apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:285

Shots: c-13-invoice-detail.png, c-18-decision-detail.png

### F108 — Fresh install is met by a wall, not a room [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** wayfinding · **Seats:** H3

The first real screen after a blank splash is a full-screen gate: "Welcome home" / "Start with a piece you love", then "Sign in with Apple", "Continue with Google", "Continue with email", a divider reading "or", and only then "Look around first →", with "Have a password? Sign in" beneath it.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:75-130

Shots: g-02-first-screen-after-splash.png

### F113 — A returning guest is forgotten and called "home" [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** trust · **Seats:** H3

A guest's session does not survive a relaunch: the taste portrait, the quiz progress and the session are discarded with no warning, and the screen that greets them reads "Welcome home". The saved piece and the coach-mark flags do survive, so the Companion insists "Style quiz — DISCOVER YOUR STYLE" while Profile simultaneously shows the "Warm Modern" badge and "48% MATCH".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:173-197; apps/mobile/Patina/Patina/Features/RoomScan/Shared/Services/StyleProfileStore.swift:29-45; apps/mobile/Patina/Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:288

Shots: g-36-profile-guest.png

### F122 — A saved piece forgets it was saved [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** trust · **Seats:** U1

The piece-detail primary button reads "Add to Room" and flips to "Saved ✓" only for the life of the screen: `toggleSave` inserts a local `TableItemModel` with no remote mirror, `isSaved` is never seeded from storage, and re-saving inserts a second row.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:18; apps/mobile/Patina/Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:44-78; apps/mobile/Patina/Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:104-125; apps/mobile/Patina/Patina/ContentView.swift:292-294; apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:74-89

Shots: c-22b-saved-all-items.png

### F123 — Home says zero pieces saved while Saved holds one [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** content · **Seats:** U1

The home card reads "ACTIVE ROOM / Living Room / 2713 sq ft · 0 pieces saved" on the same device and session where "Saved / All items" lists "ROOM & BOARD / Heirloom Oak Dining Table / $4200".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/TodayModules.swift:158-163; apps/mobile/Patina/Patina/Core/Models/TableItemModel.swift:41-52

Shots: g-22b-saved-all-items.png, g-40b-home-active-room-clipped.png

### F128 — Returning client is offered to re-file their request [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** return · **Seats:** U1

The sheet titled "Your design request" reads "No scans on this phone yet" / "You can scan a room to attach — or request design help without one below." with the single act "Request without a scan" — for an account whose request was already accepted and claimed.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:733-740; apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift:60-99; apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:125-138

Shots: c-33-engaged-design-request-again.png, x-06-design-request.png

### F131 — The editorial well holds three stories [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** content · **Seats:** U1

"MAKER SPOTLIGHT / The Grain Whisperer of Maine" is served by an unfiltered query for the single highest `sort_order` row, and the whole `editorial_stories` table holds exactly the three rows seeded by its own migration.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift:71-90; apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift:117-131; apps/mobile/Patina/Patina/Features/Home/ViewModels/DailyRoomViewModel.swift:196-201; apps/mobile/Patina/Patina/Features/Home/Views/DailyStoryCard.swift:80-87

Shots: c-03-home-top-activeproject.png

### F134 — The only door to the Studio is the worst-reached control on the screen [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** reach · **Seats:** U2

The three top-right glyphs (bell, ?, monogram) sit as ~36pt targets in the far top-right corner (g-12, x-01) — the single hardest zone to reach one-handed on a phone this size — and the monogram is the sole door to Profile → Studio, the surface holding every project/proposal/invoice/decision the app knows about.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:104-145; apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomStateBlocks.swift:25-45; apps/mobile/Patina/Patina/Features/Home/Views/DailyGreetingHeader.swift:59-99

Shots: g-12-home-discovering-top.png, x-01-home-top.png

### F141 — The design-request soft wall removes every escape hatch the real gate has [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** wayfinding · **Seats:** U2

The generic auth gate (g-02, s-01) offers Sign in with Apple, Continue with Google, Continue with email, and "Look around first." The same screen thrown mid-flow as a soft wall after "Send request" (g-35) is missing "Look around first" and has no Cancel or X anywhere — only a blind downward drag dismisses it, and nothing on the sheet mentions the request that triggered it.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Authentication/Views/AuthSheet.swift:21-43; apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:100-112

Shots: g-02-first-screen-after-splash.png, g-35-auth-wall-no-dismiss.png

### F143 — Lead time never reaches the shopper [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** trust · **Seats:** U3

products.lead_time_weeks exists but is CHECK-required only for layer='studio'; the catalog layer the client app reads has no lead-time guarantee. The RPC does not return it, the app does not decode it, and locally it is populated on 1 of 21 rows.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:12-58; supabase/migrations/00246_aesthete_quiz_bridge.sql:273-300

Shots: g-15-browse-pieces-grid.png

### F147 — Saving a piece gives no visible confirmation [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** purchase · **Seats:** U3

After tapping a card's heart the icon stays outlined and unfilled, with no toast, no count change and no "saved to" line; the dark lane tapped hearts twice and Saved stayed empty.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:138-196; apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:230-238; apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:55-57

Shots: d-check10-after-heart-tap.png, d-check11.png

### F150 — No "ask my designer" on the piece surface [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** purchase · **Seats:** U3

The piece-detail screen carries only back, "?", Share and heart; the ratified CTA "Get design help" appears on eleven other surfaces and not on this one. Reaching a human about the piece being looked at costs two acts through the Companion, and only if the orb is known to be a menu.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:86-138; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:338-399; apps/mobile/Patina/Patina/Core/Models/TableItemModel.swift:41-42

Shots: g-20-card-more-menu.png

### F153 — No vendor link or price inquiry to leave toward [verified]

**Severity:** S1 · **Confidence:** 0.85 · **Class:** purchase · **Seats:** U3

products.source_url exists and is populated on 9 of 21 local rows; it is never returned by the RPC, never decoded and never shown. There is no "where to buy", no "ask about this piece" and no maker page anywhere in the app.

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00001_initial_schema.sql:37; supabase/migrations/00246_aesthete_quiz_bridge.sql:273-300; apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:12-58

Shots: g-20-card-more-menu.png

### F67 — Piece-detail saves are local-only and duplicate [verified]

**Severity:** S1 · **Confidence:** 0.825 · **Class:** return · **Seats:** H2, U3

On the standard .pieceDetail(pieceId:) route no room context is passed, so both the heart and the primary "Add to Room" button run the same local toggleSave — a TableItemModel insert with no saved_items mirror and no room. isSaved is never seeded from storage, so the same piece shows "Add to Room" again the next day and a second row is inserted.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:18; apps/mobile/Patina/Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:44-78; apps/mobile/Patina/Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:104-125; apps/mobile/Patina/Patina/ContentView.swift:292-294; apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:74-89

### F86 — No dimensions, lead time, shipping, or liability fields [verified]

**Severity:** S1 · **Confidence:** 0.8 · **Class:** trust · **Seats:** D3

products.dimensions JSONB exists in the schema but is neither returned by get_recommendations nor decoded by the app; there is no lead_time, stock, shipping, returns, or "who is responsible" field anywhere on the product model or the detail screen.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:12-58; supabase/migrations/00001_initial_schema.sql:35; supabase/migrations/00246_aesthete_quiz_bridge.sql:273-300; apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift:97

### F87 — No "ask my designer" control on the piece itself [verified]

**Severity:** S1 · **Confidence:** 0.8 · **Class:** purchase · **Seats:** D3

The piece-detail action bar has back / ? / Share / heart, and a primary "Add to Room" button — no "Get design help" control. The CTA exists on 11 other surfaces in the app but not on the screen where a client is looking at one specific piece; reaching it costs 2 acts through the Companion menu instead.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:86-138; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:338-399; apps/mobile/Patina/Patina/Core/Models/TableItemModel.swift:41-42

Shots: g-20-card-more-menu.png

### F104 — A failed $4,250 payment gets one crowded red line [verified]

**Severity:** S1 · **Confidence:** 0.8 · **Class:** trust · **Seats:** H2

Tapping 'Pay $4,250.00' produced 'Unable to start payment. Please try again.' inserted directly below the button, shoving 'Pay securely by card or bank transfer' half off-screen. The button keeps its full enabled look; there's no spinner and no distinct retry control besides tapping Pay again.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:195-222; apps/mobile/Patina/Patina/Features/Invoices/ViewModels/InvoicesViewModel.swift:110-126

Shots: c-14-pay-handoff.png

### F120 — The first ask is the app's heaviest act [verified]

**Severity:** S1 · **Confidence:** 0.8 · **Class:** return · **Seats:** U1

The only act on the first home is "NEXT MOVE / Bring your first room into Patina / A short scan gives the Companion a real space to work from." — which, without LiDAR, lands on a typed form headed "TELL US ABOUT YOUR SPACE / What kind of room?".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:120-128

Shots: g-12-home-discovering-top.png, g-23-spaces-or-scan.png

### F139 — There is no Sign Out control anywhere in the app [verified]

**Severity:** S1 · **Confidence:** 0.8 · **Class:** wayfinding · **Seats:** U2

Sign Out exists (AccountView) but is stranded behind the Settings 'Account' row, which is a real NavigationLink to AccountView and nevertheless does not navigate — reproduced three times across guest and signed-in tiers. Delete Account has no UI at all; a delete_user_account endpoint is declared and never called. Guest Settings shows the same ACCOUNT section to someone with no account.

*As originally filed: Neither Settings nor Profile carries a Sign Out action for a signed-in client. The only way to end a session is to force-quit and wipe the device keychain from outside the app — not performable by an end user.*

*Corrections applied from: observation←Code-truth (33), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift:48-66; apps/mobile/Patina/Patina/Features/Account/AccountView.swift:52-70; apps/mobile/Patina/Patina/Features/Account/AccountView.swift:147-153; apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift:182

Shots: g-02b-settings-account-inert.png

### F140 — Two different quizzes exist for one concept and disagree with each other [verified]

**Severity:** S1 · **Confidence:** 0.8 · **Class:** wayfinding · **Seats:** U2

The Companion-entry quiz's first question ("Which palette feels like home?", g-06) offers Warm Minimal / Cool Modern / Classic Comfort / Eclectic Curated. The quiz reached after manually entering a room ("Which room speaks to you?", g-26) offers Warm Minimal / Cool Modern / Layered Comfort / Curated Mix — two of four options differ, for what the app treats as the same StylePreferenceModel.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:288; apps/mobile/Patina/Patina/Features/StyleConversation/ViewModels/StyleConversationViewModel.swift:193; apps/mobile/Patina/Patina/Features/StyleConversation/ViewModels/StyleConversationViewModel.swift:229; apps/mobile/Patina/Patina/Features/RoomScan/Shared/Services/StyleProfileStore.swift:29-45; apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:188

Shots: g-06-quiz-q1.png, g-26-after-room-created.png

### F157 — Card payers are told a bank transfer has started [verified]

**Severity:** S1 · **Confidence:** 0.8 · **Class:** trust · **Seats:** U3

When the 60-second post-Checkout poll expires, confirmState is set to .achPending unconditionally and the banner reads "Your bank transfer has been started. Bank transfers take 3–5 business days to clear — we'll email your receipt as soon as it lands." — regardless of which rail the payer used, and regardless of whether they paid at all.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/ViewModels/InvoicesViewModel.swift:135-157; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:96-110

Shots: c-13b-invoice-detail-scrolled.png

### F63 — Tomorrow the saved piece says "Add to Room" again [verified]

**Severity:** S1 · **Confidence:** 0.75 · **Class:** return · **Seats:** H1, H3

The piece-detail save state is never seeded from storage, so a piece saved yesterday shows the primary button "Add to Room" on the next visit and saving again inserts a second row.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:18; apps/mobile/Patina/Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:44-78; apps/mobile/Patina/Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:104-125; apps/mobile/Patina/Patina/ContentView.swift:292-294; apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:74-89

Shots: g-22b-saved-all-items.png

### F64 — AR is offered by the UI but cannot ever render [verified]

**Severity:** S1 · **Confidence:** 0.75 · **Class:** trust · **Seats:** H1, U2

The room stat row's "0 IN AR" (g-28b, c-24, d-06) is not a display bug — usdz_url is NULL::text in the recommendation RPC and hard-coded nil in the direct product fetch, so product.hasARModel is false on every code path in the app; the AR button never draws on any piece, for any account.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:192; apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:110; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:344-368; apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:235-243; supabase/migrations/00246_aesthete_quiz_bridge.sql:283

Shots: c-24-room-detail.png, d-06-room-detail.png, g-28b-room-view.png

### F90 — No fulfillment/shipping status on any line item [verified]

**Severity:** S1 · **Confidence:** 0.75 · **Class:** content · **Seats:** D3

Invoice line items ("Dining table — deposit (50%)", "Primary bedroom nightstands (pair) — deposit (50%)") carry no shipped/delivered/damaged status. invoices (00178) and direct_orders (00276) both stop at paid/void — there is no fulfillment_status column on either.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift:12-36; supabase/migrations/00276_direct_orders.sql:41-67

Shots: c-13b-invoice-detail-scrolled.png

### F145 — The maker line shows the retailer, not the maker [verified]

**Severity:** S1 · **Confidence:** 0.75 · **Class:** trust · **Seats:** U3

The card for "Heirloom Oak Dining Table" is labelled "ROOM & BOARD"; the same row's products.brand column reads "Nordic Atelier" and is never returned or shown. Fourteen of twenty-one local products have no vendor_id at all and render "UNKNOWN MAKER".

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00246_aesthete_quiz_bridge.sql:277-282; supabase/seed/products.sql:6-14

Shots: g-15-browse-pieces-grid.png, g-22b-saved-all-items.png

### F75 — An $850 decision commits on one unconfirmed tap [contested]

**Severity:** S1 · **Confidence:** 0.7 · **Class:** trust · **Seats:** D1

"Rug color - Natural vs Sand" offers two cards, each "$850" with an identical black "Choose this" button. There is no confirmation step, no way to ask a question, no defer, no "neither", and nothing states the choice is final.

Refs: apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:280-309

Shots: c-18-decision-detail.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED on the confirmation claim. 'Choose this' calls viewModel.beginSelection(optionId:) which sets pendingOptionId and presents DecisionConsentSheet (.sheet at DecisionDetailView.swift:44-61) — a real confirm step headed 'CONFIRM YOUR CHOICE' with the option title, the line 'Approving sends your decision to your designer and unblocks any work waiting on it.', an optional 'Add my signature' e-sign toggle, an Approve button and Cancel. The walk's '3 taps, no confirmation' count is wrong. A 'talk it over' affordance also exists (discussAction -> .threadDetail), but only renders when the decision resolves a project comms thread — the seed has none. What survives: no defer, no 'neither', and no visible way to ask when there is no thread.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.

### F82 — Messaging is a static "Conversation 0" with no compose or thread affordance [contested]

**Severity:** S1 · **Confidence:** 0.7 · **Class:** wayfinding · **Seats:** D2

The entire messaging surface is a count and one line: "Conversation 0 / No project conversations yet." No compose button, no thread list, no "message your designer" control anywhere in the app.

Refs: apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueModels.swift:11-45

Shots: c-19-messages-empty.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED as written. A complete messaging surface ships: ThreadListView (with an inline search field) and ThreadDetailView — whose own header calls it 'Conversation view: bubbles + simple composer' — plus MessagingViewModel and MessagingAPIClient writing comms_threads/comms_messages. A 'Message your designer' Companion row (route .threadList) is offered on project detail, decision detail, documents, notifications and design-requests (CompanionAreaBuilders.swift:219-294). What the walkers saw (c-19) is the Studio hub, not a messages screen: the 'Conversation' block is the only Studio block drawn WITHOUT a chevron, and they never opened .threadList. The defensible finding is narrower: a client cannot START a thread (ThreadListView's empty state CTA is 'Get design help', not 'New message'), the Studio's Conversation block is a dead row, and the home Companion carries no message row.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.

### F88 — Decision detail: two $850 options, no image, no confirm [contested]

**Severity:** S1 · **Confidence:** 0.7 · **Class:** trust · **Seats:** D3

"Rug color - Natural vs Sand" presents "Natural" (badged "Recommended") and "Sand," both priced at $850, both with no product image, each with its own identical black "Choose this" button and no confirmation step before the choice is committed.

Refs: apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:280-309

Shots: c-18-decision-detail.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED on the confirmation claim. 'Choose this' calls viewModel.beginSelection(optionId:) which sets pendingOptionId and presents DecisionConsentSheet (.sheet at DecisionDetailView.swift:44-61) — a real confirm step headed 'CONFIRM YOUR CHOICE' with the option title, the line 'Approving sends your decision to your designer and unblocks any work waiting on it.', an optional 'Add my signature' e-sign toggle, an Approve button and Cancel. The walk's '3 taps, no confirmation' count is wrong. A 'talk it over' affordance also exists (discussAction -> .threadDetail), but only renders when the decision resolves a project comms thread — the seed has none. What survives: no defer, no 'neither', and no visible way to ask when there is no thread.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.

### F106 — Dark mode: no Pay button in sight [verified]

**Severity:** S1 · **Confidence:** 0.7 · **Class:** purchase · **Seats:** H2

The dark-mode invoice detail, scrolled to the same 'No payments recorded yet' point that shows 'Pay $4,250.00' in light mode, has no visible Pay control at that stop — just the dimmed Companion orb and the footer.

Shots: d-08-invoice-detail.png

### F116 — An $850 choice is one tap and irreversible [contested]

**Severity:** S1 · **Confidence:** 0.7 · **Class:** trust · **Seats:** H3

"DECISION / Rug color - Natural vs Sand" presents two options, "Natural" badged "Recommended" and "Sand", both "$850", both with no image — a colour decision with no colour — under two identical black "Choose this" buttons. There is no way to ask a question, to defer, or to say neither, and nothing states the choice is final. Answering is three taps from a cold home; paying an invoice is five and signing a proposal is six.

Refs: apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:280-309

Shots: c-17-decisions-list.png, c-18-decision-detail.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED on the confirmation claim. 'Choose this' calls viewModel.beginSelection(optionId:) which sets pendingOptionId and presents DecisionConsentSheet (.sheet at DecisionDetailView.swift:44-61) — a real confirm step headed 'CONFIRM YOUR CHOICE' with the option title, the line 'Approving sends your decision to your designer and unblocks any work waiting on it.', an optional 'Add my signature' e-sign toggle, an Approve button and Cancel. The walk's '3 taps, no confirmation' count is wrong. A 'talk it over' affordance also exists (discussAction -> .threadDetail), but only renders when the decision resolves a project comms thread — the seed has none. What survives: no defer, no 'neither', and no visible way to ask when there is no thread.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.

### F146 — Provenance layer renders empty on every product [verified]

**Severity:** S1 · **Confidence:** 0.7 · **Class:** trust · **Seats:** U3

The detail's maker-location tag and "maker story" card read from vendors.made_in and vendors.brand_story. A live count over the local stack returns 0 of 104 vendors carrying made_in and 0 of 104 carrying brand_story, so both surfaces have nothing to render for any of the 21 products.

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/migrations/00246_aesthete_quiz_bridge.sql:277-282; supabase/seed/vendors.sql

Shots: g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png

### F94 — Messaging is a dead stub — no compose, no thread [contested]

**Severity:** S1 · **Confidence:** 0.65 · **Class:** content · **Seats:** D3

"Conversation / 0 / No project conversations yet." is the entire messaging surface for a client with an overdue decision, an unpaid invoice, and an expiring proposal — no compose control, no thread list, nothing to open.

Refs: apps/mobile/Patina/Patina/Features/Messaging/Views/ThreadDetailView.swift:266

Shots: c-19-messages-empty.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED as written. A complete messaging surface ships: ThreadListView (with an inline search field) and ThreadDetailView — whose own header calls it 'Conversation view: bubbles + simple composer' — plus MessagingViewModel and MessagingAPIClient writing comms_threads/comms_messages. A 'Message your designer' Companion row (route .threadList) is offered on project detail, decision detail, documents, notifications and design-requests (CompanionAreaBuilders.swift:219-294). What the walkers saw (c-19) is the Studio hub, not a messages screen: the 'Conversation' block is the only Studio block drawn WITHOUT a chevron, and they never opened .threadList. The defensible finding is narrower: a client cannot START a thread (ThreadListView's empty state CTA is 'Get design help', not 'New message'), the Studio's Conversation block is a dead row, and the home Companion carries no message row.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.

### F57 — Studio rows unreachable by VoiceOver [contested]

**Severity:** S1 · **Confidence:** 0.625 · **Class:** reach · **Seats:** D1, H2

scan_ui on the Studio block returns none of Decisions, Invoice, Proposal, Active projects, Proposals, Invoices, Budget or Archive as accessibility buttons — only "Open Living Room", "Retake Style Quiz", "Get design help", "Settings" and Back. The rows draw chevrons and respond to taps. Reproduced in dark; at Dynamic Type XXL the same rows do expose a button role.

Refs: apps/mobile/Patina/Patina/Features/Profile/Views/StudioHubView.swift:254-287

Shots: c-06b-studio-awaiting-you.png, c-06d-studio-money-documents.png, d-07-proposal-detail.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED. The Studio rows ARE accessible controls: StudioHubView wraps each row in a Button with .accessibilityElement(children:.ignore), .accessibilityLabel(row.accessibilityLabel), .accessibilityHint("Opens ...") and .accessibilityIdentifier("StudioHub.Row.<id>") (:243-251), and that annotation block is OUTSIDE the Dynamic-Type branch — the two branches in rowLabel differ only in layout (:254-286). Identical a11y at every text size means the scan_ui discrepancy is a harness artifact, not a product defect; the walkers' own notes say scan_ui misses non-interactive-typed elements (it also missed the product cards). Do not ship this as 'VoiceOver cannot reach the money rail' without a real VoiceOver pass.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.

### F110 — "0 IN AR" counts a feature that cannot exist [verified]

**Severity:** S1 · **Confidence:** 0.6 · **Class:** trust · **Seats:** H3

The room stat row reads "0 ITEMS", "— MATCH", "0 IN AR", with "IN AR" undefined on screen. `usdz_url` is `NULL::text` in the recommendations RPC and hard-coded nil in the direct product fetch, so `hasARModel` is false on every code path: the AR button never draws, and the two remaining doors land on "3D model not available for this product".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:192; apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:110; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:344-368; apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:235-243; supabase/migrations/00246_aesthete_quiz_bridge.sql:283

Shots: d-06-room-detail.png, g-28b-room-view.png

### F119 — Quiz payoff ends without a door to the pieces [verified]

**Severity:** S1 · **Confidence:** 0.6 · **Class:** return · **Seats:** U1

After five questions the result screen reads "YOUR STYLE, FOUND" / "Warm Modern" / "A STARTING POINT — REFINE IT ANY TIME.", and scrolled to the end it terminates on "Tune the portrait / Tell Patina which direction feels closer. / Tune this" — no "see your recommendations" act.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/StyleQuiz/Views/StyleResultView.swift:185-205

Shots: g-08-quiz-result.png, g-08b-quiz-result-scrolled.png

### F149 — The Saved door vanishes for pieces saved from Browse [contested]

**Severity:** S1 · **Confidence:** 0.6 · **Class:** wayfinding · **Seats:** U3

The Companion's "Saved" row is returned only when context.tableItemCount > 0, and that count is computed as the sum of room SavedItems, not TableItemModel rows — so a piece saved from Browse or from the piece detail does not increment it, and the row never appears.

Refs: apps/mobile/Patina/Patina/Features/Companion/Services/CompanionActionRows.swift:217-223; apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:265

Shots: c-05-companion-panel-client.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED. The claim rests on tableItemCount being the room-scoped sum written by DailyRoomView:265 — but the Companion never reads that value. CompanionOverlay.enrichedContext OVERWRITES it on every panel open with a live fetchCount(FetchDescriptor<TableItemModel>()) over the whole store (:173-197), and expandedView binds enrichedContext before building the rows (:522-527). The file even documents that updateTableItemCount has no effective callers. A piece hearted on the browse grid or the piece detail therefore DOES surface the Saved row. F14 (no row at zero) is the true version of this finding.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.

### F44 — A colour decision shows no colour [verified]

**Severity:** S2 (was S1) · **Confidence:** 0.912 · **Class:** content · **Seats:** D1, D2, H2, U3

The decision tagged "Color" — "Rug color - Natural vs Sand", "The jute rug from Studio Piet. Natural is warmer, Sand is more neutral." — presents two text-only option cards, "Natural" (badged "Recommended") and "Sand", with no swatch, no photograph and no rug anywhere on the screen.

*Corrections applied from: severity←Code-truth (33), refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:111-145; supabase/seed/decisions.sql:110-120

Shots: c-17-decisions-list.png, c-18-decision-detail.png

### F159 — Filter row clips "Storage" to "Stor" at XXL [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** reach · **Seats:** H1, H3, U3

At Dynamic Type extra-extra-large the chip row "All / Seating / Tables / Lighting / Storage" overflows the screen width and "Storage" is clipped to "Stor" at the right edge, with no horizontal scroll affordance visible.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:134-147

Shots: x-03-browse-pieces.png

### F161 — A finished project sorts above active ones [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** D1, H2

'Birch Hollow / Completed / $185,000' sits above 'Aspen Loft Refresh / In Progress' and 'Marrow & Vale Residence / In Progress' in the Projects list. 'PHASE / Install' also truncates 'Installation & Styling' to a bare word.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/ViewModels/ProjectsViewModel.swift; apps/mobile/Patina/Patina/Core/Models/PhaseDisplay.swift:57-58

Shots: c-07-projects-list.png, x-02b-projects-list-bonus.png

### F163 — Coach marks cover the card they describe [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** H1, H3

"Step 1 of 2 / Welcome to Patina / This is your Daily Room — picks and stories chosen for your space." fully covers the Next Move card it is describing; step 2 does the same while pointing at the profile monogram; the Companion's own "Got it" bubble then covers the panel's first row. Skip/Next render in iOS system blue, the only blue in the app.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:227-253

Shots: g-09-home-tour-step1.png, g-10-home-tour-step2.png, g-11-companion-intro-card.png, g-14-companion-panel-open.png

### F164 — Overdue flag dropped on the decisions list [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** return · **Seats:** D1

The Studio row reads "Decisions / 2 project choices are ready / Overdue · Aug 22". The decisions list it opens — "DECISIONS / Awaiting your call" — shows two cards with no date, no "asked N days ago" and no overdue marker at all.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:225-240; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceListView.swift:189-192

Shots: c-06b-studio-awaiting-you.png, c-17-decisions-list.png

### F174 — Saved opens on an empty "Boards" tab [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** H1

Tapping the Companion row labelled "Saved / 1 SAVED PIECE" lands on the "Boards" tab reading "No boards yet" / "Save pieces from recommendations to create your first board"; the piece is one tab away under "All items".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:18; apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:101; apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:149-179

Shots: c-22-saved-signed-in.png, g-21-saved-empty-boards-tab.png, g-22-saved-one-piece.png

### F175 — Request sheet offers a scan it cannot take [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** H1

"Your design request" opens on "No scans on this phone yet" / "You can scan a room to attach — or request design help without one below." with exactly one control on the screen: "Request without a scan".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:733-740; apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift:60-99; apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:125-138

Shots: c-33-engaged-design-request-again.png, g-30-designer-consultation.png, x-06-design-request.png

### F176 — Headings scroll under the status-bar clock [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** reach · **Seats:** H1

"WEDNESDAY · AUG 26" collides with the 9:41 clock on the scrolled home, "Guest" is sliced by the screen top on Profile, and at extra-large text the Dynamic Island pill itself occludes the proposal title "Aspen Loft — Living Room Refresh / Review by Sep 8".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:34-38; apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:38-41; apps/mobile/Patina/Patina/Features/Budget/BudgetView.swift:26-31

Shots: g-36b-profile-guest-scrolled.png, g-40b-home-active-room-clipped.png, x-02-profile-studio-rows.png

### F177 — Room summary renders light inside dark mode [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** reach · **Seats:** H1

With the system in dark appearance, the "YOUR SPACE / Here's what I see." summary renders on a cream ground with near-black text — the only screen in the walk to ignore the override — and its own headline washes out to near-invisible.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:22; apps/mobile/Patina/Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:44-64; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:154-166

Shots: d-01-home-top.png, d-06a-room-summary-light-locked.png

### F180 — Saved opens on the empty tab [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** wayfinding · **Seats:** H2

'Saved' opens on 'Boards,' which reads 'No boards yet' — the piece I actually saved lives one tap over, under 'All items,' a tab that doesn't default open.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:18; apps/mobile/Patina/Patina/Features/Collections/ViewModels/CollectionsViewModel.swift:101; apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:149-179

Shots: c-22-saved-signed-in.png, c-22b-saved-all-items.png

### F184 — Three icon systems in three stacked buttons [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** trust · **Seats:** H3

"Sign in with Apple" carries Apple's real logo; "Continue with Google" carries a bare typed letter "G"; "Continue with email" carries a stock colour emoji envelope — three different icon systems in three adjacent buttons.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:78-88

Shots: g-02-first-screen-after-splash.png

### F185 — Tour's middle step never renders [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** content · **Seats:** H3

The tour presents "Step 1 of 2 / Welcome to Patina" and "Step 2 of 2 / Your profile". The declared middle step — "Save what you love" / "Add pieces to a room with + Add — they follow you everywhere." — never appears, because its anchor `.addToRoom` mounts in no view and the model drops it after a 1.5s grace.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:186-196; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:227-253; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:838-856

Shots: g-09-home-tour-step1.png, g-10-home-tour-step2.png

### F186 — Says "Today" but never reads the hour [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** return · **Seats:** H3

The header reads "WEDNESDAY · AUG 26" over the literal word "Today". `TimeOfDay` exists with dawn/morning/day/afternoon/evening/night boundaries but is read only by the camera primer and two Companion greeting generators — never by the home.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyGreetingHeader.swift:35-48; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift

Shots: c-03-home-top-activeproject.png, g-12-home-discovering-top.png

### F188 — "Today" reads the same at 7:40am and 9pm [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** content · **Seats:** U1

The header is "WEDNESDAY · AUG 26" over the literal word "Today" with a "?" glyph — no greeting, no part-of-day, at any hour.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyGreetingHeader.swift:35-48; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift

Shots: c-03-home-top-activeproject.png, g-12-home-discovering-top.png

### F193 — Room stats show undefined abbreviations [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** content · **Seats:** U2

The room's stat row reads "0 ITEMS", "— MATCH", "0 IN AR" with no legend anywhere on screen (g-28b, c-24, d-06). "IN AR" never has a value other than 0 for any room, on any account, because no product in the catalog has a usdz model.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:192; apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:110; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:344-368; apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:235-243; supabase/migrations/00246_aesthete_quiz_bridge.sql:283

Shots: c-24-room-detail.png, d-06-room-detail.png, g-28b-room-view.png

### F195 — One screen ignores the dark-mode override entirely [verified]

**Severity:** S2 · **Confidence:** 0.9 · **Class:** content · **Seats:** U2

With the system/app appearance set to dark for the whole walk (confirmed by every surrounding shot: d-01, d-02, d-06, d-07, d-08, d-09, d-10 all render dark), the room-summary step "Here's what I see" (d-06a) renders in the app's light theme — cream ground, near-black text — sitting between two dark screens in the same unbroken session.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:22; apps/mobile/Patina/Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:44-64; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:154-166

Shots: d-01-home-top.png, d-06-room-detail.png, d-06a-room-summary-light-locked.png

### F160 — 'Get design help' offered to a client with a designer [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** content · **Seats:** H2, H3, U1

The empty Notifications screen reads 'Updates from your designer will land here' directly above a 'Get design help' button — I already have Leah, and four things are waiting on me elsewhere in the app that this screen doesn't mention.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:125-138; supabase/migrations/00388_proposal_send_dispatch_guard.sql:1258-1278

Shots: c-21-notifications-signed-in.png, d-10-notifications.png

### F168 — No way to share a room/board/status; no household or second-person concept [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** reach · **Seats:** D2

Grep finds exactly three ShareLink sites, all sharing the same single-product URL; there is no way to share a room, a board, the Saved list, or a project/proposal/decision status, and no invite, household, partner, or co-viewer concept anywhere in the schema or client (grepped: zero household/family_member tables across all migrations).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:117-130; apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:304-335; apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:285

### F171 — Raw internal column "CLIENT VIEW / Milestone" shown to client [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** content · **Seats:** D3

A stat labeled "CLIENT VIEW / Milestone" on the project detail exposes the raw client_visibility_tier column value as if it were content, on the same screen the column is meant to govern.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:108-126; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:128-151

Shots: c-08-project-detail.png

### F172 — Companion bubble clips the "Sign proposal" button [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** wayfinding · **Seats:** D3

On the proposal detail, the Companion bubble ("4 THINGS NEED YOUR EYE") sits directly on top of the "Sign proposal" button, visually clipping its label.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/ContentView.swift:166; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/CompanionSafeArea.swift:37-50; apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:33; apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift:137-151

Shots: c-11-proposal-detail-scrolled.png, c-11b-proposal-sign-act.png

### F179 — Dimensions and lead time never shown [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** trust · **Seats:** H2

products.dimensions exists in the schema but is never returned by the recommendations RPC or decoded by the app; there is no lead-time or availability field anywhere the catalog reads.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:12-58; supabase/migrations/00001_initial_schema.sql:35; supabase/migrations/00246_aesthete_quiz_bridge.sql:273-300; apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift:97

### F190 — Return has no instrumentation beyond app_open [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** return · **Seats:** U1

The app captures `app_open`, `session_started`, `today_next_move_tapped`, `today_editorial_story_tapped`, `today_active_room_tapped` and `studio_queue_item_activated`, but no push-received, push-opened, notification-permission-outcome or "new since last visit" event exists.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/Analytics/PostHogService.swift

### F191 — Coach-mark bubble hides the element it describes [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** content · **Seats:** U2

Tour step 1's bubble ("This is your Daily Room — picks and stories chosen for your space.") is a full-width opaque card that sits directly over the Next Move card it is explaining (g-09) — only the card's trailing arrow icon peeks out past the bubble's edge.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:227-253

Shots: g-09-home-tour-step1.png

### F192 — Filter chips imply catalog-wide scope but only filter one loaded page [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** content · **Seats:** U2

Tapping "Seating" changes the subtitle to "3 pieces curated for your space" (g-16), reading as if the catalog holds only 3 seating pieces — the chips filter the same ≤20 rows already on screen; the RPC's `p_category` parameter is never sent.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:48-51; apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:105; apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:40-58

Shots: g-16-filter-chip-seating.png

### F194 — One action is offered under three different names, stacked [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** wayfinding · **Seats:** U2

The empty room's body copy reads "We've already found pieces that would fit this space. Browse your Daily Room to start building this room.", directly above a button labeled "Browse Picks for This Room", directly above a link labeled "SEE RECOMMENDATIONS →" (g-28b, c-24, d-06) — three different phrasings stacked for what appears to be one underlying destination.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:302-330

Shots: c-24-room-detail.png, d-06-room-detail.png, g-28b-room-view.png

### F196 — Filters are client-side over twenty rows [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** purchase · **Seats:** U3

Tapping "Seating" changes the subtitle to "3 pieces curated for your space" — the chips filter the twenty rows already fetched rather than sending p_category, and there is no price filter, no sort and no pagination control.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:48-51; apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:105; apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:40-58

Shots: g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png

### F197 — Saved rows carry no note, room or save date [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** return · **Seats:** U3

The only saved row reads "ROOM & BOARD / Heirloom Oak Dining Table / $4200" with a chevron. No room, no date saved, no note, no availability, no price-change marker — and TableItemModel.notes exists with no UI that writes it.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/TableItemModel.swift:41-42; apps/mobile/Patina/Patina/Core/Network/RoomsAPIClient.swift:125

Shots: c-22b-saved-all-items.png

### F198 — Shipping push exists but never reaches a client order [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** return · **Seats:** U3

fulfillment-notify can push "confirmed | in_production | shipped | delivered | eta_change | substitution" to a homeowner's device, but only when an admin operator presses send in the admin portal, and only for fulfillment_orders on the designer-sourced BOH rail — never for direct_orders.

*Corrections applied from: refs←Code-truth (33)*

Refs: supabase/functions/_shared/fulfillment-templates.ts:31-37; supabase/functions/fulfillment-notify/index.ts:3-8

### F201 — No receipts or payment history in the app [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** return · **Seats:** U3

The only payments UI is "PAYMENTS / No payments recorded yet."; there is no receipts list, no paid-invoice section on the list ("AWAITING PAYMENT (1)" is the only section), and the settle banner says the receipt "is on its way to your inbox."

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:96-110

Shots: c-12-invoices-list.png, c-13-invoice-detail.png, c-13b-invoice-detail-scrolled.png

### F202 — The deposit is for a table the app never shows [verified]

**Severity:** S2 · **Confidence:** 0.85 · **Class:** return · **Seats:** U3

"WHAT'S INCLUDED / Dining table — deposit (50%) $2,650.00 / Primary bedroom nightstands (pair) — deposit (50%) $1,600.00". Neither the dining table nor the nightstands appear anywhere else in the app — not on the project, not in a room, not as a piece, not as an order.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:195-222; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectDetailView.swift:19-36

Shots: c-08-project-detail.png, c-13b-invoice-detail-scrolled.png

### F158 — An unexplained percentage is the only progress signal [verified]

**Severity:** S2 · **Confidence:** 0.833 · **Class:** trust · **Seats:** H1, H3, U1

Profile's stat row reads "1 ROOMS / 1 SAVED / 63% MATCH" where the same device showed "48% MATCH" before sign-in, with nothing on screen saying what is matched or why it moved; the taste portrait carries an unlabelled progress bar at roughly 45% under "WHY PATINA SEES THIS".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Profile/Views/ProfileView.swift:203-222

Shots: c-26-profile.png, g-08-quiz-result.png, g-15-browse-pieces-grid.png, g-28b-room-view.png, g-36-profile-guest.png

### F165 — Onboarding never frames the app as where a client works with their designer [verified]

**Severity:** S2 · **Confidence:** 0.8 · **Class:** wayfinding · **Seats:** D2

"Welcome home / Start with a piece you love," three onboarding pages ("Every room tells a story", "See it in your space", "Find your style first"), a five-question style quiz, a two-step tour, and a Companion intro — roughly 14 taps — none of which mention a designer, a project, or an existing relationship. The one fast lane for an existing account is a small "Have a password? Sign in" link under four stacked buttons.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:75-130

Shots: g-02-first-screen-after-splash.png, g-09-home-tour-step1.png, g-11-companion-intro-card.png

### F167 — The one push permission prompt fires silently, unexplained, unrelated to money [verified]

**Severity:** S2 · **Confidence:** 0.8 · **Class:** return · **Seats:** D2

Authorization is requested exactly once per install, automatically after the first successful design-request submission, with no pre-permission screen and no in-app rationale copy anywhere; a client who never submits a request is never asked at all.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/API/PushTokenService.swift:87-108; apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift:68-80

### F169 — Shared links can't open the app even when installed (no associated domains) [verified]

**Severity:** S2 · **Confidence:** 0.8 · **Class:** reach · **Seats:** D2

The app declares no com.apple.developer.associated-domains entitlement and Info.plist registers only the custom scheme patina:// — so the https://app.patina.cloud/library/<id> link every share produces always opens Safari, never the app, even on a device with Patina already installed.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Info.plist:15-27; apps/mobile/Patina/Patina/Patina.entitlements:4-11; apps/mobile/Patina/Patina/Features/Shared/PatinaPortalLinks.swift:14-22

### F178 — The tour's save-loop step never renders [verified]

**Severity:** S2 · **Confidence:** 0.8 · **Class:** wayfinding · **Seats:** H1

The shipped tour runs "Step 1 of 2 / Welcome to Patina" then "Step 2 of 2 / Your profile"; the declared middle step — "Save what you love" / "Add pieces to a room with + Add — they follow you everywhere." — is dropped because its anchor mounts in no view, and the "+ Add" control it names does not exist on the shipped home.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:186-196; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:227-253; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:838-856

Shots: g-09-home-tour-step1.png, g-10-home-tour-step2.png

### F187 — Room summary ignores dark mode [verified]

**Severity:** S2 · **Confidence:** 0.8 · **Class:** content · **Seats:** H3

The "YOUR SPACE / Here's what I see." summary step, with "Rescan" and "This Looks Right", renders on a cream background with near-black text while the rest of the app is in dark mode — the only screen observed to ignore the system/app appearance override.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:22; apps/mobile/Patina/Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:44-64; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:154-166

Shots: d-06-room-detail.png, d-06a-room-summary-light-locked.png

### F199 — Push routes exist for money that nothing emits [verified]

**Severity:** S2 · **Confidence:** 0.8 · **Class:** wayfinding · **Seats:** U3

NotificationRouter handles entity types proposal and invoice, and the code states no edge function emits them yet; the patina:// scheme reaches only auth, room and piece, so an emailed or texted link can never open an invoice or a proposal.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/App/DeepLinking/NotificationRouter.swift:60-88; apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift:75-92

### F162 — No way to compare two pieces side by side [verified]

**Severity:** S2 · **Confidence:** 0.775 · **Class:** wayfinding · **Seats:** D3, H2

There's no compare surface anywhere — code-read confirmed (grep) and consistent with what the piece-detail screen shows when it loads at all: Share, Save, a maker-story card, no comparison of any kind.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:86-138; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:338-399; apps/mobile/Patina/Patina/Core/Models/TableItemModel.swift:41-42

### F170 — Notes field exists in data, never exposed in UI [verified]

**Severity:** S2 · **Confidence:** 0.75 · **Class:** content · **Seats:** D3

TableItemModel.notes and CreateSavedItemPayload.notes both exist in the data model; no view anywhere writes to either field.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/TableItemModel.swift:41-42; apps/mobile/Patina/Patina/Core/Network/RoomsAPIClient.swift:125

### F183 — The link I'd share opens the wrong app under the wrong name [verified]

**Severity:** S2 · **Confidence:** 0.75 · **Class:** trust · **Seats:** H2

The one thing I can share — a piece — hands whoever I send it to a link titled 'Patina Designer Portal — app.patina.cloud.' The app has no associated-domains entitlement, so even if my husband has this app installed, that link opens Safari, not his copy of Patina.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Info.plist:15-27; apps/mobile/Patina/Patina/Patina.entitlements:4-11; apps/mobile/Patina/Patina/Features/Shared/PatinaPortalLinks.swift:14-22

Shots: g-19-share-sheet.png

### F200 — No payment marks before the Checkout hand-off [verified]

**Severity:** S2 · **Confidence:** 0.7 · **Class:** trust · **Seats:** U3

The only statement of how payment works is the caption "Pay securely by card or bank transfer." — no Apple Pay mark, no card marks, no mention that payment opens a Stripe page, and no surcharge preview before the hand-off.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:213-221

Shots: c-13b-invoice-detail-scrolled.png

### F189 — Two silent fourteen-day decays punish absence [verified]

**Severity:** S2 · **Confidence:** 0.65 · **Class:** content · **Seats:** U1

A terminal or matched design request stops being promoted 14 days after its stage anchor, and the Companion mark graduates to its calm "learned" state at 14 days — neither is explained on any screen.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:340-359; apps/mobile/Patina/Patina/Features/Companion/Models/CompanionCoachingModel.swift:56-73

Shots: c-31-engaged-home-top.png

### F173 — sign_proposal sends no confirmation email [verified]

**Severity:** S2 · **Confidence:** 0.6 · **Class:** trust · **Seats:** D3

sign_proposal (00400_proposal_signature_authority.sql) resolves the signature and kicks off the project server-side, but the client's own API layer carries a carry-forward code comment stating the RPC does not send a confirmation email on sign.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift:388-412

### F166 — The cheapest, most binding client act (a decision) has no confirmation step [contested]

**Severity:** S2 · **Confidence:** 0.55 · **Class:** trust · **Seats:** D2

Answering a decision is 3 taps with no confirmation and is immediately final; signing a proposal is 6 taps behind a full e-sign sheet, and paying an invoice is 5 taps behind a Stripe handoff — the smallest, most casual-feeling act is the one with zero safety net.

Refs: artifacts/ios-daily-return-2026-08-26/research/03-walk-observations.md E2 'Money acts and their tap cost'

Shots: c-11c-sign-sheet.png, c-18-decision-detail.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED on the confirmation claim. 'Choose this' calls viewModel.beginSelection(optionId:) which sets pendingOptionId and presents DecisionConsentSheet (.sheet at DecisionDetailView.swift:44-61) — a real confirm step headed 'CONFIRM YOUR CHOICE' with the option title, the line 'Approving sends your decision to your designer and unblocks any work waiting on it.', an optional 'Add my signature' e-sign toggle, an Approve button and Cancel. The walk's '3 taps, no confirmation' count is wrong. A 'talk it over' affordance also exists (discussAction -> .threadDetail), but only renders when the decision resolves a project comms thread — the seed has none. What survives: no defer, no 'neither', and no visible way to ask when there is no thread.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.

### F181 — Saved can disappear from my only nav menu [contested]

**Severity:** S2 · **Confidence:** 0.55 · **Class:** wayfinding · **Seats:** H2

The Companion panel's 'Saved' row is present when I have 1 saved piece ('1 SAVED PIECE'), but the code gates it on a local room-items count, not the same count the row displays — a piece saved from Browse or the piece detail can leave the row absent entirely.

Refs: apps/mobile/Patina/Patina/Features/Companion/Services/CompanionActionRows.swift:219; apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:265

Shots: c-05-companion-panel-client.png

**Contested** —
- REFUTED by Code-truth (33): REFUTED. The claim rests on tableItemCount being the room-scoped sum written by DailyRoomView:265 — but the Companion never reads that value. CompanionOverlay.enrichedContext OVERWRITES it on every panel open with a live fetchCount(FetchDescriptor<TableItemModel>()) over the whole store (:173-197), and expandedView binds enrichedContext before building the rows (:522-527). The file even documents that updateTableItemCount has no effective callers. A piece hearted on the browse grid or the piece detail therefore DOES surface the Saved row. F14 (no row at zero) is the true version of this finding.
- CONFIRMED by Canon-truth (34): No already_ruled/july_status citation on file; cross-checked against instruments.md SS6 (C1-C29) and canon digest SS1-SS6 (R01-R33, U01-U46) - this does not re-report any DELIVERED-VERIFIED/DELIVERED-CODE July item, does not contradict a Kody ruling, and is not named in DELIVERY.md's residual list. Fresh finding for this program.

### F182 — AR can never work — usdz_url is always null [verified]

**Severity:** S2 · **Confidence:** 0.55 · **Class:** trust · **Seats:** H2

The room's 'IN AR' stat reads 0 in every shot I have; the RPC that feeds the catalog hard-codes usdz_url to NULL, so hasARModel is false on every code path — the AR button never draws and the Companion's 'Try in your room' says '3D model not available.'

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:192; apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:110; apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:344-368; apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:235-243; supabase/migrations/00246_aesthete_quiz_bridge.sql:283

Shots: c-24-room-detail.png

### F203 — Saved renders the price as "$4200" [verified]

**Severity:** S3 · **Confidence:** 0.95 · **Class:** content · **Seats:** H1, H3, U3

The saved row reads "ROOM & BOARD / Heirloom Oak Dining Table / $4200" while the same piece on the browse grid reads "$4,200".

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/TableItemModel.swift:104-109; apps/mobile/Patina/Patina/Core/Models/SavedItem.swift:78-90

Shots: c-22b-saved-all-items.png, g-15-browse-pieces-grid.png, g-22b-saved-all-items.png

### F206 — Launch screen is blank white, no wordmark [verified]

**Severity:** S3 · **Confidence:** 0.95 · **Class:** trust · **Seats:** D2

Cold launch shows a pure white screen with no logo, no wordmark, no color, for roughly 1.5s before the auth gate — captured identically on two separate cold launches.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:521; apps/mobile/Patina/Patina/Features/Splash/Views/SplashView.swift:18-36

Shots: g-01-splash.png

### F208 — "Sign in" drawn as a circle, label overflowing [verified]

**Severity:** S3 · **Confidence:** 0.95 · **Class:** content · **Seats:** H1

The guest empty state's "Sign in" control renders as a circle whose label extends past both edges of the circle.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:140-155

Shots: g-29-notifications-guest.png

### F205 — "Installation & Styling" truncated to the verb "Install" [verified]

**Severity:** S3 · **Confidence:** 0.9 · **Class:** content · **Seats:** D1

The project card shows "PHASE / Install" while the accessibility label carries the full "Installation & Styling"; the project detail one tap away reads "Currently: Installation & Styling". There is no ellipsis, so the phase reads as an instruction.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/PhaseDisplay.swift:48-61; apps/mobile/Patina/Patina/Features/Projects/Views/ProjectListView.swift:166

Shots: c-07-projects-list.png, c-08-project-detail.png

### F210 — Coach-mark buttons use the app's only system blue [verified]

**Severity:** S3 · **Confidence:** 0.9 · **Class:** content · **Seats:** U2

"Skip" and "Next"/"Done" render in iOS system blue (#007AFF) on both tour steps (g-09, g-10) — the only blue anywhere in an app whose entire palette is cream/charcoal/mocha/clay.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:227-253

Shots: g-09-home-tour-step1.png, g-10-home-tour-step2.png

### F211 — Price format changes between the grid and Saved [verified]

**Severity:** S3 · **Confidence:** 0.9 · **Class:** content · **Seats:** U2

The same piece prices as "$4,200" on the browse grid and "$4200" (no thousands separator) on its Saved row (g-22b).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Core/Models/TableItemModel.swift:104-109; apps/mobile/Patina/Patina/Core/Models/SavedItem.swift:78-90

Shots: g-22b-saved-all-items.png

### F06 — Photographs do not match the pieces [verified]

**Severity:** S3 (was S0) · **Confidence:** 0.892 · **Class:** trust · **Seats:** D1, D3, H1, H3, U2, U3

The local dev seed illustrates catalog rows with unrelated Unsplash stock photography (supabase/seed/products.sql), so the browse grid shows a ladder-back chair for 'Live-Edge Coffee Table' and green velvet chairs for 'Heirloom Oak Dining Table'. Seed-data defect; no production catalog was observed.

*As originally filed: "Heirloom Oak Dining Table" (Room & Board) is illustrated with a white table ringed by green velvet chairs; "Live-Edge Coffee Table" (Lee Industries) is illustrated with an old ladder-back chair standing on grass; the same green-velvet image reappears as the saved item's thumbnail.*

*Corrections applied from: severity←Code-truth (33), observation←Code-truth (33), refs←Code-truth (33)*

Refs: supabase/seed/products.sql:6-14; supabase/migrations/00246_aesthete_quiz_bridge.sql:281-282

Shots: c-22b-saved-all-items.png, g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png, g-22b-saved-all-items.png

### F204 — Launch screen is blank white, no wordmark [verified]

**Severity:** S3 · **Confidence:** 0.85 · **Class:** content · **Seats:** H1, H3

The launch screen is pure blank white — no wordmark, no strata mark, no colour — before the warm cream ground of the app appears. Captured identically on two separate cold launches.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:521; apps/mobile/Patina/Patina/Features/Splash/Views/SplashView.swift:18-36

Shots: g-01-splash.png, g-02-first-screen-after-splash.png

### F209 — 'Today' never becomes 'good evening' [verified]

**Severity:** S3 · **Confidence:** 0.8 · **Class:** content · **Seats:** H2

The header always reads the literal word 'Today,' morning or night. I checked this at the default light-mode time and again in the dark-mode lane's identical layout — same word.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Home/Views/DailyGreetingHeader.swift:35-48; apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift

Shots: c-03-home-top-activeproject.png, d-01-home-top.png

### F213 — Marketplace copy says "curated" [verified]

**Severity:** S3 · **Confidence:** 0.8 · **Class:** content · **Seats:** U3

The Browse header subtitle reads "10 pieces curated for your space" (and "curated for this room" when scoped).

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift:52-59

Shots: g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png

### F207 — Companion intro pre-empts first-launch tour step 2 [verified]

**Severity:** S3 · **Confidence:** 0.75 · **Class:** wayfinding · **Seats:** D2

The captured tour shows "Step 1 of 2" (g-09), not the three steps the code declares; the tour's own middle step (anchor .addToRoom, "Save what you love — Add pieces to a room with + Add") has no view to attach to and the Companion intro sequences in ahead of it, so the shipped tour is functionally two steps and the app's save-loop explanation is never spoken.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:186-196; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:227-253; apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:838-856

Shots: g-09-home-tour-step1.png

### F212 — The Companion's own headline changes wording for the same panel [verified]

**Severity:** S3 · **Confidence:** 0.7 · **Class:** content · **Seats:** U2

The identical "where next" panel is titled "Where to begin?" for a 0-room guest (g-14b) and "Where to next?" for a 1-room activeProject client (d-09, x-09) — two headlines for what is functionally the same menu of Companion rows.

*Corrections applied from: refs←Code-truth (33)*

Refs: apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:221-231

Shots: d-09-companion-panel.png, g-14b-companion-next-steps.png, x-09-companion-panel.png

