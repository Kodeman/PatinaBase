# W5 — The bookkeeper's Friday · adversarial review, round 2

**clean = false** (0 blockers, 2 majors)

**Reviewer context** separate from the implementer and from round 1. Branch `hour-tracking/portal` @ `05fab927a`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`, diffed against
`origin/hour-tracking/integration` (6 commits, 16 files, +2342/−960). plan-v2 §0 + §6 read in full;
`rulings.md` HT-1…HT-41, HT-3-a…g, HT-10-a read; `W5-impl.md`, `W5-review-r1.md`, `W5-fix-r1.md` read.

**Live evidence this round.** Dev server on **3100 only** (3000/3002 never started, never killed — 3000 was and
stayed held by the peer program). Isolated stack `127.0.0.1:54421 / :54422`, `.env.local` verified pointing there
with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` (so no mock fallback could mask a broken query). Probe rows
inserted and **all removed**: final `project_time_entries` 0, `project_team_members` 0, `invoices` back to the
three seed rows, `invoice_line_items` back to 3. No `supabase db reset`. `next-env.d.ts` (rewritten by the dev
server) restored; `git status --porcelain` empty; port 3100 free.

---

## Gates — run by me, verbatim

| Command | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --dir <wt> --filter @patina/designer-portal test -- <the 6 specs this wave names>` | **6 suites / 105 tests passed** (`time-export.test.ts`, `time-billing.test.ts`, `invoice-composer.test.ts`, `hours-ledger-scope.test.tsx`, `hours-ledger-add-row.test.tsx`, `invoice-composer-studio.test.tsx`) |
| `pnpm --dir <wt> --filter @patina/designer-portal lint` | **0 errors, 201 warnings** — all pre-existing, none in a touched file |
| `pnpm --dir <wt> --filter @patina/admin-portal build` | **exit 0**, full route manifest printed |
| `pnpm --dir <wt> --filter @patina/client-portal type-check` | **clean** |
| `pnpm --dir <wt> --filter @patina/client-portal test` | **151 suites / 2475 tests passed**, 1 snapshot |
| extra (shared-package edit): `pnpm --dir <wt> --filter @patina/design-system type-check` | **clean** |
| extra: `--filter @patina/design-system exec vitest run src/components/InvoicePaper/InvoicePaper.test.tsx` | **1 file / 3 tests passed** |
| extra: `--filter @patina/designer-portal test -- src/app/invoices` | **1 suite / 8 tests passed** (the print-page regression suite that consumes the edited `InvoicePaper`) |

Note: `pnpm --filter @patina/design-system test` (the whole vitest suite) did **not** finish in 25 min and was
abandoned; I ran the single new spec plus the portal print-page suite instead. Flagged, not claimed as green.

---

## Round-1 findings — disposition I could verify

| r1 | Status |
|---|---|
| **B1** name on the homeowner's invoice | **FIXED.** `time-billing.ts` `buildTimeLineDraft` now hard-codes `const label = "Design services"`; the `personName`/`names` branch is gone. Confirmed end-to-end against the live stack (below): the persisted `invoice_line_items.description` came out `"Design services — 1h 30m (2 entries)"` for a two-author selection. |
| **B2** N priced time lines | **FIXED.** `buildComposerLines` calls `buildTimeLineDraft(selection.timeEntries)` once. Live: one `kind='time'` row for a two-author selection, `attribution` rows merged and date-ordered. Side benefit confirmed: **both** entries were claimed (`invoice_id` set on both) — the old N-line shape stranded every author after the first. |
| **M1** CSV Client column joined on the wrong key | **FIXED.** Rekeyed on `c.client_id`; `useClients()` does select `client:profiles!client_id(full_name)`. Measured: `Cedar Lane Study.client_id = a0000000-…-c005` joins `designer_clients.client_id` → profile **Nora Ellison**. |
| **M2** sub-table absent from the printed/PDF copy | **FIXED.** `InvoicePaper` gained `kind`/`metadata` and the same parser; `useInvoice` selects `line_items:invoice_line_items(*)`, so `kind` and `metadata` are present on both portals' print routes. Dist is current (`grep -c patina_time_subtable dist/index.js` → 1) and `infra/deploy-portal.sh:526` rebuilds dependencies, so no stale-dist ship risk. |
| **M3** no render at 390/1440 | **FIXED, and independently re-measured by me** — see "Render check" below. |
| **m1–m10, N1–N16** | **None addressed; none dispositioned.** `W5-fix-r1.md` documents only B1/B2/M1/M2/M3 and has no "declined / deferred" section. Each surviving item is re-reported below. |

---

## Render check — mine, at 1440 and 390, on the live isolated stack

Signed in as `designer@patina.dev` (GoTrue password grant → `@supabase/ssr` cookie), `/desk` → `document:open-ledger`
`detail:'hours'` → scope lens → `THE STUDIO`.

| Control | 1440 | 390 |
|---|---|---|
| `Export → CSV` (new act) | `x 381.5, w 121.75, h 44` | `x 46, w 121.75, h 44` (right edge 167.75) |
| document overflow | `scrollWidth 1440 = clientWidth` | `scrollWidth 390 = clientWidth` |
| enabled state | with one in-window row: **enabled**, `title="Download every entry in this window as a CSV"`; with none: disabled, `title="Nothing to export this window"` | same |
| download | fired; `patina-hours-studio-2026-09-07.csv` | fired; identical file |
| `Bill week → Accounts` (renamed act) | `x 869.4, w 180.1, h 27.5` | `x 154.9, w 180.1, h 27.5` (right edge 335) |
| stale "Export week" anywhere in the DOM | 0 occurrences | 0 occurrences |

CSV actually produced (internal W4 row, `project_id IS NULL`):

```
"Member","Date","Project","Client","Activity","Billable","Duration (min)","Rate","Rate Source","Rate Role","Amount","Billing State","Invoiced","Invoice #"
"Leah Hartwell","2026-09-13","","","admin","No","45","0.00","none","","0.00","nonbillable","No",""
```

Column order matches plan §6's 14 columns exactly and in order; the row names a person and a day; the internal
row's Project cell is empty with no special-casing. **Export act reachable and functional at 390.**

Composer walk (two authors, one project), 1440 and 390: picker rows render, `DRAFT THE INVOICE` produced

```
kind=time | "Design services — 1h 30m (2 entries)" | qty 1 | 22000 |
metadata.attribution = {"kind":"patina_time_subtable",
  "rows":[{"date":"2026-09-11","minutes":60,"rateCents":14500},
          {"date":"2026-09-12","minutes":30,"rateCents":15000}]}
```

and I ran 00588's own attribution sanitiser expression against that stored row — it returns the JSON **verbatim**
(no `@`, no full-UUID match), so the token recipient's folio does receive the sub-table. Combined with
`invoice-sheet-time-subtable.test.tsx`'s four cases, the client folio path is verified; I did not drive a real
`/pay/[token]` page (that needs an issued invoice + link token).

`/invoices/<draft id>/print` renders "Invoice not found" for a **draft** — pre-existing and pinned by
`print-page.test.tsx`; the printed sub-table is covered by `InvoicePaper.test.tsx` instead.

---

## MAJORS

### M1-r2 — The composer's own footnote now tells the designer the opposite of what the code does

`apps/designer-portal/src/components/document/accounts/invoice-composer.tsx:665-667`

```tsx
ticked entries bill as one line per person and lock to the
draft · voiding releases them
```

Before this wave the line read *"ticked entries bill as one line …"* — which was **correct**. Commit `db3558cc7`
changed it to "one line per person" to describe the N-lines-per-author shape; the round-1 fix (`05fab927a`)
reverted the *behaviour* to one merged line and **left the copy**. So the shipped composer states, in the studio's
own words, a billing rule the product no longer follows — and the rule it states is precisely the one LEAH-15 /
REP-15 forced out. Confirmed live at 1440 and 390 (screenshot: "TICKED ENTRIES BILL AS ONE LINE PER PERSON AND
LOCK TO THE DRAFT · VOIDING RELEASES THEM") and against the DB, which produced exactly **one** line for a
two-author selection.

**Fix.** Restore "ticked entries bill as one line and lock to the draft · voiding releases them", or word it for
the new shape ("…bill as one line, dated beneath").

### M2-r2 — plan §6's fifth file row, "per-client **statement**", is still neither built nor dispositioned

plan-v2 §6's Portal-files table carries five rows; the fifth is
`per-client **statement** | modify | reuses R75's composer selection UI; no new route`, and HT-21's own ruling
text points at it ("LEAH-15 and REP-15 say the client needs no staffing detail and a *statement* is the thing to
send. §9"). Nothing in the 6-commit diff touches a statement surface; `grep -rn statement
apps/designer-portal/src/components/document/accounts/` returns nothing; neither `W5-impl.md` nor `W5-fix-r1.md`
mentions the word. Raised as `m9` in round 1 and not answered.

It may well be **vacuous** (no statement component exists in `accounts/` today, so "modify" has no target) — but a
named plan row for this wave has now been silently dropped twice. Graded major by the rubric ("a plan item for
THIS wave missing"); confidence that a *code* change is owed: low. The orchestrator should either rule it vacuous
in the ship note or name the surface.

---

## MINORS

### m1-r2 — The prettier sweep was not reverted; it grew, and it now rewrites a shared design-system file
Round 1's `m1` asked for the 471-line default-Prettier sweep in `e84668322` to be reverted. Instead the fix commit
`05fab927a` swept two more files. Measured on `hours-ledger.tsx` in that commit: **363 of 420 added lines are pure
quote/whitespace reflow** (normalising quotes + spaces makes them identical to a removed line) — only ~57 lines are
the actual M1 fix. `packages/patina-design-system/src/components/InvoicePaper/InvoicePaper.tsx` (385 lines changed
for a ~45-line feature) was converted from the package's house style to **double quotes + semicolons**; every other
file in that package is single-quote, semicolon-free (`Badge.tsx`, `Accordion/index.ts`, … checked). There is still
no `.prettierrc` in `apps/designer-portal`, `packages/patina-design-system`, or the repo root — the sweep applies
Prettier's defaults, not a repo convention. Net: the wave's real diff is buried, blame is rewritten on untouched
lines of a shared component, and one file in a 128-component package now disagrees with all the others.

### m2-r2 — the `patina_time_subtable` marker is now defined in **three** places, not two
`apps/designer-portal/src/lib/document/invoice-composer.ts:44` (`TIME_ATTRIBUTION_KIND`),
`apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx:128` (`TIME_ATTRIBUTION_KIND`),
`packages/patina-design-system/src/components/InvoicePaper/InvoicePaper.tsx:89` (`TIME_SUBTABLE_KIND` — a third
spelling of the same wire contract). All three files already import from `@patina/shared`, which is the obvious
single home. Round 1's `m2` said two; the fix made it three.

### m3-r2 — `downloadTimeExportCsv` still revokes the object URL synchronously
`time-export.ts:130-134` — `URL.revokeObjectURL(url)` in a `finally` right after `anchor.click()`. Three of the
four in-repo download helpers defer it by 1 s (`room-file-download.ts:57`, `export-board.ts:82`,
`spec-pdf-client.ts:59`). Unaddressed from round 1.

### m4-r2 — the same `time_entry_ledger` window is still fetched twice at studio scope
`hours-ledger.tsx:582-587` passes `{studioId, from, to, includeRunning:false}`; `ScopeEntries` at `:1606-1613`
passes `{studioId, userId: memberId, projectId, from, to, includeRunning:false}`. `timeKeys.ledger(params)` hashes
the raw object, so an absent key and an explicit `null` hash differently and TanStack does not dedupe. Unaddressed.

### m5-r2 — `useClients()` still runs for every Hours viewer
`hours-ledger.tsx:293`, unconditional at the component top level; its only consumer is the studio-scope CSV's
Client column, reachable only by an owner/admin. Unaddressed.

### m6-r2 — a rate-pending hour still exports a confident `0.00` (re-measured)
Inserted one billable entry on `Cedar Lane Study` with no rate card; the fact view returned
`rate_source='none', resolved_rate_cents=0, amount_cents=0, billing_state='pending_authorization'`, which
`time-export.ts:78,82` print as `Rate "0.00"` / `Amount "0.00"`. The Hours sheet says "rate pending" for the same
row (HT-26). HT-26's literal words ("instead of a blank") are not violated by `0.00`, so this stays a minor — but
the CSV is the artefact that leaves Patina and it prices a pending hour at zero.
**Ruling owed:** `rate pending` in those two cells, exclusion, or `0.00`.

### m7-r2 — CSV total vs. the rollup total above it can still disagree on legacy rows
The Export sums **every** row's `amount_cents`; the rollup rendered above it is `billable_cents` =
`sum(amount_cents) FILTER (WHERE billable)` (`00607:138`), and `00604:205-208`'s fallback
`round(duration/60 * hourly_rate_cents)` fires when `rated_amount_cents IS NULL`, so a pre-00412 non-billable row
with a rate contributes to one and not the other. No backfill (P-4) means such rows persist. One sentence in the
ship note would close it. Unaddressed.

### m8-r2 — the "sums to the ledger total" test is still self-referential
`time-export.test.ts:120-138` sums the CSV's Amount column and compares it to `timeExportTotalCents(rows)` — two
reductions over the same array. Nothing ties the file to what the sheet shows. `timeExportTotalCents` has no
caller outside the test.

### m9-r2 — the invoice-number lookup still fails silently
`hours-ledger.tsx:598-612`: the `queryFn` throws, nothing surfaces the error, `studioExportInvoices` stays
`undefined`, and every `Invoice #` cell exports empty — indistinguishable from "not invoiced", which the separate
`Invoiced` column contradicts by saying `Yes`. Round 1's N6, unaddressed.

### m10-r2 — still no component test of the Export act
Neither `hours-ledger-scope.test.tsx` nor `hours-ledger-add-row.test.tsx` gained a case; both only added a
`useClients` mock. Nothing asserts the act renders at studio scope, is hidden elsewhere, is disabled on an empty
window, or that the enriched rows carry `client_name` / `invoice_number` — the last of those is exactly what would
have caught r1's M1. (I verified all four live this round; there is still no regression net.)

### m11-r2 — NEW: the export window is a **local** date range applied to a **UTC** `day` column
`fromDate`/`toDate` come from `weekRange()` (`hours-ledger.tsx:132-140`), which is local-midnight arithmetic, and
are sent as `day=gte./lte.` against `time_entry_ledger.day = (started_at AT TIME ZONE 'UTC')::date`
(`00604:184-190`). For a US-Central studio, an entry logged after ~19:00 local on the last day of the shown week
has a UTC `day` one past `toDate` and is **silently absent from the file**, while the sheet's own week list
(`document-hours-week`, which filters on `started_at` timestamps, `:243`) still counts it. The rollup uses the same
date bounds, so CSV↔rollup stay consistent; it is the file vs. the visible week list that can disagree. View
semantics are W2's, but W5 is the first surface that exports them.

### m12-r2 — NEW: the renamed R75 act is 27.5 px tall
`Bill week → Accounts` (`hours-ledger.tsx:777-800`) is a bare `<button>` with `px-2.5 py-1 text-[11px]`; measured
`height 27.5` at both 1440 and 390, against the program's "acts ≥ 44px" rule. Pre-existing markup — this wave
changed only the label — so it is not a regression, but the wave touched the act and left it under the bar while
its new sibling `Export → CSV` (a `DocumentAction`) is a correct 44 px. Worth closing while the file is open.

### m13-r2 — NEW: "beside the studio scope" is rendered as "beneath"
plan §6 places the Export act "beside the studio scope". It ships as its own block under the lens
(`<div className="-mt-2 mb-4">`, `hours-ledger.tsx:840`). Reads fine (screenshots at both widths), and it sits
above the totals so HT-30 is not at risk — flagged only because the plan wording says beside.

### m14-r2 — NEW: the fix round recorded no disposition for any round-1 minor or note
`W5-fix-r1.md` covers B1/B2/M1/M2/M3 and nothing else; 10 minors and 16 notes were left unanswered and
unmentioned. Round 1's brief asked for every finding to be reported so the orchestrator could filter — the fix
round did not close the loop, which is why this review re-reports ten of them verbatim.

---

## NOTES

- **N1 — HT-21's "the composer names the person" is inert for the project's own designer, and that is now the
  ONLY naming surface.** Measured live, two rows in the picker: `"12 September probe B"` (author = the project's
  designer — **no name**) and `"Studio Manager · 11 September probe A"` (a roster member — named). Cause:
  `invoice-composer.tsx:215-231` maps `v_project_roster.profile_id → display_name`, and `v_project_roster`
  (`00419:94-155`) is `project_parties ∪ project_team_members` only — the project designer is deliberately never
  seated (`00597:98-114` returns early for `p.designer_id = NEW.user_id`). In Leah's one-designer studio — the
  named customer — **every** composer row takes the unnamed path, so HT-21's first clause delivers nothing there.
  Unchanged by the fix (the deleted description branch read the same map), but it matters more now that the
  description is generic by design. **Ruling owed:** name the project designer from `projects.designer_id →
  profiles` in the picker, or accept that HT-21 names only non-designer authors.
- **N2 — the merged sub-table can print two rows for one date at two different rates, which is staffing detail by
  inference.** Round 1's B2 fix (as instructed) merges `dateRows` across people without collapsing per date:
  `time-billing.ts:110-121` maps one row per **entry**. My live payload happened to have distinct dates
  (`$145.00/hr` and `$150.00/hr` on consecutive days), but two people working the same day produce two same-date
  rows at two rates on the homeowner's folio. LEAH-15/REP-15 say the client needs no staffing detail.
  **Ruling owed:** collapse to one row per date (and at what rate), or keep per-entry rows. Also: no cap on row
  count — a month of daily entries is ~30 JSON rows in `metadata.attribution` and 30 printed lines.
- **N3 — a `0.00/hr` sub-table row is theoretically reachable.** The composer's picker source
  `project_unbilled_time` computes `resolved_rate_cents = COALESCE(hourly_rate_cents, 0)` and filters
  `billing_state = 'authorized'`; if an authorized row ever carries a NULL rate, the homeowner's folio prints
  `$0.00/hr`. I could not produce such a row through the classifier, so: low confidence, no action beyond naming it.
- **N4 — `@patina/design-system` is dist-resolved, contradicting the `patina-portal-features` skill.**
  `package.json` `main: ./dist/index.cjs`, `exports["."].import: ./dist/index.js`; the skill lists this package as
  source-resolved. `W5-fix-r1.md` flagged the drift and rebuilt the dist. No ship risk —
  `infra/deploy-portal.sh:526` runs `turbo build --filter="<app>^..."` — but the **skill is wrong** and should be
  corrected outside this program.
- **N5 — the decision ledger still records the R75 act under its old name.**
  `docs/design/the-document/DECISIONS.md:489` and `:2737` say "Export week → Accounts"; the shipped label is
  "Bill week → Accounts". DECISIONS.md is append-only, so the fix is a new entry under the program's `R152`.
  Round 1's m10, unaddressed. **Docs owed.**
- **N6 — the fix round ran its dev server on port 3000**, which this stage's port rule reserves for the peer
  program (`W5-fix-r1.md`: "the running dev server (`pnpm dev`, port 3000)"). No harm observed — 3000 was held by
  the peer when I checked and I never touched it — but the rule was not followed. Process note only.
- **N7 — `notes` is nowhere in the wave's output.** Re-confirmed: no `notes` column in the 14-column header, none
  in `TimeAttributionPayload`, none in `time_entry_ledger`. HT-36 holds on every new surface. (The picker shows
  `entry.notes` to the *designer* — visible in my screenshot as "probe A"/"probe B" — pre-existing, designer-side.)
- **N8 — no flag, no dashboard, no tab, no badge, no red/green, no per-second motion.** No `useFeatureFlag` added
  by the diff (the `studio-invoice` call in `invoice-composer.tsx` is pre-existing R136 and was only quote-reflowed).
  The Export act is an unconditional tertiary `DocumentAction`; both sub-tables are plain mono text
  (`--color-quiet-ink` / `#8A857C`). P-5 and R69 hold.
- **N9 — data access is through hooks.** `useTimeEntryLedger`, `useClients`, `useProjectRoster`, `useUnbilledTime`,
  `useInvoice` — all `@patina/supabase`. Two raw `supabase.from()` reads inside `HoursLedger` (`projects` at `:267`,
  `invoices` at `:598`) follow that file's own pre-existing pattern; W5 only added `client_id` to the first's
  select. No ad-hoc fetch to a NestJS service. `@patina/supabase` is source-resolved, so no dist owed there.
- **N10 — the mock fallback could not mask anything.** `.env.local` verified at
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421` + `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` before the walk,
  and every rendered figure was cross-checked against `psql` / PostgREST.
- **N11 — accessibility.** `Export → CSV` is a real `<button>` inheriting `min-h-[44px] min-w-[44px]`
  (`document-action.tsx:54`); its disabled reason lives only in `title`, which a disabled button does not reliably
  announce — same as the sibling Bill-week act, so not a regression. The client sub-table and the printed one are
  `<span>`/`<div>` stacks inside the description cell, announced in reading order; a real `<table>` would read
  better. `InvoicePaper` uses inline `fontSize: '0.7rem'` — consistent with that component's all-inline print
  styling, not with §A's "no inline font-size", but the file is print paper and was already written that way.
- **N12 — commit hygiene is good.** Six commits, Conventional Commits types only (`feat(time)`, `chore(time)`,
  `fix(time)`); the fix commit's body names each finding and the gates. `git diff --name-only` over the range shows
  only `apps/**` and `packages/patina-design-system/**`; **zero** files under `supabase/` (no migrations, correctly
  — `00615` and `00620` are W2's, as §6 requires the ship note to say); `supabase/config.toml` still
  `skip-worktree` (`git ls-files -v` → `S`) and untouched; no `.env`, no generated artefacts, no `git add -A` smell.
- **N13 — out of W5's scope, nothing owed here.** HT-41's role chip is W3 (portal) / W6 (Field); HT-11's explicit
  billable at capture surfaces is W3/W6 — the CSV does carry a `Billable` column. The untracked `15-hours.md` help
  article and the Sanity push are scoped out of the program. HT-35 is stage 4.

---

## What I could not refute

- All seven named gates reproduce, plus three extra ones I added for the shared-package edit.
- The 14 columns are in plan order; RFC-4180 escaping is a verbatim port of `qbo-export/index.ts:170-174`; an
  internal row exports an empty Project cell; every row names a person and a day.
- The client's folio keeps **one** priced `kind='time'` line with a dated sub-table and no staffing detail —
  verified against a real drafted invoice row, not only in jest.
- 00588's attribution sanitiser passes the JSON payload through verbatim, so the token recipient does get the
  sub-table; the parser falls back to plain text for a legacy string and for every non-`time` kind (4 cases pinned).
- Both authors' entries are invoice-claimed by the single-line shape — the stranded-hours hazard the fix report
  claims is real and closed.
- `time_export_taken` exists in the canonical emitter with `{scope, row_count, period}`
  (`document-events.ts:291-295`) and fires once, after the download.
- The export act is reachable, sized and functional at **390** as well as 1440, with no document overflow at either.
- The renamed act and the new act have different names, and no "Export week" string survives anywhere in `apps/`.
