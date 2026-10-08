# Design review 4 — FR3 re-acceptance and the FR3-wave DESIGN-Q rulings (US-19 FR4)

**Headline: no fix in this review is high severity.** The FR3 wave landed: Esc closes the innermost open thing and returns one floor on every path walked, every band and dock press lands with focus on a control or an open form on five of the six papers that carry a Next act (Olsen's claim is the one that stops short), the Money head leads with the paper's own act, the Discovery ladder prints, and the held Message on Direction names Elena and offers the invite. What remains is a set of medium and low corrections, mostly landings that stop one floor short of a control, and the DESIGN-Qs the FR3 executors parked.

- Tree reviewed: `main` at `40fc275ae` (SQ-520, 521, 522, 524, 527 merged; the dev server at `localhost:3000` served this tree with `ask-the-paper:true,one-voice:true`).
- Method: headless Playwright 1.58.2, 1440×900 and 390×844 (DPR 2, touch at 390), signed in as `designer@patina.dev`. Every paper: top probe, ⌘K query + Esc, Standing door or More + sheet + Esc, band or dock press + Esc, Money head and its leader. Targeted second pass at 1440 for the landings under question. Screenshots in `review-4/` (`<width>-<paper>-<state>.png`, `sips -Z 1600`). Raw JSON and the harness output live in the ticket's verification directory.
- Papers: Chen (project, long form), Direction (proposal, Elena Marlowe), Harrow (on hold), Lindqvist (care, closed), Cedar (install), Aspen (proposal with the client), Olsen (open claim), Halloran (PO sent, unacknowledged), the Ashfords (discovery, relationship), the Desk.
- Authority: `rulings.md` D1–D11; `design-review-3.md` F3-1…F3-26 and §4 (the Esc law); FR3 §1 rulings 512-x…518-x.

## 1. Rulings

Each row: the exact string or behaviour, one sentence of reason, the source it rests on. Executors build from the Ruling column; the Reason column is for Kody.

### SQ-520 — Esc, landings, folio, Hold a window

| Q | Ruling | Reason | Source |
|---|---|---|---|
| 520-1 Cedar `Ask the maker for a date` with no maker on the line | **Accept the repair landing as built**: the act is held with `No maker is recorded on this line.` and the press lands on `Add the maker`. One correction: when the DocSheet opens on a line that *has* a maker, focus goes to the **body**, not the Subject. | D6 says the maker sheet opens "focus on the body" because the subject is already written for the designer; the repair landing is exactly what D3 asks of a gated act. | D3 (gated = held + reason + repair act), D6 (Ask the maker) |
| 520-2 Halloran `Follow up with the maker` lands on the PO button `NA-2026-077` | **Interim accept; ruled end state is a maker-message landing.** The press should open the maker composer (the Ask-the-maker DocSheet generalised, subject `NA-2026-077 — following up`, body focused, or the vendor `thread` composer in Orders), never the order ledger. Until that lands, the PO button stays. | The rule of names: a label called *Follow up with the maker* that opens the order instead of a message says one thing and does another. | D1 (rule of names), D6 (maker sheet), FR3 §1 518-2 |
| 520-3 Aspen `Nudge the client` composer | **Accept**: the body opens empty and focused; the paper prints `Waiting on {first}: {decision} · {decision}` as a line above the composer so the designer writes in her own words. Three corrections: Esc from the composer must return focus to the pressed act (band at 1440, dock at 390); the placeholder reads `A quick note to {first}…` only when a real first name is known, otherwise `A quick note to the client…`; the dock's left column prints the household name through `householdDisplayName`, never the raw `Client User` record. | A nudge is the designer's voice, not a template (D1 voice rules); the placeholder guard leak (0a-7) is still visible on Aspen because the seed's client is literally named `Client User`, see 526. | D1, D5, design-review-3 §4 (Esc law), FR3 0a-7 |
| 520-4 Olsen `File the claim` at PO grain | **Fail as built**: the press opens the `Orders · Receiving` ledger dialog, a surface, not a control. **Ruling**: the act lands on the receiving page's claim control for that line — `Notify vendor` (label to become `Notify the maker`, see §4) when the claim is open, `Mark resolved` otherwise — with focus on it; the ledger is the room the control lives in, never the landing. | P-2: every press lands with focus on a control. | design-review-2 P-2, D1 own-act table (`File the claim`) |
| 520-5 Hold a window landing on the ceremony door | **Accept.** | The ceremony door is a control and the paper's own act for the slot ladder. | F3-23 |
| 520 skipped seams | The ClaimActs resolve form (`How was it resolved?…`) takes Esc as **Cancel** (close the form, focus back to `Mark resolved`). The legacy design-services composer and the FFE head entries stay as they are this wave. | One Esc law for every form on the paper; the two legacy seams carry no Next act and can wait. | design-review-3 §4 |

### SQ-521 — Desk card for a one-voice folder whose only needs are setup

| Q | Ruling | Reason | Source |
|---|---|---|---|
| 521 Cedar's Desk card prints `INSTALL YOUR PEN … Name the phases for this project · OPEN THE SCHEDULE` while the paper prints `Ask the maker for a date` | **Ruling (b) now, (c) as the end state.** (b) A one-voice folder whose only remaining needs are setup prints **at rest** on the Desk with the Desk's existing `Open the job` act — setup never leads a card, matching the paper. (c) The deferred Desk ticket feeds the paper's own-act facts to the card so the Desk and the band print the same Next; until then the band is the authority and the card must not contradict it. | D2 and D10 put setup in class 3 and never in Next or terracotta; a card that leads with setup contradicts the paper it opens. `Open the job` already exists on AT REST cards, so (b) is a string reuse, not new vocabulary. | D2, D10, D1 (one voice) |

### SQ-522 — Install reading, short forms, sheet rows, colour

| Q | Ruling | Reason | Source |
|---|---|---|---|
| 522-1 measure model for the band (long form only when the sentence fits) | **Accept.** Note for §4: the estimator may be conservative; Cedar's sentence looks like it would fit the long form at 1440. | The band must never clip; a conservative measure clips nothing. | F3-11, FR3 522-1 |
| 522-2 short forms for the install reading | `{name} isn't here — due {day}.` when the date has passed; `{name} arrives {day}.` when it is ahead (day only, no weekday); `Everything is here.` unchanged. Short forms carry **no** `N more` trailer; the long form keeps `{N} more aren't here.` | The short form exists to fit; a trailer defeats it, and the sheet already carries the count. | D6 install reading table |
| 522-3 sheet rows that land | **Every sheet row lands on a control**, the same rule as the band. `Nudge {first}` rows land on the composer through `document:compose-message`. As walked: Chen's `Spec the 3 unspecified` row lands on `#doc-section-project` (a region) and Olsen's `Send the purchase order` row lands on the Pieces `<h2>` — both fail. | P-2 applies to every act on the paper, not only the band's. | design-review-2 P-2, F3-2 |
| 522-4 own-act Next colour | Own-act Next is **scored ink** (the `inked` variant); terracotta is reserved for class 1 and 2 (money due, the client waiting). Cedar's `Ask the maker for a date` prints inked at rest and primary only on the reading line's leader. | D2 selection order and D3 tiers already carry this; the ruling closes the executor's question. | D2, D3 |

### SQ-523 — Harrow and ratios

| Q | Ruling | Reason | Source |
|---|---|---|---|
| 523-1 held head `Open the pieces` on Harrow leaves focus on the head button, out of view | Lands on the **first line's unfold control** (zero lines → the Pieces heading) and scrolls it into view. | P-2 and the paused paper still has pieces to read. | P-2, F3-10 |
| 523-2 `{N} ticked` | **Accept.** | A count, not a ratio. | V11 |
| 523-3 `Punch list · {N} done` | **Accept.** | A count, not a ratio. | V11 |
| 523-4 remaining `N of M` sites | **Positional pagers stay**: `photo 2 of 7`, `part N of M` (agreement live region), `Inspection photo N of M` — V11 bans progress ratios, not positions (clarified in §4). **Convert the progress ratios** in one low sweep: trade `draws issued {i}` + `draws left {n−i}`; work-block `{logged} logged · {est} est.`; account-band `{b−a} committed without trade cost` / `trade cost on every committed line`; plan-issue `{n} changed since {prior}. The rest go along unchanged.` and `{n} sent · {m−n} to go` / `All {m} sent`; ceremony-slots `{n} offered · offer two or three`. | V11: the paper counts, it never scores. | V11, F3-20 |

### SQ-524 — The Ashfords, Direction, Brief

| Q | Ruling | Reason | Source |
|---|---|---|---|
| 524-a relationship-kind household sheet has no invite control (Invite the Ashfords opens a sheet with only `Edit details`) | The relationship sheet mounts the People room's client-letter row (`useInviteAndLinkClient`, the `client-letter-line`), and the repair act lands on it. The label follows the control: `Invite the Ashfords`, or `Write to the Ashfords` where the `client-invite-letter` flag is on. Until built, the Message act is **held with no repair act** rather than a repair that leads nowhere. | D3: a repair act must repair; a door into an empty room is worse than a held act. | D3, F3-6 |
| 524-b article-led plural household | `Message the Ashfords` · `The Ashfords have no login yet.` · `Invite the Ashfords`. The household name keeps its article and takes the plural verb. | House voice: the paper says what the designer would say. | D1 |
| 524-c `Keys ?` on the Ashfords letterhead | **Accept.** | F3-19 and the Discovery ladder stand. | F3-19 |
| 524-d Brief papers and the letterhead | Brief mounts the letterhead with **Keys and Standing only** — no Message, no Preview; the Brief's act is `Respond to the inquiry` in the band. | Nothing has been written to the inquirer yet; a Message act would front-run the reply. (confidence medium — no Brief paper was walked this round.) | D1 own-act table |
| 524-e `contacted` excluded from the ladder | **Accept.** The post-reply Brief act is unruled and goes to §4. | — | FR3 512-x |
| 524-f `document-act-inquiry-reply` | Attach the id to the Brief reply **control** (the composer's send or the reply door), not its region, so the band press lands on it. | P-2. | P-2, `ACT_TARGET_IDS` |
| 524-g Finalize head hoisting `preview` | Under one-voice the Finalize head **never hoists preview**; `hoistedLeader` is null when `leader.kind === 'preview'`. Preview is a letterhead door, not a leader. | D2: Preview is never Next; F3-6 made the letterhead the one Preview doorway. | D2, F3-6 |

### SQ-525 — Terms and the asked date

| Q | Ruling | Reason | Source |
|---|---|---|---|
| 517-4 the asked-for date | **Ruling (b)**: `Asked {day} · sent` persists in the install line's cell and in the D6 row until a date is recorded; cell and row print the same words. | The ask is a fact about the line until the maker answers. | D6 row states |
| 517-1 Terms edit-mode landing | **Accept.** | A control, in view. | P-2 |

### SQ-526 — the `Client User` seed

| Q | Ruling | Reason | Source |
|---|---|---|---|
| 499-1 one live paper proves the placeholder guard | Rename Aspen's client in `running_a_job_walk_dev.sql` to a real name (the paper then prints `Nudge {first}` and `Waiting on {first}`), and update the two e2e specs that pin `With Client User ·` (`apps/designer-portal/e2e/wp3-screenshots.spec.ts:206`, `e2e/document/margin-handoffs.spec.ts:76`, the latter also pins a bare `Nudge`). Orchestrator scope: the seed is wired in `supabase/config.toml` `[db.seed] sql_paths`, so the specs break the moment the seed changes. Walking the fallback alone proves nothing. | A guard is proven only when a real name reaches the paper; today the seed's name *is* the placeholder. | FR3 0a-7, 499-1 |

### People room — "the Engine"

| Q | Ruling | Reason | Source |
|---|---|---|---|
| Does 513-4 (no "Engine" where a person reads) reach the People room, Library and help lexicon? | **513-4 is a rule of the paper** (The Document and ⌘K results). The People room `Ask the Engine` bar, `your-eye.tsx`, `style-dna.tsx`, `nurture-view.tsx`, the Library foot and deep-analysis sheet, the piece room, the Judgments page and `help-topics.ts:73` ("the Engine" in the lexicon) carry a **standing copy law** of their own; this review does not overturn it. The conflict is recorded for Kody in §4 with a recommendation: retire the word everywhere when Leah's words arrive, in one sweep, not room by room. | Two authorities disagree; the paper's rule was never written for the People room, and a half-renamed product is worse than either. | FR3 513-4, VISION (Designer-Taught Intelligence, never "AI") |

## 2. Acceptance

### Rows 2-1 … 2-7, both widths

Pass = as ruled; Part = ruled behaviour with a named correction; Fail = correction required before the row counts. Screenshots are `review-4/<file>.png`.

| Row | Paper | 1440 | 390 | Evidence | Correction on part/fail |
|---|---|---|---|---|---|
| 2-1 Band says the paper's one Next, long form where it fits | Chen | Pass | Pass | `1440-chen-top`, `390-chen-top` — `NEXT ─ Pay Woodward & Sons the WS-188 balance, $3,400 — 148 days overdue · RECORD THE PAYMENT`; door `Standing · 5` clay | — |
| 2-1 | Cedar | Pass | Pass | `1440-cedar-top`, `390-cedar-top` — short form `Side table isn't here — no date recorded · ASK THE MAKER FOR A DATE`, door `Standing · 4` | §4 note: estimator may be conservative |
| 2-1 | Aspen · Olsen · Halloran | Pass | Pass | `*-aspen-top`, `*-olsen-top`, `*-halloran-top` — `NUDGE THE CLIENT` · `FILE THE CLAIM` · `FOLLOW UP WITH THE MAKER`; `NA-2026-077` printed once | — |
| 2-1 | Harrow · Lindqvist | Pass | Pass | `*-harrow-top`, `*-lindqvist-top` — `PROJECT · ON HOLD / Paused — nothing moves until it resumes.` and `CARE · CLOSED`; no act, no door, no tour note | — |
| 2-1 | Direction · Ashfords | Pass | Pass | `*-direction-top` `NEXT ─ WRITE THE PROPOSAL`; `*-ashfords-top` `DISCOVERY · THE ASHFORDS / NEXT` with rail `5 STILL TO ADD` | — |
| 2-2 Label agreement: band, head, ⌘K row, sheet NEXT row, Desk card say the same act | Chen · Aspen · Olsen · Halloran | Pass | Pass | `1440-chen-money-head-act`, `1440-chen-cmdk-pay`, `1440-chen-standing-sheet`, `1440-desk-top`; same for Aspen/Olsen/Halloran | — |
| 2-2 | Cedar | **Fail (Desk)** | **Fail (Desk)** | `1440-desk-top`, `390-desk-top` — card leads `Name the phases for this project · OPEN THE SCHEDULE` while the band says `Ask the maker for a date`; also Install title row leads `BILL 4 UNINVOICED` beside the reading's leader (`1440-cedar-install-region`) | Fix 5 (Desk at rest, `Open the job`); Fix 10 (one leader in the Install region) |
| 2-2 | Desk Brief and Proposal cards | **Part** | **Part** | `1440-desk-top` — Brief cards `New lead — respond by … · OPEN THE JOB` (D1: `Respond to the inquiry`); Aspen's card `Sent 5 October — not yet opened · FOLLOW UP` (D1: `Nudge the client`) | Fix 5 (same Desk ticket) |
| 2-3 Weight tiers: terminal only on the filled set, held = reason + repair | All | Pass | Pass | terminal@rest = 0 on every paper; terminal appears only inside the open record form / folio (`1440-chen-after-act`, `1440-aspen-money-head-act`); held acts carry `aria-describedby` reasons (`Elena has no login yet.`, `No maker is recorded on this line.`, `Link a client first.`) | — |
| 2-4 Press lands on a control (P-2) | Chen · Aspen · Cedar · Direction (390) | Pass | Pass | `*-chen-after-act` form terminal focused with its sentence; `*-aspen-after-act` textarea focused; `*-cedar-after-act` `ADD THE MAKER` focused; `390-direction-after-act` `/drafting/…?land=gap`, focus `+ Add Room` | — |
| 2-4 | Direction (1440) | Pass | — | `1440-direction-after-write` — `/drafting/…?land=gap`, focus `+ Add Room` (slow route; see landings table) | — |
| 2-4 | Olsen | **Fail** | **Fail** | `*-olsen-after-act` — `Orders · Receiving` ledger dialog opens, no control focused | Fix 3 |
| 2-4 | Halloran | Part | Part | `*-halloran-after-act` — PO button `NA-2026-077` focused (a control; wrong room per 520-2) | Fix 6 (end state) |
| 2-4 | Harrow Pieces head | Part | Part | `*-harrow-pieces-head-act` — focus stays on the head button, out of view | Fix 8 |
| 2-4 | Sheet rows | **Fail** | not walked | `1440-chen-sheet-spec-landing` → `#doc-section-project` DIV; `1440-olsen-sheet-send-landing` → Pieces `<h2>` | Fix 4 |
| 2-5 Esc closes the innermost thing and returns one floor | Record form · folio · ⌘K · sheet · More · household sheet | Pass | Pass | `*-chen-after-esc` focus on band/dock act, url unchanged; `*-aspen-money-head-act` + folio Esc → head act; ⌘K Esc → band act when opened from it (Chen, Cedar, Aspen), → More/door after a sheet; household sheet Esc → `INVITE ELENA` / More | — |
| 2-5 | Aspen Nudge composer | **Fail** | **Fail** | `1440-aspen-nudge-composer`, `390-aspen-after-esc` — Esc does not return focus to the pressed act (first pass: focus to BODY; second pass: composer stays open, textarea still focused) | Fix 2 |
| 2-5 | Esc after a landing with nothing open | Pass (law) | Pass (law) | Cedar and Halloran: Esc → `/desk` (put-down) | §4-3: consider one-floor return to the band act |
| 2-6 Dock centre equals the band's act; More order | All acting papers | — | Pass | `390-*-top`, `390-chen-more` (`Standing · 5 · Message the client[held: Link a client first.] · → Link a client · Preview · Sharing · Call sheet · Set dates · Set a budget band · Keys`), `390-direction-more`, `390-cedar-more` | Aspen dock left prints `Client User` — Fix 2 |
| 2-7 Money head leads with the paper's own act; folio record landing | Chen · Aspen | Pass | Pass | Chen `RECORD A CHANGE[inked] · DRAW AN INVOICE`; Aspen `RECORD THE PAYMENT[inked] · RECORD A CHANGE`; Aspen lead → `Invoice folio` with `Record the payment · $4,250.00`[terminal] focused and its sentence (`1440-aspen-money-head-act`) | §4-5: folio prints `$4,250.00` where the band prints `$3,400` |
| Discovery ladder | Ashfords | Pass | Pass | `*-ashfords-top` — `NEXT` alone (512-1), rail `5 STILL TO ADD`, ⌘K `add` row; letterhead `MESSAGE THE ASHFORDS[held] · INVITE THE ASHFORDS · Keys ?`, no Preview | Fix 7 (invite control, article) |
| Held Message on Direction | Direction | Pass | Pass | `1440-direction-top`, `390-direction-more` — `MESSAGE ELENA[held ⟨Elena has no login yet.⟩] · INVITE ELENA · PREVIEW THE CLIENT'S COPY`; `for Elena Marlowe↗`; Invite opens the household sheet with the picker `Invite or choose a client…` | Focus on open lands on the dialog, not the picker — Fix 7 |

### Landings under question (second pass at 1440)

Filled from `extra2-1440.json`; see §5 for the raw values.

| Press | Landed on | Verdict |
|---|---|---|
| Direction `Write the proposal` (band, 1440) | `/drafting/{id}?land=gap`, focus on `+ Add Room` — after a 9 s wait. The first pass read a no-op because the drafting route took longer than its 6 s budget to arrive (dev-server compile). `1440-direction-after-write` | **Pass**; the first-pass fail is withdrawn. Fix 1 is void. Note for §5: the route is slow on first open. |
| Aspen `Nudge the client` | Composer textarea focused, placeholder `A quick note to Client User…`; helper line `It lands in Client User’s portal messages.`; `Waiting on the client: 2 decisions overdue — oldest due 2 October` printed above (the guard works there). **Esc leaves the composer open with the textarea still focused.** `1440-aspen-nudge-composer` | Landing passes; Esc **fails** (the composer is an open thing and must close on Esc, focus back to the band act); two more placeholder leaks → Fix 2 |
| Olsen `File the claim` | `Orders · Receiving` ledger dialog, nothing focused; the claim card inside it carries `TRACK IT` and `NOTIFY VENDOR`; the paper's own line carries a `File the claim` control. `1440-olsen-claim-landing` | **Fail** → Fix 3: land on the line's `File the claim` control on the paper; only when the claim exists at PO grain alone, open the ledger scrolled to the claim card with focus on `Notify vendor` |
| Halloran `Follow up with the maker` | PO button `NA-2026-077`, aria `Open the order, PO NA-2026-077`, in the line's `line-po-cell` (`Order NA-2026-077 sent to vendor 1 October · awaiting acknowledgment`). `1440-halloran-followup-landing` | Part — a control, but its own name says *Open the order*; 520-2 end state → Fix 6 |

### Canon sweep

| Check | Result |
|---|---|
| V9 filled set is exactly D3's four | Pass — terminal appears only as `Record the payment` inside the record form and the folio; no terminal at rest anywhere |
| V11 no ratios on the papers walked | Pass on the ten papers (`N of M`, `OF 7` absent); the sites in 523-4 are in rooms not reached by the walk |
| House voice: no AI / Engine / model words where a person reads | Pass on all ten papers and ⌘K results; the People room and Library carry their own law (see §1, §4) |
| No-login suffix stripped | Pass — `(no-login household)` absent; `The Ashfords has no login yet.` prints (grammar in Fix 7) |
| `%` on the paper | Only Cedar's `32% MARGIN` (allowed, FR3 515-6) |
| Workflow phase names | Only inside the Schedule region and its empty-state templates (allowed, FR3 §4-6) |
| Focus and Esc return | Pass on every open thing; the two failures are composer Esc (Fix 2) and the landings that stop short of a control (Fixes 3, 4, 8) |

## 3. Fixes

Severity: high = a Next act that lies or does nothing; medium = a ruled behaviour missing on a walked path; low = copy, grammar, polish. Confidence is in the finding, not the fix.

| # | Fix | Severity | Conf. | Files |
|---|---|---|---|---|
| 1 | *Void.* The Direction 1440 press navigates (second pass); the first-pass no-op was the drafting route arriving after the probe's wait | none | high | — |
| 2 | Nudge composer: Esc closes the composer (Cancel) and returns focus to the pressed act (band / dock); the name guard covers the placeholder (`A quick note to the client…`), the helper line (`It lands in the client’s portal messages.`) and the dock's left column (`householdDisplayName`), as it already covers the `Waiting on` line | medium | high | `apps/designer-portal/src/components/document/letterhead-instruments.tsx` (composeMessage listener, composer, helper line), `apps/designer-portal/src/components/document/mobile-shell/*` (dock left), `apps/designer-portal/src/lib/document/act-names.ts` (name guard) |
| 3 | Olsen `File the claim` lands on the paper's own line-level `File the claim` control with focus; only when the claim exists at PO grain alone does the Orders ledger open, scrolled to the claim card with focus on `Notify vendor`. The ledger with nothing focused is never the landing | medium | high | `apps/designer-portal/src/components/document/line-unfold/claim-acts.tsx`, `apps/designer-portal/src/components/document/orders-book-vendors.tsx` (receiving ledger, claim card), `act-names.ts` (`ACT_LANDING_EVENTS`), `page.tsx` listener |
| 4 | Every Standing-sheet row lands on a control: `Spec the N unspecified` → first unspecified line's spec control; `Send the purchase order` → the PO's send control; `Nudge {first}` → composer via `document:compose-message` | medium | high | `apps/designer-portal/src/components/document/standing/*` (sheet rows), `act-names.ts` (`ACT_TARGET_IDS` must point at controls, not regions) |
| 5 | Desk: a one-voice folder whose only needs are setup prints at rest with `Open the job`; Brief cards print `Respond to the inquiry`; proposal-with-the-client cards print `Nudge {first}` / `Nudge the client`; end state feeds band facts to the card | medium | high | `apps/designer-portal/src/components/desk/*` (card act selection); deferred Desk ticket |
| 6 | Halloran `Follow up with the maker` opens the maker composer (generalised Ask-the-maker DocSheet, subject prefilled, body focused) | medium | high | `apps/designer-portal/src/components/document/overlays/ask-the-maker-sheet.tsx` (or its current home), `act-names.ts` (`document:ask-the-maker` payload), `page.tsx` listener |
| 7 | Relationship household sheet: mount the client-letter row (`useInviteAndLinkClient`) so `Invite the Ashfords` lands on a control; focus the picker (not the dialog) on open for proposal-kind too; plural article grammar (`The Ashfords have no login yet.`, `Message the Ashfords`) | medium (control) / low (grammar) | high | `apps/designer-portal/src/components/document/overlays/household-sheet.tsx` (`attachTarget`), `apps/designer-portal/src/components/people/directory/client-letter-line.tsx` (reuse), `act-names.ts` (`messageNoLogin`) |
| 8 | Harrow held head `Open the pieces` lands on the first line's unfold control and scrolls into view | low | high | `apps/designer-portal/src/components/document/ffe-section*.tsx` (head leader) |
| 9 | 522-2 short forms: `{name} isn't here — due {day}.` / `{name} arrives {day}.`, no `N more` trailer | low | high | `apps/designer-portal/src/components/document/install-*.tsx` (reading copy), `act-names.ts` if the copy lives there |
| 10 | Cedar Install region: one leader — the reading line's act leads; the title row's `Bill 4 uninvoiced` moves to the Money head or stays tertiary; the region's empty-state `Add the first task` and `+ File` print primary beside the held leader (three primaries in one region) and drop to secondary | low | medium | `apps/designer-portal/src/components/document/install-*.tsx` (region title row) |
| 11 | ClaimActs resolve form: Esc = Cancel, focus back to `Mark resolved` | low | high | `apps/designer-portal/src/components/document/line-unfold/claim-acts.tsx` |
| 12 | 523-4 ratio sweep (six sites, strings in §1) | low | high | `plans/plan-issue-ceremony.tsx:309,512`, `ceremony/ceremony-slots.tsx:123`, `commercial/trade/trade-scope-detail.tsx:399`, `work-block.tsx:287`, `account-band.tsx:372` (all under `apps/designer-portal/src/components/document/`) |
| 13 | 524-g: `hoistedLeader` null when `leader.kind === 'preview'` under one-voice | low | high | `apps/designer-portal/src/components/document/proposal-instruments.tsx:75` |
| 14 | 524-f: `document-act-inquiry-reply` on the Brief reply control; 524-d letterhead on Brief = Keys + Standing only | low | medium | Brief paper component, `act-names.ts` |
| 15 | 517-4: `Asked {day} · sent` persists in cell and D6 row until a date is recorded | low–medium | high | install line cell + D6 row component, `line-po-cell` |
| 16 | 520-1: Ask-the-maker DocSheet opens with focus on the body when a maker exists | low | high | ask-the-maker sheet component |
| 17 | 499-1: rename Aspen's seed client; update the two pinned e2e specs | low (test/seed) | high | `supabase/seed/running_a_job_walk_dev.sql`, `apps/designer-portal/e2e/wp3-screenshots.spec.ts:206`, `apps/designer-portal/e2e/document/margin-handoffs.spec.ts:76` |

Not fixed, by ruling: the People-room / Library / help-lexicon "Engine" strings (standing copy law; §4-1); Cedar's `32% MARGIN`; the Esc put-down after a landing (law stands; §4-3).

## 4. For Kody

Dissents and amendments. Nothing here changes a prior ruling silently; each names the ruling it touches.

1. **"The Engine" outside the paper.** 513-4 banned the word where a person reads on the paper. The People room (`Ask the Engine`), the Library foot, the deep-analysis sheet, the Judgments page and the help lexicon (`help-topics.ts:73`) still teach the word on purpose. Recommendation: retire it in one sweep when Leah's words for the thing arrive, not room by room — but that is your call, since the lexicon entry was written as a deliberate house word.
2. **Desk end state (521).** Ruled (b) now because it reuses an existing string and stops the Desk contradicting the paper. (c) — the Desk reading the paper's own-act facts — is the right end state and should be the deferred Desk ticket's contract, not an afterthought.
3. **Esc after a landing puts the paper down.** The §4-9 law (design-review-3) says put-down only when nothing is open, and after Cedar's `Add the maker` landing or Halloran's PO cell nothing *is* open, so Esc goes to the Desk. It felt abrupt on the walk: the designer pressed Next a second ago. Possible amendment to `rulings.md`: after a Next landing, the first Esc returns focus to the band act (one floor up), the second puts the paper down. Not ruled here; the law stands until you say.
4. **Measure model (522-1).** Cedar's sentence `Side table isn't here, and no arrival date is recorded. 2 more aren't here.` looks like it would fit the long form at 1440 but the band chose the short form. Conservative is safe; if it bothers you on the real paper, the estimator can be loosened.
5. **Money style.** The band prints `$3,400`; the folio prints `$4,250.00`. One house style for whole dollars on the paper (`$4,250`) is my recommendation; the folio's cents are a ledger habit.
6. **Positions versus progress (523-4).** I read V11 as banning *progress* ratios (`3 of 7 done`), not *positions* (`photo 2 of 7`). If V11 meant every `of`, the pagers go too — say so and Fix 12 grows by three sites.
7. **`Notify vendor` → `Notify the maker`.** The claim control still says vendor; the paper says maker everywhere else (D1). Low, but it will show once Fix 3 lands the band on it.
8. **The post-reply Brief act (524-e).** After the studio replies to an inquiry, the Brief's Next is unruled: `Schedule the discovery call` (the Desk already prints it for the Ashfords at rest) is the obvious candidate. Needs a ruling before the Brief wave.
9. **Cedar's tour note** did not print on either width and I could not tell whether it was dismissed by an earlier walk or never mounted. Worth one look on your own paper.

## 5. Notes and harness

- Harness: `fr4/harness.mjs` (per-paper walk), `fr4/extra.mjs` and `fr4/extra2.mjs` (targeted 1440 landings), `fr4/summarize.mjs`. Output: `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-528/` (`<paper>-<width>.json`, `extra-1440.json`, `extra2-1440.json`, `shots/`). All browsers were headless and closed by the scripts. The dev server was not touched.
- Not walked: sheet-row presses at 390; a Brief paper (none in the seed with an open inquiry at this tree — 524-d carries medium confidence for that reason); Cedar's `Waiting on` and tour-note mounting.
- Letterhead at 390 on proposal and relationship papers (Direction, the Ashfords) prints at the top of the paper **and** its acts repeat in More; on project papers (Chen) it folds into More alone. Recorded, not ruled: it may be the intended proposal-paper letterhead; if not, it is a second doorway and belongs with Fix 7.
- Second-pass raw values (`extra2-1440.json`): Direction press → `/drafting/d0c1…00b2?land=gap`, active `BUTTON "+ Add Room"` (9 s wait; Esc there stays on `+ Add Room`, no put-down — a different page). Aspen → `TEXTAREA` placeholder `A quick note to Client User…`, box text `… It lands in Client User’s portal messages. SEND CANCEL`, `Waiting on the client: 2 decisions overdue — oldest due 2 October`; after Esc the textarea is still active and present. Olsen → one dialog (`Orders · Receiving`), buttons `… TRACK IT · NOTIFY VENDOR · open document →`; Pieces head `FILE THE CLAIM[inked] · RECORD A CHANGE[secondary]`; paper controls matching /claim/: `FILE THE CLAIM`, `FILE THE CLAIM`, `File the claim`. Halloran → `BUTTON "NA-2026-077"` aria `Open the order, PO NA-2026-077`. Cedar Install region acts: `BILL 4 UNINVOICED[secondary] · ASK THE MAKER FOR A DATE[primary, held] · ADD THE MAKER[tertiary] · RECORD A CHANGE[secondary] · ADD THE FIRST TASK[primary] · + FILE[primary] · ADD TO THE PUNCH LIST[tertiary] · HOLD A WINDOW[secondary] · CLOSE THE BOOK[inked]`.
- The `/drafting/{id}` route took more than 6 s to arrive on first open from the band; a dev-server compile is the likely cause, but if the real paper shows the same pause, the band press needs a pressed state so the designer knows it took.
