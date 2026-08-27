# Critique — Direction B "The Record," canon lens

Reviewed against `instruments.md` §6 + §6b and `research/11-canon-digest.md` §6, row by row, plus
the glossary (§3), voice rules (§4), the ruling ledger (§1) and the R32/backlog note it carries, and
`OPTION_B_ACCEPTANCE.md` and `research/10-code-anatomy.md` where a claim needed checking against the
actual shipped tour/home copy. Every finding id Direction B cites was checked against
`research/31-verified-findings.json` and against the refuted-findings list; none of the refuted ids
(F21/F33/F35/F82/F94, F75/F88/F116/F166, F18, F57, F39/F149/F181) appears anywhere in the document —
that discipline is real and is called out below. Line numbers are `source/direction-b.md`.

---

## Blocking

### B1 — The tab-bar rewrite silently kills two of the three ratified first-launch-tour steps, and the cost line calls it "re-anchoring"

**Section it hits.** §8, amendment B-1 (lines 289–301) and M1 (line 474), against **C18**
("First-launch tour content is canonical and delivered… Don't re-propose different tour copy").

**The problem.** The ratified tour (`FirstLaunchTour.swift:227–252`, pinned by
`FirstLaunchTourTests`) has three steps. Step 1, anchor `.homeGreeting`: *"Welcome to Patina" / "This
is your Daily Room — picks and stories chosen for your space."* Step 3, anchor `.profileMonogram`:
*"Your profile" / "Rooms, saved pieces, and settings live here."* Direction B's own M1 mock removes
the anchor step 3 points at outright — *"The monogram is gone — Profile lives in the Studio tab"*
(line 474) — and step 1's copy ("picks and stories chosen for your space") no longer describes the
screen it introduces once the record, the designer seat and the house rail replace the
picks-and-story home. Neither step is workable as written once B-1/B-3/B-4 ship. B-1's own cost line
(line 299) files this under *"re-anchoring the first-launch tour"* — the same word used for moving a
SwiftUI anchor modifier, not for the fact that two of three ratified sentences become false or
dangling. §8's job, by the document's own convention (every other B-n entry), is to say *what*
changes and *why* and to price it; here the *what* is understated to the point of hiding that a
ratified, tested artifact needs new copy, not a new coordinate.

**Evidence.** `research/10-code-anatomy.md:592-598` (the three declared tour steps, their anchors and
copy, verbatim); `direction-b.md:474` (monogram removed); `direction-b.md:289-301` (B-1's cost line,
no mention of tour *copy*); canon-digest §6 **C18**.

**The fix I'd accept.** A line in B-1 (or its own B-8) that names the tour as touched: which steps
survive, what step 3's new anchor and copy are (or that the tour drops to two steps and why that's
acceptable), and that this is a rewrite of ratified, tested copy — not a relocation.

### B2 — B-7 claims the tab bar preserves every canonical name "in full," but the claim can't be true for the surface the merge actually changes

**Section it hits.** §8, amendment B-7 (lines 346–350), against **C4** (one canonical name per
surface; glossary §3).

**The problem.** B-7's own sentence: tab labels are *"Today · Spaces · Pieces · Studio,"* while
*"every destination screen keeps its canonical title verbatim ('Your Spaces', 'Browse pieces', 'Your
Studio', 'Saved'), and each tab's VoiceOver label is the canonical name in full"* (lines 346–350).
Count the two lists: four tab labels, four quoted canonical titles — but they don't line up 1:1.
**Saved** is not one of the four tabs (§3 puts it inside Pieces as a segment: *"Pieces tab → Saved
segment,"* line 106; M2 line 521 routes a tap to *"Pieces/Saved"*), so a canonical destination the
July glossary and C4 both name as its own surface (with its own **Boards/All items** sub-tabs) is
now reached through a tab whose own VoiceOver label can only be *one* of "Browse pieces" or "Saved,"
not both. And **Today** — the actual home tab — has no canonical title in that quoted list at all;
"Today" is real shipped copy on the header (`code-anatomy.md:116`, "the word is literally 'Today'"),
but it is not the glossary's canonical name for the surface (§0 calls it "the home ('Daily Room',
`DailyRoomView`)," and that name is what the ratified tour speaks — see B1 above). So the sentence
that is supposed to prove B-7 is a pure rename is itself evidence that it isn't: merging two
canonically-named surfaces into one tab is a real information-architecture change, not a label swap,
and it is costed at *"one string table"* (line 350) — which is the cost of a rename, not of a merge.
No mock exists anywhere in §11 for the Pieces tab itself (M1–M8 cover home ×2, piece detail, room,
purchase flow, return moment, ask-designer, and Studio→Ordered — never Pieces/Browse/Saved as a
destination), so the merge's actual shape — segmented control? two-level nav? which one gets the tab
icon's accessibility label? — is undrawable and unverifiable from this document.

**Evidence.** Lines 346–350 (the claim); line 106 (`Pieces tab → Saved segment`); line 521 (`Pieces
/Saved`); `code-anatomy.md:116` ("Today" is real UI copy, not the glossary name); `instruments.md`
§0 (canonical home name = "Daily Room"); no M-mock covers Pieces/Browse/Saved.

**The fix I'd accept.** Either give the merge its own line in B-7 — name it as a structural change
(two canonical surfaces reached through one tab), say which one owns the tab's VoiceOver label and
what the other becomes (a segment? a nav push from a "Saved" row inside Pieces?) — and add a ninth
mock for it; or split Saved back out as its own reachable destination and own that the tab bar has
five doors, not four, with the cost that implies.

---

## Major

### M1 — B-6's amendment to C11 never reasons through why direct orders (R32 item 3) is built ahead of reviews and scope-change (items 1–2); the reversal only surfaces as a side note three sections later

**Section it hits.** §8, amendment B-6 (lines 340–344), against **C11** / R32 ("ratified backlog
item, sequenced reviews → scope changes → direct orders → GDPR").

**The problem.** C11 is explicit that the ratified order puts client reviews and scope-change
requests *before* direct orders. B-6 amends C11 to design and ship direct orders in W4 — that's
within Direction B's license (C11 says the attribution decision, and by extension whether to build
now, "is open and free to make"). But B-6's own why/cost/rollback (lines 340–344) argues only from
the purchase-dead-end findings (F12, F32, F151, F153, F150, F87); it never says a word about jumping
ahead of items #1 and #2. The only place that ordering shows up at all is a half-sentence deep in
§10's "does not do" list: *"no client reviews, no scope-change requests — the last two are R32's
backlog items 1 and 2, sequenced after orders"* (line 429) — phrased as an exclusion, not as the
reasoned justification for inverting a ratified sequence that §7's own rubric asks every amendment to
carry.

**Evidence.** `instruments.md` §6 **C11** (the ratified order); `direction-b.md:340-344` (B-6, no
sequencing rationale); line 429 (`R32's backlog items 1 and 2, sequenced after orders` — the only
place the reversal is named, and only as a bullet in what's *excluded*).

**The fix I'd accept.** One sentence inside B-6 itself: why building order-tracking now (backend
chain already exists end-to-end per C24, zero client code for reviews/scope-change) costs less than
holding the ratified order, and that this is a conscious reversal of R32's #1→#2→#3, not an omission.

### M2 — M7 breaks the single canonical retry string on a screen Direction B authors itself

**Section it hits.** M7 screen sheet, "States" (line 675), against **C4** (Retry label everywhere =
**"Let's try that again"**, DELIVERED-VERIFIED per U29/U30).

**The problem.** M1 (line 505) and M3 (line 569) both use the canonical string correctly. M5's
failure state uses `"Try again"` (line 628) — but that's a direct, correctly-attributed quote of
`SP-15`'s own copy (`shared-planks.md:527`, *"offer two acts: 'Try again' and 'Message your
designer'"*), a shared plank Direction B is told to assume ships as written. M7, though, is
Direction B's own new screen (`AskDesignerSheet`, not cited to any plank for this line): *"send
fails → the message is kept and `Try again` offered"* (line 675) — a second, uncited, unattributed
retry string in the same document that gets it right twice and cites its one earlier deviation
correctly.

**Evidence.** Line 505, 569 (`Let's try that again`, correct); line 628 (`Try again`, correctly
sourced to SP-15); line 675 (`Try again`, no plank citation — Direction B's own copy).

**The fix I'd accept.** Change line 675 to `Let's try that again`, or cite the plank it's borrowing
from if one exists.

### M3 — §10's own honesty argument mischaracterizes an already-ratified real number as fabricated

**Section it hits.** §10, "What Direction B deliberately does not do" (lines 440–441), against
**C5** (no fabricated stats) and the already-closed status of F158.

**The problem.** *"No completeness meter without a true denominator (that is what the 48% → 63%
match number is)"* (lines 440–441) states, in passing, that the match-percentage number lacks a real
denominator — i.e., is the kind of fabricated-precision stat C5 forbids. That's not what the
program's own research found. F158's code-truth verdict (already cited correctly by Direction B
elsewhere, indirectly, via its "never a percentage" fix at line 107) is explicit: *"U02 established
that match scores are real, not fabricated — this is about legibility, not honesty… Match is the
average score Patina has computed for the pieces you've seen — it goes up as the app learns your
taste and the room context tightens"* — a real, defined, already-in-code denominator that's simply
under a tap-to-reveal tooltip with no visible affordance. Direction B is right that the bare
percentage is a poor progress signal and right to replace it with a taste line (§3, line 107) — but
the sentence in §10 asserts the number has *no* true denominator, which contradicts the ratified U02
finding this same program verified. Since §10 exists specifically to draw the honesty line for the
reader, getting the one example wrong here risks re-opening a question C5/U02 already closed, in the
wrong direction.

**Evidence.** Lines 440–441 (the claim); `research/31-verified-findings.json` F158
`verdicts.code_truth.note` ("Half REFUTED: both stats ARE explained in-app… Match is the average
score…"); F158 `already_ruled` ("U02 established that match scores are real, not fabricated — this
is about legibility, not honesty").

**The fix I'd accept.** Reword to the actual complaint — *"no percentage whose denominator is hidden
behind an unlabelled tap"* — or drop the example and let the taste-line fix (already in §3) carry the
point without re-asserting the number is fake.

---

## Minor

### N1 — Two "§12" cross-references point at nothing inside this document

**Section it hits.** Line 165 (Path A table) and line 343 (B-6 cost line), and line 631 (M5 sheet).

**The problem.** Direction B has eleven numbered sections, ending at §11 (Mock manifest). *"§12"*
appears three times as a citation for "the backend chain exists end-to-end" — almost certainly meant
as `research/12-backend-reality.md`, but as written it reads as a self-reference to a section that
doesn't exist in this file.

**Evidence.** Lines 165, 343, 631.

**The fix I'd accept.** Spell it out: `research/12-backend-reality.md §5`.

### N2 — "Track with the carrier →" has no backing URL column

**Section it hits.** M8 (line 688), against the additive migration in §5 (lines 188–190).

**The problem.** The migration adds `tracking_number` and `carrier` but no `tracking_url`. A row
whose only job is to hand the person off to the carrier's own tracking page needs either that column
or a stated client-side URL-template-by-carrier convention; as written it's a control with a label
and no data to act on.

**Evidence.** Line 190 (columns added); line 688 (`Track with the carrier →`).

**The fix I'd accept.** Add `tracking_url text` to the B-5 migration, or name the carrier→URL
template map this control resolves against.

### N3 — B-1's cost line doesn't name the risk to Companion intent routing or the NEXT STEPS decay mechanic

**Section it hits.** B-1 (lines 297–301), against **R09** (advisory: Companion intents route through
`AppCoordinator.handleIntent`) and **C8** (NEXT STEPS label decays after 3 navs, U34
DELIVERED-VERIFIED).

**The problem.** Moving to a `TabView` root is a real navigation-stack restructuring (four route
hosts implies four separate `NavigationStack`s under one `TabView`, the standard iOS shape). B-2
prices the Companion's own geometry rework but neither B-1 nor B-2 says whether intent routing or the
nav-count-based decay logic were checked against a multi-stack root. This is R09-advisory, not
binding, so it isn't blocking — but it's the kind of thing a "cost" line exists to flag.

**Evidence.** Lines 297–301 (B-1 cost); lines 303–312 (B-2 cost, geometry only); canon-digest §6 C8
correction (decay mechanic); ruling ledger R09.

**The fix I'd accept.** One clause noting the decay/intent-routing surface was checked (or flagged
open) against the new multi-stack root.

### N4 — One finding id cited without the document's own zero-padding convention

**Section it hits.** Line 281 (`F6`).

**The problem.** Every other short-form id in the document is zero-padded (`F04`, `F07`, `F08`,
`F09`) to match `31-verified-findings.json`'s `F06`. This one instance reads `F6`. Purely cosmetic —
the finding exists and the citation is otherwise correct — but worth a pass for consistency.

**Evidence.** Line 281.

**The fix I'd accept.** `F06`.

---

## What's genuinely good — keep this

- **The corrected canon (C23–C29) is used, not the stale version.** Direction B builds on Option B's
  actual shipped "Today" mount rather than treating it as a mistake (explicitly forbidden by C23);
  cites the real `direct_orders`/`create_direct_order`/`apns-send` backend facts from C24/C26 instead
  of the outdated "push is a stub" assumption; correctly treats Apple Pay as already inside the
  Checkout the app opens (C25) and never proposes PaymentSheet, IAP, or a new SPM dependency to get
  a wallet button the app already has a path to.
- **Every one of the seven amendments (B-1…B-7) uses the required what/why/cost/rollback shape**, and
  every "why" traces to real finding ids — the two gaps above (B1/B2 blocking, M1 major) are about
  what's *missing* from otherwise well-formed entries, not about the mechanism being absent.
- **§10 is an unusually disciplined anti-manipulation list** — it names and rejects streaks, badges,
  fabricated "new," speculative push, a completeness meter, randomised shuffle, fake social proof,
  loss framing, cold-launch permission asks, and a Wallet pass, each with the honest alternative
  already built into the direction. This is exactly the "sticky ≠ manipulative" bar §7 sets, done as
  a checklist rather than an afterthought.
- **"(example copy)" labeling is thorough and consistent** everywhere the local seed doesn't contain
  the number shown (room progress, dimensions, lead time, the fit line) — the direction is already
  meeting the deck's own §11 evidence-labeling bar well before it needs to.
- **Zero brand-voice lexicon violations.** No "AI," "algorithm," "curated," "luxury," "elevated,"
  "bespoke," "marketplace," "powered by," or "engine" anywhere in the copy — a full pass on the
  lexicon check.
- **No refuted finding is cited anywhere** (F21/F33/F35/F82/F94, F75/F88/F116/F166, F18, F57,
  F39/F149/F181 — none appear). The document was clearly written from the corrected finding set, and
  its own narrower phrasing tracks the refuter corrections precisely — e.g. "messaging exists but a
  client cannot start a thread" (M7, line 678) matches the exact narrower true finding, not the
  refuted broader one.
- **C13 is honored by construction, not by assertion**: the household-members second-seat design
  (W6) is correctly identified as "exactly the shape C13 prescribes" — a junction table + RPC, no new
  service — and the direction says so explicitly rather than leaving it to be inferred.
- **The B-5 money migration matches root `CLAUDE.md`'s reconciliation doctrine unprompted**: additive
  and nullable, commission rate immutable after `paid`, one earnings credit fired once from the
  webhook keyed on the Stripe event id — internal state as the source of truth, Stripe reconciling
  toward it, not the reverse.
- **SP-19's supersession is scoped precisely** (line 311: "supersedes SP-19's Hearth clause (SP-19's
  status-bar and 44 pt work stands)") — it names exactly which clause of a shared plank is replaced
  and which parts still hold, rather than a blanket override.
- **Returns/damage policy is correctly left unwritten** (§5, lines 225–228) rather than invented —
  the direction reserves the line, states the claim route per path, and flags the policy text as a
  Kody ruling, which is exactly the right move under C5's "no fabricated" rule for something that
  genuinely doesn't exist yet.
