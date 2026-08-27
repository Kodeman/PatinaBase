# Critique — Direction A "Since You Were Here," canon lens

Reviewed against `instruments.md` §6 + §6b and `research/11-canon-digest.md` §6, row by row, plus
the glossary (§3), voice rules (§4), and the R32/backlog ledger (§1, §5). Every C-row and every
R-ruling is checked; findings below are only the places Direction A's own text creates friction with
one of them. Line numbers are `source/direction-a.md`.

---

## Blocking

### B1 — Wave 2 builds R32's item #3 without naming that it skips items #1 and #2, under a document titled "Zero amendments"

**Section it hits.** §5 "The purchase path" (lines 189–278) and §9 "Waves" (Wave 2, lines 396–400),
against canon rows **C11** and **R32**.

**The problem.** R32 is a ratified sequencing ruling, not a wish list: *"Backlog ratified, in this
order: reviews → scope-change requests → direct orders → GDPR export/erase. Out of scope until a
separate go-ahead"* (`instruments.md` §6 via canon-digest §1). C11 restates the same order and adds
"Not yet designed." Direction A's Wave 2 is a full build of item #3 (direct orders: attribution
columns, `designer_id`/`project_id`/`commission_rate`, the `create_direct_order` designer
resolution, the `designer_earnings` webhook branch, three new iOS screens) — and it never builds, or
even mentions, item #1 (client reviews) or item #2 (scope-change requests). The word "reviews" does
not appear in the document; "scope-change" does not appear; "R32" does not appear; "backlog" does not
appear. §8, the section whose entire job is to name every place the document leans on canon, is
silent about this.

C24 (a later, overriding addition) does license *something* here — it confirms the direct-orders
backend already exists and says "the attribution decision is open and free to make now." But C24's
own sentence is scoped to the **attribution decision**, not to "build and ship the client Buy
surface regardless of the ratified sequence." Direction A treats the narrower license as if it were
the broader one, and does so silently. Compare this to how the document handles the C2-vs-C23
tension two sections earlier (lines 73–90): there, A states the ambiguity in its own words, gives
its own reading, and explicitly writes "**Your call**" for Kody. That is exactly the move R32 needed
and did not get. A document that can tell the difference between a real conflict and a non-conflict
in one place and cannot in the other is not "zero amendments" — it is one amendment its author
didn't notice making.

**Evidence.** Lines 3, 189–214 (Three paths table, "any tier" with no reviews/scope-change gate),
337 ("Zero amendments. No canon row is bent."), 396–400 (Wave 2), 412 (`direct_orders`:
`designer_id`, `project_id`, `commission_rate`); `instruments.md` §6 C11, §6b C24; canon-digest §1
R32 row, §5 "Direct 'buy now' orders" row.

**The fix I'd accept.** One paragraph in §8, in the same register as the C2-vs-C23 paragraph: name
that Wave 2 builds R32's item #3 ahead of items #1–2, state A's own reading of why C24's "free to
decide attribution now" extends (or doesn't) to "free to ship Buy now," and end on "Your call" the
same way. If Kody's answer is "the backend already jumped the queue, ship it" — fine, but the
document should be the one saying that, not a critic finding it by grep.

---

## Major

### M1 — Retry copy breaks C4 in one screen sheet after getting it right in another

**Section it hits.** M5's screen sheet, "States" (line 616), against **C4** / glossary §Loading,
error, empty ("Retry label (everywhere) → **'Let's try that again'**," DELIVERED-VERIFIED per
U29/U30).

**The problem.** M3's own screen sheet quotes the retry string correctly: `"Couldn't load product" /
"Let's try that again."` (line 558). Forty lines later, in the same document, M5's order-sheet
hand-off-failure state reads: *"the app's own error state above the button with `Try again` and
`Ask about this piece`"* (line 616) — a different string. This is the one canonical name in the
whole document that gets broken, and it breaks against the document's own correct usage twelve
screens earlier, which makes it read as a slip rather than a considered choice.

**Evidence.** Line 558 (`"Let's try that again."`) vs. line 616 (`` `Try again` ``).

**The fix I'd accept.** Change line 616 to `Let's try that again` (and confirm every other error
state across M1–M9 that isn't quoted verbatim inherits the same string rather than a paraphrase).

### M2 — "Any tier" on Path A never names the guest auth gate

**Section it hits.** §5 "Three paths" table (line 208) and the home-composition table's `guest`
column (lines 64–71), against **C9** (guests browse; the auth sheet presents over context and never
ejects).

**The problem.** Path A · Buy it is scoped as *"any tier, when the piece is buyable and no designer
is engaged"* — no qualifier. A guest, by definition, has no `client_id` and no live designer
relationship, so Path A is the one guests always see under this rule. But `create_direct_order` is
described elsewhere in the same document as a function that resolves *"the buyer's live designer
relationship"* (§5, "Attribution") and the whole rail assumes an authenticated client. The document
never says what happens when a guest taps `Buy it — $4,200`: does it open the C9 auth sheet first
(consistent with the app's existing soft-wall pattern), or does something else happen? Every other
guest-facing moment in this document is handled with the same care the rest of it shows (line 94:
"guest / discovering," line 533: "guest identical minus the fill money") — this is the one place a
guest's path is asserted without being drawn.

**Evidence.** Lines 64, 208 ("any tier"), 246–252 (designer resolution assumes a buyer identity); no
"guest" token anywhere in §5 (lines 189–278).

**The fix I'd accept.** One clause on the Path A row or in "What Walt sees" naming that a
guest tapping Buy hits the existing soft auth wall (C9) before `create_direct_order` fires, the same
way the app already gates other write actions for guests.

### M3 — F158's citation is scoped to a screen Direction A never draws

**Section it hits.** §7 "Findings answered" (line 329: *"F158, F65, F15 (with SP-11/SP-14)"* is
row 17; F158 alone is row 18: *"F158 (with SP-18) | the unexplained match percentage comes down..."*).

**The problem.** `research/31-verified-findings.json` scopes F158 to `surface: "profile" `— the
Profile screen's stat row (*"1 ROOMS / 1 SAVED / 63% MATCH"* with no legend, and a value that
changed between signed-out and signed-in states on the same device). Direction A's mock manifest and
home-composition table never touch the Profile screen; the "Match" removal it actually draws is on
the **room** screen (M4, SP-18: *"IN AR and the bare MATCH are gone"*). Attributing F158's fix to
SP-18 is only correct if SP-18 also edits Profile's stat row — which this document neither claims
nor shows.

**Evidence.** `31-verified-findings.json` F158 → `"surface": "profile"`; direction-a.md line 329
(claims F158 answered); lines 564–583 (M4, the only stat-row change actually drawn, is Room not
Profile).

**The fix I'd accept.** Either add a line to M7 or a footnote confirming SP-18 touches Profile too,
or move F158 out of "Findings answered" and into a line acknowledging it's untouched by A.

---

## Minor

### N1 — "Message Leah" diverges from the shipped "Message your designer" row without naming the divergence

**Section it hits.** §1 (line 41: *"tapping it opens a panel whose first row is 'Message Leah'"*)
and M7 (line 651: `` `Message Leah` ``).

Per the grounding, a "Message your designer" Companion-adjacent row already ships on five other
screens (project/decision/documents/notifications/design-request). Direction A's new Companion-panel
row uses a personalized string instead. That may be the better copy — a named designer is more
concrete than a role label — but the document doesn't say it's deliberately diverging from an
existing string, and a reader could reasonably ask whether the five existing rows should be
relabeled to match, or whether the app now has two different labels for what is functionally the
same act. Not a C4 break (this string isn't in the July glossary), but worth one sentence.

**The fix I'd accept.** One clause: "this personalizes the existing 'Message your designer' pattern;
the five other call sites keep their label unless a later wave standardizes it."

### N2 — F17 (S0) is fixed but never cited in §7

**Section it hits.** §7 "Findings answered" (lines 313–329) vs. M3 (lines 544–546, the two new spec
lines).

F17 — *"Dimensions and lead time exist nowhere"* — is exactly what M3's two new lines under the
price fix, and it's the highest-severity finding (S0) the document resolves anywhere in the piece-
detail work. It doesn't appear in the findings table. Every other S0/S1 fix in this document is
cited; this one isn't. Purely a completeness gap in an otherwise unusually well-cited table (the
duplicate-cluster merges — F16(=F34), F30(=F37), F22(=F26) — are all correctly applied, which makes
this one omission stand out).

**The fix I'd accept.** Add "F17" to the row that already covers the piece-detail spec lines (row
"F144, F86 (with SP-10)," line 326, is the natural home for it).

### N3 — Four specific dates read as seed-real but aren't confirmed against the seed

**Section it hits.** §1 "The day" (lines 27–56) and M1 (lines 489–496): "since Aug 22," "$4,250 due
Sep 1," "a proposal by Sep 8," and M9 (line 683): "Aug 18."

§11's own preamble commits to "Content is seed-real unless marked *[example]*," and the document is
disciplined about this elsewhere — the room name, dimensions, and shipping figure are all correctly
tagged `[example]` where they're invented. The rug-colour decision itself is real (it matches
`supabase/seed/decisions.sql:111`, "The jute rug from Studio Piet"), and the $4,250 invoice amount
is real (C29). But the four specific calendar dates attached to them are asserted without either a
seed citation or an `[example]` tag — the one place in the mock manifest where the "seed-real unless
marked" discipline isn't visibly honored either way.

**The fix I'd accept.** Confirm the four dates against `decisions`/`proposals`/`invoices` timestamps
in the seed and cite them, or mark them `[example]` like the room name is.

---

## What is genuinely good — keep this

- **The C2-vs-C23 disclosure (lines 73–90) is the right model for this whole exercise.** It names the
  exact contract language, states A's own reading, states the alternative reading, and hands the
  decision to Kody in one word. This is what "zero amendments, and here's what that costs" is
  supposed to look like, and B1 above is essentially "please do this again for R32."
- **The rejected-pattern list in §10 (lines 453–457) is the sharpest anti-dark-pattern paragraph in
  the program.** No streaks, no badges, no "4 others saved this," no completeness meter, no loss
  framing — each with a reason tied to the brand's actual thesis ("Walt would delete the app before
  he finished reading the notification"), not a generic disclaimer. This is exactly what §7's honesty
  rules ask for and most directions don't bother to earn.
- **Cost is priced honestly everywhere it appears.** The widget is "one engineer-week... not a free
  win" (line 162); "No PaymentSheet... costs an SPM dependency, a merchant-id entitlement, a new
  backend mode" (§5); "Live Activities: no... Wallet pass: no. There is no honest artifact" (lines
  174–176). No return surface is proposed as free.
- **Duplicate-cluster citations are applied correctly and consistently** — F16(=F34), F30(=F37),
  F22(=F26) all appear in the merged form the brief specified, with no stray reference to the
  now-redundant IDs.
- **No refuted finding is cited as if it were live.** None of F21/F33/F35/F82/F94 (messaging),
  F75/F88/F116/F166 (decision confirmation), F18 (unit-conversion), F39/F149/F181 (Saved door), or
  F57 (VoiceOver) appear anywhere in §7 — a document this size citing 40+ finding IDs and hitting
  zero refuted ones is real discipline, not luck.
- **The engaged-tier fix follows the refuter correction exactly.** M9's screen sheet (lines 687–693)
  correctly identifies the matched-designer branch as already built and unreachable, and names
  SP-07's one-line filter fix rather than proposing a new module — precisely the upstream-cause
  framing the grounding established.
- **Token fidelity is exact.** M1's dark-mode values (`#211E1B` / `#2C2926` / `#F2EDE6` / `#B5A487`,
  line 511) match `research/16-token-table.md`'s semantic dark tokens for `Background.primary`,
  `Background.secondary`, `Text.primary`, and `Text.muted` precisely — not approximated.
- **The Apple compliance section is precise, not defensive.** It states the guideline numbers
  (3.1.3(e)/3.1.5(a)), states which one A doesn't open (3.1.1, "A sells no digital service in the
  app"), and separately flags the *actual* live App Store risk (no installable TestFlight build,
  in-app account deletion 5.1.1(v)) rather than hiding behind the payment-compliance win.
- **Seed fidelity on the walk accounts is precise.** "She has no room, so no Active Room card
  renders — the home is three blocks and that is honest" (line 39) matches C29's
  `client@patina.dev` fact (0 rooms) exactly, and the document draws the honest consequence (a
  missing module) rather than fabricating a room to fill the mock.
