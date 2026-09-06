# Studio invoices — rulings

All rulings S1–S12 adopted as recommended (Kody, 2026-09-05: "go with your recommendations").

| # | Ruling | Recommendation |
|---|---|---|
| S1 | **Shape.** First-class project-less invoice (nullable `project_id`) vs a hidden shell project per invoice vs "just use R79 open-a-project" | First-class. Shell projects pollute Desk/client page/ledger; R79 is the wrong answer for a consult that may never become a house. |
| S2 | **Name.** "Studio invoice" vs "loose invoice" vs "direct invoice" | *Studio invoice* — reads on the ledger as `Studio · Design consultation` beside `Hollis House`. "Ad-hoc" stays the line kind (R74). |
| S3 | **Where it's drawn.** Same composer with a "for: the studio" choice vs a separate "Draw a studio invoice" verb/sheet | Same composer. One verb, one sheet, one habit; no registry/⌘K/Contents/help-parity churn. |
| S4 | **Who it's for.** A household on the roster (R73 invite-on-send; account created when the letter is opened) vs an email-only recipient with a tokenized public pay page | Household + R73. One identity model; no public pay page (new attack surface, no precedent, contradicts R135). |
| S5 | **Where the client pays.** Letterbox of the adopted house + letterbox-only front door vs a new client route | Letterbox. R135 forbids new routes; houseless orders already ruled the adopted-house pattern. |
| S6 | **What lines.** Ad-hoc lines only vs also unbilled time / FF&E | Ad-hoc only. Time entries and FF&E are project-bound; pulling them cross-project invents a second pull-through. |
| S7 | **Earnings.** Studio invoices count as `design_fee` earnings in the Accounts Earnings page | Yes — R36/R37 "what you earn" is design fees regardless of house. |
| S8 | **Two-studio designers.** Silent primary studio vs an explicit studio line when the designer belongs to >1 | Explicit line when >1, silent otherwise. (Prod flow fix 00566 already needed a two-studio guard for signatures.) |
| S9 | **Desk visibility.** Receivables-page only (v1) vs a Desk need line for an overdue studio invoice | Receivables only in v1; Desk need line = Wave 4 candidate. Studio invoices have no folder to hang a need on. |
| S10 | **Flag.** `studio-invoice` on the designer side only; DB + client page unflagged | Yes. Client page is flagless by R135; DB changes are inert without rows. |
| S11 | **iOS.** Null-safety only in v1 vs full placement in the iOS Invoices list | Null-safety only; place in a later wave after the Daily Return / approvals program settles. |
| S12 | **Title required?** Required "regarding" line vs optional | Required. It is the only thing that names the letter on the ledger, in the email subject, and on the client's mat. |
