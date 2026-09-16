# Panel brief — the shared charge

Every seat reads this file. Read it before your own named files, and before
`current-state.md` §6.

---

## 1 · Kody's ask, verbatim

Kody, 2026-09-10, with a production screenshot of `/drafting/<id>` attached:

> This agreement build is great, but the interface is a bit clunky. Have a UX UI team look at the current interface and propose a direction to make this build more concise and straight forward. The preview down the side is too thin, maybe it doesnt belong on the same page as the builder? Maybe it is the page and the builder is more of an overlay? have the team propose a new direcion in an html presernation.

## 2 · Kody's three rulings for this program (interview, 2026-09-10)

1. **Three comparable directions**, built to the same depth; the deck compares
   them and names the panel's pick.
2. **Evidence** = his screenshot + the source + house sheet/rulings + a
   best-effort local production build of a seeded draft agreement rendered at
   1440 / 1024 / 390. No prod access.
3. **Scope** = the composer page and its "Preview client copy" sheet, **plus**
   the Review & send sheet and the "Return to the seven facets" act. One pass
   ends the facet vocabulary on the studio's face.

## 3 · The program's stance on governance

**Governance is context, never a veto — an element a ruling forbids may be
proposed only tagged `AMENDMENT-ASK`, and it routes to the deck's ruling sheet,
never into a specimen.**

Reviewers reject any specimen element resting on an unmade amendment. If your
strongest idea needs a ruling overturned, say so plainly, tag it, and design the
compliant version too.

---

## 4 · The seven cruxes

All four directions are judged on the same seven. Verbatim from the plan:

> (i) form-on-paper for money parts (rate card with three roles, ceiling,
> retainer) without forking the body; (ii) keyboard reorder and add-a-part;
> (iii) 390px; (iv) readiness in place — where "2 of 9 parts need attention"
> and the fee-floor sentence live; (v) where the acts live (Save/Saved, Review
> & send, Preview, Return to the seven facets, Client account); (vi) the
> R27/R51 same-body promise; (vii) what it removes.

---

## 5 · Vision

From `docs/vision/VISION.md:50`:

> **To the studio:** *you won't notice Patina.* It is not a place you go. It
> prompts and collects information when and where you need it, then gets out of
> the way. Success is that she doesn't notice — so we will never optimize the
> studio surface for engagement.

From `docs/vision/VISION.md:52`:

> **To the homeowner:** *you're engaged every day, and you and your designer are
> looking at the same agreed direction.* Fewer surprises. The decision record is
> the relationship.

From the agreement proposal,
`artifacts/agreement-composed-2026-09-06/proposal.html:2169`:

> **Promise** — the studio won't notice Patina. This room gets faster, not
> louder.

---

## 6 · House sheet — the ten rules

Source: `docs/design/house-sheet/SPEC.md` (1005 lines). Read **§A** in full.
**Where the body of §A–§E and §F disagree, §F wins** (`SPEC.md:7`, `:903-910`).

| # | Rule | Anchor |
|---|---|---|
| 1 | **Three families only** — Playfair Display (display) / Inter (body) / DM Mono (meta). | §A2 · `SPEC.md:109-125` |
| 2 | **Seven type steps, named classes** — 34 / 26 / 20 / 16 / 14 / 12 / 11, plus `.t-authorship` (Playfair italic at `.t-d3`) and `.t-money` (DM Mono 15, tabular). "Nothing else. No inline `font-size`." One family per figure. | §A3 · `SPEC.md:126-151`; `.t-money` amended §F-B (`:143`) |
| 3 | **Rhythm and radius** — 24px vertical module (gaps 24 / 48 / 72 / 12 only); page measure `max-width: 1100px` centred at ≥1200px, prose capped at 65ch; radii `2px` / `3px` (`50%` for the 7px mark dot alone); hairlines 1px `--hairline`, `--hairline-strong` for a money or totals rule. | §A4 · `SPEC.md:153-162` |
| 4 | **No shadows, no truncation** — "`box-shadow` must not appear in any specimen file"; "`text-overflow: ellipsis` must not appear. Wrap." | §A4 · `SPEC.md:161-162`; gate §A13 · `:585-588` |
| 5 | **The Do-not list** — no pills · no status dots · no badges or count chips · no ✓ glyph · no spinner ("No ring, no dots, no `@keyframes spin`") · no green success fill · no olive · no placeholder text · never `opacity: .5` on a state. | §A5 Loading · `SPEC.md:362-372`; §A7 · `:421`; §A13 · `:585-588` |
| 6 | **Scored Ink action tiers** — tertiary: a scored word with a resting oak rule. Secondary: the two-score word. Terminal: filled charcoal, only where money moves or a paper is signed, carrying the amount in its own label. Inline is a fourth placement, not a fourth tier. | §A5 · `SPEC.md:164-335`; tertiary `:201-210`, inline amended §F-D `:211`, secondary `:240-249`, terminal `:250-289`, label type amended §F-C `:267`, focus `:290-310`, pressed amended §F-E `:311`, taken `:373-378` |
| 7 | **The consequence sentence** — one sentence, directly above the terminal act, present in **every** state including unavailable, saying what the act does *and* what it does not do. 15px is "the floor. Never smaller." After the act, the same slot carries the dated record line. | §A6 · `SPEC.md:379-395` |
| 8 | **`aria-disabled` — never `disabled`** — the control stays focusable, with `aria-describedby` pointing at the visible reason; activating it moves focus to the unmet input and writes the reason into the page's `role="status"` line; it never silently does nothing. The gate greps for the string. | §A5 · `SPEC.md:336-361`; gate §A13 · `:582` |
| 9 | **A region with nothing to say renders nothing** — "no heading, no rectangle." A room with nothing standing gets a name, a floor line and one sentence, not an empty box. | §A10 · `SPEC.md:476-509`, esp. `:506-508` |
| 10 | **The 11px floor and the wordmark** — `.t-head` at 11px is the smallest step and there is nothing below it; the PATINA wordmark is forbidden **inside a client page** and kept on the designer's own surface (Specimen 2's bottom bar). | §A3 · `SPEC.md:136` + `:150`; §A13 Wordmark · `:583`; §D · `:749` |

Two further house-sheet items the specimens will be gated on: the specimen frame
and state switcher (§A12 · `SPEC.md:534-570`) and the full gate table
(§A13 · `:571-588`).

**§A14 "Fields on paper" does not exist yet.** The typographer's seat writes it.

---

## 7 · Vocabulary

**R7 / R138 — the words.** From
`artifacts/agreement-composed-2026-09-06/build/rulings-2026-09-06.md:13`:

> **R7 · Names** — Agreement · Part · Library · Template · Addendum. Never
> "clause library" / "contract builder" in the studio's face.

R138 (`docs/design/the-document/DECISIONS.md:10749-10757`) restates it in the
same words and settles that the Agreement Library is studio-scoped, not
per-user: "The words are **Agreement · Part · Library · Template · Addendum** —
'clause library' and 'contract builder' stay out of the studio's face (R7)."

**R38 — no ruling ids in the studio's face.** From `rulings-2026-09-06.md:75`:

> **R38 · No ruling ids in the studio's face (walk W2R2-09).** The chip reads
> "record only" — never "(R9)"; the rulings file is where ids live.

R38 binds specimen faces absolutely: no `R\d+`, no `W\dR\d`, anywhere a designer
can read.

---

## 8 · The agreement rulings that bind layout

All quoted from
`artifacts/agreement-composed-2026-09-06/build/rulings-2026-09-06.md`.

| Ruling | Line | What it binds |
|---|---|---|
| **R4 · The floor** | `:10` | "Parties, signature block, one typed money part for a class that bills; a ceiling part is required whenever a rate card is present. Everything else removable, Exclusions included." |
| **R21 · "Not yet set" survives composition** | `:38` | "The composed homeowner body never prints `$0` or `0%` for an unset money part; it prints today's 'Not yet set' … Empty clause/list parts render nothing, not a naked heading (R3-6). The R4 floor reads only client-visible money parts (R3-3)." |
| **R24 · Composition is reversible** | `:45` | "The composed room offers 'Return to the seven facets' (draft only, studio side) calling `discard_agreement_parts`; the seven-facet room's `agreement_composed` notice names that act." |
| **R27 · One copy constant, both surfaces** | `:48` | "Designer preview and client body read the same 'Not yet set' constant from `packages/types` (`AGREEMENT_PART_COPY`), and the designer's live preview renders through the same body component contract as the client, so the first composed agreement cannot drift." |
| **R33 · Only client-visible fee parts project** | `:67` | "A `schedule` part with `client_visible = false` never projects into `proposal_service_terms` or the authority; readiness names it ('This fee is hidden from your client, so it cannot bill.')" |
| **R39 · Hiding a part gets an act in Wave 3** | `:76` | "the designer lane of Wave 3 adds the 'hidden from your client' toggle on a part, with readiness copy already in place." |
| **R48 · The price is never hidden** | `:92` | "A `pricing_basis` part is always client-visible: the composer has no hide act on it, `upsert_agreement_parts` refuses `client_visible = false` for `pricing_basis` (and for `draws`)…" |
| **R49 · No double count gates the send** | `:93` | "The supervision-fee-vs-sub-markup rule is a readiness blocker named in the rail, evaluated over the pricing-basis part and every sub-disclosure clause, and it disables Send until resolved." |
| **R51 · The studio previews the paper** | `:95` | "Under closed book the studio's live preview renders the redacted projection exactly as the door does (R41); the studio's own cost view lives in the editor, not the preview." |

---

## 9 · Banned words

Grep, case-insensitive, on deck and specimen faces. Verbatim from the plan:

> `clause library`, `contract builder`, `wizard`, `dashboard`, `AI`, `badge`,
> `pill`, `chip`, `modal`, `toast`, `spinner`, `facet` (on any studio-facing
> string in a specimen except the return act's own label, which is R24's — the
> panel may propose renaming it as an AMENDMENT-ASK), `live` inside the paper,
> `Patina` inside the paper above the colophon; specimen faces additionally
> `builder`, `composer`, `preview panel`, any `R\d+` / `W\dR\d`.

These bind **faces** — the words a designer or homeowner reads. Your memo's own
prose may name any of them when discussing the thing.

---

## 10 · The finding line format

Every memo carries a findings table with exactly these columns:

```
ID | P1–P3 | confidence | surface | claim | evidence | proposed change
```

- **ID** — your seat's prefix plus a number (e.g. `ED-1`, `IA-4`, `TY-2`,
  `LH-7`, `AX-3`, `FS-1`, `NO-2`).
- **P1–P3** — severity. P1 blocks a direction; P2 must be fixed or ruled out in
  writing; P3 is a nit.
- **confidence** — high / medium / low. Say low when you are unsure; low-
  confidence findings are wanted.
- **surface** — composer page · rail · editor · aside · preview sheet · send
  sheet · return act · seven-facet room.
- **evidence** — a `path:line`, a house-sheet §, a ruling id, or a named region
  of `kody-screenshot.png`. No claim without one.
- **proposed change** — one sentence. If it needs a ruling overturned, prefix it
  `AMENDMENT-ASK:`.

**Report EVERY finding — severity filters depress recall.** Do not pre-filter to
"the important ones". Synthesis filters; you do not.

### The cold-findings rule

Write your findings **before** you read `current-state.md` §6 (Known open items).
Then read §6 and mark each of your findings:

- **new** — not on the §6 list.
- **known** — the same item as a §6 row; name the row.
- **touches** — adjacent to a §6 row; say how.

This exists so the panel's recall is measured against a list it had not seen.
§1–§5 and §7 of `current-state.md` are safe to read first and you should.

---

## 11 · The memo contract

Each memo is `panel/memo-<seat>.md` and contains, in this order:

1. **Prose, ≤1,500 words.** Your seat's argument.
2. **The findings table**, in the §10 format, every finding, each marked new /
   known / touches.
3. **"Ranking A–D, one sentence each."** All four directions, ranked, one
   sentence of justification each. Rank even where you are unsure.
4. **"What the specimen must show to change my mind."** The concrete thing a
   built specimen could demonstrate that would move your ranking.

Plus your seat's own required artifact, named in the plan's roster (a state
diagram, a before/after inventory, the §A14 block and a contrast table, a step
log, an a11y acceptance list, or the feasibility table). Nora's seat is
≤600 words and carries no required artifact beyond its findings.

Anything a ruling forbids is tagged `AMENDMENT-ASK` and routes to the deck's
ruling sheet, never into a specimen.

---

## 12 · The evidence set

**Every seat reads:**

- This folder: `current-state.md` (§1–§5, §7 first; §6 after your findings),
  `panel-brief-common.md`, `directions.md`, `fixture.md`,
  `kody-screenshot.png`.
- The shots: `../shots/current/` and the ledger `../shots/README.md`, if
  present. Where a plate and `kody-screenshot.png` disagree, the screenshot is
  the authority.
- The house sheet: `docs/design/house-sheet/SPEC.md` — §A in full, then §F.
- The rulings digest: §7 and §8 above, and
  `artifacts/agreement-composed-2026-09-06/build/rulings-2026-09-06.md` when you
  need a ruling's full text.

**Per seat, additionally:**

| Seat | Reads |
|---|---|
| 1 · Document-editor interaction designer | `agreement-composer.tsx`, `parts-rail.tsx`, `part-editor.tsx`, `.../drafting/facet-section.tsx`, house sheet §A5 / §A6 |
| 2 · Information architect / reductionist | `agreement-composer.tsx:695-1030` (the whole render), `service-agreement-send-sheet.tsx`, `packages/types/src/agreement-copy.ts` |
| 3 · Typographer / paper | `.../commercial/service-agreement-preview.tsx`, `.../commercial/agreement-parts-body.tsx`, `apps/designer-portal/src/app/globals.css`, house sheet §A2 / §A3 / §A4 / §A10 |
| 4 · Practicing designer (Leah's seat) | `fixture.md` (the 13-step script), the screenshot, the plates, `readiness.ts` |
| 5 · Accessibility & system critic | `parts-rail.tsx` (dnd-kit), `agreement-composer.tsx` (`disabled` at `:712`, `:759`, `:841`), `service-agreement-send-sheet.tsx:205`, `part-editor.tsx:120`, house sheet §A5 `aria-disabled` / §A11 / §A13 |
| 6 · Engineering feasibility | `agreement-composer.tsx:820`, `:960`, `:972-978`; `.../commercial/agreement-parts-body.tsx`; `.../rooms/room-shell.tsx`; `readiness.ts`; `schedules/`; `turnkey/`; the 19 Jest suites and the two Playwright specs named in `current-state.md` §2 |
| 7 · Homeowner (Nora's seat) | only the client's copy — `.../commercial/agreement-parts-body.tsx`, `packages/types/src/agreement-copy.ts`, and each direction's paper as described in `directions.md` |

Full paths for the agreement folder:
`apps/designer-portal/src/components/document/rooms/drafting/agreement/…`;
for the commercial folder:
`apps/designer-portal/src/components/document/commercial/…`.
