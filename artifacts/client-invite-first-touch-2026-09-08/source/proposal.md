# The First Letter — a client's first touch, written by the studio

Patina · The Document · proposal for the Patina and Middle West Studio team · 8 September 2026

**Standing sentence.** Leah writes to Dave; Patina carries it and says so once, small, at the bottom.

**Standing.** Nothing here is built. One recommendation, thirteen rulings. Four lanes, L1–L4, ≈10.5 engineer-days.

This file is the prose spine of `../proposal.html` — the section headings and the paragraphs, without the markup, the tables, the mockups or the rulings grid. The deck says what it says; where this file and the deck disagree, the deck wins.

---

## 00 · The wound

A homeowner's first contact with Patina is the letter above. It names no studio, no designer, no project, and carries no note. The only reason it gives for arriving is a product description, and it allows her sixty minutes to act on it.

A better sender exists in the codebase, studio-branded with a seven-day token and a personal message, and has never had a caller. Lens 1 graded the live letter F for a cold recipient; lens 3 called the one-hour expiry a textbook phishing tell.

---

## 01 · The one rule

The studio is the author; Patina is the press. The email is the first client surface, so PP-1's letterhead and colophon law reach it.

Patina's name appears once in the whole letter, in the colophon at the foot. Whether the shell is a client surface is unruled; R2 asks for that ruling before the send leg is written.

---

## 02 · The panel

Six lenses read the same wound; where they disagreed, the disagreement became a ruling.

---

## 03 · The moment

A client comes through one of three doors. One field component serves all three; only its rendering changes, and nobody writes the same sentence twice in one send.

---

## 04 · The composer

One field component, rendered three ways. It is optional, capped at 280 characters, and nothing in it is pre-written.

Above the field sits an uneditable facts line in mono — who, where, when — assembled from the row, never invented; a fact that is missing prints as `NO PROJECT YET` rather than a guess. Below it, the field is blank.

The checkbox today reads *Send a magic-link invite to Patina*; it becomes **Send Dave the letter**, and the button names both acts: **ADD AND SEND THE LETTER**, or **ADD TO YOUR PEOPLE** when it is off. Nothing sends under a label that did not say so.

Checkbox off, the field folds to a single line, `+ A line for Dave`; opening it turns the letter back on. The ClientPicker's armed row starts folded the same way.

---

## 05 · The letter

The letter is 96 words with her note and 55 without, and it reads whole either way.

It opens with the studio's letterhead and closes with one colophon. Between them: a standing sentence the system writes and never disguises as hers, her note in a brass-ruled callout, one button, and a date the link works until. There is no *Accept invitation* and no countdown.

The subject says added, not invited: added is what happened, and invited would make Patina the host. Three lenses disagreed on the From name; R1 records the disagreement and the recommendation both, and R2 the letterhead. R3 owns the copy, R7′ the sign-off.

---

## 06 · The arrival

Every link GoTrue mints expires at `otp_expiry`, one hour, a value shared with password recovery across three portals. The letter can promise seven days only if the link is ours.

The page that link opens is page two of the letter: the same letterhead, the same sentence, the same note, one button, no password. The button POSTs, because a scanner following links on GET would burn the token; the server marks it accepted, mints a fresh magic link and redirects. She lands signed in on her house.

Her note is seeded as the house's first standing note, its byline frozen at send. With no note, nothing prints.

---

## 07 · After send

Three row states, all of them things that happened: Letter sent 8 Sept, Signed in 9 Sept, Link lapsed 15 Sept, with the remedy beside the last.

Opened is withheld. A read receipt in a studio's hands has one use, and that use is pressure.

Resend ships in v1 against today's silent no-op: a new token, the same frozen letter with a new date, one in flight, one per hour. The lapsed-link page offers it as one tap. R10.

Where the person already has an account, the designer is told a letter went and the homeowner gets nothing; a short notice letter goes instead. R13.

---

## 08 · What it takes

Three delivery paths were priced. The recommendation is (c): GoTrue mints the account, we write and send the letter, and the link in it is our own seven-day token.

Four lanes, about ten and a half engineer-days: two engineers for a week.

The top risk is not the migration but the shell. `renderBrandedShell` puts the Patina wordmark atop every client email by deliberate decision, and some twenty-one senders import it. An additive client-letter audience branch contains that, so only this sender changes. Rule R2 before L1 starts, or L1 rules it by accident.

---

## 09 · Rulings

Each of these is a recommendation, not a decision. The owner column names who rules; disagreement is the useful response.

R1 the envelope · R2 the shell under PP-1 · R3 the copy · R4 the note, optional and capped · R5 the delivery path · R6 the landing · R7′ the sign-off · R8 the note's afterlife · R9 row states · R10 resend in v1 · R11 who writes and who signs · R12 retiring "invite" on the designer's side · R13 the already-has-account case. Owners: Kody on R1, R2, R5, R6, R10, R12, R13; Leah on R3, R4, R7′, R8, R9, R11.

---

## 10 · What stays out

Each of these is recommended out, and the ruling or programme that owns it is named: household co-approver invitations (P-29) · SMS to homeowners · studio brand colours and studio sending domains (R1 owns the display name, the only lever there is) · rich text, translations, a homeowner drip · the wholesale PP-1 change to `renderBrandedShell` (R2) · the ambiguous-send reconciliation sweep · open-tracking as a designer-facing signal (R9).

---

## 11 · How to respond

Everything above is a recommendation. The useful response is disagreement, on the line it concerns.

Comment on the Artifact on the line it concerns. Rule R1–R13. Walk the People Room add-client sheet today and read the letter your own client would get — Mailpit locally; ten minutes gets further than reading.

Four questions for Middle West Studio: does "Middle West Studio via Patina" read right in your clients' inboxes, or would you rather the bare studio name? Should a junior's letter sign with the junior's name? Would you ever want to see "Opened" — and if so, what would you do with it? Full name or given name on the first letter?

Nothing was built · the document is the deliverable.

---

## Appendix

**A · Citations** — the file paths the deck cites, listed in the deck itself.

**B · The vision test.**

- **Surface** — The Document's client-facing face, V8. The letter is the client page's first page.
- **Studio moment** — bringing a client in. Zero seconds added; fifteen to thirty when she writes.
- **Stream** — the subscription floor: a homeowner who understands her letter signs in.
- **Promise** — one agreed direction, from the first line, in the designer's words.

**C · The panel record** — `panel/lens-1-homeowner.md` … `panel/lens-6-systems.md`, and `panel/synthesis.md`.

Fixtures throughout: Leah Hartwell · Middle West Studio (Madison) · Dave Okonkwo · "Van Hise kitchen and back hall"; and the solo fixture, Nora Feld · Priya Raman · no studio, no project. Every date is 8 September 2026 with a 15 September lapse.
