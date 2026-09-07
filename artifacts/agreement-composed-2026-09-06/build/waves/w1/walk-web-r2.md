# Wave 1 · web walk — round 2

Program: **The Agreement, Composed** · Wave 1 close-out
Date: 2026-09-07
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
(`git rev-parse --show-toplevel` printed exactly that)
Branch: `agreement/w1-integration` · head **`c6abd572d`**
Local stack: 127.0.0.1:54322, head `00575`, **not reset** — `00575_agreement_parts.sql`
last changed in `e93bdfdb9`, which is also the commit the walk-fix lane reset for
(`stack-notice.md`, "Reset — walk fixes, round 1"). Nothing has touched the file
since, so the catalog and the file agree and no reset was owed. `stack-notice.md`
is unchanged by this walk.

Screenshots: `web-walk-shots-r2/` (1280 and 390 where the surface has two shapes).
Throwaway scripts and logs: `web-walk/r0*.mjs`, `web-walk/r1*.mjs`, `web-walk/r2-*.mjs`,
`web-walk/r2*.log`.

---

## Verdict

**ship** — no blocker, no major.

All five defects the fix lane took on are **closed at the keyboard**: B1 (blocker),
M2, M3, M4, M6 (majors). Seven prior minors/nits still stand, one of them
(**N6**) a walk-recipe defect the next walker will hit first. Two new findings,
both minor/nit, are recorded below (**N7**, **N8**), plus one advisory about the
seven-facet room that flag-off byte-identity forbids fixing in Wave 1.

---

## 0 · Boot

Two `nohup` dev servers from the integration worktree, per `walk-env.md` §2/§3,
with keys read live from `supabase status -o env`:

| Port | What | Flags |
|---|---|---|
| 3000 | designer portal | `agreement-parts:true` → later `agreement-parts:true,studio-workspaces:true` → later `agreement-parts:false,studio-workspaces:true` |
| 3002 | client portal | none (the client side carries no flag) |

`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` throughout, so the mock fallback
could not dress a refusal up as data.

**Every step was walked against `http://localhost:…`, not `127.0.0.1` — see N6.**

Seeded accounts (`supabase/seed/dev-accounts.sql`, password `password123`):
`designer@patina.dev` (Leah Hartwell), `studio_manager@patina.dev` (co-member,
for R17), `client@patina.dev` (Client User), `client-solo@patina.dev` (Nora Ellison).

Agreements walked:

| Tag | id | Shape |
|---|---|---|
| P1 | `065a572f-7af1-482e-a8ca-7d51a825caad` | ⌘K draft → composed → sent → paper client signature → countersigned → authority |
| P3 | `e2000000-0000-0000-0000-0000000000a1` | project-bound (Birch Hollow) → composed → sent → **homeowner signed in the client portal** |
| P5 | `290f4524-8e36-4d33-8e47-7d031cb2ed17` | **flat fee**, no rate card, no ceiling → sent → paper signature → countersigned → uncapped authority |
| P6 | `22eca88a-0819-4eb2-b8dc-e1e0d79eb01b` | freshly materialized, untouched — R22 refusal, N2, axe, vocabulary, R17 |
| P7 | `11ea46a0-2d0f-44ad-8679-7e740529c566` | composed → **returned to the seven facets** (R24) → saved from the seven-facet room |
| P8 | `e2000000-0000-0000-0000-0000000000a2` | project-bound (Marrow & Vale) → composed **from the studio's saved Agreement defaults** → sent |
| P9 | `e2000000-0000-0000-0000-0000000000a3` | project-bound (Aspen Loft), **parts-less**, sent from the seven-facet room — the flag-off client body |

P3, P8 and P9 were seeded as `INSERT`s into `proposals` with a `project_id`,
because the product's own door (⌘K "Draft a design agreement") makes a
**project-less** proposal and `guard_proposal_copy_immutability` refuses to link
one afterwards (`proposal project linkage may only be set once through
activate_proposal_as_project`). The homeowner's page filters papers by project
(`threshold.tsx:330`), so without that fixture no composed agreement is visible
to her. This is the pre-existing gap round 1 recorded; nothing in Wave 1 moved it.
Everything about the agreements themselves — parts, money, send, signature — was
done through the browser.

---

## 1 · The five defects the fix lane took on

### B1 · blocker → **CLOSED**

On a freshly materialized P1 (nine parts, no fee typed, no ceiling), the Terms
clause was written and **Save agreement** clicked:

```
READINESS B1 before save: 1 OF 9 PARTS NEED ATTENTION |
  This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee. |
  No furnishings deposit set — authorizations will default to 50%.
SAVE BUTTON label="Save agreement" disabled=false
SAVE B1 — prose only, no fee, no ceiling:
  rpc=["upsert_agreement_parts 200 {…}"] note=["All agreement changes saved."]
```

The draft saves while unfinished, and the readiness panel still names the fee the
document owes. `r03-b1-save-with-no-fee.png`.

The floor did **not** leave the doors: on P6, `Send agreement →` is disabled and
the sheet prints the same sentence (§3(g)), and `_agreement_requires_rate_card`
is still asked at all four paper/sign doors (§1 M4).

### M2 · major → **CLOSED**

The room now prints the database's own sentence. Forced with a refusal the room
does *not* hold — two roles named `Principal designer`:

```
SAVE M2 — duplicate role name:
  rpc=["upsert_agreement_parts 400 {\"code\":\"23514\",…,
       \"message\":\"the rate card names Principal designer twice\"}"]
  note=["the rate card names Principal designer twice"]
```

Byte-for-byte the RPC's message, not "The agreement could not be saved."
`r05-m2-duplicate-role-name.png`.

### M3 · major → **CLOSED**

On P1 — a draft with **no `proposal_service_terms` row at all** (`select count(*)
… → 0`) — the seeded cadence part now carries what the editor shows:

```
patina.cadence | {"cadence": "monthly"}
```

The rail row "Billing cadence" carries no NEEDS ATTENTION, readiness reads
`2 OF 9` (Retainer and Terms, not cadence), and the send sheet never asked for a
cadence. `r02-contract-room-1280.png`.

### M4 · major → **CLOSED**

P5 — Role rates and Ceiling removed from the rail, `Flat fee` $18,000 added from
`+ Add a part`, sent — then **Record the signature** from the designer's document
page:

```
RPC record_paper_client_signature 200
  {"recorded": true, …, "commercialState": "client_signed", …}
```

`proposal_service_rates` → 0 rows and `proposal_service_terms.billing_ceiling_cents`
→ NULL at the time, i.e. exactly the shape that returned 23514 in round 1.
`r15-p5-recorded.png`.

### M6 · major → **CLOSED**

A second role added and left unnamed:

```
READINESS M6 — second role blank: 3 OF 9 PARTS NEED ATTENTION |
  Every role on the rate card needs a name. | …
M6 SAVE BUTTON label="Save agreement" disabled=true
M6 REVIEW BUTTON disabled= true
```

Readiness names it, the rail marks the row, and both acts are held.
`r04-m6-blank-role.png`.

---

## 2 · The 12-step script

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | Lead → agreement draft | **pass** | `select id, document_kind, commercial_state, status where id=P1` → `design_services / draft / draft`. `r01-draft-agreement-sheet.png` |
| 2 | Open the Contract Room | **pass, with M5** | Nine rail rows in §2.4 order (Services · Deliverables · Exclusions · Role rates · Ceiling · Furnishings deposit · Retainer · Billing cadence · Terms), shell `2 OF 9 PARTS NEED ATTENTION`. `r02-contract-room-1280.png`, `-390.png`. **First open still renders an empty rail** — M5, §4 |
| 3 | Materialize landed | **pass** | 9 rows, positions 1–9, `patina.*` keys in order, `required` true only on `patina.services` / `patina.terms`, `client_visible` true on all nine |
| 4 | Terms row untouched | **pass** | `select count(*) from proposal_service_terms where proposal_id=P1` → **0** before and after materialize |
| 5 | Remove Exclusions | **pass** | Rail 9 → 8; no `patina.exclusions` row; `exclusions` in the projection → `[]`. `r07-step5-exclusions-removed.png` |
| 6 | Add a role | **pass** | `select role_name, hourly_rate_cents, sort_order from proposal_service_rates` → `Principal designer / 22500 / 0`; readiness then asks for the ceiling. `r06-step6-role.png` |
| 7 | Ceiling + required prose | **pass** | Readiness `0 OF 8 PARTS NEED ATTENTION`; `billing_ceiling_cents` → **2400000**. `r08-step7-ready-1280.png`, `-390.png` |
| 8 | Preview client copy | **pass** | Parts in rail order; removed Exclusions **absent**, not an empty heading; unset Furnishings deposit **absent** (R28 / re-gate-2 F2). One `Not yet set` — the retainer written as 0, which is N5. `r09-step8-preview-1280.png`, `-390.png` |
| 9 | Send | **pass** | `status / commercial_state / sent_at` → `sent / sent / 2026-09-07 12:09:05`. Then `update proposal_agreement_parts set title='x'` → `ERROR: proposal_agreement_parts is immutable after its proposal leaves draft`. `r09-step9-send-sheet-1280.png` |
| 10 | Client signs | **pass** | Walked in the client portal on **P3**: `RPC get_client_commercial_document_bundle 200`, press-and-hold signature, `commercial_state → client_signed`, and `_commercial_document_fingerprint(P3)` = the stored `evidence_fingerprint` (`d10ee5dd…`). `c12-p3-body-1280.png`, `c12-p3-signature-filled.png`, `c12-p3-after-sign.png` |
| 11 | Countersign | **pass** | On P1 through the paper door: `commercial_state → executed`, two rows (`client` / `studio`) **both carrying `465e04b1…`**, and no `check_violation` about a fingerprint conflict — F-1 walked by hand. `r11-p1-recorded.png`, `r12-p1-after.png` |
| 12 | Authority with the right ceiling | **pass, both halves** | P1 → `project_billing_authorities` `2400000 / 0 / immediate / monthly / active`. **Flat-fee half (blocked by M4 in round 1) now walks**: P5 countersigned, authority `billing_ceiling_cents NULL / retainer 300000 / monthly / active`, and `get_project_authority_summary` answered `state: "active"`, `ceilingCents: null`, `remainingCents: null` — F-2's shape, not `exhausted`. `r16-p5-after.png` |

### Fingerprints (F-1, F-3)

```
 proposal | parts | fp_now           | fp_signed
 Aspen cd001 (seeded, pre-parts)  | 0 | 69a5f86db021bd22 | (unsigned)
 P1                               | 8 | 465e04b12436845a | 465e04b12436845a
 Cedar cb01 (R26 composed seed)   | 7 | 6bdb834b9252d982 | (unsigned)
 P3                               | 9 | d10ee5dd147a6ad0 | d10ee5dd147a6ad0
```

Both signed composed agreements hash today to exactly what their signatures
recorded, which is why both countersignatures went through. On P7,
`discard_agreement_parts` returned a **changed** fingerprint
(`6cf420e4…`) and the following seven-facet save returned another
(`82d5b3d1…`) — the parts key moves the hash when parts move, and is absent when
they are.

---

## 3 · The added checks

### (e) R17 — a second studio member without the override — **pass**

Designer server restarted with `agreement-parts:false`. Signed in as
`studio_manager@patina.dev` and opened the **composed** draft P6:

```
COMPOSER RAIL PRESENT: 0
SHELL COUNT: · 4 of 7 facets written
STATUS LINES: ["This agreement is composed from parts. It is edited in the Contract
  Room with parts on, where it can also be returned to the seven facets."]
SAVE BUTTONS: [{"REVIEW & SEND →", disabled:true}, {"Save agreement", disabled:true}]
```

One `role="status"` line, exactly the ruled sentence; both acts held.
`r31-r17-comember-1280.png`, `-390.png`.

### (f) R24 — "Return to the seven facets" — **pass**

On P7:

```
RPC discard_agreement_parts 200 {"discarded": 9, "partCount": 0, …}
SHELL: · 6 of 7 facets written
RPC upsert_design_services_draft 200 {"rateCount": 1, …}
```

`select count(*) from proposal_agreement_parts where proposal_id=P7` → **0**,
`billing_ceiling_cents` → **1800000**, one rate row at 19500 — written from the
facets. `r21-p7-02-returned-1280.png`, `r22-p7-facets-saved-1280.png`, `-390.png`.

The first save attempt was refused with *"design-services draft requires an
authenticated author, terms, and rates"* — `upsert_design_services_draft`'s
pre-existing empty-rates guard (00422:1722, F-4), not a Wave 1 regression.
Adding a role rate cleared it, exactly as in round 1.

### (g) R22 — every fee part unset, send refused in the room's words — **pass**

`Review & send` on P6, untouched:

```
FINISH BEFORE SENDING
Set a valid retainer amount, including zero when none is due.
Write Terms.
This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.
…
SEND BUTTONS: [… {"Send agreement →", disabled:true}]
```

The third sentence is `_agreement_fee_unnamed`'s own. `r18-r22-send-refused-1280.png`.

### (h) R25 / R28 — the homeowner's page — **pass**

Two composed bodies read on the homeowner's side.

**P3 (Birch Hollow)** — `c12-p3-body-1280.png`, `-390.png`:
parts only, in rail order (Services · Deliverables · Exclusions · Role rates ·
Ceiling · Retainer · Billing cadence · Terms); **no Furnishings deposit section
at all**, because the designer never set one (R28 / re-gate-2 F2); `Retainer —
Not yet set` for a retainer written as 0 (N5); nothing from `serviceTerms`.
The bundle read as the homeowner answers:

```
{"composed": true, "partKeys": ["patina.services", …, "patina.terms"], …}
```

**P8 (Marrow & Vale)**, composed after the studio's Agreement defaults were saved
— `vocab-homeowner-Marrow-Vale-composed-door-open-.txt`:
`Exclusions — Construction labor / Permits and approvals` and `Furnishings deposit
— 25% deposit` and `Billing cadence — Biweekly` all reached the page **because the
studio typed them into its own defaults**, which is precisely what R28 permits;
`Retainer — $2,500` with its activation sentence, because it was written.

Both bodies read the same sentences the designer's live preview showed (R27).

### (a) Flag-off — **pass**

- **Designer, parts-less draft** (P7 after R24), server restarted with
  `agreement-parts:false`: no composer rail, `· 6 of 7 facets written`, **no**
  notice, `REVIEW & SEND` enabled, `Saved` disabled.
  `r30-noparts-flagoff-1280.png`, `-390.png`.
- **Stored markup.**
  `pnpm --filter @patina/designer-portal test -- --ci service-agreement-drafting-room.test.tsx`
  → `Test Suites: 1 passed` · `Tests: 10 passed` · **`Snapshots: 1 passed`** — the
  `renders the seven-facet room unchanged when agreement-parts is off` snapshot.
- **Client.** P9 was sent from the seven-facet room with **0 parts**; the
  homeowner's body then renders today's shape — one combined *"Rates & design
  authorization"* section, `RETAINER` / `BILLING CADENCE` as small-caps labels,
  `Not included` at the end — visibly different from the composed body's per-part
  headings. `c15-p9-flagoff-1280.png`, `-390.png`.
- **Account → Studio, flag-off.** Only `BRANDING` / `BILLING` / `MEMBERS`; the
  Agreement defaults card is absent entirely; the Billing card unchanged
  (`card fee 3`, remit empty, `SAVE BILLING` disabled).
  `r35-flagoff-account-studio-1280.png`, `-390.png`.

### (b) Account → Studio: Agreement defaults — **pass, with N1**

`Principal designer / $245`, deposit `25%`, cadence `Every two weeks`, credit rule
`Non-refundable`, exclusions `Construction labor / Permits and approvals`:

```
NET POST 201 {"studio_id":"7798c891…","rate_card":[{"roleName":"Principal designer",
  "sortOrder":0,"hourlyRateCents":24500}],"deposit_percent":25,"cadence":"biweekly",
  "retainer_credit_rule":"non_refundable","default_exclusions":["Construction labor",
  "Permits and approvals"],…}
```

Re-read in a **fresh browser session**: identical. The Billing card never moved
(`cardFee "3"`, `remit ""`, `SAVE BILLING` disabled) before or after. The defaults
then reached a new agreement — P8's `materialize_standard_parts` seeded the rate
card, the exclusions, the deposit and the cadence from them, and all four
survived to the homeowner's page. `r23-defaults-dirty.png`,
`r23-defaults-saved-1280.png`, `r24-account-studio-1280.png`.
See **N1** for the one thing the card still does not do — and **N8** for the flag
this check needs that `walk-env.md` does not name.

### (c) Vocabulary grep of rendered text — **pass, 0 hits**

`r2-vocab.mjs` reads `document.body.innerText` off six surfaces and greps 21
database column/table names, `variant`, `clause librar`, `contract builder`, a
standalone `AI`, plus (homeowner only) `gate`, `task`, `dashboard`, `overdue`, and
any emoji.

```
designer /desk — 0 hit(s)
designer Contract Room (composed) — 0 hit(s)
designer · client-copy preview — 0 hit(s)
designer · Add a part menu — 0 hit(s)
homeowner / — 0 hit(s)
homeowner Marrow & Vale (composed, door open) — 0 hit(s)
```

Rendered text saved beside the script as `vocab-*.txt`. The designer's Desk says
`1 OVERDUE`; that is the studio's surface, where the word is allowed, and it
appears on neither homeowner page. No badges, no numeric count chips, no
red/green status and no checkmark-as-status: the rail says `NEEDS ATTENTION` in
words, the shell says `2 OF 9 PARTS NEED ATTENTION` in words, and a required part
is marked with a `·`.

### (d) axe — **1 new violation on the room, 0 on the door**

`axe-core 4.11.1`, `resultTypes: ['violations']`.

**Contract Room, composed** (P6):

| impact | rule | node | new in W1? |
|---|---|---|---|
| serious | `color-contrast` | `.mb-4` — 4.48 : 1, needs 4.5 (`#8b7355` on `#ffffff`, 11 px) — "The client's copy · live" | **yes** — N3 |
| moderate | `landmark-no-duplicate-banner` | `.z-20` (portal shell) | no |
| moderate | `landmark-one-main` | `html` | no |
| moderate | `landmark-unique` | `.z-20` | no |
| moderate | `meta-viewport` | `maximum-scale` disables zoom | no |
| moderate | `region` | `.sr-only` skip link | no |

**The homeowner's door on a composed house**: **0 violations**
(`r20-axe-door-scanned.png`).

---

## 4 · Defects still standing

### M5 · minor (dev-only) — the first open of a fresh draft shows an empty rail

Reproduced on **every** fresh draft this round (P1, P2, P5, P6, P7 — five of five):

```
FIRST OPEN: rail rows = 0; readiness = 0 OF 0 PARTS NEED ATTENTION |
  This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.
RAIL ROWS AFTER RELOAD (9)
```

`r02-firstopen-p1.png` … `r02-firstopen-p7.png`. The nine rows are in the database
throughout (`materialize_standard_parts 200 {partCount: 9}`), and a reload shows
them. The mechanism is unchanged by the fix lane: the seeding effect still puts
`setParts` in a per-call `mutate(…, { onSuccess })` guarded by
`materializeFired.current`, and StrictMode's mount/unmount/remount destroys the
observer that owns that callback while the ref survives
(`agreement-composer.tsx:116-160`). It cost this walk two script failures
(`r06-p3-compose` and `r10-p8-compose` both timed out on an empty rail before the
retry).

Round 1 proved this does **not** reach a production build. Re-checked this round:
see §6.

**Fix (unchanged):** render the rail from the invalidated
`agreementPartsKeys.list` / bundle query rather than from a one-shot mutate
callback.

### N1 · minor — the Agreement defaults card never says "Saved"

After a successful `POST … 201`, and again in a **fresh session with nothing
edited**:

```
BEFORE: {…, "saveDefaults":"SAVE AGREEMENT DEFAULTS", "saveDefaultsDisabled":false,
         "saveBilling":"SAVE BILLING",             "saveBillingDisabled":true}
```

The Billing card beside it settles; the Agreement defaults card does not.
`agreementDefaultsDirty` (`account-studio-page.tsx:608-611`) stringifies the
form's `{roleName, hourlyRateCents, sortOrder}` against the raw jsonb the hook
passes through unmapped (`use-studio-agreement-defaults.ts:60` —
`rateCard: row.rate_card ?? []`), which Postgres returns as
`{"roleName": …, "sortOrder": 0, "hourlyRateCents": 24500}` — same object,
different string. Neither file changed since round 1.
`r24-account-studio-1280.png`.

**Fix:** compare the rate card field by field, or normalise key order on both
sides before stringifying.

### N2 · minor — an unwritten money part prints "Recorded with your agreement."

The live preview of a freshly materialized composition (P6):

```
Role rates

Recorded with your agreement.

Ceiling

No ceiling — professional time is billed as it is worked.

Retainer

Recorded with your agreement.
```

`r17-n2-fresh-preview-1280.png`. `agreement-parts-body.tsx:145` returns
`<RecordedLine />` for a rate card with no roles and `:187` for a retainer whose
`cents` is null — a term asserted for money nobody typed. R21's own answer for
the same shape one branch down is `<NotYetSet />` (`:177`, `:190`). Readiness
holds the send while either is unset, so this stays inside the studio's own
preview in Wave 1; it is the drafting designer who is told a term exists.

**Fix:** decide once whether an unwritten money part prints "Not yet set" (R21) or
takes its section with it (F2), and apply that answer to `rate_card` and
`retainer` as it was applied to `procurement`.

### N3 · minor — the composer's one new axe violation

`[serious] color-contrast` on `<p class="mb-4 font-mono text-[11px] …">The client's
copy · live</p>` — **4.48** against a 4.5 requirement (`#8b7355` =
`--color-aged-oak` on `#ffffff`, 11 px). The other five violations are portal-shell
issues present outside this wave, and the homeowner's door returns 0.
`r19-axe-room-scanned.png`.

**Fix:** darken this one label, or drop it onto the parchment ground every other
aged-oak label at this size sits on.

### N4 · nit — the send sheet still speaks in facets, and prints the deposit note twice

P1's sheet, on an agreement whose Exclusions had been removed:

```
Client User receives the services, rates, retainer policy, billing cadence,
ceiling, and terms. …
…
FURNISHINGS DEPOSIT
No furnishings deposit set — authorizations will default to 50%.
No furnishings deposit set — authorizations will default to 50%.
…
Ready to send · every contractual facet is present.
```

`r09-step9-send-sheet-1280.png`. "Facet" in a room where R7 says the unit is a
Part; a fixed seven-item enumeration on a composition that no longer carries all
seven; the deposit note twice. The homeowner's door carries the same fixed
enumeration — *"By signing, you accept the services, signed role rates, design
authorization ceiling, retainer, and terms in …"* (`c11-home-with-agreement-1280.png`)
— which over-promises on any composition that drops one of them.

**Fix:** under parts, build both sentences from the composition's own
client-visible parts, say "part" rather than "facet", and de-duplicate the
deposit note.

### N5 · nit — a money part written as 0 reaches the homeowner as "Not yet set"

P1's retainer was set to `0`; readiness read `0 OF 8`, the send was allowed, and
the homeowner's page (P3, same shape) prints `Retainer — Not yet set` on the
agreement she signs. `c12-p3-body-1280.png`. R21's second half holds literally —
the class does not require a retainer — but the visible result is a signed
agreement carrying an unwritten money line.

**Fix:** treat 0 as unwritten for readiness as well as for rendering, or print
nothing for a zero retainer the way an unset deposit now prints nothing.

### N6 · nit — `walk-env.md` still sends the next walker to 127.0.0.1:3000

Re-probed directly this round:

```
http://127.0.0.1:3000 — password field appeared: never
aria-expanded: false
[console.error] WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?…'
  failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE   (×8)
```

`r33-n6-http-127-0-0-1-3000.png`. Twenty clicks over twenty seconds and the
sign-in disclosure never expands — React never attaches. Round 1 blamed
`allowedDevOrigins`; that is **not** it — `apps/designer-portal/next.config.js:172-181`
already lists `http://127.0.0.1:3000`, and the dev log carries no
"Blocked cross-origin" line this round. The observable cause is the HMR
WebSocket handshake failing on that origin. `http://localhost:3000` works, and
every step of this walk was run against it.

**Fix:** change `walk-env.md`'s boot URLs to `localhost`. This is a walk-recipe
defect, not a product defect, and it is the first thing the next walker will hit.

### N7 · minor (new) — a duplicate role name passes readiness and Save

Two roles both named `Principal designer`:

```
READINESS M2 — duplicate role name: 2 OF 9 PARTS NEED ATTENTION |
  No furnishings deposit set — authorizations will default to 50%.
M2 SAVE BUTTON label="Save agreement" disabled=false
SAVE: rpc=["upsert_agreement_parts 400 {\"code\":\"23514\", …,
  \"message\":\"the rate card names Principal designer twice\"}"]
```

`r05-m2-duplicate-role-name.png`. This is the same class as M6 — a 23514 the
room offers and the database refuses — and it is the one the M6 fix did not
cover: `unnamedRateCardRoles` (`part-kinds.ts:232`) asks only about blank names,
and `assessAgreementReadiness` (`readiness.ts:176-183`) asks only about blank
names and an empty list. It is **much** milder than M6 was, because M2's fix now
prints the database's own sentence, so the designer is told what to change rather
than facing a dead end. It is reported because R18/R29's discipline — readiness
names it, Save is held — was meant to cover every refusal the room can earn from
this RPC, and this one is still outside it.

**Fix:** add `duplicateRateCardRoleNames` beside `unnamedRateCardRoles`, blocker
and Save hold, exactly as blank names were handled.

### N8 · nit (new) — the walk recipe cannot reach Account → Studio

`walk-env.md` §2 sets `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true` only. With
just that, the account sheet renders `PROFILE / NOTIFICATIONS / SECURITY / DEVICES
/ EXTENSION` and **no Studio tab** — `account-sheet.tsx:104,166` gates the Studio
page on a second fail-closed flag, `studio-workspaces`. The walk's own check (b)
therefore cannot be run from the recipe as written; this walker lost a boot cycle
to it before restarting with `agreement-parts:true,studio-workspaces:true`.

**Fix:** name both flags in `walk-env.md` §2.

---

## 5 · Advisory, not a defect

**The seven-facet room still shows the generic save message.** After R24 returned
P7 to the facets, the pre-existing empty-rates guard refused the save and the room
said *"The agreement could not be saved."* while the RPC said
*"design-services draft requires an authenticated author, terms, and rates"* —
M2's exact shape, one room over. It is **not** this wave's to fix:
`service-agreement-drafting-room.tsx` carries that line verbatim on `origin/main`
(`:222` there, `:283` here), and flag-off byte-identity forbids moving it in
Wave 1. Recorded for the main backlog.

---

## 6 · Production build — M5 does not ship, and B1/M6 hold there too

`./web-walk/build-prod.sh` (`pnpm --filter @patina/designer-portal build`, flags
`agreement-parts:true,studio-workspaces:true`, exit 0) then `next start -p 3000`.
A fresh draft created through the same ⌘K door:

```
FIRST OPEN: rail rows = 9; readiness = 3 OF 9 PARTS NEED ATTENTION
```

All nine rows on the **first** open — M5 is a StrictMode artefact of `next dev`
and does not reach a build. `r38-prod-b1.png`.

The two closures that matter most were re-run on that same production build:

```
SAVE B1 — prose only, no fee, no ceiling: rpc=["upsert_agreement_parts 200 …"]
                                          note=["All agreement changes saved."]
READINESS M6 — second role blank: 3 OF 9 PARTS NEED ATTENTION |
  Every role on the rate card needs a name.
M6 SAVE BUTTON disabled=true · M6 REVIEW BUTTON disabled=true
```

`r38-prod-b1.png`, `r38-prod-m6.png`. (The M2 leg could not be re-forced on the
build: with Save correctly held by the blank role, the script never reached a
duplicate-name save. M2 is proven on the dev server, and `refusalMessage`
is build-independent.)

---

## 7 · What this walk could not do, and why

- **Steps 10–12 on one agreement.** Unchanged from round 1 and pre-existing:
  the ⌘K door makes a **project-less** proposal, `guard_proposal_copy_immutability`
  refuses to link one to a project afterwards, and the homeowner's page filters
  papers by project. So the client signature was walked on P3 (project-bound
  fixture) and the countersignature + authority on P1 (project-less, through the
  paper door). Both halves are real; they are not the same row.
- **The composed body after signature.** Once the homeowner signs, "READ IT IN
  FULL" is replaced by "KEEP A COPY", and the executed seeded agreements
  (Aspen `cd001`, Cedar `cb01`) offer no body door either. The composed body was
  therefore read pre-signature (P3) and door-open (P8).
- **Flag-off byte-identity by markup diff.** The two flag-off room dumps
  (`r30-noparts-flagoff-room.html`, `r31-r17-comember-room.html`) are for
  *different* proposals, so a byte diff between them proves nothing. The real
  gate is the stored-markup snapshot, which passed (§3(a)).
- **Not re-run this round:** the full designer-portal jest suite, the client
  Playwright e2e, and any SQL test file — those belong to the gate lane, not the
  walk. Nothing production was touched.

---

## 8 · What was left running

Nothing. Both dev servers and the production server started for §6 were killed at
the end of the walk. The Supabase stack is left exactly as found: **running, head
`00575`, not reset**, carrying the walk-fix bodies — `stack-notice.md` needed no
new entry.

The walk left nine test proposals in the local database (titles beginning
`Client User — design services agreement`, `Birch Hollow — Design Services (walk r2)`,
`Marrow & Vale — Design Services (walk r2)`, `Aspen Loft — Design Services (walk r2
flag-off)`), one `studio_agreement_defaults` row for *Leah Hartwell*, and the
projects the countersignatures created. All of it goes away on the next
`supabase db reset`.

