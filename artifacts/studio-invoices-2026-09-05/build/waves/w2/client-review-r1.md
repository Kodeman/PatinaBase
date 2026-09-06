# W2 · CLIENT lane — adversarial review, round 1

Reviewer: separate context, did not write the code.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-client`, branch
`studio-invoices/w2-client`, diff `3a54d8743..a8731373c` (3 commits, 14 files,
+846/−27).

**Verdict: fix.** No blocker: every numbered item of the lane brief is delivered
and both lane gates are green. Two majors and one contested major are money- or
brand-visible on the homeowner's page; the rest is polish.

## Gates (run by the reviewer, in the worktree)

```
pnpm --filter @patina/client-portal type-check   → tsc --noEmit, no output
pnpm --filter @patina/client-portal test         → Test Suites: 116 passed, 116 total
                                                   Tests:       1568 passed, 1568 total
```
`apps/client-portal/package.json` "test" is bare `jest` — no coverage floor in this
gate. No pre-existing failures appeared.

## Brief items — delivered

| # | Item | Where | Verdict |
|---|---|---|---|
| 1 | Merge studio rows in the adopted house | `threshold.tsx:288-320,332,549,860`; `lib/threshold/adopted-house.ts` (new, shared with the server) | delivered; envelope line + regarding line in `letterbox.tsx:199-256` |
| 2 | `?invoice=` studio branch, `<2 houses` rule not swallowing it | `lib/data/active-project.ts:100-135` | delivered (`projectIds.length < 2 && !invoiceId`) |
| 3 | Letterbox-only front door for a zero-house household | `components/threshold/letterbox-door.tsx` (new) + `app/page.tsx:63-77` | delivered; mounts `Letterbox`, no header/nav (`AppChrome` carries none) |
| 4 | Print route title | `app/invoices/[invoiceId]/print/page.tsx:197-206` | delivered (`Regarding` label + `title` fallback) |
| 5 | Tests in the five named files | all five touched | delivered; `LetterboxDoor` cases live in `threshold.test.tsx` rather than a new file |

## Probes run (temporary test files, since removed)

Rendered `LetterboxDoor` directly with a `project_id: null, studio_id: 'studio-b',
designer_id: 'designer-nora'` row:

```
P1 settle act present: false
P1 open-the-letterbox present: true
P1 identity called with: [ { designerId: 'designer-nora' } ]
P1 body text: Invoice No. 31 · $450 total · $0 paid. Balance $450, due September 20.
P1 studio line: From the studio · not for a house
P2 (?invoice=inv-31) settle act present: true      chooser present: true
P3 (void letter + ?checkout=success) empty state: true   letterbox: false
P4 (letter paid) doorplate: Middle West Studio → "Nothing is waiting for you." / "Nothing in the letterbox."
```

Rendered `Threshold` in the adopted house with and without the studio letter:

```
OWED ROW: Owed across 2 open invoices $9,575 · soonest due 10 August
OWED ROW (no studio letter): Owed on the open invoice $9,125 · due 15 August
```

## Findings

**C1 · major · 0.85 — the letterhead brands off the designer, not the invoice's studio.**
`letterbox-door.tsx:69-71` and `print/page.tsx:31-35` resolve identity with
`{ designerId }`, which falls to `_primary_studio_for(designer)`. W1's
`00571_studio_invoices.sql:1318-1350` added `p_studio_id` **precedence** to
`resolve_studio_identity` with the comment "a studio invoice carries its own
studio_id, so neither the project nor the designer's primary studio is
consulted", and proposal M6 states "Letterhead resolves from the invoice's own
studio, never from the designer's primary studio, so a two-studio designer never
sends the wrong name" (plan risk 4, ruling S8). Probe P1 proves the client page
takes the designer path. `useStudioIdentity` has no `studioId` param
(`packages/supabase/src/hooks/use-studio-identity.ts:35-40`) — the fix is a
one-field addition there plus `studioId: invoice.studio_id` at both call sites.
The lane declared this in its notes ("Carried, not fixed" #1); it is still a
defect the program has already paid for in SQL.

**C2 · major · 0.75 — the house ledger states household money as owed on the house.**
`threshold.tsx:549` hands the merged list to `deriveThreshold`, whose ledger rollup
(`lib/threshold/derive.ts:471-501`) sums every open invoice into `owedCents`,
`owedInvoiceCount` and `owedDueDate`. Probe: the adopted house's owed row goes from
"Owed on the open invoice $9,125 · due 15 August" to "Owed across 2 open invoices
$9,575 · soonest due 10 August" — $450 and a due date that are explicitly *not for
this house*, under the house's own doorplate and with no "not for a house" clause on
that row (the letterbox envelope carries one; the ledger row cannot). Plan line 127
names the letterbox and `houseIds`, not the ledger. Either exclude
`project_id === null` rows from the ledger rollup, or give the owed row the same
disclosure the envelope has — a ruling, not a silent default.

**C3 · major · 0.70 — a studio letter folded into "Earlier invoices" is undisclosed and settleable.**
`earlier-invoices.tsx` prints `invoice_number · amount · due …` and a "Settle this
balance" act, with nothing about origin; the lane's own new test asserts exactly
`Invoice No. 31 · $450 · due August 20`. M5(a) draws every envelope with its origin
("From the studio · not for a house" / "Invoice No. 30 · this house"), and
`road-orders.ts:18-24` states the house rule as "It says so on its own line either
way". Once two letters stand in the adopted house, the one that is not for the house
is the one the homeowner cannot tell apart — on the line that carries a money act.
The lane declared it (Carried #2).

**C4 · minor · 0.90 — the check panel names the wrong studio for a cross-studio letter.**
`threshold.tsx:278,861` passes `studioName` (resolved from THIS house's project) as
`Letterbox designerName`, which reaches
`payment-method-chooser.tsx:185-195`: "Let <house studio> know a check is coming".
For a household whose adopted house belongs to studio A and whose studio invoice was
drawn by studio B, that sentence names the wrong studio. `check_remit_to` comes from
`get_invoice_payment_options(invoiceId)`, so the money routes correctly; only the
name is wrong. Same root as C1 — the letterbox should prefer the row's own studio.

**C5 · minor · 1.00 — the zero-house door does not open the ceremony in place.**
Probe P1: on a plain `/` visit the door renders "Open the letterbox" and no settle
act. M5(b) draws the chooser and "Settle · $453.60" already unfolded — that panel is
the whole page for a household with no house. Arriving from the email
(`?invoice=`) does auto-open (P2), which is the common path, so this is polish, not
a break.

**C6 · minor · 1.00 — a void-only letter strands the checkout return.**
Probe P3: with `?checkout=success&invoice=inv-31` and the only studio invoice `void`,
the door falls back to `ProjectsEmptyState` — no letterbox, so `useCheckoutReturn`
never runs and she meets "no active projects yet" after paying. Narrow (the letter
must be voided between checkout and return) and the lane declared it (Carried #3),
but it is the exact stranding brief item 3 exists to prevent. Rendering the door
whenever a `checkout=`/`invoice=` address is present would close it.

**C7 · minor · 1.00 — "not for a house" is said to a household that has no house.**
Probe P1 shows the zero-house door printing "From the studio · not for a house".
M5(b)'s envelope says only "From the studio" — the negation only means something
where houses exist.

**C8 · minor · 0.90 — every house reads the unscoped client-invoice query, adopted or not.**
`threshold.tsx:305` calls `useClientInvoices()` unconditionally and discards the
result in a non-adopted house (`:306-315`). A household with several houses pulls
every invoice row it can read on every house visit for nothing. A one-line
`enabled`-style guard (a param on the hook, or gating in the component) removes it.

**C9 · nit · 0.90 — two different fallback names on the same door.**
`letterbox-door.tsx:105` falls back to `'Your studio'` for the doorplate, while
`:117` hands `identityQuery.data?.name ?? null` to the letterbox, which then falls to
`'your designer'` — and the row fallback behind it can never fire, since
`useClientInvoices` selects `*, line_items` with no `designer` embed.

**C10 · nit · 0.80 — the print page's identity branch is beyond the brief.**
Item 4 asked for "title in place of the project name"; the lane also rewired
`useStudioIdentity` there (`print/page.tsx:31-35`). Defensible (an unbranded money
document is worse), but it is the change that carries C1.

## Checked and clean

- Money path untouched: `Settlement`/`PaymentMethodChooser`/`useStartCheckout` are
  invoice-id keyed, no project deref; integer cents throughout; no status writes.
- No RLS shortcut: the new invoice read in `active-project.ts:118-135` still refuses
  a house outside the client's list (`owns`) and checks `auth.getUser().id` against
  `client_id` for the studio branch; tests cover the other-household and no-session
  refusals.
- The server rule and the browser rule are one function (`adopted-house.ts`), and both
  callers feed it the same set (`toOtherHouses` = every project minus the current one),
  so the front door and the house cannot disagree about the adopted house.
- Drafts excluded on both surfaces; `void` handled by `visibleInvoices`.
- Vision refusals: no "overdue"/"dashboard"/"task"/"gate"/"AI", no badge, no count
  chip (counts are spelled: `countInWords`), no red/green, no shadow, no emoji, no
  new route, no flag (R135). `grep` over the added lines returns nothing.
- No `.claude/`, `.env`, hook or settings file touched; commits use explicit
  pathspecs and Conventional Commit subjects; nothing pushed.
