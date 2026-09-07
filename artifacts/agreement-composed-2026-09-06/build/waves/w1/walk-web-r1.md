# Wave 1 · web walk — round 1

**The Agreement, Composed** · 2026-09-07 · web walker (real browser, headless Chromium 1.58.2).

- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
  (`git … rev-parse --show-toplevel` printed exactly that), branch `agreement/w1-integration`,
  head **`a7ccc628e02914ea93667f58589ad36bd692e311`**.
- Stack: the program's local Supabase at `127.0.0.1:54322`, **not reset** —
  `select version from supabase_migrations.schema_migrations order by version desc limit 3`
  → `00575 / 00574 / 00573`, the re-gate-2-fix bodies `stack-notice.md` describes.
  No line was added to `stack-notice.md` because nothing was reset, seeded, stopped or started.
- Portals booted from the integration worktree with `nohup`, no `.env.local` anywhere,
  keys read from `supabase status -o env`:
  designer `:3000` with `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true` (+ `studio-workspaces:true`
  for the Account → Studio leg) and `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`;
  client `:3002` with no override (the client side carries no flag).
- Everything the walk touched is under
  `build/waves/w1/web-walk/` (scripts) and `build/waves/w1/web-walk-shots-r1/` (screenshots,
  1280 and 390). No product code was changed. The committed screenshots are downscaled to
  1100 px on the longest side and pruned to the fifty this report cites — the full-size set of
  116 stays in the same (gitignored) directory of the main checkout.
- **Both dev servers, and the production server used for one check, were killed at the end.**

## Verdict

**block** — one blocker (B1), five majors. The composer itself is good: the rail, the
readiness panel, the preview, the parts→terms projection, the fingerprint, the signature and
the billing authority all behave as the build sheet says. What is not shippable is the
**save door**: on a freshly opened agreement the room offers Save, the database refuses it,
and the room hides the reason.

---

## 1 · A correction the next walker needs first

`walk-env.md` sends the walker to `http://127.0.0.1:3000`. **The designer portal does not
hydrate on that origin.** Next 16 answers with

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1".
```

and no React handler ever attaches: the sign-in page's "Use email and password instead"
disclosure never expands (`aria-expanded` stays `false` after 30 s of clicking), so the walk
cannot even begin. `http://localhost:3000` works. Evidence:
`web-walk-shots-r1/00b-signin-expanded.png` (focus ring on the disclosure, panel closed) and
the dev log line above. Not a product defect — a walk-recipe defect. Every step below was run
against `localhost`.

## 2 · The 12-step script

Fresh design-services drafts were created through the product's own household door
(⌘K → "Draft a design agreement" → the `document:open-draft-proposal` event the verb
dispatches), household **Client User / client@patina.dev**.

Primary agreement **P1 = `7208fdeb-306d-439b-b0de-f780cc461c2c`**.

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | Lead → agreement draft | **pass** | `select id, document_kind, commercial_state, status` → `design_services / draft / draft`. `w01-draft-agreement-sheet.png`, `w01b-household-picker.png` |
| 2 | Open the Contract Room | **pass, with M5** | Composer renders, nine rail rows in §2.4 order (Services · Deliverables · Exclusions · Role rates · Ceiling · Furnishings deposit · Retainer · Billing cadence · Terms), shell reads `3 of 9 parts need attention`. `w03-room-1280.png`, `w03-room-390.png`. **On the very first open the rail is empty** — see M5. |
| 3 | Materialize landed | **pass** | 9 rows, positions 1–9, keys `patina.*` in order, `required` true only on `patina.services` and `patina.terms`, `client_visible` true on all nine. |
| 4 | Terms row untouched | **pass** | `select … from proposal_service_terms where proposal_id = :p` → **0 rows** before and after materialize. Materialize seeds parts, it does not write the money row. |
| 5 | Remove Exclusions | **pass** | Rail 9 → 8, no `patina.exclusions` row, `exclusions` in the projection → `[]` (absent, not the old value). `wf-step5-exclusions-removed-1280.png` |
| 6 | Add a role | **pass** | `select role_name, hourly_rate_cents, sort_order from proposal_service_rates` → `Principal designer / 22500 / 0`. Readiness then demands the ceiling. `wf-step6-role-and-ceiling-1280.png` |
| 7 | Ceiling + required prose | **pass** | Readiness `0 of 8 parts need attention`; `billing_ceiling_cents` → `2400000`. `wf-step7-ready-1280.png`, `-390.png` |
| 8 | Preview client copy | **pass** | Parts in rail order; removed Exclusions **absent**, not an empty heading; unset Furnishings deposit absent (R28 / re-gate-2 F2). `wh-step8-preview-1280.png`, `-390.png` |
| 9 | Send | **pass** | `status/commercial_state/sent_at` → `sent / sent / 2026-09-07 06:42:14`. Then `update proposal_agreement_parts set title='x'` → `ERROR: proposal_agreement_parts is immutable after its proposal leaves draft`. `wh-step9-send-sheet-1280.png` |
| 10 | Client signs | **pass** | Walked in the client portal on a second agreement (P2, below): one `client` row, `signed_name = 'Client User'`, 64-char `evidence_fingerprint = 2da55c20…`, equal to `select public._commercial_document_fingerprint(:p)`. `c03-home-with-agreement-1280.png`, `c04-body-1280.png`, `c05-after-sign.png` |
| 11 | Countersign | **pass** | On P1 through the paper door: `commercial_state → executed`, two signature rows (`client` / `studio`) **both carrying `a248b571…`**, and no `check_violation` about a fingerprint conflict — the F-1 regression, walked by hand. `wn-p1-recorded.png`, `wp-p1-after.png` |
| 12 | Authority with the right ceiling | **pass (ceiling half) · blocked (flat-fee half)** | `project_billing_authorities` for P1 → `billing_ceiling_cents 2400000 / retainer 0 / immediate / monthly / active`, and `get_project_authority_summary` returned that ceiling live. The flat-fee half is blocked by **M4**. |

### Fingerprint change (F-3)

Transaction-wrapped, rolled back, on the composed draft `75d6c548…`:

```
before                    d1a1274e3943c78e…
after one part renamed    5fe0b356114 6f070…
after all parts removed   964c8ac5a7291d83…
```

The `parts` key is in the hash and every part is hashed.

### The two extra agreements

- **P2 `fa609f44-c0fc-4909-acec-2f4eac76f225`** — bound to Birch Hollow so the homeowner's page
  could show it. Composed, sent, read and signed in the client portal.
- **P5 `64bea69c-94bf-40e8-b9f8-d7f93aaf81b4`** — the flat-fee leg. Role rates and Ceiling removed
  from the rail, `Flat fee` added from `+ Add a part` at $18,000. Readiness `0 of 8`, send accepted,
  `proposal_service_terms.billing_ceiling_cents` → **NULL** and `proposal_service_rates` → 0 rows,
  which is exactly F-2's shape. It could not be carried to an authority — see M4.

---

## 3 · The added checks

### (e) R17 — a second studio member without the override — **pass**

Designer server restarted with `agreement-parts:false`. Signed in as
**`studio_manager@patina.dev`** (admin of the shared *Local Dev Studio*, a co-member of the
agreement's author) and opened the composed draft `75d6c548…`:

- the seven-facet room renders (`4 of 7 facets written`), no composer rail;
- one `role="status"` line, exactly the ruled sentence:
  *"This agreement is composed from parts. It is edited in the Contract Room with parts on,
  where it can also be returned to the seven facets."*
- `Save agreement` **disabled**, `REVIEW & SEND` **disabled**.

`wz-r17-comember-1280.png`, `wz-r17-comember-390.png`. The same holds for the owner
(`wz-composed-flagoff-1280.png`), so the notice is about the document, not the person.

### (f) R24 — "Return to the seven facets" — **pass**

On P3 `869f8eb7…`: `discard_agreement_parts` → `{"discarded": 9, "partCount": 0}`, the room swaps
to the seven facets in place (`6 of 7 facets written`), and the seven-facet room then **saves**:
`upsert_design_services_draft` → 200, `rateCount 1`, and `select count(*) from
proposal_agreement_parts` → 0 with `billing_ceiling_cents 1800000` written from the facets.
`wr-p3-02-returned-1280.png`, `wt-p3-facets-saved-1280.png`, `-390.png`.

(The first attempt to save was refused with *"design-services draft requires an authenticated
author, terms, and rates"* — that is `upsert_design_services_draft`'s pre-existing empty-rates
guard at 00422:1722, F-4, not a Wave-1 regression. Adding a role rate cleared it.)

### (g) R22 — every fee part unset, send refused in the room's words — **pass**

`Review & send` on P1 before any money was typed:

- readiness and the send sheet both print
  *"This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee."*
- `Send agreement →` **disabled**.

`wg-r22-send-refused-1280.png`. The sentence is the RPC's own.

### (h) R25 / R28 — the homeowner's page — **pass**

Composed body on P4 (Aspen Loft), read through "READ IT IN FULL":

- **parts only**, in rail order, with per-part headings — nothing from `serviceTerms`;
- **`Retainer` → "Not yet set"** for a money part written as 0;
- **no Furnishings deposit section at all** on P2, whose deposit the designer never set
  (`c04-body-1280.png`), and `25% deposit` on P4 only because the studio's own
  Agreement defaults carry 25% — a designer-set value, which is what R28 allows;
- `c07-p4-body-1280.png`, `-390.png`.

Byte-for-byte the same sentences the designer's live preview showed (R27) — both surfaces
read `AGREEMENT_PART_COPY`.

### (a) Flag-off — **pass**

- **Designer.** With `agreement-parts:false` on a parts-less draft: the seven-facet room,
  `6 of 7 facets written`, no notice, `REVIEW & SEND` enabled, `Saved` shown.
  `wz-noparts-flagoff-1280.png`, `-390.png`. The stored-markup gate passes too —
  `pnpm --dir …/apps/designer-portal test -- --ci service-agreement-drafting-room.test.tsx …`
  → **`Snapshots: 1 passed`**, the `renders the seven-facet room unchanged when agreement-parts
  is off` snapshot.
- **Client.** P3 was sent from the seven-facet room with **0 parts**; the homeowner's body then
  renders today's shape — one combined *"Rates & design authorization"* section, `RETAINER` /
  `BILLING CADENCE` as small-caps labels, `Not included` at the end — visibly different from the
  composed body's per-part headings. `c09-p3-noparts-body-1280.png`, `-390.png`.
- **Account → Studio.** Flag-off the Agreement defaults card is **absent entirely** (every field
  reads null, no chips); the Billing card is unchanged. `wz-defaults-flagoff-defaults-1280.png`.

### (b) Account → Studio: Agreement defaults — **pass, with N1**

Saved `Principal designer / $245`, deposit `25%`, cadence `Every two weeks`, credit rule
`Non-refundable`, exclusions `Construction labor / Permits and approvals`:
`POST studio_agreement_defaults` → **201**, re-read in a **fresh browser session** → identical.
`ww-defaults-dirty.png`, `ww-reread-defaults-1280.png`.
The Billing card never moved (`card fee 3`, remit empty, `SAVE BILLING` disabled) before or after.
The defaults then reached a new agreement: `materialize_standard_parts` on the next fresh draft
seeded `patina.role_rates` with that rate card and `patina.exclusions` with those exclusions.
See **N1** for the one thing the card does not do.

### (c) Vocabulary grep of rendered text — **pass, 0 hits**

`vocab.mjs` reads `document.body.innerText` off six surfaces — designer `/desk`, the composed
Contract Room, the client-copy preview, the `+ Add a part` menu, the homeowner's `/`, and the
homeowner's composed house with the door open — and greps for: 21 database column and table
names, `variant`, `clause librar`, `contract builder`, a standalone `AI`, plus (homeowner only)
`gate`, `task`, `dashboard`, `overdue`, and any emoji.

```
designer /desk — 0 hit(s)
designer Contract Room (composed) — 0 hit(s)
designer · client-copy preview — 0 hit(s)
designer · Add a part menu — 0 hit(s)
homeowner / — 0 hit(s)
homeowner Aspen (composed, door open) — 0 hit(s)
```

Rendered text is saved beside the script as `vocab-*.txt`. The designer's Desk does say
`1 OVERDUE`; that is the studio's surface, where the word is allowed, and it does not appear on
either homeowner page. No badges, no count chips, no red/green status and no checkmark-as-status
are introduced by the composer: the rail says `NEEDS ATTENTION` in words, the shell says
`3 of 9 parts need attention` in words, and a required part is marked with a `·`.

### (d) axe — **1 new violation on the room, 0 on the door**

`axe-core 4.11.1`, `resultTypes: ['violations']`.

**Contract Room, composed** (`axe-room-2.json`):

| impact | rule | node | new in W1? |
|---|---|---|---|
| serious | `color-contrast` | `<p class="mb-4 …">The client's copy · live</p>` — 4.48 : 1, needs 4.5 (`#8b7355` on `#ffffff`, 11 px) | **yes** — N3 |
| moderate | `landmark-no-duplicate-banner` | `.z-20` (portal shell) | no |
| moderate | `landmark-one-main` | `html` | no |
| moderate | `landmark-unique` | `.z-20` | no |
| moderate | `meta-viewport` | `maximum-scale` disables zoom | no |
| moderate | `region` | the skip link | no |

An empty room (before the parts render) adds one more `region` node for the middle column
(`<div><p>Pick a part on the left, or add one.</p></div>`); with a part selected the
`<section aria-label="… editor">` covers it, so it only fires in the empty state — which,
per M5, is the state the first open leaves you in.

**The homeowner's door, with a composed agreement open**: **0 violations**
(`axe-door-open-scanned.png`).

---

## 4 · Defects

### B1 · blocker — a composed draft cannot be saved until the money is typed, and the room does not say so

`upsert_agreement_parts` asks **both halves of R4's floor at the save door**
(`supabase/migrations/00575_agreement_parts.sql:2740` and `:2749`), not only at the three doors
R22 names (send, sign, countersign). The room does not hold Save for either — only for duplicate
money variants (R18) — so the sequence a designer actually performs fails:

```
open the Contract Room on a fresh draft
write the Services clause  →  Save agreement
  RPC upsert_agreement_parts 400
  {"code":"23514","message":"This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee."}
  room shows: "The agreement could not be saved."

add a role rate            →  Save agreement
  RPC upsert_agreement_parts 400
  {"code":"23514","message":"an agreement that bills time needs a ceiling"}
  room shows: "The agreement could not be saved."
```

Nothing in the composition can be saved — not the Services body, not the Deliverables, not the
Terms — until a fee **and** (once a rate card exists) a ceiling are both typed. This contradicts
the composer's own stated rule, *"Every other blocker still saves — a draft is allowed to be
unfinished"* (`agreement-composer.tsx:158-161`), and it contradicts R22, which put the fee
predicate at send/sign/countersign.

It is worse for a studio that uses the Agreement defaults card, because the defaults seed a rate
card and there is no default ceiling beside it: on a **production build**, on a fresh draft, the
readiness panel read `2 of 9 parts need attention` with **no document-level line naming a
ceiling**, `Save agreement` was enabled, and the save was refused
(`w-prod-savefloor.png`). The migration's own comment anticipates exactly this shape
(*"a studio default rate card with no default ceiling beside it"*) and argues the harm is caught
downstream — but it is caught at Save, where nothing told the designer it would be.

- Reproduced on the dev server (`we-save-failure-1280.png`) **and on a production build**
  (`w-prod-savefloor.png`), so it is not a dev artifact.
- Fix direction: either drop the two floor calls from `upsert_agreement_parts` and leave them at
  the three ruled doors, or hold Save the way R18 holds it — readiness names the blocker, Save is
  disabled, and the sentence is on screen before the click.

### M2 · major — the room throws away the database's sentence

`persist()`'s catch is `error instanceof Error ? error.message : "The agreement could not be
saved."` (`apps/designer-portal/src/components/document/rooms/drafting/agreement/agreement-composer.tsx:231-236`).
The object react-query hands back for a PostgREST failure is not an `Error`, so **every** refusal
renders the generic sentence. Every message 00575 was written to say — *"This agreement names no
fee…"*, *"an agreement that bills time needs a ceiling"*, *"an agreement carries only one
ceiling"*, *"every role on the rate card needs a name"* — is discarded at the last inch. This is
what turns B1 from an instruction into a dead end, and it is the cheapest thing on this list to
fix.

### M3 · major — the Billing cadence part contradicts itself on a fresh draft

On a draft with **no terms row** (the state `walk-env.md` tells the walker to create),
`materialize_standard_parts` seeds `patina.cadence` as `{"cadence": null}`. `CadenceEditor` then
falls back to `"monthly"` **for display only** and never writes it:

```
select part_key, payload …  →  patina.cadence | {"cadence": null}
editor select value          →  "monthly"   (shown as "Monthly", selected)
rail row                     →  BILLING CADENCE · CREATES AUTHORITY … NEEDS ATTENTION
send sheet                   →  "Choose a billing cadence."   · Send agreement disabled
Save agreement               →  "Saved" (nothing is dirty)
```

`wc-cadence-monthly-but-blocked-1280.png`. The designer is looking at Monthly, being told to
choose a cadence, and has no visible act that satisfies it — selecting the already-selected option
fires no change event. The only way out is to pick another cadence and pick Monthly back.
R28-as-amended reasoned from a draft that **has** a terms row (`billing_cadence` is
`NOT NULL DEFAULT 'monthly'`, so that path seeds fine); the fresh-draft path was not in view.
Flag-off, the same fresh draft sends without complaint, because `emptyTerms` writes `monthly`.

### M4 · major (already ruled, reported for its walk cost) — the paper door still demands a role rate

The flat-fee agreement P5 composed and **sent** cleanly, then:

```
RPC record_paper_client_signature 400
{"code":"23514","message":"design services agreement requires terms and at least one role rate"}
```

`_record_paper_client_signature_impl` (00425:488) is the one design-services door 00575 did not
relax — the catalog confirms it: `prosrc like '%_agreement_requires_rate_card%'` matches
`send_commercial_document`, `_sign_design_services_agreement_authorized` and
`_issue_design_services_agreement_on_paper`, and **not** `_record_paper_client_signature_impl`.
This is backend F-5, which the rulings accepted ("keep it"). The walk cost is that Wave 1 lets a
designer compose and issue a flat-fee agreement that the studio can then never record on paper —
and step 12's flat-fee half could not be walked at all.

### M5 · major in the walk, dev-only in effect — the first open of a fresh draft shows an empty rail

Every first open of a fresh design-services draft renders **no parts**:

```
RPC materialize_standard_parts 200  { partCount: 9, materialized: true, parts: array(9) }
rail rows: 0
readiness: "0 OF 0 PARTS NEED ATTENTION | This agreement names no fee…"
--- reload the same URL ---
rail rows: 9
readiness: "3 OF 9 PARTS NEED ATTENTION"
```

`w-firstopen2-first.png` → `w-firstopen2-reload.png`. No console error; the nine rows are in the
database the whole time. The mechanism is `AgreementComposer`'s seeding effect: it guards with
`materializeFired.current` and puts `setParts` in a **per-call** `mutate(…, { onSuccess })`
callback. React StrictMode mounts, unmounts and remounts, which destroys the react-query mutation
observer that owns that callback — react-query documents that `mutate` callbacks are not called if
the component unmounted — while the ref survives, so the second effect pass returns early and no
second `mutate` is issued. The composer never re-reads `bundle.parts` after mount, so the
invalidation the hook does cannot heal it.

**Not shipped**: on a production build of this same tree (`pnpm --filter @patina/designer-portal
build`, `next start -p 3000`, same flag override) the first open renders all nine rows and
`3 OF 9 PARTS NEED ATTENTION` — `w-prod-firstopen.png`. StrictMode's double mount is a
development behaviour only.

Two things still deserve attention. First, it makes every local walk of this flag start on a lie,
and it is why step 2's screenshot had to be taken after a reload. Second, the test that claims to
cover it cannot: `agreement-composer.test.tsx:223` — *"seeds the standard parts once on an empty
draft, even under StrictMode"* — mocks `mutate` to invoke `callbacks.onSuccess` **synchronously**,
which is precisely the behaviour real react-query does not have. A green there proves nothing
about this path. Making the rail render from the invalidated query rather than from a one-shot
callback removes both problems.

### M6 · major — an unnamed role passes readiness and is refused by the database

Add a second role on the rate card and leave its name blank:

```
readiness: "0 OF 9 PARTS NEED ATTENTION"
Save agreement: enabled
RPC upsert_agreement_parts 400 {"code":"23514","message":"every role on the rate card needs a name"}
room shows: "The agreement could not be saved."
```

`probe-blank-role.png`. R18/R29 gave duplicate money variants the discipline of "readiness names
it, Save is held"; the blank-role refusal — which is a `check_violation` from the same RPC — did
not get it. Same family as B1 and M2.

### N1 · minor — the Agreement defaults card never says "Saved"

After a successful save, and on a **freshly loaded** page with nothing edited,
`SAVE AGREEMENT DEFAULTS` stays **enabled** and the `Saved` marker never appears — unlike the
Branding and Billing cards beside it, which both show it.

`agreementDefaultsDirty` (`account-studio-page.tsx:608-611`) compares
`JSON.stringify(agreementFormRateCard)` against `JSON.stringify(agreementDefaults.rateCard)`.
The form builds `{ roleName, hourlyRateCents, sortOrder }` (`:601-607`); the hook passes the raw
jsonb through unmapped (`use-studio-agreement-defaults.ts:60` — `rateCard: row.rate_card ?? []`),
and Postgres returns the object with the keys in the order they were written:

```
"rate_card":[{"roleName": "Principal designer", "sortOrder": 0, "hourlyRateCents": 24500}]
```

Two equal objects, two different strings, so the card reads permanently dirty once a rate card is
saved. Compare field by field, or normalise key order.

### N2 · minor — an unset money part says "Recorded with your agreement."

A `retainer` or `rate_card` part that was **never written** (`cents === null`, `roles: []`) keeps
its heading and prints *"Recorded with your agreement."* on both surfaces
(`agreement-parts-body.tsx:189` designer, `RetainerLeaf`/`RateCardLeaf` client). Under a
`Retainer` heading that sentence asserts a term exists when none does — the same objection
re-gate 2 accepted for the deposit as F2, where the answer was to drop the whole section. The two
surfaces agree with each other, so this is a deliberate choice and not drift; flagged because it
is the one place the homeowner's page says something about money the designer never wrote.
Seen at `w03-room-1280.png` (live preview, Role rates and Retainer both unset).

### N3 · minor — the composer's one new axe violation

`The client's copy · live` — `--color-aged-oak` `#8b7355` on the white preview card at 11 px —
measures **4.48 : 1** against a 4.5 requirement. It is the only new axe node the Contract Room
adds. Every other label at that token sits on parchment, not white; the white card is the
composer's own.

### N4 · nit — the send sheet still speaks in facets

In the composed room, `ServiceAgreementSendSheet` prints, unchanged from the seven-facet room:

- *"Client User receives the services, rates, retainer policy, billing cadence, ceiling, and
  terms."* — a fixed enumeration in a room whose whole point is that those parts are removable.
  On P1, whose Exclusions had been removed, it was already wrong.
- *"Ready to send · every contractual facet is present."* — **facet**, in a room where R7 says the
  unit is a Part.
- *"No furnishings deposit set — authorizations will default to 50%."* printed **twice**, once
  under a `FURNISHINGS DEPOSIT` heading and once loose (`wg-r22-send-refused-1280.png`).

The homeowner's door carries the same fixed enumeration — *"By signing, you accept the services,
signed role rates, design authorization ceiling, retainer, and terms in …"* — which will
over-promise on the first composed agreement that drops one of them.

### N5 · nit — a "Not yet set" money part can be sent

A retainer written as `0` satisfies readiness (`scheduleValueIsSet` accepts `cents >= 0`) and
prints **"Not yet set"** on the homeowner's page. The class does not require a retainer, so R21's
second half holds literally; the visible result is still an agreement a homeowner signs with
*"Retainer — Not yet set"* on it (`c07-p4-body-1280.png`).

---

## 5 · Two things the walk could not do, and why

- **Steps 10–12 on one agreement.** A design-services proposal bound to an existing project gets
  **no `document_state` row** (checked for the seeded `Aspen Loft — Design Services` too), so the
  designer's countersign instruments never mount — `/doc/<proposalId>` folds to the project page,
  which has no agreement act. The product's own door (⌘K "Draft a design agreement") creates a
  **project-less** proposal, and the homeowner's page filters papers by project
  (`threshold.tsx:440`), so a project-less agreement is invisible to her. Neither file differs
  from `origin/main`, so this is pre-existing and outside Wave 1 — but it is why the client
  signature was walked on P2 (project-bound) and the countersignature on P1 (project-less, through
  the paper door). Both halves are real; they are not the same row.
- **Step 12's flat-fee authority.** Blocked by M4. The projection was verified instead:
  a composed flat-fee agreement writes `billing_ceiling_cents = NULL` and zero rate rows, which is
  the F-2 shape the summary is meant to read as uncapped.

## 6 · What was left running

Nothing. Both dev servers (`next dev -p 3000`, `-p 3002`) and the production server used for the
M5/B1 confirmation were killed. The Supabase stack is untouched and still at `00575`.
The walk left ten test proposals in the local database (titles beginning `Client User — design
services agreement`, `Birch Hollow —`, `Marrow & Vale —`, `Aspen Loft —`, `Walk P5`…`Walk P10`)
and one studio Agreement defaults row for *Leah Hartwell*; both go away on the next
`supabase db reset`.
