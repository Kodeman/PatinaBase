# Memo — Lens: Information architect (what belongs on a Desk project card)

## 1 · Findings on the screenshot's card

**F1 (high) — It answers "what is this?" when the only useful question is "what does this want from me?"** Name → client → status is an identity hierarchy. Leah knows her sixteen jobs by name; she does not know which one is bleeding. The most emphatic element (Playfair name) carries the least decision value; the pulse line — the only line that changes her next ten minutes — is smallest and last.

**F2 (high) — "1 · Client: Kody" is two defects.** The leading `1` is a row ordinal leaking onto paper; nothing in `document_state` justifies it. `Client:` is a field label, not prose — and the repo already refuses the word: `clientOf()` in `desk-roster-derivation.ts` drops the name entirely when its last word is a placeholder role noun (`client`, `user`), precisely so the Desk never says "Client". **Rule: delete the ordinal, delete the label. Print `Kody Kochaver` bare.**

**F3 (high) — "Presented / Approved / In Production / Installed" is not Patina's vocabulary and is not derivable.** The real sections are brief · discovery · direction · proposal · project · install · care (`ROSTER_STAGE_ORDER`), and they are not a pipeline a job walks — a relationship in `care` is not "past" install. A four-step rail invents a funnel, implies a percentage, and is a dashboard device the vision forbids. **Rule: cut the strip. One stage word survives.**

**F4 (high) — Four incompatible grammars in one grid.** "Waiting on Kody for 30 days" (person + duration), "Proposal pending 44 days" (noun + duration), "Working on Concept — Room / 1 pending" (activity + fragment), "Sample, chosen 43 days" (unparseable). No rule is learnable, so she reads every card instead of scanning. The codebase already has one grammar; the screenshot isn't using it.

**F5 (high) — Day counters are doing work dates should do.** "44 days" is a magnitude, not a deadline. `desk-derivation.ts` states dates (`— oldest due 3 Sep`, `Sent 1 Sep`) and reserves counts for genuinely-elapsed cases.

**F6 (high) — Nothing says whose hand it is in.** `NeedLine.owner` (`'client' | 'designer' | 'maker'`) exists and is unrendered. It is the highest-value unused field on the Desk: the difference between "I must act" and "I am correctly waiting."

**F7 (med) — No act.** `NEED_ACTION_LABELS` gives every need kind an act; the roster prints it. Dropping it turns two-second triage into click-and-read.

**F8 (high) — Fifteen cards, fifteen equal weights.** An overdue install gets the same footprint as a quiet Care job. The roster solved this with sort tier + a 7px mark; a grid must solve it again or it regresses.

## 2 · Recommendation

**The two-second question: "Does this want my hand now, and for what?"** Everything else is context for afterward.

**Order:** (1) **stage word + need mark** — DM Mono 11px uppercase on the stage plate (`DIRECTION`), 7px mark at the pulse line's left margin (terracotta-ink urgent · clay quiet · hairline ring none); (2) **name** — Playfair 20px, oak underline, wraps; (3) **whose hand** — DM Mono 11px, one word, same baseline as the stage: `YOUR PEN` · `WITH CLIENT` · `WITH MAKER` · `RESTING`, straight from `need.owner` (no owner but a need → omit the word, never guess; `RESTING` only where there is no need at all); (4) **the pulse line** — Inter 14px muted, exactly one sentence from `need.text` or `chip.text`; (5) **the act** — DM Mono 13px uppercase, oak-scored, right on a dotted leader, from `need.actionLabel`, falling back to `Open the job`; (6) **client name** — Inter 12px faint, last, bare.

**Dropped:** *budget* — not in `document_state`, cannot be shown honestly (the one real money fact, `$17,500 overdue`, already lives inside the pulse line); *progress bars* — no honest denominator; `installed_count / item_count` is a procurement ratio, and a bar would fabricate a percentage; *item counts* — answers nothing at triage, lives in the Document; *standing day counters* — see below; *stage strip* — F3; *the `1 ·` ordinal* — F2. *Client name* survives, demoted and delabeled: it disambiguates same-named jobs, it never drives the decision.

**Time, honestly.** State the **date** wherever the need has a `dueOn` or a provenance date — she can compare a date to her week. State an **elapsed count** only where a promise is already broken (`Overdue 6 days — …`, the existing `overdueElapsedPhrase` shape) or where the span *is* the fact (`sent, unopened 3d`). Never both. **"Waiting on Kody for 30 days" is nagging; "1 decision overdue — oldest due 3 Sep" is information** — the first indicts a person, the second names a promise. Age with no promise attached earns no line: a Care job untouched 200 days is fine.

**Eight pulse lines (fixture-real):**

1. `overdue_decision` — **Vandersteen** · `1 decision overdue — oldest due 3 Sep` · WITH CLIENT · *Review decisions*
2. `overdue_invoice` — **Sonnenberg residence** · `INV-0412 · $17,500 overdue — oldest due 12 Aug — send a reminder` · WITH CLIENT · *Send reminder*
3. `hesitating_proposal` — **Halvorsen townhouse** · `Opened 3× — last 7 Sep, no signature yet` · WITH CLIENT · *Follow up*
4. `new_lead` — **Marcus Wright** · `New lead — respond by 10 Sep` · YOUR PEN · *(triage bar, no footer act)*
5. `schedule_conflict` — **Vandersteen** · `Delivery lands after the install week` · YOUR PEN · *Resolve the schedule*
6. `po_unacknowledged` — **Sonnenberg residence** · `PO-118 sent — no acknowledgment` · WITH MAKER · *Follow up with the maker*
7. `schedule_unconfigured` — **Reinhardt lake house** · `Anchor the install week` · YOUR PEN · *Open the schedule*
8. `task_due` — **Cedar Lane Study** · `Task due — mark up the two rooms Nora replied on` · YOUR PEN · *Open the task*

Grammar rule: **[subject or figure] — [dated fact or required act]**. One em dash maximum, sentence case, no second clause, tabular numerals.

**The idle card** says one thing and stops: `Quiet — nothing needs your hand` (Inter 14, faint), act *Open the job*, no mark, no owner word, no date. Paused says `Paused`. A quiet card must read visibly lighter — it is the proof the Desk is honest.

## 3 · Shape

24px module; 24px padding; `--paper-doc` face on `--paper` ground; 1px `--rail` hairline; radius 2px. Depth from value contrast only. Stage plate = small filled chip, white label, top-left. Hover: hairline strengthens to `rgba(44,41,38,.14)`, name's oak underline thickens — no lift, no tint. Focus: 2px clay-ink ring on the card. Press: 1px baseline shift on the act alone. Whole card links to `/doc/{engagement_id}`; the act is a nested 44px target with its own href (deep link / ledger).

Three columns ≥1280, two at 1024, one below 720. At 390px the card is a full-width strip and the act drops under the pulse line; nothing truncates. **At 15 jobs** it is one screen. **At 45 it fails flat** — cards must group under the same seven stage plates, needs-first within each group (`needSortKey`'s tiers), headings never folding, nothing folded on first paint.

## 4 · Contract

Honored: D4 (no shadow, no lift, no elevation token), D1, no badges (one mark, two tones, no count), no red/green, wrap-never-truncate, tabular numerals, 44px targets, act tiers — every card act is tertiary oak-scored; no card carries a terminal filled act, because money and signatures happen inside the Document.

**One knowing departure: "never a card."** Kody overruled it, so the card pays the rule's rent instead of ignoring it: one need line per card, never a list (the "one thing" invariant survives); grouped under the same stage plates, so the grid is the roster's rows given a second dimension, not a new information model; nothing folded, no expand, no hover-reveal. "No dashboard, no engagement metrics" holds because nothing on the card counts activity — every line is a promise or a state.

## 5 · The risk for Kody to rule on

**Does a card grid make the quiet 80% louder than the roster did?** A quiet Care job costs one roster line but a whole tile. At 16 jobs with 1 overdue, ~94% of the grid's area goes to work needing nothing — the "optimize the studio surface for engagement" failure arrived at by geometry rather than intent. Two ways out: **(A)** cards for needs only, the quiet remainder as one roster strip below ("Twelve jobs are quiet — Osterberg, Reinhardt and 10 more"); **(B)** every job gets a card, but a quiet one is a half-height tile with name + stage + `Quiet`. I recommend **(A)** — it keeps the Desk's ranked truth and makes the card earn its area. But it means the grid is not the whole studio, and Kody should say plainly whether that is acceptable.
