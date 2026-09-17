# Content approvals — Wave 1, editor of record pass (2026-09-03)

Every file below was checked against the shipped tree (main `235aec704`) — labels, routes, statuses, and behaviour claims re-grepped directly, not carried over from the drafters' notes — and against `.claude/skills/patina-brand-voice/SKILL.md`, VISION.md §4–§6, and `briefing/05-constraints.md`. Problems found were fixed in place; nothing was held.

## Wave-1 articles

- [x] content/wave-1/01-what-is-the-desk.md — What is the Desk? — approved (edits: none; "seven sections" and Verb list confirmed against desk-roster-derivation.ts and registry.tsx)
- [x] content/wave-1/02-sending-and-signing.md — How do I send a proposal and get it signed? — approved (edits: none; confirmed no live "revise" affordance exists post-signing — ReviseSheet is dead code, imported nowhere)
- [x] content/wave-1/03-invoices-and-getting-paid.md — How do I invoice and get paid? — approved (edits: none)
- [x] content/wave-1/04-the-margin.md — What is the margin? — approved (edits: none)
- [x] content/wave-1/05-sharing-and-the-client-mirror.md — What does my client actually see? — approved (edits: none)
- [x] content/wave-1/06-capture-a-lead.md — How do I capture a lead? — approved (edits: none)
- [x] content/wave-1/07-piece-into-a-project.md — How do I put a piece into a project? — approved (edits: none; "Add to Project" / "Add to favorites" confirmed verbatim in quick-view-modal.tsx)
- [x] content/wave-1/08-order-and-receive.md — How do I order and receive? — approved (edits: fixed the single-item order door — the button reads "Order with Assistant" on the FF&E line, not "Create PO"; the bulk "Order all — N items" door lives in Orders' own Vendors tab, not a separate FF&E "By Vendor" view)
- [x] content/wave-1/09-first-hire-access.md — What can my first hire see and do? — approved (edits: added the fourth invitable seat, Guest — `MemberRole` is `owner | admin | member | guest`, not three; the article had dropped it)
- [x] content/wave-1/10-the-desk.md — The Desk — approved (edits: none)
- [x] content/wave-1/11-command-bar.md — "⌘K, Find anything" — approved (edits: named the two new Wave-1 Studio rows explicitly — "The keys" and "The words" — the article referenced "The keys" only obliquely and never mentioned "The words" at all)
- [x] content/wave-1/12-desk-contents.md — "The Contents block" — approved (edits: none)
- [x] content/wave-1/13-orders.md — "Orders" — approved (edits: replaced the invented status vocabulary "drawn/confirmed/shipped/received" and "drafted through delivered" with the real PO statuses — draft, confirmed, in production, shipped, delivered, cancelled; noted the Vendors tab's "Order all — N items" bulk-order door)
- [x] content/wave-1/14-accounts.md — "Accounts" — approved (edits: none; three pages confirmed as DM-mono links, never tabs, in accounts-book.tsx)
- [x] content/wave-1/15-hours.md — "Hours" — approved (edits: none)
- [x] content/wave-1/16-the-post.md — "The Post" — approved (edits: fixed the bell's unread affordance — it's a quiet clay dot per D8, never a visible count, though the aria-label does carry a number for assistive tech)
- [x] content/wave-1/17-create-a-vendor.md — "How do I create a vendor?" — approved (edits: none)
- [x] content/wave-1/18-void-settle-print-invoice.md — "How do I void, settle, or print an invoice?" — approved (edits: none; statuses, acts row, and canPrint/canVoid gating confirmed verbatim in invoice-folio.tsx)
- [x] content/wave-1/19-change-project-scope.md — "How do I change a project's scope?" — approved (edits: none; "Add a change" gating to install/care confirmed in command-bar.tsx)
- [x] content/wave-1/20-the-keys.md — "The keys" (Help Center article) — approved (edits: added the shipped `?` key — pressing it anywhere not-typing, nothing open, raises this same page as a sheet — the article never mentioned it)

## Glossary (eight entries)

- [x] content/glossary/the-desk.md — The Desk — approved (edits: none)
- [x] content/glossary/room.md — Room — approved (edits: none)
- [x] content/glossary/sheet.md — Sheet — approved (edits: none)
- [x] content/glossary/the-margin.md — The margin — approved (edits: none)
- [x] content/glossary/in-hand.md — In hand — approved (edits: none)
- [x] content/glossary/put-down.md — Put down — approved (edits: none)
- [x] content/glossary/the-post.md — The Post — approved (edits: none)
- [x] content/glossary/hands-free.md — Hands free — approved (edits: none)

## The keys — shortcut reference

- [x] content/the-keys.md — "The keys" shortcut reference (source doc for `keys-reference.ts`, not a loader input) — approved (edits: added the `?` row to the "Anywhere" table — it lists `⌘K` and `Esc` but was missing the new `?` key entirely, which `keys-reference.ts`'s `buildKeysReference()` already carries)

## Loader

- [x] content/loader/load-onboarding-content.ts — Sanity content loader (`sanity exec` entry) — approved (edits: comment said "one of the 7 HELP_TOPICS labels" / "the 7 known labels" twice; `help-topics.ts` has shipped 8 shelves, including "For your clients" — corrected both comments and re-verified the shelf-count math still matches `KNOWN_SHELVES`, which already listed all 8)
- [x] content/loader/run-onboarding-content-load.mjs — Sanity content loader (direct `@sanity/client` entry) — approved (edits: same "7 → 8" comment fix, kept in sync with the sibling loader)

## Verification run

`node content/loader/run-onboarding-content-load.mjs` (dry run, no `--commit`) — all 20 Wave-1 articles parse cleanly against the current front-matter schema, zero errors, after every edit above.

## Superseded files

`APPROVALS-A.md` and `APPROVALS-B.md` are replaced by this file — see the one-line pointers left in their place.
