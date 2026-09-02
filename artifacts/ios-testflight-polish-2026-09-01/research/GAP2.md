# GAP2 — gap-fill: Studio reads (Projects / Budget / Ordered / Documents) on lane C

Device: clone C `670DE752-BA1B-40C1-899E-57B50D5743B5` (tfp-C), signed in as `client@patina.dev`,
`-DeploymentTarget local`. Shots: `shots/GAP2/`.

## Session log

- 19:09 Launched `xcrun simctl launch 670DE752… cloud.patina.app -DeploymentTarget local` → pid 48063.
- 19:09 HID preflight PASS: `describe_screen` = signed-in Daily Return home (greeting "Good evening.",
  "SINCE YOU WERE LAST HERE · FRI, AUG 28", bell "3 unread", Studio "5 waiting"). Tapped
  `companion.bubble` (201,756) → Companion panel "Where to next? / 5 things need your eye."
  (`00-preflight-before.png` → `01-preflight-after-companion.png`). Synthetic input lands.
- ⚠ 19:10 ENVIRONMENT CONTENTION (not an app finding): a sibling audit lane is driving the same clone.
  `ps` shows `Patina … -DeploymentTarget local -PatinaFlags house-widget` (pid 52327) — not my launch
  args — and pids churned 48063 → 51841 → 52327 within a minute; one `describe_screen` returned a
  ProfileView/StudioHub tree while my screenshot showed the Companion panel, and a later screenshot
  showed SpringBoard. All GAP1/3/5/6/7 shot dirs were created at 19:09-19:10. Mitigation: relaunch with
  my own args before each leg and cross-check every screenshot against a same-instant AX tree.

- 19:12 Relaunched with my args (pid 55862). Home OK. Tapped `DailyRoomView.StudioButton` (338,140)
  → Studio hub (`04-studio-hub.png`), swiped up (`05-studio-hub-scrolled.png`).

### GAP2-01 — Companion orb AND its caption float over the Studio hub list with no scrim; text collides
- area companion / visual-system · severity **major** · testerVisible true · confidence 0.95 · effort S
- where: Studio hub (Profile/StudioHub), `shots/GAP2/04-studio-hub.png`, `05-studio-hub-scrolled.png`
- evidence: In `04` the dark 64pt orb sits on the "Invoice / $4,250.00 remaining / Due Sep 6" row and the
  orb's mono caption **"5 THINGS NEED YOUR EYE"** is drawn *outside* the orb, directly over the row —
  it reads as `$4,250.00 remaining` with `5 THINGS NEED YOUR EYE` overprinted on `Due Sep 6`. After a
  swipe (`05`) the same caption overprints "2 shared invoices" and the orb covers the right half of
  "2 shared proposals". The caption has no background, blur or shadow — it is unstyled text on top of
  list text of similar size and weight.
- why: the single most-repeated element in the app renders as broken overprint on a money screen.
- fix: give the caption a material/scrim capsule (or hide it while a scroll view is under it), and add
  bottom content inset ≥ orb height + caption + 16 so list rows never park under it.

### GAP2-02 — Studio hub rows are AXGenericElement, not buttons
- area accessibility · severity major · testerVisible true (VoiceOver users) · confidence 0.95 · effort S
- where: `describe_screen` of Studio hub; `StudioQueueBuilder.swift`
- evidence: every row — `"Ordered, 1 piece on its way, Shipped"`, `"Active projects, Birch Hollow and 2
  more"`, `"Invoices, 2 shared invoices, 1 paid"` — comes back `"type": "GenericElement"`,
  `"role": "AXGenericElement"`, with only `help` = `"Opens Ordered."`. The Daily Return home rows by
  contrast are `AXButton`. VoiceOver therefore never announces "button" and gives no activation cue.
- fix: `.accessibilityAddTraits(.isButton)` (or make the row a Button) on the StudioHub row cell.

### GAP2-03 — Accessibility label says "1 categories" (broken pluralisation, developer word)
- area accessibility / copy · severity minor · testerVisible true (VoiceOver) · confidence 0.98 · effort S
- where: Studio hub section headings, `describe_screen`
- evidence verbatim: `"In progress, 1 categories"` and `"Conversation, 2 categories"`. The visible label
  is "In progress" + a count badge "1"; the AX label invents the noun **"categories"** — a schema word
  no homeowner uses — and does not singularise at 1.
- fix: `^[\(n) item](inflect: true)` and a client-facing noun ("1 thing in progress").

## ⚠ DEVICE DEVIATION (recorded up front, like GAP3/GAP4/GAP5)

Six gap lanes (GAP1, GAP2, GAP3, GAP6, GAP7 and originally GAP4) were all handed the same clone
`670DE752…` (tfp-C). With 3+ agents tapping one simulator my taps landed on whatever the other lanes
had navigated to — four consecutive scripted attempts to reach the Studio hub ended on Proposals, a
Room detail and SpringBoard. Rather than touch another lane's device, I created my own:

| | |
|---|---|
| device | **`FD94BFFD-6BF0-4A76-B3C9-FE7CD8F3A7F3`** — `tfp-GAP2`, iPhone 17 Pro, iOS 26.5 |
| build | the steward's ONE signed Debug build (`.build/DerivedData/…/Patina.app`). No `CODE_SIGNING_ALLOWED=NO`. |
| settings | `status_bar override --time 9:41 …`; `ui … appearance light`; window open in Simulator.app (not headless) |
| launch | `xcrun simctl launch FD94BFFD-… cloud.patina.app -DeploymentTarget local` (repeated every relaunch) |
| account | signed in through the app's own password path as `client@patina.dev` / `password123` (local stack) |
| tfp-A/B/C/P | untouched after 19:14 |

Setup facts that matter for reading the shots below:
- Fresh UserDefaults ⇒ the device ran first-run onboarding. I dismissed the intro, and after the style
  quiz would not advance I set `hasCompletedOnboarding`/`hasSeenThreshold` to true via
  `simctl spawn … defaults write` (test setup on my own device; no code, no prod), then tapped
  "Not now" on the notification prime. `26-home.png` is the resulting signed-in Daily Return home.
- Consequence: this home has **no** "SINCE YOU WERE LAST HERE" band (no prior visit recorded) — every
  other data surface (invoice INV-2026-0142, Leah Hartwell, 4 rooms, Aspen Loft) matches lane C.
- Automation note (NOT an app finding): a zero-duration `idb ui tap` does not register on the
  onboarding style-quiz option cards; `--duration 0.12` does. All taps below use a held tap.


---

## Leg 1 — Ordered (`30-37` list, `38-40` detail)

**GOOD.** `Your orders` reads clean: eyebrow ORDERED + serif h3, a single card with a four-stage ladder
(CONFIRMED · IN PRODUCTION · **SHIPPED** · DELIVERED), a plain-English line "Shipped Aug 28 · arriving
Sep 7.", and one action. The detail adds "Message Leah / See the piece / Report a problem" as 44 pt
rows with chevrons, and an accountability paragraph. "See the piece" navigates correctly to the product
screen (`40-see-the-piece.png`) — the loop closes.

### GAP2-04 — "Write to the address below" and there is no address below
- area money / copy · severity **major** · testerVisible true · confidence 0.95 · effort S
- where: Order detail, `shots/GAP2/38-order-detail.png`; copy comes from `service.terms?.paragraph`
  rendered by `OrderDetailView.swift:206-219` (`responsibility`)
- evidence verbatim: **"Patina is responsible for this order — for getting it to you, and for putting it
  right if it arrives damaged or isn't what was described. Write to the address below and a person will
  answer. If a designer is working on your home, they are copied on anything you raise."** Nothing
  follows the paragraph — it is the last element on the screen. The contact does exist in the model
  (`OrderDetailAction.contact(text:)`, `OrderDetailView.swift:192-202`) but on this order it resolved to
  the `.track`/`mailto` branch — `rowButton("Report a problem") { openURL(url) }`, line 191 — so the row
  shows only the words "Report a problem", **above** the paragraph, and no address renders anywhere.
- why: this is the liability paragraph. A tester whose sofa arrives damaged reads a promise that points
  at something that is not on the screen — and the paragraph is the one place the app makes a
  commitment.
- fix: render the contact under the paragraph in the `.contact` shape (or change the copy to name the
  "Report a problem" row above it). Never ship a paragraph whose deixis ("below") is not satisfied.

### GAP2-05 — "Report a problem" is a dead tap: no navigation, no sheet, no feedback
- area money / navigation · severity **major** · testerVisible true · confidence 0.85 · effort M
- where: Order detail row, `shots/GAP2/38-order-detail.png` → `39-report-a-problem.png` (identical)
- evidence: tapped the row at its frame centre (40,401)+(322×44) → centre (201,423). 2 s later the AX
  tree and the screenshot are byte-for-byte the same screen. Control test: the row 45 pt above it
  ("See the piece", centre (201,378)) navigated to the product screen on the very next tap
  (`40-see-the-piece.png`) — so taps land in that column. The handler is
  `rowButton("Report a problem") { openURL(url) }` (`OrderDetailView.swift:191`); the URL is a
  `mailto:` the Simulator has no handler for, and `openURL` is called without the completion overload,
  so a failure is silent.
- why: the escape hatch for "my furniture arrived broken" does nothing and says nothing. On a real
  iPhone with no Mail account configured the outcome is the same class of dead end.
- fix: use `openURL(url) { accepted in … }` and fall back to an in-app contact sheet (or copy the
  address to the clipboard with a confirmation) when the system cannot open it.

### GAP2-06 — Order-stage ladder: "IN PRODUCTION" and "SHIPPED" labels nearly touch
- area visual-system · severity polish · testerVisible true · confidence 0.8 · effort S
- where: `shots/GAP2/37-ordered-list.png`, `38-order-detail.png` (the four-segment ladder)
- evidence: the four stage labels are left-aligned under equal-width bars. Gutters read ~30 px, ~30 px
  and ~30 px except between **IN PRODUCTION** and **SHIPPED**, which is ~4 px — the two run together as
  one word at a glance, and it is exactly the pair that matters (past stage vs current stage).
- fix: centre each label on its segment, or shorten to "PRODUCTION", or drop to a smaller tracking-tight
  mono at this width.

### GAP2-07 — No tracking number, carrier or link on a "Shipped" order (data-dependent)
- area money · severity minor · testerVisible true · confidence 0.7 · effort M
- where: `shots/GAP2/38-order-detail.png`; `OrderDetailAction.track(label:url:)` exists in
  `OrderDetailView.swift` but did not render for this order
- evidence: the Studio row promises **"Ordered · Where your pieces are"**; the detail's entire answer is
  "Shipped Aug 28 · arriving Sep 7." A `.track` action shape exists in code, so the absence here is the
  seeded order carrying no tracking URL — but a first-round tester cannot tell the difference between
  "we have no tracking for this" and "the app forgot to show it".
- fix: when no tracking URL exists, say so in one line ("No tracking link yet — Leah will update this")
  rather than leaving the promise unanswered.

---

## Leg 2 — Projects (`41-42` list, `43-45` detail)

**GOOD.** The project detail is the strongest screen I saw: eyebrow + serif title, a BUDGET/STATUS pair,
one clear "Message your designer" affordance, and a properly drawn phase timeline (connected dots,
sage = Completed, gold = In Progress, grey = Upcoming) with real dates. It reads like a designed screen,
not a data dump.

### GAP2-08 — the project's empty sections render as two orphan negations in the screen's only outlined box
- area studio-designer / state-honesty · severity **major** · testerVisible true · confidence 0.9 · effort M
- where: `shots/GAP2/44-project-detail.png`, `45-project-detail-bottom.png`;
  `ProjectDetailCopy.swift:91-98` (`missingSectionLines`), rendered from
  `ProjectsViewModel.swift:54-79` (`load(projectId:)`)
- evidence: the last element of the Aspen Loft Refresh screen is a bordered card whose entire content is
  two sentences — **"No payment schedule yet."** and **"No furnishings list yet."** — with no heading,
  no icon, no action, and no explanation. It is also the only *stroked* card on a screen where every
  other card is a filled surface, so it reads as a warning box.
- why: a homeowner sees a boxed pair of negatives at the end of their project and cannot tell whether
  the designer hasn't done the work or the app failed to load it.
- fix: fold each missing section into its own titled section with the same empty-state treatment used
  elsewhere (`PatinaEmptyState`), or omit the section entirely; never stack bare negations in a box.

### GAP2-09 — every project-detail read is `try?`, so a half-failed load is indistinguishable from an empty project (C4-05, now sim-observed)
- area studio-designer / state-honesty · severity **major** · testerVisible true · confidence 0.9 · effort M
- where: `Patina/Features/Projects/ViewModels/ProjectsViewModel.swift:57-63` and `:70-79`
- evidence, verbatim from the source:
  `async let phasesTask   = (try? await ProjectsAPIClient.shared.listPhases(projectId:)) ?? []`
  `async let ffeTask      = (try? await ProjectsAPIClient.shared.listFFEItems(projectId:)) ?? []`
  `async let invoicesTask = (try? await InvoicesAPIClient.shared.hasInvoices(forProject:)) ?? false`
  `async let documentsTask= (try? await DocumentsAPIClient.shared.hasDocuments(forProject:)) ?? false`
  … and the only failure branch is `if self.project == nil { self.error = "Couldn't load this project" }`.
  Six of the seven reads swallow their error into an empty default. The rendered consequence is
  GAP2-08: a timed-out FF&E read and a genuinely empty FF&E list produce the identical sentence
  "No furnishings list yet.", and a failed `hasInvoices` silently *removes* the Invoices row — the pay
  affordance disappears with no notice.
- why: on a flaky first-launch network a tester can be shown a project that looks abandoned, with the
  payment route missing, and nothing tells them to retry.
- fix: track per-section outcome (loaded / empty / failed) and render a retry affordance for `failed`;
  at minimum never hide the Invoices row on a read failure.

### GAP2-10 — Projects list title is a bare count where every sibling screen has a sentence
- area copy · severity minor · testerVisible true · confidence 0.85 · effort S
- where: `shots/GAP2/42-projects-list.png`
- evidence: eyebrow **PROJECTS**, h3 title **"3 projects"**. The sibling screens reached from the same
  hub read "Your orders", "Shared with you", "Your design proposals", "Your notifications". Only this
  one puts a machine count in the serif title slot, and it duplicates information the three cards
  already show.
- fix: "Your projects" as the title; keep the count as a mono sub-line if it earns its place.

### GAP2-11 — Search field above three rows; project cards carry no differentiating information
- area studio-designer / visual-system · severity polish · testerVisible true · confidence 0.75 · effort S
- where: `shots/GAP2/42-projects-list.png`
- evidence: a full-width "Search projects" field sits above exactly three cards, occupying the prime
  slot under the title. Each card carries only name + the identical chip "In Progress" + "TOTAL
  $185,000 / $420,000 / $120,000". Nothing says which project needs the tester, what phase it is in, or
  when anything is due — all of which the detail screen has.
- fix: hide the search below a threshold (≥8 projects) and put the current phase + next date on the card.

### GAP2-12 — "TOTAL $420,000" with no qualifier on a homeowner-facing card
- area money / copy · severity minor · testerVisible true · confidence 0.7 · effort S
- where: `shots/GAP2/42-projects-list.png` vs `44-project-detail.png`
- evidence: the list card labels the figure **TOTAL**; the detail screen labels the same class of figure
  **BUDGET** ("$120,000"). Same number, two nouns, one screen apart — and "TOTAL" on a card the client
  owns invites the reading "this is what I owe".
- fix: use one word (BUDGET) in both places.

---

## Leg 3 — Budget (`46-49`)

**GOOD.** "Project budget $120,000 · your designer's figure" is exactly the right voice — it attributes
the number instead of asserting it. The BILLED / PAID / OUTSTANDING triad with sage for paid and gold
for outstanding is legible and consistent between the summary and the project block.

### GAP2-13 — the same two amounts are typeset in two typefaces and two formats, 300 pt apart
- area visual-system / money · severity **major** · testerVisible true · confidence 0.95 · effort S
- where: `shots/GAP2/48-budget.png`, `49-hub-bottom-inset.png`
- evidence: the summary tile reads **$2,500** and **$4,250** in the serif display face with old-style
  figures and no cents. The Aspen Loft block directly below reads **$2,500.00** and **$4,250.00** in the
  sans with lining figures and cents. Identical values, one screen, two number systems. The invoice rows
  under them use a third combination (sans, cents, right-aligned).
- why: money is where a homeowner looks hardest; two renderings of the same figure reads as two
  different apps, and the reader pauses to check they are the same number.
- fix: one currency formatter and one numeral face for money app-wide (cents shown or not, chosen once).

### GAP2-14 — "ACROSS YOUR PROJECTS" lists one of the tester's three projects, with no line for the other two
- area money / state-honesty · severity **major** · testerVisible true · confidence 0.8 · effort M
- where: `shots/GAP2/48-budget.png` vs `42-projects-list.png`
- evidence: the Projects screen lists **Birch Hollow ($185,000), Marrow & Vale Residence ($420,000),
  Aspen Loft Refresh ($120,000)**. The Budget screen's header says **ACROSS YOUR PROJECTS** and the only
  project section is **Aspen Loft Refresh**; the summary $6,750 / $2,500 / $4,250 is exactly Aspen
  Loft's own arithmetic. Birch Hollow and Marrow & Vale are absent — no row, no "nothing billed yet"
  line, no explanation.
- why: a tester who owns three projects reads a plural promise and a singular answer, and cannot tell
  whether the other two are un-billed or failed to load — the same empty-vs-error ambiguity as GAP2-09.
- fix: render a row for every project the client has, with "Nothing billed yet" where that is the truth.

### GAP2-15 — invoice rows lead with the machine number and drop the due date the home screen shows
- area money / copy · severity minor · testerVisible true · confidence 0.8 · effort S
- where: `shots/GAP2/48-budget.png`
- evidence: the row's primary line is **"INV-2026-0142"** with the secondary "Awaiting payment". The
  Daily Return card for the same invoice reads "Your invoice is due. INV-2026-0142. $4,250.00 · due
  Sep 6." — the home surface knows the due date; the money screen drops it and promotes the accession
  number to the title slot.
- fix: lead with "Due Sep 6 · Awaiting payment" and demote INV-2026-0142 to the caption.

---

## Leg 4 — Documents / DocumentQuickLook — NOT REACHABLE with the seeded client (coverage gap + findings)

I could not open a document, so the QuickLook chrome and its Done control are **not sim-verified**.
Why, with evidence:

- The Studio hub's **"Money & documents"** section contains exactly four rows — Ordered, Proposals,
  Invoices, Budget (`describe_screen`: `"Money & documents, 4 categories"`). There is **no Documents
  row**. `StudioQueueBuilder.swift:536-562` only emits `documentRecordRow` when documents exist, and
  `ProjectDetailLinks.swift:96-105` only shows the project's Documents link when `hasDocuments` is true.
- Local DB (read-only): `select count(*) from public.project_documents` → **3**, and every row has
  `client_visible = f` **and** an empty `storage_path` and `url`
  (e.g. `d0c00000-…-0001 "Service Agreement — Aspen Loft" pdf/contract, storage_path ''`).
  `DocumentsAPIClient.listDocuments()` filters `.eq("client_visible", value: true)`, so the client sees
  none. This is a **seed limitation, not an app defect** — but it produces the findings below.

### GAP2-16 — the app's only error alert restates its own title, and its "try again" has no Retry (C4-26 confirmed verbatim)
- area copy / state-honesty · severity **major** · testerVisible true (when documents exist) · confidence 0.9 (code-verified, not sim-verified) · effort S
- where: `DocumentListView.swift:34-45` (the alert) + `DocumentsViewModel.swift:55-61` +
  `DocumentsAPIClient.swift:126-141` (`DocumentError.errorDescription`)
- evidence — the three alerts this composes, verbatim:
  1. title **"Couldn't open this file"** / message **"We couldn't open this file. Please try again."**
     (`.signedURLFailed`, and the `?? ` fallback in `DocumentsViewModel.swift:57`) — the message is the
     title restated in the first person.
  2. title **"Couldn't open this file"** / message **"We couldn't download this file. Please try again."**
     (`.downloadFailed`) — near-duplicate.
  3. title **"Couldn't open this file"** / message **"This document isn't available to open yet."**
     (`.missingPath`) — title and message contradict: one says the app failed, the other says the
     document is not ready.
  The alert's only button is `Button("OK", role: .cancel)` — every message says "Please try again" and
  none offers a way to. **Alert 3 is the one the first real client would hit**: every seeded
  `project_documents` row has an empty `storage_path`, which is exactly `DocumentError.missingPath`.
- fix: one title that states the outcome, a message that adds new information (which file, what to do),
  and a Retry button beside OK; make `.missingPath` a non-alert row state ("Not ready yet") rather than
  a failure alert.

### GAP2-17 — one slow download disables every row in the documents list
- area performance-resilience · severity minor · testerVisible true (when documents exist) · confidence 0.85 (code) · effort S
- where: `DocumentListView.swift:112-119`
- evidence: `.disabled(viewModel.downloadingDocumentId != nil)` is applied to **every** row button, so
  while any one file is downloading the whole list is inert; the only feedback is a small `ProgressView`
  replacing one row's `arrow.down.circle`. Nothing tells the reader why the other rows stopped
  responding, and there is no cancel.
- fix: disable only the row that is downloading, and give it a visible "Preparing…" label.

### GAP2-18 — a designed empty state that no tester can reach
- area studio-designer · severity minor · testerVisible false · confidence 0.85 · effort M
- where: `DocumentListView.swift:76-92` (`emptyView`, `PatinaEmptyState "No documents yet" /
  "Contracts, drawings, and files your designer shares land here." / CTA "Get design help" or "Track
  your request"`) vs its only two entry points (above), both gated on documents existing
- evidence: the list is only reachable when it is non-empty, so its empty state — the one with the
  conversion CTA — cannot be displayed on the flags-off path a first-round tester walks.
- fix: either show the Documents row always (with the empty state doing its job) or delete the
  unreachable branch.

### GAP2-19 — section titled "Money & documents" contains no documents
- area copy · severity polish · testerVisible true · confidence 0.9 · effort S
- where: Studio hub, `shots/GAP2/46-hub-budget-row.png`; AX heading `"Money & documents, 4 categories"`
- evidence: the four rows under that heading are Ordered, Proposals, Invoices, Budget. For this tester
  the word "documents" in the heading names nothing on the screen.
- fix: title the section for what it holds, or let the documents row render empty.

### ⚠ CORRECTION to GAP2-14 (read after it)
`BudgetMath.buildSections` (`BudgetViewModel.swift:63-66`) documents the omission deliberately:
*"Projects with neither an accepted proposal nor a visible invoice are omitted."* So Birch Hollow and
Marrow & Vale are hidden **by design**, not lost. **Downgrade GAP2-14 to `minor` and re-read it as a
copy/expectation defect**: the header still says "ACROSS YOUR PROJECTS" while two of the tester's three
projects silently disappear between the Projects screen and this one, with nothing saying why. The fix
is the header ("Projects with billing") or a one-line "Nothing billed yet" row — not the aggregation.

---

## Leg 5 — Companion-orb overlap, bottom inset, and the pushed-screen chrome (`50`)

### Bottom inset: **correct at rest.** Scrolled to the true bottom of the Studio hub
(`50-hub-scrolled-to-bottom.png`) the last row ("Settings") ends clear of the orb and the orb's caption
sits in empty space below it. So GAP2-01 is **not** an inset bug — it is that the orb and its caption
have no material behind them while content passes underneath.

### GAP2-20 — the pushed-screen back chevron floats over scrolling content and clips it
- area visual-system / navigation · severity minor · testerVisible true · confidence 0.9 · effort S
- where: `shots/GAP2/50-hub-scrolled-to-bottom.png` (clearest), also `45-project-detail-bottom.png`,
  `05-studio-hub-scrolled.png`
- evidence: in `50` the circular Back control at (17.75, 69.75) sits directly on top of the **Budget**
  row and covers the left half of that row's pie-chart icon — the icon reads as a broken crescent. The
  control has a pale circular fill but no blur/material and no scroll-edge effect, so every card that
  passes beneath it is partly erased.
- fix: give the floating chrome a `.regularMaterial` circle (or a scroll-edge background), or reserve a
  safe-area inset so content never scrolls under it.

### GAP2-21 — "Archive" says empty three times, and its count glyph reads as Ø
- area visual-system / copy · severity polish · testerVisible true · confidence 0.85 · effort S
- where: `shots/GAP2/50-hub-scrolled-to-bottom.png`
- evidence: the Archive block shows the header "Archive" with a trailing count rendered in the mono
  face as a **slashed zero** (reads as `Ø`, not `0`), and below it the sentence "Nothing has been
  archived." Three assertions of the same emptiness — a header, a numeric badge, and a sentence — and
  the badge is the one glyph on the screen a reader has to decode.
- fix: hide the count when it is zero (every other section's count is ≥1), and keep the sentence.

### GAP2-22 — capitalisation flips inside one list: "Retake Style Quiz" beside "Get design help"
- area copy · severity polish · testerVisible true · confidence 0.95 · effort S
- where: `shots/GAP2/50-hub-scrolled-to-bottom.png`, YOUR PROFILE section
- evidence: three adjacent rows read **"Retake Style Quiz"**, **"Get design help"**, **"Settings"**.
  The first is Title Case, the second sentence case. Every other row on the hub ("Active projects",
  "Studio updates", "Shared with you") is sentence case.
- fix: "Retake your style quiz".

### GAP2-23 — the Ordered list is the model the other reads should copy (GOOD, recorded for the plan)
- `OrderedListView.swift:49-86` has four genuinely distinct states — `PatinaLoadingState`,
  `PatinaErrorState("We couldn’t reach your orders. Check your connection and try again.")` **with a
  retry action**, `PatinaEmptyState("Nothing ordered yet" / "When you or your designer order a piece,
  you can follow it here.")`, and the list — and the source comment states the principle outright:
  *"Patina's own sentence. The server's words went to the log."* `OrdersService` even carries a
  dedicated `lastRefreshFailed` so empty and failed are different facts.
- The gap is that this discipline stops at the Orders feature: `ProjectsViewModel` swallows six reads
  into empty defaults (GAP2-09), and `ProjectListView`/`BudgetView` only show their error state when
  **everything** failed (`else if let error = viewModel.error, viewModel.isEmpty`), so a partial failure
  renders as a successful-looking, wrong screen.

### Other GOOD, briefly
- Navigation from the hub is fast: at **1.0 s** after the tap the project detail was already fully
  drawn (`43-project-detail-loading.png` is indistinguishable from `44`), so no spinner is ever seen on
  a local stack. Every push landed on the right screen; every Back returned; no dead ends besides
  GAP2-05; no crash in ~40 minutes of driving.
- The Studio hub's grouping (Awaiting you · In progress · Conversation · Money & documents) with counts
  and human sub-lines ("Where your pieces are", "What's been billed, and what's been paid") is a
  genuinely good information design.
- "Project budget $120,000 · your designer's figure" and the order screen's accountability paragraph are
  the strongest copy in the app — they attribute and take responsibility instead of asserting.

---

## Leg 6 — Invoice detail, reached from the Budget row (`51-52`)

**GOOD.** This is the best-made screen in my scope: status as the serif title ("Awaiting payment"),
TOTAL/PAID/BALANCE, a line-item table with a designer's note, and the reminder opt-in whose copy quotes
the exact notification it will send — *"We'll send one notification: “Your invoice is due tomorrow —
$4,250.00. Nothing else.”"* That is a promise a tester can hold you to, and it is rare.

### GAP2-24 — the "Pay $4,250.00" button starts one point below the fold
- area money / navigation · severity **major** · testerVisible true · confidence 0.9 · effort S
- where: `shots/GAP2/51-invoice-detail.png` (at rest) vs `52-invoice-detail-bottom.png` (after a swipe)
- evidence: on first paint the primary CTA's frame is `{y: 875, x: 24, w: 354, h: 52}` on an 874 pt
  screen — the whole button is off-screen, and `51` shows the screen ending on "No payments recorded
  yet." A tester who opens the invoice they were pushed to from the home screen sees no way to pay it
  until they scroll.
- why: this is the app's only revenue action.
- fix: pin the pay button to the bottom safe area (it is the one screen that earns a fixed footer), or
  shorten the sections above it.

### GAP2-25 — "Remind me the day before it's due" is a 17 pt-tall tap target
- area accessibility · severity **major** · testerVisible true · confidence 0.95 · effort S
- where: `shots/GAP2/51-invoice-detail.png`; AX frame
  `{"y":387.33,"x":24,"width":228.33,"height":17}`, role `AXButton`
- evidence: the control is bare gold text with no chrome and a 17 pt hit box — 39 % of the 44 pt HIG
  minimum. It is the only interactive element in that band, so a near miss lands on nothing. (The same
  shape appears on the auth screen: "Have a password? Sign in" is `height: 14.67`.)
- fix: `.frame(minHeight: 44)` + `.contentShape(Rectangle())`, as `OrderDetailView.rowButton` already does.

### GAP2-26 — "Subtotal $4,250.00" and "Total $4,250.00" stacked identically, with the lesser row coloured
- area money / visual-system · severity minor · testerVisible true · confidence 0.9 · effort S
- where: `shots/GAP2/51-invoice-detail.png`, `52-invoice-detail-bottom.png`
- evidence: two consecutive rows carry the same number with nothing between them (no tax, no discount,
  no fee). "Subtotal" is rendered in gold and "Total" in ink — the row that matters less is the one
  given the accent colour.
- fix: collapse to a single "Total" when subtotal == total; give Total the accent when it is shown.

### GAP2-27 — the Companion appears as two different controls between screens (one reads as disabled)
- area companion / visual-system · severity minor · testerVisible true · confidence 0.85 · effort S
- where: `shots/GAP2/51-invoice-detail.png` vs every other shot
- evidence: on the invoice detail the AX element is **"Patina companion — menu"**, a **44×44** circle at
  **(338, 768)**, filled mid-grey, with no caption. Everywhere else it is **"Patina companion"**, a
  **64×64** near-black circle at **(169, 724)** with the caption "5 THINGS NEED YOUR EYE". Same glyph,
  two sizes, two positions, two fills — and the grey fill on a screen full of gold and ink reads as a
  disabled control.
- fix: keep one fill and one glyph weight; if the compact variant exists to clear a bottom CTA, move it
  without recolouring it.

### GAP2-28 — mixed straight/curly apostrophes in adjacent mono eyebrows
- area copy / visual-system · severity polish · testerVisible true · confidence 0.9 · effort S
- evidence, verbatim from the AX tree: **`WHAT'S INCLUDED`** (straight) and **`Remind me the day before
  it's due`** (straight) sit two screens away from **`IF SOMETHING’S WRONG`** (curly, order detail), and
  the notification quotation on the same invoice screen uses curly **“ ”**. Three apostrophe policies in
  one flow.
- fix: curly everywhere; add a lint rule for `'` in user-facing strings.

### GAP2-29 — "Payment opens securely in Safari." immediately above "Pay securely by card or bank transfer."
- area copy · severity polish · testerVisible true · confidence 0.9 · effort S
- where: `shots/GAP2/52-invoice-detail-bottom.png`
- evidence: two 12 pt caption lines stacked under the CTA, both using the word "securely", saying two
  halves of one sentence.
- fix: one line — "Opens securely in Safari · card or bank transfer".

### GAP2-20 reconfirmed on the invoice detail
`52-invoice-detail-bottom.png`: the floating Back chevron sits on top of the scrolled "Due Sep 6" line
and cuts it in half — here it clips **text**, not just an icon.

---

## Coverage

**Completed:** Studio hub (top → true bottom); **Ordered** list + order detail (+ "Report a problem",
"See the piece"); **Projects** list + project detail (top → bottom); **Budget** screen; **Invoice
detail** (the Budget row's detail) at rest and scrolled; Companion panel row inventory; bottom-inset
test; back-chrome overlap across four screens.

**Not completed, and why:**
1. **DocumentQuickLook preview chrome + its dismiss control — NOT REACHED.** The documents list has no
   entry point for this client: all 3 seeded `project_documents` rows have `client_visible = false`
   (read-only psql check), and both entry points are gated on documents existing. Everything reported
   about the open-failure alert (GAP2-16) and the list's disabled-rows behaviour (GAP2-17) is
   **code-verified, not sim-verified**. Reaching it needs a seed change (`client_visible = true` **and**
   a real `storage_path`) — I did not write to the shared local DB because five sibling lanes were
   walking it live.
2. **Error states of Ordered / Projects / Budget — not induced.** There is no per-device network cut on
   the Simulator, and cutting the shared local stack would have broken the other lanes. Empty-vs-error
   claims (GAP2-09, GAP2-14) rest on source reading plus the rendered empty screens.
3. **First 8–10 minutes on clone C are unusable evidence** (shots 00–13) — six lanes shared that device.
   Only `04`, `05` and `09` are kept, and only for GAP2-01, which I then reproduced independently on my
   own clone (`44`, `45`).
4. Proposals and Messages were reached only incidentally and are not reported — other lanes own them.
5. Nothing here is device-verified; everything is sim-verified on iPhone 17 Pro / iOS 26.5, light
   appearance, default Dynamic Type, flags OFF.

Device left **booted** with the app terminated: `tfp-GAP2 FD94BFFD-6BF0-4A76-B3C9-FE7CD8F3A7F3`.
tfp-A/B/C/P untouched since 19:14.
