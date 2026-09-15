# W5 — The bookkeeper's Friday · adversarial review, round 3

**clean = false** (0 blockers, 1 major)

**Reviewer context** separate from the implementer and from rounds 1 and 2. Branch `hour-tracking/portal`
@ `a0186d3da`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`, diffed against
`origin/hour-tracking/integration` (7 commits, 16 files, +2342/−960). Read in full: plan-v2 §0 + §6,
`rulings.md` (HT-1…HT-41, HT-3-a…g, HT-10-a), `W5-impl.md`, `W5-review-r2.md`, `W5-fix-r2.md`.

**Live evidence this round.** Designer-portal dev server on **3100 only** (3000/3002 never started, never probed,
never killed). Isolated stack `127.0.0.1:54421 / :54422` (never reset). `.env.local` verified at
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421` + `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` before the walk,
so no mock fallback could mask a broken query. Driven with Playwright (chromium) at **1440 and 390**, signed in by
injecting a GoTrue password-grant session into the `@supabase/ssr` cookie. Five probe rows inserted
(`project_time_entries` ×5, `studio_member_rates` ×1, `project_team_members` ×1, `invoice_line_items` ×1,
`invoice_links` ×1) and **all removed**: final counts `project_time_entries 0 · project_team_members 0 ·
studio_member_rates 0 · invoice_links 0 · invoices 3 · invoice_line_items 3` — the pre-walk baseline. No
`supabase db reset`. `next-env.d.ts` (rewritten by the dev server) restored with `git checkout --`;
`git status --porcelain` clean; port 3100 free.

---

## Gates — run by me, verbatim

| Command | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --dir <wt> --filter @patina/designer-portal test -- <the 6 specs this wave names>` | **6 suites / 105 tests passed** (`time-export.test.ts`, `time-billing.test.ts`, `invoice-composer.test.ts`, `hours-ledger-scope.test.tsx`, `hours-ledger-add-row.test.tsx`, `invoice-composer-studio.test.tsx`) |
| `pnpm --dir <wt> --filter @patina/designer-portal lint` | **0 errors, 201 warnings** — identical count to r2's baseline; none in a touched file |
| `pnpm --dir <wt> --filter @patina/admin-portal build` | **exit 0**, full route manifest printed |
| `pnpm --dir <wt> --filter @patina/client-portal type-check` | **clean** |
| `pnpm --dir <wt> --filter @patina/client-portal test` | **151 suites / 2475 tests passed**, 1 snapshot |
| extra — full suite, not just the named specs: `--filter @patina/designer-portal test` | **579 suites / 7376 tests passed** |
| extra — shared-package edit: `--filter @patina/design-system type-check` | **clean** |

`@patina/design-system`'s own vitest suite was **not** run (r2 recorded it does not finish in 25 min); its one new
spec `InvoicePaper.test.tsx` is covered by r2's run and by the designer-portal print-page suite inside the 579
above. Stated, not claimed as green.

---

## Round-2 findings — disposition I could verify

| r2 | Status |
|---|---|
| **M1-r2** composer footnote contradicted the code | **FIXED, and driven by me at both widths** (the fix round could only reason about it). Live text: `ticked entries bill as one line, dated beneath, and lock to the draft · voiding releases them` — 1440: `x 402, right 1039`; 390: `x 46, right 344` (viewport 390, no clip, no overflow). |
| **M2-r2** plan §6's "per-client statement" row | **Dispositioned as vacuous; independently re-checked.** `grep -rin statement apps/designer-portal/src/components/document/accounts/` → zero hits. Accepting the disposition, with N14-r3 below. |
| **m1-r2 … m14-r2, N1 … N13** | **None addressed.** `W5-fix-r2.md` says so outright ("out of scope for this fix pass — the orchestrator named only M1-r2 and M2-r2"). Each is re-reported below, several with fresh measurements. |

---

## Render check — mine, at 1440 and 390, on the live isolated stack

`/desk` → welcome modal dismissed → `document:open-ledger` `detail:'hours'` → scope lens → `THE STUDIO`.
Signed in as `studio_manager@patina.dev` (owner/admin of two studios; `useViewerStudio` orders by name, so the
studio scope keys on **Local Dev Studio** — the pricing studio of the probe rows).

| Control | 1440 | 390 |
|---|---|---|
| `Export → CSV` (the wave's new act) | `x 382, y 447, w 122, h 44`, right 503 | `x 46, y 351, w 122, h 44`, **right 168** (viewport 390) |
| enabled state | enabled, `title="Download every entry in this window as a CSV"` | same |
| download fired | yes — `patina-hours-studio-2026-09-07.csv` | yes — byte-identical file |
| lens words | `mine · the studio` | same |
| stale `Export week` anywhere in the DOM | 0 | 0 |
| document overflow | `scrollWidth 1440 = clientWidth` | `scrollWidth 390 = clientWidth` |
| sheet-panel overflow | `scrollWidth 749 = clientWidth 749` | `scrollWidth 407 > clientWidth 343` — see **m15-r3** (not W5's nodes) |

CSV actually produced at both widths (3 rows: one internal W4 row, one priced, one rate-pending):

```
"Member","Date","Project","Client","Activity","Billable","Duration (min)","Rate","Rate Source","Rate Role","Amount","Billing State","Invoiced","Invoice #"
"Studio Manager","2026-09-11","","","admin","No","45","0.00","none","","0.00","nonbillable","No",""
"Studio Manager","2026-09-10","Cedar Lane Study","","sourcing","Yes","90","150.00","studio_member","","225.00","pending_authorization","No",""
"Leah Hartwell","2026-09-09","Cedar Lane Study","","design","Yes","60","0.00","none","lead_designer","0.00","pending_authorization","No",""
```

14 columns, in plan §6's order; **every row names a person and a day**; the internal row's Project cell is empty
with no special-casing; no `notes` column. The Amount column sums to **225.00**, and the sheet's own front matter
above the rows reads `3h 15m · $225 billable · 3 ENTRIES` — the file and the ledger agree, measured, not asserted.
**The Client column is empty for a project whose client name the viewer can read — that is M1-r3 below.**

Composer walk (`Draw an invoice` → Chen Residence, the one project with `billing_state='authorized'` unbilled
hours), 1440 and 390: picker rows render `Studio Manager ·10 September probe E 30m · $0.00/h $0.00` and
`9 September probe D 2h · $0.00/h $0.00` — the rostered member named, **the project's own designer unnamed**
(N2-r3).

---

## MAJOR

### M1-r3 — the CSV's `Client` column exports empty, because `document-hours-projects` is a **colliding** TanStack query key

`apps/designer-portal/src/components/document/hours-ledger.tsx:267-279`

```ts
const { data: projects } = useQuery({
  queryKey: ["document-hours-projects"],
  queryFn: async () => { … .select("id, name, status, client_id") … },
});
```

`packages/supabase/src/hooks/use-time-tracking.ts:1058-1070` (W3's capture-surface hook, already on the
integration branch):

```ts
export function useTimeCaptureProjects() {
  return useQuery({
    queryKey: ['document-hours-projects'] as const,
    queryFn: async () => { … .select('id, name, status') … },   // no client_id
  });
}
```

**Same key, two different `queryFn`s.** TanStack keys the cache entry, not the function: whichever observer's
fetch resolves first fills the entry and *both* observers read it. `useTimeCaptureProjects` is called from
`log-time-sheet.tsx:72` and `mobile-sheets.tsx:1151`; `MobileSheets` mounts unconditionally in
`(document)/layout.tsx:124`, above the Hours sheet.

**Measured, not inferred.** Across the whole live session the only `projects` read that fired was
`GET /rest/v1/projects?select=id,name,status&order=name.asc` — the ledger's own `select=id,name,status,client_id`
variant **never ran**. So `p.client_id` was `undefined` for every row, `clientNameByProjectId` mapped every project
to `null`, and the exported Client cell was `""`. The data was there the whole time: as that same user, PostgREST
returns `designer_clients → {client_id: a0000000-…-c005, client: {full_name: "Nora Ellison"}}`, and
`projects.client_id` for Cedar Lane Study is that id.

Round 1's **M1** was this column being wrong; the fix (rekeying the map on `c.client_id`) is correct but
**unreachable** under the collision. It is also **nondeterministic** — r2's walk saw "Nora Ellison", mine saw an
empty cell — which is why it survived two rounds of review. The column is named in plan §6's 14-column contract,
and the CSV is the artefact that leaves Patina.

**Fix (one of):** give the ledger's projects read its own key (e.g. `["document-hours-projects", "with-client"]` —
smallest, portal-local, no shared-package edit); or add `client_id` to `useTimeCaptureProjects`' select so the one
canonical key carries the superset (a `packages/supabase` edit → lane A, and re-gate `admin-portal build`); or read
the client name from a source that is not keyed against a foreign query. Whichever is chosen, a component test that
asserts the enriched row carries `client_name` (m10-r3) is what stops this returning a third time.

Confidence **high** (measured live, with the network trace and the DB both in hand). Severity **major**.

---

## MINORS

### m1-r3 (= m1-r2, unaddressed and now measured) — the default-Prettier sweep is still buried in the diff, and still rewrites a shared design-system file into a foreign house style
Normalising quotes, whitespace and trailing semicolons, then matching added lines against removed ones:
`hours-ledger.tsx` — **348 of 506 added lines are pure cosmetic reflow**; `InvoicePaper.tsx` — **106 of 261**.
`InvoicePaper.tsx` now has **64** semicolon-terminated lines; `Alert/Alert.tsx`, `Avatar/Avatar.tsx` and
`Accordion/Accordion.tsx` each have **0** — one file in a 128-component package now disagrees with the rest, and
`git blame` is rewritten on lines the wave never meant to touch. There is still no `.prettierrc` in
`apps/designer-portal`, `packages/patina-design-system`, or the repo root, so the sweep applies Prettier defaults,
not a repo convention.

### m2-r3 (= m2-r2) — the `patina_time_subtable` wire contract is defined in three places, under two names
`apps/designer-portal/src/lib/document/invoice-composer.ts:44` (`TIME_ATTRIBUTION_KIND`),
`apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx:128` (`TIME_ATTRIBUTION_KIND`),
`packages/patina-design-system/src/components/InvoicePaper/InvoicePaper.tsx:89` (`TIME_SUBTABLE_KIND`). All three
files already import from `@patina/shared`.

### m3-r3 (= m3-r2) — `downloadTimeExportCsv` revokes the object URL synchronously
`time-export.ts:132-134` — `URL.revokeObjectURL(url)` in a `finally` immediately after `anchor.click()`. Three of
the four in-repo download helpers defer by 1 s (`room-file-download.ts:57`, `export-board.ts:82`,
`spec-pdf-client.ts:59`). The download did fire in both my walks, so this is latent, not observed.

### m4-r3 (= m4-r2) — the same `time_entry_ledger` window is fetched twice at studio scope
`hours-ledger.tsx:582-587` passes `{studioId, from, to, includeRunning:false}`; `ScopeEntries` at `:1606-1613`
passes `{studioId, userId, projectId, from, to, includeRunning:false}`. `timeKeys.ledger(params)` hashes the raw
object, so an absent key and an explicit `null` hash differently and TanStack does not dedupe. (Confirmed benign in
one respect: `useTimeEntryLedger`'s `enabled: Boolean(studioId || userId || projectId)` means the export's read
does **not** fire outside studio scope.)

### m5-r3 (= m5-r2) — `useClients()` runs for every Hours viewer
`hours-ledger.tsx:293`, unconditional at the component top level; its only consumer is the studio-scope CSV's
Client column, which only an owner/admin can reach (scope is forced to `"mine"` for everyone else at `:688`).

### m6-r3 (= m6-r2, re-measured) — a rate-pending hour still exports a confident `0.00`
Live: a billable entry with no rate card returned `rate_source='none', resolved_rate_cents=0, amount_cents=0,
billing_state='pending_authorization'`, and `time-export.ts:79,82` printed `Rate "0.00"` / `Amount "0.00"`. The
portal's own copy for that state is "rate pending" (`time-capture.tsx:18,198`, HT-26). HT-26's literal words
("instead of a blank") are not violated by `0.00`, and the `Rate Source` column does say `none` — but the CSV is
the artefact that leaves Patina and it prices a pending hour at zero.
**Ruling owed:** `rate pending` in those two cells, exclusion, or `0.00`.

### m7-r3 (= m7-r2) — CSV total vs. the rollup above it can still diverge on legacy rows
The export sums **every** row's `amount_cents`; the rollup is `billable_cents = sum(amount_cents) FILTER (WHERE
billable)` (`00607:138`), and `00604:205-208`'s fallback fires when `rated_amount_cents IS NULL`, so a pre-00412
non-billable row carrying a rate contributes to one and not the other. No backfill (P-4) means such rows persist.
They agreed on my probe data (225.00 = `$225`); one sentence in the ship note closes the general case.

### m8-r3 (= m8-r2, partly answered) — the "sums to the ledger total" test
`time-export.test.ts:120-138` still compares two reductions over the same array, but line 137 now anchors on a
literal `29_000`, which is a real independent check. What is still untested is the file-vs-sheet tie; I made that
tie by hand this round (CSV 225.00 ↔ sheet `$225`). `timeExportTotalCents` still has no caller outside the test.

### m9-r3 (= m9-r2) — the invoice-number lookup still fails silently
`hours-ledger.tsx:598-612`: the `queryFn` throws, nothing surfaces the error, `studioExportInvoices` stays
`undefined`, and every `Invoice #` cell exports empty — indistinguishable from "not invoiced", which the separate
`Invoiced` column would be contradicting with `Yes`. (Unobservable on my probe data: no invoiced hours.)

### m10-r3 (= m10-r2) — still no component test of the Export act
Neither `hours-ledger-scope.test.tsx` nor `hours-ledger-add-row.test.tsx` gained a case; both only carry the
`useClients` mock. Nothing asserts that the act renders at studio scope, is hidden elsewhere, is disabled on an
empty window, or that the enriched rows carry `client_name`/`invoice_number`. That last assertion is exactly what
would have caught **M1-r3** before it shipped twice.

### m11-r3 (= m11-r2) — the export window is a **local** date range applied to a **UTC** `day` column
`fromDate`/`toDate` come from `weekRange()` (`hours-ledger.tsx:131-140`, local-midnight arithmetic) and are sent as
`day=gte./lte.` against `time_entry_ledger.day = (started_at AT TIME ZONE 'UTC')::date` (`00604:184-190`). For a
US-Central studio, an entry logged after ~19:00 local on the last day of the shown week has a UTC `day` one past
`toDate` and is silently absent from the file, while the sheet's own week list (which filters on `started_at`
timestamps) still counts it. View semantics are W2's; W5 is the first surface that exports them.

### m12-r3 (= m12-r2) — the renamed R75 act is under the 44 px bar
`Bill week → Accounts` (`hours-ledger.tsx:777-800`) is a bare `<button>` with `px-2.5 py-1 text-[11px]`; r2
measured `height 27.5` at both widths and the markup is unchanged since. Pre-existing (this wave changed only the
label), but the wave had the file open and its new sibling `Export → CSV` is a correct 44 px.

### m13-r3 (= m13-r2) — "beside the studio scope" ships as "beneath"
plan §6 places the Export act "beside the studio scope"; it renders as its own block under the lens
(`<div className="-mt-2 mb-4">`, `hours-ledger.tsx:840`). Reads fine at both widths and sits above the totals, so
HT-30 is not at risk — flagged only because the plan says beside.

### m14-r3 (NEW) — the Export act's "held" reason is keyboard-unreachable, and the design system offers the fix
`hours-ledger.tsx:846-855` uses native `disabled` plus a `title`. `DocumentAction` documents a `held` prop at
`document-action.tsx:72-82` for precisely this case: *"Native `disabled` removes the control from the tab order, so
the reason standing beside it (`aria-describedby`) is never reached by keyboard. `held` keeps it focusable, marks
it `aria-disabled="true"` and swallows the activation."* New code that did not take the affordance its own house
sheet (§A5) provides. The sibling Bill-week act has the same gap, so it is not a regression — it is a missed
improvement in the one act this wave authored.

### m15-r3 (NEW) — horizontal overflow inside the sheet panel at 390 (not W5's nodes, but W5 is why a reader is there)
Measured at 390: studio scope `panel scrollWidth 407 > clientWidth 343`; the one node past the panel's right edge
(372) is the W2 rollup line `2h 15m · 1h 30m billable · 45 min internal · $225` (`shrink-0`, right **426**). At
`mine` scope the panel is 404 wide and the offender is the **W1** delete act (`×`, `da-act … min-h-[44px]`, right
**423**, `hours-ledger.tsx:1998-2008`, last touched by `29b72c644` "W1 portal"). Neither node is in W5's diff, and
the document itself does not scroll horizontally at either width. **W5's own act is clean at 390** (`x 46 · w 122 ·
right 168 · h 44`). Routing note for the orchestrator: this is a W1/W2 defect the W5 walk surfaced, not a W5 one.

### m16-r3 (NEW, = the shape of m14-r2) — the fix round again closed only the two named findings
`W5-fix-r2.md` states outright that m1-r2…m14-r2 and N1–N13 are out of its scope. That is honest and correct given
the brief it was handed, but it means **13 minors and 13 notes have now survived two fix rounds undispositioned**,
and this review re-reports them a third time. Whoever writes the next fix brief should either name them or record a
"declined / deferred" line per item so the loop closes.

---

## NOTES

- **N1-r3 — ruling owed: plan §6's third and fourth Portal-files rows are not built as written, and the ship note
  must say so.** The plan reads: `time-billing.ts:42-54 (buildTimeLineDraft) | modify | **HT-21.** The composer
  **names the person on every row**, instead of collapsing the week into one string (`:49` — `Design services —
  4h 30m (3 entries)`, `qty=1`, naming no person and no day)` and `invoice-composer.ts:150-165 | modify | one
  composer row per person`. What ships is **exactly the string the plan cites as the defect** —
  `time-billing.ts:113` hard-codes `const label = "Design services"` and the live draft description came out
  `Design services — 2h 30m (2 entries)` with `qty 1` — and **one** merged line for the whole selection. This is
  deliberate: r1 graded both as blockers (B1/B2) because `invoice_line_items.description` is read verbatim by
  `resolve_invoice_link` (00588) and rendered verbatim on the homeowner's folio and the printed copy, so a name
  there reaches the client (LEAH-15, REP-15), and N lines would put N priced time lines on the folio. HT-21 itself
  carries both clauses ("**Composer: yes, name the person.** **Client line: one priced line plus a dated
  sub-table**") and in a schema where the composer's rows *are* the folio's lines the two clauses collide; the fix
  chose the client-protective reading and moved naming to the picker. I am **not** re-litigating that — but neither
  `W5-fix-r1.md` nor `W5-review-r2.md` recorded it as a plan deviation, and plan §6 still reads the other way. If
  the orchestrator wants §6 followed literally this is a **major**; as ruled in r1 it is a deviation that needs one
  line in the ship note and, ideally, a struck-through plan row.
- **N2-r3 (= N1-r2, re-measured live at both widths) — HT-21's naming is inert for the project's own designer, and
  the picker is now the only naming surface.** Live picker rows: `Studio Manager ·10 September probe E …` (a
  rostered member — named) and `9 September probe D …` (the project's designer — **unnamed**).
  `invoice-composer.tsx:215-231` maps `v_project_roster.profile_id → display_name`, and `v_project_roster`
  (`00419:94-155`) is `project_parties ∪ project_team_members` only; `00597`'s auto-roster returns early for
  `p.designer_id = NEW.user_id` by design (`00597:107-113`). In Leah's one-designer studio — the named customer —
  **every** composer row takes the unnamed path. **Ruling owed:** name the project designer from
  `projects.designer_id → profiles` in the picker, or accept that HT-21 names only non-designer authors.
- **N3-r3 (= N2-r2) — the merged sub-table can print two rows for one date at two rates, which is staffing detail
  by inference,** and there is no cap on row count (`time-billing.ts:115-124` maps one row per **entry**; a month
  of daily entries is ~30 JSON rows in `metadata.attribution` and 30 printed lines). **Ruling owed.**
- **N4-r3 — the token recipient's folio path is verified end-to-end this round, in SQL, not only in jest.** I
  inserted a `kind='time'` line with the composer's exact payload on a `sent` invoice, minted an
  `invoice_links` row, and called the guest RPC. `resolve_invoice_link(<token>, false) -> invoice.line_items`
  returned:
  ```json
  { "kind": "time", "quantity": 1.00,
    "attribution": "{\"kind\":\"patina_time_subtable\",\"rows\":[{\"date\":\"2026-09-09\",\"minutes\":60,\"rateCents\":14500},{\"date\":\"2026-09-10\",\"minutes\":90,\"rateCents\":15000}]}",
    "description": "Design services — 2h 30m (2 entries)", "amount_cents": 22500, "unit_amount_cents": 22500 }
  ```
  00588's sanitiser (`~ '@'` → NULL, full-UUID → NULL, else pass) hands the JSON through **verbatim**, `kind` is
  present in the payload and in `parseLineItem`'s shape (`invoice-link.ts:37-45`), and **no name rides anywhere**.
  Combined with `invoice-sheet-time-subtable.test.tsx`'s four cases (marker, legacy-string fallback, null, and a
  non-`time` kind carrying a JSON-shaped attribution), the client folio is covered. I did not render a real
  `/pay/<token>` page — the client portal was not booted this round. Both probe rows removed.
- **N5-r3 (= N5-r2) — docs owed.** `docs/design/the-document/DECISIONS.md:489` and `:2737` still record the R75 act
  as "Export week → Accounts"; the shipped label is "Bill week → Accounts". The ledger is append-only, so the fix
  is a new entry under this program's `R152`.
- **N6-r3 — `@patina/design-system` is dist-resolved** (`package.json` `main: ./dist/index.cjs`), contradicting the
  `patina-portal-features` skill, which lists it as source-resolved. No ship risk: the dist is current
  (`grep -c patina_time_subtable dist/index.js` → 1) and `infra/deploy-portal.sh` rebuilds dependencies. The
  **skill** should be corrected outside this program.
- **N7-r3 — `notes` is nowhere in the wave's output.** Not in the 14-column header, not in `TimeAttributionPayload`,
  not in either sub-table renderer, and `time_entry_ledger` carries no such column. HT-36 holds on every new
  surface.
- **N8-r3 — no flag, no dashboard, no tab, no badge, no red/green, no per-second motion.** No `useFeatureFlag` in
  the diff; the Export act is an unconditional tertiary `DocumentAction`; both sub-tables are plain mono text
  (`--color-quiet-ink` / `#8A857C`). Totals sit above the rows that produced them (HT-30): the Export act, then the
  `THE STUDIO · LOCAL DEV STUDIO · THIS WEEK` line, then the per-person rows — verified in the live DOM. P-5, R69,
  Vision §4/§6 hold.
- **N9-r3 — data access is through hooks.** `useTimeEntryLedger`, `useClients`, `useProjectRoster`, `useUnbilledTime`,
  `useInvoice` — all `@patina/supabase`. The two raw `supabase.from()` reads inside `HoursLedger` (`projects` at
  `:267`, `invoices` at `:598`) follow that file's own pre-existing pattern; W5 only added `client_id` to the
  first's select (see M1-r3). No ad-hoc fetch to a NestJS service, no new in-app route, so no `<Link>` owed.
  `@patina/supabase` is source-resolved — no dist there.
- **N10-r3 — the mock fallback could not mask anything.** `.env.local` verified at the isolated stack with
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` before the walk, and every rendered figure was cross-checked against
  `psql` / PostgREST.
- **N11-r3 — environment trap worth recording for the remaining lanes.** The designer-portal dev server must be
  driven at **`http://localhost:3100`, never `http://127.0.0.1:3100`**. Next 16.2 blocks cross-origin dev
  resources from `127.0.0.1` ("Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from
  `127.0.0.1`"), and under that block the app serves HTML that loads every chunk 200 and then **never hydrates** —
  `self.__next_f.length === 0`, no React fiber on any node, every control inert, zero PostgREST calls. A walk
  driven that way measures a dead page and reports plausible-looking nothing. Separately, `next dev` without
  `--webpack` refuses to start (webpack config present, no turbopack config) — the memory note is correct.
- **N12-r3 — commit hygiene is good.** Seven commits, Conventional Commits types only (`feat(time)`,
  `chore(time)`, `fix(time)`); `git diff --name-only` over the range shows only `apps/**` and
  `packages/patina-design-system/**` and **zero** files under `supabase/` (correct — W5 mints nothing; the ship
  note must say `00615` **and** `00620` are W2's, not that either is unused). `supabase/config.toml` still
  `skip-worktree` (`git ls-files -v` → `S`) and untouched. The branch is a descendant of the integration tip. No
  `.env`, no generated artefacts, no `git add -A` smell. The `chore(time): prettier formatting` commit is honestly
  labelled — the problem is its existence (m1-r3), not its message.
- **N13-r3 — out of W5's scope, nothing owed here.** HT-41's role chip is W3 (portal) / W6 (Field) — the CSV does
  carry a `Rate Role` column, populated live (`lead_designer` on the classifier-stamped row). HT-11's explicit
  billable at every capture surface is W3/W6 — the CSV carries `Billable` (`Yes`/`No`). HT-35 is stage 4. The
  untracked `15-hours.md` help article and the Sanity push are scoped out of the program.
- **N14-r3 — M2-r2's "vacuous" disposition is sound but belongs in the ship note, not only in a fix report.** I
  re-ran the grep and confirm no `statement` surface exists in `apps/designer-portal` for the plan row's "modify"
  to act on. The plan row should be struck, or the surface named, in the same place N1-r3's deviation is recorded.
- **N15-r3 — what I could not drive.** A completed `DRAFT THE INVOICE` was not reachable on this stack: the only
  project with `billing_state='authorized'` unbilled hours (Chen Residence) refuses with
  `INVOICE PROJECT IS MISSING ITS CANONICAL BILLING TUPLE` (a pre-existing seed-data constraint, not W5's), and
  Cedar Lane Study's hours are `pending_authorization`, so `project_unbilled_time` never surfaces them to the
  picker. The composer's persisted output shape is instead evidenced by N4-r3's SQL probe and by
  `invoice-composer.test.ts`'s HT-21 case; r2 drove the full draft and reported the same shape. Flagged rather than
  implied.

---

## What I could not refute

- All seven named gates reproduce, plus the full 579-suite designer run and the `@patina/design-system` type-check.
- The 14 columns are in plan order; escaping is a verbatim port of `qbo-export/index.ts`'s `csvField`; an internal
  row exports an empty Project cell; **every row names a person and a day**.
- The exported amounts sum to the figure the sheet prints directly above the rows (`225.00` ↔ `$225`) — measured,
  file against DOM.
- The client's folio keeps **one** priced `kind='time'` line with a dated sub-table and **no** staffing detail, and
  the token-gated RPC hands that sub-table to the recipient verbatim (N4-r3).
- `notes` reaches no new surface (HT-36).
- `time_export_taken` exists in the canonical emitter with `{scope, row_count, period}`
  (`document-events.ts:291-295`) and is fired once, after the download.
- The Export act is **reachable, correctly sized (44 px) and functional at 390** as well as 1440, with no document
  overflow at either width; it is absent outside the studio scope, and a non-owner/admin is pinned to `"mine"`
  (`hours-ledger.tsx:688`) so it can never be reached.
- The renamed act and the new act have different names, and no `Export week` string survives anywhere.
- No flag, no dashboard, no tab, no badge, no red/green, no per-second motion; totals sit above their rows.
