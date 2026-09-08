# The First Letter — Envelope and Mechanics

**Lens: email craft and the envelope** (From, reply-to, subject, preheader, deliverability, rendering)

Fixture: Leah Hartwell · Middle West Studio (Madison) · Dave Okonkwo · "Van Hise kitchen and back hall"

---

## 1. From display name and address

**Recommend (c): `Middle West Studio via Patina <hello@patina.cloud>`.** Confidence: medium-high.

Reason: the envelope domain must stay `patina.cloud` for SPF/DKIM/DMARC alignment — nothing in the schema supports per-studio sending domains today (no `studios` table, no domain/DKIM columns; option (e) would need real infra this feature can't wait on). Given a fixed domain, the display name is the only lever, and that's exactly where Gmail/Apple Mail heuristics watch for spoofing: a **personal human name** in the display name next to an address that isn't that person's is the shape of CEO-fraud phishing. A **business name** in that position, disclosed with "via" (the exact pattern Gmail invented for Google Groups relays), reads as a legitimate platform-relay, not an impersonation attempt. That's why I prefer (c) over (b) "Leah Hartwell via Patina" and strongly over (d) "Leah at Middle West Studio" — (d) drops the "via" disclosure entirely and puts a personal name directly in front of a domain that isn't hers, which is the pattern spam filters are tuned to catch.

**Fallback when there's no studio** (source = `full_name`, per `studioCobrand()`'s existing rule that a solo designer is "the Patina-fronted sender, not a co-brand"): **(b) `Leah Hartwell via Patina <hello@patina.cloud>`.** There's no business name to lead with, so the person is disclosed as a relayed sender instead.

**Disagreement to flag:** the two existing invite senders — `designer-invite` (`Kody at Patina <kody@patina.cloud>`) and `workspace-member-invite` (`Patina <hello@patina.cloud>`) — use neither a business-name lead nor a "via" disclosure. I'm not asking to change those (different audience: a designer being invited already expects to hear from Patina), but this is a new pattern for this codebase and the panel should rule on it explicitly rather than let it look like an oversight.

## 2. Reply-to

**Yes — the designer's email.** Confidence: high. Four designer-facing senders already do this (`quote-request-send`, `po-send`, `trade-rfq-send`, `trade-agreement-send`); a homeowner's first letter deserves the same treatment more than any of those. `client-invite/index.ts` currently sets none.

What happens to a reply: it's an ordinary RFC 5322 reply, threaded in Leah's own mailbox (Gmail/Outlook), from Dave, with no Patina awareness, logging, or notification_log row. That's the point, not a gap — the studio owns the correspondence from message one, matching the vision line that the homeowner is engaged with her designer, not with Patina. Worth naming so no one later "fixes" it by routing replies back through `hello@patina.cloud`.

## 3. Subject and preheader

**Subject candidates:**
- A. *Leah Hartwell invited you to the Van Hise kitchen and back hall*
- B. *Middle West Studio would like to work with you on the Van Hise kitchen and back hall*
- C. *An invitation from Leah at Middle West Studio*

**Pick A.** Confidence: high. Argue no-"Patina": the subject line's only job is getting Dave to recognize a name he knows and open the email. "Patina" is a platform he's never heard of — leading with it is exactly why today's "You're invited to Patina" reads as generic and slightly spammy. This also matches an existing in-repo pattern: `trade-rfq-emails` already writes `${studio} would like your number — ${scopeTitle}`, i.e., sender + specific thing, no product name. B is a fine runner-up (studio-name lead, matches the From) but "invited you to" is warmer and shorter than "would like to work with you on."

**Preheader candidates:**
- A. *She'd like you looking at the same plan she is, whenever you're ready.*
- B. *A link to see what she's planning for the kitchen and back hall.*
- C. *Leah's set up a place for you to follow the Van Hise project.*

**Pick A.** It carries the vision line ("you and your designer are looking at the same agreed direction") without naming a feature, and it has no urgency framing ("whenever you're ready" vs. a ticking clock).

## 4. Wordmark vs. PP-1

**Ruling: yes, email is a client surface**, and the letterhead law should apply to it. Confidence: high on the "is a surface" call; medium on exact colophon wording (that's the copy lens's call, not mine).

Today's shell (`branded-email.ts`) puts the Patina wordmark first, unconditionally, and the studio co-brand row *underneath* it as a secondary byline ("Sent on behalf of…"). For a client audience that is PP-1's letterhead law inverted: Patina is the primary signature and the studio is the footnote, on the very first document a homeowner ever opens from this relationship. That's also in tension with R7 ("the studio signs client mail, not Patina") — the current header signs it Patina first.

**Recommend the middle path**, matched to the shell's existing three-state cobrand switch (just re-pointed):

- **Studio-with-logo (Middle West Studio):** header stack becomes `[tricolor bar] → [studio logo, ≤24px] Middle West Studio` — no Patina wordmark at top at all. Footer colophon (where the shell's legal band already sits) reads `Prepared by Middle West Studio · Sent through Patina` — the one Patina mention, below the fold, exactly PP-1's phrasing.
- **Studio-name-only (no logo yet):** same idea without the image — `[tricolor bar] → Middle West Studio` as a plain wordmark-weight line (Fraunces or bold sans, not the mono "Sent on behalf of" treatment, which currently reads as a caption, not a letterhead).
- **Solo designer, no studio (source = `full_name`):** there is no other identity to letterhead with, so this is the one case where **Patina stays the top wordmark** — the shell's existing "byte-identical to the plain Patina shell" fallback is correct here and shouldn't change. Footer colophon becomes `Prepared by Leah Hartwell · Sent through Patina` (person substituted for studio).

## 5. Structure, rendering, plain text, expiry, footer

**One CTA — label "See your project," positioned after the personal-note callout, before the expiry line.** Not "Accept invitation" (procedural, legal-toned) and not "Accept" alone (accepting what? — the homeowner hasn't been told what "Patina" is and doesn't need to know; she's being shown a project). Order: greeting → one-line why (who + project) → personal note (if any) → CTA → expiry line → sign-off → footer. The personal note before the CTA means the ask follows the human reason, not the reverse.

**Images-off:** the tricolor bar and CTA button are already bulletproof (colored `<td>` cells / `bgcolor`, no images) — good, keep. The one risk is the studio logo: when `studioLogoUrl` is set, always pair it with the studio-name text in the same row (the shell already does this when both are present) so an images-blocked client still shows "Middle West Studio" as text, not a blank alt box.

**Plain-text part:** `ComplianceSendOptions.text` is optional and, per the research, often omitted by existing builders. For a first-touch, no-existing-relationship send, I'd make it mandatory — a multipart message with no text alternative is a real deliverability signal, and this is the one email in the whole system where deliverability failure means losing the client relationship before it starts. See specimen below.

**Expiry, no urgency:**
- 60-minute case (today's live GoTrue path): *"This link works for the next hour."* — plain fact, no countdown language. But see §8: I don't think 60 minutes is the right number for this letter at all.
- 7-day case (the dormant `client_invitations` path): *"This link works for the next 7 days."*

**Footer:** no unsubscribe link — category is transactional (see §6), which already exempts the send from the `List-Unsubscribe` header and the rolling cap, and a one-time account-access email has nothing recurring to unsubscribe from. Keep a "not expecting this" line, tightened to drop any trace of apology: *"Weren't expecting this? You can safely ignore it."* (vs. today's "You can safely ignore this email" — fine as-is too; marginal call).

## 6. Category and compliance

**Category: `transactional`.** Confidence: high. It's a one-time, designer-initiated action tied to a specific click ("send invite"), not a recurring operational status update — and transactional is the only category exempt from both the per-user send cap and the `List-Unsubscribe` header, which is right for an email whose non-delivery blocks the whole relationship from starting.

**Idempotency:** key on the invitation token (or a dispatch id, see below) via `ComplianceSendOptions.idempotencyKey` → Resend's `Idempotency-Key` header, so a double-click of "Send invite" or a retried edge-function invocation can't produce two different-looking letters in Dave's inbox.

**What must be snapshotted at send time**, mirroring 00388's `proposal_send_dispatches` pattern (write-once provider request bytes, immutable render snapshot separate from mutable source rows): `designer_id`, `client/recipient email + name`, `project_id` **and** `project_name` (projects get renamed), `personal_message` text, `studio_name` + `studio_logo_url` as resolved *at send time* (organizations can be renamed or re-logo'd later), `designer_given_name`/`sender_name`, the exact rendered `subject`/`preview`, the `from` and `reply_to` actually used, the expiry timestamp, and the full provider request body. Without this, "what did she actually see" becomes unanswerable the moment a studio renames itself — which today's `client-invite` function (reading `resolve_studio_identity` live, with no snapshot table) cannot answer.

## 7. Specimen copy

**Subject:** Leah Hartwell invited you to the Van Hise kitchen and back hall
**Preheader:** She'd like you looking at the same plan she is, whenever you're ready.

**Header stack (studio-with-logo):**
```
[ 4px verd / brass / rust bar ]
[Middle West Studio logo, 24px]  Middle West Studio
```

**Body (HTML, rendered):**

> Hi Dave,
>
> Leah Hartwell, at Middle West Studio, has started your kitchen and back hall project — a place to see the plan as it comes together and know what's next, whenever you check in.
>
> *"Excited to get you looking at the same board I am — see you Thursday. — Leah"*
>
> **[ See your project ]**
>
> This link works for the next 7 days.
>
> — Leah, Middle West Studio
> Madison
>
> Weren't expecting this? You can safely ignore it.

Body word count (greeting through the pre-callout paragraph, the only free-prose part): 34 words — well under the 120-word cap.

**Footer colophon:** Prepared by Middle West Studio · Sent through Patina

**Plain-text version:**
```
Hi Dave,

Leah Hartwell, at Middle West Studio, has started your kitchen and back
hall project — a place to see the plan as it comes together and know
what's next, whenever you check in.

"Excited to get you looking at the same board I am — see you Thursday.
— Leah"

See your project: https://client.patina.cloud/auth/invite/{token}

This link works for the next 7 days.

— Leah, Middle West Studio
Madison

Weren't expecting this? You can safely ignore it.

Prepared by Middle West Studio · Sent through Patina
```

**Solo-designer header (no studio, fallback case):** header stack reverts to the plain Patina wordmark at top (no cobrand row); sign-off drops to `— Leah` / `Madison` (no second name on the sign-off line); footer colophon becomes `Prepared by Leah Hartwell · Sent through Patina`.

## 8. What I think is wrong in the current shell / prior rulings

1. **Header ordering inverts PP-1 for client mail once email is ruled a client surface** — Patina wordmark leads, studio co-brand trails, on a designer-with-studio letter. See §4 for the fix.
2. **The live 60-minute expiry is wrong for a first-touch invite.** This is a homeowner with no account, no context, and no existing habit of checking this inbox for Patina mail — 60 minutes manufactures a rush she never asked for and will frequently be missed (dinner, a meeting, a kid). The dormant path's 7-day window is the right model and should be adopted wholesale, not just its copy.
3. **`client-invite/index.ts` bypasses `sendCompliantEmail` entirely** (direct `fetch` to Resend) — no suppression check, no `notification_log` row, no idempotency key. This is the single highest-stakes send in the system for a new relationship, and it currently has the least delivery visibility and audit trail of any sender in the codebase. It should route through the chokepoint at minimum, and ideally get a 00388-style dispatch-guard outbox (immutable snapshot + claim/lease + idempotency key) rather than a plain compliant send.
4. **No reply-to on the existing `client-invite` function**, despite four other designer-facing senders already establishing the pattern. See §2.
5. **Subject lines on both the live and dormant paths center "Patina"** ("You're invited to Patina," "`${senderName}` invited you to Patina") rather than the sender-and-project pattern already used elsewhere in the codebase (`trade-rfq-emails`). See §3.
6. Minor: no plain-text part is guaranteed for this letter today; worth making mandatory given the stakes (§5).
