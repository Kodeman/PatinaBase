---
title: "What's in the Accounts export?"
sanityDocId: helpContent.onboarding.accounts-export
surfaceKey: designer-portal/document/accounts-export
persona: designer
contentType: helpArticle
shelf: Ledgers & money
---

The Accounts book's Ledger page has an act that hands the studio's own book back as a file: every invoice, its lines, its payments, and the client records needed to read them, saved as one spreadsheet. It's the studio's data leaving the studio, in a form a bookkeeper can open without Patina in front of them.

The file has five sheets.

**invoices** — one row per invoice drawn: its number, status, the client and household it billed, the project it belongs to (if any), the dates, and the money — subtotal, tax, total, what's been paid, what's collected, pending, failed, refunded, and the balance still owed. Drafts and voided invoices are included and labelled, not hidden.

**invoice_lines** — one row per line item on those invoices: description, quantity, unit price, amount.

**payments** — one row per payment recorded against an invoice, whatever its outcome. A failed charge and a refund each get their own row and their own column; neither is folded into what the studio actually collected. Only a succeeded payment counts as collected money.

**clients** — the client and household records the invoices and lines above need to make sense: name, contact, and the household a client belongs to, if any.

**manifest** — the sheet that explains the other four. Read it first.

The manifest says what left the studio and what didn't. If a designer can read an invoice that carries no studio at all — an old invoice from before a project had one — it's disclosed by count and left out of the file, because a studio-scoped file can't honestly claim a row that isn't stamped as this studio's. The same goes for a client record with no path back to this studio's work. Every sheet's columns are also checked for how many cells came back empty, and that count is in the manifest too — a blank column isn't hidden, it's counted.

Two things about the money are easy to misread if you don't know they're signed. The balance column is the invoice's total minus what's been paid, and it can go negative: a negative balance means the studio is holding a credit on that invoice, not that something owes it money. The credit figure carries that same overpayment as a positive number, on the rows where it applies, and is zero everywhere else. The manifest spells out that what the studio is still owed is the balance plus the credit, not one or the other.

The total billed figure in the manifest counts every invoice, drafts and voided ones included — but a second figure right beside it counts only the live ones, and the two add up to the total. That's the number to use for "what did we actually bill," not the one that includes paperwork that never went anywhere.

The file is a snapshot, not a live connection — it's dated to the moment it was saved, and running the export again later saves a new one; it won't update itself.

The column names are chosen to line up with what a QuickBooks import would ask for, but there's no QuickBooks sheet in the file today. That's a second sheet Patina would add later, and only if a studio actually re-keys its books into QuickBooks — it's a question for the pilot sit-down, not something built ahead of being asked for.
