# Invoices in the Designer Portal — how they work today

Surveyed 2026-09-05 (Explore agent, read-only). Verbatim report.

**Headline for your design work:** there is no `(portal)/portal/` route group anymore. The R21 "dissolve" deleted it (`apps/designer-portal/CLAUDE.md`, Conventions section; DECISIONS.md I109). Everything lives under `(document)/`, and **money is not a route at all** — it is a *Drawer sheet* (the Accounts book) plus two overlays (folio + composer) mounted once in the layout. An invoice today is **hard-bound to a project**: DB, RPC, hook, and form all require `project_id`.

---

## 1. Routes / pages that show or create invoices

Actual route folders under `apps/designer-portal/src/app` (full list of page groups): `(document)`, `(document-help)`, `(legal)`, `api`, `auth`, `preferences`, `unauthorized`. There is **no** `finance`, `billing`, `earnings`, `payments`, `money`, `clients`, or `settings` route folder.

Only four non-test app files mention "invoice":

| Path | What it does | Project-scoped? |
|---|---|---|
| `apps/designer-portal/src/app/(document)/layout.tsx:11,94` | Mounts `<InvoiceOverlays />` once, globally — the folio + composer host | No (global) |
| `apps/designer-portal/src/app/(document)/desk/page.tsx:363` | Only a copy string ("try 'invoice'") in the ⌘K hint. **The Desk has no money/receivables block.** | — |
| `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` | The document; renders the Money region / Account band | Yes (`[id]` = projectId) |
| `apps/designer-portal/src/app/(legal)/terms/page.tsx` | legal copy only | — |

**Addressable doorway (the closest thing to a route):** `apps/designer-portal/src/components/document/desk-doorway.tsx:18` —
```
/desk?book=accounts  [&page=ledger|receivables|earnings] [&invoiceId=…]
```
Valid page set at `desk-doorway.tsx:73`: `accounts: ['ledger', 'receivables', 'earnings']`.

### Entry points that lead to "create invoice"
Every one calls `openInvoiceComposer(...)` (a `window` CustomEvent):

| Caller | Line | Scope passed |
|---|---|---|
| `components/document/desk-contents.tsx:195` | `'draw-invoice': () => openInvoiceComposer()` | **unscoped** (asks for a project) |
| `components/document/desk-contents.tsx:278-282` | label overridden to `'Draw an invoice · new'` in the "Begin" column | unscoped |
| `components/document/command-bar.tsx:470-471` | ⌘K verb `draw-invoice` | unscoped |
| `components/document/command-bar.tsx:803-807` | ⌘K `draw-invoice-here` (document in hand) | `{ projectId }` |
| `components/document/accounts/accounts-ledger-page.tsx:55-57` | page-head primary "Draw an invoice" | unscoped |
| `components/document/account-band.tsx:402` | `draw-project-invoice` | `{ projectId }` |
| `components/document/commercial/money-region.tsx:227-228` | Money region head leader | `{ projectId }` |
| `components/document/hours-ledger.tsx:387, 471` | Export week / bill-it | `{ projectId, initialTimeEntryIds }` |
| `components/document/ffe-section.tsx:1239, 1379` | FF&E "Bill →" | `{ projectId, initialFfeItemIds }` |
| `components/document/line-unfold.tsx:554` | per-item bill | `{ projectId, initialFfeItemIds: [item.id] }` |

Only three call sites are unscoped, and all three still land in a form whose first field is a **project picker** (see §2).

---

## 2. The invoice create form

**File:** `apps/designer-portal/src/components/document/accounts/invoice-composer.tsx` (688 lines)
**Pure logic:** `apps/designer-portal/src/lib/document/invoice-composer.ts` (178 lines)
**Host / opener:** `apps/designer-portal/src/components/document/accounts/invoice-overlays.tsx`

Opener contract (`invoice-overlays.tsx:24-46`):
```ts
export interface InvoiceComposerContext {
  projectId?: string;            // omitted = the composer asks (project picker)
  initialFfeItemIds?: string[];  // R76 — arrive ticked
  initialTimeEntryIds?: string[];// R75 — arrive ticked
}
export function openInvoiceFolio(invoiceId: string)
export function openInvoiceComposer(context?: InvoiceComposerContext)
```
Rendered in `PaperFolioSheet` with `wide`, title `"Draw an invoice"` (`invoice-overlays.tsx:98-112`). On draft, it swaps to the folio: `onDrafted={(invoiceId) => setOverlay({ kind: 'folio', invoiceId })}` (`:109`).

### Fields actually shown (in scroll order)
| Section | Line | Control |
|---|---|---|
| **"the document"** — project picker | `:320-341` | native `<select>` of `projects` filtered to `status === 'active' \| 'planning'` (`:111-117`). If `context.projectId` is set, it renders as static text (`:322-325`). **Nothing renders below until `projectId` is truthy** (`:343`). |
| **payment milestones · unbilled** | `:346-380` | checkbox rows, `unbilledMilestones()` |
| **unbilled time** | `:383-452` | checkbox rows + "tick all / clear all"; shows resolved rate/h |
| **ff&e · uninvoiced** | `:455-516` | checkbox rows, coverage-partitioned; unpriced lines excluded with a notice |
| **ad-hoc lines** | `:519-589` | repeatable grid `[description | qty | unit $ | ×]`; "Add line" button (`actionKey="add-invoice-line"`) |
| **tax rate (%)** | `:593-601` | text input, `inputMode="decimal"` |
| **terms (net days)** | `:602-610` | text input, default `'15'` |
| **memo · shown to the client** | `:612-621` | 2-row textarea |
| **running totals + act** | `:624-660` | subtotal / tax / total / line count, then `DocumentAction actionKey="draft-invoice"` |
| **inline error band (R83)** | `:663-683` | terracotta, with a "Try again" action |

**Not present:** no client field (client is derived from the project), no due-date field (only `terms (net days)`; the due date is set at issue time), no surcharge/fee field (studio-level, see §5), no explicit "milestone link" control beyond the checkboxes.

### Validation
- `canDraft = !!projectId && lines.length > 0 && !creating && !prefillPending` (`:246-247`)
- tax: `NaN || < 0 → 0`, then `/100` (`:201-204`)
- terms: `parseInt(termsDays,10) >= 0 ? … : 15` (`:258-259`)
- ad-hoc rows dropped unless `description.trim() && dollarsToCents(unitDollars) > 0` (`lib/document/invoice-composer.ts:174`)
- Switching projects clears every selection (`:191-198`)
- Time-claim compensation: if `useClaimTimeEntries` fails after the draft lands, the draft is deleted (`:268-289`)

### Hooks called (from `@patina/supabase` unless noted)
`useCreateDraftInvoice`, `useDeleteDraftInvoice`, `useFfeInvoiceCoverage`, `useProjectFFEItems`, `useProjectInvoices`, `useProjectPaymentMilestones`, `useProjects` (`:25-33`); plus local `useClaimTimeEntries`, `useUnbilledTime` from `@/hooks/use-time-tracking` (`:35-38`); plus `computeInvoiceTotals`, `formatCurrency` from `@patina/shared`.

### `packages/supabase/src/hooks/use-invoices.ts` — every export + query key

Queries:
| Export | Line | queryKey |
|---|---|---|
| `useInvoices(filters?)` | 386 | `['invoices','list', filters ?? {}]` |
| `useInvoice(invoiceId)` | 416 | `['invoices', invoiceId]` |
| `useProjectInvoices(projectId)` | 457 | `['invoices','project', projectId]` |
| `useFfeInvoiceCoverage(projectId, opts?)` | 519 | `['ffe-invoice-coverage', projectId]` → rpc `get_ffe_invoice_coverage` |
| `useArAging()` | 637 | (derives from `useInvoices`) |
| `useInvoicePaymentOptions(invoiceId)` | 1124 | `['invoice-payment-options', invoiceId]` → rpc `get_invoice_payment_options` |

Mutations (all accept `options?: { errorSurface?: 'inline' }` except where noted):
| Export | Line | Backend |
|---|---|---|
| `useCreateDraftInvoice` | 654 | rpc `create_draft_invoice` (`:702`) |
| `useUpdateDraftInvoice` | 732 | table `invoices` update (no `errorSurface` opt) |
| `useUpsertLineItems` | 759 | table `invoice_line_items` |
| `useDeleteLineItem` | 811 | table `invoice_line_items` |
| `useDeleteDraftInvoice` | 846 | table `invoices` |
| `useIssueInvoice` | 875 | rpc `issue_invoice` (`p_invoice_id`, `p_due_date`) |
| `useRecordPayment` | 908 | rpc `record_invoice_payment` |
| `useSendInvoice` | 961 | **edge fn `invoice-send`** (`:982`) |
| `useChaseInvoice` | 1017 | rpc `chase_invoice` |
| `useStartCheckout` | 1057 | **edge fn `create-checkout-session`** (`:1067`) |
| `useNotifyCheckIntent` | 1171 | **edge fn `invoice-check-intent`** (`:1179`) |
| `useVoidInvoice` | 1210 | rpc `void_invoice` |

Types/helpers exported: `InvoiceStatus` (:23), `InvoiceLineKind = 'milestone'|'time'|'adhoc'|'ffe'` (:25), `InvoicePaymentMethod` (:27), `InvoicePaymentStatus` (:35), `InvoiceLineItem` (:42), `InvoicePayment` (:57), `InvoiceCheckoutReceipt` (:82), `InvoiceCheckoutEvidence` (:98), `InvoiceCheckoutError` (:111), `Invoice` (:196), `InvoiceFilters` (:243), `DraftLineInput` (:248), `CreateDraftInvoiceInput` (:260), `UpdateDraftInvoiceInput` (:270), `buildLineRow` (:299), `FfeCoverageState`/`FfeItemCoverage`/`FfeInvoiceCoverageMap` (:478-497), `ArBucketKey`/`AR_BUCKET_LABELS`/`ArAgingBucket`/`ArAging` (:548-565), `invoiceDaysOverdue` (:581), `computeArAging` (:598), `InvoicePaymentOptions` (:1105), `NotifyCheckIntentResult` (:1151).

**The project constraint is enforced in three places** — worth knowing before designing ad-hoc:
```ts
// use-invoices.ts:260
export interface CreateDraftInvoiceInput { projectId: string; … }
```
```ts
// use-invoices.ts:711-718 — client-side guard
if (!project || project.id !== input.projectId || !project.designer_id ||
    !project.client_id || !project.studio_id)
  throw new Error('Invoice project is missing its canonical billing tuple');
```
```sql
-- supabase/migrations/00178_invoices_v1.sql:31
project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
-- supabase/migrations/00511_public_sd_hardening.sql:3344-3400
create_draft_invoice(p_project_id uuid, p_expected_designer_id uuid,
  p_expected_client_id uuid, p_expected_studio_id uuid, …)
  -- resolves the project by joining organizations + organization_members
  -- and requires project.status = 'active'
```
Also `00318_studio_invoice_numbering_and_ops.sql:52` derives `studio_id` for numbering *through* `projects`. Any ad-hoc surface has to answer for all four.

There is no edit form for an issued invoice; `useUpdateDraftInvoice` / `useUpsertLineItems` / `useDeleteLineItem` exist but **have no Document-era UI caller** — the composer only creates.

---

## 3. Detail / preview + the send action

**File:** `apps/designer-portal/src/components/document/accounts/invoice-folio.tsx` (849 lines). Rendered inside `components/document/overlays/paper-folio-sheet.tsx`.

Layout: head (number or "Draft invoice", `<Stamp>`, household · project · status, `document ↗` doorway) `:334-368`; a one-line DM-mono figure rail `issued / due / total / paid / balance` `:370-415`; void reason; typed line items; payments history (with `+ fee {surcharge_cents}` at `:516-519`); acts row; then one inline act panel at a time.

**Preview / PDF:** there is no PDF generator and no separate preview component — **the folio prints itself**. `:322-331`:
```css
@media print {
  body > *:not([data-doc-overlay='paper-folio']) { display: none !important; }
  …
  .folio-no-print { display: none !important; }
}
```
Stamp palette `FOLIO_STAMP` at `:51-66` is deliberately kept in sync with `accounts-ledger-page.tsx:24-37`.

**Acts row** (`:558-606`), each a `DocumentAction` with `surfaceKey="accounts"`:
| actionKey | line | effect |
|---|---|---|
| `issue-and-send-invoice` | 559 | opens the send panel → `useIssueInvoice` then `useSendInvoice` |
| `record-invoice-payment` | 569 | opens the payment panel |
| `resend-invoice` | 579 | `useSendInvoice` again |
| `open-void-invoice` | 589 | opens the void panel |
| `print-invoice` | 600 | `window.print()` |
| `copy-client-invoice-link` | 647 | fallback when email didn't reach |

**Send → edge function `invoice-send`** (`packages/supabase/src/hooks/use-invoices.ts:982`). Source: `supabase/functions/invoice-send/index.ts`. Body `{ invoiceId, message?, type?: 'sent' | 'reminder' }`. It auth-checks `can_manage_invoice`, requires **issued** (not draft/void), resolves recipient via `invoice.client_id → project.client_id` profile with a `designer_clients.client_email` fallback, and sends through `_shared/send-email.ts` `sendCompliantEmail` (category `operational`). Errors are unwrapped from `FunctionsHttpError` into codes like `no_recipient`, `invoice_not_issued` (`use-invoices.ts:986-999`).

**Record offline payment** — `invoice-folio.tsx:718-802`, `act === 'payment'`. Fields: amount ($), method (`MANUAL_METHODS = ['check','wire','ach_manual','cash','other']`, `:69-75`), reference, received (`DateTextInput`). Guard: `amountCents > balance` shows terracotta. Calls `useRecordPayment` → rpc `record_invoice_payment`, then invalidates `['document-state']` explicitly (`:295`) because the Desk reads receivables under its own key.

**Void** — `:803-843`. Requires a typed reason; copy: *"Voiding releases any linked payment milestones and time entries so they can be billed again."* → rpc `void_invoice`, then invalidates `['document-state']` (`:313`).

There is no separate "mark paid" — paid is derived from `amount_paid_cents` by the DB trigger.

Also mounted: `useReconcileInvoiceCheckout` (`apps/designer-portal/src/hooks/use-invoice-checkout-reconciliation.ts`) auto-reconciles a pending Stripe session on folio open (`:111-130`).

---

## 4. Where money lives in the portal

**The Accounts book** — `apps/designer-portal/src/components/document/accounts/accounts-book.tsx` (192 lines). A sheet-weight Drawer ledger, **not scoped to any project**. This is the existing studio-level money surface.

- Header `DocSheetHead` icon from the registry, "Studio eyes only" (`:108-127`)
- Three pages as DM-mono links (never tabs), `:46-50`: `ledger` / `receivables` / `earnings`
- Front matter stats: revenue / A/R / margin (`:95-104`), via `LedgerFrontMatter`
- Teaching lens row → Library (`:161-173`)
- Hooks: `useArAging`, `useEarnings`, `useEarningsStats`, `useInvoices`, `useDesignerTeachingStats`, plus local `useStudioMargin` from `@/hooks/use-studio-accounts`

Pages:
- `accounts-ledger-page.tsx` (155) — every invoice, newest-first, folio-first rows; page head carries the primary `draw-invoice` action (`:49-60`); zero-state copy at `:65-77`
- `accounts-receivables-page.tsx` (222) — A/R aging + the chase. `send-invoice-reminder` primary appears **only on overdue rows** (`:192-200`); runs `useSendInvoice({type:'reminder'})` then `useChaseInvoice` (`:120-128`)
- `accounts-earnings-page.tsx` (193) — design fees + commissions, the Pledge
- `accounts-query-failure.tsx` (41) — shared failure band

**Per-project money surfaces (inside `/doc/[id]`):**
- `components/document/account-band.tsx` (451) — the R26 Account Page: budget/committed/margin, by-room variance, earnings, payment milestones with inline trigger config, `draw-project-invoice` + `open-project-hours`
- `components/document/commercial/money-region.tsx` — R127 region head; carries the single inked "Draw an invoice" leader (`:224-229`)
- `lib/document/money-ladder.ts` (222), `lib/document/account-summary.ts`, `hooks/use-account-page.ts` (251, keys `['account-page', projectId]`; `useGenerateMilestoneInvoice` at `:209`)

**The Desk:** no money block, no receivables block. Receivables reach the Desk only as a *need line* on a folder — `lib/document/desk-receivables.ts` (88) `buildDeskReceivables(invoices, now) → Map<projectId, ReceivableSignal>`, consumed by `hooks/use-desk-engagements.ts:45`. Gate: overdue ≥ `AR_OVERDUE_NEEDS_DAYS` **and** not chased within `AR_CHASE_COOLDOWN_DAYS` (`:57-64`). The folder's act opens the Accounts Receivables page. **It is keyed by `project_id`** (`:69-73`) — an unattached invoice would be invisible to the Desk as written.

---

## 5. Navigation + studio settings

**Nav config (single source):** `apps/designer-portal/src/lib/document/registry.tsx` (559 lines) — "DATA ONLY: no component imports, no event handlers, no `window` access, no React."

Entry shape (`:45-69`):
```ts
export interface StudioSurface {
  key: string;
  kind: 'room' | 'ledger' | 'verb' | 'host';
  label: string;
  subLabel?: string;
  aliases: string[];            // generous — Programa/Houzz synonyms on purpose
  icon: LucideIcon;
  weight?: 'room' | 'sheet';    // D14
  shortcut?: string[];          // ['g','a']
  scope: 'global' | 'document';
  help?: { surfaceKey: string; blurb: string };
}
```

Current top-level entries:
- `STUDIO_ROOMS` (`:80`): `library` (g l), `people` (g p), `rooms` "The Scans" (g r), `drafting-room` (document-scoped)
- `STUDIO_LEDGERS` (`:159`): `orders` (g o), **`accounts` (g a)** (`:183-206`), `hours` (g h), `the-post` (g t), `call-sheet` (document-scoped)
- `STUDIO_VERBS` (`:259`): `capture-lead`, `open-project`, `draft-proposal`, **`draw-invoice`** (`:308-320`), `add-maker`
- `PLAN_ROOM_SURFACE` / `SPEC_BOOK_SURFACE` / `BOARDS_SURFACE` (`:364-417`), `HOST_SURFACES` (`:430`), `DOCUMENT_SCOPED_SURFACES` (`:467`)

The `accounts` entry already claims the vocabulary you'd want:
```ts
aliases: ['accounts','invoices','invoicing','billing','bill','money',
          'receivables','earnings','payments'],
```
and `draw-invoice`'s subLabel is already `'milestones · time · FF&E · ad-hoc'` (`:312`).

**How a new entry gets added:** append to the right array in `registry.tsx`. Three consumers read it automatically —
1. `components/document/studio-drawer.tsx:49-92` — but note it hard-codes its own key list: `['library','orders','accounts','people','rooms','hours']` and a `DOOR_HREF` map (`:77-81`) for room-weight routes; a new sheet-weight ledger needs adding there **and** a `case` in the sheet-render switch.
2. `components/document/command-bar.tsx:470` — ⌘K, `switch` on `surface.key`.
3. `components/document/desk-contents.tsx:180-300` — the Contents index; verbs need a `verbHandlers` entry (`:191-197`).
4. `components/document/registry-shortcuts.tsx` — the `g`-chord doorways.
5. Help parity is pinned by `lib/help-system/surface-key-parity.test.ts`, and R93/R95/R96 are asserted by `lib/document/__tests__/registry-match-surfaces.test.ts`.

**Studio settings** is also a sheet, not a route: `components/document/account/account-sheet.tsx`. Pages at `:71-75` + `:164-166`: Profile, Notifications, Security, Devices, Extension, and **Studio** (gated on `useFeatureFlag('studio-workspaces')`, `:105`). Opened via `openAccountPage(page)` (`:91`) or `/desk?account=studio` (`desk-doorway.tsx:21`).

`components/document/account/account-studio-page.tsx` holds everything invoice-adjacent:
- **Branding** `:603-680` — logo (`StudioLogoUploadField`, `studio.logo_url`), website, contact email, phone, address. Copy at `:605`: *"Your studio's logo and contact details appear on invoices…"*
- **Billing** `:811-925` — card fee % ↔ `card_surcharge_bps` (`:66`, *"300 bps = 3%"*), and check remit-to. Copy at `:813`: *"The card fee and check remit-to instructions a client sees when…"*
- **Members** `:927`

Hook: `packages/supabase/src/hooks/use-studio-billing.ts` (101 lines) — `StudioBillingSettings { studio_id, card_surcharge_bps, check_remit_to }`, `useStudioBillingSettings(studioId)` key `['studio-billing-settings', studioId]`, `useUpdateStudioBillingSettings()` (upsert on `studio_id`, invalidates both its own key and `['invoice-payment-options']`). Table `studio_billing_settings`, migration `00428_invoice_payment_method_surcharge.sql`.

**There is no `payment_terms` or `invoice_footer` studio setting.** Terms are per-invoice (`termsDays`, default 15) and there is no footer field anywhere.

---

## 6. Clients

**Route:** `apps/designer-portal/src/app/(document)/people/page.tsx` → `components/document/people/people-room.tsx` and its views (`views/directory-view.tsx`, `views/person-profile.tsx`, etc.). There is no `/portal/clients`.

**Picker:** `apps/designer-portal/src/components/portal/client-picker.tsx` (532 lines) — Radix Popover + `cmdk` combobox.

Props (`:15-48`): `value: string | null` (a `profiles.id` = `designer_clients.client_id`), `onChange`, `placeholder`, `disabled`, `className`, `ariaLabel`, `inlineChip`, `open`/`onOpenChange` (controlled mode), `clientOptions`, `requireClientLogin`.

**Inline creation:** the "+ Add new client" affordance pinned to the bottom of the list (`:484-513`), labeled `Add new client "<search text>"` — it calls `useAddClient`, which POSTs to `/api/clients/invite` (`packages/supabase/src/hooks/use-clients.ts:531-573`) with `{ clientEmail, clientName, source, notes, invite }` and returns `{ designerClientId, profileId, invited, alreadyExists }`. A second path, `useInviteAndLinkClient` (`:593`), invites-and-links an *existing* household row (R73), and carries `meta: { errorSurface: 'inline' }`.

Hooks re-exported through `apps/designer-portal/src/hooks/use-clients.ts` (a thin re-export of `@patina/supabase`). Query keys: `['designer-clients', filters]` (:90), `['designer-client', id]` (:150), `['client-stats']` (:235), `['client-projects', id]` (:479).

Existing hosts of `ClientPicker` (all DocSheet-mounted, and `draft-proposal-opener.tsx:27-34` documents a z-index/portal trap you'd hit if you host it inline):
- `components/document/overlays/open-project-sheet.tsx:135`
- `components/document/overlays/household-sheet.tsx:184`
- `components/document/overlays/send-sheet.tsx:662`
- `components/document/rooms/drafting/draft-proposal-opener.tsx:275`
- `components/document/rooms/drafting/service-agreement-drafting-room.tsx:311`

**The invoice composer does not use it** — it uses a bare `<select>` of projects.

`open-project-sheet.tsx` is your closest structural precedent for a "create the thing from a household, no upstream document" sheet: ClientPicker + title + budget band + start date, one RPC (`open_project_direct`, migration `00237`), a client-generated UUID for retry-safety (`:44, :57`).

---

## 7. Design system vs local controls; Document visual language

**The accounts/invoice components import ZERO `@patina/design-system`.** Verified imports:
- `accounts-ledger-page.tsx:14-19`: `@patina/supabase`, `../document-action`, `../stamp`, `@/lib/document/format`, `@/lib/document/account-summary`, `./invoice-overlays`
- `accounts-receivables-page.tsx:16-28`: same shape plus `@tanstack/react-query`
- `invoice-composer.tsx:24-51`: `@patina/supabase`, `@patina/shared`, local hooks/libs, `../document-action`
- `invoice-folio.tsx:17-45`: `@patina/supabase`, `@patina/shared`, `../date-text-input`, `../document-action`, `../stamp`

`@patina/design-system` appears in 94 files but only in `auth/*`, `unauthorized`, `providers`, `DebugPanel`, `components/portal/**` (the pre-dissolve surfaces) — **not** in `components/document/**`. Nor is `src/components/ui/controls` used there (`invoice-ui.ts` imports `StatusTone` from it, but `invoice-ui.ts` itself has no Document-era caller).

The Document language is instead:
- `components/document/document-action.tsx` — `DocumentAction` / `DocumentActionGroup`. Variants: `primary | inked | secondary | tertiary | danger` (`:56-60`). Requires `actionKey`, optional `surfaceKey`/`regionKey` (inherited from the group's context, `:142`, `:352`). **At most one `primary` per group** — dev-time throw at `:347`. Auto-fires `documentEvents.actionShown` / `actionSelected` (`:151`, `:218`, `:250`).
- `components/document/stamp.tsx`, `date-text-input.tsx`, `overlays/paper-folio-sheet.tsx`, `overlays/doc-sheet.tsx`, `ledger-front-matter.tsx`, `section-loading-line.tsx`
- Raw Tailwind + CSS vars. The recurring local constants in every accounts file:
```ts
const LABEL = 'font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]';
const INPUT = 'rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11.5px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';
```
- Money is always DM Mono; sage-ink under / terracotta-ink over, never red/green (`account-band.tsx:5-7`).

### DECISIONS.md rulings to cite
`docs/design/the-document/DECISIONS.md` (10,722 lines).

Money / invoices:
| # | Line | Title |
|---|---|---|
| I23 | 962 | Ledger front-matter (R5 / Insights distribution) |
| R26 | 1042 | The Account Page — engagement financials in the document |
| **R36** | **1528** | **The Accounts book — the studio's money ledger** |
| I31 | 1617 | Dissolve Track 3 — the Accounts book, a Drawer Sheet (R36, slice 4) |
| **R74** | **2636** | **The Invoice folio + the composer — where money is written** |
| R75 | 2640 | Export opens the composer — the time→invoice pull-through |
| R77 | 2648 | The full Hours ledger |
| I44 | 2729 | The Accounts book learns to write (R74–R77 built) |
| R79 | 2656 | The OpenProjectSheet — projects that skip the proposal |
| R81 | 2664 | The Amendment sheet — scope changes |
| I148 | 9815 | Wave A3 — the lexicon, ⌘K, money, mobile, the leader |

Sheets / instruments / typography:
| # | Line | Title |
|---|---|---|
| I5 | 187 | DocSheet built without design-system overlay primitives |
| **D14** | **985** | **Sheets & Rooms — the drawer's two weights** |
| R24 | 1017 | The Folio — files clipped to the paper |
| R27 | 1058 | The letterhead instruments |
| R40 | 1564 | The Composing Page — detailed processes as self-composing paper |
| R44 | 1846 | Send and revise — letterhead instrument + supersede |
| R56 | 2165 | The enriched decision detail — the deep margin sheet |
| R90 | 2700 | The scan opens as a sheet |
| **R96** | **2955** | **The Laid Sheet** |
| I97 | 4832 | Inked Instruments — one legible next action across The Document |

Newest ~10 (tail of the file):
| # | Line | Title | Date |
|---|---|---|---|
| I152 | 10220 | The Smart Lens — waves W0–W6, deviations, debts | 2026-08-30 |
| I152-deploy | 10470 | The Smart Lens | 2026-08-30 |
| I152-adjust | 10577 | W7 — Kody's first-look adjustments | 2026-08-31 |
| **R128** | 10642 | The Maker's Ledger | 2026-09-01 |
| R129 | 10663 | The tour's last step may act | 2026-09-03 |
| R130 | 10669 | A third WelcomeModal state — "Show me later" | 2026-09-03 |
| R131 | 10681 | Margin notes re-arm on a re-cut | 2026-09-03 |
| R132 | 10681 | The shortcut reference lives behind `?`, from the start | 2026-09-03 |
| R133 | 10687 | The two CS calls are doctrine | 2026-09-03 |
| **R134** | 10693 | **R96 amended — ledgers may page, documents may not** | 2026-09-03 |
| **R135** | 10701 | The client page is The Document's homeowner face; the 5 Aug route promise retired | 2026-09-04 |

R134 is the one that licenses a paged ledger (Accounts already has three pages); R135 governs the client-facing half.

Also binding from `apps/designer-portal/CLAUDE.md`: **D4 — zero shadows** (CI-blocked), **D1 — strict focus** (no split views/tabs; sheets must not unmount the document beneath), **D2 — no toasts**; and R83 — inline terracotta failure bands at the act site.

---

## 8. Feature-flag gating

Mechanism: `apps/designer-portal/src/hooks/use-feature-flag.ts:114` — `useFeatureFlag(flagName): FeatureFlagState` returning `{ value, isLoading }`, with `NEXT_PUBLIC_FLAG_OVERRIDES` for local dev. Per CLAUDE.md: *"new gated work mints its own flag through `useFeatureFlag` + `NEXT_PUBLIC_FLAG_OVERRIDES`"*; `the-document-pilot` is retired.

Flags currently in use:
| Flag | Representative site |
|---|---|
| `studio-workspaces` | `desk/page.tsx:77`, `account/account-sheet.tsx:105` |
| `call-sheet` | `desk/page.tsx:82`, `doc/[id]/page.tsx:1788`, `command-bar.tsx:260`, + 10 more |
| `onboarding-teammate-persona` | `auth/accept-invite/page.tsx:70`, `account/studio-invite-modal.tsx:101`, `help/desk-walkthrough.tsx:325` |
| `worktable` | `doc/[id]/page.tsx:879` |
| `arrival-arc` | `triage-bar.tsx:85`, `open-requests-strip.tsx:242`, `ceremony/ceremony-surface.tsx:63` |
| `room-file` | `room-file-view.tsx:63`, `rooms/room-view/room-view.tsx:151` |
| `room-view-refined-path` | `rooms/room-view/room-view.tsx:181` |
| `threshold` | `client-note-composer.tsx:217` |
| `tester-notes` | `command-bar.tsx:263`, `tester/tester-widget.tsx:45` |
| `capture-producer-idempotency` | `portal/proposals/product-picker-modal.tsx:883` |

**The newest shipped pattern** is `worktable` (`doc/[id]/page.tsx:879`, `const worktableOn = useFeatureFlag('worktable').value;` — DECISIONS I138 "Wave 2 — the Worktable core, behind a flag"), with `call-sheet` as the most widely-threaded example. Note `desk-walkthrough-gate.ts:145-147` shows the house pattern of passing flag `value` + `isLoading` into a pure gate function rather than branching inline — that's the testable variant.

Nothing invoice-related is currently flagged.

---

## 9. Analytics

`apps/designer-portal/src/lib/analytics/`: `capture-extension-events.ts`, `document-events.ts`, `events.ts`, `ffe-events.ts`, `library-configuration-events.ts`, `mood-board-events.ts`, `nomination-events.ts`, `plan-room-events.ts`, `posthog.ts`, `PostHogProvider.tsx`, `procurement-events.ts`, `room-events.ts`, `schedule-events.ts`, `spec-book-events.ts`, `studio-events.ts`.

**There is no `invoice-events.ts` or `payment-events.ts`.** Invoice telemetry rides entirely on `DocumentAction`'s generic pair (`document-events.ts:197-210`):
```ts
actionShown:    (props: { surface_key; region_key; action_key; variant; presentation }) => track('document_action_shown', props)
actionSelected: (props: { surface_key; region_key; action_key; variant; presentation }) => track('document_action_selected', props)
```
Every accounts action passes `surfaceKey="accounts"` with region keys `ledger-head`, `receivable-row`, `project-account`, `money-head`, `invoice-lines`, `invoice-composer`, `invoice-draft-error`, `invoice-letterhead`, `invoice-send-confirmation`, `invoice-payment-confirmation`, `void-invoice-confirmation`.

The one invoice-adjacent named event lives in the wrong module: `procurement-events.ts:160` → `track('procurement_ffe_items_invoiced', { … skipped_covered … })`.

---

## 10. Tests touching invoices

Jest — directly on invoices:
- `apps/designer-portal/src/components/document/accounts/__tests__/invoice-folio.test.tsx`
- `apps/designer-portal/src/components/document/accounts/accounts-query-states.test.tsx`
- `apps/designer-portal/src/lib/document/__tests__/invoice-composer.test.ts`
- `apps/designer-portal/src/components/document/__tests__/account-band-invoices.test.tsx`
- `apps/designer-portal/src/components/document/commercial/money-region.test.tsx`
- `apps/designer-portal/src/components/document/commercial/money-region-seam.test.tsx`
- `apps/designer-portal/src/lib/document/__tests__/money-ladder.test.ts`
- `apps/designer-portal/src/lib/document/__tests__/project-commerce.test.ts`
- `packages/supabase/src/hooks/__tests__/use-invoices.test.ts`
- `packages/shared/src/invoice/invoice.test.ts`

Contract / registry tests you'd have to satisfy for a new surface:
- `apps/designer-portal/src/lib/document/__tests__/registry-match-surfaces.test.ts`
- `apps/designer-portal/src/lib/document/__tests__/document-action-hierarchy-contract.test.ts`
- `apps/designer-portal/src/lib/document/__tests__/desk-action-labels.test.ts`
- `apps/designer-portal/src/components/document/__tests__/desk-contents.test.tsx`
- `apps/designer-portal/src/components/document/command-bar.test.tsx`
- `apps/designer-portal/src/lib/help-system/surface-key-parity.test.ts`

Playwright (3 specs mention invoice, none is an invoice flow test):
- `apps/designer-portal/e2e/document/dissolve-redirects.spec.ts`
- `apps/designer-portal/e2e/document/lens-band-height.spec.ts`
- `apps/designer-portal/e2e/document/mobile-margin-sheet.spec.ts`

Other jest files touching the word: `doc/[id]/{page,paper-order,worktable*}.test.tsx`, `hooks/__tests__/{use-desk-engagements,use-margin-sheet,use-commercial-documents*,use-trade-scopes}.test.*`, `lib/document/__tests__/{derive-needs,desk-derivation,closure-derivation,authority-hours,margin-derivation,post-derivation,procurement-lifecycle,ticket-derivation,trade-scope-derivation,ffe-leader,document-guide,need-tie-break,margin-groups,lens-band-derivation,contrast,desk-roster-derivation}.test.ts`, `components/document/__tests__/*` (11 files), `components/document/commercial/*` (6 files), `components/document/schedule/__tests__/*` (6 files), `components/portal/procurement/order-assistant/__tests__/*`.

---

## The one-paragraph gap statement

Every layer assumes a project. `invoices.project_id` is `NOT NULL` with a CASCADE FK (`00178:31`); `create_draft_invoice` resolves designer/client/studio *through* the project row and requires `project.status='active'` (`00511:3344-3400`); `CreateDraftInvoiceInput.projectId` is required (`use-invoices.ts:260`) with a client-side "canonical billing tuple" guard (`:711`); the composer renders nothing below the project picker until one is chosen (`invoice-composer.tsx:343`); studio invoice numbering derives `studio_id` via `projects` (`00318:52`); and `buildDeskReceivables` keys its output map on `project_id` (`desk-receivables.ts:69`). The surface furniture, by contrast, is already studio-level and already claims the vocabulary — the Accounts book is unscoped, its registry entry aliases `'billing'`/`'money'`/`'payments'`, and `draw-invoice`'s subLabel already reads `'milestones · time · FF&E · ad-hoc'` (`registry.tsx:187-197, 312`).
