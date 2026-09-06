# 03 · Fresh-context re-review after two fix rounds

Reviewer: fresh context. Did not write the document, the rulings, or `01`/`02`.
Read: `00-orchestrator-rulings.md`, `01-evidence-vision-review.md` + `01b-fix-log.md`,
`02-document-review.md` + `02b-fix-log.md`, `proposal.html` (2168 lines, whole), `README.md`,
`source/proposal.md`, `source/check-fixture.mjs`, `source/check-prose.mjs`,
`review/render-check.mjs` + `render-check-results.json`, and the cited repo files
(migrations 00408/00412/00414/00417/00422/00423/00424/00428/00477/00484/00556/00566 plus
`commercial-documents.ts`, `service-agreement-preview.tsx`, `commercial-document-shell.tsx`,
`consent-copy.ts`, `service-agreement-drafting-room.tsx`, `account-studio-page.tsx`).

---

## A · Did D-1…D-7 land?

### D-1 · The turnkey shape — **landed, with one gap**

§8 is genuinely re-founded. The evidence table is there and every cell checks out against
the repo:

> "It is client-executed | The sign route dispatches `trade_scope` to
> `execute_trade_scope_with_trusted_ip` `route.ts:178-187`, and the RPC refuses without an
> authenticated client and a legal name `00423:1881`."

Verified: `00423:1881` = `RAISE EXCEPTION 'trade scope execution requires an authenticated
client and legal name'`. `consent-copy.ts:31` = `'I authorize this trade to begin the work
described, at the price shown. …'` — the homeowner's sentence, exactly as claimed.
`00423:185` = the `trade_scope_terms` COMMENT naming "the lump-sum client price". Four for four.

D2 is redrawn as ruled: prime above (`00412:101, :108` verified — `party_role CHECK IN
('client','studio')` and `UNIQUE (proposal_id, party_role)`), three Trade Agreements beneath
on `studio_trade_agreements`, and the old trade scope in a `border-style:dashed` column
labelled "optional, client-visible". `.dgrid` defaults to one column
(`grid-template-columns:minmax(0,1fr)`, line 452) so the stack reads top-to-bottom at every
width — the nesting is safe.

Lane 02 §7's eight essentials are all present and each carries a "where it comes from"
(scope, price, schedule, flow-down, retainage, pay-when-paid, insurance, lien waivers).
Constraint 7 is re-derived rather than reopened. P14 exists (Wave 3, L, waits on R16 + R13).
R16 exists with the recommended answer and `Kody + counsel`. `trade_rfq_tokens` verified at
`00424:124`; `studio_contacts` verified at `00417:40`.

Counts swept: masthead "Fifteen proposals, three waves, sixteen rulings"; §0 lines 5–6;
§10 lede "Fifteen, numbered P0 through P14"; §12 R1–R16; §14 "Kody owns ten; Leah R3, R7 and
R13; counsel R10 and R11; R16 is Kody's with counsel on the wording" — owner arithmetic
checks (10 + 3 + 2 + 1 = 16). README carries both tables at fifteen and sixteen. Index has no
counts to update. **Gap: `source/proposal.md` was not swept — see RR-07.**

### D-2 · The projection table — **landed, with two defects**

The table exists with the ruled columns and rows. Cited lines verified against the migrations:

| cite | what is actually there | verdict |
|---|---|---|
| `00414:911-913` | `IF v_authorized_cents + v_pending_entry.rated_amount_cents <= v_terms.billing_ceiling_cents THEN` | ✅ exact |
| `00412:77-78, :148` | terms `billing_cadence … CHECK (IN ('monthly','biweekly','milestone'))` at 77–78; the authority twin at 148 | ✅ exact, both rows |
| `00566:765-784` | the `IF v_terms.retainer_amount_cents > 0` retainer-invoice block | ✅ |
| `00566:788-797` | `INSERT INTO public.project_billing_authorities (…) RETURNING id INTO v_authority_id` | ✅ exact |
| `00566:761-763` | `UPDATE public.project_billing_authorities SET status='superseded'` | ✅ exact |
| `00422` `create_furnishings_authorization_from_schedule` | defined at `00422:370` | ✅ |
| `00423:1608-1614` | 1610–1614 is the design-services send refusal; 1608 is the tail of the preceding one | ✅ close enough |
| `00477:306-309` | `IF NOT EXISTS (… proposal_service_terms …) OR NOT EXISTS (… proposal_service_rates …) THEN RAISE` | ✅ |
| `00412:815-820` | the same refusal on the sign path | ✅ |
| `00412:73` (readiness table, P1) | `billing_ceiling_cents integer NOT NULL CHECK (>= 0)` | ✅ |
| `00412:107` | `metadata jsonb NOT NULL DEFAULT '{}'` | ✅ |
| `00412:115-117` | the `project_commercial_documents.document_kind` CHECK | ✅ |
| `00423:94-101` | the `proposals.document_kind` CHECK | ✅ |

"Countersign and authority are unchanged" is gone from projection rule 2 (now: "four of the
fifteen variants need columns and CHECKs that do not exist yet"). R4 is amended verbatim to
the ruling. The refusal list appears in P1's bullets and P2's third bullet. M1 gives Ceiling
the required dot and annotation 3 carries the rate-card exception.

Defects: the `procurement` variant is counted twice (RR-03), the "four variants" count is
wrong (RR-12), and the ceiling row's CHECK cell cites three *terms-and-rates* refusals for a
*ceiling* nullability change without citing `00412:73`/`:145` where the constraint actually
lives (RR-17).

### D-3 · Class ⊂ kind — **landed.** `furnishings` → `furnishings_services` everywhere (zero hits
for the old name). D1's Class box says "a class is narrower than a `document_kind`, not a
synonym for one". §5's caption states the three classes keep `document_kind='design_services'`,
"dispatch stays on kind, so no edge function changes in Waves 1–2". P1 and P6 both carry
"Edge functions touched: none"; P9 carries "proposal-send, commercial-document-notify" and
the full new-kind surface list.

### D-4 · The consent sentence — **landed.** §7's row reads "**Composed from the money parts
actually present**, not keyed by class … Rendered once at send, hashed with the document,
stored on the signature row (metadata, 00412:107). The drift test pins the composer, not the
strings." `consent-copy.ts:59` verified as the sentence naming role rates / ceiling / retainer
/ terms unconditionally. M5's consent line is composed. "Consent sentence version" is replaced
by "The consent sentence itself" in the record table. (Spine still says "consent keyed by
class" — RR-07.)

### D-5 · The standard template — **landed.** Nine parts in §5, M1's figcaption ("the standard
template's nine, plus Change orders and Termination"), and M5. "Verbatim" is gone. The deposit
is its own typed part in M1, M5 and §4. P1 seeds from "a code-resident list in `packages/types`
— the `studio-config.ts` vocabulary pattern — not from a template row. The template object
arrives in P4." P1 waits on R1, R4, R5, R6.

### D-6 · Vision honesty — **landed.** Appendix D and README both read "Stream — the
subscription floor. Procurement parts are where V1's answer will land; construction cost-plus
is the studio's margin, not Patina's." Wave 3 carries the "not yet on record" line. Question
11 exists (§14 is eleven questions). No compliance is asserted: §3 "meets the e-sign elements
lane 03 lists, except a client-held reproducible copy (R12). Counsel to confirm"; §7 "Whether
it is enough is counsel's call, not this document's." Appendix D is counted prose (appendix
57/60 with cap raised to 60). §3's e-sign note is a plain counted `<p>` (§3 at 57/60). Zero
occurrences of "Pledge" in the HTML.

### D-7 · Research fidelity — **landed.** "lettered schedules whose option labels are not
published"; subscription row → **No** with the reason; "two of the fee models below, and part
of a third"; Mydoma → "Per-project **feature** toggles … Contract-section grain **not
confirmed**"; MA flagged `unconf` in both §8's notices row and P11, plus a sixth MA row in the
licensing table; §9 shows the pro-rated SOV with `(cost × 1.18)` in the header and a caption
stating lane 02's separate-fee alternative, the divide-by-1.18 recovery risk, and R13.

---

## B · Are the fix logs true?

Thirty-eight "applied" rows sampled and checked in the HTML. Thirty-four are true as written.
Every "declined" row (EV-37, EV-38, DR-19, DR-47, DR-50) carries a reason; EV-68 is logged as
a partial with a reason. Rows verified true, in brief:

EV-01 (zero hits for `retainer_cents`), EV-02, EV-03, EV-04, EV-05, EV-06, EV-07, EV-08,
EV-09, EV-11, EV-12, EV-14, EV-15, EV-17, EV-18/19, EV-23, EV-24 (no `130` cell), EV-27,
EV-28, EV-29, EV-30, EV-31, EV-32, EV-33, EV-34 (M2's eleven rows = 5 clauses + 1 list +
4 money + 1 attachment, matching M4's counts exactly), EV-35, EV-36, EV-39, EV-40, EV-41,
EV-42, EV-43, EV-44, EV-45, EV-46, EV-47, EV-48, EV-50, EV-55, EV-56, EV-59, EV-60, EV-61
(line cut), EV-63, EV-65, EV-66, EV-67, EV-69, EV-70; DR-01, DR-02, DR-03, DR-04 (zero hits
for `schedule &middot; variant`), DR-05 (**all thirteen** strings grep-matched verbatim in
`commercial-documents.ts`), DR-06 (HTML), DR-07, DR-08, DR-09, DR-10, DR-11 (19 header cells,
19 cells per row, `sr-only` caption, legend above the scroller), DR-12, DR-13, DR-15 (zero
`<h4>`), DR-17, DR-18, DR-20, DR-21, DR-22, DR-23, DR-24, DR-25, DR-26, DR-27, DR-28, DR-29,
DR-31 (§2 only), DR-32, DR-33, DR-34, DR-35, DR-36, DR-37, DR-38, DR-39, DR-41, DR-42,
DR-43, DR-44, DR-45, DR-46, DR-48, DR-49.

Four "applied" rows are false or materially incomplete: **DR-16** (RR-05), **DR-14 / EV-57**
(RR-09), **DR-31** (RR-10, §7 not swept), **EV-54** (RR-06, P10 and the Wave 3 flag not
swept). One further row — **EV-13** — was applied but introduced a new factual error (RR-08).

---

## C–F · Findings

Every finding, no severity filter.

### RR-01 · The render gate is red — 15 failures, disclosed in neither fix log
**major · high confidence · `review/render-check-results.json` (generated 2026-09-06T14:03:17Z,
i.e. after the 08:57 edit to `proposal.html`); `proposal.html:84, 309, 866-882`**

Both fix logs state their gates as "`check-fixture.mjs` exit 0 · `check-prose.mjs` exit 0" and
say nothing about the render check. The current results file — regenerated *after* the fix
pass — reports `totals: {pass: 48, fail: 15}`:

- `no-horizontal-overflow` fails at **390, 760 and 1280 in all three themes** (9 failures):
  `documentElement.scrollWidth` exceeds `innerWidth` by 1044 / 744 / 506px. The named offender
  is `table.tight.min1080` (the §3 engagement matrix), but that table sits correctly inside
  `.mockscroll{overflow-x:auto}` (line 866) — the check picks the greatest
  `getBoundingClientRect().right`, and a table inside an auto-scroller always reports a rect
  past the viewport, so the *attribution* is probably a false positive while the root
  `scrollWidth` excess is real and unexplained.
- `figures-sized-and-not-clipped` fails at 390 and 1280 in all three themes (6 failures) —
  see RR-02, which is a genuine clip.

`body{overflow-x:hidden}` (line 84) means the excess is clipped rather than scrollable, which
is exactly DR-47's concern — declined last round as unverifiable, now demonstrably reachable.

**Fix:** re-run `review/render-check.mjs`, diagnose the `documentElement` excess (start by
checking whether `.mockscroll`/`.tablewrap` are being defeated by an ancestor, and by testing
DR-47's proposal — `body{overflow-x:visible}` + `.shell{overflow-x:clip}`), and record the
render gate's state in the fix log alongside the other two. Do not publish while the gate is
red without saying so.

### RR-02 · M2's money row is clipped at 390px and 1280px — content unreachable
**major · high confidence · `proposal.html:1172`, CSS `:424`**

DR-40's fix put the whole variant list into a `.rowend`, and `.partlist .rowend` carries
`white-space:nowrap`:

```html
<li><span class="kg">$</span>Money<span class="rowend"><span class="selectmock">Flat &middot; Per phase &middot; Rate card &middot; Retainer &middot; Ceiling &middot; Deposit &hellip;</span></span></li>
```

The render check reports, for the third `figure.mock` (M2): `content wider than container:
scrollWidth 563 > clientWidth 344 (+1px tolerance), no containing .mockscroll found`. M2 has
no scroller, and `body`'s `overflow-x:hidden` clips it, so a phone reader simply loses the
list of money variants — the single most informative string in the picker.

**Fix:** let this one row wrap (`white-space:normal` on the `.selectmock` inside M2's Money
row, or a `.rowend--wrap` modifier), or shorten the string to `Flat · Per phase · Rate card …`,
or wrap M2's grid in `.mockscroll`.

### RR-03 · `procurement` is counted twice in §4's projection table, and the caption contradicts a row
**major · high confidence · `proposal.html:1043-1062`, cross-ref `:973`**

The fifteen variants are `rate_card, ceiling, retainer, cadence, flat, per_phase,
percent_of_cost, percent_of_spend, cost_plus, day_rate, package, procurement, pricing_basis,
draws, allowances`. The projection table gives named rows to six of them, then a
`deposit (procurement)` row that projects `furnishings_deposit_percent` **today**, then "the
other nine variants → payload jsonb … nothing reads them". Six + nine = fifteen, so
`procurement` is inside the "other nine" *and* has its own row saying it works today. The
caption then asserts "nine mean nothing at all until R9 says otherwise", which the
`deposit (procurement)` row directly denies. §4's own variants table (line 973) lists
`procurement` as "Record only until R9".

**Fix:** name the deposit row for what it is — `procurement`, *deposit % only* — and change
the last row to "the other eight variants", with the caption to match. Or split
`furnishings_deposit_percent` out of `procurement` into its own sixteenth variant and restate
the counts (fifteen → sixteen) everywhere.

### RR-04 · §5's "Money that becomes authority" column lists variants §4 calls record-only
**major · high confidence · `proposal.html:1252, :1258` vs `:968-976` and R9 at `:2015`**

- Furnishings only → `procurement` (deposit %), `retainer` optional
- Design-build turnkey → `pricing_basis`, `draws` (+retainage), `allowances`

All four of `procurement`, `pricing_basis`, `draws`, `allowances` are "Record only until R9"
in §4, and R9's recommendation names only "Rate card, ceiling, retainer, cadence, flat,
per-phase". A designer reading §5 comes away believing a draw schedule creates billing
authority; §4 says nothing reads it.

**Fix:** rename the §5 column "Money parts it carries", or annotate the two rows
"record-only until R9".

### RR-05 · DR-16 "applied" is materially incomplete — three named tables have zero row headers
**major · high confidence · `proposal.html:962-976, :987-989, :1728-1764, :829/831/833/834, :2136-2152`**

DR-16's log entry names the tables converted, including "variants, projection rule … both
ledgers … and the panel tables". Actual state:

| table | first cells converted |
|---|---|
| Schedule variants (§4) | 0 of 15 |
| The projection rule (§4) | 0 of 3 |
| Ledger A (§9) | 8 of 15 |
| Ledger B, cost basis (§9) | 0 of 11 |
| Ledger B, draws (§9) | 0 of 7 |
| ASID map (§3) | 8 of 12 — rows **D**, **F**, **H**, **I** still `<td>` |
| Appendix C persona table | 0 of 5 |
| Appendix C disagreements | 0 of 5 |

Every `<th>` in the document does carry `scope`, so the header half of DR-16 is true; the row
header half is not. (The "Patterns worth taking" table's first cell is a verdict badge, which
is a defensible choice, not a defect.)

**Fix:** convert the first cell of each body row in those tables to `<th scope="row">`, or
amend the log entry to say which tables were deliberately left alone and why.

### RR-06 · The licensing attestation is a "gate" in two places and "not a gate" in three
**major · high confidence · `proposal.html:1919` (P10), `:1990` (Wave 3 flag) vs `:1255` (§5),
`:1609` (§8 table), `:1692` (M7 annotation 2)**

EV-54's fix landed in §5, §8 and M7 — "a required *part of the template* the studio fills in,
not a Patina gate between a studio and its own agreement", "must be complete before send". But
P10 still reads "the turnkey template is **selectable only when one is on file**" and Wave 3's
flag still reads "**Gate: attestation on file**". These are different products: one blocks
opening the template, the other blocks sending the agreement.

**Fix:** rewrite P10's bullet to "the agreement cannot be sent until the attestation is
complete" and the Wave 3 flag to "Attestation required before send".

### RR-07 · `source/proposal.md` — the stated spine — was only partially amended
**major · high confidence · `source/proposal.md:3-8, 96, 98, 154-187, 213, 263, 269`**

Both fix logs list `source/proposal.md` under "Files touched", and its new amendment note
claims the counts, §8's shape, §4's table, nine parts and the eleventh question. Everything
else is stale, and the spine is the file the HTML builder is told to render:

- `:96` still says "so countersign is unchanged" — the exact phrase D-2 deleted — in the same
  sentence as the bracketed note saying it is dropped.
- `:98` readiness row still keys the ceiling to "a `ceiling` part is present", not R4's amended
  rate-card rule.
- `:185` and `:263` still say "the 32-word Patina wording" / "the 32-word line" — DR-06's whole
  finding.
- `:213` still says "consent **keyed by class**" — the thing D-4 forbids.
- `:263` still says "**Pledge** language of any kind (V6)" — EV-56.
- `:187` still says "Licensing in **five** states … WI · IL · MN · CA · NY" — DR-27.
- `:269` still says "rule **R1–R15** (Kody)" — EV-33 *and* the D-1 count sweep.
- §8's M6 rail still lists `Schedule of values` as its own part — DR-03.
- §8's turnkey table still marks the licensing attestation **gate** — EV-54, and it is the
  source of RR-06.

**Fix:** sweep the spine against D-1…D-7 and the two fix logs, or demote it explicitly ("the
HTML is now canonical; this spine is the round-0 record") and say so in the README folder map,
which currently calls it "The document's spine in Markdown".

### RR-08 · §3 asserts today's retainer "is one amount with a credit rule", citing lines that show no credit rule
**major · medium-high confidence · `proposal.html:859`; `00412:74-76`**

EV-13's fix reads:

> "**No** — Patina's retainer is one amount with a credit rule `00412:74-76`, not a recurring fee"

`00412:74-76` is `retainer_amount_cents` plus `retainer_activation_policy text NOT NULL DEFAULT
'immediate' CHECK (… IN ('immediate','retainer_paid'))`. There is no credit-rule column
anywhere in 00412 — and §4's own projection table says `retainer_credit_rule` is **new**
(`:1021`), M1's annotation 4 says the retainer part "writes `retainer_amount_cents` and a new
credit-rule column", and R9 counts it among Wave 2 work. So §3 tells the reader a column
exists that the rest of the document proposes building.

**Fix:** "Patina's retainer is one amount with an activation policy `00412:74-76`, not a
recurring fee."

### RR-09 · One British spelling survives, against a log entry claiming zero
**minor · high confidence · `proposal.html:1142` (body text), `:392` (CSS comment)**

M1's figcaption: "the rail is the ordered part list, the **centre** is the selected part's
editor for its kind". DR-14 and EV-57 both state "Zero British spellings remain." A CSS
comment at `:392` also reads "selected state carries a glyph, not **colour** alone" (not
reader-visible, but in the file).

**Fix:** `centre` → `center`; `colour` → `color`.

### RR-10 · §7 still says the designer preview is "Seven hand-built sections"; §2 says five headings
**minor · high confidence · `proposal.html:1434` vs `:791`**

DR-31 was applied in §2 ("five headings `:92, :100, :116, :126, :205` over the seven facets" —
verified: Services / What you will receive / Not included / How design time is billed /
Agreement terms). §7's "One part list, three surfaces" table still reads "Seven hand-built
sections `service-agreement-preview.tsx:91-244`" for the same file and range.

**Fix:** §7 → "Five hand-built sections over seven facets".

### RR-11 · §4 mis-cites the `TG_TABLE_NAME` dispatch; the appendix gets it right
**minor · high confidence · `proposal.html:989` vs `:2093` and `:1818`**

Projection rule 3: "Attach to `guard_commercial_authored_child`'s `TG_TABLE_NAME` dispatch
`00423:452-455`". In the migration, 447–451 is the `CASE TG_TABLE_NAME` block; 452–455 is
`BEGIN` plus the draft check. Appendix A Constraint 3 has it right ("00423:452-455, dispatch
:447-451") and P1 cites the whole function (`:447-461`).

**Fix:** §4 → `00423:447-451`.

### RR-12 · "Four variants need new columns or a widened CHECK" — it is four rows, five variants
**minor · high confidence · `proposal.html:1062`, `:988`**

The rows needing schema work are `ceiling`, `retainer`, `cadence`, and `flat`/`per_phase` —
four rows, but five of the fifteen variants. Projection rule 2 repeats "four of the fifteen
variants". In a document this careful about counts, a reader will check.

**Fix:** "Five of the fifteen variants need new columns or a widened CHECK", or "Four of the
rows below".

### RR-13 · M1's readiness panel accounts for five of its six required parts
**minor · high confidence · `proposal.html:1086-1096, :1121-1131`**

The rail marks six parts required (Services, Deliverables, Role rates, Ceiling, Retainer,
Terms). "3 of 11 parts need attention" lists Services, Role rates, Terms. "Satisfied" lists
only Ceiling and Retainer — Deliverables, which is required and filled, appears in neither
list. DR-09 rebuilt this panel, so the omission is new.

**Fix:** add `Deliverables · 3 items` to the Satisfied list, or drop the required dot from
Deliverables.

### RR-14 · M6 omits a part §8's own template table marks required
**minor · high confidence · `proposal.html:1606` vs `:1629-1640`**

"Supervision fee vs markup | clause + a pricing-basis field | **yes** | yes | the
no-double-count rule is enforced by the template, not by drafting" — and M6, the composed
design-build agreement for the Halvorsen house, has nine parts, none of them that one. A
designer running subs will look for where the supervision fee lives and not find it in the
drawing that is supposed to show them.

**Fix:** add it to M6's rail (making it ten parts, with the caption updated), or note in M6's
figcaption that the supervision clause is carried inside Pricing basis.

### RR-15 · Running-prose conclusions still sit in `no-prose` captions
**minor · medium confidence · `proposal.html:939, :1062, :1265, :1582, :1769`**

DR-07 and EV-67 promoted the worst offenders, but the pattern survives in at least five
places, four of them carrying a conclusion or a design ruling rather than a contents list:

- `:1062` "This is the honest cost of the model. Four variants need new columns … nine mean
  nothing at all until R9 says otherwise." (~34 words)
- `:1265` the D-3 ruling itself — "class is a column on the parts snapshot, and dispatch stays
  on kind, so no edge function changes in Waves 1–2" (~60 words)
- `:1582` "…those four are the gap P14 has to close, and they are why a Trade Agreement is a
  new object rather than a widened old one" (~45 words)
- `:1769` "A design choice, stated." (~90 words)

Document total is 628/900, so there are 272 words of headroom — but `library` is at 59/60,
`model` at 46/60, `turnkey` at 57/70 and `fixture` at 37/60, so promoting these needs the
section caps raised, which is a ruling, not an edit.

**Fix:** either promote `:1062` and `:1582` (13 and 13 words of section headroom exist) and
accept the rest as genuine captions, or state the convention explicitly — "captions carry
mechanism; `<p>` carries argument" — so the exemption is a rule rather than a dodge.

### RR-16 · The ceiling row cites the terms-and-rates refusals for a ceiling change
**minor · medium confidence · `proposal.html:1015`**

The "CHECKs widened" cell for `ceiling` says the column becomes nullable and then cites
`00423:1608-1614; 00477:306-309; 00412:815-820`. All three are the *"requires terms and at
least one role rate"* refusals — they are the right cites for relaxing the **rate-card**
requirement, but none of them touches the ceiling. The constraint that actually has to change,
`billing_ceiling_cents integer NOT NULL CHECK (>= 0)` at `00412:73` (and its authority twin at
`00412:145`), is cited in the readiness table and P1 but not in the row that makes the claim.

**Fix:** add `00412:73, :145` to the ceiling row's CHECK cell.

### RR-17 · "eleven literal seeding keys" — the RPC reads ten
**nit · medium confidence · `proposal.html:1841`; `00422:1754-1766`**

`upsert_design_services_draft`'s VALUES list reads ten `p_terms` keys: `scope`, `deliverables`,
`exclusions`, `billingCeilingCents`, `retainerAmountCents`, `retainerActivationPolicy`,
`billingCadence`, `currency`, `terms`, `furnishingsDepositPercent`. Eleven is only reachable by
counting INSERT columns minus the PK, which is not what "seeding keys" says.

**Fix:** "ten literal seeding keys", or "eleven seeded columns".

### RR-18 · "variant" survives in M3's caption and figcaption
**nit · high confidence · `proposal.html:1344, :1392`**

DR-40 logs "The word 'variant' no longer appears in any mockup." It is gone from the UI
chrome (zero hits for `schedule &middot; variant`) but M3's mock-cap reads "One part, three
variants" and its figcaption "one part kind, three variants". Defensible — those are the
document's labels, not the product's — but the log's claim is broader than the fix.

**Fix:** narrow the log entry, or use "three money shapes" in the two captions.

### RR-19 · The appendix is still numbered 15 in the source comment
**nit · high confidence · `proposal.html:2073`**

`<!-- ============ 15 -->` above `<section id="appendix">`, after DR-38 removed the numbering
from the index and the eyebrow. Comment only; no reader sees it.

### RR-20 · `board_templates` RLS range disagrees between two cites
**nit · high confidence · `proposal.html:1307` (`00408:24, :37-49, :129-141`) vs `:2096`
(Constraint 6: `00408:24, :37-49, :129-144`)**

The policy body runs to 143 (`is_active_org_member` at 141, closing parens at 142–143).
Neither is wrong enough to matter; they should agree.

### RR-21 · `account-studio-page.tsx:813` is the Billing help copy, not the remit-to field
**nit · medium confidence · `proposal.html:1303`; `account-studio-page.tsx:811-823`**

`:821` is `<label htmlFor="studio-card-fee">Card fee (%)` — correct. `:813` is the middle of
the help paragraph ("The card fee and check remit-to instructions a client sees…"), not the
remit-to input. Close enough to find, not close enough to be a line cite.

### RR-22 · `.sim` and `.num` keep `white-space:nowrap` outside the wrap-reset selector
**nit · medium confidence · `proposal.html:216, :218, :275`**

D-1's render ruling added `figcaption` to the `.ref` wrap-reset (line 216, verified). `.sim`
(`:218`) and `.num` (`:275`) still carry unconditional `nowrap` and are not in that selector.
Today's `.sim` strings are short (`[simulated]`, `[disagreement 4]`) and `.num` cells are
figures, so nothing overflows now — but it is the same latent shape that caused the six 390px
failures last round.

### RR-23 · DR-19 / EV-38 remains latent (correctly declined)
**nit · high confidence · `proposal.html:611`; `source/check-prose.mjs:7, 27`**

`data-prose-total="900"` sits on `div.shell`; the gate reads it from `<body>` and falls back to
its own default of 900. No behavioural difference today, as both logs say. Recorded so the next
round that touches the script closes it.

---

## E · Gates

```
$ node source/check-fixture.mjs                                   [tail]
the Halvorsen kitchen and mudroom, Middleton  Total retainage withheld            $3,786.03
the Halvorsen kitchen and mudroom, Middleton  Final retainage release             $3,786.03
the Halvorsen kitchen and mudroom, Middleton  Total paid (all draws + final release)   $84,134

fixture math ok (65 figures)
all 65 figures present in proposal.html
                                                                  exit 0
```

```
$ node source/check-prose.mjs
section    words  cap   status
short          9   80   OK          compose       19   60   OK
asked         59   60   OK          client        54   60   OK
today         57   60   OK          turnkey       58   70   OK
trade         57   60   OK          fixture       37   60   OK
model         46   60   OK          proposals     23   60   OK
library       59   60   OK          waves         48   50   OK
                                    rulings       21   60   OK
                                    out           23   50   OK
                                    respond        1   60   OK
                                    appendix      57   60   OK

total        628  900   OK
prose budget ok                                                   exit 0
```

Every section is under cap; the appendix cap is the raised 60 and §8 the raised 70. Independently
re-derived the money: `71,300 × 1.18 = 84,134`; `71,300 × 0.18 = 12,834`; draws 10/30/40/20% of
84,134 = 8,413.40 / 25,240.20 / 33,653.60 / 16,826.80; 5% retainage on all but the deposit =
1,262.01 + 1,682.68 + 841.34 = 3,786.03; Ledger A `24,000 − 22,200 = 1,800` and
`6,150 − 5,000 = 1,150`; `31,400 × 50% = 15,700`. All correct.

**The third gate — `review/render-check.mjs` — is red (48 pass / 15 fail) and is reported in
neither fix log.** See RR-01.

---

## F · Reader test — five places a Middle West reader stops

Reading §0, §4, §8 and §12 as someone who runs a studio and hires trades:

1. **§4, the projection table.** "Deposit (procurement) → `furnishings_deposit_percent` →
   today" sits four rows above "the other nine variants → nothing reads them", and the caption
   under it says "nine mean nothing at all". *So does the deposit I already collect work, or
   not?* (RR-03)

2. **§5 → §4.** §5 tells them the turnkey template's `draws` are "Money that becomes
   authority"; §4 tells them `draws` is record-only until R9. *If I build a draw schedule, does
   Patina invoice off it or not?* (RR-04)

3. **§8 → §10, the attestation.** §8 and M7 say the attestation is a part of the template they
   fill in and complete before sending — "not a Patina gate between a studio and its own
   agreement". P10 and Wave 3's flag say the template is "selectable only when one is on file".
   *Can I even open the design-build template before my Dwelling Contractor number is typed in?*
   (RR-06)

4. **§8, M6 vs the template table.** The table says "Supervision fee vs markup — required".
   The drawing of an actual composed turnkey agreement has nine parts and none of them is that.
   *Where does my 18% supervision fee live, and why isn't it in the picture?* (RR-14)

5. **§4, D1's Class box.** "a class is narrower than a `document_kind`, not a synonym for one"
   is the first appearance of `document_kind` in the document, in a diagram box, with no
   definition — the explanation arrives 350 lines later in §5's caption. A practice reader
   hits an unexplained internal term at the exact moment the model is being introduced.
   *(No finding raised; the fix is a five-word gloss in the box, e.g. "`document_kind` — the
   database's own document type".)*

On the whole, though: **§8 now reads.** A designer who runs subs gets one prime with the
client, separate Trade Agreements with each trade, an explicit list of the four things
(flow-down, pay-when-paid, insurance, lien waivers) the current instrument cannot hold, the
licensing gate intact, and the old trade scope explained as the client's optional per-trade
authorization without a word of disparagement. That was the blocker last round and it is
closed.

---

## Summary

| Severity | Count | Ids |
|---|---|---|
| blocker | 0 | — |
| major | 8 | RR-01, RR-02, RR-03, RR-04, RR-05, RR-06, RR-07, RR-08 |
| minor | 8 | RR-09, RR-10, RR-11, RR-12, RR-13, RR-14, RR-15, RR-16 |
| nit | 7 | RR-17, RR-18, RR-19, RR-20, RR-21, RR-22, RR-23 |
| **total** | **23** | |

## Verdict — **FIX**

No blockers. D-1 through D-7 all landed, the fixture and prose gates are green, and §8 —
the thing that failed last round — now holds together. But eight majors must close first:

- **RR-01** — the render gate is red (15 failures) and neither fix log says so.
- **RR-02** — M2's money row is clipped and unreachable at 390px; DR-40's own fix caused it.
- **RR-03** — `procurement` is counted twice in §4's projection table and its caption
  contradicts one of its rows.
- **RR-04** — §5 promises billing authority for four variants §4 and R9 call record-only.
- **RR-05** — DR-16 is logged "applied" but three named tables have zero row headers.
- **RR-06** — the licensing attestation is a template-selection gate in P10 and the Wave 3
  flag, and explicitly *not* a gate in §5, §8 and M7.
- **RR-07** — `source/proposal.md`, the document's stated spine, still carries "Pledge",
  "32-word", "consent keyed by class", "five states", "countersign is unchanged" and "R1–R15".
- **RR-08** — §3 tells the reader today's retainer has a credit rule; the cited lines show an
  activation policy, and §4 proposes the credit-rule column as new work.

RR-03, RR-04, RR-06 and RR-08 are all one-sentence edits. RR-05 and RR-07 are mechanical
sweeps. RR-01 and RR-02 need a browser and a re-run. None of them reopens a design ruling.
