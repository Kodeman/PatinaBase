# Designer portal — rendered navigation labels (verbatim, 2026-09-03)

Captured from the local designer portal at 1440x900 as `designer@patina.dev` (Leah Hartwell, studio owner). Text is reproduced as the DOM renders it (`innerText`); where CSS uppercases a label the source string is given in parentheses when it differs. Sources: `screens/labels*.json`, and the components named below.

## Studio Drawer (`nav[aria-label="Studio drawer"]`, ≥1180px), left → right

1. `PATINA` — wordmark link to `/desk` (on a document it reads `PATINA / DOCUMENT`; in rooms `PATINA / LIBRARY`, `PATINA / PEOPLE`, `PATINA / ROOMS`)
2. `Library`
3. `People`
4. `The Scans`
5. `Ledgers ↑` — opens a popover titled `LEDGERS · SHEETS` with rows `Orders`, `Accounts`, `Hours`
6. `Find anything ⌘K` (aria-label `Find anything (⌘K), from the studio drawer`; the "Find anything" word is shown only ≥1440px)
7. `HANDS FREE` — the time control (aria-label `Open time controls, in hand …` when a document is in hand)
8. `THE POST` — bell (aria-label `The Post` / `The Post, 3 unread`)
9. `LH · Leah Hartwell · LEAH HARTWELL` — account nameplate (aria-label `Account and settings`)

Below 1180px the drawer is replaced by the mobile bar (`data-testid="mobile-bar"`, aria-label `Document bar`): `IN THE STUDIO / The Desk` · `TODAY / Hands free` · `MORE` (aria `More studio actions`).

## ⌘K command bar, empty query (`/desk`)

Input placeholder: `Find a document or a ledger…`

**WHERE THE WORK STANDS**
- `In procurement · 5` — `OLSEN LAKE HOUSE · CHEN RESIDENCE · +3 MORE`
- `Out for signature · 2` — `SAMPLE ACCEPTED PROPOSAL · ASPEN LOFT — LIVING ROOM REFRESH`
- `In direction · 3` — `CONCURRENCY TARGET DRAFT · CONCURRENCY SOURCE DRAFT · +1 MORE`
- `In discovery · 1` — `THE ASHFORDS (NO-LOGIN HOUSEHOLD) · SCHEDULE THE DISCOVERY CALL`
- `In brief · 5` — `CONSULTATION · FULL ROOM · +3 MORE`

**ROOMS & LEDGERS**
- `Library` — `ROOM ↗` — shortcut `G L`
- `People` — `ROOM ↗` — `G P`
- `The Scans` — `MEASURED ROOMS, FROM THE FIELD` — `G R`
- `Orders` — `LEDGER` — `G O`
- `Accounts` — `LEDGER` — `G A`
- `Hours` — `LEDGER` — `G H`
- `The Post` — `LEDGER` — `G T`

**BEGIN**
- `Capture a lead` — `BEGIN A BRIEF`
- `Open a project` — `NO PROPOSAL NEEDED`
- `Draft a design agreement` — `FOR AN EXISTING HOUSEHOLD`
- `Draw an invoice` — `MILESTONES · TIME · FF&E · AD-HOC`
- `Add a maker` — `A VENDOR ON YOUR ROSTER`

**STUDIO**
- `Browse the Help Center` — `GUIDES · EVERY SURFACE`
- `Help…` — `ABOUT THIS SURFACE`
- `Take the walkthrough` — `THE DESK, IN A MINUTE`
- `The Desk` — `GO HOME`
- `Interruptions` — `BREAK-THROUGH SETTINGS`
- `Settings` — `PROFILE · NOTIFICATIONS · SECURITY`
- `Sign out` — `DESIGNER@PATINA.DEV`

With `invoice` typed: `Accounts · LEDGER · G A` · `Draw an invoice · MILESTONES · TIME · FF&E · AD-HOC` · `Ask about “invoice” · ASK & PLACE`.

The "G ·" two-key shortcuts are the global doorway shortcuts (`RegistryShortcuts`, `app/(document)/layout.tsx`).

## Desk header actions (`/desk`)

`+ CAPTURE A LEAD / BEGIN A BRIEF` · `+ OPEN A PROJECT / NO PROPOSAL NEEDED` · `FIND ANYTHING ⌘K`. Ledger line `EVERY JOB · 16 LIVE · 1 OVERDUE`. Group pills `BRIEF · 5`, `DISCOVERY · 1`, `DIRECTION · 3`, `PROPOSAL · 2`, `PROJECT · 5`. Row CTAs seen: `OPEN THE JOB`, `OPEN THE PROJECT`, `REVIEW DECISIONS`, `OPEN THE SCHEDULE`, `REVIEW THE CLAIM`.

The Desk's lower "THE STUDIO" block (scrolled): ROOMS — `Library / pieces and makers`, `People / clients, makers, trades`, `The Scans / measured rooms`; LEDGERS — `Orders / POs, receiving, claims · SHEET`, `Accounts / invoices, receivables, earnings · SHEET`, `Hours / time in hand · SHEET`, `The Post / mail and messages · SHEET`; BEGIN — `Open a project / no proposal needed`, `Draft a design agreement / for an existing household`, `Draw an invoice · new`, `Add a maker / a vendor on your roster`, `Open the Drafting Room / facets fill in any order`. (Seen in the Chrome pass at 1028px; the 1440 shots do not scroll that far.)

## Document spine (`aside[aria-label="Document spine"]`)

Lead document (`/doc/12d6952a-…`, Marcus Wright): `← PUT DOWN` · `Marcus Wright` · section label `BRIEF` · `The brief / NOTHING YET` · `The record / NOTHING YET`.

Project document (`/doc/b0000000-0000-0000-0000-000000000001`, "Client User"): `← PUT DOWN` (aria `Put down document`) · `Client User` · section label `PROPOSAL` · `The proposal / NOTHING YET` · `Scope & engagement / CORE · STAGE 03` · `Design vision / NOTHING YET` · `The investment / $100,000` · `The record / 3 COMPLETE`.

Right margin header on a document: `IN THE MARGIN` · `+ NOTE`; empty copy `The margin — decisions, messages, and money gather here`.

## Sheets and rooms — headers as rendered

- Orders sheet: `ORDERS · LEDGER` · `? · PUT BACK · ESC` · tabs `LEDGER / THE WEEK / RECEIVING / VENDORS`
- The Post: `THE POST · THE RECORD` · `MARK ALL READ` · tabs `LETTERS / THE RECORD`
- Account sheet: `PUT BACK · ESC` · `STATUS` `Online / Away / Busy / Offline` · pages `PROFILE / NOTIFICATIONS / SECURITY / DEVICES / EXTENSION / STUDIO` (`STUDIO` only with the `studio-workspaces` flag) · `⏻ SIGN OUT`
- Studio setup checklist (Account → STUDIO): `STILL TO DO` · `Name & brand the studio` · `Set your own title` · `Invite your crew` · `Seed the rolodex` (`The rolodex fills itself from your projects`, `SKIP`) · `Open the first project`
- Help panel (⌘K `Help…`): title `Help`, footer `BROWSE ALL HELP →`
- Help Center `/help`: `Help` · `← THE DESK` · card `The Desk walkthrough · ABOUT A MINUTE` · `FEATURED`
- Library `/library`: `← THE DESK` · `THE LIBRARY · 25 pieces` · `⊕ CAPTURE` · shelves `MINE · STUDIO · PATINA` · `ADD TO LIBRARY ↓`
- People `/people`: `← THE DESK` · `THE PEOPLE ROOM · 9 people` · `+ ADD PERSON` · rail `IN THIS ROOM` → `DIRECTORY / Directory`, `RELATIONSHIPS / Threads, Nurture, Reviews`, `PRACTICE / Portfolio, Outreach, Your Eye`
- The Scans `/rooms`: `← THE DESK` · `THE SCANS · 6 scanned rooms`

## Desk walkthrough (six coachmarks)

`STEP n OF 6`, footer `Skip tour` / `Next` (step 6: `To work`). Titles: `The Desk` · `One client, one document` · `Rooms and ledgers` · `The studio drawer` · `Find anything` · `Begin with a lead`. Full bodies in `screens/README.md`.
