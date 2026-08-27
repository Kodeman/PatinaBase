# W1b · lane B — integration notes

From lane B (money & studio), branch `daily-return/w1b-b`, base `main` @ `5b5c0c054`.
Format: **file · exact diff or precise instruction · why**. Lane B edited none of the files below.

---

## 1. lane D · `supabase/functions/proposal-sign-confirmation/index.ts` — the confirmation email overstates the total by 100×

**Severity: high (money copy, C5).** Raised because lane D's own note §1 flagged the unit question
and asked lane B to check it: *"`proposal-sign-confirmation` reads `proposals.total_amount`
(dollars, `Intl.NumberFormat`), not a `*_cents` column … flagging it because the sign sheet restates
a total and the two surfaces should agree."*

**They do not agree, and the app is the one that is right.** `proposals.total_amount` is cents:

```
$ grep -n "total_amount" supabase/migrations/00014_portal_business_features.sql
138:  total_amount INTEGER DEFAULT 0, -- cents
```

The app has always read it as cents (`RemoteProposal.total_amount`, "Contract total in CENTS
(Σ line_total_cents + design fees)", `ProposalsAPIClient.swift:47-48`), and SP-04's new sign sheet
prints `PatinaCurrency.format(cents: total_amount)`. The edge function does not divide:

```
supabase/functions/proposal-sign-confirmation/index.ts:44-50
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD',
    maximumFractionDigits: 0 }).format(amount);
}
:131-132   const totalLine = proposal.total_amount
             ? paragraph(`<strong>Investment:</strong> ${formatCurrency(proposal.total_amount)}`)
```

So the seeded `$100,000.00` proposal (`total_amount = 10000000`) e-mails the client
**"Investment: $10,000,000"** seconds after she signs the sheet that said `$100,000.00`.

**Exact diff (lane D's file, D or the steward applies it):**

```diff
-function formatCurrency(amount: number): string {
+/// `proposals.total_amount` is INTEGER cents (00014:138) — the same column the
+/// iOS sign sheet and the client portal read as cents.
+function formatCurrency(cents: number): string {
   return new Intl.NumberFormat('en-US', {
     style: 'currency',
     currency: 'USD',
     maximumFractionDigits: 0,
-  }).format(amount);
+  }).format(cents / 100);
 }
```

Check the same function for any other `formatCurrency` call site before applying, and check whether
the designer-notification half of the email uses it too.

---

## 2. lane C · `Patina/Design/Components/CompanionSafeArea.swift` — the Hearth reservation paints an opaque band over pushed content

**SP-19's central defect, and it is in C's file, not B's.** `companionHearthReservation` inserts a
120 pt bottom `safeAreaInset` whose content carries an **opaque**
`PatinaColors.Background.primary` background that `ignoresSafeArea(edges: .bottom)`:

```
Patina/Design/Components/CompanionSafeArea.swift:39-52
    func companionHearthReservation(isActive: Bool = true) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            if isActive {
                Color.clear
                    .frame(height: CompanionHearthMetrics.reservedHeight)
                    .background {
                        PatinaColors.Background.primary
                            .ignoresSafeArea(edges: .bottom)
                    }
```

SP-19 names this exactly: *"the Hearth is a 120-point region inserted as a bottom `safeAreaInset`
carrying an opaque … band on the navigation stack — so on a pushed screen it paints over scrolled
content and sits on top of `Sign proposal`, clipping the label to `Sign proposa`."* The plank's own
risk note calls the opaque background a contradiction of the ruled contract (C8, *"a reserved layout
region, never a painted bar"*), so removing it is a repair of the contract, not an amendment.

**Instruction (C decides the mechanism; both options are C's ruling to take):**
either drop the `.background { … }` block so the reservation is a pure inset, or give it the yield
behaviour SP-19's second option describes.

**What lane B did on its side, so the two do not collide:** all eight money scroll containers now
take `.padding(.bottom, MoneyScreenMetrics.bottomClearance)`
(`= CompanionHearthMetrics.reservedHeight + 24`, `Patina/Features/Money/MoneyScreenChrome.swift`)
instead of hard-coded 120/140. B changed nothing in `Design/Components/`.

---

## 3. lane C · `Patina/Design/Components/PatinaScreenChrome.swift` — the floating back chevron has no scrim

`patinaScreen(title:)` overlays `BackChevronButton` at top-leading over a ScrollView with the system
nav bar hidden (`:38-53`). On a scrolled money screen the chevron sits directly on top of live
content — the re-walk caught it overlapping `INV-2026-0142`
(`research/05-rewalk.md` §2b(iii), shot `r-03b`).

**Instruction:** give the overlaid chevron (and the optional title) a small scrim or material behind
it, so it stays legible over scrolled content on every pushed screen at once — this is the "one
shared omission, not several" half of SP-19 that lives in C's file.

**What lane B did on its side:** `.moneyScreenTopBand()` on the eight money scroll containers, which
reserves the **status-bar** region only (an opaque band the content passes behind). That closes the
"9:41 overprints the title" half. It does not and cannot close the chevron half, which is drawn by
C's modifier above everything.

---

## 4. lane D / steward · nothing seeds an invoice, so the wave's invoice acceptance cannot be walked

**Severity: high for the wave's acceptance walk, not for the code.** After lane D's
`supabase db reset` the local stack has **zero invoices**:

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
    -c "select id, invoice_number, status from invoices order by created_at desc limit 5;"
(0 rows)
```

`INV-2026-0142` — the invoice W0's re-walk drove end to end (`research/05-rewalk.md` §1a) — was
hand-made data on the pre-reset stack. There is **no invoice seed file at all**: `supabase/seed/`
holds `proposals.sql`, `decisions.sql`, `messages.sql`, … and nothing for `invoices` /
`invoice_line_items` / `invoice_payments`, and `config.toml`'s `[db.seed] sql_paths` lists none.

**What this blocks.** Four lines of the W1b acceptance walk:
*"invoice detail carries 'Due Sep 1'"*, *"Pay failure (local placeholder key) renders a
Patina-voice failure above the fold"*, the settle banner's method branch, and the paid-invoice
payments line. Lane B has these unit-verified (`InvoicesMoneyRailTests`, `MoneyAndStudioCopyTests`)
and **cannot** sim-verify them.

**Instruction (lane D owns the seeds this wave):** add `supabase/seed/invoices.sql` — one `sent`
invoice on `Aspen Loft Refresh` for `client@patina.dev` with a `due_date`, two line items and no
payments (which reproduces the walk's `INV-2026-0142` exactly), plus one `paid` invoice with zero
payment rows so the "Paid in full. Your designer recorded this payment outside Patina." line has a
subject — and wire it into `config.toml`'s `[db.seed] sql_paths` after `proposals.sql`. Money
columns are integer cents (`00178_invoices_v1.sql`), `due_date` is a `DATE`.

Lane B did not write it: `supabase/**` is lane D's, and D is the wave's sole owner of the local
stack and its seeds (`steward.md` §6.4).

---

## 5. Not an ask — for the steward's record

- **SP-04's confirmation-email half needed no client change.** `ProposalsAPIClient.signProposal`
  already fires `proposal-sign-confirmation` best-effort after the RPC (`:418-429`); lane D's note §1
  confirms nothing server-side invokes it. Lane B pinned it with a test
  (`ProposalsMoneyRailTests.signPathInvokesTheConfirmationFunction`) rather than rebuilding it.
- **New directory `Patina/Features/Money/`** (`MoneyFailureCopy.swift`, `MoneyScreenChrome.swift`).
  No lane claims it in `steward.md` §6; it holds the two seams SP-15 and SP-19 need shared across
  Invoices / Proposals / Decisions / Budget / Projects. `Patina/` is a
  `PBXFileSystemSynchronizedRootGroup` (`project.pbxproj:70-77`), so the new files do **not** touch
  the pbxproj — C remains its sole writer.
- **`client_visibility_tier` line-price policy (SP-04's open ruling for Kody) is untouched**, as the
  plank instructs: `get_client_proposal_bundle` still nulls `unit_sell_price` / `line_total_cents` /
  `vendor_name` outside tier `full`. The sign sheet restates only fields the bundle actually
  returned, so on a `milestone`-tier proposal it prints the total and the deposit and omits the
  line-level figures rather than inventing them.
- **SP-17's swatch is a content contract, not a layout bug**, exactly as the plank says
  (`DecisionDetailView.optionCard` already renders `resolvedImageURL`). Lane B stopped at the honest
  repair: client-voiced copy for an option with nothing to show, and one line instead of a stack of
  blank cards when no option has any content. Nobody owns the designer-side prompt that would put a
  swatch on the option; that is still unassigned.

---

## 6. lane D · `supabase/functions/proposal-sign-confirmation/index.ts` — the signature email does not go through the chokepoint, and writes no `notification_log` row

**Raised in the fix round (review finding B-2). Severity: high.** Lane B's §5
above and lane D's `d-notes.md` §1 both closed SP-04's email half on the
question *does it fire*. Neither checked *how it sends*, and the plank's backend
delta is specific about that: *"The confirmation email is one edge-function send
through `_shared/send-email.ts` (§12 §6 — the chokepoint exists; `notification_log`
is written by it)."*

**Verified: it does not.** The function POSTs Resend directly and writes no row.

```
$ grep -n "notification_log\|_shared/send-email\|api.resend.com" \
    supabase/functions/proposal-sign-confirmation/index.ts
67:  const res = await fetch('https://api.resend.com/emails', {
   (no notification_log, no _shared/send-email import)
```

Its own local `sendEmail` (`:62-80`) is a bare `fetch`. Every `notification_log`
row for an email in this codebase is written by `sendCompliantEmail`
(`_shared/send-email.ts:388, 409, 426`). Consequences:

- After a signature there is **no durable record** that the client was written
  to — the half that mattered for SP-08's bell and for any later audit.
- The send skips suppression, rate policy, unsubscribe headers and the
  idempotency key that `prepareCompliantEmail` applies to every other send.

**Instruction (lane D's file; D or the steward applies it):**

1. Import the chokepoint and delete the local `sendEmail` (`:62-80`):

```ts
import { sendCompliantEmail } from '../_shared/send-email.ts';
```

2. Add the two id columns to the select at `:110-119` — `notification_log.user_id`
   needs them and the current select omits both:

```diff
       `
-      id, title, total_amount, signed_at, signed_by_name,
+      id, title, total_amount, signed_at, signed_by_name, client_id, designer_id,
       designer:profiles!designer_id(full_name, email),
       client:profiles!client_id(full_name, email)
     `
```

3. Replace the client send (`:159-163`) and the designer send (`:188-192`):

```ts
const { success, error: sendError } = await sendCompliantEmail(supabase, {
  to: proposal.client.email,
  subject: `Signed: "${proposal.title}"`,
  html,
  userId: proposal.client_id,
  notificationType: 'proposal_signed',
  category: 'transactional',
  templateId: 'proposal-sign-confirmation-client',
  metadata: { proposal_id: proposal.id, signed_at: signedAt },
  idempotencyKey: `proposal-signed-client:${proposal.id}`,
});
results.client = success ? true : sendError;
```

and the designer half identically with `userId: proposal.designer_id`,
`templateId: 'proposal-sign-confirmation-designer'` and
`idempotencyKey: 'proposal-signed-designer:<id>'`.

`ComplianceSendOptions.category` is required — `transactional` is the right
value for a signed-contract receipt (`_shared/send-email.ts:9-13, 20-41`).

**Apply this together with §1 above** (the 100× total): both are in the same
function and the same two sends, and §1's `cents / 100` fix is what makes the
`Investment:` line in these emails agree with the sheet the client just signed.

**Not lane B's to write**: `supabase/**` is lane D's whole row (`steward.md` §6.4).
Lane B's client side needs no change — `ProposalsAPIClient.signProposal` already
invokes the function best-effort after the RPC (`:418-429`), and
`ProposalsMoneyRailTests.signPathInvokesTheConfirmationFunction` pins that call.

---

## 7. lanes A and C · the route `.budget` is labelled four ways after SP-16's rename

**Raised in the fix round (review finding B-4). Severity: high.** F56 — the
finding SP-16 answers — *is* surfaces disagreeing about the same thing. Lane B
renamed the screen and the Studio row; the Companion still promises a screen
that no longer exists by that name.

| Surface | Label today | Owner |
|---|---|---|
| Budget screen H3 | **"Billed to date"** | B (changed) |
| Studio row `records.budget` | **"Budget"** / "What's been billed, and what's been paid" | B (kept, id unchanged) |
| `CompanionActionRows.budgetRow` subtitle | **"Your spend"** | **A** (`steward.md` §6.5 carve-out) |
| `CompanionAreaBuilders` row labels ×6 | **"Your budget"** ×5, **"See your budget"** ×1 | **A** |
| `CompanionContext.contextLabel` | **"Your budget"** | **C** |

### 7a. lane A · `Patina/Features/Companion/Services/CompanionAreaBuilders.swift`

Six call sites, verified by grep:

```
:255  budgetRow(label: "Your budget")
:261  budgetRow(label: "Your budget")
:323  budgetRow(label: "See your budget"),
:329  budgetRow(label: "Your budget", suggested: true),
:336  budgetRow(label: "Your budget"),
:349  budgetRow(label: "Your budget"),
```

**Instruction:** `"Your budget"` → `"Billed to date"` at `:255`, `:261`, `:329`,
`:336`, `:349`; `"See your budget"` → `"See what's been billed"` at `:323`.

⚠ `PatinaTests/CompanionActionMatrixTests.swift:308` asserts the literal
`"See your budget"` — lane A owns that suite (`steward.md` §6.1) and must update
the assertion in the same commit.

### 7b. lane A · `Patina/Features/Companion/Services/CompanionActionRows.swift:66-68`

```diff
     static func budgetRow(label: String, suggested: Bool = false) -> CompanionActionItem {
-        item("chart.pie", label, "Your spend", route: .budget, id: "budget", suggested: suggested)
+        item("chart.pie", label, "What's been billed", route: .budget, id: "budget", suggested: suggested)
     }
```

*Why:* "Your spend" is the same claim the screen name was changed to stop
making — the screen sums what the designer has **billed**, not what the client
has spent. Keep the row `id: "budget"` unchanged: it is the analytics/route key,
not copy.

### 7c. lane C · `Patina/Features/Companion/Models/CompanionContext.swift:220`

```diff
         case .budget:
-            return "Your budget"
+            return "Billed to date"
```

*Why:* this is the label the Companion prints for "where you are", so it reads
directly over the screen title it is describing.

**Not lane B's to apply:** all three files are outside `steward.md` §6.2. Lane B
verified there is no other `.budget` label anywhere in `apps/mobile/Patina`:

```
$ grep -rn "Your budget\|Your spend\|See your budget" apps/mobile/Patina/Patina/
Features/Companion/Models/CompanionContext.swift:220          (7c, lane C)
Features/Companion/Services/CompanionActionRows.swift:67      (7b, lane A)
Features/Companion/Services/CompanionAreaBuilders.swift:255,261,323,329,336,349  (7a, lane A)
Features/Budget/BudgetViewModel.swift:168                     — a comment quoting
    the old name to explain the rename, in lane B's own file. Not a label; stays.
```
