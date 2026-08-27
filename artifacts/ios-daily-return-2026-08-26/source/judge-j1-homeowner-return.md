# Judge J1 — Homeowner return

**Rubric:** instruments §8, J1. Four cells of ten. H1 / H2 / H3 each carry that seat's hour
(9:10pm Maya · 12:30pm Ruth · 7:40am Walt), that seat's two-weeks-away answer, and the screen that
earns the open. The fourth cell is honesty of the reward, judged across all three. **Total /40 per
direction. Not averaged with J2 or J3.**

**Read:** `source/direction-a.md` (v2) · `source/direction-b.md` (v2) · `source/shared-planks.md`
(SP-01…SP-20) · the eight critiques · `research/36-findings-by-theme.md` ·
`research/31-verified-findings.json` · `research/2x-panel-h1/h2/h3.md`. Both directions are judged
in their v2 form, with their §12 critique logs; where a critique's blocking item is closed in v2, it
is not scored against the direction again.

Both documents assume the twenty planks ship. Nothing a plank already fixes is credited to either
side.

---

## Scores

| Cell | A · Since You Were Here | B · The Record |
|---|---|---|
| **H1 · Maya — 9:10pm, discovering, one room, three saved** | **5** | **8** |
| **H2 · Ruth — 12:30pm, activeProject, one open invoice** | **8** | **9** |
| **H3 · Walt — 7:40am, discovering, no designer** | **8** | **7** |
| **Honesty of the reward** | **9** | **8** |
| **Total** | **30 / 40** | **32 / 40** |

---

## The reasoning, one line per cell

### H1 · Maya — would she open it tomorrow?

**A — 5.** *The screen that earns it:* the Active Room card's new fill line, `$3,590 saved · your
range $5K+` (M2) — her stated second reason to open, and A prints the quiz's own label
(`StyleQuizViewModel.swift:239-247`) instead of deriving a figure, which is the right call. *Her
hour:* at 9:10pm in wave 1 the `WHAT MOVED` line reads "The jute rug has been in the Living Room
since Sunday" — her own act, handed back to her dated as news; catalog rows newer than her last
visit are wave 2 by construction, because `get_recommendations` projects no `created_at`. *Two weeks
away:* the line does not draw, so her home is byte-similar to the one she left — F13/F16(=F34) are
answered for Ruth and thinned for Maya. *The cost that decides the cell:* A re-mounts nothing on the
home and accepts no tab bar (§8.1), so the twenty-minutes-on-the-couch browse ritual — the Pinterest
habit this seat lives in — has no door on the first screen and Saved has none either (F98, F14,
F42). Her third reason, Devon, is declined outright (F54, F105, F129, F168). Two of her three asks
answered thinly, one refused.

**B — 8.** *The screen that earns it:* M2 — the record with a MOVED eyebrow, then `YOUR HOUSE`
(`Living Room · 3 saved pieces · budget $9,000 · You added the Brass Arc Floor Lamp on Tuesday`),
then `NEW THIS WEEK` behind a ≥3 supply floor, then Saved as a summary row that draws at zero (F14),
then the Pieces tab. *Her hour:* the record mounts at her tier with rows that are real changes to
real rows — a saved piece repriced against `saved_items.price_cents_at_save`, a piece withdrawn
(`products.deleted_at`), the story with its own publish date — and B says out loud that discovering
is promised a **weekly** return, not a daily one, rather than staging one it cannot pay. *Two weeks
away:* `You were last here on the 12th.`, the record grouped by week, the two silent 14-day decays
removed (F189). *What wins it:* B gives the browse ritual a permanent door (Pieces tab, M9), keeps
Saved a canonical destination behind a labelled row, and answers Devon at W6 with
`household_members` + an invite RPC — far out, but named and sized. *Held back from 9:* on a
21-row seed catalog the price-change row and the three-row floor may both go dark for weeks at a
time, which B concedes.

### H2 · Ruth — would she open it tomorrow?

**A — 8.** *The screen that earns it:* M1 — `WHAT MOVED` / "Leah moved Aspen Loft into Installation
& Styling on Monday. A proposal arrived Thursday.", then one hero `NEXT MOVE` / "Leah is waiting on
two things" / "A rug colour since Aug 22 · a proposal by Sep 8 · your invoice is due Sep 1". *Her
hour:* all three of her stated asks land — one count computed once from `BadgeCountService` and
shown everywhere (F41, F30=F37, F80, F91), `Message Leah` as the Companion's row (SP-13), and a
since-line with dates on the facts. *The best single move in either document* is A's ordering: the
house first, the chores second, with `current_phase` read from a fetch already on the wire
(`ProjectsAPIClient.swift:25` via `BadgeCountService.swift:85`) — zero new calls — and an
empty-queue Next Move that names the phase, so a live project stops falling off Today (F58). *Two
weeks away:* right, with a six-hour suppression so the fourth open of the day does not re-date
itself. *What holds it at 8:* her question is "can I check on my house the way I check on a
package," and the dining table Leah bought has no client-visible status until wave 2's RLS policy —
A says so plainly, which is honest but is still a no this quarter (F19, F66, F90, F202, F198); and
F101 is declined, so her dining room and primary bedroom exist only as lines on a bill and her home
is three blocks with no room card at all.

**B — 9.** *The screen that earns it:* M1 — one card, two eyebrows, every waiting item on it with
its own date and state (`asked Aug 22 · overdue`, `by Sep 8`, `$4,250.00 · Sep 1`), a permanent
designer seat under it, then `YOUR HOUSE` as a rail of her real rooms read from `project_rooms`
(F101), then the story. *Her hour:* the window is a rolling seven days with a `new` tick, so the
fourth open at 12:30pm still holds a record rather than emptying out — the failure her own walk
found. *Two weeks away:* the same screen, grouped by week, nothing decayed. *What wins it:* M8 —
**Ordered over both rails**, `direct_orders` for what she bought and `fulfillment_orders` scoped to
`client_profile_id` for what Leah bought, one card, one four-step rail, the six transition words
verbatim from `_shared/fulfillment-templates.ts:31-37`. That is the literal answer to her one
question, and B is the only document that gives it a screen. *Held back from 10:* the house rail is
W3 and Ordered is W4, so her first release is the record, the push and a labelled Studio door — good,
but not yet the package-check.

### H3 · Walt — would he open it tomorrow?

**A — 8.** *The screen that earns it:* the story card with an unread dot that finally turns off —
the hard-coded `true` at `DailyStoryCard.swift:80-87` replaced by a stored read, serving the highest
`sort_order` he has not opened (F46=F61, F131). *His hour:* header, one Next Move, one story, no
line at all, because A's governing rule is that the block **draws only when something moved**. That
rule is written directly out of his own objection — he said he would not take four consecutive
mornings of a dated record of his absence — and A is the only direction that took it literally. His
coffee costs him eight seconds and nothing nags. *Two weeks away:* nothing scolds, nothing decayed,
the promotion window re-anchors to last seen with a 60-day ceiling (F189). *His $4,000 chair:* A's
seven-field buyable gate is the tighter of the two — maker, dimensions, `lead_time_weeks`,
`price_retail`, `shipping_flat_cents`, `returns_policy_key` and **`photo_verified_at`**, a human
sign-off on the picture, which is the only mechanism either document offers against the seed's wrong
photographs (F06, six seats) — plus the fit line, the damage owner backed by `fulfillment_exceptions`
(`00350:186-200`), and an order sheet that refuses to print a total the rail cannot take. *What
holds it at 8:* his first act at discovering is still "Bring your first room into Patina", the app's
heaviest ask (F120), and A's day begins at sign-in — the gate a skeptic bounces off at 7:40am
(F108, F117, F165) is named as a hole in the floor and left there.

**B — 7.** *The screen that earns it:* M1's record when something has moved, and the story card with
`AUG 25 · 4 MIN` where the permanent dot used to be. *His hour:* the greeting reads the clock from
`TimeOfDay` (F186, F188, F209 — A declines these outright), the guest lands on the house rather than
a wall, and the first act on `Start with a room` is the light one — **"Type the dimensions"** before
"Scan it" (F120). Those three are real wins for exactly this seat. *What costs it:* when nothing has
moved, B prints **"Nothing moved since Thursday."** and frames the eight-second close as a success.
Walt's own words are that an app naming the day he was last here, morning after morning, is counting
the days at him — and at discovering, with no designer and a three-story well, that is most
mornings. B answers his ask; A answers his objection. *Two weeks away:* `You were last here on the
12th.` — same instrument, same risk. *His $4,000 chair:* B's gate is equally firm and B goes further
on the two things he leads with — the real `products.description` printed, and Path A held behind a
config-driven responsibility paragraph plus **one reachable human**, not the word "support" (F144).

### Honesty of the reward

**A — 9.** The line draws only when something moved; there is no null sentence anywhere; the dates
sit on the facts, not on the person. The money half prints the band the person answered with and
omits itself when the answer is `TBD` — no derived figure, no filling meter. The unread dot earns
itself. The widget carries what moved and never a count of chores. The permission is asked once,
ever, at the first real money event, behind one screen with one sentence, and A refuses to re-ask on
a debt. Live Activities and a Wallet pass are both refused for want of an honest artifact. Every
mock date is marked *[example]*. A draws the Safari **Done** tap rather than implying the app catches
the return. And the discovering line is gated on twelve banked stories and a named publishing owner
— a refusal to ship a reward against an empty well. *The one wobble:* wave 1's Maya line reports her
own act back as what moved, which B forbids by name and is right to.

**B — 8.** Equally disciplined on the instruments that matter: a ≥3 supply floor that never pads; no
count on either widget; the price change stated in both numbers with no was/now, no scarcity, no
countdown; the story ordered `published_at desc` and demoted when nothing published; "no activity row
for the reader's own actions — if you did it, it is state, not news"; the taste line cut until one
quiz owns one name (F96, F140); the widget admitted to be one open behind rather than promised a
refresh it cannot make; Path A gated on a tax ruling and a responsibility paragraph that do not yet
exist. *What costs the point:* B mounts the record as the app's centerpiece at guest and discovering
and then prints an empty state most weeks. An honest empty is still a promise the data cannot keep,
and the seat it is aimed at said so. A's handling of the identical fact — do not draw — is the more
honest one.

---

## Verdict

**Direction B, 32 to 30.** A narrow win, and the margin moved in v2: A's revisions closed almost
everything the homeowner critique raised. The two directions split cleanly. **A is better at not
lying** — its governing rule (draw only when something moved) is the single best honesty instrument
either document produced, and it wins Walt on it. **B is better at not hiding** — it is the only
direction that gives Maya's browse ritual a door that cannot vanish, gives Ruth her own rooms, and
gives her the one screen she actually asked for: Ordered, over both rails, so the furniture her
designer bought is on it.

For a judge asked "would they open it tomorrow," the deciding fact is that two of three seats spend
their return on surfaces A leaves behind a 36 pt monogram and an orb.

### What must ship first

**B's W1, which needs none of B's amendments and mounts inside Option B's contract:**

1. **The record** (`HouseRecordCard`, both eyebrows, both empties, rolling seven days, `new` tick)
   plus `RecordSnapshotStore` so the first paint is the record and not a spinner. Answers F13,
   F16(=F34), F30(=F37), F80, F91, F41.
2. **The labelled `Studio` control with its waiting count** in the monogram's place — B-1's fallback,
   independent of the tab-bar flag. This is the door fix that does not wait on a ruling (F11, F126,
   F134, F50).
3. **The four money pushes behind `PushPrimerView`**, each passing a `notification_log_id` — and they
   ship *in the same release as the senders*, because the authorization is one-way per install and is
   spent, not rolled back (F07, F38, F47, F167, F08).
4. **`BadgeCountService` retains the rows it already fetches**, and `StudioQueueBuilder` gains a
   per-item row. No new network calls.

**Held for a ruling, not for engineering:** the tab bar (B-1/B-2 amend C1 and C8 — Kody's call, and
W1 is whole without it); Path A checkout (gated on the Stripe Tax registration decision *and* the
responsibility paragraph, both named as rulings); the editorial cadence owner, without which the
discovering half of either direction goes dark.

---

## Grafts — what B must take from A

1. **Draw nothing when nothing moved, at guest and discovering.** Replace "Nothing moved since
   Thursday." with silence for the tiers whose record can be empty for weeks; keep the printed empty
   only where a designer exists and the absence is itself information (H3 panel, A §1).
2. **The empty-queue Next Move names the phase** — `Aspen Loft is in Installation & Styling` /
   `Leah's next milestone is the final walkthrough`, from `current_phase` already on the wire
   (`ProjectsAPIClient.swift:25`). B defers phase rows to W3 for want of a destination; the
   composition answer is free today and it is what keeps a live project on Today (F58, F76, F125).
3. **Card weight follows content.** When the record is non-empty it takes the hero footprint and the
   story renders as a 96 pt row; on a quiet day the weights swap back. B demotes the story but never
   promotes what is waiting.
4. **Six-hour suppression.** A record re-opened inside six hours holds its content and never
   re-dates itself — cheaper and quieter than the `new` tick alone.
5. **`products.photo_verified_at`.** B's buyability gate says "an image verified against the piece"
   with no mechanism; make it a column a human sets, or the wrong photographs walk straight into a
   $4,200 order sheet (F06, F17).
6. **Credit the roster designer.** A client on `designer_clients` (`00014:72-90`) with no accepted
   lead still sees Buy — credit that order at `products.commission_rate`, falling back to
   `fulfillment_config.commission_rate_default` (`00351:104`), most recent roster row wins, a
   same-day tie files uncredited rather than guessing (F22=F26, F152).
7. **Draw the Safari `Done` tap** on the payment hand-off until the universal-link repoint lands,
   rather than implying the app catches the return.
8. **Make the designer's `Message` row state-driven, not permanent-prominent** — suggested only when
   nothing is waiting. A seat that promotes messaging on every visit is tuned to generate inbound
   mail, which is D2's stated failure mode and Ruth's least favourite habit.
