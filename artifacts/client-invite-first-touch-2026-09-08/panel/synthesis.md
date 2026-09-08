# The First Letter — synthesis

**Fable, orchestrating · 8 September 2026 · after six lenses**

The panel converged on one design. Where lenses disagreed, the disagreement is recorded here and, when it is not mine to settle, becomes a numbered ruling. Nothing here is built.

Fixture throughout: designer **Leah Hartwell**, studio **Middle West Studio** (Madison), homeowner **Dave Okonkwo**, project **"Van Hise kitchen and back hall"**. Second fixture: solo designer **Nora Feld**, no studio, client **Priya Raman**, no project.

## 0 · The wound, in one paragraph

A homeowner's first-ever contact with Patina is a Supabase Auth email: subject *"You're invited to Patina"*, body *"You've been invited to join Patina — a workshop for interior designers, their clients, and the makers they trust… This invitation expires in 60 minutes."* No studio, no designer, no project, no note, a one-hour clock. A better sender (`client-invite`, studio-branded, seven-day token, personal message) exists and has never had a caller. The designer's own screen calls the act *"Send a magic-link invite to Patina."* Lens 1 graded the live letter **F** for a cold recipient; lens 3 called the one-hour expiry "a textbook phishing tell."

## 1 · The one rule

**Leah writes to Dave; Patina carries it and says so once, small, at the bottom.** (Lens 4.) The letter is the first client surface. PP-1's letterhead and colophon law apply to it. Patina's name appears exactly once in the whole letter — the colophon *"Prepared by Middle West Studio · Sent through Patina."*

## 2 · The design

### 2.1 The composer (designer side)

- **One field component, three renderings** (lens 2). Add-person sheet: the full field. ClientPicker armed row: a collapsed *"+ A line for Dave"* disclosure that expands the same field in place. Send sheet: **no second field** — the proposal's existing personal message is the note; nobody writes the same sentence twice in one send.
- **Scaffolded, Arrival Arc shape** (lenses 2, 4). An uneditable facts line above, in mono: `DAVE OKONKWO · dave@okonkwo.net · VAN HISE KITCHEN AND BACK HALL · ADDED TODAY` (missing facts print as `NO PROJECT YET` / `NO NAME`, never invented). Her words below, blank. Nothing pre-written.
- **Optional, 280 characters** (all lenses; the handoff-note precedent). Send works with an empty note; the letter reads whole without it. Counter: `Up to 280 characters` → `96 left` → `That's the whole 280.` No colour change.
- **Label:** `A line for Dave` (fallback `A line to send with it`). **Placeholder:** `Say why you added them and what they'll find. Two lines is plenty.` — an instruction, not a draft (lens 4 over lens 2's fictional-project example: a placeholder that *sounds* sendable teaches the wrong thing).
- **Checkbox** (default on), replacing *"Send a magic-link invite to Patina"*: **`Send Dave the letter`** / `Send them the letter`. Helper: *"He gets one email from Middle West Studio with your line in it and a link that signs him in. Leave it off and he's on your roster only — you can write later."* (Gender-free variant when no name.)
- **Checkbox off:** the field folds to a single line, `+ A line for Dave`; opening it turns the letter back on. The ClientPicker's armed row starts folded the same way.
- **Button:** `ADD AND SEND THE LETTER` when on, `ADD TO YOUR PEOPLE` when off — nothing sends under a label that did not say so (J2 kept in the copy layer).
- **As she types**, her words appear beneath the field in the letter's callout style with the facts line above — a glance check, not a rendered-email preview (lens 2, medium confidence; cheap).
- **Success line:** `Dave is on your roster. Your letter is on its way to dave@okonkwo.net.` / `…Nothing was sent.` / `Dave was already on Patina. He's linked to you now; a short letter tells him so.`
- **Activity log:** `Leah wrote to Dave Okonkwo` — `Letter sent to dave@okonkwo.net · with a note`.

### 2.2 The letter (homeowner side)

Copy is lens 4's, adopted in full. Body 96 words with the note, 55 without.

- **From:** `Middle West Studio via Patina <hello@patina.cloud>` — see R1; three lenses disagreed. **Reply-to: the designer's address** (unanimous; precedent in four senders).
- **Subject:** `Leah Hartwell added you to the Van Hise kitchen and back hall`. "Added", not "invited" (lens 4: the literal truth of the act; "invite" makes Patina the host). No "Patina" in the subject (unanimous). Solo fixture: `Nora Feld set up a page for your work together`.
- **Preheader:** `Where Middle West Studio keeps the record of your job.`
- **Letterhead** (PP-1, two-sided): `MIDDLE WEST STUDIO` / `Madison · 8 September 2026` left; `Prepared for Dave Okonkwo` right. Studio logo ≤24px beside the name when one exists. **No Patina wordmark.** Solo designer: her own name is the letterhead (lens 4; lens 3 would keep the Patina wordmark here — R2 records the dissent).
- **Standing sentence** (system, truth-framed, always present): *"Leah Hartwell of Middle West Studio added you to the Van Hise kitchen and back hall on 8 September. The page below holds the studio's record of the job — the plans, the papers, and the numbers."* Two sentences, deliberately (lens 4 §E.7): the second tells a stranger what he has been handed.
- **The note**, as a brass-ruled callout, first person, hers alone.
- **One button:** `Open the project` (`Open the page` with no project). Never "Accept invitation".
- **Expiry line:** `The link works until 15 September; Leah can send another.` A date, once, with the remedy. No countdown.
- **Sign-off:** `— Leah Hartwell · Middle West Studio · Madison` — full name on the first letter (R7′).
- **Footer:** `Prepared by Middle West Studio · Sent through Patina` / `Sent to dave@okonkwo.net at the request of Middle West Studio.` / `If this isn't for you, nothing happens — ignore it and the link lapses on its own.` / paste-link fallback. Transactional: no unsubscribe. Plain-text part mandatory (lens 3).

### 2.3 The arrival

- **Path (c)** (lens 6): GoTrue mints the account with `generateLink` at send and the link is discarded; the letter's button points at **our seven-day `client_invitations` token**. Every GoTrue link is bound to the shared one-hour `otp_expiry`, which also governs password recovery and cannot be raised for one channel. So the letter can be seven days only if the link is ours.
- **The token page is page two of the letter** — same letterhead, same standing sentence word for word, same note, one button `Open the project`. **No password.** The button POSTs; the server marks the token accepted, mints a fresh magic link, redirects; she lands signed in on her house at `/`. Mint on POST, never on GET (mail scanners prefetch links). This closes the split where the email names the studio and today's landing page names the person.
- **First visit to the Threshold:** the note is seeded at send time as the house's first standing note, rendered by the existing standing-note component with the **frozen** byline from the snapshot (`— From Leah Hartwell · Middle West Studio · 8 September`), never a live-resolved studio name (lens 5 found the live resolution would silently relabel the note if the studio renames). It recedes as every standing note does — superseded by the studio's next note, dimmed once read — never on a calendar. When retired it becomes the first dated entry in the house's record. **With no note, nothing prints** (unanimous).
- **No project:** the note has no house to land in; it lives on the letter page she has just read and on the client record. Recorded in R8.
- **Lapsed link:** the page says `This letter's gone stale.` and offers one tap, `Send a fresh letter` — the identical frozen letter with a new date, sent by the system; nothing lands in Leah's queue for a thing she did not do wrong.
- **Already has an account:** today the designer is told a letter went and the homeowner gets nothing. A short `kind='notice'` letter goes instead — same letterhead and note, button straight to the house, no expiry line, nothing to accept.

### 2.4 After send (designer side)

- **Row states, three:** `Letter sent 8 Sept` · `Signed in 9 Sept` · `Link lapsed 15 Sept · Write again`. `Opened` withheld — R9.
- **Resend in v1** (lenses 2, 5, 6 against today's silent no-op): new token, same frozen letter, one in flight at a time, one-per-hour cooldown. Never phrased as an absence.

### 2.5 What it takes (lens 6, adopted)

| Lane | Size | One-way? | What |
|---|---|---|---|
| L1 · The send leg | M | **Yes** — migration `00581_client_invite_letter.sql` (additive: snapshot columns, `designer_client_id`, `kind`, `email_log_id`, `resend_count`, 280 CHECK on `personal_message`) | `/api/clients/invite` body-driven branch: `generateLink({type:'invite'})` with `role:'homeowner'`, snapshot insert, letter render through an additive `audience:'client-letter'` shell branch, `sendCompliantEmail` (transactional, idempotency key). The notice letter. The Deno tests the `client-invite` edge function has never had. |
| L2 · The composer | S | No | The field on three entry points, gated on `client-invite-letter`; counter; `has_note` analytics. |
| L3 · The arrival | M | No | Token page becomes page two of the letter, mint-and-redirect on POST; seeded standing note with frozen byline. |
| L4 · The designer's account | S | No | Row prose from `client_invitations` + `notification_log`; resend act; the one `SECURITY DEFINER` read a designer needs to see her own send's status. |

≈10.5 engineer-days; two engineers for a week. Flag `client-invite-letter`, fail-closed; the route falls through to today's exact code when the new body field is absent, so the off state is byte-identical to today. Path (b), enriching the shared GoTrue template with `{{ .Data.* }}`, was priced at 5 days and rejected: it cannot fix expiry, cannot log, cannot snapshot, cannot separate audiences, and puts a studio's letter in a field the homeowner can overwrite.

**Top risk:** PP-1 versus `renderBrandedShell`, which places the Patina wordmark atop every client email by deliberate decision and is imported by twenty-one senders. Contain with an additive `client-letter` audience; let the wholesale change be its own program. Rule R2 before L1 starts or L1 rules it by accident.

## 3 · Rulings

Each is a recommendation, not a decision. The owner rules; disagreement is the useful response.

| # | Question | Recommendation | Owner | Blocks |
|---|---|---|---|---|
| R1 | The envelope: From display name for homeowner letters. | `Middle West Studio via Patina <hello@patina.cloud>` — business name leads, "via" discloses the relay (the Gmail-Groups pattern), which reads as a legitimate relay rather than display-name spoofing; a personal name in front of a domain that is not hers is the shape filters catch (lens 3). Fallback with no studio: `Leah Hartwell via Patina`. Alternative for the ear: bare `Middle West Studio` (lens 4). Reply-to the designer either way. | Kody | L1 |
| R2 | Is the email a client surface under PP-1? | Yes. Studio letterhead on top, Patina once in the colophon. Implemented as an additive `audience:'client-letter'` shell branch so only this sender changes; the wholesale shell change is its own program. Solo designer: her name is the letterhead (lens 3 dissents: keep the Patina wordmark when there is no studio). Record with the owed PP-6 V9 amendment. | Kody | L1, L3 |
| R3 | The letter's copy. | Lens 4's letter as written: subject "added you to", the two-sentence standing sentence, `Open the project`, the dated expiry line, the three-line footer. | Leah (ear) | L1 |
| R4 | The note: optional or required; cap. | Optional, 280 characters. The letter reads whole without it. | Leah (practice) | L1, L2 |
| R5 | Delivery path. | (c): GoTrue mints, we write; the letter's link is our seven-day token; the GoTrue link is minted at click, on a button POST. | Kody | L1 |
| R6 | The landing. | Page two of the letter, no password, one button. Retire the password form. | Kody | L3 |
| R7′ | Full name or given name in the sign-off. | Full name on the first letter and the first-visit note; R7's given name on every letter after. | Leah (ear) | L1 |
| R8 | The note's afterlife. | Seeded as the house's first standing note from the frozen snapshot; recedes as standing notes do; with no project it lives on the letter page and the client record only. | Leah (practice) | L3 |
| R9 | Row states. | Three: Letter sent · Signed in · Link lapsed. `Opened` withheld — a read receipt in a studio's hands has one use, pressure. If kept, never as an absence, never on a client surface. | Leah (practice) | L4 |
| R10 | Resend in v1. | Yes: same frozen letter, new date, one in flight, one per hour. The lapsed-link page offers one tap. | Kody | L4 |
| R11 | Who may write, whose name signs. | Any studio member; the writer signs. (Owner-only signing for juniors is a business call, not a default.) | Leah (practice) | L2 |
| R12 | Retire "invite", "magic-link", "to Patina" on the designer's side. | Ship the checkbox rename and helper regardless of the rest. The house word is *the letter*. | Kody | L2 |
| R13 | The already-has-account case. | The notice letter goes; the silent link ends. | Kody | L1 |

## 4 · Vision test

- **Surface:** The Document's client-facing face (V8) — the letter is the first page of the client page.
- **Studio moment:** bringing a client in, while adding first hands. Zero seconds added to the fast path; fifteen to thirty when she chooses to write.
- **Stream:** the subscription floor — a homeowner who understands the letter signs in; one who does not is a studio that stops sending them.
- **Promise:** "you and your designer are looking at the same agreed direction" begins at the first line, in the designer's words, on the studio's paper.

## 5 · What stays out

- Household co-approver / "loop in a family member" invitations (P-29, its own program).
- SMS invites to homeowners (the Field rail is for trades).
- Studio brand colours or a studio sending domain (no schema; the envelope stays `patina.cloud`).
- Rich text in the note; translations; a marketing drip to homeowners.
- The wholesale PP-1 change to `renderBrandedShell` for every client email.
- The ambiguous-send reconciliation sweep (`provider_id` NULL rows) — store the idempotency key, build the sweep elsewhere.
- Open-tracking as a designer-facing signal (R9).

## 6 · Panel record

Lens files in this folder: `lens-1-homeowner.md`, `lens-2-composer.md`, `lens-3-envelope.md`, `lens-4-voice.md`, `lens-5-arrival.md`, `lens-6-systems.md`. Research in `../research/`.
