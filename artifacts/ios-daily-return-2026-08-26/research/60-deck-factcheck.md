# 60 — Deck fact-check (presentation.html / mock/deck-parts)

Checked against `research/31-verified-findings.json` (213 findings; 199 verified, 14 contested),
`research/32-refuted-findings.md` (empty), the panel reports `research/2x-panel-*.md|json`, the
walk evidence (`01-shot-ledger.md`, `03-walk-observations.md`, `shots/`), the grounding files
(`10-code-anatomy.md`, `12-backend-reality.md`, `17-gap-fills.md`, `11-canon-digest.md`), the
directions (`source/direction-a.md`, `source/direction-b.md`), the judges (`source/judge-j*.md`),
`source/synthesis.md` and `source/instruments.md` §5/§6/§6b/§9/§10/§11.

Method: every `F##` token in the 15 content parts extracted and resolved by id, severity class and
inline title; every `data-shot` / shot-stem reference resolved against `shots/`; every seat
blockquote matched verbatim against the seat's own panel report; every judge score and cell matched
against the judge file; canon citations matched against §6/§6b and the digest; the sheets' quoted
copy diffed against the direction manifests.

---

## What passes

- **Finding ids.** 446 `F##` tokens across the parts, **140 distinct ids, all 140 resolve** in
  `31-verified-findings.json`. No id is in `32-refuted-findings.md` (it is empty — zero findings
  dropped this round, correctly stated in the colophon).
- **Severities.** Every `f-chip--sN` class matches the JSON `severity` for that id — 0 mismatches
  across all chips.
- **Shots.** Every `data-shot` filename and every `g-NN` / `c-NN` / `d-NN` / `x-NN` caption stem in
  the deck exists in `shots/`. 0 missing.
- **Disclosure.** The simulated-panel disclosure appears on the ask page (`02-ask.html` §"What this
  panel is": "Nine simulated seats, written by language models against a fixed task script. Quotes
  are synthesized reviews, not customer research. No usage data was available to this review.") and
  verbatim again in the colophon. Also restated in `04-panel.html:7`, `12-compare.html`,
  `06-why-return.html`.
- **No device-verification claim anywhere.** Every device-touching claim is explicitly negated
  ("Nobody has opened one on a device", "no device pass was run", "Nothing on a device was verified
  by any judge", "no installable build existed to open one").
- **No invented usage numbers.** Every count in the deck is a count of screens, seed rows, code
  sites or findings. "No usage data was available to this review" appears on the ask page, in
  `05-found`, `06-why-return`, `07-why-buy`, `10-direction-b`, `12-compare`, `13-recommendation`
  and the colophon.
- **Class counts.** Return 47 · Purchase 20 · Trust 66 · Wayfinding 33 · Content 32 · Reach 15 =
  213 — matches the JSON exactly.
- **Top-twelve table.** Every severity and seat-count cell matches the JSON. The stated ranking
  (severity × seat count × confidence) reproduces the printed order exactly with S0=4/S1=3/S2=2/S3=1
  (F10 and F11 tie at #12; F10 was taken).
- **Judge scores.** J1 5/8, 8/9, 8/7, 9/8 → 30/32; J2 7/9, 6/8, 7/9, 7/8 → 27/34; J3 8/7, 9/8, 9/8,
  9/7 → 35/30 — all match the judge files, as do "B's 34 and a 38" and J2's 7/10 · 8/10 cell cited in
  `11-purchase.html`.
- **Apple + Stripe statements.** 3.1.3(e)/3.1.5(a) for physical goods, 3.1.1 for a digital service,
  3.1.3(d)/(e) for the design-fee invoice, 4.8 (Sign in with Apple), 5.1.1(v) (account deletion),
  "Apple Pay is already inside the hosted Checkout … empirically unproven", "both session paths
  accept `card`, nothing suppresses wallets", "no `automatic_tax`, no `shipping_options`",
  "PaymentSheet does not buy Apple Pay" — all match `17-gap-fills.md` G2 and C15/C25. The Stripe key
  statement ("both secret names present … a name cannot tell a test key from a live one … configured
  and unverified-live") matches `12-backend-reality.md:165-174` word for word in substance.
- **Canon citations.** C1, C2, C3, C4, C8, C11, C14, C15, C18, C23, C24, C25, R29, R32 all exist —
  C1–C16 and R29/R32 in instruments §6, C23–C25 in §6b, C18 in `11-canon-digest.md` §6.
- **Seed / catalog figures.** $4,250 invoice, Sep 1 due, Aug 22 overdue decisions, Sep 8 proposal
  expiry, $18,500.00 investment, $100,000.00 "SIGNED (1)", $850 rug decision, $2,650.00 deposit,
  $4,200 / "$4200", 2713 SQ FT, "46 ft × 59 ft", 21 products, 104 vendors, 3 editorial stories,
  19 of 21 buyable, 14 of 21 UNKNOWN MAKER, 14/21 materials, 1/21 lead time, 0/21 dimensions,
  0/104 `made_in`/`brand_story`, card frames at x = −32.7 / −10.7, retry at 125 × 17 pt, 12×13 and
  6×13 pt toggles, 36 pt monogram, 105 `navigate(to:)` sites, 31 `AppRoute` cases, three targets and
  no extension, ASC app `6762007888`, 487 migrations, `fulfillment_config` default 0.16 = 16%,
  Total $4,550.00, $3,590 / $5K+, $2,400 of $9,000, 155 PNGs at 1206×2622 (402×874 @3×), min
  observed 104 KB, 20 of 31 routes shot, 213/199/14/0/0 — **every one traces to a research or
  source file.** The seed copy in the mocks (Nordic Atelier, "Quarter-sawn white oak · Hand-rubbed
  tung oil", "Each table is made to order by a three-person workshop outside Aarhus", $4,200) is
  verbatim `supabase/seed/products.sql:6`; the two invented spec lines are labelled `[example]`.
- **Sheet copy.** Every quoted copy string in the A and B screen sheets resolves in its direction
  manifest, except the two deviations the sheets themselves declare in their "Drawn vs manifest"
  rows (see minor 15/16).
- **Seat quotes.** 21 of 22 are verbatim in the quoting seat's own panel report (differences are
  markdown `**` emphasis, line-wrap, and sentence-initial capitalisation of a mid-sentence clause).
  The one exception is minor 10 below. `04-panel.html:26` (H2) is the seat's own finding title
  `H2-31` (`2x-panel-h2.md:379`) rather than prose, which is still verbatim in that report.

---

## Blocking

**B1. `05-found.html:9` — "**Purchase** is the smallest".**
The line reads: *"**Trust** is the largest by a wide margin: sixty-six findings … **Purchase** is
the smallest, for the reason that there is almost no purchase surface to find fault with."* The
deck's own table nine lines below gives Reach **15** against Purchase **20**, and the JSON agrees
(reach 15, purchase 20). The claim is false and is contradicted on the same screen.
**Fix:** "**Purchase** is the second-smallest, and near the bottom for the reason that there is
almost no purchase surface to find fault with" — or drop the superlative and keep the reason.

**B2. `05-found.html:286` — "Seven were raised independently by five seats or more".**
Of the twelve rows printed directly beneath, the seat counts are 7, 6, 6, 6, 6, 5, 6, 6, 6, 4, 4, 4:
**nine** of the twelve were raised by five seats or more (eight by six or more). The sentence then
leans on the wrong number again — "every one of those seven is a sentence the app says out loud".
**Fix:** "Nine of the twelve were raised independently by five seats or more, and every one of those
nine …" (F01, F05, F02, F03, F07, F08, F04, F41, F42 — all nine do fit the description).

**B3. `14-questions.html:4` — "Ten questions for Kody" over twelve cards.**
The section contains 12 `q-card`s: Ruling 1, Ruling 2, Ruling 3, then Questions four through twelve.
The colophon and `13-recommendation.html` both cross-reference "Question eleven", so the body is
internally consistent at twelve and only the heading (and instruments §10's original outline) says
ten.
**Fix:** retitle "Twelve questions for Kody" (and adjust the standfirst, which already says "The
first three are the review lead's own rulings … The rest are what those rulings assume").

---

## Major

**M1. `02-ask.html:53` — "155 screenshots across four lanes — guest, signed-in client, dark mode,
and Dynamic Type at extra-extra-large".**
The colophon's own lane breakdown is g- 56 · c- 45 · d- 30 · x- 14 · s- 7 · final- 3. The four named
lanes hold **145**; the remaining 10 are steward/harness proofs and end-of-walk restore checks.
`shots/` confirms the same prefixes.
**Fix:** "155 screenshots — 145 across four walk lanes (guest, signed-in client, dark mode, Dynamic
Type XXL) plus ten harness and restore frames", or "across four lanes plus the harness".

**M2. `12-compare.html:211` — "Twenty-two mechanism claims were re-read at `file:line` for this cell
table".**
`source/judge-j3-feasibility.md` §5 ("What was verified for this judgment") is a table of **20** data
rows (lines 282–303; 22 pipe-lines including the header and separator). Two further path errors are
noted below the table but are explicitly "noted and not scored".
**Fix:** "Twenty mechanism claims …".

**M3. `12-compare.html:268` — "J1 · A → B · eight items" over a seven-item list.**
`judge-j1-homeowner-return.md` §Grafts has 8 numbered items; the deck merges #3 ("Card weight follows
content") and #4 ("Six-hour suppression") into one `<li>` and still labels the list "eight items".
J2 and J3 render 8 for 8 correctly.
**Fix:** split the bullet back into two, or label the list "seven items".

**M4. `04-panel.html:124` — "designers run the eight that touch their own work, plus T14".**
instruments §1: *"designers run T1, T2, T6, T7, T8, T9, T10 as themselves plus T14"* — **seven**
plus T14. The deck's own T1–T14 table marks exactly 8 rows in the "Designers too" column (T1, T2,
T6, T7, T8, T9, T10, T14), so the prose double-counts T14 and reads as nine.
**Fix:** "designers run the seven that touch their own work, plus T14".

**M5. `03-today.html:79` — F18 presented as `sim-verified` with no contested marker.**
The caption reads "Living Room, typed not scanned: 18 × 14 ft is stored back as 59' × 46'" with
`sim-verified` + chip F18. F18 is **`status: contested`** in `31-verified-findings.json` (the repro
verifier could not re-confirm the toggle's state at the moment of entry; confidence lowered).
`05-found.html:259` does disclose this — "F18 … is filed contested" — but The app today, where the
claim is first made and the shot is shown, does not.
**Fix:** add the contested marker to the c-24 caption, or a half-sentence ("the toggle's state at
entry is contested; the stored figures are not").

---

## Minor

**m1. `03-today.html:143` — "(C14)".**
The cell says "no push has ever fired one (C14)". The claim is correct, but C14 ("APNs push send is
a backend stub") is the row instruments §6b **corrects**: C26 — "Push send is real, not a stub …
**None** fires for proposals, invoices, decisions or direct orders. … Corrects C14." Every other
push statement in the deck uses the C26 reading.
**Fix:** cite C26.

**m2. `11-purchase.html:55` — D1 quote drops "$3,200" mid-sentence.**
Deck: "my client buys **the sideboard** I specified, at retail". `2x-panel-d1.md`: "my client buys
the **$3,200** sideboard I specified, at retail". A silent deletion inside quotation marks; the
figure is real and D3's question two screens earlier already prints it.
**Fix:** restore "$3,200", or mark the cut.

**m3. `01-cover.html:7` — the thesis sentence is not in `synthesis.md`.**
"Two weeks away looks exactly like two minutes away — and a first screen that cannot say what moved,
or who moved it, has not yet earned a four-thousand-dollar chair." The first clause is F34's title
(verbatim); the second is composed from H3's stated bar ("would I trust it with a four-thousand-
dollar chair?"). The brief specifies the cover thesis comes from the review lead's synthesis, whose
own headline sentence is "B is the better place to end up, A is the safer way to start, and their
first slices share most of their plumbing." The cover does label the chip row `inferred`.
**Fix:** either accept as authored-for-the-cover (it invents nothing), or graft the synthesis
sentence in.

**m4. Three chip titles are truncated against the JSON.** All keep the gist; noting for the record.
- `05-found.html:257` F169 "Shared links can't open the app even when installed" — JSON adds
  "(no associated domains)".
- `06-why-return.html:91` F41 "Three disagreeing counts on one screen" — JSON: "Three disagreeing
  'things needing attention' counts on one screen". (`05-found.html:308` renders it as "Three
  disagreeing attention counts on one screen" — a third variant.)
- `14-questions.html:16` F30 "Today shows 1 of 4 pending items" — JSON adds ", not the money".
**Fix:** none required; if consistency matters, settle on one short form per id.

**m5. `05-found.html:255` — F57 cited with no contested marker.**
F57 ("Studio rows unreachable by VoiceOver") is contested — the record itself notes the rows do
expose a button role at Dynamic Type XXL, and `judge-j2` treats it as "a harness artifact … not
counted against either direction". It sits in the Reach chip row with no qualifier.
**Fix:** drop it from the row, or mark it contested the way F18 is marked.

**m6. `12-compare.html:284` — J2's photograph graft chipped F17.**
The bullet is "The photograph column, as a thing a person sets" with chip F17 (Dimensions and lead
time exist nowhere). `judge-j2` §Grafts #3 is about `products.photo_verified_at` and names **F06**;
F17 comes from `judge-j1` §Grafts #5, which cites both. `13-recommendation.html` chips the same
graft F06.
**Fix:** chip F06 (optionally F06 + F17).

**m7. `mock/fragments/a-M2.sheet.html:14` — "not the kit's shipped 150".**
"The room card's artwork is drawn at 118 pt, not the kit's shipped 150 (`TodayModules.swift:166-200`)".
`direction-a.md` M2 specifies **180 pt `warm` gradient artwork**. The sheet names the deviation from
the shipped code but not the deviation from its own manifest — while the very next line does name
the manifest ("The room name stays at the shipped Playfair 22, not the manifest's 26").
**Fix:** "…not the manifest's 180 or the kit's shipped 150".

**m8. Project-name drift: "Aspen Loft Refresh" vs "Aspen Loft".**
`09-direction-a.html` and the a-M1 / a-M6 sheets print "Leah moved **Aspen Loft Refresh** into
Installation & Styling"; `direction-a.md` M1/M6 print "Aspen Loft"; `06-why-return.html`'s Direction
A column prints "Aspen Loft". The a-M1 and a-M6 sheets declare the change ("The project is named
Aspen Loft Refresh, its seeded name") — `06-why-return` does not, so the same sentence appears two
ways in one deck.
**Fix:** use the seeded name everywhere the sentence is quoted.

**m9. `07-why-buy.html:170` — "six of these ten are absent outright and two more are half-present".**
Only two rows in the checklist table carry an explicit "Half." verdict (materials; what happens
after he pays). The remaining eight rows are prose verdicts from which absent-vs-half is the deck's
own reading, not a derivable count — three of them ("the maker tag prints the retailer", "the
pictures are not of the pieces", "printed on the list and dropped on the detail") describe something
present but wrong rather than absent.
**Fix:** label the verdict column (Absent / Half / Present) so the sentence is checkable, or soften
to "most of these ten are absent or half-present".

**m10. `03-today.html:109` — "d-01 · Dark home" caption chipped F138.**
The caption's point is dark-mode legibility ("Clean contrast, the same four blocks, the same
silence"); F138 is "Home doesn't scroll, and gives no sign anything is hidden". The chip supports
the "four blocks" half only.
**Fix:** chip F13 or F16 (the silence) alongside, or F121.

**m11. `02-ask.html:68` — "the app emits no return event beyond `app_open`".**
F190 records six captured events — `app_open`, `session_started`, `today_next_move_tapped`,
`today_editorial_story_tapped`, `today_active_room_tapped`, `studio_queue_item_activated` — and its
actual finding is that **no return-specific** event exists (no push-received/opened, no
permission-outcome, no "new since last visit").
**Fix:** "the app emits no return-specific event at all — nothing beyond an `app_open` to have
counted".
