# Synthesis — the Agreement Room, reconsidered

Seven seats, 240 findings, one fixture: the Okonkwo house. This settles the
room's defects, the three directions built, and every word the specimens share.
`specimens/SPEC.md` is the build contract that follows. Deck working title:
**The Paper, Under the Pencil** (§9).

---

## §1 · Verdict on today's room

Kody said the preview is too thin. The panel agrees it is thin and disagrees
that thinness is the defect. Each defect's path out is settled in §3 and §5.

| # | The defect | Seats | Path |
|---|---|---|---|
| 1 | **The third rendering.** The nine parts are drawn three times at once — a 260 rail, a heading over one editor, a 280 paper. `compact` drops the paper's own `max-w-[720px]`, and the act meant to relieve it is a 640 sheet *narrower than the paper*: in `preview-sheet-1440.png` it clips at *Furnishings deposit* while the aside behind it runs to the signature blocks. **The wide act shows less than the narrow column.** | ED-27/28, IA-8/9/39, TY-22/23, LH-5/19/34, AX-23, FS-32 | `service-agreement-preview.tsx:101` |
| 2 | **The count lies; the page never speaks.** It counts *parts carrying blockers*, and the fee-floor and client blockers belong to no part — so the resting plate prints `0 OF 9 PARTS NEED ATTENTION` above two sentences that refuse the send. It prints twice, word for word. No `aria-live` exists anywhere in the composer. | IA-3/4, LH-1/2/9/11, AX-1/2/22, ED-32, FS-12 — §6 row 2 generalised | `readiness.ts:541-553` |
| 3 | **The paper is hidden below 1180 — and so is the send.** Both the live paper and the room's only `Review & send` trigger are `hidden min-[1180px]:block`. **There is no way to open the send sheet at 1024 or 390 in the shipped product**; the capture lane had to resize a sheet opened at 1440. | ED-31, IA-10/29, TY-24, LH-22/30, AX-8, FS-11/29 | `room-shell.tsx:155` |
| 4 | **The destructive act is dressed as the mildest thing on the page.** A `variant="secondary"` box between *Preview* and *Save* discards every part on first press — no confirm, no sentence, no undo. Nor is the return lossless: `flat`, `per_phase`, `percent_of_cost`, `draws` and `allowances` reach the money row not at all, so the Concept fee vanishes silently. | ED-8, IA-16/19, LH-26/27, AX-9 (3.3.4), FS-23 — §6 row 7 | `agreement-composer.tsx:637-648` |
| 5 | **The save drops the caret; "Saved" is not an act.** DELETE-then-INSERT mints a new uuid per part and the editor is keyed `selected.id`, so every save remounts the editor you are typing in — `reviewAndSend()` does it behind the sheet. The loudest control on the page is a native-`disabled` `Saved` at **1.20:1** on its own fill. | ED-5/6/9/10, IA-5, LH-3/7, TY-20, AX-4/29, FS-15/26 — §6 row 8 | `agreement-composer.tsx:602-618` |
| 6 | **The send sheet promises a paper it has not read.** Six fixed things regardless of composition: it promises rates and a ceiling while, 200px lower, `FINISH BEFORE SENDING` says the agreement names no fee. `Ready to send · every contractual facet is present.` is a claim readiness cannot make — and the sheet is not even handed `parts`. | IA-20/21/22/23/24, LH-23/25, NO-7, FS-22 — §6 row 1 (N4) | `service-agreement-send-sheet.tsx:105-112` |
| 7 | **Type, fields, contrast.** Eight sizes doing the work of four, none a house step. The paper drops cents. One clause sets 13.6px charcoal on white in the field and 12.5px/1.75 mocha on paper *on the same screen*. Money fields re-round every keystroke: `$5,000.05` cannot be typed. Aged-oak carries the meta voice at **4.20:1**. | TY-1…35, ED-22/23, LH-33, AX-4/5/6, FS-8/10 — §6 row 4, six sites not one | `globals.css:13` |

---

## §2 · The criteria table

| Crux | A · paper is the page | B · builder as overlay | C · two panes | D · the galley |
|---|---|---|---|---|
| **i · money, body unforked** | only at the paper's measure — 208px holds none of the five money editors (FS-2) | no body risk, but 480px holds neither draws nor allowances (ED-43) | head and indent leave ~400px, *narrower* than today's 524 (FS-18) | unfolds beneath the printed part at the full 720 (ED-45) |
| **ii · keyboard reorder, add** | seams must survive keyboard and re-home the menu's index translation (FS-27) | rail whole, reorder free — but every placement is open→edit→close (ED-44) | menu kept, reorder free; placement still add-then-reorder (IA-30) | *Move up*/*Move down* on the head — two presses against five menu trips (LH-13) |
| **iii · 390px** | collapses into D: margin gone, editor full width (ED-41) | the paper is **gone** while the drawer is open (ED-44) | the paper becomes an errand behind an act (NO-12) | margins collapse; the note must leave the paper's ground or it leaks (NO-4) |
| **iv · readiness in place** | one band above the paper, needing its own register (NO-1) | homeless when the drawer shuts — four objects, two homes (ED-42) | at the column head, 36px away, still not naming the part (LH) | beside the seam where the fee would print (LH) |
| **v · where the acts live** | send on the page; return at the outline's foot; Preview retired (IA-15) | send on the closed paper; part-level acts behind the door (ED-42) | send on the page; Preview survives as the 390 route (NO-12) | send at the paper's foot; full read beneath; return at the outline's foot (IA-15) |
| **vi · R27 / R51** | **fork** as written — unless "in place" means the part's *place*, not its markup (FS) | **neither** — touches no body file; zero drift risk (FS) | **neither** — the paper stays its own column (FS) | **wrapper, cleanest of four** — editor beneath the section (FS) |
| **vii · what it removes** | the most: a rendering, the editor column, the aside, the sheet (IA) | nothing — every string survives inside a 480px drawer (IA) | one column and the 280 measure (IA) | nearly A's, re-spent on a notes column (IA) |

**Seat rankings.** ED `D>A>C>B` · IA `A>D>B>C` · TY `D>A>B>C` · LH `D>A>B>C` ·
AX `D>C>B>A` · FS *(by cost)* `C>B>D>A` · NO `C>B>A>D`. Scored across A/C/D
only (3·2·1, seven seats): **D 17 · A 13 · C 12.**

**The built set is D, A and B** — B by Kody's ruling, D and A as the two
highest-ranked of A/C/D. A beats C by one point, so the reason must be argued:
both seats putting C first do so on grounds the program neutralises.
Feasibility ranks explicitly *by cost* and concedes C's weakness is "the one
risk a specimen can settle by eye"; Nora ranks for separation, and NO-4 is now
binding on all three specimens. On the cruxes C is last on (i), (ii), (iv) and
(vii), Leah's walk of C costs 53 presses against today's 54, and C's own crux
concedes it "may stay clunky". **C gets one deck sheet.**

---

## §3 · The three directions as they will be built

### D · The galley — `direction-1.html`

One column at the paper's own 720px measure between two thin margins: an outline
left, marginal notes right. Parts render read-only through the real body;
selecting a head unfolds its existing editor **directly beneath its own printed
form**, one open at a time, so the printed form stays on screen while you write.
Reorder is *Move up*/*Move down* on the head; `+ Add a part` at every seam; the
640 sheet retired for a full read.

| crux | D |
|---|---|
| i · money | unfolds at the galley's full measure — 720 / 664 / 358. **No margin editor exists in D.** |
| ii | two acts on each head; seam acts persistent, never hover-revealed; the fold keys on `partKey`. |
| iii | outline folds to a head disclosure; the note becomes a `--rail` studio strip with its own running head (NO-4). |
| iv | one permanent status sentence above the paper; part-scoped blockers print in the right margin beside their own seam. |
| v | send at the paper's foot, the full read beneath it, return at the outline's foot with a hold. |
| vi | wrapper — the editor sits *beneath* the section, body untouched. Needs one export: `AgreementPartSection` + `partDrawsNothing`. |
| vii · removes | the rail, the editor column, the compact aside, the 640 sheet, one of two counts, the three-box act row, the client-account block. |

**Cost L**, assuming the proof stays an overlay at the paper's measure, not a
route (FS-13). **Risk:** scroll anchoring on unfold has no ambient guarantee
(FS-19, AX-19), and the export must report that a part drew nothing or an
unwritten part has no fold (FS-5, FS-6).

### A · The paper is the page — `direction-2.html`

The client's copy at 720px *is* the page. Selecting a part **replaces its
printed form with its editor, in the part's own place** — the substitution D
refuses. A left outline carries the names; a right margin carries readiness and
nothing else; `+ Add a part` at the seams.

**A's money-part answer, decided here.** The margin holds **no editor at all**;
every editor, prose and money alike, takes the part's own place at the paper's
full measure. FS-1/FS-2: editors are keyed to the *viewport*, not the container,
and the five money grids assume ≥500px, so a 208px margin editor is a rewrite of
five to nine editors, not a placement. ED-41: a margin editor forks A into two
models, splitting the fixture's ten parts 6/4. With one model, the only thing
separating A from D is worth comparing: **A takes the printed form away while
you edit it; D keeps it above your hands.**

| crux | A |
|---|---|
| i · money | the money form takes the part's place on the paper: 720 / 712 / 358. |
| ii | as D — persistent seam acts, *Move up*/*Move down* on the head. |
| iii | one column; the readiness band above the paper on `--rail` with its own running head (NO-1). |
| iv | the right margin carries the readiness sentence and part-scoped blockers; at 1024 and 390 it becomes that band. |
| v | as D. Preview retired — the paper has been on screen all morning. |
| vi | wrapper, **because in place means the part's place, not its markup**: the chrome renders the section *or* the editor, never both, and never asks the body for a slot. |
| vii · removes | everything D removes, plus the marginal-notes column. |

**Cost L** — FS row A's own collapse from XL: "if A's money editors move onto
the paper's own measure … A collapses to L". **Risk:** the substitution itself —
the sentence being rewritten is the one sentence not on screen (LH); and an
unwritten part draws nothing (R21, FS-6), so A must draw a studio-only rest row
for a part the paper omits (ED-40).

### B · Builder as overlay — `direction-3.html`

The paper is the page. `Edit the parts` opens a non-modal drawer flush left
holding today's rail and editor; the paper stays in the document flow, visible,
scrollable and updating at 1440. At 390 the drawer is a full-screen sheet with
`Back to the paper`.

| crux | B |
|---|---|
| i · money | rebuilt as a **single column inside the 480px drawer** — label above field, one field per row, the rate right-aligned to the drawer's own rule. Never `minmax(0,1fr)_140px`, which leaves ~200px for a role name at 480 (ED-43, FS-2). A rewrite of the rate card, stated rather than hidden. |
| ii | `parts-rail.tsx` survives whole, so reorder is free; placement stays add-then-reorder. |
| iii | full-screen drawer; **the paper is not visible while you work.** B's honest cost, drawn rather than argued. |
| iv | one studio band above the closed paper carrying the readiness sentence and the document notes; part-scoped blockers read inside the drawer only, and the readiness sentence names the part whenever the count moves (B's answer to FS-30). |
| v | send at the closed paper's foot; `Edit the parts` above it; return at the page foot, quietest tier. |
| vi | neither wrapper nor fork — **B touches no body file at all.** Its decisive engineering advantage. |
| vii · removes | the least: nothing deleted, only relocated behind a door. |

**Cost M** for design services, **L** if turnkey must edit inside the drawer.
**Risk:** `DocSheet` is a modal — `aria-modal`, focus trap, scroll lock, 55%
veil (FS-3) — so B needs a `DocDrawer` that does not exist; and `.doc-elevated`
*is* a `box-shadow` (FS-4), so the specimen draws its own edge: **1px
`--ink-faint` plus a `--rail` ground change, no veil, no shadow.**

---

## §4 · C, for its one deck sheet

Rail and editor fuse into one ~580px accordion beside a 720px paper — the least
change and the only direction with a working in-repo precedent,
`facet-section.tsx`: 125 lines of controlled `aria-expanded` with
`hidden`+`inert` and mount-once-then-hide (FS-18), the one mechanism this room
most needs and lacks (ED-38). Not built, for three agreed reasons: its stated
precedent is not this room's — the seven-facet room is a flat, always-open
section (ED-36); `facet-section.tsx` as it stands imports six house-sheet
violations (ED-37); and it does not solve the defect — Leah's walk costs 53
presses against today's 54 and the accordion leaves the rate card *narrower*
than the 524 already complained of. Its one advance is adopted by D and A.

---

## §5 · The shared treatment — every string, final

Fixture: the Okonkwo house, client account **linked**, Role rates **unwritten**,
Ceiling **unset** (note at the end).

**Title block.**

```
DESIGN SERVICES AGREEMENT · V1        .t-head, --ink-subtle
Dave Okonkwo                          .t-d2, the page's only h1
DRAFT                                 .t-head, --ink-subtle
```

Three title states, because `recipientName` is `undefined` and `recipientEmail`
`null` when unset and no copy was written for the third (FS-24): named →
`Dave Okonkwo` · email only → `dave@okonkwo.test` · neither →
`A draft with no client yet`. The **paper keeps its own headline**, `Okonkwo
house — design services agreement`: the reduction is page-only and
`proposals.title` has no rename RPC (FS-33). The page names the person, the
paper names the house.

**Prepared-for line.**
`Prepared for Dave Okonkwo · dave@okonkwo.test — Change the client account`
— the act is `.act--inline`, `aria-disabled="true"`, `aria-describedby` at the
visible reason `Only the agreement owner can change the client account.`
Unlinked: `Prepared for no one yet — Link a client`.

**The Save record (§A5 "taken").** No Save control anywhere; one dated line in
its place. Resting `Saved 10 September 2026, 5:36 am` · clause `… · Services
not yet saved` · money `… · Role rates not yet saved`.

**The readiness voice** — one sentence in one `role="status" aria-live="polite"`
region, present at load, never removed, counting **things to finish**, not
parts.

| moment | sentence |
|---|---|
| resting · clause | `One thing before this can go: name a fee.` |
| money | `One thing before this can go: name a ceiling.` |
| the transition, when the count moves | `Role rates name the fee. One thing left: name a ceiling.` |
| two outstanding (specified, shown in no state) | `Two things before this can go: name a fee; link a client.` |
| nothing outstanding | `Nothing left to finish.` |

It never empties, so §A10 is honoured by the region always having something to
say.

**Marginal notes**, verbatim from `readiness.ts`:

- `This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.` — `:490`, beside the Role rates seam, in **resting** and **clause**.
- `An agreement that bills hourly needs a ceiling. Add a Ceiling part, or remove the role rates.` — `:529`, beside the Ceiling seam, in **money**.
- `Link a client with an email address.` — the client blocker, unlinked variant only.

**NO-4 binds all three.** These and the readiness sentence are studio chrome and
sit visibly outside the paper's own type and ground at every width including
390: `--rail` ground, a 2px `--clay-ink` leading rule (5.61:1 on paper, 4.70:1
on rail — AX-5's own proposal), a `.t-head` running head reading `THE STUDIO`.
Never inline in the paper's flow, and never in the paper's ground.

**Review & send**, on the page at every width. Consequence sentence directly
above the terminal act, in every state including unavailable, composed from the
client-visible parts actually written:

> `Dave Okonkwo receives the six parts this agreement has written — the services, the deliverables, the exclusions, the $5,000.00 retainer, the monthly billing cadence and the terms — and his signature preserves consent; nothing is billed and no work is authorized until the studio countersigns.`

In the money state the same sentence reads `the seven parts` and inserts `the
role rates,` after `the exclusions,`. The act is `.act--terminal`, label
**`Send the agreement · $5,000.00 retainer`**, `aria-disabled="true"` with
`aria-describedby` at the live blocker. Never `disabled`; activating it writes
the reason into the status region and moves focus to the unmet part.

**The return act** — label unchanged pending AM-1: `Return to the seven facets`.
`.act--tertiary`, the quietest act on the page, at the foot of the outline (D,
A) or the page foot (B), never in an act row beside Preview. Consequence
sentence above it, in every state:

> `This takes away the nine parts you have written and puts the seven facets back in their place; the money already recorded on the agreement does not change, and a part with no facet to return to — a flat fee, a per-phase fee, a draw schedule — does not survive it.`

Confirm: §F-G's canonical hold, caption directly under the act in `.t-meta` —
`Press and hold to return`.

**The send sheet**, composed for the **finished** fixture (ten parts, Concept
fee added, ceiling written, deposit unset).

| slot | after |
|---|---|
| sheet title | `Send design agreement` *(kept)* |
| eyebrow · heading | **cut** — a third classifier and a restatement of the title (IA-26) |
| consequence, above the act, every state | `Dave Okonkwo receives the nine parts this agreement has written — the services, the deliverables, the exclusions, the role rates, the $24,000.00 ceiling, the $5,000.00 retainer, the monthly billing cadence, the Concept fee of $2,400.00 and the terms — and his signature preserves consent; nothing is billed and no work is authorized until the studio countersigns.` |
| Recipient box | **cut** — the sentence names him (IA-24) |
| Furnishings deposit box | **cut**; unset, the caution slot carries `The furnishings deposit is not set. Authorizations will default to 50%.`; set, one clause inside the sentence (IA-23) |
| `Ready to send · every contractual facet is present.` | **cut** — readiness proves R4's floor, not completeness (IA-21) |
| `Finish before sending` + blockers | *kept*, verbatim from `readiness.ts` |
| `A note to the client · optional` | *kept*; the placeholder becomes a `.t-meta` line under the label: `A short personal note to accompany the agreement.` (IA-27) |
| `Send later` | → `Not yet` (IA-38) |
| `Send agreement →` | → `Send the agreement · $5,000.00 retainer`, `aria-disabled` with the blocker as its reason (IA-25) |
| `Record a signature received outside Patina` | *kept verbatim*, at the sheet foot under its own rule (IA-25) |

**"Every contractual facet is present" is deleted. N4 is closed.** *Facet*
survives on the studio's face in exactly one string: the return act's own label,
which is R24's.

**On the pinned fixture state.** The brief asked the money state to show three
role rates filled **and** the fee-floor sentence in place. Those cannot both be
true: `readiness.ts:469-475` clears the fee floor the moment a rate card carries
a set value, and `:503-530` fires the ceiling blocker instead. So the money
state carries the **ceiling** sentence, resting and clause carry the fee-floor
sentence, and Ceiling reads `Not yet set` in all three states so the blocker
stays live. The transition sentence answers LH-10 — the fee sentence never
vanishes with nothing in its place.

---

## §6 · Leah's re-walk, and the panel's pick

| Walk | Clicks | Scrolls | Mode switches | Minutes | "Where am I / did it save" |
|---|---|---|---|---|---|
| Today | 54 | 18 | 15 | 17m10s | **17** |
| A · paper is the page | **33** | **5** | **8** | **11m52s** | 3 |
| B · builder as drawer | 41 | 11 | 13 | 14m17s | 5 |
| C · two panes | 53 | 16 | 14 | 15m55s | 5 |
| D · the galley | 39 | 6 | 9 | 12m29s | **2** |

**The pick is D.** A is the faster run; D is the surer — two moments of doubt
against three, both of A's being the same complaint, in Leah's words:
"selecting a part *replaces* the printed part with its editor. That is the one
trade I do not want." D takes four of seven first places (ED, TY, LH, AX) and is
second on IA; the two seats not ranking it first rank on cost (FS) and on a leak
NO-4 now forbids everywhere (NO). The deck should say the tension plainly: **A
is faster, D is surer, and the difference is one sentence — whether the sentence
you are rewriting is still on the screen while you rewrite it.**

---

## §7 · Amendments asked

The SPEC builds the **compliant** version of each; the ruling sheet asks.

| # | Seats | The ask | What the SPEC builds |
|---|---|---|---|
| AM-1 | ED-50, IA-17, LH-28 — three seats independently | Rename `Return to the seven facets`. R24 fixes that the act exists, not what it is called, and it is the only *facet* on the studio's face (R7/R138). Proposed: "Put the parts away" · "Take the parts apart" · "Put this agreement back the old way". | **Label unchanged**, verbatim. The compliant version fixes what R24 does not: quietest tier, the outline's foot, a consequence sentence naming the loss, a press-and-hold confirm. A rename costs a second string — `composedElsewhere` repeats the label verbatim (IA-18). |
| AM-2 | TY-8 | Permit `.t-authorship` as a part heading; §A3 says it is "never a heading, never a control", yet `part-editor.tsx:113` and the paper's own `PartHeading` are both Playfair italic today. | **`.t-d3` roman** for every part head, the specimen's rendering of the paper's headings included — and one head per part, not two (FS-7). The amendment would legitimise the italic the shipped body already prints. |
| AM-3 | TY-25 | Step the page title to `.t-d3` below 480px; §A3 has no responsive steps. | The h1 stays `.t-d2` at every width. `Dave Okonkwo` sets on one line inside 358px; the ask was filed against an **email** title, which the treatment retires. |

No other seat filed one. The critic filed none by design and notes AX-10 reads
like an amendment and is not: `doc-sheet.tsx:80` contradicts `SPEC.md:356-357`,
and the code is what is wrong.

---

## §8 · Open items

**For the ruling sheet** — this program asks, it does not decide.

| # | Ask | Evidence |
|---|---|---|
| AR-a | Which direction ships. The pick is D; A is the live alternative. | §2, §6 |
| AR-b | The rename of the return act (AM-1), and whether `composedElsewhere` moves with it. | `agreement-copy.ts:46`, `:54-55` |
| AR-c | §A14 "Fields on paper" into the house sheet — pasted whole in SPEC §2. | `memo-typography.md` §3 |
| AR-d | Does the Preview act survive? D and A retire it for a full read; B and C keep it renamed. | IA-15, ED-47 |
| AR-e | Hide-a-part outside design-build; R39 gave the toggle to the turnkey lane only. | IA-32, LH-15 |
| AR-f | The studio band exceeds §A4's 1100px page measure — D's is 1200 (192+48+720+48+192) and §A4 governs a *client* page. Name a studio working band, or cap the margins. | `SPEC.md:158` |
| AR-g | **NO-8 — the paper never adds to one total.** Only design-build computes a sum; a design-services homeowner sees a ceiling (a cap), a retainer and a flat fee, each alone. Show a total, or say plainly none exists yet. | `agreement-parts-body.tsx:160-209` |

**For the "next" sheet** — carried, not decided here.

| # | Item | Evidence |
|---|---|---|
| N-1 | **FS-20 — the two TSX body renderers are a fork, not a shared import**: two apps, two types, their own `money()`, `isWritten()`, headings and section semantics. R27's "same body contract" is kept by copy constants, so no direction may promise "the same component" — only *the same sentences and the same drop-a-silent-part rule*. A third pair §6 row 6 does not name. | designer `:6-8`; client `:14-16` |
| N-2 | **TY-9 — the seven type steps and `.t-money` do not exist in this portal**; a parallel `.type-*` scale ships instead, `.type-meta-small` at 10.08px. | `typography.css:106-125` |
| N-3 | **AX-7 — `maximumScale: 1` blocks pinch-zoom portal-wide** (1.4.4, one line). Until it goes, no 390 claim here is testable on a phone. | `layout.tsx:37-41` |
| N-4 | **AX-10 — `doc-sheet.tsx:80` filters `aria-disabled="true"` out of the focus trap**, so a rule-#8-compliant Send inside a sheet is unreachable by Tab. Binds every direction. A defect, not a ruling. | vs `SPEC.md:356-357` |
| N-5 | **W3R2-06 — the turnkey room keeps design-services chrome**; the rename affordance never landed and `proposals.title` has no rename RPC, so a stale title still reaches the keepsake footer. | `waves/w3/wave-report.md:173`, `:184` |
| N-6 | **AX-4 — the moment `disabled` becomes `aria-disabled`, 1.20:1 becomes a live AA failure.** Adopt §A5's `--ink-faint` on `--rail` (5.32:1) in the *same* change. | `button.tsx:29-30` |
| N-7 | **FS-25 — no per-part autosave without a projection-idempotence test.** Services projects into `scope` and `materialize_standard_parts` seeds it back *from* `scope`. | `00575_agreement_parts.sql:2942-2946` · `:3073` |
| N-8 | **FS-26 — fold, open and focus state keys on `partKey`, never `id`.** A bug in three of four directions if missed. | `agreement-composer.tsx:602-618` |
| N-9 | **FS-14 — two suites snapshot the whole composer tree** (10 calls, 3,111 lines). Replace with named assertions before a build wave. | `…library-off.test.tsx.snap` |
| N-10 | **ED-22 — `$5,000.05` cannot be typed into the Retainer**; `toCents` re-rounds every keystroke with no transient text state. | `part-kinds.ts:367-373` |
| N-11 | **NO-9 / NO-10 — the homeowner's words.** "fully executed" is shorthand Nora would not follow; `composedElsewhere` must never reach her copy. | `agreement-copy.ts:19-20`, `:54-55` |
| N-12 | **§6 rows 5 and 6 stand:** M5, and the SQL-keepsake-vs-TSX pair with M4 and N-i — visible in the plates, where an unset rate card prints `Recorded with your agreement.` and R21 says it should print nothing. | `PROGRAM-REPORT.md:221`, `:265`, `:300` |
| N-13 | **W3R3-03** is closed by the shared readiness voice, but only for the three built directions. | §6 row 2 |

---

## §9 · Working title

**The Paper, Under the Pencil** — a noun phrase in the house's register, the
same comma-turn as *The Agreement, Composed* and *The Invoice, Standing Alone*,
naming the argument rather than the category: the paper stays where it is, and
the pencil comes to it.
