# Study B: billing failure walk (pre-fix baseline)

US-35 · SQ-1022 · walked 2026-10-16 on local main `f3c7fb53a`

## Setup

- **Runtime.** Local Supabase was already up (`127.0.0.1:54321`). I started the designer portal alone, from the main checkout, with `pnpm turbo run dev --filter=@patina/designer-portal` on :3000. I did not run `pnpm dev`, reset the database or edit any seed.
- **Target check.** I signed in through the sign-in page's dev-accounts panel as `designer@patina.dev` (Leah Hartwell). The session JWT `iss` is `http://127.0.0.1:54321/auth/v1`, so this was local. The `sb-bkvcixdmuyejfzcijpdg-auth-token` cookie name is a fixed storage key (`packages/supabase/src/client.ts:140`), not a sign of the Strata target. I did not read any `.env` file.
- **Browser.** Chrome automation, with the desktop viewport rendered at 1400×863. Chrome could not resize the window (`resize_window` had no effect because the window was hidden), so the 390 px shots come from headless Playwright 1.58.2 at 390×844 with DPR 2. Playwright signed in through the same dev-accounts panel.
- **Data I wrote, all local and kept:**
  - two unpriced FF&E lines on Holloway Den: "ZZ US-35 Walnut console" and "ZZ US-35 Linen drapery"
  - two time entries on Holloway Den: 90 min non-billable and 120 min billable at rate `none`
  - Nora Ellison linked as client on Fenwick Lodge
  - one draft invoice ($850) on Fenwick Lodge
  - The "ZZ US-35 No Client Walk" project was never created, because project creation failed (see 7a).
- **Dev server.** Stopped when I finished (PIDs 28151/28153/28159/28601/28653 got SIGTERM; port 3000 confirmed free; task exit 143).
- **Screenshots.** Downscaled with `sips -Z 1600`, then cut to a 128-colour palette with Pillow because pngquant is not installed. Every file is under 260 KB.

**Friction scale:** 1 = no friction, 5 = dead end.

---

## 1. Project with no client → ad-hoc lines → Draft the invoice

| | |
|---|---|
| **Trying to** | Bill a consultation on a project that was opened without a client. This reproduces Leah's Kuehn case. Fenwick Lodge has `client_id` null and `studio_id` set, exactly as on Strata. |
| **Sees before pressing** | The create sheet labels the client "Select client (optional)" and never mentions billing ([01a](01a-new-project-client-optional.png)). The composer opens with no warning, takes lines, shows a $850 total and an enabled Draft act ([01b](01b-composer-no-client-no-warning.png)). The only clue is a small "Link a client first." under the Document header, far off-screen. |
| **Sees after pressing** | An uppercase terracotta box reads "INVOICE PROJECT IS MISSING ITS CANONICAL BILLING TUPLE" with a "TRY AGAIN" act ([01c](01c-draft-pressed-tuple-error.png)). Try again gives the same error every time. |
| **Can tell what's wrong?** | No. "Canonical billing tuple" names neither the client nor the studio. |
| **Can tell where to fix?** | No. There is no link to the fix, and "Try again" suggests a retry will help. |
| **Steps to fix** | 7 or more: close the composer → scroll to the Document header → Link a client → open the household picker → choose a household ([01e](01e-fix-path-household-sheet.png)) → scroll back to Project financials → Draft an invoice → re-type every line and the memo → Draft. It then succeeds ([01f](01f-after-linking-client-draft-succeeds.png)). |
| **Work survives?** | No. Closing the composer drops every typed line and the memo ([01d](01d-reopened-work-lost.png)). |
| **390 px** | The composer opens with the ad-hoc row overflowing: the remove "×" and the "1 LINE" count fall outside the panel ([01g](01g-390-composer-no-client.png)). After Draft, the same tuple message stacks under the act ([01h](01h-390-draft-pressed-tuple-error.png)). In dev the Next "1 Issue" badge covers Try again (dev-only). |
| **Friction** | **5** |

I checked the database after the failed Draft: 0 invoice rows on the project, so the throw left no orphan.

## 2. FF&E with unpriced lines → composer notice

| | |
|---|---|
| **Trying to** | Bill FF&E on Holloway Den, whose two FF&E lines have no client price. |
| **Sees** | Under FF&E · UNINVOICED the italic line reads "Nothing uninvoiced — every priced line is billed." Directly below, in muted mono: "2 UNPRICED LINES — SET A CLIENT PRICE TO BILL" ([02a](02a-composer-unpriced-ffe-notice.png)). The notice is plain text, not a link. It doesn't name the lines and doesn't say where prices are set. |
| **Sees after pressing** | With nothing else ticked, pressing Draft the invoice does nothing ([02b](02b-draft-pressed-nothing-happens.png)). The act is natively `disabled`, but it looks the same as the enabled act (opacity 1; only the cursor turns not-allowed). No reason and no focus move, which breaks SPEC §A5. |
| **Can tell what's wrong?** | Partly. The count is clear, but "Nothing uninvoiced" right above it contradicts it. |
| **Can tell where to fix?** | No. The fix is Edit FF&E schedule → Pricing tab, which the notice never mentions. |
| **Steps to fix** | About 6: close the composer → Edit FF&E schedule → Pricing tab → find each line → set the client price → back → Draft an invoice. |
| **Work survives?** | No. Composer state is lost on close, the same as in state 1. |
| **390 px** | The notice wraps over two lines and stays muted. The ad-hoc row and the "0 LINES" count overflow the right edge ([02c](02c-390-unpriced-and-rate-pending.png)). |
| **Friction** | **4** |

## 3. Hours with rate pending

| | |
|---|---|
| **Trying to** | Bill 2 h logged on Holloway Den. The studio has no `studio_member_rates` rows, so `rate_source` is `none`. |
| **Sees** | A greyed, unpickable checkbox "16 October · 2H · RATE PENDING rate pending", with the status written twice. Then "ONE HOUR HAS NO RATE YET · THEY CANNOT BE INVOICED UNTIL THE STUDIO PRICES THEM · SET THE STUDIO RATE →" ([03a](03a-composer-hours-rate-pending.png), zoomed in [03b](03b-rate-pending-copy-zoom.png)). |
| **Copy defects** | "One hour" is wrong: the entry is 2 h, and the code counts entries, not hours (`invoice-composer.tsx:957-960`). "One hour … they" mixes singular and plural. |
| **Can tell what's wrong?** | Yes, mostly. This is the clearest of the five states. |
| **Can tell where to fix?** | It has a link, but the link misleads. "Set the studio rate →" goes to `/desk?account=studio`. The composer stays open on top, and the account sheet behind it opens at the **Password** section, not at rates ([03c](03c-rate-link-pressed-composer-stacked-over-password.png)). Escape closes the hidden sheet, not the composer ([03d](03d-escape-closed-hidden-sheet-composer-remains.png)). |
| **Steps to fix** | Unknown and at least 5. I could not find a rate control from that landing in the time I had. The contract precedent is hours-ledger "Name the studio". |
| **Work survives?** | Yes, in this one path: the composer stays mounted across the navigation, and the typed $400 line survived. But it is now sitting on the Desk, over a sheet the designer can't see. |
| **Friction** | **3** |

## 4. Deposit % over the limit

| | |
|---|---|
| **Trying to** | Bill the $4,750 Oak trestle table on Fenwick Lodge as a deposit, typing 150 %. |
| **Sees** | Inline terracotta mono text beside the field, "A PERCENT ABOVE 0, AT MOST 100" (`role=alert`). The line amount reverts to $4,750.00 while the totals read $0.00 with "1 LINE" ([04a](04a-deposit-150-percent-alert.png)). |
| **Sees after pressing** | Draft the invoice does nothing. It is natively disabled and looks enabled, with no reason given and no focus move ([04b](04b-deposit-draft-pressed-nothing-happens.png)). |
| **Can tell what's wrong?** | Yes. The message sits next to the field. |
| **Can tell where to fix?** | Yes, it is the same field. |
| **Steps to fix** | 1: retype the percent. |
| **Work survives?** | Yes. |
| **Friction** | **2**, but the "1 LINE / $0.00 / $4,750.00" mismatch is confusing. |

I found no separate check for a deposit bigger than the remaining balance. The only guard on this field is the 0–100 % range.

## 5. Send a drafted invoice to a client with no email (`no_recipient`)

| | |
|---|---|
| **Result** | **Not reachable through the UI in this walk.** The household picker marks households with no email ("Elena Marlowe", "The Ashfords") "NO EMAIL ON FILE" and `aria-disabled`, so a project can't be linked to them ([05a](05a-no-email-households-unselectable.png)). Every client I could link has an email on their profile or in `designer_clients`. |
| **Not exercised** | I deliberately did not press Issue & send on the Fenwick draft. The local `invoice-send` could reach a real mail provider depending on local function secrets, and the project rule is "no automated external sends". The bare-code path (`useSendInvoice` showing `no_recipient`) is still unwalked. It needs a client whose email is removed after linking, or a seeded fixture. |
| **Side finding** | The disabled no-email rows offer no "add an email" act. A designer who wants to bill one of those households is stuck in the picker. The list also shows "Client User / client@patina.dev" twice. |
| **Friction** | n/a (UI path guarded upstream). The no-email dead end in the picker rates **3**. |

## 6. Composer from the Desk or ⌘K vs from the project's Document

| | |
|---|---|
| **Desk** | New work → Draft an invoice opens the same composer with a "Pick a document…" select ([06a](06a-desk-composer-pick-a-document.png)). It lists all 18 documents with no sign of which have no client or no studio. Okonkwo residence has no client, but I could still pick it, add a $600 line and press Draft. It gave the same tuple error ([06b](06b-desk-composer-no-client-tuple-error.png)). |
| **⌘K** | Find anything → "draft an invoice" → Enter opens the identical Desk composer ([06c](06c-cmdk-draft-an-invoice.png)). |
| **Differences** | From the Desk there is no "Link a client" anywhere nearby. The designer has to leave the Desk, find the project, link the client and come back, losing the composer each time. From the Document, the fix is at least on the same page. |
| **Friction** | Desk/⌘K **5**; Document **5** (see state 1). |

## 7. Other failures found along the way

- **7a. Creating a project fails with a raw code** ([07a](07a-create-project-raw-studio-error.png)). In the create sheet, "Create project file" printed `studio_id_not_designer_studio` in red under the fields, and nothing was created. Locally Leah owns two studios (`organization_members` has two `owner` rows). The likely cause is that the `set_project_studio_id` trigger (`00511_public_sd_hardening.sql:2317+`) refuses when it can't choose one. I did not confirm the cause; that is code reading only. Either way the designer sees a database code, can't tell what's wrong or how to fix it, and the typed title stays but goes nowhere. **Friction 5.** A first-time studio with two studios (a personal one plus Middle West) is a realistic case.
- **7b. Logging time silently defaults to non-billable.** Desk → Record time: on a project without an agreement the toggle starts at "NON-BILLABLE" and is easy to miss. The 90 min entry saved as `billable=false, billing_state=nonbillable`. The composer then says "No unbilled hours on this document." while the footer shows "IN HAND TODAY 1h 30m" ([07c](07c-logged-hours-missing-from-composer.png)). The designer can't tell why the hours are missing. **Friction 4.**
- **7c. The first press on a Document act often misses.** On a fresh Document load, sections render collapsed and then expand a moment later, pushing "Draft an invoice" down the page ([07d](07d-doc-first-paint-draft-act-here.png) → [07e](07e-doc-reflowed-click-lands-elsewhere.png)). In 4 of 5 automated attempts, the first click landed on whatever had moved under it. A human pressing straight after load would hit the same problem. **Friction 3.**
- **7d. Dev-only noise, not product findings.** The first page loads after start threw `ChunkLoadError` / "This page could not be read." while webpack was still writing chunks, and it cleared after a reload. On every Draft error, Next's dev overlay shows "1 Issue", which covers Try again at 390 px.

---

## Friction summary

| # | State | What they see | Knows what? | Knows where? | Steps to fix | Work survives | Friction |
|---|---|---|---|---|---|---|---|
| 1 | No client → Draft | "canonical billing tuple" | no | no | 7+ | no | **5** |
| 2 | Unpriced FF&E | muted count, dead Draft | partly | no | ~6 | no | **4** |
| 3 | Rate-pending hours | wrong-count copy and a link | yes | misleads (lands on Password) | ≥5, unclear | yes (composer persists) | **3** |
| 4 | Deposit > 100 % | inline alert | yes | yes | 1 | yes | **2** |
| 5 | No-email client | guarded in the picker; send not exercised | n/a | n/a | n/a | n/a | n/a (picker dead end 3) |
| 6 | Desk / ⌘K composer | same tuple error, no fix nearby | no | no | 8+ | no | **5** |
| 7a | Create project | `studio_id_not_designer_studio` | no | no | unknown | title kept, unsaved | **5** |
| 7b | Non-billable default | "No unbilled hours" | no | no | relog | n/a | **4** |
| 7c | Layout shift | the click misses | n/a | n/a | press again | yes | **3** |

## Top 5 problems, worst first

1. **The no-client draft is a dead end, and the designer's work is thrown away.** The tuple message names nothing, Try again cannot help, and the fix is on another part of the page. Closing the composer to go and fix it deletes every typed line. It hits from the Document, the Desk and ⌘K alike. `canDraft` ignores client/studio although the composer already knows them (contract blocker 1). States 1 and 6, friction 5.
2. **Raw database codes reach the designer before billing even starts.** Project creation prints `studio_id_not_designer_studio` for a designer in two studios. It is the same class of error as the tuple message: a code, no fix. State 7a, friction 5.
3. **"Draft the invoice" is natively disabled, looks enabled and does nothing.** With no lines, unpriced-only FF&E or a bad deposit, pressing the act gives no reason, no focus move and no status line, which breaks SPEC §A5. States 2 and 4.
4. **Unpriced FF&E has no fix link.** The muted notice sits under a contradicting "Nothing uninvoiced" line and doesn't say where prices are set. State 2, friction 4.
5. **Hours that should be billable vanish or mislead.** Record time quietly defaults to non-billable, so the hours never reach the composer. Rate-pending copy counts entries as "hours", and its one fix link opens the account sheet at Password, hidden behind the still-open composer. States 3 and 7b.

Also worth fixing: at 390 px the composer's ad-hoc row and line count overflow the panel (01g, 02c), and the Document's late section expansion moves acts under the cursor (7c).
