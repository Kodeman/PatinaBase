# The First Letter — panel lens: continuity and arrival

**Lens.** The note and the "why" must travel from inbox to page without a seam, and the designer must know what happened on the other end. I read every recommendation below against one test: does the story the homeowner was told in the subject line still hold true three clicks later, and does it survive her closing the tab and coming back on Tuesday.

Fixture used throughout: Leah Hartwell (Middle West Studio, Madison) invites Dave Okonkwo to "Van Hise kitchen and back hall."

---

## 1. The landing

**Recommendation: B (passwordless callback straight to the Threshold), as the default for every invite that carries a project — not A. Confidence: high.**

Reason: A password step between "here is why you're here" and "here is the house" is a second gate the vision explicitly refuses (S4 — homeowner is engaged, not administered) and it is friction the shipped Threshold path has already removed for everyone else who signs in by magic link or OTP. Making the *first* touch harder than every touch after it is backwards. The note doesn't need a page of its own to survive the trip — it needs a *place to land*, and one already exists: `apps/client-portal/src/components/threshold/the-note.tsx` (`TheNote`) plus `apps/client-portal/src/lib/threshold/derive.ts`'s `ThresholdNote`/`project_notes` machinery already render a designer-authored, dated, first-person, signed note as the standing note at the top of the house, and already retire it into `Previously` when it's superseded. Nothing new has to be built to make the note visible on arrival — it has to be *seeded* at send time (§2, §6) so it is already `state='standing'` in `project_notes` by the time GoTrue redirects her to `/`.

Where the "why" appears on first visit, concretely: the Threshold's own standing-note slot (§2), not a modal, not a banner, not a new interstitial page. A separate "welcome" screen would be exactly the kind of tour/coachmark step R94 already forbids on the designer side for the identical reason — a step that exists once and is never seen again earns its own component reluctantly.

**The one place B still has a real gap, and it must close regardless of the A/B choice:** today `apps/client-portal/src/app/auth/callback/page.tsx` carries zero context — no note, no sender, nothing — and drops straight to `/`. If the invite has no project (`client_invitations.project_id` / `designer_clients` row carries none), there is no house and no `project_notes` row to seed, so B lands her on a Threshold with nothing to say. That case needs Path A's continuity (or an equivalent standing line on the doorstep) until a project exists — see the disagreement in §7.

**If A must stay** (I believe it should be kept only for the no-project case, not as the general path — see §7): two concrete defects block it from obeying the rulings as written.
- **PP-1 obedience**: `ClientAuthShell`'s current headline "Welcome to Patina." is a Patina-voiced greeting on a client surface, which is the opposite of the letterhead law even before the wordmark question is settled. It should read as the studio's own arrival line — "Leah Hartwell invited you to Van Hise kitchen and back hall." — with a colophon at the foot ("Prepared by Middle West Studio · Sent through Patina") and no Patina wordmark above it, matching the specimen already drafted and shelved in `artifacts/client-approval-experience-2026-09-03/ux/03-behavior-and-copy.md:166-172`.
- **Same sender as the email**: `apps/client-portal/src/app/auth/invite/[token]/page.tsx:75-77` resolves `profiles.full_name || business_name || 'Your designer'` directly off the `profiles` row, while the email (when the dormant sender fires) resolves through `resolve_studio_identity`/`studioDisplayName()`. Those two can diverge today — the email can say "Middle West Studio" while the landing page says "Leah Hartwell." Fix: the landing page must call the same resolver the email used, or better, read the frozen snapshot from §6 rather than re-deriving from either live source.

---

## 2. The first Threshold visit

**Recommendation: seed the invite's personal message as the project's standing note (`project_notes`, `state='standing'`), authored at send time, rendered by the existing `TheNote` component — no new UI primitive. Confidence: high.**

What it says with a note: exactly what the designer wrote, first person, dated, signed with her initial — `TheNote`'s existing contract (`the-note.tsx:41-44`, `— L.` from `initialOf`). No new copy to invent.

What it says with **no** note: nothing renders. `TheNote`'s file header is explicit and correct — "ABSENCE IS SILENCE... an empty letter is worse than no letter" — and the Doorstep's own standing sentence already carries the page on a quiet arrival. I'd resist the temptation to backfill a generic "Leah added you to Patina" note here just to have *something* first-person to show; that's a system voice wearing a designer's signature, which is exactly what R106 (Arrival Arc) and the Arc's "truth-framed, never impersonates her hand" rule forbid. If there's no personal note, the Doorstep's plain third-person sentence ("Dave, welcome to Van Hise kitchen and back hall.") is honest; a fabricated first-person one is not.

**When it appears / recedes / what remains — this is where I'd extend the existing model rather than invent a new lifecycle:**
- It appears on the very first Threshold render (the note is already `standing` before she ever opens the link — it was written at send time, not on arrival).
- It recedes the same way every other standing note already recedes in this codebase: on being superseded by the studio's next note, or explicitly retired by the designer — **not** on a visit count or a calendar (7 days), and not "after she reads one thing." A calendar-based recession is a system deciding when a letter has been read long enough, which is the same instinct the vocabulary blacklist rules out for other copy ("no invented timing"). Read state is already tracked independently by the reading mark (`usePreviousReadingMark`/`markProjectRead`) — reuse that to dim it visually once read (matching `since-yesterday.tsx`'s existing dim contract) rather than removing it.
- What remains afterward: when it *is* retired (a later note replaces it, or the designer clears it), `derive.ts:544-560` already moves a `retired` note into `previously` — so the invite note becomes, automatically and for free, the first dated entry in Dave's permanent record on this house. That answers "is it kept on the house permanently" — yes, exactly as every other standing note already is, with no special-casing for "this one came from the invite."

**One gap this surfaces**: `project_notes` is project-scoped. An invite sent with no project yet (a bare client add, no proposal, no project) has no home for the note under this mechanism. That's a real hole — flagged in §7, not solved here, because it's a data-model question for the systems lens.

---

## 3. Expiry

**Recommendation: 7-day token, not 60 minutes — and the recovery act is a fresh letter the system sends itself, truth-framed, with no designer action required. Confidence: high.**

A homeowner opening an invite email two days later is the *normal* case, not the edge case — she's not sitting at her inbox waiting on Patina. A 60-minute window (today's live GoTrue path) all but guarantees the common outcome is a lapsed link, and the dormant path's 7 days is the correct number already sitting unused in `client_invitations.expires_at`.

**Lapsed-link page copy** (never "expired" as an accusation — it isn't her fault the letter went stale):

> **Headline:** This letter's gone stale.
> **Body:** Letters like this are only good for a week, and it's been longer than that. We've sent a fresh one to dave@[email] — open that one instead.
> **Act:** [Send a fresh letter] — one tap, no form.
> *(small, beneath):* Sent by Patina, on Middle West Studio's behalf.

**Who sends it:** the system, not the studio, and it should say so plainly (per the copy above) rather than pretend the studio is standing at the mailbox. This mirrors the existing pattern where Patina *executes* mechanical resends (studio-member "Resend invite" already fires from a system button, not a fresh act of authorship by the owner) while the *content* stays studio-signed. The one-tap act reissues the same token record with a new `expires_at` and re-sends the identical frozen letter (§6) rather than regenerating it — so the note she eventually reads is the same note Leah wrote, not a system-generated stand-in. No designer action is required to unblock her — nothing about a stale link should sit in Leah's queue; it's not something Leah did wrong.

---

## 4. The designer's side after send

**Recommendation: show `sent → opened → accepted` in v1 (drop a separate "delivered" row-state and don't show "clicked" distinctly from "opened"); ship resend in v1, one-at-a-time with a cooldown. Confidence: medium-high.**

Reasoning on states: `delivered`/`opened`/`clicked` from the Resend webhook (`resend-webhook/status-map.ts`) map onto `notification_log`, but `opened`/`clicked` are explicitly *not* used to auto-upgrade status today ("Resend does not guarantee ordering") — so a v1 that tries to distinguish "opened" from "clicked" is showing Leah a distinction the plumbing itself doesn't trust yet. Three states — **sent, opened (first of opened/clicked, whichever lands), accepted** — is what the data can actually support honestly, plus a fourth *derived*, not webhook-sourced, state: **lapsed** (past `expires_at`, unaccepted) using `isInviteExpired`'s exact pattern from `apps/designer-portal/src/lib/document/invite-status.ts`. This is a straight port of an already-shipped, already-tested derivation — no new logic to invent, and Leah already has this exact vocabulary for teammate rows in `account-studio-page.tsx`.

Resend: yes, in v1, for the same continuity reason as §3 — Leah needs to know Dave never opened it and be able to do something about it without deleting and re-adding him. Guard it identically to the studio-member precedent already in production: one resend in flight at a time (`resendBlocked = resendingMemberId !== null`), a disabled button + spinner on the row that started it (`account-studio-page.tsx:1502-1512`). I'd add one thing the member-row precedent doesn't need: a cooldown (e.g., 1/hour) on top of the one-at-a-time guard, because a homeowner — unlike a hired teammate — can get a second "You've been invited" and reasonably wonder if something is wrong; a design *decision*, not just a UI lock, should stand between Leah and spamming Dave.

---

## 5. Already-has-account case

**Recommendation: yes — a shorter letter, no account step, and (this is the continuity-critical part) Dave must be told something happened at all. Confidence: high.**

Today's silent link (`route.ts` branch A — `invited:false, alreadyExists:true`, no email) is the single worst continuity break in the whole flow: Leah believes she just invited Dave, her activity log says "Invite sent," and Dave receives *nothing*. He has no idea Van Hise now shows up when he next signs in. That's not a smaller version of the invite — it's a broken one.

Specimen, matching the tone of the one letter already drafted for exactly this shape in `artifacts/client-approval-experience-2026-09-03/ux/03-behavior-and-copy.md:166-172`:

> **Subject:** Leah added you to Van Hise kitchen and back hall
> **Preheader:** It's already in your Patina account.
> **Body:** Dave — Leah added you to the Van Hise kitchen and back hall project. It's already in your account; open it below.
> **CTA:** Open the project → (straight to the project on the Threshold, no sign-in form)
> **Sign-off:** — Leah Hartwell, Middle West Studio · Madison

No password step (he has one), no "Accept invitation" verb (there's nothing to accept — he's already a Patina client), and the link should be a signed magic link straight into the house, same continuity contract as §1.

---

## 6. Snapshot

**Recommendation: freeze the sender identity and the note at send time into one immutable record, and read from that record everywhere the note is shown — not from live `profiles`/`organizations` lookups. Confidence: high.**

The precedent already exists and is explicit about the reason: `artifacts/client-approval-experience-2026-09-03/discovery/04-backend-and-notifications.md:37` — migration `00388`'s outbox pattern freezes `recipient_email, designer_name, studio_name/logo, client_portal_path` "so the edge function never re-derives content from mutable rows after the fact — the record of what the client was actually shown is frozen at send time." Apply the identical discipline here.

Concretely, at send time write one row (extending `client_invitations`, or a small sibling table) carrying:
```
personal_message TEXT
sender_given_name TEXT      -- from resolve_studio_identity at send time
studio_name TEXT
studio_logo_url TEXT
studio_city TEXT
sent_at TIMESTAMPTZ
```
and when the note is seeded into `project_notes` for the Threshold (§2), copy `personal_message` and the frozen `sender_given_name`/`studio_name` into it rather than letting `TheNote`'s `authorName` prop resolve live through `useStudioIdentity` the way it does for ordinary designer notes today (`threshold.tsx:1067`, `authorName={studioName}`).

**This is a real, checkable divergence I found, not a hypothetical:** `TheNote`'s `authorName` is live-resolved every render. If Leah renames "Middle West Studio" to something else next year, every *ordinary* standing note on every house re-signs itself with the new name automatically — that's presumably intended (one identity, always current) for day-to-day notes. But the invite note is different in kind: it is the caption on a specific, already-sent letter Dave received with a specific name on it. If the Threshold silently relabels that note with a new studio name, the "why" Dave read in his inbox is no longer the "why" printed on the page — the continuity this whole feature exists to protect breaks quietly, exactly at the one note where accuracy-to-the-original matters most. Freeze it; let ordinary post-invite notes keep resolving live.

---

## 7. Where I disagree with what's on file

1. **PP-1's silence on the email shell is a real gap, and I'd rule it in scope.** The README already flags "whether the email shell counts as a 'client surface' under PP-1 is unruled." From a continuity lens the email is the *first* client surface, and letting it stay Patina-fronted while the landing page and Threshold obey letterhead law would produce the worst possible seam: the studio's letterhead switches on *after* the homeowner has already formed an impression from an unbranded system email. I'd rule the invite email in under PP-1 explicitly, not leave it implied.

2. **A password-first landing (Path A) as the *general* path is wrong**, not just under-branded. It's friction the shipped Threshold has already decided homeowners don't need for anything else. I'd narrow A to exactly one job — carrying the note and sender identity for the no-project edge case (§2's gap) — rather than treating it as a coequal alternative to B. Building out A's branding fully (as Q1 asks) is worth doing regardless, because that edge case doesn't disappear; but it shouldn't be the front door for the common case.

3. **The silent re-invite (branch A of `route.ts`, "already exists") is a defect, not a documented behavior worth keeping as-is.** It produces a false positive on the designer's side ("Invite sent") for an action that sent nothing and told nobody. I'd treat this as a bug to close via §5's letter, not a design choice to ratify.

4. **The 60-minute GoTrue expiry contradicts the studio's own read on homeowner behavior that the dormant path already got right** (7 days, `client_invitations.expires_at`). Whoever wired the live path to the shared GoTrue 60-minute default likely didn't intend a homeowner-specific policy at all — it's the generic auth-invite default leaking onto a channel that needs its own number. Worth confirming this wasn't a deliberate security call before changing it, but nothing in the research surfaces a security reason specific to client invites.

5. **`TheNote`'s live-resolving `authorName` is fine for its original job and wrong for this one** — detailed in §6. I'm flagging it here too because it's easy to miss: nothing in the existing component is broken, but pointing this feature's note at it without freezing the byline first will produce a subtle, hard-to-notice continuity bug that only shows up months later when a studio renames itself.

6. **No home for the note when an invite carries no project.** `project_notes` — the only "standing note" mechanism the client portal has — is project-scoped. A bare client-directory add with no project attached has nowhere for Dave's "why" to live once he's inside the Threshold. This isn't mine to solve (it's a data-model question for the systems lens), but it should be surfaced as a blocking question before B is adopted as the universal default, not discovered after ship.

---

*Word count target: ≤1,200 words plus specimens — this document runs slightly over on specimens (§3, §5) by design, since the brief asked for exact copy.*
