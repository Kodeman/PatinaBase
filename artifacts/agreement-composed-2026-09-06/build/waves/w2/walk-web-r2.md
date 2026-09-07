# Wave 2 web walk — round 2

**Program** "The Agreement, Composed" · Wave 2 close-out
**Date** 2026-09-07
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`
(`git -C … rev-parse --show-toplevel` printed exactly that path)
**Branch** `agreement/w2-integration` · **HEAD walked** `259fbd323c9529f30f7c1104bc956d03f6ea3c21`
**Stack** local Supabase `127.0.0.1:54322`, migration ledger head `00577` — **not reset** by this walk,
no migration and no seed file touched (`stack-notice.md` needs no new entry from me)
**Walker** designer `designer@patina.dev` (owner of two active `design_studio` orgs — Leah Hartwell
`339c1ae6-…` and Local Dev Studio `b0000000-…-000000000001`), homeowner `client@patina.dev`
(four houses at the start of the walk), plus `studio_manager@patina.dev` and `support@patina.dev`
for the R3 permission cases.

**Verdict — `fix`.** No blocker. **One major: W-04 is not fixed** — the fix landed in the right file
and compares against the wrong value, so a household that already has a house still cannot reach a
second origin agreement from any door. Everything else in the 14 steps completed end to end, and
**W-01, W-02 and W-03 are closed**.

---

## 1 · How the portals were booted

Both from this worktree, `nohup`, unsandboxed, keys from `supabase status -o env`,
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`; scripts `web-walk/boot-designer.sh` and
`boot-client.sh` (round 1's, reused unchanged).

- Designer `http://localhost:3000` — `agreement-parts:true,agreement-library:true,studio-workspaces:true`
- Client `http://localhost:3002` — `agreement-parts:true,agreement-library:true`

Round 1's two additions to `walk-env.md` still hold and were needed again:

- **`studio-workspaces:true`** — without it `account-sheet.tsx` never renders the Studio page, so
  the Agreement Library card (walk item **b**, step 3) is unreachable.
- **`http://localhost`, never `127.0.0.1`** — Next blocks its own dev resources cross-origin from
  `127.0.0.1`, React never hydrates, every click is inert.

Both servers were confirmed serving `127.0.0.1:54321` before the first click, and **both were killed
at the end** — see §8.

Round-2 scripts live in `web-walk/r2/`; screenshots in `web-walk-shots-r2/`.

## 2 · Fixtures this walk made

The local seed still carries no draft `design_services` agreement, so drafts were made through the
Contract Room doorway (Desk → *Open the Contract Room* → household). Round 1's fixtures survived on
the stack and were reused where useful.

| id | household | studio (`_agreement_studio_id`) | role |
|---|---|---|---|
| `390cb933-…d7a88a` | Client User | Leah Hartwell | steps 1–2, W-03 (round-1 fixture, reused) |
| `2eb44586-…4ed61` | Nora Ellison | Local Dev Studio | W-01 proof #1, R33, R3 permission cases |
| `4dda7f9b-…b9161` | Client User | Leah Hartwell | steps 4–8, 11–12, W-01 proof #2, W-04 |
| `9b99981e-…c42f` | Client User | Leah Hartwell | W-04 final proof, W-01 proof #3 |
| `72202265-…fda21` | Client User | Leah Hartwell | steps 9–13 (round-1 composed addendum, signed in-app here) |
| `123f3234-…d387` | Client User | Leah Hartwell | step 14 (the addendum this walk created) |

Two SQL fixtures, both recorded here because they are not designer acts:

- `update proposal_agreement_parts set client_visible=false where … variant='flat'` on `2eb44586` —
  the only way to reach R33's hidden-fee state, because no UI sets it (see **W2R2-07**).
- `organization_members.role` on `support@patina.dev` in Local Dev Studio flipped `admin → member →
  admin` for the R3 pair. **Net change: none** — it is back where round 1 left it.

Nothing else on the stack was written by hand.

## 3 · The prior round's twelve findings, re-verified

| id | round-1 verdict | round-2 result |
|---|---|---|
| **W-01** first open shows no parts | major | **FIXED** — three households, three first opens, `noParts=false` and the nine rows painted at t+5s |
| **W-02** R33's sentence can never render | major | **FIXED** — the editor prints it; the "names no fee" line steps aside |
| **W-03** no act creates a studio Part | major | **FIXED** — *Keep in the Library* in the row menu; the PARTS shelf fills. **Residual: W2R2-07** |
| **W-04** papers without a house | major | **NOT FIXED — W2R2-01** |
| **W-05** SS10 rollback line is false for the homeowner | minor | **STILL OPEN — W2R2-03** (0-line diff again) |
| **W-06** no countersign on a project-bound agreement | minor | **STILL OPEN — W2R2-02**, now with a positive control |
| **W-07** spurious `"items": []` | minor | **STILL OPEN — W2R2-04** |
| **W-08** "A teammate" edited her own part | nit | **STILL OPEN — W2R2-08** |
| **W-09** `record only (R9)` in studio copy | nit | **STILL OPEN — W2R2-09** (build-sheet compliant; needs a ruling) |
| **W-10** 390px overflow in the room | minor | **STILL OPEN — W2R2-06** (`scrollWidth` 617 again) |
| **W-11** axe colour-contrast | nit | **STILL OPEN — W2R2-10** (1 + 15 nodes, door clean) |
| **W-12** checkmark-as-status | nit | **STILL OPEN — W2R2-11** (still the only vocabulary hit) |

### W-01 — closed

`web-walk/r2/01-w01-firstopen.mjs`, run on three fresh agreements (Nora `2eb44586`, Client User
`4dda7f9b`, Client User `9b99981e`). Every one sampled at t+5s/+10s/+20s/+35s:

```
NEW DRAFT 2eb44586-f388-410b-8e3e-5ea263d4ed61
t+5s: noParts=false rail9=true header="· 2 of 9 parts need attention"
```

SQL immediately after: nine rows, positions 1–9, keys `patina.services … patina.terms`.
No reload was needed at any point. Shots `w01-first-open-r2.png`, `step04-new-draft-clientuser.png`,
`w04-new-draft.png`.

### W-02 — closed

With the hidden flat fee on `2eb44586` (`26-r33-hidden.mjs`):

```
EDITOR SAYS HIDDEN?     true    ("This fee is hidden from your client, so it cannot bill.")
PANEL SAYS NAMES NO FEE? false
```

Shot `r33-hidden-flat-fee-editor.png`; capture `r2/r33-hidden-room.txt`.

### W-03 — closed (with a residual)

`04-w03-keep-in-library.mjs` on `390cb933`. The row menu now reads
`Rename / Move up / Move down / Keep in the Library / Remove`; the footer note reads
**"Exclusions is in your Library."**; reopening the menu shows **"Kept in the Library"**, disabled.
SQL: one `studio_agreement_parts` row, `studio_id = 339c1ae6-…` (the agreement's studio, R32),
`client_visible_default = t`, `created_by` the designer. Account → Studio's PARTS shelf now reads
**Lists 1** with a `LIST · Exclusions` row and RENAME/DELETE — SS9 step 3's "PARTS shows counts by
kind" is walkable for the first time.
Shots `w03-part-menu.png`, `w03-after-keep.png`, `w03-part-menu-after.png`, `step03-studio.png`.

---

## 4 · The 14 steps

| # | Result | Evidence |
|---|---|---|
| 1 | **pass** | `step01-rail-nine-parts.png` — nine standard parts in order with kind labels and `CREATES AUTHORITY` on every schedule; header `0 of 9 parts need attention`. SQL: 9 rows, positions 1–9, `patina.services … patina.terms`. |
| 2 | **pass** | `step02a/b/c` — rail footer → *Save as template…* → "Full-service residential r2" → *Save to Library*; the footer reads **"Saved to your Library."** SQL: `agreement_templates` gains `studio.37c6bc5a-…`, `kind='studio'`, `studio_id=339c1ae6-…` (Leah Hartwell — **R32**), 9 parts, `created_by` the designer. |
| 3 | **pass** | `step03-studio.png` — card order Branding → **Billing** → Agreement defaults → **Agreement Library** → Members. TEMPLATES: three `PATINA` rows plus two `STUDIO` rows with RENAME/DELETE. PARTS: **Lists 1**. |
| 4 | **pass (deviated)** | A new draft was opened through the Contract Room doorway rather than a new lead + Discovery — that path is unchanged by this wave. `step04-new-draft-clientuser.png`. |
| 5 | **pass** | `step05a-template-picker.png`, `step05c-replace-warning.png`, `step05d-materialized.png`. Warning reads **"This replaces the parts on this agreement. Nothing else on the draft changes."** SQL: nine rows, every one stamped `source_template_key = studio.37c6bc5a-…`; the room reads "The parts of Full-service residential r2 are on this agreement." |
| 6 | **pass** | Role rates and the ceiling open (`step06a/b`). Remove the rate card → save → 8 parts, `patina.role_rates` gone, readiness returns to "This agreement names no fee." *+ Add a part → Schedule ▾ → Fee by phase* → three phases → editor **"3 phases · $26,000.00"**, chip `FEE BY PHASE · CREATES AUTHORITY`, readiness stops naming a ceiling. `step06k/l`. |
| 7 | **pass** | `step07b-cost-plus-added.png` — chip `COST PLUS · RECORD ONLY (R9)`, help line **"This is recorded on the agreement. It does not create billing authority yet."**, readiness unchanged at `0 of 10`. |
| 8 | **pass (email not verified)** | `step08b-sent.png`; SQL `status='sent'`, `commercial_state='sent'`. Reopening `/drafting/<id>` redirects to `/doc/<id>` — the rail and its acts are gone (R6). The send email could not be checked: the local `supabase_edge_runtime` container is stopped and the send returns `503` (same as round 1). |
| 9 | **pass** | `step09-read-it-in-full.png` — the homeowner's paper renders all ten parts in the designer's order, Fee by phase and Cost plus last, then the closing boundary sentence. Capture `r2/client-paper-full.txt`. |
| 10 | **pass** | `step10a/b`. Door consent line and signature-row line both composed; press-and-hold signed. SQL: `commercial_document_signatures` party `client`, `signed_name='Client User'`, and `metadata.consentSentence` carries **"I agree to these design-services terms, the design authorization ceiling, the per-phase fee schedule, the retainer credited against fees, and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns."** — **R36** proved on a real in-app signature. |
| 11 | **pass, both routes** | (a) The composed addendum `72202265` offered *Countersign for the studio* directly → `step11f-executed.png`. (b) The origin agreement `4dda7f9b`, project-less, via *Record the signature* → *Countersign agreement*: SQL `status='accepted'`, `commercial_state='executed'`, and the countersign created project `5870856c-…` in studio **Leah Hartwell** — the 00566 two-studio path resolved without refusing. |
| 12 | **pass** | `SELECT fee_basis, fee_amount_cents, fee_schedule, retainer_credit_rule FROM project_billing_authorities WHERE source_proposal_id='4dda7f9b-…'` → `per_phase` / `2600000` / the three-phase array / `credited`, with `billing_ceiling_cents=2400000`. The same shape on `72202265`. `proposal_service_terms` for `4dda7f9b` carries `per_phase` / `2600000` / the array — **the per-phase projection into terms**. |
| 13 | **pass** | `step13-keepsake-inapp.png` — `/proposals/<id>/record` renders **THE AGREEMENT AS EXECUTED**, the frozen body, the mark **`MARK A822B0D81AFA`**, and THE ANSWER printing the exact consent sentence she ticked. SQL: `agreement_execution_snapshots.document_hash = commercial_document_signatures.evidence_fingerprint` for `party_role='studio'` → `t`, on both `72202265` and `4dda7f9b`. **Caveat: the frozen body is not byte-identical to the body she signed — W2R2-05.** |
| 14 | **pass** | Project → **Money** → *Create services addendum* → title + **"WHY THIS ADDENDUM … One line, kept with the addendum. Your client reads it beside the change."** → *Create the addendum*. The room opens carrying all ten origin parts. `step14d`-equivalent: the ceiling's HISTORY reads **"Added · Leah · today / Added the study to the scope"**. SQL: `agreement_part_events` for `123f3234-…` carry `actor_name='Leah'` and that `why`. |

### The added checks

**(e) R33 — a hidden flat fee.** **Pass, both halves.**
A visible flat fee of $15,000 saved from the room projects (`proposal_service_terms.fee_basis='flat'`,
`fee_amount_cents=1500000`). With that part's `client_visible` set false and the amount then edited to
$16,000 and saved from the room: the part keeps `{"cents": 1600000}` and terms fall back to
`fee_basis='hourly'`, `fee_amount_cents=NULL` — **the hidden fee reaches neither terms nor the
authority** — while the editor says exactly why (W-02's fix). The state is still only reachable from
SQL (**W2R2-07**).

**(f) R35 — the picker filters by kind.** **Pass.** On a `design_services` agreement the sheet offers
*Consultation / hourly*, *Design services (Patina standard)*, *Furnishings only* — all three seeded
design-services-kind templates — plus the studio's own two. `design_build` is not seeded, so nothing
leaks. `step05a-template-picker.png`, capture `r2/step05-picker.txt`.

**(g) R32 — a template saved in the other studio.** **Pass.** On `4dda7f9b` (studio = Leah Hartwell)
the picker offers *Full-service residential* and *Full-service residential r2* and **not** Local Dev
Studio's *"Other studio only — must not be offered"* (probe printed `OTHER STUDIO OFFERED? false`).
The reverse is visible from Local Dev Studio: the member's Library card there lists that template and
neither of Leah Hartwell's (`r2/libcard-member.txt`).

**(a) The flag-off walks.**

- **`agreement-parts` on, `agreement-library` off** — the Library affordances vanish
  (*Start from a template…* and *Save as template…* absent, `+ Add a part` and *Return to the seven
  facets* stand). Markup diff `flags-both-room.html` vs `flags-partsonly-room.html` is **83 lines,
  all Wave 2's own**: every authority chip loses its `data-authority-standing` span and becomes plain
  text, "Furnishings deposit · creates authority · deposit only" becomes "Furnishings deposit",
  "Flat fee · creates authority" becomes "Flat fee", the footer loses its two buttons, and the
  Add-a-part control reverts to Wave 1's shape. Diff kept at `r2/flagdiff-both-vs-partsonly.txt`.
  *Not proven:* byte-identity against **Wave 1 as shipped** — that needs a Wave 1 build to diff
  against, which this walk did not have (unchanged from round 1).
- **Both flags off** — the seven-facet room, `4 of 7 facets written`, the R17(b) notice
  *"This agreement is composed from parts. It is edited in the Contract Room with parts on, where it
  can also be returned to the seven facets."*, and no Library affordance. `flags-bothoff-room.png`.
- **The Account card is fail-closed** — with `agreement-library:false` and parts on, the Agreement
  Library card is absent while Branding, **Billing** and **Agreement defaults** stand unchanged, all
  three with their Save controls (`gate-libraryoff-account.png`, `r2/gate-libraryoff-account.txt`).
- **The client body is byte-identical with both flags off** — 0-line HTML diff and 0-line text diff
  between `flags-both-client-door` and `flags-bothoff-client-door`. By design
  (`commercial-documents.ts` — the homeowner has no flag, the bundle's `composed` key is the switch),
  which is why the deploy note is still wrong: **W2R2-03**.

**(b) Account → Studio.** **Pass.**
The Library card lists the three Patina templates plus the studio's saved ones; Billing and Agreement
defaults sit above it, unchanged. R3 proved on the same account pair from both sides:

| | Library card | Save as template… | Row menu |
|---|---|---|---|
| `support@patina.dev` as **admin** of Local Dev Studio | RENAME + DELETE, Save on Billing/Branding/Agreement defaults | present | Rename · Move up · Move down · **Keep in the Library** · Remove |
| the same account as **member** | no RENAME/DELETE, the line *"Owners and admins edit the Library. Every member composes from it."*, no Save on any card | absent | Rename · Move up · Move down · Remove |

*Start from a template…* is present for the member — every active member composes.
Shots `libcard-admin2.png`, `libcard-member.png`, `room-as-admin-rowmenu.png`,
`room-as-member-rowmenu.png`.

**(c) Vocabulary grep.** Rendered text from six surfaces — Desk, Contract Room with the Schedule
submenu open, template picker, Account → Studio, homeowner door read in full, keepsake — against
"clause library", "contract builder", "variant", "AI", twelve DB column names, emoji, and the
homeowner-only "gate"/"task"/"dashboard"/"overdue". **One hit, unchanged from round 1:**

```
designer/account-studio :: emoji :: … EXTENSION STUDIO STILL TO DO 4 ✓ Name & brand the studio …
```

Captures `r2/vocab-*.txt`.

**(d) axe (axe-core 4.11.1, whole document, violations only).**

| surface | violations |
|---|---|
| Contract Room | `color-contrast` ×1 (serious) + `landmark-no-duplicate-banner`, `landmark-one-main`, `landmark-unique`, `meta-viewport`, `region` (moderate) |
| Account → Studio / Library card | `color-contrast` ×15 (serious) + `meta-viewport`, `region` |
| homeowner door | **0** |

Raw JSON `r2/axe-contract-room.json`, `axe-library-card.json`, `axe-client-door.json`.

**390 px.** `designer/contract-room: scrollWidth=617 viewport=390 overflow=true`, offending node the
header action row `DIV.flex items-center gap-3` (right edge 617). `designer/library-card: 437 vs 390`
(the Desk behind the sheet). The homeowner's door and keepsake are clean at 390.

---

## 5 · Findings

### W2R2-01 · major · the papers without a house never reach a door — W-04 is not fixed

`apps/client-portal/src/components/threshold/threshold.tsx:452`

The fix reads:

```ts
const houseless =
  commercial.projectId === null && commercial.kind === 'design_services';
if (!houseless && commercial.projectId !== projectId) return [];
```

`commercial.projectId` is never `null` for a project-less paper. `list_client_proposals` **omits the
key entirely** when the column is NULL, and `commercialSummaryFromProposal`
(`apps/client-portal/src/lib/commercial-documents.ts:409`) computes
`nullableText(first(source, 'projectId', 'project_id')) ?? proposal.project_id` — both sides
`undefined`, so the summary carries `undefined`, `houseless` is `false`, and the second line filters
the paper off every door exactly as before the fix.

Proved from both ends. The RPC, run as the homeowner:

```
select (e ? 'project_id') …  →  f          -- the key is absent, not null
{ "id": "9b99981e-…", "title": "Client User — design services agreement",
  "status": "sent", "document_kind": "design_services", "commercial_state": "sent" }
```

and the browser, with that `sent` project-less agreement standing and the household holding five
houses — the landing door, Birch Hollow, and the house her first agreement created all read:

```
Nothing waits for your name.
```

`HOUSELESS LEAF? false` and `document.querySelectorAll('[data-testid="door-houseless"]').length === 0`
on all three. Screenshots `w04-door--.png`, `w04-door-projects-b0000000.png`,
`w04-door-projects-5870856c.png`; captures `r2/w04-door-*.txt`. The same result on the earlier
agreement `4dda7f9b` before it was countersigned (`client-door-house1.png`,
`client-door--projects-b0000000-0000-0000-0.png`) and on the `?proposal=…#door` deep link
(`client-door---proposal-4dda7f9b-e3ee-44d5-.png`).

Fix: compare on absence, not on `null` — `commercial.projectId == null`, or have
`commercialSummaryFromProposal` normalise a missing `project_id` to `null`. A jest case that feeds
the summary a DTO **without** the key is what round 1's test missed: the fixture in
`threshold.test.tsx` supplies `projectId: null`, which the RPC never sends.

### W2R2-02 · minor · no countersign act on a project-bound design-services agreement (was W-06)

`apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`

`b0000000-…-00000000cb04` is `client_signed`, `design_services`, bound to project
`b0000000-…-c0d1`. `/doc/<id>` renders the project document and the whole page contains no
"countersign" (`HAS COUNTERSIGN false`). The positive control this round makes it sharper: the
composed **addendum** `72202265`, in the same shape and on the same portal, prints
`AWAITING COUNTERSIGN`, *Countersign for the studio* and *Countersign agreement*
(`HAS COUNTERSIGN true`) and countersigned cleanly. So the act is not missing in general — it is
missing on the design-services document that shares a project with an already-executed one.
Confidence raised from round 1's 0.7.

### W2R2-03 · minor · the deploy note's rollback sentence is still false for the homeowner (was W-05)

`artifacts/agreement-composed-2026-09-06/build/waves/w2/build-sheet.md:894` still reads
"Flag off is the first lever and reverts every surface." With both flags off the homeowner's door
renders byte-identically to both-flags-on: **0-line HTML diff, 0-line text diff**
(`r2/flags-both-client-door.html` vs `r2/flags-bothoff-client-door.html`). The client-side lever is
`discard_agreement_parts` / the bundle's `composed` key, not the PostHog flag.

### W2R2-04 · minor · `materialize_agreement_template` writes a spurious `"items": []` (was W-07)

`supabase/migrations/00576_agreement_library.sql:469`

Every part materialised from a template carries the key, clause and money parts included:

```
patina.services  {"body": "…", "items": []}
patina.ceiling   {"cents": 2400000, "items": []}
patina.retainer  {"cents": 500000, "items": [], "creditRule": "credited", …}
patina.cadence   {"items": [], "cadence": "monthly"}
```

Parts written by `materialize_standard_parts` carry no such key (compare `390cb933`'s rows).
Nothing renders it, but the fingerprint hashes payloads, so two otherwise identical papers hash
differently depending on how they were composed.

### W2R2-05 · minor · the keepsake is not the paper she signed (new)

`supabase/migrations/00577_agreement_fee_schedules.sql` (the SQL body renderer) vs
`apps/client-portal/src/components/threshold/agreement-parts-body.tsx`

R37 rules that "the keepsake's SQL renderer matches `agreement-parts-body.tsx`". It does not. Diffing
the body she read on the door against the frozen body on `/proposals/<id>/record`
(`r2/body-live.txt` vs `r2/body-keepsake.txt`):

```
-$24,000        +$24,000.00
-$5,000         +$5,000.00
-Monthly        +monthly
-Concept $8,000 +Concept  $8,000.00
```

Confirmed in the stored HTML itself (`agreement_execution_snapshots.html`):
`<h2>Ceiling</h2><p>$24,000.00</p> … <h2>Billing cadence</h2><p>monthly</p>`. The list-marker
difference (`— item` vs `<li>`) is presentational and may be intended; the money precision and the
un-capitalised cadence are not. The keepsake is the record of what she consented to, so it should
read as the paper did.

### W2R2-06 · minor · the Contract Room overflows at 390 px (was W-10)

`apps/designer-portal/src/components/document/rooms/drafting/agreement/agreement-composer.tsx`

`document.documentElement.scrollWidth = 617` against a 390 viewport. Offending node the header action
row `DIV.flex items-center gap-3` holding *Preview client copy* / *Return to the seven facets* /
*Save agreement*, which do not wrap; the third button is clipped off-screen.
`m390-contract-room.png`. Account → Studio measures 437 (the Desk behind the sheet). The homeowner's
door and keepsake are clean.

### W2R2-07 · minor · no designer act can hide a part from the client (residual of W-03)

`apps/designer-portal/src/components/document/rooms/drafting/agreement/add-part-sheet.tsx:160,285,331`
· `…/account/agreement-library-card.tsx`

W-03's *Keep in the Library* closes the promise the PARTS shelf made, and it carries a part's
`clientVisible` into `clientVisibleDefault` — which the picker then lays back down
(`add-part-sheet.tsx:179`). But nothing anywhere ever **sets** that flag false: the three add paths
hard-code `clientVisible: true`, the Library card's rename passes the stored default through, and the
row menu offers no visibility act. So R33's whole path — the hidden fee, its readiness sentence, and
the terms row it must not reach — is reachable only from SQL, exactly as in round 1. Either add a
"hidden from the client" act, or record that R33 is defence-in-depth against a state no UI can
create.

### W2R2-08 · nit · "A teammate" edited her own part (was W-08)

`supabase/migrations/00577_agreement_fee_schedules.sql`

`agreement_part_events` on `4dda7f9b`, grouped:

```
added      why=NULL                                     actor_name=NULL   ×2
edited     why="Materialized from Full-service residential r2"  actor_name=Leah  ×9
removed    why=NULL                                     actor_name=NULL   ×1
reordered  why=NULL                                     actor_name=NULL   ×5
```

`actor_name` is written only when a `why` is present, so the room's HISTORY strip reads
**"Added · A teammate · today"** for a part the designer added herself thirty seconds earlier
(`r2/r33-hidden-room.txt`, `r33-hidden-flat-fee-editor.png`). Template materialisation and the
addendum path, which carry a `why`, read "Leah".

### W2R2-09 · nit · `record only (R9)` is an internal ruling id in studio copy (was W-09)

`apps/designer-portal/src/components/document/rooms/drafting/agreement/add-part-sheet.tsx:67`

Rendered on the Schedule submenu row and the rail chip: `COST PLUS · RECORD ONLY (R9)`
(`step07b-cost-plus-added.png`). Build sheet SS4.2 and walk step 7 specify exactly this string, so it
is compliant, not a deviation. A ruling is owed before Leah reads it: keep the string, or drop the
"(R9)".

### W2R2-10 · nit · axe colour-contrast on `--color-aged-oak` (was W-11)

`packages/patina-design-system/src/styles`

`#8b7355` on white at 11px measures 4.48:1 against the 4.5 floor. One serious node in the Contract
Room ("The client's copy · live"), fifteen in the Account sheet — profile row, status label, the
"Still to do" checklist — none inside the Agreement Library card. Homeowner door: zero violations.
Darkening the token a hair fixes all sixteen.

### W2R2-11 · nit · a checkmark-as-status glyph in Account → Studio (was W-12)

`apps/designer-portal/src/components/document/account/studio-setup-checklist.tsx`

The single hit in the vocabulary grep across both portals, pre-existing and outside the Library card.
The paper-register rule asks for a non-glyph mark.

---

## 6 · Advisories (not findings)

- The send email could not be checked in either round: the local `supabase_edge_runtime` container is
  stopped, so every send returns `503` and every execution notice reports "pending". Nothing about the
  email path was walked.
- Step 9's attachment leaf (`ATTACHMENT A` + "I received this") was **not** re-walked — the template
  this round composed from carries no attachment. Round 1 proved it on the seeded `cb04` fixture.
- Byte-identity of the flag-off room against **Wave 1 as shipped** is still unproven; only the
  same-build both-on / parts-only diff was measured.
- Account → Studio's PARTS shelf prints a count ("Lists 1"). SS9 step 3 asks for "counts by kind", so
  it is specified — noting it only because the vocabulary rule bans numeric count chips elsewhere.

## 7 · What was NOT verified

- Nothing was run against Strata; no migration, seed, edge function or Worker was touched.
- No SQL suite, no jest, no Playwright suite — this was a browser walk only; the gates belong to the
  integration steward's re-gate.
- `studio_manager@patina.dev`'s active studio is his own auto-provisioned one, so his sheet proves
  nothing about Local Dev Studio; the admin case was proved on `support@patina.dev` instead.

## 8 · Housekeeping

- **Both dev servers this walk started were killed**; ports 3000 and 3002 confirmed free at the end.
  Logs kept at `web-walk/designer-r2-*.log` and `client-r2-*.log`.
- **The shared local stack was not reset and carries no schema change from this walk** — ledger head
  `00577`, this branch's `00575`/`00576`/`00577` and the regenerated grants seed, exactly as the
  re-gate-2 fix agent left it. `stack-notice.md` therefore needs no new entry.
- Row-level fixtures this walk wrote are listed in §2; `support@patina.dev`'s role is back where it
  started.
- Nothing was pushed.
