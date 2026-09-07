# Wave 2 web walk — round 3

**Program** "The Agreement, Composed" · Wave 2 close-out
**Date** 2026-09-07
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`
(`git -C … rev-parse --show-toplevel` printed exactly that path)
**Branch** `agreement/w2-integration` · **HEAD walked** `9e5eaa6dc3e38eec540e48f6af3277374007027b`
**Stack** local Supabase `127.0.0.1:54322`, migration ledger head `00577` — **not reset** by this walk;
no migration, no seed and no SQL file touched, so `stack-notice.md` needs no new entry from me
**Walker** designer `designer@patina.dev` (Leah Hartwell — owner of two active `design_studio` orgs,
Leah Hartwell `aaa6edf1-4b0e-4dfc-96e1-45aeb3d66297` and Local Dev Studio
`b0000000-0000-0000-0000-000000000001`), homeowners `client@patina.dev` (four houses) and
`client-solo@patina.dev`, plus `support@patina.dev` for the R3 permission pair

**Verdict — `ship`.** No blocker, no major. **All five round-2 fixes hold** (W2R2-01, -04, -05, -06,
-08 are closed, each re-proved in a browser and in SQL). The fourteen steps and every added check
(e) (f) (g) and (a)–(d) completed end to end. Six findings carry forward unchanged — one minor
defect (W2R2-02, now with a sharper mechanism), one doc correction (W2R2-03), one design gap
(W2R2-07), and three nits (W2R2-09, -10, -11). None of them blocks the wave.

---

## 1 · How the portals were booted

Both from this worktree, `nohup`, unsandboxed, keys from `supabase status -o env`,
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`; scripts `web-walk/boot-designer.sh` and
`boot-client.sh` (rounds 1–2's, reused unchanged).

- Designer `http://localhost:3000` — `agreement-parts:true,agreement-library:true,studio-workspaces:true`
- Client `http://localhost:3002` — `agreement-parts:true,agreement-library:true`

`walk-env.md`'s two round-1 additions were needed again and still hold:

- **`studio-workspaces:true`** — without it the Account sheet never renders the Studio page, so the
  Agreement Library card (walk item **b**, step 3) is unreachable.
- **`http://localhost`, never `127.0.0.1`** — Next blocks its own dev resources cross-origin from
  `127.0.0.1`, React never hydrates, every click is inert.

Both servers were confirmed serving `127.0.0.1:54321` before the first click
(`curl … | grep -o '127.0.0.1:54321'` hit on both), and **both were killed at the end** — §8.

Round-3 scripts live in `web-walk/r3/`; screenshots in `web-walk-shots-r3/`; captures in
`web-walk/r3/*.txt`.

Before the first click, the stack was confirmed to carry the round-2 SQL fixes, since the
migrations were edited in place:

```
_agreement_money                    prosrc LIKE '%FM999,999,990''%'         → t   (whole dollars)
_agreement_restore_list_item_ids    prosrc LIKE '%IS DISTINCT FROM ''array''%' → t
_log_agreement_part_events          prosrc LIKE '%IF v_why IS NOT NULL THEN%' → f   (gate removed)
_render_agreement_snapshot_html     initcap cadence → t   ·   '/ hr' → t
```

R31's restored arity is on the stack too:
`sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text)` **and**
`(uuid,text,uuid,text,jsonb)` both exist in `pg_proc`.

## 2 · Fixtures this walk made

The local seed still carries no draft `design_services` agreement, so drafts were made through the
Contract Room doorway (Desk → *Open the Contract Room* → household). The stack had been reset since
round 2, so none of round 2's fixtures survived; everything below is this walk's.

| id | household | studio | role in the walk |
|---|---|---|---|
| `68669f2b-…d7e13e` | Client User | Leah Hartwell | steps 1–2 (the executed-shape draft, saved as the template) |
| `53a9bac2-…c17727` | Client User | Leah Hartwell | steps 4–13 (template → per-phase → cost plus → send → sign → countersign → keepsake) |
| `3c70e5df-…87a8aad5` | Nora Ellison | Local Dev Studio | R32's other-studio template, R33's hidden fee, the R3 permission pair, the flag-off captures |
| `66e2d3b6-…abfbb5998` | Client User | Leah Hartwell | step 14 (the addendum), R34 |
| `b0000000-…00000000cb04` | Nora Ellison (seed) | Local Dev Studio | W2R2-02's negative case — signed by the homeowner in-app to reach `client_signed` |

Two row-level fixtures, both recorded here because they are **not** designer acts:

- `update proposal_agreement_parts set client_visible=false where … variant='flat'` on `3c70e5df` —
  still the only way to reach R33's hidden-fee state, because no UI sets it (**W2R2-07**).
- `organization_members` for `support@patina.dev` in Local Dev Studio: **inserted** as `admin`,
  flipped to `member`, flipped back to `admin`, then **deleted**. Net change: none — the row did not
  exist on this reset stack before the walk and does not exist after it.

Nothing else on the stack was written by hand.

## 3 · The eleven round-2 findings, re-verified

| id | round-2 verdict | round-3 result |
|---|---|---|
| **W2R2-01** papers without a house never reach a door | **major** | **FIXED** — the houseless leaf renders on all four doors |
| **W2R2-02** no countersign act on a project-bound design-services agreement | minor | **STILL OPEN** — reproduced, with a sharper mechanism |
| **W2R2-03** the rollback sentence is false for the homeowner | minor | **STILL OPEN** — build-sheet line unchanged; 0-line diff again |
| **W2R2-04** spurious `"items": []` from template materialisation | minor | **FIXED** — no such key on any materialised part |
| **W2R2-05** the keepsake is not the paper she signed | minor | **FIXED** — money and cadence now identical on both surfaces |
| **W2R2-06** the Contract Room overflows at 390 px | minor | **FIXED** — `scrollWidth=390` against a 390 viewport |
| **W2R2-07** no designer act hides a part from the client | minor | **STILL OPEN** — the three add paths still hard-code `clientVisible: true` |
| **W2R2-08** "A teammate" edited her own part | nit | **FIXED** — the strip reads "Added · Leah · today" |
| **W2R2-09** `record only (R9)` in studio copy | nit | **STILL OPEN** — build-sheet compliant; a ruling is owed |
| **W2R2-10** axe colour-contrast on `--color-aged-oak` | nit | **STILL OPEN** — 1 + 15 nodes, door clean |
| **W2R2-11** checkmark-as-status in Account → Studio | nit | **STILL OPEN** — still the only vocabulary hit |

### W2R2-01 — closed

`apps/client-portal/src/lib/commercial-documents.ts:409` now wraps the fall-through in a second
`nullableText`, so a DTO that **omits** `project_id` normalises to `null` instead of `undefined`.

Proved with a `sent`, project-less `design_services` agreement (`53a9bac2`) standing for
`client@patina.dev`, a household holding four houses. On the landing door and on each of the three
houses:

```
/                                                    HOUSELESS LEAF? true   door-houseless nodes 1
/projects/b0000000-…-0000000000d3 (Birch Hollow)     HOUSELESS LEAF? true   door-houseless nodes 1
/projects/b0000000-…-0000000000d4 (Marrow & Vale)    HOUSELESS LEAF? true   door-houseless nodes 1
/projects/b0000000-…-0000000000d1 (Aspen Loft)       HOUSELESS LEAF? true   door-houseless nodes 1
```

and the leaf prints exactly the sentence the ruling promised:

> This one comes before a house. It is addressed to you, so it waits on every door until you sign it.

Shot `client-01-door.png`; captures `r3/w04-door-*.txt`. Script `r3/21-client-door.mjs`.

### W2R2-04 — closed

The nine parts materialised from *Full-service residential* onto `53a9bac2` carry no `items` key
outside the two list parts:

```
patina.services  {"body": "Interior design services, …"}
patina.ceiling   {"cents": 2400000}
patina.deposit   {"depositPercent": 50}
patina.retainer  {"cents": 500000, "creditRule": "credited", "activationPolicy": "immediate"}
patina.cadence   {"cadence": "monthly"}
patina.terms     {"body": "Either party may end this agreement …"}
```

`patina.deliverables` and `patina.exclusions` carry `items` with freshly minted ids, which is the
point of `_agreement_restore_list_item_ids`. Every row is stamped
`source_template_key = studio.f8cc54f7-…`.

### W2R2-05 — closed

The keepsake body and the live body are now the same paper. Diff of the door's body
(`r3/body-live.txt`, read in full before signing) against the frozen body on
`/proposals/53a9bac2-…/record` (`r3/body-keepsake.txt`):

```
 Fee by phase
-Concept
-$8,000
-Design development
-$12,000
-Documentation
-$6,000
+Concept $8,000
+Design development $12,000
+Documentation $6,000
```

That is the whole diff. All four of round 2's divergences are gone — `$24,000.00 → $24,000`,
`$5,000.00 → $5,000`, `Concept $8,000.00 → Concept $8,000`, `monthly → Monthly`. What remains is a
line-break difference only: the live body stacks a phase's label and figure in a flex row, the
keepsake lays them in a table cell separated by a tab. Same words, same figures, same order.
Shot `step13-keepsake.png`; mark **`MARK E095B93259F4`**.

### W2R2-06 — closed

`apps/designer-portal/…/agreement-composer.tsx` now wraps the header action row (`flex flex-wrap`).
Measured at a 390 × 844 viewport on `3c70e5df` (a ten-part composed draft):

```
designer/contract-room: scrollWidth=390 viewport=390 overflow=false
client/door:            scrollWidth=390 viewport=390 overflow=false
client/record:          scrollWidth=390 viewport=390 overflow=false
designer/library-card:  scrollWidth=437 viewport=390 overflow=true
```

*Preview client copy*, *Return to the seven facets* and *Save agreement* all stand inside the
viewport (`m390-contract-room.png`). The 437 on the Account sheet is the Desk behind the sheet —
pre-existing, outside Wave 2's files, unchanged from round 2.

### W2R2-08 — closed

`_log_agreement_part_events` resolves `actor_name` for every event now, not only for the ones that
carry a `why`. On `53a9bac2`, grouped:

```
added      why=NULL                                    actor_name=Leah  ×2
edited     why="Materialized from Full-service residential"  actor_name=Leah  ×9
removed    why=NULL                                    actor_name=Leah  ×1
reordered  why=NULL                                    actor_name=Leah  ×5
```

and the strip in the room, on the Cost plus part the designer had added herself seconds earlier:

```
HISTORY

Added · Leah · today
```

Capture `r3/w2r2-08-history.txt:73-75`; shot `w2r2-08-history.png`. "A teammate" appears nowhere on
the page (`A TEAMMATE PRESENT? false`).

---

## 4 · The 14 steps

| # | Result | Evidence |
|---|---|---|
| 1 | **pass** | `step01-rail-nine-parts.png` — nine standard parts in order with kind labels (CLAUSE / LIST / ROLE RATES / CEILING / FURNISHINGS DEPOSIT / RETAINER / BILLING CADENCE) and `· CREATES AUTHORITY` on every schedule. SQL: 9 rows, positions 1–9, `patina.services … patina.terms`. Filled to executed shape through the room (rates, ceiling $24,000, retainer $5,000, deposit 50 %, terms body) → header `0 of 9 parts need attention` (`step01-executed-shape.png`). |
| 2 | **pass** | `step02a/b/c` — rail footer → *Save as template…* → "Full-service residential" → *Save to Library*. SQL: `agreement_templates` gains `studio.f8cc54f7-…`, `kind='studio'`, `class='design_services'`, `studio_id=aaa6edf1-…` (**Leah Hartwell — the agreement's studio, R32**), 9 parts. |
| 3 | **pass** | `step03-studio.png`, capture `r3/step03-studio.txt` — card order **Branding (43) → Billing (59) → Agreement defaults (73) → Agreement Library (105) → Members (127)**. TEMPLATES: three `PATINA` rows plus `STUDIO Full-service residential` with RENAME/DELETE. PARTS: "No parts saved yet…" until *Keep in the Library* was exercised (below), then `LIST · Exclusions`. |
| 4 | **pass (deviated)** | A new draft was opened through the Contract Room doorway rather than a new lead + Discovery — that path is unchanged by this wave. First open painted the nine parts at t+5s with no reload (`noParts=false rail9=true`, W-01 still closed). `step04-new-draft.png`. |
| 5 | **pass** | `step05a-template-picker.png`, `step05c-replace-warning.png`, `step05d-materialized.png`. Warning: **"This replaces the parts on this agreement. Nothing else on the draft changes."** After: nine rows, every one `source_template_key = studio.f8cc54f7-…`, room reads "The parts of Full-service residential are on this agreement." |
| 6 | **pass** | Role rates and the ceiling open (`step06a/b`). Remove the rate card → 8 parts, readiness returns to "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee." *+ Add a part → Schedule ▾ → Fee by phase* → three phases → editor **"3 phases · $26,000.00"**, chip `FEE BY PHASE · CREATES AUTHORITY`, readiness stops naming a ceiling. `step06k/l`. |
| 7 | **pass** | `step07b-cost-plus-added.png` — chip `COST PLUS · RECORD ONLY (R9)`, help line **"This is recorded on the agreement. It does not create billing authority yet."**, readiness unchanged at `0 of 10`. |
| 8 | **pass (email not verified)** | `step08b-sent.png`; SQL `status='sent'`, `commercial_state='sent'`. Reopening `/drafting/<id>` redirects to `/doc/<id>` and every rail act is gone — `+ Add a part`, *Save as template*, *Start from a template*, *Return to the seven facets*, *Save agreement* all `false` (**R6**, `step08-r6-frozen.png`). The send email could not be checked: the local `supabase_edge_runtime` container is stopped and the send returns `503`, as in both prior rounds. |
| 9 | **pass** | `r34-read-in-full.png` and capture `r3/client-paper-full.txt` — the homeowner's paper renders all ten parts in the designer's order, Fee by phase and Cost plus last, then the closing boundary sentence. No attachment leaf: the template composed from carries none (advisory, §6). |
| 10 | **pass** | `step10a/b`. Door consent line and signature-row line both **composed** — they name the per-phase fee schedule, not role rates. Press-and-hold signed. SQL: `commercial_document_signatures` party `client`, `signed_name='Client User'`, `metadata.consentSentence` = *"I agree to these design-services terms, the design authorization ceiling, the per-phase fee schedule, the retainer credited against fees, and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns."* — **R36** on a real in-app signature. |
| 11 | **pass** | `/doc/53a9bac2-…` printed `AWAITING COUNTERSIGN` / `CLIENT SIGNED` / *Countersign for the studio* / *Countersign agreement*; countersigned as Leah Hartwell. SQL `status='accepted'`, `commercial_state='executed'`, and the countersign created project `c677e20b-…` — the 00566 two-studio path resolved without refusing. `step11d/e/f`. |
| 12 | **pass** | `SELECT fee_basis, fee_amount_cents, fee_schedule, retainer_credit_rule FROM project_billing_authorities WHERE source_proposal_id='53a9bac2-…'` → `per_phase` / `2600000` / the three-phase array (`Concept 800000`, `Design development 1200000`, `Documentation 600000`) / `credited`, with `billing_ceiling_cents=2400000`. `proposal_service_terms` carries the same `per_phase` / `2600000` / array — **the per-phase projection into terms**. |
| 13 | **pass** | `step13-keepsake.png` — `/proposals/<id>/record` renders **THE AGREEMENT AS EXECUTED**, the frozen body, **`MARK E095B93259F4`**, and THE ANSWER printing the exact consent sentence she ticked. SQL: `agreement_execution_snapshots.document_hash = commercial_document_signatures.evidence_fingerprint` for `party_role='studio'` → `t` (`e095b932…f222`). **The frozen body now matches the body she signed — W2R2-05 closed.** |
| 14 | **pass** | Project → **Money** → *Create services addendum* → title + **"WHY THIS ADDENDUM … One line, kept with the addendum. Your client reads it beside the change."** with the `— Leah` attribution → *Create the addendum*. The room opens carrying all ten origin parts (`0 of 10 parts need attention`). The ceiling's HISTORY reads **"Added · Leah · today / Added the study to the scope"**; SQL: ten `added` events, `actor_name='Leah'`, that `why`. `step14b/c/d`. |

### The added checks

**(e) R33 — a hidden flat fee.** **Pass, both halves.**
A visible flat fee of $15,000 saved from the room projects (`proposal_service_terms.fee_basis='flat'`,
`fee_amount_cents=1500000`). With that part's `client_visible` set false and the amount then edited
to $16,000 and saved from the room:

```
part   {"cents": 1600000}  client_visible=f
terms  fee_basis=hourly    fee_amount_cents=NULL
```

— the hidden fee reaches neither terms nor the authority — while the editor says exactly why
(`EDITOR SAYS HIDDEN? true`, "This fee is hidden from your client, so it cannot bill.") and the
readiness panel does **not** fall back to "names no fee" (`PANEL SAYS NAMES NO FEE? false`).
Shot `r33-hidden-flat-fee-editor.png`, capture `r3/r33-hidden-room.txt`. The state is still only
reachable from SQL (**W2R2-07**).

**(f) R35 — the picker filters by kind.** **Pass.** On a `design_services` agreement the sheet
offers all three seeded design-services-kind templates plus the studio's own, each with its part
list:

```
PATINA  Consultation / hourly                Services · Role rates · Ceiling · Terms · Termination
PATINA  Design services (Patina standard)    Services · Deliverables · Exclusions · Role rates · …
PATINA  Furnishings only                     Services · Deliverables · Furnishings deposit · …
STUDIO  Full-service residential             Services · Deliverables · Exclusions · Role rates · …
```

`design_build` is not seeded, so nothing leaks. `step05a-template-picker.png`, capture
`r3/step05-picker2.txt`.

**(g) R32 — a template saved in the other studio.** **Pass, both directions.** The same designer,
owner of both studios, saved *"Other studio only — must not be offered"* from the Nora Ellison
agreement; it landed in **Local Dev Studio** (`studio_id = b0000000-…-000000000001`) while
*Full-service residential*, saved from the Client User agreement, landed in **Leah Hartwell**
(`aaa6edf1-…`) — the agreement's studio each time, never the actor's active one. The pickers agree:

```
picker on 53a9bac2 (Leah Hartwell) → STUDIO Full-service residential            OTHER STUDIO OFFERED? false
picker on 3c70e5df (Local Dev)     → STUDIO Other studio only — must not be…    OTHER STUDIO OFFERED? true
```

The Library card confirms it from the other side: `support@patina.dev`'s card in Local Dev Studio
lists only *Other studio only…* and neither of Leah Hartwell's. Shots
`r32-picker-leah-template-picker.png`, `r32-picker-localdev-template-picker.png`.
*Keep in the Library* obeys the same rule: the Exclusions part kept from `3c70e5df` wrote
`studio_agreement_parts.studio_id = b0000000-…-000000000001`.

**(a) The flag-off walks.**

- **`agreement-parts` on, `agreement-library` off** — the Library affordances vanish and nothing else
  moves. Probes on the room: *Start from a template* `false`, *Save as template* `false`,
  `+ Add a part` `true`, *Return to the seven facets* `true`. The rendered-text diff between the two
  builds is **13 lines, all Wave 2's own**:

  ```
  < FURNISHINGS DEPOSIT · CREATES AUTHORITY · DEPOSIT ONLY   > FURNISHINGS DEPOSIT
  < FLAT FEE · CREATES AUTHORITY                             > FLAT FEE
  < + Add a partStart from a template…                       > + Add a part
  < Save as template…
  ```

  Kept at `r3/flagdiff-text-both-vs-partsonly.txt`; the normalised-markup diff
  (`r3/flagdiff-both-vs-partsonly.txt`, 103 lines) adds only Next dev-server noise — font
  cache-busting query strings and router ids — on top of those same four.
  *Not proven:* byte-identity against **Wave 1 as shipped**; that needs a Wave 1 build to diff
  against, which this walk did not have (unchanged from rounds 1–2).
- **Both flags off** — the seven-facet room, `4 of 7 facets written`, and the R17(b) notice
  *"This agreement is composed from parts. It is edited in the Contract Room with parts on, where it
  can also be returned to the seven facets."* No Library affordance, no `+ Add a part`, no *Return
  to the seven facets* button (the notice carries that sentence instead). `flags-bothoff-room.png`.
- **The Account card is fail-closed** — with `agreement-library:false` and parts on, the Agreement
  Library card is absent while **Branding**, **Billing** and **Agreement defaults** stand unchanged,
  all three with their Save controls (`gate-libraryoff-account.png`).
- **The client body is byte-identical with both flags off** — **0-line HTML diff and 0-line text
  diff** between `r3/flags-both-client-door` and `r3/flags-bothoff-client-door`. By design; which is
  why the deploy note is still wrong — **W2R2-03**.

**(b) Account → Studio.** **Pass.** The Library card lists the three Patina templates plus the
studio's saved one, with Billing and Agreement defaults above it, unchanged. R3 proved on one
account from both sides (`support@patina.dev` in Local Dev Studio):

| | Library card | Save as template… | Row menu |
|---|---|---|---|
| as **admin** | RENAME + DELETE on the studio row | present | Rename · Move up · Move down · **Keep in the Library** · Remove |
| the same account as **member** | no RENAME/DELETE, the line *"Owners and admins edit the Library. Every member composes from it."* | absent | Rename · Move up · Move down · Remove |

*Start from a template…* is present for the member — every active member composes.
Shots `libcard-admin.png`, `libcard-member.png`, `room-as-admin-rowmenu.png`,
`room-as-member-rowmenu.png`.

**(c) Vocabulary grep.** Rendered text from six surfaces — Desk, Contract Room with the Schedule
submenu open, template picker, Account → Studio, homeowner door read in full, keepsake — against
"clause library", "contract builder", "variant", "AI", twelve DB column names, emoji, and the
homeowner-only "gate"/"task"/"dashboard"/"overdue". **One hit, unchanged from rounds 1–2:**

```
designer/account-studio :: emoji :: … EXTENSION STUDIO STILL TO DO 4 ✓ Name & brand the studio …
```

Captures `r3/vocab-*.txt`.

**(d) axe (axe-core 4.11.1, whole document, violations only).**

| surface | violations |
|---|---|
| Contract Room | `color-contrast` ×1 (serious) + `landmark-no-duplicate-banner`, `landmark-one-main`, `landmark-unique`, `meta-viewport`, `region` (moderate) |
| Account → Studio / Library card | `color-contrast` ×15 (serious) + `meta-viewport`, `region` (moderate) — none inside the Agreement Library card |
| homeowner door | **0** |

Raw JSON `r3/axe-contract-room.json`, `axe-library-card.json`, `axe-client-door.json`.
Byte-for-byte the same picture as round 2 — **W2R2-10**.

---

## 5 · Findings

### W2R2-02 · minor · a project-bound design-services agreement the homeowner has signed has no countersign act anywhere

`apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`

Reproduced, and the mechanism is sharper than round 2's reading. `b0000000-…-00000000cb04`
(*Cedar Lane — Phase Work*, `design_services`, bound to project `b0000000-…-00000000c0d1`, which
already carries the executed `cb01`) was signed **in the app** by `client-solo@patina.dev` this
round, reaching `status='sent'`, `commercial_state='client_signed'`. Every designer route for it
then redirects to the project document and offers nothing:

```
/doc/…cb04        -> /doc/…c0d1   countersign? false   record the signature? false   client signed? false
/drafting/…cb04   -> /doc/…c0d1   countersign? false   record the signature? false   client signed? false
/proposals/…cb04  -> /doc/…c0d1   countersign? false   record the signature? false   client signed? false
/projects/…c0d1   -> /doc/…c0d1   countersign? false   record the signature? false   client signed? false
```

`record-the-signature buttons on the project: 0`.

Two positive controls this round, both of which countersigned cleanly and both of which are
**project-less**: the origin agreement `53a9bac2` (`HAS COUNTERSIGN true`, step 11) and the addendum
`66e2d3b6` after the homeowner signed it (`HAS COUNTERSIGN true` — and note its `project_id` is
NULL, so round 2's "same project family" control was project-less too). So the discriminator is the
**project binding**, not the document kind: once a proposal carries a `project_id`, `/doc/<id>`
resolves to the project document and the commercial-document surface — with its countersign panel —
is never reached.

Severity kept at minor because the state looks unreachable through the product: a `design_services`
agreement gets its project **at** countersign (00331 / 00566 ORIGIN), the Contract Room doorway
creates project-less drafts, and the addendum path does too. `cb04` is a seed fixture (the R36
per-phase `sent` fixture the e2e drives). It is worth a ruling all the same, because that fixture is
one homeowner signature away from a document no studio act can finish.

Shots `w2r2-02-cb04-signed.png`, `w2r2-02-cb04-doc.png`, `w2r2-02-addendum-signed.png`; captures
`r3/cb04-doc-*.txt`.

**Fix:** route a `client_signed` commercial document to its own surface even when it is
project-bound, or surface the countersign act on the project document for the paper that is waiting.

### W2R2-03 · minor · the deploy note's rollback sentence is still false for the homeowner

`artifacts/agreement-composed-2026-09-06/build/waves/w2/build-sheet.md:936`

Still reads "**Rollback.** Flag off is the first lever and reverts every surface." With both flags
off the homeowner's door renders **byte-identically** to both-flags-on: 0-line HTML diff, 0-line text
diff between `r3/flags-both-client-door.html/.txt` and `r3/flags-bothoff-client-door.html/.txt`.
Deliberate — `apps/client-portal/src/lib/commercial-documents.ts`: the homeowner has no flag, the
bundle's `composed` key is the switch.

**Fix:** correct the deploy note — the client-side lever is `discard_agreement_parts` / the bundle's
`composed` key, not the PostHog flag. Unchanged from round 2; no code is at fault.

### W2R2-07 · minor · no designer act can hide a part from the client

`apps/designer-portal/src/components/document/rooms/drafting/agreement/add-part-sheet.tsx:160,285,331`
· `…/account/agreement-library-card.tsx:180`

Unchanged at this head. The three add paths still hard-code `clientVisible: true`; the picker lays
down `row.clientVisibleDefault` (`:179`) but the only writer of that default is *Keep in the
Library*, which copies the part's current `clientVisible` (true); the Library card passes the stored
default through and offers RENAME/DELETE only. So R33's whole path — the hidden fee, its readiness
sentence, and the terms row it must not reach — is reachable only from SQL, exactly as in rounds 1
and 2; this walk had to create the state with an `UPDATE`.

**Fix:** either add a "hidden from the client" act on the row menu or the part editor, or record
that R33 is defence-in-depth against a state no UI can create.

### W2R2-09 · nit · `record only (R9)` is an internal ruling id in studio copy

`apps/designer-portal/src/components/document/rooms/drafting/agreement/add-part-sheet.tsx:67`

Rendered on the Schedule submenu row and on the rail chip: `COST PLUS · RECORD ONLY (R9)`
(`step07b-cost-plus-added.png`). Build sheet SS4.2 and walk step 7 specify exactly this string, so
it is compliant, not a deviation. A ruling is owed before Leah reads it: keep the string, or drop
the "(R9)". Third round unchanged.

### W2R2-10 · nit · axe colour-contrast on `--color-aged-oak`

`packages/patina-design-system/src/styles`

`#8b7355` on white at 11 px measures 4.48:1 against the 4.5 floor. One serious node in the Contract
Room, fifteen in the Account sheet (profile row, status label, the "Still to do" checklist) — none
inside the Agreement Library card. Homeowner door: zero violations. Darkening the token a hair fixes
all sixteen. Identical to round 2.

### W2R2-11 · nit · a checkmark-as-status glyph in Account → Studio

`apps/designer-portal/src/components/document/account/studio-setup-checklist.tsx`

The single hit in the vocabulary grep across both portals, pre-existing and outside the Library card
(`STUDIO STILL TO DO 4 ✓ Name & brand the studio …`). The paper-register rule asks for a non-glyph
mark.

---

## 6 · Advisories (not findings)

- **The addendum's `why` is behind *Read it in full*, not on the door's face.** R34 is satisfied —
  the paper the homeowner reads carries "Added the study to the scope" at its head, above Services
  (`WHY ON DOOR (expanded): true`, capture `r3/r34-door-full.txt`) — but the collapsed door face
  shows only the consent block (`WHY ON DOOR (collapsed): false`). Every part of the body sits
  behind the same disclosure, so this is consistent rather than special, and it is recorded only in
  case the ruling meant the face.
- The send email could not be checked in any of the three rounds: the local `supabase_edge_runtime`
  container is stopped, so every send returns `503` and the execution notice reports "pending".
  Nothing about the email path has been walked.
- Step 9's attachment leaf (`ATTACHMENT A` + "I received this") was **not** re-walked — the template
  this round composed from carries no attachment. Round 1 proved it on the seeded `cb04` fixture.
- Byte-identity of the flag-off room against **Wave 1 as shipped** is still unproven; only the
  same-build both-on / parts-only diff was measured.
- Account → Studio's PARTS shelf prints a count ("Lists 1"). SS9 step 3 asks for "counts by kind",
  so it is specified — noted only because the vocabulary rule bans numeric count chips elsewhere.
- The four houseless-door screenshots collapsed onto two filenames (the tag is truncated at 40
  characters); the console proof for all four doors is in §3 and the captures are per-door.

## 7 · What was NOT verified

- Nothing was run against Strata; no migration, seed, edge function or Worker was touched.
- No SQL suite, no jest, no Playwright suite, no lint/type-check — this was a browser walk only; the
  gates belong to the integration steward's re-gate.
- R31's regenerated grants seed was **not** replayed by this walk (the stack was not reset). Its two
  arities were confirmed present in `pg_proc` on the stack as it stood; whether a fresh
  `supabase db reset` replays the seed clean is the steward's gate, not this walk's.

## 8 · Housekeeping

- **Both dev servers this walk started were killed**; ports 3000 and 3002 confirmed free at the end.
  Logs kept at `web-walk/designer-r3-*.log` and `client-r3-*.log` (four designer boots: both-on,
  parts-only, both-off, restore; three client boots: both-on, both-off, restore).
- **The shared local stack was not reset and carries no schema change from this walk** — ledger head
  `00577`, this branch's `00575`/`00576`/`00577` and the regenerated grants seed, exactly as the
  round-2 walk-fix agent left it. `stack-notice.md` therefore needs no new entry.
- Row-level fixtures are listed in §2. `support@patina.dev`'s Local Dev Studio membership was
  inserted for the R3 pair and **deleted** afterwards, restoring the stack to its pre-walk shape.
  The proposals, templates, parts and events this walk created remain on the stack as walk evidence.
- Nothing was pushed.
