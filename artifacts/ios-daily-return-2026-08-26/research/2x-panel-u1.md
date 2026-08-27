# 2x — Panel seat U1 · Retention & habit design (UX lens)

Evidence: the 155-shot walk of `cloud.patina.app` at `main @ 3cd84ecb3` on iPhone 17 Pro / iOS 26.5
against the local Supabase stack, plus code-read grounding (`10-code-anatomy.md`, `15-task-paths.md`,
`12-backend-reality.md`, `17-gap-fills.md`). I walk as the retention lens: I am not asking whether a
screen is pretty, I am asking what makes a person open this app tomorrow morning, and whether the
thing that would make them open it is honest.

Frameworks I am holding: Hook (trigger → action → variable reward → investment), Fogg B=MAP, the
jobs-to-be-done of the *return* itself, the day-1/2/7/30 curve, notification-permission earning, and
the iOS return-surface inventory. Patina's voice forbids manufactured urgency, so every mechanic I
propose has to be true on the day it fires; the ones I reject are named at the end.

Tasks walked: **T1, T2, T4, T8, T10, T11, T12**. Camera / LiDAR / AR paths are code-read only
(no hardware in this program); local-environment faults (edge functions 503, OTP mail without a
code, keychain outliving uninstall) are excluded per instruments §6b C27.

---

## T1 — "Fresh install. What is this for, and what do I do first?"

**First glance:** a blank white launch, then a full-screen wall: **"PATINA"**, the strata mark,
**"Welcome home"**, **"Start with a piece you love"**, and three stacked buttons —
**"Sign in with Apple"**, **"Continue with Google"**, **"Continue with email"** — then **"or"** and
**"Look around first →"**. The promise in that subhead is a piece. There is no piece on the screen.
I am being asked who I am before I have been shown anything worth being known for.

**Where I'd tap:** "Look around first →", because it is the only thing that costs nothing. That
routes me into three onboarding pages and a five-question quiz, then a two-step coach mark
(**"Welcome to Patina"**, **"Your profile"**), then a card that says **"I'm your Companion."** /
*"Tap me any time, anywhere in Patina — I'll show you the way to what's next."* Fourteen acts before
the app hands me anything of my own.

**Where I'd hesitate:** at the quiz payoff. I answer five questions, get **"YOUR STYLE, FOUND"** /
**"Warm Modern"** / **"A STARTING POINT — REFINE IT ANY TIME."** — a genuine moment — and then the
screen ends at **"Tune the portrait / Tell Patina which direction feels closer. / Tune this"**. The
payoff has no forward door. From a habit point of view this is the single most expensive miss in the
first run: the biggest investment of day one closes on a maintenance task instead of on the pieces it
just tuned. And the tour's declared middle step, **"Save what you love"** / *"Add pieces to a room with
+ Add — they follow you everywhere."*, never renders at all — its anchor mounts in no view, so the
first run silently omits the one mechanic that would give me something to return to.

**Where I'd leave:** the home, at the Next Move card. It reads **"Bring your first room into Patina"** /
*"A short scan gives the Companion a real space to work from."* On day one, motivation is thin and
ability is thinner; the app's only opening ask is to inventory a room. That is a Sunday-afternoon act
being requested at a Tuesday-evening moment.

**Would I come back tomorrow for this?** No — and not as a matter of taste. A guest's session,
portrait and quiz progress do not survive a force-quit; the second launch is the same gate saying
**"Welcome home"** to a person it just forgot, while the Companion still insists **"Style quiz /
DISCOVER YOUR STYLE"** and Profile still wears the **"Warm Modern"** badge. Day-2 return for a guest
is structurally impossible.

**Obviousness: 2** — I can find the one thing to do; I cannot find a reason it will still be here
tomorrow.

**Findings produced:** U1-01, U1-02, U1-03, U1-04, U1-05.

---

## T2 — "7:40am, coffee, phone in hand. Why would I open Patina *today*?"

**First glance:** **"WEDNESDAY · AUG 26"**, **"Today"**, a bell, a **"?"**, a monogram, then exactly
three things: **"NEXT MOVE / Review a project decision / 2 decisions need your eye."**, the story
card **"4 MIN READ / MAKER SPOTLIGHT / The Grain Whisperer of Maine"**, and
**"ACTIVE ROOM / Living Room"**. Below that, the orb and the words **"2 PROJECT DECISIONS WAITING"**.
It is a calm, handsome screen. It is also the same handsome screen it was yesterday.

**Where I'd tap:** the Next Move, once. Then I am out of screen — swiping up changes nothing; the
signed-in home and the guest home return the same four elements to `describe_screen`.

**Where I'd hesitate:** on the clay dot in the corner of the story card. It says this story is new.
It is hard-coded on, and the query behind it returns the single highest-`sort_order` row forever;
there are three stories in the whole table. So the only "new" marker on the morning screen is
fabricated, and the module it marks has no supply behind it. Second hesitation: the header says
**"Today"** at 7:40am and at 9:10pm — the design system ships a `TimeOfDay` token that the home never
reads.

**Where I'd leave:** Pinterest, in about eleven seconds. Not because Patina is worse, but because
Pinterest has something I have not seen and this does not. For Ruth — three projects, four proposals,
an overdue decision and a $4,250 invoice — the leave is worse: none of that is on this screen. Her
whole reason to open the app lives two acts behind an unlabelled circle in the top-right corner.

**Would I come back tomorrow for this?** No. The only guaranteed difference between two consecutive
mornings is the date string.

**Obviousness: 4** — the screen is perfectly legible. There is simply nothing on it that is new.

**Findings produced:** U1-06, U1-07, U1-08, U1-09, U1-10, U1-11, U1-12, U1-37, U1-38.

---

## T4 — "Save it. Find it again tomorrow."

**First glance:** saving is genuinely one act — a ♥ on the card, a ⋯ menu with **"Save"**, or the
detail's **"Add to Room"** button that flips to **"Saved ✓"**. This is the app's best-built moment
and the only investment it invites cheaply.

**Where I'd tap:** the ♥. Then tomorrow, the orb — because there is no Saved door on the home and no
tab bar. And here the loop breaks in a way I did not expect: with zero saved items the Companion
panel has **no "Saved" row at all** (confirmed by `scan_ui` before and after adding a room), and the
count that unlocks it sums *room* items, not the saves the app just invited me to make. The surface
that holds my investment is hidden until I have already invested, and then only if I invested the
right way.

**Where I'd hesitate:** on arrival. **"Saved"** opens on the **"Boards"** tab, which reads
**"No boards yet"** / *"Save pieces from recommendations to create your first board"* / **"Create Board"**
— while my piece sits behind the **"All items"** tab. If I take the invitation and create a board, it
stays **"This board is empty"** forever: nothing in the app can put a piece into a board. Meanwhile
the home's own room card reads **"2713 sq ft · 0 pieces saved"** on the same device where Saved
lists one.

**Where I'd leave:** back to the browse grid, and then out — because the piece detail is a hard trap
(**"Couldn't load product"** / **"Let's try that again"**, no Back), so the act of confirming what I
saved costs me the app.

**Would I come back tomorrow for this?** No. The investment is real, but the app cannot show it back
to me: the save state is not seeded from storage (yesterday's piece offers **"Add to Room"** again and
duplicates a row), the room-scoped Saved is always empty because nothing ever writes the field it
filters on, and the whole store is device-scoped — **"SAVED ON THIS PHONE"** on one screen, counted as
account data on three others.

**Obviousness: 2** — one tap in, three taps and a state gate back out.

**Findings produced:** U1-13, U1-14, U1-15, U1-16, U1-17.

---

## T8 — "I've ordered / my designer ordered — where is it?"

**First glance:** nowhere to look. There is no order object in this app. The question resolves into
the Studio, which is: monogram → Profile → scroll → **"STUDIO / The work around your home, in one
place."** Three acts to a list, four to a detail.

**Where I'd tap:** **"Awaiting you 3"** → **"Invoice / $4,250.00 remaining / Due Sep 1"**, or
**"Active projects / Aspen Loft Refresh and 1 more / Installation"**. The project detail is the screen
that should answer "where is it": **"PROJECT / Aspen Loft Refresh / Currently: Installation & Styling"**,
then **"BUDGET $120,000"**, **"STATUS In Progress"**, **"CLIENT VIEW Milestone"**, an Invoices row, and
a box reading **"Set up phases, payments, and FF&E in the portal →"**. That is a designer's to-do
list rendered to a homeowner, and the screen fetched the project's phases successfully before
choosing to render none of them.

**Where I'd hesitate:** on the counts. This one screen says **"4 things need your eye"** in its subhead
and **"4 THINGS NEED YOUR EYE"** in its footer, directly above a block headed **"Awaiting you 3"** —
while the home and the orb both say **"2 PROJECT DECISIONS WAITING"**. Three totals for one inbox.
A count is a return trigger exactly as long as I believe it.

**Where I'd leave:** to text my designer. Which is the outcome D1 and D2 are paying this app to
prevent.

**Would I come back tomorrow for this?** Once, maybe — to see whether the invoice moved. Then no,
because nothing on this rail ever changes on its own in a way I can see: no phase dates, no delivery
state, no "what moved since Tuesday". `direct_orders` — the client-facing order table on the
backend — has only `pending_payment / paid / canceled`, so even when buying exists there will be
nothing to track. The one place a real shipping vocabulary lives (`confirmed`, `in_production`,
`shipped`, `delivered`, `eta_change`, `substitution`) is the BOH fulfillment rail, and it is
operator-initiated and never reaches this app.

**Obviousness: 2** — I can find *something*; I cannot find the answer to the question I asked.

**Findings produced:** U1-18, U1-19, U1-20, U1-21, U1-22.

---

## T10 — "The designer sent a proposal / an invoice is due. How do I find out?"

**First glance:** the bell. **"Notifications"** / **"Nothing yet"** / *"Updates from your designer will
land here."* — for an account with two decisions overdue since Aug 22, an invoice due Sep 1 and a
proposal to review by Sep 8. The one act on that empty screen is a **"Get design help"** button, sold
to a client who already has Leah Hartwell.

**Where I'd tap:** nothing. There is nothing to tap. And the honest answer to the task question, as
the app is built, is: *you find out by opening the app and hoping the Next Move card changed.*

**Where I'd hesitate:** at the permission. The system prompt fires exactly once per install, from the
first successful design-request submission, with no pre-permission screen and no rationale copy
anywhere in the app. A client whose designer onboarded them by phone never files a request and is
therefore never asked. So the app spends its one permission ask at the moment of least demonstrated
value, on the smallest population.

**Where I'd leave:** email. Which is the honest answer today — `invoice-reminders`, `proposal-nudge`,
`proposal-send`, `invoice-send` all send mail. But the app has no associated-domains entitlement, so
none of those emails can open the app; every external trigger the business already owns lands in
Safari.

**Would I come back tomorrow for this?** No, because nothing will tell me to. Push is not a stub —
`apns-send` is complete, provisioned on Strata since 2026-07-16, and wired to three design-request
triggers plus the BOH fulfillment path. It simply has **zero** callers on anything money-shaped.
The gap between "no notifications for the things clients care about" and "notifications for the
things clients care about" is one `invoke_edge_function('apns-send', …)` per trigger, on a pattern
already proven three times.

**Obviousness: 1** — I could not find out. There is no path.

**Findings produced:** U1-23, U1-24, U1-25, U1-26, U1-27, U1-35, U1-36.

---

## T11 — "Two weeks away. I'm back."

**First glance:** the same screen. Literally: the relaunch capture and the pre-absence capture are
byte-identical apart from being taken minutes apart — **"WEDNESDAY · AUG 26"**, **"Today"**,
**"Review a project decision / 2 decisions need your eye."**, the same maker story with the same
"new" dot, **"ACTIVE ROOM / Living Room"**.

**Where I'd tap:** the Next Move, because it is still the only door. Nothing greets me, nothing
marks anything unread, nothing says when I was last here. The app stores no last-seen timestamp for
the feed, the story, the room or the Saved list, and `ContextMemoryStore` — the one thing that could —
is off until I turn it on in Settings.

**Where I'd hesitate:** on what quietly changed while I was gone and was never explained. A matched
design-request card stops being promoted 14 days after its stage anchor; the Companion graduates to
its calm state at 14 days. So the returning user's screen is *quieter* than the one they left, for
reasons the app never states. And for the engaged tier the re-entry is worse than quiet: signing in
as a homeowner whose lead was accepted and claimed on Aug 18, the home says **"Bring your first room
into Patina"**, the Companion has no **"Your studio"** row, the Studio shows five stacked zeroes, and
tapping **"Get design help"** offers **"Request without a scan"** — the app inviting me to file the
request it already accepted.

**Where I'd leave:** close the app. Nothing punishes absence, which is good; nothing rewards return,
which is fatal. Two weeks away and one hour away produce the same first screen.

**Would I come back tomorrow for this?** No. The absence-recovery moment is the cheapest retention
win in any app — "here is what happened while you were gone" — and the data to build it (decisions,
proposals, invoices, phases, notification rows, story publish dates) is already being fetched on
every appear.

**Obviousness: 3** — I know where I am; I have no idea what moved.

**Findings produced:** U1-28, U1-29, U1-30.

---

## T12 — "Show my partner."

**First glance:** a ⋯ menu on the card with **"Save"**, **"Share"**, **"Not for me"**, **"View details"**.
Share is one tap. Good.

**Where I'd tap:** "Share" — and the iOS sheet comes up titled **"Patina Designer Portal"** /
**"app.patina.cloud"**. I am a homeowner sending my husband a chair, and the app hands him a door
marked for somebody else's profession, under somebody else's brand.

**Where I'd hesitate:** at everything that is not a single piece. There is no way to share a room, a
board, or the Saved list — three `ShareLink` sites in the whole app, all product URLs. Couples do not
decide on a chair; they decide on a room. And the link cannot open the app for him even if he
installs it: no associated-domains entitlement, custom scheme only.

**Where I'd leave:** a screenshot in Messages. Which is what actually happens, and it takes the
second decision-maker out of the product permanently.

**Would I come back tomorrow for this?** No — and neither would he, because there is no seat for him.
No invite, no household, no co-viewer anywhere in the app, and no household table in 487 migrations.
The household is the real retention unit for furnishing a house, and this app models exactly one
person.

**Obviousness: 3** — sharing is findable; sharing anything that matters is not.

**Findings produced:** U1-31, U1-32, U1-33, U1-34.

---

# The seven U1 questions

## 1 · Trigger inventory

**External triggers that exist today**

| Trigger | Live? | Fires for | Reaches the app? |
|---|---|---|---|
| APNs push | Yes — `apns-send` complete, `APNS_*` provisioned on Strata since 2026-07-16 | designer accepted a lead · match ceremony complete · consult slots refreshed (3 SQL triggers) + `fulfillment-notify` (BOH, operator-pressed) + `site-request-dispatch` (Field, not this app) | Yes, and `NotificationRouter` already routes `proposal` / `invoice` payloads nobody emits |
| Email | Yes — `invoice-reminders`, `proposal-nudge`, `proposal-send`, `invoice-send`, `decision-resolved-notify`, direct-order receipts | the money rail | **No** — no associated domains; every link opens Safari |
| SMS | Live (10DLC) but designer/trades-facing | Field rail | n/a for the client app |
| In-app bell badge | Yes | `notification_log` rows, polled on foreground / appear | Yes, but the log gains no client money rows |
| Local notification | **Does not exist** — no `UNNotificationRequest` anywhere | — | — |
| Widget / Live Activity / App Intent | **Do not exist** — three targets, no extensions | — | — |

Net: **push fires for design-request lifecycle only; nothing money-shaped can reach a client
between opens.** The one push rail with a real "where is it" vocabulary (`confirmed`,
`in_production`, `shipped`, `delivered`, `eta_change`, `substitution`) sits on the designer-sourced
BOH `fulfillment_orders` table and requires an admin to press send.

**Internal triggers — the feeling that sends someone here**

| Feeling | Has a surface? |
|---|---|
| "Did my designer answer?" | No — Conversation reads **"No project conversations yet."** with no compose |
| "Is my money right?" | Partly — **"Your budget / ACROSS YOUR PROJECTS"** reports $4,250 for a client whose projects total $725,000 |
| "Has anything shipped?" | No object exists |
| "Is my room closer to done?" | The Active Room card — but it reports **"0 pieces saved"** because nothing can be added |
| "I want twenty minutes of pretty things" (Maya, 9pm) | Browse has no home door; the piece detail 404s |
| "Am I about to miss something?" | Only two acts deep, and the count contradicts itself three ways |

The pattern is the diagnosis: **the strongest internal trigger this business owns — anxiety about a
job in flight — has the weakest surface, and the weakest trigger — idle browsing — is what the home
is built around.**

## 2 · The investment the app already remembers, and whether it shows on return

| Investment | Stored | Visible on return? |
|---|---|---|
| Taste portrait (5 questions) | local `StylePreferenceModel` + server `client_style_profiles` | Only as a Profile badge two acts deep; silently re-scores the feed; three surfaces disagree about whether it exists |
| Room (typed or scanned) | SwiftData `RoomModel` (+ `rooms` when synced) | **Yes — the Active Room card.** The best return artifact in the app |
| Saved pieces | local `TableItemModel`; `saved_items` only when a room remote id was in scope | **No** — home says "0 pieces saved"; the Saved door hides at count 0 |
| Boards | local `BoardModel` | Permanently empty; no remote mirror; lost on reinstall |
| Design-request draft | SwiftData `DesignRequestDraft` | **Yes** — Next Move "Finish your design request". The best-designed memory in the product |
| Submitted request | `leads` | Yes — Next Move stage line, for 14 days after a terminal stage |
| Decisions / proposals / invoices | server | Two acts deep, no delta, no dates on the acting screen |
| Activity context | `ContextMemoryStore` | Off by default, by design |

**Two of eight investments are visible where a returning user actually lands.** Everything else the
app remembers, it remembers privately.

## 3 · The variable reward, and whether it is actually variable

| Candidate | Varies with | Actually variable? |
|---|---|---|
| Next Move | an 8-input state ladder | **No** — deterministic, monotone, and only advances when *I* act |
| Editorial story | `sort_order.desc, published_at.desc LIMIT 1` | **No** — the same row until an editor intervenes; three rows exist |
| Story unread dot | hard-coded `true` | **No** — and dishonest |
| Match % | opaque re-score | Varies, unexplained — a progress illusion, not a reward |
| Bell badge | `notification_log` | Would be the real one — but nothing writes client money rows |
| Designer activity | proposals, decisions, invoices, messages | **The one genuinely variable thing in the product, and it is invisible on Today** |

So: today's reward is deterministic, self-generated, and marked "new" by a constant. The honest
variable reward Patina owns — *another person did something about your house* — is fully computed on
the backend and rendered nowhere a returning user looks.

## 4 · The day-1 / day-2 / day-7 / day-30 curve as built

- **Day 1 — steep and real.** Quiz → portrait → tour → home. There is a genuine "oh, it knows
  something about me" beat at **"YOUR STYLE, FOUND"**.
- **Day 2 — the cliff, and it is not gradual.** A guest's day 2 does not exist: session, quiz and
  portrait are discarded on relaunch (U1-04). A signed-in discovering user's day 2 is the same
  screen with a different date, restating the same room ask (U1-06, U1-05).
- **Day 7 — flat.** The only state machine that can advance without the user is the design request.
  The loop that would generate daily change — save a piece, watch a room fill — cannot complete:
  no add-to-room, inert boards, un-seeded save state (U1-13…U1-16).
- **Day 30 — flat for everyone except activeProject, and thin even there.** Ruth's pull is real
  (an overdue decision, an invoice, a proposal) but it is three acts deep, uncounted consistently,
  and un-notified (U1-09, U1-21, U1-22, U1-23). Meanwhile two silent 14-day decays make the app
  quieter the longer she is away (U1-29).

**The curve goes flat between the day-1 payoff and the day-2 open**, at the exact point where the app
should be showing me what it remembered.

## 5 · The one honest reason to open tomorrow, per tier

| Tier | Honest reason today | Honest reason available with what already exists |
|---|---|---|
| **guest** | **None.** The app forgets them. | "The piece you saved is still here" — needs guest opt-in to survive a relaunch |
| **discovering** | The date changed. | "Your room is one piece closer" — needs saves to reach the room |
| **engaged** | None — the home is byte-identical to guest. | "Leah Hartwell picked up your request on Aug 18" — the fact exists in `leads` today |
| **activeProject** | "2 decisions need your eye" — real, and the best line in the app. | "One thing needs your eye, and here's what changed since Tuesday" — every input is already fetched on appear |

## 6 · Unused iOS return surfaces, and which fit the brand

| Surface | Unused? | Fit |
|---|---|---|
| **Associated domains / universal links** | Yes | **Highest leverage of all.** Not a return surface itself — the precondition for every email, share and future push to land inside the app instead of Safari |
| **Home Screen widget** (small: active room + awaiting-you count) | Yes | Strong fit. Quiet, ambient, no interruption — the Patina register exactly |
| **Lock Screen widget** | Yes | Strong fit for Ruth's package-checking habit |
| **Live Activity** | Yes | Fits *only* once a delivery or install window is real — that means surfacing the BOH fulfillment states to the client. Honest and powerful; not free |
| **Local notification** | Yes | One honest use: a due-date reminder the user opts into on the invoice itself |
| **App Intents / Shortcuts / Spotlight** | Yes | Mild fit ("Show my Living Room"). Cheap, low return; do it late |
| **Wallet pass** | Yes | **Reject.** There is no honest artifact — an invoice is not a boarding pass and a "design credit" would be manufactured |
| **Background refresh** | Yes | Not needed. Foreground polling is honest and sufficient at this cadence |

## 7 · Ten return mechanics, ranked by honesty × plausibility × cost

1. **Wire the money rail to push** — one `invoke_edge_function('apns-send', …)` on proposal-sent,
   invoice-due and decision-asked, on the pattern proven three times. → U1-23, U1-24, U1-27, U1-28.
2. **Add associated domains** so every email, share and push landing opens the app, and extend deep
   links past `room`/`piece` to invoice, proposal, decision. → U1-32, U1-27, U1-23.
3. **A "since you were last here" line on Today**, from one stored last-seen timestamp and the counts
   already fetched on every appear. → U1-06, U1-09, U1-28.
4. **Put the awaiting-you queue on Today** for activeProject — the Option B contract allows one next
   move; let that move carry the whole count and its dates instead of one decision. → U1-09, U1-10,
   U1-21, U1-22.
5. **Close the save loop** — seed `isSaved` from storage, write `TableItemModel.roomId`, mirror
   `saved_items` on the standard path, call `addToBoard`. → U1-13, U1-14, U1-15, U1-16.
6. **Give the engaged tier its own truth** — "{studio} picked up your request on {date}" as the Next
   Move; it is already in `leads` and already has a stage vocabulary. → U1-12, U1-30.
7. **Retire the fabricated unread dot** and earn it from a stored last-read story id. → U1-07, U1-38.
8. **A small Home Screen / Lock Screen widget**: active room, saved count, one awaiting-you number.
   → U1-35, U1-06, U1-16.
9. **Move the permission ask to the first real event** — a proposal or an invoice arriving — with one
   plain sentence naming what will be sent, and instrument the outcome. → U1-25, U1-36.
10. **Share a room, and seat a second person on one project** — a homeowner-facing share URL first,
    then a single-project invite. → U1-31, U1-33, U1-34.

Ranked below the line but worth naming: **an editorial cadence**. Today's story could be an honest
daily reward, but the table holds three rows and the query filters nothing — that is a publishing
commitment, not a code change (U1-37).

### Ideas I reject as manipulative

| Rejected | Why |
|---|---|
| Streaks ("5 days in a row") | Rewards the app's need for opens, not the house getting finished. A homeowner furnishing one room over a season *should* have gaps |
| Countdown urgency on pieces ("3 left", "expires tonight") | False scarcity against a 21-item catalog; the voice forbids it and Walt would never forgive it |
| Fabricated "new since yesterday" badges | Already shipped as the hard-coded unread dot. It should be removed, not extended |
| Speculative pushes ("Your designer may be waiting") | A notification that fires when nothing happened teaches people to turn notifications off |
| Completeness meters that never fill | The unexplained 48% → 63% "MATCH" is this today; a progress illusion is not progress |
| Randomised feed shuffle to fake novelty | Dishonest variability; it also degrades the match quality the quiz earned |
| Social pressure ("4 others saved this") | Invented; there is no such population and no reason to imply one |
| Loss framing on a room ("your room is going cold") | Guilt as a trigger — the exact opposite of a companion |
| Permission ask at cold launch | Spends the one grant before any value is demonstrated; the current ask is mistimed, not too late |
| Badges / gamified saving | Turns taste into points; nothing in this brand survives that |

---

## Findings

| id | title | severity | confidence | shots |
|---|---|---|---|---|
| U1-01 | App asks who I am before showing anything | S1 | 0.9 | g-02-first-screen-after-splash.png, g-38-relaunch-returning-guest.png |
| U1-02 | Tour never teaches the save loop it promises | S1 | 0.9 | g-09-home-tour-step1.png, g-10-home-tour-step2.png |
| U1-03 | Quiz payoff ends without a door to the pieces | S1 | 0.6 | g-08-quiz-result.png, g-08b-quiz-result-scrolled.png |
| U1-04 | Guest's day-one work is gone on day two | S0 | 0.9 | g-38-relaunch-returning-guest.png, g-40-companion-inconsistent-persistence.png |
| U1-05 | The first ask is the app's heaviest act | S1 | 0.8 | g-12-home-discovering-top.png, g-23-spaces-or-scan.png |
| U1-06 | Only the date line changes between two mornings | S0 | 0.95 | c-03-home-top-activeproject.png, c-29-relaunch-returning-client.png |
| U1-07 | Same story forever, permanently marked unread | S1 | 0.95 | g-12-home-discovering-top.png, c-03-home-top-activeproject.png, c-31-engaged-home-top.png |
| U1-08 | "Today" reads the same at 7:40am and 9pm | S2 | 0.9 | g-12-home-discovering-top.png, c-03-home-top-activeproject.png |
| U1-09 | Today hides the four things awaiting the client | S0 | 0.95 | c-04-home-scrolled-studio-rows.png, c-06b-studio-awaiting-you.png |
| U1-10 | Home has no Browse, Saved, Studio or designer door | S1 | 0.95 | c-04-home-scrolled-studio-rows.png, g-13-home-scrolled.png, d-02-home-studio-rows.png |
| U1-11 | A project with nothing pending disappears from Today | S2 | 0.85 | c-03-home-top-activeproject.png |
| U1-12 | Engaged home is the guest home, verbatim | S0 | 0.85 | c-31-engaged-home-top.png, c-32-engaged-companion.png, c-32c-engaged-studio-rows.png |
| U1-13 | Saved has no door until something is already saved | S0 | 0.9 | d-09-companion-panel.png, c-05-companion-panel-client.png |
| U1-14 | Saved opens on boards that can never hold a piece | S1 | 0.95 | c-22-saved-signed-in.png, c-22b-saved-all-items.png, g-21-saved-empty-boards-tab.png |
| U1-15 | A saved piece forgets it was saved | S1 | 0.85 | c-22b-saved-all-items.png |
| U1-16 | Home says zero pieces saved while Saved holds one | S1 | 0.85 | g-40b-home-active-room-clipped.png, g-22b-saved-all-items.png |
| U1-17 | My investment belongs to the phone, not the account | S1 | 0.9 | c-23-your-spaces.png, c-34-final-state-signed-in-client.png, c-26-profile.png |
| U1-18 | Nothing in the app answers "where is it" | S1 | 0.9 | c-06b-studio-awaiting-you.png, c-08-project-detail.png |
| U1-19 | Project screen shows three stats and no timeline | S1 | 0.9 | c-08-project-detail.png |
| U1-20 | Client's project screen tells them to open the portal | S1 | 0.9 | c-08-project-detail.png |
| U1-21 | The whole Studio hides behind a 36pt monogram | S1 | 0.9 | c-03-home-top-activeproject.png, c-06b-studio-awaiting-you.png |
| U1-22 | Three different counts for one inbox | S1 | 0.9 | c-06b-studio-awaiting-you.png, c-03-home-top-activeproject.png, c-05-companion-panel-client.png |
| U1-23 | No money or decision event can send a push | S0 | 0.9 | c-21-notifications-signed-in.png, c-06b-studio-awaiting-you.png |
| U1-24 | The bell is empty while four items are overdue | S1 | 0.9 | c-21-notifications-signed-in.png, d-10-notifications.png |
| U1-25 | Permission asked once, only after a design request | S1 | 0.9 | g-37-settings-guest.png |
| U1-26 | Empty bell sells a designer to an existing client | S2 | 0.9 | c-21-notifications-signed-in.png |
| U1-27 | Deadlines are printed once and never reminded | S1 | 0.9 | c-12-invoices-list.png, c-13-invoice-detail.png |
| U1-28 | Nothing anywhere computes "since your last visit" | S0 | 0.9 | c-29-relaunch-returning-client.png, c-03-home-top-activeproject.png |
| U1-29 | Two silent fourteen-day decays punish absence | S2 | 0.65 | c-31-engaged-home-top.png |
| U1-30 | Returning client is offered to re-file their request | S1 | 0.85 | c-33-engaged-design-request-again.png, x-06-design-request.png |
| U1-31 | Sharing a piece hands over the designer portal | S0 | 0.9 | g-19-share-sheet.png |
| U1-32 | The shared link cannot open the app | S1 | 0.9 | g-19-share-sheet.png |
| U1-33 | Only one piece can be shared with anyone | S1 | 0.9 | g-20-card-more-menu.png, g-27c-card-menu-in-room-context.png |
| U1-34 | No partner, household, or second seat exists | S1 | 0.85 | c-28-settings-client.png, c-27-account-row-inert.png |
| U1-35 | The app owns no surface outside itself | S1 | 0.95 | c-29-relaunch-returning-client.png |
| U1-36 | Return has no instrumentation beyond app_open | S2 | 0.85 | *(code-read)* |
| U1-37 | The editorial well holds three stories | S1 | 0.85 | c-03-home-top-activeproject.png |
| U1-38 | An unexplained percentage is the only progress signal | S2 | 0.85 | c-26-profile.png, g-36-profile-guest.png, g-08-quiz-result.png |

38 findings · S0 ×8 · S1 ×24 · S2 ×6. Machine-readable copies with observations, refs, canon flags
and proposal seeds: `research/2x-panel-u1.json`.
