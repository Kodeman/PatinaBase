# W2 fix log — round 6

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, base HEAD `23e922802` (the round-5
fix commit). Five findings assigned: `QA-R6-1` (blocking), `QA-R6-2`, `CR6-1`,
`CR6-2`, `CR6-3` (all major). Nothing else in `w2-review-r6-qa.md` or
`w2-review-r6-code.md` was touched. No migration, no server started, no port
taken, no production anything. The local database was read for evidence only.

## Gates, after the edits

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check
EXIT=0

$ pnpm --dir <worktree> --filter @patina/supabase type-check
EXIT=0

$ pnpm --dir <worktree>/apps/designer-portal test -- --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document 'src/app/(document)/desk' src/components/document/mobile \
    src/components/document/coordination src/components/document/__tests__
Test Suites: 196 passed, 196 total
Tests:       3290 passed, 3290 total
```

3290 = r6's 3287 plus the three regression cases below. The admin-portal build
was not re-run: no shared workspace package is in this diff (every changed file
is under `apps/designer-portal/src`), so nothing a dist-resolved consumer reads
moved.

---

## QA-R6-1 — BLOCKING — the rolodex picker's forbidden paper word

**What changed.**
`apps/designer-portal/src/components/document/roster/party-mini-row.tsx`

* imports `partyKindOwesPaper` from `@patina/types` beside the three label
  helpers it already read;
* the paper `StateWord` is now gated:
  `{paper && partyKindOwesPaper(kind) && <StateWord family="paper" … />}`;
* the `paper` prop's docblock records the rule and why the row applies it
  rather than trusting the caller — the value handed in is the view's raw
  `paper_state` FACT, and whether it prints is a DISPLAY rule.

**Why the row and not the call site.** The finding offered either. The row is
the one place that serves every present and future caller: `rolodex-picker.tsx`
today, and SPEC §5.7's travel-list picker in W3 (R-BM), which will pass the
same raw column. The other three `PartyMiniRow` call sites
(`coordination/item-composer.tsx:607`, `commercial/trade/party-field.tsx:77`
and `:108`) pass no `paper` at all, so none of them moved.

**Evidence.**

* The population, from the live local seed — the two firms QA reproduced are
  exactly the kinds `PARTY_KINDS_OWING_NO_PAPER` names:

  ```
  $ psql postgresql://…:54322/postgres -c "select company_name, contact_kind
      from studio_contacts where entity_kind='company' order by company_name"
   City of Minneapolis, CPED Inspections | authority
   Great Northern Bank                   | lender
  ```

* New regression case, `roster/__tests__/rolodex-picker.test.tsx` — "prints no
  paper word for a lender firm, on any surface (QA-R6-1)": a `lender` card
  ("Great Northern Bank") whose directory row carries `paper_state:
  'not_on_file'` renders in the picker with **no** `Not on file` text and **no**
  `[data-state-family="paper"]` element at all.
* The positive control was already in that file and still passes: Rosa Martínez
  (`contact_kind: 'sub'`, `paper_state: 'lapsed'`) still prints `Lapsed`, so the
  gate narrows rather than silences.

---

## QA-R6-2 — MAJOR — the routed-contact rule line printed a raw E.164 number

**What changed.**
`apps/designer-portal/src/components/document/people/contact-rule-line.tsx`

* `import { TelLink, telDisplay } from './tel-link';`
* the routed phone is now
  `<TelLink phone={routeTo.officePhone} label={telDisplay(routeTo.officePhone)}
   personName={routeTo.name} />`, the shape `reach-access.tsx:356` and
  `site-access-card.tsx:549` already use;
* the file docblock's "NEVER a bare phone string" rule gains the second half —
  never a raw one either, and why this prop is the one that carries E.164.

**Evidence.**

* New regression case, `people/__tests__/people-primitives.test.tsx` — "prints a
  raw E.164 office phone in the house shape (QA-R6-2)": `officePhone:
  '+16125550114'` renders the text `(612) 555-0114`, keeps
  `href="tel:+16125550114"`, and `document.body.textContent` contains no
  `+16125550114`.
* Why it survived five rounds: every pre-existing `ContactRuleLine` route test
  in that file hands the component an already-formatted `'(612) 555-0116'`, so
  the default label path was never exercised against a stored E.164 value.

---

## CR6-1 — MAJOR — `var(--hairline)` is not a token in this portal

**What changed.** All fourteen sites now spend `var(--hairline-strong)` — the
token `apps/designer-portal/src/app/globals.css:1993` actually defines on bare
`:root` for this rule (`#D8CCB8`, "the house sheet's hairline over paper,
flattened to its composite so a rule drawn on the rail does not double").

| File | Line(s) |
|---|---|
| `people/reach-access.tsx` | 345 |
| `people/company-card.tsx` | 184, 590 |
| `people/access-grant-list.tsx` | 212 |
| `people/compliance-table.tsx` | 86, 148 |
| `people/directory/company-row.tsx` | 62 |
| `people/directory/person-row.tsx` | 123, 220 |
| `people/views/directory-view.tsx` | 435, 462, 502 |
| `people/views/person-profile.tsx` | 394, 416 |

**Why the rename and not an alias.** The finding offered either, and closed with
"One rule, one name." Adding `--hairline` beside `--hairline-strong` would give
the room two names for the same rule and would also collide with the meaning
`globals.css:637-638` already records — there the specimen's `--hairline` is
mapped onto `--rule-hair`, the *lighter* rule. Renaming the fourteen sites onto
the token the house sheet defines leaves exactly one name in the portal.

**Evidence.**

```
$ grep -rn "var(--hairline)"        apps/designer-portal/src | wc -l   → 0
$ grep -rn "var(--hairline-strong)" apps/designer-portal/src | wc -l   → 34
```

34 = the 20 sites that already spent the token before this diff (proof the name
resolves in this portal) plus these 14. The only remaining `--hairline` string
under `apps/designer-portal` is the prose in `globals.css:638`.

---

## CR6-2 — MAJOR — the company card printed the raw `company_kind` token

**What changed.**
`apps/designer-portal/src/components/document/people/company-card.tsx`

* imports `companyKindShortLabel` beside `seatIsClosed` from
  `@/lib/document/people-derivation`;
* `companyIdentityLine`'s kind-only branch is now
  `parts.push(companyKindShortLabel(kind))` — the same function
  `firmIdentityLine` (`people-derivation.ts:1068`) spends on the Directory firm
  row that opens the card.

**The trade branch was deliberately left alone, and this is owed a ruling.**
The finding's fix line says "both branches". Applying it to the trade branch
breaks a SPEC literal: `SPEC §5.3 #1` fixes this card's header as **"Electrical
sub · 1 person · 2 projects · warranty through 21 Nov 2026"**, and
`companyKindShortLabel('sub')` returns `"Subcontractor"` (it falls through the
company vocabulary to `getPartyKindLabel`), so the branch would print
"Electrical Subcontractor" and `company-card.test.tsx:187`'s assertion of the
SPEC literal would have to be rewritten away from SPEC. The finding's own CLAIM
and all of its evidence name only the kind-only branch ("11 of 21 company rows
carry empty trades"), which is the branch fixed here. A code comment at the
trade branch now records the constraint. If Kody or Fable wants one vocabulary
in both positions, that is a SPEC §5.3 #1 amendment (and probably a
`sub` → "sub" entry in `COMPANY_KIND_SHORT_LABELS`, which would in turn change
the firm ROW to read "sub · 1 on the crew"), not a code fix this round may make
on its own.

**Evidence.**

* The population, from the live local seed (11 of 21 firm cards carry no trade):

  ```
  Ashgrove Millwork | maker      | Great Northern Bank  | lender
  Beck + Rowe       | architect  | Jonah Feld Photography| photography
  CPED Inspections  | authority  | Kestrel Staging      | stager
  Granite North     | supplier   | Lumen & Co.          | supplier
  Marrow & Sons     | gc         | Ostrom Builders      | gc
  Radon Solutions   | sub        |
  ```

* New regression case, `people/__tests__/company-card.test.tsx` — "prints the
  studio's word for a firm that carries no trade (CR6-2)": `gc` → **"GC · 3
  people · 2 projects"** (was `gc · …`), plus `authority` → "Authority",
  `lender` → "Lender", `photography` → "Photography", `maker` → "Maker",
  `supplier` → "Supplier", `stager` → "Stager", `architect` → "Architect",
  `sub` → "Subcontractor". Marrow & Sons and the Directory row that opens it
  now print the same word.
* `company-card.test.tsx:187`'s "Electrical sub · 1 person · 2 projects ·
  warranty through 21 November 2026" still passes unchanged.

---

## CR6-3 — MAJOR (carried from r1's CR-45) — "The way in" as a free-text label

**What changed.**
`apps/designer-portal/src/components/document/roster/site-access-card.tsx:505-526`

* the `EditableLine` over `lockbox_version` is now `label="Lockbox version"`
  with `empty="No lockbox version on file."`;
* the region head stays `The way in` — SPEC §5.6 #3 fixes the region's name, and
  nothing about the region moved;
* a comment records why the control may not carry the region's name: a box
  labelled "The way in" sitting directly above "The code is held off Patina"
  reads as an invitation to type the code, and whatever is typed prints verbatim
  as the first half of that very sentence (`wayInSentence`).

The optional half of the fix direction — refusing a value that is digits with no
other words — was **not** implemented. It is a new write-time refusal with its
own copy and its own failure mode, and the finding marks it optional; the label
is r1's own one-line fix ("A label naming the version would close it").

**Evidence.**

* `roster/__tests__/site-access-card.test.tsx` — "edits a region in place, as a
  tertiary act" now reaches the field by `getByLabelText('Lockbox version')` and
  still writes `{ projectId: 'okonkwo', lockboxVersion: 'Lockbox, version 4' }`,
  so the column behind the control is unchanged.
* PR-r's schema half re-verified unchanged:
  `grep -rni "gate_code|lockbox_code|alarm_code|gateCode|lockboxCode|alarmCode"
  apps packages` → zero hits.
* SPEC §5.6 #3's own sentence ("Lockbox, version 3. The code is held off
  Patina; ask Luis Ochoa.") is composed by `wayInSentence` and was not touched;
  `e2e/people/call-sheet.spec.ts:115`'s `[data-way-in]` assertion is unaffected.
