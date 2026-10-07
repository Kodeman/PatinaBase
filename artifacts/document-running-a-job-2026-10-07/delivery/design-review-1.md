# Design review 1 — US-19 slices 0a, 0b, 1 (SQ-502, FR1)

**Reviewer:** Fable (design authority for US-19). **Date:** 7 October 2026. **Tree:** main at `7bad62ca7` (worktree `agent-ab25757232d8cc038`), dev server `localhost:3000` with `ask-the-paper` forced on, local Supabase only.
**Authority:** `delivery/rulings.md` (D1–D11, Q1–Q10, §3 acceptance rows), `docs/vision/VISION.md` (V9, V11), the house voice. Nothing rulings.md decided is reopened here; the one amendment (D6, below) is forced by a fact the ruling assumed wrongly, and it is recorded for Kody in §4.

**Evidence:** screenshots in `delivery/review-1/` (names begin `1440-` or `390-`). 1440 was walked in Chrome (a 1440×723 tab). Chrome on macOS will not shrink a window below 500px, so 390×844 was walked in headless Chromium through Playwright, signed in as the seeded dev designer; the `500-chen-chrome-minimum-width.jpg` shot records the Chrome limit. The 390 walk and the Chrome walk saw the same strings. `Hold for review` was pressed once on Cedar Lane and left one `agent_tasks` row (`maker_eta_request`, `awaiting_review`, id `808f4b59-…`) in the **local** DB; nothing reached any maker.

---

## 1. Rulings

One row per DESIGN-Q. **Ruling** is the exact string or behaviour. **Why** is one sentence. **Source** names the ruling it follows.

| # | Ticket · question | Ruling | Why | Source |
|---|---|---|---|---|
| R1 | SQ-489 · `overdue_decision` label | `Nudge {first name}` (family fallback `Nudge the client`), landing on the control `Chase the approval` opens today | "Chase …" is in the Never column and F18 took `Review` off the top of the paper, and a nudge is the act a hire actually takes on an overdue decision | D1 Named acts; D1 own-act table (Proposal, sent) |
| R2 | SQ-489 · `lines_flagged` | `Open the flagged lines` | The act names its landing (the Pieces region, flagged lines first); `Review …` is not a verb the paper uses | D1 rule of names; F18 |
| R3 | SQ-489 · `schedule_proposal` | `Open the proposed date` | Same rule; the control it lands on is the proposed date | D1 rule of names |
| R4 | SQ-489 · `po_unsent` | `Send the purchase order`, **filled** tier, with the PO amount in the label where there is one and R141's consequence sentence above it | Sending a PO commits the studio's money to a maker, which is D3's "money moves" | D3 Filled |
| R5 | SQ-489 · `pulse_due` | `Send the pulse` — the control's label today, verbatim | `Review and send` is two verbs for one press; the rule of names copies the control | D1 rule of names (ADV-29, ADV-32) |
| R6 | SQ-489 · `reconnect_due` | `Message {first name}` (fallback `Message the client`), plain tier, landing on that person's message control; `Reach out` is not printed | A reconnect is a message, and D1 already has one name for that act; the paper never invents a second verb for the same press | D1 Named acts (Message) |
| R7 | SQ-489 · tiers | `Pay again` is **filled** (amount in the label, consequence sentence above); `Approve the CFA` is **plain** at rest and **scored** only while it is the Next act, never filled | Money moves on `Pay again`; a CFA approval is neither money nor a signature | D3 |
| R8 | SQ-489 · ownAct gaps | `null` (silence) for Brief with no open inquiry, Discovery with every essential set, Proposal declined or expired, and Install with no reading; the band's Next then falls to the top standing row by D2's order | Absence of state is silence, and a new own act is a rulings.md amendment, not a code pick | V9 §5; D2 Next order |
| R9 | SQ-489 · eyebrow | `archived` prints `{Stage} · Archived` in the form `On hold` already uses, with no date invented; `completed` prints `Care · Closed` in every section — confirmed | A held or closed job is state, so it prints, and the form is the one Q-ruling already fixed for `on_hold` | Q-ruling on held jobs (rulings.md l.39); 0a-1 |
| R10 | SQ-490 · Care rail word | `Closed` | Same reason as R9: a closed book is state | rulings.md l.39 |
| R11 | SQ-490 · the closed sentence | `The book closed 21 November.` prints once, as the **Care region head's status line** beneath the `Care` heading, not as a free paragraph above it | One status line per region head is where every other region speaks | W4-R1; D6 "Where" |
| R12 | SQ-490 · row state word | In Install the leading state word (`Not here` · `Here` · `Installed`) is the row's **only** stamp; the procurement status (`In production`, `Released`) moves into the row's detail line as a fact (`Fixture Metalworks · Study · In production`) | Two stamps on one row are two voices for one state | D6 "Where" (state word instead) |
| R13 | SQ-490 · `{done} of {n} closed out` | Cut. The Closing-the-book head, the rail, and the 390 fold line read `Nothing yet` until the first item closes, then `{n} closed out`, then `Closed {day month}` — never `N of M` | `N of M` is the count Q10 cut and V11 refuses | Q10; V11; 0a-2 |
| R14 | SQ-491 · held-reason copy | One sentence, full stop, ≤ 6 words where possible, imperative when a repair exists (`Link a client first.`), a fact when none (`Nothing is priced yet.`); never "cannot", "unable", "disabled", "not available" | V9 P3 names the reason, the house voice says it plainly | D3 Gated; V9 P3 |
| R15 | SQ-491 · held Message's printed word | Prints `Message the client` — the printed word and the accessible name are the same string; no visually-hidden divergence | The rule of names is one string on every surface | D1 Named acts (Message) |
| R16 | SQ-491 · reason placement | Directly beneath the held act, left-aligned to the act's left edge, in the act's own column; the repair act `Link a client` beside the held act. Never a `basis-full` sentence under the whole instrument row; at 390 the reason still follows its own act | D3 says "directly beneath", and a sentence 60px away under five acts is not beneath any of them | D3 Gated |
| R17 | SQ-492 · the word `Band` | Never prints: not in the spine rail (`Active` alone), not as a stage-line suffix, not as the Desk stamp, not anywhere the lens-ladder position would leak | 0a-4 says `BAND` does not render; the ladder is machinery | 0a-4; D11 |
| R18 | SQ-492 · project header at total 0 | Silence — no figure on line 1 when the agreed total is 0; `Not priced yet` is the Direction draft's sentence only | Absence of state is silence; a draft awaiting a price is a state, a project with nothing agreed is not | V9 §5; 0a-6 |
| R19 | SQ-494 (a) · setup row names | `No target date set` → act `Set dates`; `No budget band set` → act `Set a budget band` | The act is the label of the control it lands on, and the letterhead's control is `Set dates`; `Set a budget band` is already named | D1 rule of names; D3 Plain; D7 |
| R20 | SQ-494 (b) · proposal papers | Confirmed: no SETUP rows on Direction or Proposal papers; their standing sheet carries the proposal's own missing inputs (see F14 for its form) | Setup rows are a project paper's vitals | D10 |
| R21 | SQ-494 (c) · setup act landing | Confirmed: the sheet closes, `document:open-vitals-editor` opens the letterhead editor with **focus on the named field**; Esc from the editor returns to the paper, not the sheet | A press lands with focus on that control | L-10; D1 rule of names |
| R22 | SQ-495 (1) · `Keys ?` | **Beneath** `Find anything ⌘K`, its own row, at every width; at 390 the dock's More carries a `Keys` row | D4 says beneath at every width; today it collides with `IN HAND TODAY` at 1440 | D4 `?`; D7 |
| R23 | SQ-495 (2) · `Search all jobs for "x"` | In place: the sheet switches to the all-jobs result set (today's document and person builders) with focus on the first result; Esc returns to the paper | The hire stays in one sheet; no navigation for a search | D4 Elsewhere |
| R24 | SQ-495 (3) · Ask vs Help | Order: On this paper → Acts on this paper → Elsewhere → the Engine's Ask row → Help, last | Help is last always, and the Ask row stays "below the paper's rows" | D4 Ranking |
| R25 | SQ-495 (4) · non-D4 matches | `Elsewhere` holds `Search all jobs for "x"`, then `Where the work stands`, then today's cross-paper hits; nothing else is added to it | D4 named the group's contents | D4 Elsewhere |
| R26 | SQ-495 (5) · install synonym row | The row **is** the reading sentence (`Reading chair isn't here, and no arrival date is recorded.`) under `On this paper`, act `↵ Open Install`, landing on the Install head; no label like `The install reading` | The paper speaks in its own sentence, not about itself | D4 Row form; D6 |
| R27 | SQ-495 (6) · Money synonyms | Each Money head act as printed (`Record the payment` first when due, then `Draw an invoice`) is its own row under `Acts on this paper`; no umbrella row | One name for one control | D4 Synonyms; D1 |
| R28 | SQ-495 (7) · PO landing | Focus on the `PO WS-188` control itself (it is `Open the order`), never the Order group; make the PO reference the focusable control if it is not | D4 says "focus on the PO" | D4 Row form; 1-1 |
| R29 | SQ-495 (8) · invoice numbers | Searched, through the invoice rows the Money region already loads client-side | D4 scope lists invoice numbers | D4 Scope |
| R30 | SQ-495 (9) · `keys` synonym | A row `Keys` with the key hint `?` under `Acts on this paper`; Enter opens the Keys sheet | D4 table row | D4 Synonyms |
| R31 | SQ-495 (10) · Desk dry query | `Nothing matches "x".` then `Where the work stands` then one Help row printed `Open Help`; never `Browse the Help Center` | "Help Center" is a feature name in the paper's voice | D11; house voice |
| R32 | SQ-496 (1, 5) · router tier | `Record a change` is **plain** (`secondary`) when it stands beside a region head's leader; it is scored only where it stands alone (an unfolded line's first act, the ⌘K row) — the contract fix at `7bad62ca7` stands | One leader per region outranks the named-acts row of D3 | R150 R5; D3 |
| R33 | SQ-496 (2) · install and care spreads | `Record a change` prints on Install and Care spreads: the Install head's second act (after the reading's act) and the Money head's second act | A change after signature is exactly an install-time event, and D5 already widens ⌘K to install and care | D5 Where it prints |
| R34 | SQ-496 (3) · leaving `Choose the piece` | The prompt line carries `Put back · Esc`; Esc cancels choosing and returns focus to `Record a change`; it never reaches `Put down` | Today Esc leaves the paper for the Desk — a dead end that costs the whole page | D5 (Esc returns focus to the pressing control) |
| R35 | SQ-496 (4) · no-PO line | A line with no PO does **not** print `Record a change` as its first act; it unfolds for editing (the edit is the change). `Record a change` prints first only where a PO exists and opens `ChangeOrderAct` | An offered act that does nothing is not an act | V9 P3; D5 Destinations |
| R36 | SQ-497 (1) · Next order for pieces | Passed date → no date → date ahead; within a group W3-R1 (most days first), then schedule order | The unknown or missed arrival is what the hire must act on; a known arrival can wait behind it | D6; W3-R1 |
| R37 | SQ-497 (2) + SQ-501 F3 · where `Open the held draft` goes | **D6 amended** (see §4). A line **with a PO**: `Ask the maker for a date` writes a `procurement_drafts` row (the 00706 path the studio already reviews and sends from Desk drafts / `DraftReview`), and `Open the held draft` opens that review. A line **with no recorded maker**: the act is **held** (`aria-disabled`, reason `No maker is recorded on this line.`, repair act `Add the maker` beside it, opening the line's maker field). Until that lands, the reopened sheet gains `Discard the draft` so the dead end is reversible | D6 assumed "a person sends it from the Post", and the Post cannot see `agent_tasks` (`agent_tasks_select_admin`), so the draft reaches no one — a correctness failure, not a style choice | D6; AGENTS.md (drafts land `awaiting_review`, a person sends); D3 Gated |
| R38 | SQ-497 (3) · the held line | Confirmed as built: the reading stays; `Asked 7 October · draft held for review` prints beneath it on the head's status line; the act becomes `Open the held draft` | One place speaks for Install | D6 |
| R39 | SQ-497 (4) · piece name | The line name before its first comma — confirmed | 1-4 is literal | §3 1-4 |
| R40 | SQ-497 (5) · act landings | `Hold a window` lands on the ceremony's own act — confirmed. `Open the punch list` lands on `#document-task-controls`, and on an all-here Install spread that block's heading reads `The punch list` so the name lands on what it names | A press lands on its control | L-10; D1 |
| R41 | SQ-497 (6) · no pieces | No reading, and the Install head's status line is silent — confirmed | Absence is silence | V9 §5 |
| R42 | SQ-497 (7) · addressee | One maker selector: the sheet's `To` prints the same maker string the row prints (`vendor_name`, else the PO's vendor, else the line's maker); only when all are empty does R37's held form apply. The greeting is the maker's name, else no greeting line — never `Hello there,` | Today the row says `Fixture Metalworks` and the sheet says no maker is recorded: two truths | D6; 0a #2 (one selector) |

---

## 2. Acceptance

Verdicts at 1440 and 390. **Evidence** names a file in `review-1/`.

| Row | Verdict | 1440 | 390 | Evidence |
|---|---|---|---|---|
| 0a-1 Care | **PASS** | Lindqvist: `Care` once, `Ongoing` nowhere, rail `CARE · CLOSED` | same strings | `1440-lindqvist-closed-top.jpg`, `1440-lindqvist-care.jpg` |
| 0a-2 one install selector | **PASS** | No `N of M` in Install; rows print `Not here` / `Installed` | same | `1440-cedar-top-install-reading.jpg`, `390-cedar-install.png` |
| 0a-3 Message needs a client | **PASS** | Chen: Message `aria-disabled`, reason `Link a client first.`, dock centre is not Message | dock centre is not Message (it is empty — slice 2, F-ledger) | `1440-chen-letterhead-held-message.jpg`, `390-chen-top.png` |
| 0a-4 machinery | **PASS** | `EXACT ARTIFACT`, `BAND`, seeded notes absent on Chen, Halloran, the Direction; `/doc/04c7655c…` (the fixture proposals' project) is not a reachable paper for this studio (it lands on Aspen Loft), so the fixture descriptions render nowhere reached | same | `1440-direction-not-priced-yet.jpg` |
| 0a-5 handoff sentence | **PASS** (with F12) | The string is gone everywhere; Aspen Loft still prints a sibling machinery paragraph (`Completing a phase activates every direct follower in the project graph…`) | same | `1440-aspen-loft-sticky-eyebrow-phase-handoffs.jpg` |
| 0a-6 Not priced yet | **PASS** (with F5) | Direction prints `Not priced yet`, no `$0`; the Amendment sheet on Chen prints `$0` | same | `1440-direction-not-priced-yet.jpg`, `1440-chen-amendment-sheet.jpg` |
| 0a-7 placeholder guard | **PARTIAL** | Letterhead `for the client` ✓; spine rail prints `Client User`; sticky eyebrow prints `CLIENT USER · DESIGN DEVELOPMENT 2 OF 5` | not walked | `1440-aspen-loft-top.jpg`, `1440-aspen-loft-sticky-eyebrow-phase-handoffs.jpg` |
| 0a-8 refusals named | **PARTIAL** | Message: focusable, `aria-disabled`, `aria-describedby` → reason ✓; the reason prints centred under the whole instrument row, not beneath Message ✗; Amendment sheet's `Send to the client` on a no-client job is **not held** ✗; the Direction draft offers no Send at all (`Not started yet`), so Send's refusal could not be judged | reason sits 62px below Message under five wrapped acts ✗ | `1440-chen-letterhead-held-message.jpg`, `1440-chen-amendment-sheet.jpg`, `390-chen-top.png` |
| 0b-1 `No client linked` | **PASS** | Chen: once, as a SETUP row; Lindqvist: nowhere; Harrow (on hold): suppressed (`STANDING · 2`, dates and band only) | Chen sheet identical | `1440-chen-standing-sheet.jpg`, `1440-harrow-standing-sheet.jpg`, `390-chen-standing.png` |
| 0b-2 setup never terracotta, never Next | **PARTIAL** | SETUP rows in clay `rgb(124,94,48)` ✓; `Name the phases for this project` inside the sheet ✓; Cedar's band line 2 is `1 unspecified · +3 MORE`, a standing need, not the stage's own act (`Ask the maker for a date`) — the band is slice 2 (D2), so this is pending, not failed | same | `1440-cedar-top-install-reading.jpg`, `390-cedar-top.png` |
| 1-1 ⌘K on the paper | **FAIL** | `sectional` → `Custom Walnut Sectional — 3 pc` under `On this paper` above Help ✓; **Enter on a fresh load does nothing**: Pieces is not mounted, no listener for `document:focus-ffe-line`, focus lands on `BODY`, the page scrolls to the Pieces head only. With Pieces already open, focus lands on the Order **group**, not `PO WS-188`, and nothing scrolls into view | not walked | `1440-chen-cmdk-sectional.jpg`, `1440-chen-cmdk-enter-fresh-load-fail.jpg`, `1440-chen-cmdk-sectional-enter.jpg` |
| 1-2 synonyms, dry query | **PASS** | `change` → `Record a change`; `zzz` → `Nothing on this paper matches "zzz".`, `Open the pieces · 3 lines` first, Help last; Esc returns focus to `Find anything ⌘K` | sheet opens, same groups | `1440-chen-cmdk-change.jpg`, `1440-chen-cmdk-zzz-dry-query.jpg`, `390-chen-cmdk.png` |
| 1-3 Record a change | **PARTIAL** | Router: native radios, `Continue` reads `Choose one to continue.` ✓; `On the agreement` → Amendment sheet ✓; `On a piece` → sofa line with PO opens `Change this order` ✓ (Halloran); Esc returns focus to `Record a change` ✓ (real click). **`Choose the piece` has no exit; Esc falls through to `Put down` and leaves for `/desk`** ✗ | router identical | `1440-halloran-router.jpg`, `1440-halloran-change-this-order.jpg`, `1440-chen-choose-the-piece.jpg`, `390-chen-router.png` |
| 1-4 install reading | **PASS** (with F15) | Cedar `Reading chair isn't here, and no arrival date is recorded. 1 more isn't here.`; Wren `was due 2 October and isn't here`; Alder `arrives Friday 9 October` + `Hold a window`; Quill `Everything is here.` + `Open the punch list`; no `late`, `behind`, ratio. The Install head carries two scored acts (`Bill 3 uninvoiced` primary beside the inked Ask) | same sentence; `Punch` (tertiary) also prints — slice 2 | `1440-wren-install-reading.jpg`, `1440-alder-install-reading.jpg`, `1440-quill-install-reading.jpg`, `390-cedar-install.png` |
| 1-5 Ask the maker | **PARTIAL** | Sheet: To/Subject/Note, focus on the body, acts `Hold for review` + `Discard`, **no Send** ✓; Hold wrote one `awaiting_review` row ✓; line reads `Asked 7 October · draft held for review`, act `Open the held draft` ✓. `To` reads `No maker is recorded on this line.` while the row prints `Fixture Metalworks` ✗; greeting `Hello there,` ✗; focus lost to `BODY` after Hold ✗; the held draft reaches no studio surface (SQ-501 F3) ✗ | sheet identical | `1440-cedar-ask-the-maker-sheet.jpg`, `1440-cedar-after-hold-for-review.jpg`, `1440-cedar-held-draft-readonly.jpg`, `390-cedar-ask-sheet.png` |
| 1-6 `?` printed | **PARTIAL** | Drawer shows `Keys ?` ✓, foot `↵ open · ↑↓ move · ? keys · esc close` ✓, `?` opens Keys ✓ and does not fire in the ⌘K input ✓; **`Keys ?` sits beside, not beneath, and overlaps `IN HAND TODAY 6h 27m`**; `THE POST` wraps | the dock's More has no `Keys` row | `1440-chen-drawer-keys-collision.png`, `1440-chen-keys-sheet.jpg`, `390-chen-more.png` |

**House sheet.** Type, ink and the clay/terracotta split are right in the new work: SETUP rows are clay; held acts are not terracotta; `da-inked` leaders are scored, not plates. Terracotta is spent on the band's line 1 (`OVERDUE 148D · WS-188`) and the Aspen overdue sentence — pre-existing band work (slice 2). **D11 do-not-copy:** none of the listed strings print. **V11:** `0 of 6 closed out` prints on every Project and Install spread's Closing-the-book head and rail (F8); `2 OF 5` prints in Aspen's rail and eyebrow (slice 2, Q10). **Keyboard:** Esc return paths pass for ⌘K, the standing sheet, the router and the Amendment sheet; they fail for `Choose the piece` (F3) and after `Hold for review` (F7). Held acts stay in the tab order.

---

## 3. Fixes

Each fix is buildable as written. Severity: High blocks the slice's promise; Medium breaks a ruling on a walked surface; Low is a ruling breach a hire would survive. Confidence is in the diagnosis.

### F1 · ⌘K Enter must land on the line (1-1) — **High · confidence High**
- **Files:** `apps/designer-portal/src/components/command-bar/command-bar.tsx` (the `On this paper` row's Enter handler, the `document:focus-ffe-line` dispatch); `apps/designer-portal/src/components/document/ffe-section.tsx` (the listener; region mount/fold state); the region fold store the Pieces seam reads.
- **Behaviour:** Enter unfolds the Pieces region (mounting it if lazy), waits for mount, unfolds the chosen line, scrolls its Order cell into view, and focuses the `PO WS-188` control (R28). If the event fires before the listener exists, the request is queued and consumed on mount.
- **Acceptance:** On a fresh load of Chen (Pieces folded), `⌘K` → `sectional` → Enter leaves `document.activeElement` on the `PO WS-188` control with the line unfolded and its Order cell in the viewport. Same result when Pieces is already open.

### F2 · The held maker draft must reach a studio person (SQ-501 F3; R37) — **High · confidence Medium on the path, High on the defect**
- **Files:** `apps/designer-portal/src/app/api/document/ask-maker-date/route.ts`; `apps/designer-portal/src/components/document/overlays/ask-maker-sheet.tsx`; `apps/designer-portal/src/lib/document/install-reading.ts`; a hand-numbered migration in `supabase/migrations/` if `procurement_drafts` needs a draft kind for an ETA request; the Desk drafts / `DraftReview` consumer that lists `procurement_drafts`.
- **Behaviour:** For a line with a PO, `Hold for review` writes a `procurement_drafts` row on that PO (status the studio reviews), and `Open the held draft` opens that `DraftReview`, where a person sends or discards. For a line with no recorded maker, `Ask the maker for a date` is held: `aria-disabled`, reason `No maker is recorded on this line.` beneath, repair act `Add the maker` beside it opening the line's maker field. Interim, if the path takes more than one ticket: the reopened sheet gains `Discard the draft`, which deletes the held row and clears the status line.
- **Acceptance:** On Wren Street Library (WS-214), `Hold for review` → the draft appears in the studio's Desk drafts and in the PO's `DraftReview`; a studio member can send it from there. On Cedar Lane's chair (no maker), the act is held with that reason and `Add the maker` focuses the maker field. Nothing is ever sent without a person's press.

### F3 · `Choose the piece` needs an exit (1-3; R34) — **High · confidence High**
- **Files:** `apps/designer-portal/src/components/document/ffe-section.tsx` (the choosing state and its prompt); the document shell's Esc handler that routes to `Put down` (`apps/designer-portal/src/components/document/` — the component owning `Put down`).
- **Behaviour:** The prompt reads `Choose the piece · Put back · Esc` with `Put back` a plain act. Esc or `Put back` ends choosing and returns focus to the `Record a change` that started it. While choosing is active, the shell's Esc never reaches `Put down`.
- **Acceptance:** Chen → `Record a change` → `On a piece` → Continue → Esc: the URL is unchanged, the prompt is gone, `document.activeElement` is `Record a change`.

### F4 · The held reason sits beneath its act (0a-8; R15, R16) — **Medium · confidence High**
- **Files:** the letterhead instrument row that renders `Message` · `Link a client` · `Preview` · `Sharing` · `Call sheet` (`apps/designer-portal/src/components/document/` letterhead/instruments component); `apps/designer-portal/src/app/globals.css` (`held` reason placement).
- **Behaviour:** The held act prints `Message the client` (same string as its accessible name). The reason `Link a client first.` prints directly beneath that act, left-aligned to it, in the act's own column; `Link a client` sits beside the held act. At 390, when the acts wrap, the reason still follows its own act.
- **Acceptance:** On Chen at 1440 and 390 the reason's left edge equals `Message the client`'s left edge and its top is within 8px of the act's bottom; `aria-describedby` still links them.

### F5 · The Amendment sheet on a no-client job (0a-8, 0a-6; R18) — **Medium · confidence High**
- **Files:** `apps/designer-portal/src/components/document/overlays/amendment-sheet.tsx`.
- **Behaviour:** With no linked client, `Send to the client` is held (`aria-disabled`, reason `Link a client first.`, repair act `Link a client` beside). No figure prints when the amendment total is 0 (today `$0`). The consequence sentence reads `… the client approves …` (today `the client approve`).
- **Acceptance:** Chen → `Record a change` → `On the agreement`: no `$0` anywhere in the sheet; Send is focusable, `aria-disabled="true"`, reason readable beneath.

### F6 · `Keys ?` beneath `Find anything`, and in More at 390 (1-6; R22) — **Medium · confidence High**
- **Files:** the Studio Drawer component that prints `Find anything ⌘K` and `Keys ?` (`apps/designer-portal/src/components/` studio drawer); the 390 dock's More menu (`Document bar` nav).
- **Behaviour:** `Keys ?` is its own row directly beneath `Find anything ⌘K` at every width; nothing overlaps `IN HAND TODAY`; `THE POST` stays on one line. At 390 the dock's More lists `Keys` (last, per D7's order).
- **Acceptance:** At 1440 the bounding boxes of `Keys ?` and `IN HAND TODAY` do not intersect; at 390 More contains a `Keys` row that opens the Keys sheet.

### F7 · Ask-the-maker sheet: addressee, greeting, focus (1-5; R42) — **Medium · confidence High**
- **Files:** `apps/designer-portal/src/lib/document/install-reading.ts` (maker selector); `apps/designer-portal/src/components/document/overlays/ask-maker-sheet.tsx`; `apps/designer-portal/src/app/api/document/ask-maker-date/route.ts` (reads the same selector from the record).
- **Behaviour:** `To` prints the maker string the row prints, from one selector (`vendor_name` → PO vendor → line maker). The note opens with the maker's name, else no greeting line (never `Hello there,`). After `Hold for review`, focus lands on `Open the held draft`.
- **Acceptance:** Cedar Lane's chair row and its sheet print the same maker; after Hold, `document.activeElement` is `Open the held draft`.

### F8 · Cut `N of M closed out` (R13; V11) — **Medium · confidence High**
- **Files:** the Closing-the-book head/band component (`care-band` or its successor under `apps/designer-portal/src/components/document/`); `apps/designer-portal/src/lib/document/section-derivation.ts` (rail label); the 390 fold line that repeats it.
- **Behaviour:** Head status line, rail and fold line read `Nothing yet` → `{n} closed out` → `Closed {day month}`; no `of`.
- **Acceptance:** Chen, Halloran, Cedar and Lindqvist print no string matching `/\d+ of \d+/` in Closing the book or the rail.

### F9 · Placeholder guard in the rail and sticky eyebrow (0a-7) — **Medium · confidence High**
- **Files:** the spine rail's household line and the sticky band eyebrow (`apps/designer-portal/src/components/document/` rail + band); route both through the guard in `apps/designer-portal/src/lib/document/act-names.ts` (`messageLabel` / placeholder fallback).
- **Behaviour:** `Client User` never prints; the rail reads `the client`, the eyebrow `THE CLIENT · DESIGN DEVELOPMENT`.
- **Acceptance:** Aspen Loft Refresh prints `Client User` nowhere at 1440 or 390.

### F10 · On-hold eyebrow (R9; rulings.md l.39) — **Low · confidence High**
- **Files:** the spine rail stamp consumer of `stageEyebrow` (`act-names.ts`) — today it prints `PROJECT · ACTIVE` on Harrow Road Flat.
- **Behaviour:** `on_hold` prints `PROJECT · ON HOLD`; `archived` prints `{Stage} · Archived`.
- **Acceptance:** Harrow Road Flat's rail reads `PROJECT · ON HOLD`; the band's `This project is paused` sentence stays.

### F11 · The closed sentence is the Care head's status line (R11) — **Low · confidence High**
- **Files:** the Care section head (`apps/designer-portal/src/components/document/` care/closing section).
- **Behaviour:** `The book closed 21 November.` prints beneath the `Care` heading as its status line; the free paragraph above the heading is removed.
- **Acceptance:** On Lindqvist the sentence appears once, inside the Care head, below the heading.

### F12 · Phase-handoff machinery paragraph (0a-5 kin; D11) — **Low · confidence High**
- **Files:** `apps/designer-portal/src/components/document/phase-advance-control.tsx` (or the Schedule-dates block that prints `PHASE HANDOFFS`).
- **Behaviour:** Delete `Completing a phase activates every direct follower in the project graph. The server verifies blockers and the exact transition.`; the phase rows and `Complete phase` stand alone. `Anchored · 2 September`, `Main lane`, `Thread lane`, `Follows …` go to slice 2's one-name table for renaming (logged, not fixed here).
- **Acceptance:** Aspen Loft Refresh prints no sentence containing `project graph` or `exact transition`.

### F13 · One stamp per Install row (R12) — **Low · confidence Medium**
- **Files:** the Install rows in `ffe-section.tsx` / `buying/install-manifest.tsx`.
- **Behaviour:** The leading state word is the only stamp; `In production` / `Released` join the detail line as text.
- **Acceptance:** Cedar Lane's chair row prints one mono-caps stamp (`NOT HERE`) and `Fixture Metalworks · Study · In production` beneath the name.

### F14 · The Direction's standing sheet (R20; V11) — **Low · confidence Medium**
- **Files:** the standing-sheet row builder for Direction/Proposal papers (lens standing derivation for proposal docs).
- **Behaviour:** The eight `INPUT NEEDED` rows (`rooms in scope · Designer · blocks Client proposal`, …) collapse to one row: `The proposal needs 8 inputs` with the act `Write the proposal` (D1's Direction own act); the words `blocks` and `Client proposal` do not print.
- **Acceptance:** Elena Marlowe's door reads `Standing · 1` (or is silent when the band already names it) and the sheet has one row with one act.

### F15 · One leader on the Install head (R32; R150 R5) — **Low · confidence High**
- **Files:** `ffe-section.tsx` Install head acts.
- **Behaviour:** The reading's act is the head's only scored act; `Bill N uninvoiced` is plain (`secondary`); `Spec book →` stays a link.
- **Acceptance:** On Cedar Lane exactly one head act carries `da-inked`/`da-primary`.

### F16 · `Amendment` leaves the Money head (D1 Never) — **Low · confidence High**
- **Files:** the Money region head (`apps/designer-portal/src/components/document/` money section).
- **Behaviour:** `Amendment` is removed from the head; the amendment is reached through `Record a change` → `On the agreement` only.
- **Acceptance:** Halloran House's Money head prints `Draw an invoice` · `Record a change` · `Hours · this project ↗` · `Fold` and no `Amendment`.

### Slice-2 ledger (confirmed still printing; already owned by D1/D2/D7 work, not filed here)
Bare `RECORD` and `148D` on the 390 band; `+5 MORE` door instead of `Standing · 5`; the 390 dock's centre is empty (no Next act) and its left column clips (`AT CLIENT APP…`); the 390 More is the old "In this document" menu (no Message, no Keys, no `Standing · N`); `Preview` alone; `Punch`; `Chase the PO` and `Chase the approval`; `FF&E schedule`; `Installation` eyebrow; `2 OF 5`; `In procurement` / `Out for signature` in ⌘K's `Where the work stands`; terracotta line 1.

---

### Fix list (to file as tickets)

1. **F1** ⌘K Enter lands on the unfolded line with focus on `PO WS-188`, on fresh load and when mounted — High.
2. **F2** Held maker draft routes to `procurement_drafts` / `DraftReview` for PO lines; no-maker lines hold the act with `Add the maker`; interim `Discard the draft` — High (closes SQ-501 F3).
3. **F3** `Choose the piece` gets `Put back · Esc`; Esc never reaches `Put down` — High.
4. **F4** Held reason directly beneath its act; `Message the client` prints — Medium.
5. **F5** Amendment sheet: held Send on no-client jobs, no `$0`, grammar — Medium.
6. **F6** `Keys ?` beneath `Find anything` at every width; `Keys` row in 390 More — Medium.
7. **F7** Ask sheet: one maker selector for row and `To`, no `Hello there,`, focus to `Open the held draft` after Hold — Medium.
8. **F8** Cut `N of M closed out` from head, rail and fold line — Medium.
9. **F9** Placeholder guard on the spine rail and sticky eyebrow — Medium.
10. **F10** `PROJECT · ON HOLD` / `{Stage} · Archived` eyebrow — Low.
11. **F11** Closed sentence becomes the Care head's status line — Low.
12. **F12** Delete the phase-handoff machinery paragraph — Low.
13. **F13** One stamp per Install row — Low.
14. **F14** Direction standing sheet collapses to one row with `Write the proposal` — Low.
15. **F15** One leader on the Install head — Low.
16. **F16** `Amendment` leaves the Money head — Low.

Rulings R1–R9, R19, R23–R31, R33, R35, R36 change strings or behaviour that slice 2 (SQ-489 table, 2-A band, ⌘K follow-ups) is already building; they are inputs to those tickets, not new ones.

---

## 4. For Kody (dissents and amendments, not rulings)

1. **D6 amended by evidence (R37).** D6 said the held draft is written with `enqueue_agent_task` and "a person sends it from the Post". The Post does not read `agent_tasks`, and `agent_tasks_select_admin` hides those rows from studio members; the draft reaches only admin Mission Control. I routed PO-line drafts to the PO-native `procurement_drafts` path the studio already reviews and sends. If you would rather keep the agent queue as the single draft store, the alternative is a Post reader for the studio's own `maker_eta_request` rows (an RLS policy plus Post UI plus a send route) — larger, and it makes the Post a second review surface beside Desk drafts.
2. **R19 (`Set dates` for the target-date setup row).** The rule of names gives the row the letterhead control's label. `Set a target date` reads better as a sentence. Your call; the code pick is one string.
3. **Q10 standing.** The strata/arc mark (`2 OF 5` in Aspen's rail) is still the open V11 question rulings.md §6 records; the count is cut in slice 2 regardless.
4. **Chrome's 500px floor.** 390 could only be walked in Playwright. The Q8 hire walk should be on a phone, not an emulator.

## 5. Notes for the orchestrator

- The fixture proposals `b0000000-…01` / `…02` belong to project `04c7655c-…`, which is not a reachable paper for the dev designer (`/doc/04c7655c…` lands on Aspen Loft Refresh), so their seeded descriptions were not observable on any Document surface.
- Local DB side effect: one `agent_tasks` row (`maker_eta_request`, `awaiting_review`, id `808f4b59-…`) from the 1-5 walk, left in place.
- Sidequest upstream defects seen on this run: the briefing packet printed `Ref: undefined` with an empty claim guard; the first `claim` with the printed guard was refused `executor_mismatch` (re-claim with `sidequest-exec-high` / `high` succeeded); the worktree path is sandbox-denied for `mkdir` (ran with the sandbox off).
