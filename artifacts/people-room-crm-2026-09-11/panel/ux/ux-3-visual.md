# Visual and typography — the People room's face

Seat VC. Fixture: Okonkwo residence. All measures at the 1200px studio band (PD-14).

## 0. Where today's face stands

Two independent CSS custom-property namespaces carry the same palette: production People-room components read `--color-sage` / `--color-golden-hour` / `--color-terracotta` / `--color-charcoal` (globals.css:44,47,46,15) while the required house-sheet tokens are `--sage` / `--golden` / `--terracotta` / `--ink` (_tokens-reference.css:9-24). The hex values are identical; the names are not. Nothing below assumes today's names — every class binds to the house-sheet tokens, and shipping this direction needs a one-line alias in globals.css first (VC-2).

Three state indicators exist today (`StatusDot`, `ConsentChip`, `ReachChip`) built on three different, non-shared palettes, plus fourteen role-identity hues (`AVATAR_BG`/`BADGE`) that overlap none of them. `StatusDot` is a bare `aria-hidden` color circle with no word at all — a direct hit against the house sheet's own gate ("no status dots," A13) and its rule that state lives in the word, never the hue alone (A11). This redesign retires it.

## 1. Row anatomy at 1200

One column grammar, two populations. Row measure 1104px (1200 band, 48px gutter each side), no per-row border-radius or fill — a hairline table, not a card grid.

### Person row (folded)

| Region | Width | Content | Type | Notes |
|---|---|---|---|---|
| Avatar | 34px | initials, circle | mono, 11px | fixed at 34 in every row context (VC-5) |
| gap | 16px | — | — | |
| Identity | flex, min 320px | line 1: name (`.t-body-sm` 14px, 600); line 2: company · role-on-project · trade (`.t-meta` 12px, `--ink-subtle`) | two lines, wraps, never truncates | |
| gap | 12px | — | — | |
| Reach word | 108px | ACCOUNT / FIELD LINK / ON PAPER | bordered mono word, `.t-meta` | sage / golden / ink-faint |
| Consent word | 108px | TEXTING / INVITED / NOT ASKED / OPTED OUT | bordered mono word | sage / golden / ink-faint / terracotta |
| Stage word | 108px | ON THE JOB / BIDDING / etc. (§2.3) | bordered mono word | sage / golden / ink-faint |
| Compliance word | 108px | CURRENT / LAPSES SOON / LAPSED / NOT ON FILE | bordered mono word | sage / golden / terracotta / ink-faint |
| gap | 16px | — | — | |
| Chevron | 16px | `›` | `--ink-faint` | opens the person card |

Fixed columns total 562px; identity gets the remaining 542px. Below 900px the four word columns collapse to Reach only, inline after the name; below 640px all four move to the unfold, matching the Call Sheet's existing unfold contract.

A contact-rule fact (never text, do-not-contact, route-to) is never a fifth chip — it prints as a plain sentence under line 2 (§2.4), because it is a rule, not a state.

### Company row (folded)

| Region | Width | Content | Notes |
|---|---|---|---|
| Avatar | 42px | initials, 8px-radius rounded square | settled ruling, unchanged |
| gap | 16px | — | |
| Identity | flex | line 1: legal name · kind word (GC / Sub / Showroom…); line 2: "N people · N projects" or "Not yet on a project" | same two-line shape as a person row |
| Compliance word | 108px | rollup of every document on the company card, worst-status wins | same four tokens |
| Payee marker | 108px | plain word: "Signs" / "Prepares" / a blank dash | never colored — a fact, not a state |
| Chevron | 16px | `›` | |

No reach or consent column on a company row — a firm has neither (person-bits.tsx / company-row.tsx already say so; kept). No stage column either: a firm's own lifecycle (prospect → active → warranty) belongs on the *engagement*, which is per project; the company row states standing facts only.

## 2. The word vocabulary

### 2.1 The rule

Every state word is a bordered box: 1px border, transparent or `--paper` fill, `.t-meta` (12px, mono, .08em tracking, uppercase), the word inside. **Color is never the only channel** — the border pigment and the printed word always agree, so removing color (forced-colors, a colorblind reader, a black-and-white printout) still reads. No fill of any state color, ever — that is the same discipline A14 already uses for a held field (a 2px `--terracotta-ink` rule and words, never a red wash).

### 2.2 The four tokens, shared across every word family

| Token | Border / text | Meaning |
|---|---|---|
| `--sage` / `--sage-ink` | sage | current — live, granted, on the job |
| `--golden` / `--golden-ink` | golden | pending — in motion, awaiting an answer |
| `--terracotta` / `--terracotta-ink` | terracotta | blocked — refused, lapsed, opted out |
| `--ink-faint` | ink-faint | dormant — nothing asked, nothing due |

Reach, consent, stage, and compliance all draw from this one table. Role identity (which kind of person or firm — the avatar fill, the kind badge) never borrows these four; it stays on `--clay` / `--oak` / `--ink` so a reader is never asked whether a hue means "this is a GC" or "this GC is blocked." Authority draws from neither — see §2.5.

### 2.3 The four families

| Family | Words | Object | Current token | Pending token | Blocked token | Dormant token |
|---|---|---|---|---|---|---|
| Reach | Account · Field link · On paper | E6 | Account (sage) | Field link (golden) | — (not used) | On paper (ink-faint) |
| Consent | Texting · Invited · Opted out · Not asked | E8 | Texting (sage) | Invited (golden) | Opted out (terracotta) | Not asked (ink-faint) |
| Stage | On the job · Bidding · Awarded · Closing out · Warranty · Prospect · Declined · Off the job | E5/E14 | On the job (sage) | Bidding, Awarded, Closing out (golden) | — (not used; a stalled bid is a fact for prose, not a stage) | Prospect, Declined, Warranty, Off the job (ink-faint) |
| Compliance | Current · Lapses in 30 days · Lapsed · Not on file | E10 | Current (sage) | Lapses in 30 days (golden) | Lapsed (terracotta) | Not on file (ink-faint) |

Reach keeps its three PD-12 words unchanged (extension, not replacement, is available but not exercised here). Stage never uses terracotta: nothing in the lifecycle table (crm-model.md §5) is itself a *blocked* fact — a lapsed COI blocking a draw is a compliance fact, told once, on the compliance word, not restated as a red stage.

### 2.4 Rules and routing (E7) — prose, not a chip

"Never text," "do not contact — see Rosa Delgado," "email only" print as one `.t-body-sm` (14px) sentence directly under the identity block, `--ink` at full strength. A true block (F-15, do-not-contact) carries a 2px `--terracotta-ink` leading rule to its left, exactly the "held" field pattern (A14) — never a red fill, never a chip.

### 2.5 Authority (E12) — plain words, no pigment

"Approves money to $2,500," "Prepares only," "Signs," "Holds a key" print as an uncolored mono phrase, no border, `--ink-subtle`. Authority does not lapse or wait; giving it a state pigment would say something the model does not claim.

## 3. Person card and company card, region by region

Card column measure 720px, centered in the 1200 band. 48px between regions, a `1px var(--hairline-strong)` rule at each seam (the A9 record-block convention), 24px of padding inside a region.

### Person card

| Region | Content | Layout |
|---|---|---|
| Header | 48px circle avatar · name `.t-d3` (20px Playfair) · affiliation line `.t-meta` (company + role_at_firm) · reach word + consent word inline | flex row, 16px gaps |
| Contact & rule | typed reach channels, one row each: kind label (`.t-head`) · value · PREFERRED marker if true; then the E7 rule sentence (§2.4) | short table (label / value / preferred), then one sentence |
| Engagements | every seat this person holds, across projects — CRM-5's "seats beneath the person" | table: Project · Kind/Trade · Stage word · Window · Authority phrase — one row per engagement, hairline-separated |
| Firm | 42px square avatar linking the company card · role_at_firm · paperwork-contact / signer markers, plain words | flex row |
| Documents | only when sole-proprietor (`is_sole_proprietor`); otherwise one line: "Documents live on [Company]'s card →" | table or one line |
| History | studio_verdict, do-not-rehire reason and date, if any | plain sentence, dated |

### Company card

| Region | Content | Layout |
|---|---|---|
| Header | 42px square avatar · legal_name `.t-d3` · dba_name `.t-meta` if different · kind word · "N people · N projects" | flex row |
| Payee & paperwork | remit_to · tax_id last 4 (masked) · paperwork contact (link to person) · signer (link to person) · site contact (link to person) | table: role at firm / person / reach word |
| Compliance documents | one row per E10 row: type · number · expires · compliance word · held_by | table, `.t-head` header row |
| Crew | people affiliated, 34px circle rows, role_at_firm | list, same row grammar as §1 |
| Lien waivers | per active project: draw # · type · through-date · status word (Current/Lapsed reused) | table |
| Agreement | retainage_bps · warranty_until | one line each |

## 4. Density and rhythm

| Rule | Value |
|---|---|
| Row height | 56px folded (34px avatar + two 12–14px lines + 8px vertical padding) — a repeating unit, not tied to the 24px module itself |
| Row separator | `1px solid var(--hairline)`, no radius, no fill, no shadow |
| Group spacing (chip filter row, role bands) | 24px (one module) |
| Region spacing (card seams) | 48px (two modules), `1px var(--hairline-strong)` rule at the seam |
| Table cell padding | 12px vertical, 16px horizontal |
| Shadows | none, anywhere, ever (A4) |
| Truncation | none — wrap to two lines, fixed row height (removes the current `truncate` on name and relationship line) |
| Tables vs lists | ≥3 comparably-shaped repeatable facts (engagements, documents, waivers, typed channels) → a table with a `.t-head` header row. Exactly one narrated fact (a contact rule, a do-not-contact note) → one sentence, never a one-row table |

## 5. The fragment

Saved at `specimens/_people-style-fragment.html` (`<link>` to `_tokens-reference.css`, same directory). Defines `.crm-row`, `.avatar`/`.avatar--circle`/`.avatar--square`, `.word` + four state modifiers + `.word--plain` (authority), `.rule-sentence` (+ `.rule-sentence--blocked`), `.crm-card`, `.crm-table`. Demonstrated against F-11 Dana Kowalski (lapsed COI, terracotta), F-07 Marrow & Sons (company row), F-18 Joe Wozniak (consent pending, golden), F-27 Ray Thao (dormant, never-text rule). Both themes inherit from the linked token file; no color is redefined in the fragment itself.

## Findings

| ID | P | Confidence | Claim | Evidence | Proposed |
|---|---|---|---|---|---|
| VC-1 | P1 | high | `StatusDot` renders a bare `aria-hidden` color circle with no visible word, violating the house sheet gate ("no status dots") and its rule that state lives in the word, never the hue alone | `person-bits.tsx:206-214`; `SPEC.md:592-595` (A13 gate), `:538-539` (A11) | Retire the dot; every lifecycle word in the redesign is a bordered word, never a bare fill. new |
| VC-2 | P1 | high | Production People-room CSS reads `--color-sage`/`--color-golden-hour`/`--color-terracotta`/`--color-charcoal` while the required house-sheet tokens are `--sage`/`--golden`/`--terracotta`/`--ink`; hex values match, names do not resolve to each other | `globals.css:11-47`; `_tokens-reference.css:9-24` | Add a one-line alias block in globals.css before this direction ships against production markup; the fragment stays token-pure. new |
| VC-3 | P2 | high | No word or chip exists today for engagement stage, compliance-document status, or authority — only reach and consent have shipped precedent | grep of `people/` and `roster/` for a rendered stage/compliance/authority label returns none; CRM-1, CRM-2, CRM-7 | This memo is the first artifact defining those three word families; keep them centralized (§2) rather than let each surface invent its own. touches(G-14, G-15) |
| VC-4 | P2 | high | `RolodexMarker` is a fully-rounded (`rounded-[16px]`) bordered word — a literal pill — which the gate explicitly forbids on any specimen face | `person-row.tsx:29-37`, `:33` | Redraw at the shared 3px radius (matches `RoleBadge`), or drop the box for a plain scored word. new |
| VC-5 | P2 | high | Person avatar size is inconsistent across surfaces: Directory defaults to 42px (same footprint as the settled company square), Call Sheet uses 34px | `person-bits.tsx:117` (`size = 42`); current-state.md:127 (A8, "34px avatar") | Fix person circles at 34px in every row context; reserve 42px+ for card headers, so the circle/square size gap itself signals "the firm is the heavier unit" (CRM-6). new |
| VC-6 | P2 | high | Every Directory row is a bordered, 10px-radius, white-filled box — a card grid, not the hairline-ruled ledger the rest of the house sheet uses, and harder to read as a dense table once four more word columns are added | `person-row.tsx:68-75`; `SPEC.md:167-169` (A4) | Collapse to a hairline-ruled table row: no radius, no fill, 1px `--hairline` between rows. new |
| VC-7 | P2 | med | The Directory shows no reach word on any row; only the Call Sheet does, so the room the studio actually keeps its book in cannot answer "how do I reach them" | `person-row.tsx:76-99` (no `ReachChip`); `reach-chip.tsx` only imported under `roster/` | Reach is a row column everywhere in this redesign, not a Call-Sheet-only fixture. known(G-21) |
| VC-8 | P2 | med | Name and the relationship line both truncate with `text-overflow: ellipsis`-equivalent classes on every Directory row; the gate forbids this on any specimen | `person-row.tsx:79`, `:85`; `SPEC.md:169`, `:594` | Wrap to a fixed two-line block instead of truncating (§4). known(G-23) |
| VC-9 | P2 | high | Role-identity color (14 avatar/badge hues) and lifecycle-state color (StatusDot/ConsentChip/ReachChip, distinct palettes) overlap partially with no shared grammar saying which axis a given hue belongs to | `person-bits.tsx:28-52` (AVATAR_BG/BADGE) vs `:103-107` (DOT_BG, no shared members) | Reserve sage/golden/terracotta/ink-faint exclusively for lifecycle words; keep role identity on `--clay`/`--oak`/`--ink` only (§2.2). new |
| VC-10 | P2 | med | `ConsentChip`'s `dotOnly` variant is the one indicator in the room that already carries a real accessible name; `StatusDot` beside it in the same row does not | `person-bits.tsx:163-172` (aria-label present) vs `:206-214` (aria-hidden, no name) | Bring every indicator to at least the dotOnly bar, then replace the remaining dots with words per VC-1. touches(G-21) |
| VC-11 | P3 | med | `SmsConsentStatus`'s four existing values (not_asked/pending/granted/opted_out) already map 1:1 onto the four-pigment grammar this charge asks for | `field-config.ts:159`, `:175-180` (SMS_CONSENT_DISPLAY) | Keep the four existing words; rebind their color classes to the shared tokens (§2.2) instead of the SMS-only palette. new |
| VC-12 | P2 | high | No word exists anywhere for a compliance document's expiry state; the only insurance fact in the schema is a boolean | `00579_trade_agreements.sql:84`; CRM-1 | Author four new words — Current / Lapses in 30 days / Lapsed / Not on file — bound to the shared tokens (§2.3). touches(G-14) |
| VC-13 | P3 | med | The company-kind pill and the person role badge are visually identical boxes carrying unrelated vocabularies, and nothing yet distinguishes "this box names identity" from "this box will name a lifecycle state" once stage/compliance words share the row | `company-row.tsx:93-99`; `person-bits.tsx:148-155` | Fix identity badges immediately after the name; fix every lifecycle word in the right-hand word columns (§1) — position, not just color, tells the families apart. new |
| VC-14 | P3 | low | `party-mini-row.tsx` is a third, independent row renderer for the same person/party data (the rolodex picker); a fourth anatomy would need to converge too | current-state.md:112 ("picker mini rows"); `roster/party-mini-row.tsx:3-26` | The picker's mini row inherits the same avatar-size and word-column rules as the folded row — no separate anatomy. new |
| VC-15 | P2 | med | The fixture's do-not-contact / route-through fact (F-14/F-15) has no proposed face treatment beyond a database field; this charge's word set has no home for it unless it rides as prose | fixture.md F-14, F-15; CRM-3, E7 | Render as one inline sentence under the identity block, with a terracotta-ink leading rule only when the rule is a hard block (§2.4) — never a sixth chip. touches(G-7) |
| VC-16 | P2 | med | Authority (money/CO/site/key) is the one family in this charge that is not itself a lifecycle state — nothing in E12 claims it can lapse or go pending | crm-model.md §2 (Authority grant fields: scope, threshold, prepares_only — no state enum) | Render authority as an uncolored plain phrase, never inside a state-pigmented chip (§2.5). new |
| VC-17 | P3 | low | Reach (E6) and contact rule (E7) are easy to conflate on a face with only one word-slot per row, but they answer different questions ("how" vs "how not") | fixture.md F-15, F-27; crm-model.md E6 vs E7 | Keep reach as a bordered word and the rule as unbordered inline prose — two visibly different things, never merged into one chip. new |
| VC-18 | P3 | low | F-16's unlinkable Patina account (`profiles` row exists, FK never written) would read "On paper" under this word set even though the person, in fact, logs in elsewhere | fixture.md F-16; CRM-15, G-5 | Out of visual scope until the FK exists; if surfaced before then, add a plain inline note, never a colored chip for an unconfirmed fact. touches(G-5) |
| VC-19 | P3 | low | `_tokens-reference.css` has no filled "blocked" background distinct from the terracotta border already used for a held field; a filled terracotta chip would drift from A14's ink-plus-rule discipline | `SPEC.md:741-754` (A14 held-field CSS); `_tokens-reference.css` (no fill token for state) | Every blocked word uses a terracotta-ink border and `--ink`-strength text on transparent/`--paper` fill — never a colored background. new |
| VC-20 | P3 | low | The company row's `statusDot` prop is already commented "no real signal exists yet ... omitted unless a caller has one" — the shipped code anticipated exactly the compliance word this charge defines | `company-row.tsx:60-64` | Wire the compliance word into that existing slot rather than opening a second one. new |

## Ranked top 5 things Patina must track that it does not today

1. A document's expiry **state**, not just its expiry date — company — no word today reads "Lapsed" anywhere (F-11's COI, CRM-1).
2. An engagement's **stage word**, distinct from its raw enum — role-on-project — a February radon sub and today's framer read identically now (F-19, F-24, CRM-7).
3. A **contact rule** as a rendered fact, not a database column — person — "email Rosa, never call Frank" has no face at all (F-14/F-15, CRM-3).
4. **Reach on the Directory row**, not only the Call Sheet — person — the studio's own book cannot answer "how do I reach Dana" without opening a project (F-11, CRM-16).
5. An **authority phrase** on the engagement — role-on-project — "Adaeze decides finishes, Chidi signs money" has nowhere to print (F-04/F-05, CRM-2).

## What would change my mind

1. A studio walk (LH seat) showing the four-column row reads as cluttered at 1200 in practice, not just in a static table — would push word columns further into the unfold by default.
2. Evidence that a filled (not bordered) state pigment tests more legible at 12px mono than a bordered word — would revisit §2.1's "border, never fill" rule.
3. A ruling that stage belongs only to the Call Sheet, never the cross-project Directory — would drop the stage column from §1's person row entirely.
4. A second fixture where "blocked" genuinely applies to a stage (not just consent/compliance) — would add terracotta back to the stage family in §2.3.
