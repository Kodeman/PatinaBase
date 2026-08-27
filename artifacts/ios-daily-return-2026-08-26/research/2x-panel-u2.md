# U2 — Interaction, navigation & visual

Seat U2, Sonnet. HIG, the no-tab-bar model, affordance/hierarchy, motion, dark mode, Dynamic Type,
one-handed reach, PatinaDesignKit consistency. Tasks run: T1, T3, T4, T5, T13. Evidence is
sim-verified (a shot I read directly) unless marked code-read. Findings live in
`2x-panel-u2.json`, ids U2-01…U2-29.

---

## T1 — "Fresh install. What is this for, and what do I do first?"

**First glance:** A blank white launch screen (g-01) with no wordmark, then the real first screen —
"Welcome home" / "Start with a piece you love" in Playfair over cream, three sign-in buttons and
"Look around first" (g-02). Clean, unhurried, on-brand. Nothing here tells me what the app *does*
yet — the tagline is a mood, not a job description.

**Where I'd tap:** "Look around first" — I want to see the product before I commit an account to it.
Onboarding and the quiz run the same for guests, so I land on Home after ten-odd acts (splash → auth
→ 3 onboarding pages → 5 quiz questions → result). The first-launch tour then fires two coach-mark
steps over Home itself.

**Where I'd hesitate:** Tour step 1 ("Welcome to Patina — this is your Daily Room") is legible, but
its own bubble sits directly on top of the Next Move card it's describing (g-09) — I have to dismiss
it before I can actually look at what it just named. Then step 2 jumps straight to "Your profile"
(g-10): the promised middle step, "Save what you love — Add pieces to a room with + Add," never
renders at all. The Companion intro card appears immediately after ("I'm your Companion... I'll show
you the way to what's next," g-11) — friendly, but it never teaches me the save mechanic the missing
tour step promised to. I finish onboarding never having been shown how to actually keep something.

**Where I'd leave:** I don't leave — I'm here to document — but a real first-time user who wanted to
be taught the save loop and wasn't would be improvising their first save by trial and error five
minutes later (see T4).

**Would I come back tomorrow for this?** No, not off T1 alone — nothing in the first five minutes
gives me a reason distinct from "I already opened it once." The Next Move card's one line ("Bring
your first room into Patina") is the only forward-looking hook, and it's a chore, not a reward.

**Obviousness: 3** — every individual screen is legible, but the coach-mark sequence undercuts its
own teaching job (U2-01, U2-02, U2-03), and the soft-wall variant of the auth gate later in the same
guest session (U2-28) removes escape hatches the front door has.

Findings: U2-01, U2-02, U2-03, U2-24, U2-25, U2-26 (partial), U2-28.

---

## T3 — "Find a sofa for our living room."

**First glance:** There's no search field anywhere — I open the Companion orb and tap "Your
recommendations." I land on "Browse pieces / 10 pieces curated for your space" (g-15), and my eye
immediately catches that the left column is broken: a card title reading "...M & BOARD" /
"...rloom Oak" / "...ing Table" with no left half visible, cut clean off the screen edge.

**Where I'd tap:** The "Seating" chip, to narrow to sofas. The subtitle updates to "3 pieces curated
for your space" (g-16) — three overlapping cards of different heights, one of them a flat brown
gradient with no product photo at all.

**Where I'd hesitate:** Is "3 pieces" really the entire seating catalog, or is this chip only
filtering what's already on my screen? (It's the latter — client-side only, per the code — but
nothing on screen tells me that; I'd assume the smaller number.) Then I tap a card and hit "Couldn't
load product / Let's try that again" (g-17) — no back button, no nav bar, nothing else on the screen
at all. I try the retry link; it fails the same way.

**Where I'd leave:** This is the moment. Every path through Browse ends here — I have never reached
a single working product page in this walk. If I were a real shopper I'd be back on Wayfair by now,
not because the sofa was wrong but because the app would not let me see it.

**Would I come back tomorrow for this?** No. A browse surface that cannot render a single product
detail page, on any account, in any theme, at any text size, is not a surface I'd trust with a second
visit for shopping.

**Obviousness: 1** — could not complete the task. The grid itself is geometrically broken before the
dead end even arrives.

Findings: U2-04, U2-05, U2-06, U2-07, U2-08.

---

## T4 — "Save it. Find it again tomorrow."

**First glance:** Saving is genuinely one tap — the heart icon on a browse card, or "Add to Room" on
a (working) detail screen. That part of the promise holds.

**Where I'd tap:** Tomorrow, to find it again: Companion orb → "Saved." Except that row is
conditional — it only appears when a specific counter is above zero, and that counter counts a
*different* kind of save record than the one the heart icon or "Add to Room" actually writes. Saved
has no other door in the app. So for the two most obvious ways to save something, the nav row that
would lead back to it can simply not be there tomorrow.

**Where I'd hesitate:** When the row does appear and I do reach Saved, it opens on "Boards" by
default — "No boards yet / Save pieces from recommendations to create your first board" (g-21) — even
though my one saved piece is sitting right there under "All items" (g-22b). I'd read the empty
Boards tab and, for a second, believe nothing saved at all. If I tap "Create Board" to fix that, the
board I create can never hold anything — `addToBoard` has no caller anywhere in the app.

**Where I'd leave:** Not immediately — the item *is* there once I find the right tab — but the
architecture means "find it again tomorrow" is a coin flip depending on which save gesture I used
today.

**Would I come back tomorrow for this?** Only if I remember to check "All items" specifically and
only if my earlier save happened to be room-scoped. That's not "one tap, where I expect it" — it's
"maybe, if I guess right."

**Obviousness: 2** — the mechanism exists but the door to it is unreliable and the default view lies
about what's there.

Findings: U2-09, U2-10, U2-11, U2-12.

---

## T5 — "See it in my room."

**First glance:** No LiDAR in Simulator, so "Bring your first room into Patina" forks to a typed
form: room type, dimensions, windows, doors (g-25). I notice the "ft / m" toggle immediately —
it's tiny, maybe a third the width of the "ft" label next to it.

**Where I'd tap:** I type 18 for length, 14 for width, assuming feet (the form defaults to "ft").
"Continue to Style Discovery," then "This Looks Right" on the summary. The room that comes back is
"Living Room / 2713 SQ FT" — dimensions 59'×46' (g-27, g-28b). My 18×14 became 59×46. Nothing in the
form told me the toggle had moved, because it doesn't visibly move when tapped.

**Where I'd hesitate:** The room view's stat row reads "0 ITEMS," "— MATCH," "0 IN AR" — none
defined anywhere on screen (g-28b, c-24, d-06). Then three different phrasings of "browse for this
room" stack on top of each other: body copy, a button, and a link (g-28b) — I pause to figure out if
they're different options before realizing they're probably not.

**Where I'd leave:** Trying to get a piece *into* the room is where this breaks down completely. Even
entered from the room's own "Browse Picks for This Room" CTA, the card menu still offers only
Save/Share/Not for me/View details — no "add to room" action exists. And "see it in my room" via AR
is dead for every product: `usdz_url` is null server-side for the whole catalog, so the AR button
never renders and "0 IN AR" can never become anything else.

**Would I come back tomorrow for this?** No — the room I built is wrong (corrupted dimensions), the
piece I wanted to add has no way in, and the AR promise ("see it in my room") has no path that
doesn't end in "3D model not available for this product."

**Obviousness: 2** — the manual form is easy to fill in, which is exactly the problem: it's easy to
fill in *wrong*, silently, and the room-building loop past that point doesn't exist.

Findings: U2-13, U2-14, U2-15, U2-16, U2-17, U2-26 (partial), U2-27.

---

## T13 — "One-handed on the bus · dark mode · larger text."

**First glance (reach):** The Next Move and Active Room cards are full-width in the lower two-thirds
— genuinely thumb-friendly (g-12, x-01). The Companion orb sits in a reserved bottom hearth — the
best-placed control in the app. The three top-right glyphs (bell, ?, monogram) are the opposite:
~36pt targets in the single hardest corner to reach one-handed, and the monogram is the *only* door
to the Studio — every project, proposal, invoice, and decision the app knows about is one bad-reach
tap away, not one easy tap away.

**Where I'd tap (dark mode):** I switch to dark and walk the same activeProject account. The palette
itself holds up well — cream-on-near-black is legible everywhere I checked, no illegible pairs. But
d-01 (top) and d-02 (after a swipe) are pixel-identical: Home doesn't scroll at all for this account,
so the swipe just does nothing, with no cue that four pending items exist two acts away. Deeper in,
the Studio list's scrolled rows sit *under* the fixed status bar — the clock draws right over "Review
by Sep 8" (d-02). And one screen — the room-summary confirmation, d-06a — ignores the dark override
entirely and renders in full light theme, sitting between six other dark screens in the same
unbroken session.

**Where I'd hesitate (XXL):** The filter chip row on Browse overflows the screen — "Storage" clips to
"Stor" with no scroll hint (x-03). The same status-bar-occlusion bug from dark mode reproduces worse
here: the Dynamic-Island pill itself sits on top of the proposal title (x-02), and a third time on a
modal sheet — "Close" and "Your design request" overlap the clock (x-06). On the proposal detail
screen, wrapped body text runs straight into the fixed Companion button with no bottom padding
reserved for it (x-05) — the last visible words are cut off mid-sentence.

**Where I'd leave:** Nowhere forces an exit in T13 itself — everything I could reach was at least
readable — but the accumulation (four distinct safe-area misses, one theme-ignoring screen, one
overflow with no affordance) reads as a surface that was tested at default settings and not much
beyond them.

**Would I come back tomorrow for this?** The reach and contrast fundamentals are sound; it's the
edge conditions (scroll, safe area, XXL wrap) that would erode confidence over repeated use, not any
one screen on its own.

**Obviousness: 3** — nothing is unusable, but four independent instances of the same missing
safe-area inset is a pattern, not a coincidence, and it's worth fixing once rather than four times.

Findings: U2-18, U2-19, U2-20, U2-21, U2-22, U2-23.

---

## Closing — the seven U2 questions

**1. Reachability graph of the home at each tier.** Per the code, the graph is *one* graph, not
four — `DailyRoomView` mounts the identical four blocks (greeting header, Next Move, story, Active
Room) at guest, discovering, engaged, and activeProject alike; only the Next Move copy and whether
an Active Room card exists actually vary by state.

| Door (from Home) | Destination | Acts from Home | Tier gate |
|---|---|---|---|
| Bell | Notifications | 1 | all |
| ? | Help panel | 1 | all |
| Monogram | Profile | 1 (→ Studio hub list = **2**, → a detail = **3**, → Pay/Sign act = **4**) | all |
| Next Move card | state-dependent (scan / quiz / decisions / messages / room / fallback) | 1 | all |
| Editorial story card | Story detail overlay | 1 | all |
| Active Room card | RoomProjectView | 1 | only if a room exists |
| Companion orb | Companion panel | 1 | all |
| Companion → "Your recommendations" | Browse pieces | **2** | all |
| Companion → "Your spaces" | YourSpacesView | **2** | all |
| Companion → "Add a room manually" | ManualRoomEntryView | **2** | all — this is the *only* door to it |
| Companion → "Saved" | Saved (table) | **2**, or unreachable — row hidden at count 0 (U2-11) | all |
| Companion → "Your studio" | a bare Projects list (not the hub) | **2** | engaged+ |
| Companion → "Get design help" | Design-request sheet | **2** | all |
| Home → monogram → Profile → Studio → a row | Decisions / Proposals / Invoices / Budget / Documents / Archive list | **3** | all |
| … → a list row | Decision / Proposal / Invoice / Project detail | **4** | all |
| … → Pay / Sign / Choose this | the actual money/decision act | **5** | all |

**Anything >2 acts:** everything under the Studio (3–5 acts), a room-scoped browse-to-piece-in-room
loop (4 acts, and only when the room has a synced remoteId), and "Get design help with this room"
from a populated room (6 acts total). `.yourSpaces`, `.manualRoomEntry`, `.roomSavedItems`,
`.projectList/proposalList/invoiceList/budget`, and `.designerConsultation` all have **no home door
at all** — Companion-only, per the code (A1).

**2. Is the Companion carrying tab-bar weight, and where does it fail?** For "go somewhere," yes —
it's the only menu with rows per screen context, and the row budget/dispatch is disciplined (≤6 rows,
exhaustive switch, no default case). It fails at:
- **Discoverability** — nothing is glanceable without a tap. A tab bar tells you what exists just by
  being on screen; the Companion requires opening the orb and reading subtitles to learn the app has
  a Studio, or Saved, or anything else. Saved's row can vanish entirely (U2-11) with no trace it was
  ever there.
- **Cost** — every destination costs a minimum of 2 acts vs. 1 for a tab bar, and the "Your studio"
  row costs its subtitle's credibility too: it promises "PROJECTS · MESSAGES · DECISIONS" and lands
  on a bare list, not a hub (per code read, A10).
- **Hidden state** — the same row label can lead to different places, or disappear, depending on
  invisible counters (`tableItemCount`, `EngagementTier`) the user has no way to inspect. A tab bar's
  items don't move or vanish on you.

**3. First viewport per tier — work or chrome?** Chrome, overwhelmingly, at every tier. The
composition is byte-identical across guest/discovering/engaged/activeProject (A2) — date, "Today,"
bell, ?, monogram, an editorial promo card, and a Companion hearth spacer are all chrome. The only
"work" line on the whole screen is Next Move's one sentence, and even for activeProject — the tier
with the most real work waiting (3 projects, 4 proposals, 1 invoice, 2 decisions in this seed) — that
one line surfaces at most one of those four items; the other three are invisible without three-plus
more acts (U2-23).

**4. Tappable-but-isn't / the reverse.**
- *Looks tappable, isn't:* "Account >" in Settings (full row + chevron, inert — g-02b, U2-24); the
  ft/m unit toggle (fires but shows no state change — U2-13); the profile stat tiles ("0 ROOMS / 1
  SAVED / 48% MATCH," g-36 — no affordance, no response); the Studio hub's Proposals/Invoices/
  Budget/Archive rows, which draw chevrons and respond to sighted taps but expose no accessibility
  button role at all in the default state (per walk-observation, not directly re-verified by me at
  the AX-tree level).
- *Is tappable, doesn't look it:* a horizontal drag across a browse card — which reads as a scroll
  gesture — instead fires that card's save toggle (per walk observation, g-15c); browse cards
  themselves are exposed to VoiceOver as `AXPopUpButton` ("pop up button"), the wrong semantic role
  for a product card, so an assistive-tech user gets a different mental model of what the control
  even is than a sighted user does.

**5. Dark mode + XL type — home, piece detail, Saved, room.** See T13 above and U2-18–U2-23 for the
verified list: one screen (room-summary) ignores dark mode outright (U2-20); the status bar occludes
scrolled content in dark and worse at XXL, reproducing on three unrelated surfaces (U2-19); the
XXL filter-chip row is unreachable past "Storage" (U2-21); XXL proposal-detail text is clipped by the
Companion button (U2-22). Piece detail could not be evaluated in either theme/size beyond its error
state, because it never renders successfully in any lane (U2-07) — the hard trap itself is confirmed
identical in light, dark, and XXL. Saved could not be walked into in the dark/XXL lane at all: the
Companion's Saved row was absent the whole session (0 saved items server-side for that account), which
is itself the sharpest illustration of U2-11 — a client who has genuinely never saved anything cannot
even discover what Saved looks like.

**6. Where does motion add meaning vs. decoration?** (Code-read, confidence moderate — no animated
transition is observable in a static screenshot.) Meaning: the tour/coach-mark pattern and the
Companion shell's spring/crossfade are gated so geometry settles before copy enters — motion
sequences attention rather than just moving pixels, and both are Reduce-Motion-aware (crossfade
substitutes for the spring). Likely decorative: the Strata mark's idle "breathing" animation on
splash/auth carries no state and is also disabled under Reduce Motion — nothing is lost when it's
off, which is itself evidence it was never load-bearing.

**7. Bespoke exits — quiz, product detail, AR, scan.**
- **Style quiz:** has a real, visible ✕ at the top of Q1 (g-06) — obvious, present, works as
  intended at the one step I could confirm.
- **Product detail:** the deliberate exemption (C19) gives it a self-owned floating back chevron
  instead of the shared chrome — but that chevron only exists in the success layout. The one state
  every real tap in this program landed in (the error state) renders exactly one element, the retry
  link, and no exit at all (U2-07). The exemption's own intent — "this screen owns its exit" — is
  defeated by the state that is currently universal.
- **AR (ARPlacementView):** never reachable in Simulator (no camera, no ARKit world tracking) —
  code-read only, confidence 0.5. What would settle it: a device pass, though it would still dead-end
  immediately on `usdz_url = NULL` for every product (U2-17), so the exit question is moot until that
  changes.
- **Scan / manual fallback:** the only fork reachable in Simulator (the typed room form) has no
  Back, Close, or Cancel anywhere on screen (g-25) — not merely non-obvious, genuinely absent.
- **Worth naming alongside these:** the guest soft-wall auth sheet (U2-28) is the most extreme "no
  exit" case in the whole app — strictly fewer escape hatches than the app's own front door, thrown
  at the least forgiving moment (right after a completed design request).

---

## Findings table

| id | title | severity | confidence | shots |
|---|---|---|---|---|
| U2-01 | Tour skips the app's only save-loop lesson | S1 | 0.90 | g-09, g-10, g-11 |
| U2-02 | Coach-mark buttons use the app's only system blue | S3 | 0.90 | g-09, g-10 |
| U2-03 | Coach-mark bubble hides the element it describes | S2 | 0.85 | g-09 |
| U2-04 | Browse grid renders off-canvas, unreadable cards | S0 | 0.95 | g-15, g-16 |
| U2-05 | No search exists anywhere in the app | S1 | 0.85 | g-15 |
| U2-06 | Filter chips imply catalog-wide scope but filter one page | S2 | 0.85 | g-16 |
| U2-07 | Piece detail is a dead end with no bespoke exit | S0 | 0.95 | g-17, d-04, x-04 |
| U2-08 | Product photography does not match the listed piece | S1 | 0.85 | g-15 |
| U2-09 | Saved opens on a tab that says nothing is saved | S1 | 0.90 | g-21, g-22b |
| U2-10 | "Create Board" is the primary CTA on a dead-end feature | S1 | 0.90 | g-21 |
| U2-11 | The nav row back to Saved can vanish for the exact saves the app invites | S0 | 0.85 | g-21 |
| U2-12 | Price format changes between the grid and Saved | S3 | 0.90 | g-22b |
| U2-13 | A 6-point-wide toggle silently corrupts room data | S0 | 0.90 | g-25, g-28b, c-24, d-06 |
| U2-14 | Room stats show undefined abbreviations | S2 | 0.90 | g-28b, c-24, d-06 |
| U2-15 | One action offered under three different names, stacked | S2 | 0.85 | g-28b, c-24, d-06 |
| U2-16 | No "Add to room" action, even entered from the room itself | S0 | 0.75 | g-28b |
| U2-17 | AR is offered by the UI but cannot ever render | S1 | 0.90 | c-24 |
| U2-18 | The only door to the Studio is the worst-reached control | S1 | 0.85 | g-12, x-01 |
| U2-19 | Status bar draws over content, worst on sheets at XXL | S1 | 0.90 | d-02, x-02, x-06 |
| U2-20 | One screen ignores the dark-mode override entirely | S2 | 0.90 | d-06a, d-01, d-06 |
| U2-21 | Filter chip row overflows the screen at XXL, unreachable | S1 | 0.90 | x-03 |
| U2-22 | Body text runs into the Companion button, no reserved space | S1 | 0.90 | x-05 |
| U2-23 | Home doesn't scroll, no sign anything is hidden | S1 | 0.90 | d-01, d-02 |
| U2-24 | "Account >" is a fully-styled dead row | S1 | 0.90 | g-02b |
| U2-25 | No Sign Out control anywhere in the app | S1 | 0.80 | g-02b |
| U2-26 | Two different quizzes exist and disagree with each other | S1 | 0.80 | g-06, g-26 |
| U2-27 | "YOUR ROOM IS CAPTURED" mislabels a typed form | S2 | 0.85 | g-26 |
| U2-28 | The soft wall removes every escape hatch the real gate has | S1 | 0.85 | g-35, g-02 |
| U2-29 | The Companion's own headline changes wording for the same panel | S3 | 0.70 | g-14b, d-09, x-09 |
