# W2 · Designer lane — adversarial review, round 3

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-designer`, branch
`studio-invoices/w2-designer`, diff `3a54d8743...HEAD` (7 commits, 15 files, +1519/−215).

**Verdict: ship.** No blocker, no major. Every numbered deliverable is present, the two lane
gates are green (the one red test is a pre-existing clock bug, proven untouched), and the
happy path now draws end-to-end against the local stack — the first time this program has
proven it in a browser. Eight minors/nits remain, seven of them carried unfixed from rounds
1–2 (round 2 fixed R2-1 only), one new.

## Round-2 findings, re-verified

| id | status | proof |
|---|---|---|
| R2-1 no-studio dead end | **FIXED** | `invoice-composer.tsx:183` `studioMissing = studioMode && !organizationsLoading && studios.length === 0`; muted line at `:841-845`; two tests in `invoice-composer-studio.test.tsx:196-229` |
| R2-2 ledger column rhythm | **OPEN** | measured live, see F-R2-2 below |
| F2 lede false in studio mode | **OPEN** | measured live (`lede 1` while in studio mode) |
| F3 "Pick a document…" placeholder | **OPEN** | read off the live select |
| F4 ungated `useOrganizations()` | **OPEN** | `invoice-composer.tsx:121` still `useOrganizations()` with no `enabled` |
| F5 no `choose-studio-invoice` analytics test | **OPEN** | `grep -rn "choose-studio-invoice" apps/designer-portal/src` → 1 hit, source only |
| F7 `context.mode` seeds before the flag resolves | **OPEN** | `invoice-composer.tsx:105-107` unchanged; latent (no caller passes `mode`) |
| F8 guest membership offered as a studio | **OPEN** | `lib/document/invoice-composer.ts:197-199` filters org only |
| F9 "18d overdue" | **OPEN** (pre-existing, out of lane) | `accounts-receivables-page.tsx:180` |
| F10 raw pg message in the R83 band | **OPEN** (house path identical) | `use-invoices.ts:811` |
| R2-3 no `maxLength` on regarding | **OPEN** | `invoice-composer.tsx:500-508` |
| R2-4 `aria-label="For"` ambiguous for e2e | **OPEN** (no product change owed) | my walk used `select[aria-label="For"]` and it resolved to 1 |
| A1 clock test | **ADVISORY**, unchanged | see gates |

## Deliverables 1–5

1. **Composer** — present. `for`/`the document` label flip at `:435-437`, `STUDIO_TARGET` option
   at `:453-455` gated on `studioChoiceAvailable = studioInvoiceOn && !flagLoading && !context.projectId`
   (`:115-117`); studio select (`:467-486`, `multiStudio` only), `ClientPicker` with
   `popoverClassName="z-[70]"` (`:488-502`), regarding (`:504-515`); the three pull-throughs are
   inside `{!studioMode && …}` (`:518`); `canDraftStudioInvoice` pure twin; `draft-invoice`
   actionKey unchanged; `choose-studio-invoice` fired as the same `documentEvents` pair a
   `DocumentAction` fires (`:87-93`, `:253`, `:272`). `onDrafted(id, null)`; `mode?: 'studio'`
   on `InvoiceComposerContext`. **Live proof** — walk on this worktree (dev :3011,
   `NEXT_PUBLIC_FLAG_OVERRIDES=studio-invoice:true`, local stack, signed in as
   `designer@patina.dev`, who holds two active `design_studio` memberships):
   ```
   For select count 1  Project select count 0
   options ["Pick a document…","the studio · no house","Chen Residence","Olsen Lake House",…]
   Studio select count 1   Studio options ["Leah Hartwell","Local Dev Studio"]
   section order ["for","studio","household","regarding","ad-hoc lines"]
   popover panels [{"wrapperZ":"70","childZ":"70","rect":[402,382,360,308]}]
   elementFromPoint inside panel  INPUT | flex h-10 w-full bg-transparent …
   draft disabled? false
   after draft → "Draft invoice … DESIGN CONSULTATION · 12 SEPT 2026 STUDIO · $450 … DRAFT"
   ```
   The `z-[70]` judgement call is **correct**: the picker panel paints above the `z-[60]`
   PaperFolioSheet and `elementFromPoint` at its top lands on the picker's own search input,
   not the sheet. Section order matches plan line 116 (studio above household).
2. **Ledger / Receivables / Folio** — present. Folio head proven live:
   `NORA ELLISON · DESIGN CONSULTATION · 12 SEPT 2026 · DRAFT`, no `document ↗`, acts
   `ISSUE & SEND · VOID` (a draft's correct subset). Ledger studio row renders the regarding
   line + `STUDIO` stamp and no doorway.
3. **desk-receivables** — the skip and its three cases are W1's (`git log -2` on that test file →
   `5cddbe157`, `8e5852f30`, both ancestors of the branch point). Coverage the brief asked for
   exists; this lane added none. Satisfied.
4. **R136** — appended at `DECISIONS.md:10724-10732`, last id was R135, S1–S12 summarized, the
   trigger named as the real gate, the flag named. Correct voice, append-only.
5. **Tests** — `invoice-composer.test.ts` +100, `invoice-composer-studio.test.tsx` 254 lines /
   11 tests, `accounts-studio-rows.test.tsx` 144 / 3, `invoice-folio.test.tsx` +35. Registry,
   hierarchy and desk-action-label contract suites untouched and green.

## Gates (run by me, in this worktree)

```
pnpm --filter @patina/designer-portal type-check
> tsc --noEmit          (no output — clean)

pnpm --filter @patina/designer-portal test
Test Suites: 1 failed, 512 passed, 513 total
Tests:       1 failed, 6136 passed, 6137 total
Time:        29.372 s
```

The single failure is `src/components/document/__tests__/client-note-composer.test.tsx:479`
(`getByText("Taken down Sep 4. …")` vs a live `new Date()`; today is Sep 5).
`git diff --stat 3a54d8743...HEAD -- <that test> <that component>` is **empty** — untouched by
this lane. Advisory A1, does not block.

## Findings

### F-R2-2 · minor · 0.95 — the ledger's fourth column collapses on a studio row
`accounts-ledger-page.tsx:113` keeps `grid-cols-[1fr_auto_auto_auto]` while `:143-152` drops the
fourth cell on a studio row, so the `1fr` name column absorbs its width. Measured live after the
walk drafted a studio invoice:

```
studio row  {h:67, n:3, kids:[BUTTON x386 w553, SPAN x953 "—", SPAN x973 "draft"]}
house  row  {h:59, n:4, kids:[BUTTON x386 w431, SPAN x831 "$4,060 owed", SPAN x917 "sent", BUTTON x981 "document ↗"]}
```

The status stamp lands **56px right** of every house row's and the row is **8px taller** (the
inline `studio` Stamp's 1.5px border + 3px padding grows the line box). M2 draws a
column-aligned ledger. Same mechanism, unmeasured for want of a sent studio invoice, on
`accounts-receivables-page.tsx:148` / `:219-231` (`grid-cols-[1fr_auto_auto]`).
Fix: keep the cell occupied — `<span aria-hidden className="invisible whitespace-nowrap text-[11px]">document ↗</span>`.

### F-N1 · minor · 0.9 — the household field is foreign material on the paper sheet (NEW)
`ClientPicker`'s trigger is `bg-white`, body font, `px-3 py-2` (`client-picker.tsx:255-259`),
while every other composer field is `INPUT` = transparent, 11.5px, `px-2 py-1.5`
(`invoice-composer.tsx:73-74`). Measured live inside the open composer:

```
picker    {bg:"rgb(255,255,255)", size:"15.3px", h:43}
regarding {bg:"rgba(0,0,0,0)",    size:"11.5px", h:33}
```

A pure-white 43px chip at 15.3px sits between two 33px transparent 11.5px fields on a
`--doc-paper #FAF7F2` sheet. M1 draws the household as the same `.fld sel` as `for` and
`regarding`. The lane already added an opt-in class hook (`popoverClassName`); the trigger has
no equivalent, so this is a real gap, not taste alone. Fix: a `triggerClassName` pass-through,
or wrap the picker so the composer can restate `bg-transparent` and the composer's type scale.

### F-N2 · minor · 0.7 — the default billing studio is order-dependent (NEW)
`invoice-composer.tsx:181` `studioId = chosenStudioId || studios[0]?.id || ''`, and
`useOrganizations()` (`use-organizations.ts:156-175`) issues no `.order()`. PostgREST row order
is unspecified, so which of a two-studio designer's studios is pre-selected — and the order of
the select's options — is not guaranteed stable across loads. Live: options came back
`["Leah Hartwell","Local Dev Studio"]` with `value 11a55a52-…` (Leah Hartwell). The designer can
see and change it, which caps the blast radius, but S8's silent single-studio path and this
default share the same unordered `studios[0]`. Fix: sort `activeDesignStudios()`'s result by
`name` (a pure change, one case in the existing describe block).

### F-F8 · minor · 0.9 — a guest membership is offered as a billing studio
`lib/document/invoice-composer.ts:197-199` filters `o.type === 'design_studio' && o.status === 'active'`
and its docstring asserts "`useOrganizations()` already returns active MEMBERSHIPS only". True of
`status`, false of `role`: `use-organizations.ts:169` filters `.eq('status','active')` only and
carries `membership.role` through untouched. `00571_studio_invoices.sql:855-870` requires
`membership.role <> 'guest'` for both the actor and the stamped designer, and raises
`insufficient_privilege`, which `use-invoices.ts:811` wraps verbatim into the R83 band. A guest
of a design studio therefore sees that studio offered and gets a raw Postgres sentence.
Fix: `&& o.membership?.role !== 'guest'` (the rows carry it), one case in `activeDesignStudios`.

### F-F5 · minor · 0.95 — the one behaviour the brief names by action key has no test
`STUDIO_CHOICE_EVENT` (`invoice-composer.tsx:87-93`) fires at `:253` (actionSelected) and `:272`
(actionShown). `grep -rn "choose-studio-invoice" apps/designer-portal/src` returns exactly one
line — the source. `documentEvents` is neither mocked nor spied in
`invoice-composer-studio.test.tsx` (254 lines, 11 tests). Brief item 1 names the key explicitly;
SCOPE says "tests for every behavior you change". Fix: `jest.mock('@/lib/analytics/document-events')`
and assert both halves fire once with `surface_key 'accounts'` / `region_key 'invoice-composer'` /
`action_key 'choose-studio-invoice'`.

### F-F2 · minor · 0.95 — the sheet's lede is false in studio mode
`invoice-composer.tsx:432-435` renders "Everything billable pulls through below — tick what this
invoice should carry" unconditionally; `:518` hides all three pull-throughs in studio mode.
Confirmed live (`lede 1` while the sheet showed only FOR / STUDIO / HOUSEHOLD / REGARDING /
AD-HOC LINES). One ternary.

### F-F3 · minor · 0.95 — the empty option still says "Pick a document…"
With the flag on the label reads `for` and the first real option is a non-document, but
`invoice-composer.tsx:457` keeps `<option value="">Pick a document…</option>` unconditional.
Read verbatim off the live select (see the options array above).

### F-F4 · minor · 0.85 — `useOrganizations()` fetched on every composer open
`invoice-composer.tsx:121` is ungated, though only studio mode reads it and
`use-organizations.ts:142-150` documents `options.enabled` as existing for exactly this case.
Fix: `useOrganizations({ enabled: studioChoiceAvailable })` — note `studioMissing` already
depends on its `isLoading`, so the guard must keep the loading branch honest.

### F-R2-3 · nit · 0.9 — no `maxLength` on regarding
`invoice-composer.tsx:500-508` bounds nothing; `00571_studio_invoices.sql:886`
`OR char_length(p_title) > 200` raises in the same guard block as the privilege errors. This is
the lane's own new field, so unlike tax/terms (`00511:3488/3491` bound the house path
identically) there is no pre-existing parity excuse. Fix: `maxLength={200}`.

### F-F7 · nit · 0.85 — `context.mode` is honoured before the flag resolves
`:105-107` seeds `target` from `context.mode` alone; `:453` only renders the matching option when
`studioChoiceAvailable`. `grep -rn "openInvoiceComposer("` → 11 call sites, none passes `mode`, so
it is latent — but `invoice-overlays.tsx:27-29` advertises a guarantee the code does not enforce.

### F-F9 / F-F10 / F-R2-4 · nit — carried, out of lane
"18d overdue" (`accounts-receivables-page.tsx:180`, pre-existing, M4 says "18 days past"); the
raw pg message in the R83 band (house path identical); `getByLabel('For')` ambiguity for a
future e2e (use `select[aria-label="For"]`).

## Refusal / house-rule sweep

- `git diff … | grep "^+.*shadow"` → **no matches**. D4 holds.
- Added visible strings: "the studio · no house", "for", "studio", "household", "regarding",
  "no studio to draw from · this account belongs to none yet", the void-panel studio sentence.
  None carries a badge, count chip, red/green, checkmark-as-status, emoji, "AI", "gate", "task",
  "dashboard" or "overdue". Money stays in `formatCurrency` + mono.
- `git diff … | grep -iE "^\+.*(overdue|dashboard|badge|gate|task|AI)"` → 4 hits, all in test
  helper/identifier names, none in rendered copy.

## Cleanup

The dev server started for the walk was killed; every temp script/screenshot was removed;
`git status --porcelain` is empty on the lane branch.
