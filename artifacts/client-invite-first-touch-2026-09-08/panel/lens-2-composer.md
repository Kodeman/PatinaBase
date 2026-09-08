# The First Letter — Panel Lens 2

**Lens: the designer's moment — the composer.** Where and how the studio writes the note, in the flow of a working day.

---

## 1. One composer or three?

**One shared field component, deployed three ways — not three separate builds, and not one identical rendering everywhere.** *(High confidence.)*

- **Add-person sheet** — full real estate, full field: label, textarea, counter, live context line.
- **ClientPicker armed row** — this is a ~260–320px popover row (see `client-picker.tsx` L413–467: the confirm block is two lines of copy and two buttons). There is no honest way to fit a labeled textarea and counter in that space without turning a one-click confirm into a different UI. Here the shared component collapses to a single-line "+ Add a note" disclosure that expands the same textarea inline, in place, only on tap — the row's footprint stays a row until she asks it not to.
- **Send sheet** — does **not** get a second field. See below: this is the same note as the proposal's personal message, reused, not duplicated.

**Are the send-sheet's personal message and the invite note the same thing? No — two different notes that must not both be asked for in one send.** The proposal's "Personal message" (`send-sheet.tsx` L799–813) answers *"here's what I'm sending you"*; the invite note answers *"here's why you're hearing from me at all."* When invite-on-send fires for a captured household with no account (`captured-household-invite.tsx`), she has already written the proposal's personal message in the same sheet. Recommendation: **reuse that message as the invite note's content too — one field, two consumers** — rather than asking her to write the same sentence twice in one send action. A second, empty "why you're getting this" field bolted onto an already-full send sheet is exactly the kind of homework the studio surface should never impose.

## 2. Blank vs scaffolded

**Apply the Arrival Arc shape, with one deliberate addition.** *(High confidence on the shape; medium on the addition.)*

- **System-assembled context line, uneditable, above the field:** built from facts only — `{Client name} · from {Designer given name}, {Studio name}` — with a project clause appended when one exists (`, on the {Project name}`). Never a sentence she could mistake for her own words.
- **Her words below: blank. Nothing pre-written.** The Arrival Arc's rejection of the "editable template intro" applies here without modification — a prefilled draft she could leave untouched and send is worse than no field at all.
- **The addition:** unlike the Match Ceremony, an add-a-client action can carry *zero* shared context — sometimes just a typed email address, no project, no prior conversation. Arrival Arc's context line was rich because the payload was rich (a scan, a budget band, a style). Here it can be threadbare. So the email needs a **standing system sentence** underneath the context line that fires only when her note is empty — one plain line of "why," e.g. *"{Designer} works with {Studio}, an interior-design studio."* — so the homeowner never gets a bare, wordless letter just because the designer moved fast. When she writes something, her words replace that sentence; they never sit alongside it as a second, redundant "why."

## 3. Required or optional?

**Optional. Cap 280, matching the handoff-note precedent (`organization_members.handoff_note`, L8).** *(High confidence on optional; medium on 280 vs. a shorter cap.)* 280 is generous enough for a real sentence, short enough to keep this a note and not a second proposal message.

**Send button:** sends regardless of whether the note is empty. An empty note is not a blocked send — it's a send that falls back to the standing sentence in §2. I disagree, here, with importing Arrival Arc's "gate on non-empty words" wholesale: that gate protects a once-per-relationship ceremony creating a Document; this is a frequent, often-batch action ("add three clients before the site visit"). Requiring prose on every add is exactly the "workload doubles" tax the studio can't absorb (see §8).

**Placeholder:** must read as an *example*, not as boilerplate she could mistake for content. Because it's a true HTML placeholder (never a submitted value), the "template she could send as-is" risk from Arrival Arc doesn't literally apply — but a placeholder generic enough to *sound* sendable creates a different failure: she believes the field already has something in it. So the placeholder should be odd and specific, the way the handoff note's is ("Start with the Olsen lake house…"):

> *"Excited to get the Ridgefield kitchen moving with you — you'll see everything here as we go."*

A fictional, specific project name that will obviously never match her actual client makes the placeholder unmistakably a stand-in, not a draft.

## 4. The checkbox

Current: **"Send a magic-link invite to Patina"** (checked by default) — names Patina, not the relationship; "magic-link" is implementation language leaking to the designer's screen. Propose:

> ☑ **Send {Sarah} a letter from the studio**
> *They'll get an email from {Studio Name}, signed by you — not a generic Patina invite.*

Checked by default, unchanged. `{Sarah}` falls back to "them" when name is blank. This is the one string in the sheet that currently presumes Patina-branded framing of the client's first touch (flagged already in the research pass) — fixing it here is squarely in the composer's scope since it sits directly above the note field and sets her expectation for what she's about to write into.

## 5. Preview

**A minimal inline card, not a modal, not a "preview" button.** *(Medium confidence.)* As she types, a small quoted block updates live beneath the field:

> For Sarah Whitfield — from Leah Hartwell, Middle West Studio
> *"Excited to get the Ridgefield kitchen moving with you…"*

This is the composer showing her what she just wrote in context, not the finished rendered email (fonts, letterhead, colophon — that's the email-craft lens's surface). It costs nothing extra to build — it's the same context line from §2 plus the textarea's live value in a blockquote — and it answers the one question a fast-moving designer actually has: *does this read right, addressed to her, in one glance*. A full email preview modal is too heavy for a flow this brief needs to stay fast; that weight belongs, if anywhere, in the send sheet's existing "client copy check" pattern, not here.

## 6. After send

**Sheet close line**, same quiet-confirmation grammar the sheet already uses (no toast, R51/R83): *"{Name} added — a letter from {Studio} is on its way."* (mirrors today's "a magic-link invite is on its way," reframed to the studio's letter.)

**People Room row status:** plain text, two states only — **"Invited"** and **"Joined"** — no pill, no dot, no third "Opened" state. I'm deliberately not proposing an "opened" state: nothing in the research turned up open-tracking on this send path (Resend is not even wired to the live GoTrue send today), and inventing a read-receipt the system can't actually observe is exactly the truth-framing violation the Arrival Arc rules against ("it reports what happened, it does not speak in the designer's voice"). Ship the two states the system can honestly know.

**Resend in v1: yes — recommend adding it, against current behavior.** *(Medium confidence — a real gap, not a preference.)* Today a second invite attempt on an already-invited email silently no-ops (`route.ts` branch A: `invited:false, alreadyExists:true`, no email, no error surfaced). Once a note exists in this flow, that silent swallow means a designer's actual words can vanish with no signal she'll ever see. Studio-member invites already have a resend affordance (`account-studio-page.tsx`) — this brings client invites to parity, at minimum by telling her plainly when a re-send produced no email rather than pretending it worked.

## 7. Who may write, whose name signs

**Any studio member with People Room access** — no evidence in the researched code path (`useAddClient`, `add-person-sheet.tsx`) of a role gate narrower than portal membership, and narrowing it now would be a new restriction, not a preservation of one. *(High confidence.)*

**The letter signs with the name of whoever actually wrote it** — the acting studio member's own given name plus studio name, not automatically the owner's. R7's "the studio signs client mail" precedent names *the designer*, meaning the human actually present in the exchange; ghostwriting a junior's note under the owner's byline is the exact impersonation the Arrival Arc's rule 1 forbids ("the system never impersonates her hand"). *(Medium confidence — if a studio wants only owner-signed first contact for junior hires, that's a business call for whoever rules this, not a UX default; flagging it as open rather than deciding it.)*

## 8. Mobile and speed

**Target: adds nothing to the fast path, ~15–30 seconds when she chooses to write.** The note is collapsed by default everywhere except the add-person sheet's already-open state, and even there it's the last element before the submit row — she can hit "Add to roster" having never touched it. On mobile, the ClientPicker's version collapses to the single "+ Add a note" disclosure link from §1, so a phone-sized add-a-client-mid-walkthrough moment stays a two-field-and-a-checkbox action unless she deliberately opens it. What keeps it from feeling like homework: it is never required (§3), never pre-filled with something to edit (§2), and never blocks the primary act — the roster add and the letter both happen whether or not she wrote a word.

## 9. Where I disagree with the current build or prior rulings

- **The ClientPicker literally cannot host "the same composer."** A ~300px combobox row has no honest room for a labeled textarea. Treating Q1 as "identical component, identical rendering, everywhere" would either wreck that row's layout or produce a composer nobody uses on that path. The disclosure-link collapse in §1 is the fix; flagging it because a naive reading of "one composer" would get this wrong.
- **Importing Arrival Arc's hard send-gate ("non-empty words") into this flow is wrong.** That gate suits a once-per-relationship ceremony; here it would tax a routine, sometimes-batch action and directly fights the "workload doubles" constraint. Optional-with-a-fallback-sentence is the right transplant, not a literal port.
- **Branch A's silent re-invite no-op is a live defect, not a design choice** — worth fixing regardless of this feature, but this feature makes it worse: it can now discard a written note with zero signal. See §6.
- **The checkbox's "…to Patina" framing is already known-wrong** (flagged in the research pass); I'm resolving it here since it sits directly above the field this lens owns.
- **The handoff-note pattern this feature borrows most from (L8) never appears in an email** — it renders only inside the app, staff-side. The client note here is the opposite: it becomes homeowner-facing email copy, subject to escaping, length limits inside a real send, and brand-voice rules that don't apply to an internal MarginNote. Carrying the *field shape* from L8 is right; assuming its *consequences* (what happens to the text after submit) carry over too would be wrong — that's the email-craft lens's problem to own, not silently inherited from this one.
