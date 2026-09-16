# W5 — The bookkeeper's Friday · adversarial review, round 1

**clean = false** (2 blockers, 3 majors)

**Reviewer context** separate from the implementer. Branch `hour-tracking/portal` @ `4478b769b`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`, diffed against `origin/hour-tracking/integration`
(5 commits, 14 files, +1527/−471). Plan §0 + §6 read in full; `rulings.md` HT-1…HT-41, HT-3-a…g, HT-10-a read.
Local stack `127.0.0.1:54421 / :54422` used **read-only plus one probe row inserted and deleted** (final count
`select count(*) from project_time_entries` → `0`, and no stray `project_team_members` row: the auto-roster
trigger did not fire). No `supabase db reset`. Dev server ran on **3100** and was killed (`lsof -ti:3100` empty);
`next-env.d.ts`, which the dev server rewrote, was restored — the worktree is clean
(`git status --porcelain` → empty).

---

## Gates — run by me, verbatim

| Command | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --dir <wt> --filter @patina/designer-portal test -- <the 6 specs this wave names>` | **6 suites / 105 tests passed** (`time-export.test.ts`, `time-billing.test.ts`, `invoice-composer.test.ts`, `hours-ledger-scope.test.tsx`, `hours-ledger-add-row.test.tsx`, `invoice-composer-studio.test.tsx`) |
| `pnpm --dir <wt> --filter @patina/designer-portal lint` | **0 errors, 201 warnings** — every warning pre-existing, none in a touched file |
| `pnpm --dir <wt> --filter @patina/admin-portal build` | **exit 0**, full route manifest printed |
| `pnpm --dir <wt> --filter @patina/client-portal type-check` | **clean** |
| `pnpm --dir <wt> --filter @patina/client-portal test` | **151 suites / 2475 tests passed**, 1 snapshot |

Every gate the implementer claimed reproduces. **The gates are green and the wave is still not shippable** —
the defects below are all inside the green.

---

## BLOCKERS

### B1 — The staff member's name is printed on the homeowner's invoice (LEAH-15 / REP-15 / HT-21 / plan §6)

`apps/designer-portal/src/lib/time-billing.ts:97-117`

```ts
const personName = names.size === 1 ? [...names][0] : null;
const label = personName ?? "Design services";
…
description: `${label} — ${formatHoursLabel(totalMinutes)} (${entries.length} ${noun})`,
```

That `description` is the invoice line's `description`. The chain, verified end to end:

1. `apps/designer-portal/src/components/document/accounts/invoice-composer.tsx:212-231` attaches
   `member_name` (from `useProjectRoster`) to every unbilled entry, and `:326` puts those enriched entries
   into `selection.timeEntries`.
2. `apps/designer-portal/src/lib/document/invoice-composer.ts:198-219` builds one `DraftLineInput` per person
   with `description: draft.description` → `"Maria Alvarez — 4h 30m (3 entries)"`.
3. `supabase/migrations/00588_invoice_link_household_name.sql:227` — `resolve_invoice_link` returns
   `'description', li.description` **verbatim**. The sanitiser at `:232-244` (drops `@`, drops UUIDs) guards
   only `attribution`, never `description`.
4. `apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx:871` renders `{line.description ?? "—"}` to the
   token recipient.

plan-v2 §6 states the constraint in bold: *"**No staffing detail reaches the homeowner** (LEAH-15, REP-15)."*
HT-21's ruling row says the same ("LEAH-15 and REP-15 say the client needs no staffing detail"). The wave ships
the exact opposite: the homeowner's pay sheet now names the studio's employees and shows each one's hours and
money.

The implementer's own report asserts the inverse three times ("never a name, never a `member_name` field
anywhere in the JSON", "so there is nothing to scrub here"). That is true of the **sub-table payload** and false
of the **line description**, which is the far more prominent of the two.

Blast radius beyond the pay sheet: `packages/patina-design-system/src/components/InvoicePaper/InvoicePaper.tsx:212`
renders `{line.description}` too, so the printed/PDF copy a designer hands a client carries the same names.

**Fix.** The designer-facing composer may name the person (that is HT-21's "composer: yes, name the person");
the persisted `invoice_line_items.description` may not. Either keep the description generic and carry the name
in `metadata` for designer-side renderers only, or — with B2's fix — emit one generic line and put per-person
grouping in the composer UI alone. A test that renders `InvoiceSheet` with a **named** description (the
production shape) is what would have caught this; see N4.

### B2 — The client's folio gets N priced time lines, not one (plan §6 Done-when)

plan-v2 §6, file row for `invoice-composer.ts`: *"one composer row per person; **the client's folio keeps one
`kind='time'` line**"*, and the Done-when: *"The client's folio shows **one** priced line with a dated sub-table
and no staffing detail."*

The implementation emits one `kind='time'` line **per person** and its own test pins that shape:
`apps/designer-portal/src/lib/document/__tests__/invoice-composer.test.ts:145-147` —
`expect(timeLines).toHaveLength(2)`, descriptions `"Leah Brooks — 30m (1 entry)"` /
`"Maria Alvarez — 1h (1 entry)"`. `invoice-composer.ts:196-219` is the `flatMap` over `groupEntriesByPerson`.

`W5-impl.md` §0 acknowledges the plan text and argues past it ("Each such line is itself the person's one
collapsed line … that is the 'one kind=time line' architecture.md means per person"). That reading cannot be
reconciled with the Done-when's unqualified "**one** priced line", and it is what makes B1 possible.

Substantively it also defeats LEAH-15/REP-15 independently of the names: a folio with three time lines, three
sub-tables and three different `/hr` figures is staffing detail in everything but the label.

**Fix.** One `kind='time'` line for the selection, with the dated sub-table beneath it (rows merged across
people, date-ordered). Per-person grouping stays designer-side in the composer picker, which already shows it
(`invoice-composer.tsx:641-647`).

---

## MAJORS

### M1 — The CSV's `Client` column is joined on the wrong key and is empty for every row

`apps/designer-portal/src/components/document/hours-ledger.tsx:280-292`

```ts
const clientNames = new Map(
  (designerClients ?? []).map((c) => [c.id, c.client?.full_name ?? c.client_name ?? null]),
);
return new Map((projects ?? []).map((p) => [p.id, p.client_id ? (clientNames.get(p.client_id) ?? null) : null]));
```

The map is keyed on `designer_clients.id`; the lookup value is `projects.client_id`, which FKs **`profiles.id`**,
not `designer_clients.id` — `packages/supabase/src/database.types.ts` projects Relationships:
`projects_client_id_fkey · columns ["client_id"] · referencedRelation "profiles"`. `designer_clients` has its
own `client_id` column (→ profiles) which is the correct key.

Measured on the live isolated stack (read-only):

```
select (select count(*) from projects where client_id is not null),
       (select count(*) from projects p join designer_clients dc on dc.id = p.client_id),
       (select count(*) from projects p join designer_clients dc on dc.client_id = p.client_id),
       (select count(*) from projects p join profiles pr on pr.id = p.client_id);
→ 4 | 0 | 13 | 4
```

Zero rows match the key the code uses; 13 match the correct one. So a plan-mandated column of the bookkeeper's
file (`Client`, column 4 of the fixed 14) is **always blank in production**, silently.

Concretely: `Cedar Lane Study` (`b0000000-…-c0d1`) has `client_id = a0000000-…-c005` = profile **Nora Ellison**,
and its `designer_clients` row is `d0000000-…-c001`. `clientNames.get('a0000000-…-c005')` → `undefined`.

**Fix.** Key the map on `c.client_id` (dropping rows where it is null), or join the project's client name the way
the rest of the portal does. The `?? null` swallow is what makes it silent — an empty Client column reads as
"this project has no client", not as a broken join.

### M2 — HT-21's dated sub-table never reaches the printed / PDF invoice

`apps/designer-portal/src/app/invoices/[invoiceId]/print/page.tsx:116` renders `<InvoicePaper>`, and
`packages/patina-design-system/src/components/InvoicePaper/InvoicePaper.tsx:27-29,212` has no `attribution`
field and no sub-slot — it prints `line.description` and nothing else. So the copy a designer prints or saves
as PDF for a client shows the priced line(s) with **no dated sub-table at all**, while the pay-link sheet shows
one. HT-21 rules the client line as "one priced line **plus** a dated sub-table"; the printed client artefact
does not carry it.

plan-v2 §6 names only `invoice-sheet.tsx`, so this is arguably out of the literal file list — but it is the same
ruled client-facing artefact, it is a divergence a client will see (two different invoices for one invoice), and
it compounds B1 (the print path leaks the names with none of the sub-table that was supposed to justify them).
Reported as a major because the ruled client experience is only half delivered; the orchestrator may re-scope it.

### M3 — No live render at 390 or 1440 — neither by the implementer nor, despite three approaches, by me

The program's standing rule is that every new or changed control is verified at **390 as well as 1440**.
`W5-impl.md` contains no render section and makes no such claim — correctly, it did not do one. My attempt:

- `.env.local` already pointed at `http://127.0.0.1:54421` with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`
  (so the mock fallback could not mask a broken query).
- Dev server on **3100** (`next dev --webpack --port 3100`; 3000/3002 untouched), `.next` cleared and rebuilt.
- Signed in as `designer@patina.dev` / `password123` (owner of `Local Dev Studio b0000000-…-0001`), GoTrue
  password grant → `@supabase/ssr` cookie; `/desk` renders authenticated (screenshot taken).
- **The page never becomes interactive.** `Object.keys(el).filter(k => k.startsWith('__react'))` on the drawer's
  `[data-studio-books-doorway]` returns `[]` — no React fiber is attached — and three separate openers all
  no-op: clicking the Contents "Hours" button, `window.dispatchEvent(new CustomEvent('document:open-ledger',
  {detail:'hours'}))`, and ⌘K. `[data-doc-sheet-layer]` count stays 0 in every case. The route chunk
  (`app/(document)/desk/page.js`) does eventually load (~45 s), but hydration still does not attach. No page
  errors, no console errors.

So the Export act was **never observed on screen at either width**. What I can say from the source:
`hours-ledger.tsx:801-820` puts the single `DocumentAction` in a bare `<div className="-mt-2 mb-4">` inside the
sheet's `mx-auto max-w-3xl` column; `document-action.tsx:54` gives every variant `min-h-[44px] min-w-[44px]`
(house sheet §A's ≥44px act satisfied) and `whitespace-nowrap` on an ~11-character mono label at `text-[12px]`
(~110px wide) — it cannot overflow 390 by construction. That is reasoning, not measurement, and the rule asks
for measurement. Flagged so the orchestrator can decide whether to route a walk to whichever lane owns a working
dev server, rather than let the wave merge with the check silently skipped.

---

## MINORS

### m1 — A 471-line prettier sweep on a false premise, in its own commit

`e84668322 "chore(time): prettier formatting on the HT-21 changes"` reflows **629 insertions / 471 deletions**
across 7 files and converts them from the repo's single-quote house style to double quotes — including
`invoice-overlays.tsx`, which this wave otherwise touches by exactly one comment word. The commit message says
"per this app's prettier config". There is no such config: `apps/designer-portal` has no `.prettierrc` /
`prettier.config.*`, and neither does the repo root (`patina-verification` documents this: root `format` runs
plain Prettier defaults, and only `services/media` and `services/projects` carry their own). So the sweep applied
**Prettier's defaults**, which disagree with the surrounding code — `hours-ledger.tsx` in the same directory is
19/19 single-quoted imports. Net effect: the wave's real diff is buried, blame is rewritten on untouched lines,
and two adjacent files in one folder now disagree on quote style. Not a behaviour change; revert the sweep and
keep the wave's own edits in the house style.

### m2 — `TIME_ATTRIBUTION_KIND` is duplicated across portals, not shared

`invoice-composer.ts:36` exports `TIME_ATTRIBUTION_KIND = "patina_time_subtable"`; `invoice-sheet.tsx:127`
declares its own `const TIME_ATTRIBUTION_KIND = "patina_time_subtable";`. The client portal cannot import from
the designer portal, so this is a cross-portal magic string with two independent definitions and nothing tying
them together. `W5-impl.md` §2 claims it is "one shared constant (referenced, not duplicated, in the
client-sheet's parser)" — that is not what the code does. It belongs in `@patina/shared` or `@patina/types`
(both already imported by both sheets), or the wire format drifts the first time someone renames it.

### m3 — `downloadTimeExportCsv` revokes the object URL synchronously after `click()`

`time-export.ts:122-135` calls `URL.revokeObjectURL(url)` in a `finally` immediately after `anchor.click()`.
Three of the four in-repo download helpers defer it — `room-file/room-file-download.ts:57`,
`mood-board-assets/export-board.ts:82`, `scope/spec-pdf-client.ts:59` all use
`setTimeout(() => URL.revokeObjectURL(url), 1000)`; only `hooks/use-account-page.ts:249` revokes immediately.
Synchronous revocation is the known-fragile variant (Firefox/Safari can abort the download). Cheap fix: match
`room-file-download.ts`.

### m4 — Two identical `time_entry_ledger` reads whenever the studio scope is open with the rows expanded

`hours-ledger.tsx:564-569` calls `useTimeEntryLedger({ studioId, from, to, includeRunning: false })`;
`ScopeEntries` at `:1564-1571` calls `useTimeEntryLedger({ studioId, userId: null, projectId: null, from, to,
includeRunning: false })`. `timeKeys.ledger(params)` (`use-time-tracking.ts:45`) hashes the raw params object,
and an absent key hashes differently from an explicit `null`, so TanStack does **not** dedupe: the same rows are
fetched twice. Passing `userId: null, projectId: null` in the export's params makes the two one query.

### m5 — `useClients()` runs for every Hours viewer, including plain members who can never export

`hours-ledger.tsx:281` calls `useClients()` unconditionally at the component top level. The only consumer is the
studio-scope CSV's Client column, which only an owner/admin in the studio scope can reach. Every plain member
opening Hours now pays for a full `designer_clients` read (with two profile joins) that is discarded.

### m6 — A rate-pending hour exports as a confident `0.00`, with no word for it

Measured: I inserted one probe entry on `Cedar Lane Study` and read it back from the fact view —

```
Leah Hartwell | 2026-09-10 | Cedar Lane Study | …-0001 | design | t | 90 | none | lead_designer | 0 | 0 | pending_authorization |
```

`time-export.ts:79,82` run that through `centsToDollars(0)` → the file says `Rate "0.00"`, `Amount "0.00"`. The
Hours sheet prints "rate pending" for exactly this row (HT-26); the bookkeeper's file prints a number that reads
as "this hour is worth nothing". `Rate Source "none"` is the only tell, and it is machine vocabulary in column 9.
HT-26 as worded ("instead of a blank") is not violated — `0.00` is not blank — so this is a minor, but it is the
same class of silent money defect W0 exists to kill, and the CSV is the artefact that leaves Patina.
**Ruling owed:** should a `rate_source = 'none'` row print `rate pending` in the Rate and Amount cells, or be
excluded, or stay `0.00`?

### m7 — The CSV total and the rollup total directly above it can disagree on legacy rows

The Done-when says "the amounts sum to the ledger's total". The Export sums **every** row's `amount_cents`
(`timeExportTotalCents`, all rows). The rollup rendered above it reports `billable_cents`, which
`00607_studio_hours_rollup.sql:138` computes as `sum(amount_cents) FILTER (WHERE billable)`. For rows written by
the current classifier these agree (`00613:296` sets `rated_amount_cents := 0` on the non-billable branch), but
`00604:205-208`'s fallback `round(duration/60 * hourly_rate_cents)` fires whenever `rated_amount_cents IS NULL`
— a pre-00412 non-billable row with a rate then contributes to the CSV total and not to the rollup. No backfill
(P-4) means such rows persist. Worth one sentence in the ship note if not a code change.

### m8 — The wave's own "sums to the ledger total" test is self-referential

`time-export.test.ts:120-138` sums the CSV's Amount column and compares it to `timeExportTotalCents(rows)` —
two reductions over the same array. It proves the column is parseable, not that the file ties to anything the
sheet shows. (It also splits data lines on `,` at `:92,112,133`, which only survives because none of those
fixtures has a comma in an earlier field — the one fixture that does, at `:77`, is checked with `toContain`.)

### m9 — Plan row "per-client **statement**" is unaddressed and unmentioned

plan-v2 §6's file table carries a fifth row — `per-client **statement** | modify | reuses R75's composer
selection UI; no new route` — and HT-21's ruling text points at it ("a *statement* is the thing to send. §9").
Nothing in the diff touches a statement surface, and `W5-impl.md` has no deferred-items section saying so. There
is no statement component in `accounts/` today, so the row may be vacuous — but it should be named and closed
rather than silently dropped.

### m10 — Renaming R75's act leaves the decision ledger contradicting the shipped label

`hours-ledger.tsx:764` now reads `Bill week → Accounts`. `docs/design/the-document/DECISIONS.md:2737` (R75) and
`:489` both name the act `"Export week → Accounts"` in ruled text. DECISIONS.md is append-only, so the fix is a
new entry, not an edit — but a ruled act's user-visible name changed with nothing in the ledger recording it.
**Ruling/docs owed** (note the program already holds `R152` for its own entries).

---

## NOTES

- **N1 — the `member_name` on the picker is silently absent for the project's own designer.**
  `invoice-composer.tsx:212-219` maps `v_project_roster.profile_id → display_name`; the project designer is
  never a `project_team_members` row, so her entries group under `user_id` with `memberName: null` and fall back
  to `"Design services"`. `W5-impl.md` §3 says so plainly, which is good — but in a one-designer studio (Leah's,
  the named customer) *every* time line takes the unnamed path, so HT-21's "the composer names the person" is
  inert for the primary customer while it is fully active (and leaking, per B1) for the multi-member case. Worth
  a ruling on whether the project designer should be named from `projects.designer_id` → `profiles`.
- **N2 — the sub-table is one row per *entry*, not per date.** `time-billing.ts:105-114` maps each input entry
  to a row, so two entries on the same day print that date twice. HT-21 says "dated sub-table"; per-entry rows
  are a defensible reading but expose entry granularity to the homeowner. No cap on row count either — a month
  of daily entries is ~30 JSON rows in `metadata.attribution` and 30 printed lines under one invoice line.
- **N3 — `line.kind` is what protects every other line kind's `attribution`**, and that is correct:
  `invoice-sheet.tsx:865-866` gates `parseTimeSubtable` on `line.kind === "time"`, and the test at `:131-142`
  pins it. Verified there is no other reader of invoice-line `metadata.attribution` in either portal.
- **N4 — the client-sheet test's LEAH-15 assertion is vacuous.**
  `invoice-sheet-time-subtable.test.tsx:64` builds the line with `description: "Design services — 2h (2 entries)"`
  — the *generic* form — then asserts at `:113-115` that no name appears. The production description under this
  wave is `"Maria Alvarez — …"`, which the fixture never exercises. The one assertion written to catch B1 was
  aimed at a shape the code no longer produces.
- **N5 — there is no component test of the Export act at all.** Neither `hours-ledger-scope.test.tsx` nor
  `hours-ledger-add-row.test.tsx` gained a case for it; both only added a `useClients` mock. Nothing asserts it
  renders at studio scope, is hidden elsewhere, is disabled when the window is empty, or that the enriched rows
  carry `client_name` / `invoice_number` — M1 would have been caught by the last of those.
- **N6 — the invoice-number lookup fails silently.** `hours-ledger.tsx:576-588` throws inside `queryFn`, and the
  failure is never surfaced: `studioExportInvoices` stays `undefined` and every `Invoice #` cell exports empty,
  indistinguishable from "not invoiced" (which the `Invoiced` column separately says `Yes` for). One inline arm
  (the sheet already does this for the pricing-studio read at `:876-884`) would make it honest.
- **N7 — `TimeEntryLedgerRow.project_id` is typed `string` (non-nullable)** in
  `use-time-tracking.ts:778`, though W4 shipped `project_id IS NULL` internal time. `time-export.ts` handles null
  correctly at runtime (`row.project_id ? … : null`), and the test has to cast
  (`project_id: null as unknown as string`, `time-export.test.ts:89`). Pre-existing from W2, not W5's to fix, but
  the cast in a new test is where it becomes visible.
- **N8 — RFC-4180 escaping is a verbatim port and is correct.** `time-export.ts:58-62` matches
  `supabase/functions/qbo-export/index.ts:170-174` character for character (quote-wrap, `"` → `""`, `[\r\n]+` →
  space). Flattening rather than preserving embedded newlines is the precedent's own convention; called out only
  because the plan's test row said "escaping … a newline".
- **N9 — `notes` is nowhere in the wave's output.** Confirmed: no `notes` column in the 14-column header, no
  `notes` in `TimeAttributionPayload`, `time_entry_ledger` carries none (`00604` comment), and the sub-table
  payload is `{date, minutes, rateCents}` only. HT-36 holds on both new surfaces. (The composer picker shows
  `entry.notes` to the *designer* at `invoice-composer.tsx:650` — pre-existing, designer-side, not a leak.)
- **N10 — no flag, no dashboard, no tab, no badge, no red/green, no per-second motion.** The Export act is an
  unconditional `DocumentAction variant="tertiary"`; no `useFeatureFlag` anywhere in the diff; the sub-table is
  plain mono text in `--color-quiet-ink`. R69 and P-5 hold.
- **N11 — data access is through hooks throughout**, with two raw `supabase.from()` reads inside `HoursLedger`
  (`projects` at `:266-275`, `invoices` at `:576-588`) that follow the file's own existing pattern — the
  `document-hours-projects` query was already there and W5 only added `client_id` to its select. No ad-hoc fetch
  to a NestJS service. `@patina/supabase` is source-resolved (`"main": "./src/index.ts"`), so no dist rebuild is
  owed; no `@patina/*` package was edited by this wave at all.
- **N12 — accessibility.** The Export act inherits `DocumentAction`'s `min-h-[44px]`/`min-w-[44px]` and a real
  `<button>`. Its disabled reason is carried only in `title` (`hours-ledger.tsx:810-814`), which a disabled
  button does not reliably announce — consistent with the sibling "Bill week" act at `:746-750`, so not a
  regression, but neither act tells a screen-reader user why it is dead. The client sub-table is a `<span>` stack
  inside the description cell, announced in reading order; acceptable, though a real `<table>` (or at least
  `role="list"`) would read better.
- **N13 — commit hygiene is otherwise good.** Five commits, Conventional Commits types only (`feat(time)`,
  `chore(time)`), messages that name the ruling and the gate results. `git show --stat` per commit shows only
  `apps/**` paths — no `supabase/config.toml` (still `skip-worktree`, `git ls-files -v` → `S`), no `.env`,
  no generated artefacts, no `git add -A` smell. Working tree clean.
- **N14 — no migrations, correctly.** The wave mints nothing; `00615` and `00620` are W2's, as §6 requires the
  ship note to say. `W5-impl.md` states this. Confirmed `supabase/migrations/` is untouched by all five commits.
- **N15 — scope-gating of the Export act is effectively admin-only but not stated as such.**
  `hours-ledger.tsx:800` gates on `scope === 'studio'` alone; a plain member can never reach that scope
  (`:653-657` forces `'mine'` when `!viewerIsOwnerOrAdmin`, and the lens at `:771` is `viewerIsOwnerOrAdmin`-gated),
  so the act is admin-gated in practice. Fine as built; worth one comment so a later edit to the landing logic
  does not quietly hand a member a studio-wide export.
- **N16 — `client_id` was added to the `document-hours-projects` select** (`:269`), which widens a query every
  Hours viewer runs; additive and harmless, and it becomes dead weight if M1 is fixed by joining differently.

---

## What I could not refute

- Column order matches plan §6's 14 columns exactly, in order (`time-export.test.ts:52-71` pins it).
- An internal row (`project_id IS NULL`) exports an empty Project cell with no special-casing — the view's own
  `LEFT JOIN` leaves `project_name` null (`00604:218-219`).
- Every CSV row names a person (`member_name`) and a day (`day`), per the Done-when — subject to `member_name`
  being null for an author outside the caller's `profiles` RLS, which the view's `LEFT JOIN` deliberately allows.
- The renamed act and the new act have different names, and nothing in `apps/` still says "Export week".
- `time_export_taken` exists in the canonical emitter with `{scope, row_count, period}`
  (`document-events.ts:291-295`) and is fired once, after the download, from the act.
- The client folio renders for a token recipient: `InvoiceSheet` renders the sub-table from a parsed payload and
  falls back to plain text for a legacy string and for every non-`time` kind (4 cases pinned).
