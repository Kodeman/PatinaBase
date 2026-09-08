# The First Letter — panel lens 1

**Lens: the homeowner's first touch** — a person reading a cold email from a sender she does not know.

Fixture used throughout: designer **Leah Hartwell**, studio **Middle West Studio** (Madison), homeowner **Dave Okonkwo**, project **"Van Hise kitchen and back hall."**

---

## 1. The first three seconds

**Ranking, by what closes the "why am I getting this" gap fastest:**

1. **From display name** (high) — this is read before anything else and it is the only field she can't be argued out of trusting or distrusting. A stranger's name plus "Patina" (unknown to her) is worse than a stranger's name alone, because it adds a second unfamiliar noun to explain. Recommend the visible From name read **`Leah Hartwell, Middle West Studio`** — the human first, the studio second, no product name in the From field at all. Address stays `hello@patina.cloud` (only the *display name* is configurable per-send with today's infra — see Q6), but **Reply-To must be Leah's real address**, matching the precedent already used for quote/PO/RFQ sends.
2. **Subject** (high) — must name a person and a real place, not a product. Recommend: **`Leah Hartwell invited you to the Van Hise kitchen and back hall`**. Reject `"{name} invited you to Patina"` (the dormant function's current subject) — "Patina" is not yet a noun Dave has any reason to trust or want; the project is the only proper noun in this email he'll recognize as real, because it's about his own house.
3. **Preheader** (medium) — its job is not to repeat the subject, it's to answer "what happens if I open this": **`Read the plans for the kitchen and back hall, and talk with Leah directly.`** Concrete, doable, no ask.
4. **First line of the body** (medium, but only reachable after open — technically outside "the glance") — restate the who/what once more for anyone who skimmed past subject/preheader: **`Dave — Leah Hartwell added you to the Van Hise kitchen and back hall.`** Redundancy here is not waste; it's insurance against three different rendering paths (Gmail snippet pull, Outlook preview pane truncation, mobile notification banner) each showing a different subset of the first three fields.

*Confidence: high on the ranking and the fixture patterns; medium on the exact From-name format, since Resend/Supabase constraints on per-studio display names are a systems question (lens 6), not mine.*

## 2. Spam and phishing heuristics

**What reads as legitimate to a homeowner with no context:** a name she can trace to a real interaction (her contractor mentioned "Leah"), a specific project she recognizes as hers, one plain link with no tracking-parameter soup or shortener, a reply address that would actually reach a person if she typed "who is this?" into it, and internal consistency — the name in the From field matches the name in the subject matches the name signing the letter.

**What reads as phishing:** invented urgency, a countdown, generic "here's our product" language with no specific fact about her, a mismatch between who supposedly sent it and who signs it, vague CTA verbs ("Accept," "Verify," "Confirm your account"), and multiple unfamiliar proper nouns competing for trust in one email (a studio she's never heard of, invited by a person she's never heard of, on behalf of a product she's never heard of — three strangers vouching for each other).

**Grading the current GoTrue invite email** (subject *"You're invited to Patina"*, body *"You've been invited to join Patina — a workshop for interior designers, their clients, and the makers they trust… This invitation expires in 60 minutes"*):

- **Fails** on named sender — no human, no studio anywhere in the letter.
- **Fails** on specificity — the body is pure product pitch, the exact shape of a marketing/phishing email a security-conscious reader is trained to distrust.
- **Fails badly** on urgency — "expires in 60 minutes" on a person's *first-ever* contact with an unfamiliar brand is close to a textbook phishing tell (real invitations from people you know don't have artificial expiries; scams do). This is the single worst line in the current copy for this lens.
- **Passes** on having exactly one link and a "safely ignore" footer line — both good, keep.
- **Overall: fails the recipient.** Grade F for a cold first touch, despite presumably passing SPF/DKIM (which Dave has no way to check anyway).

**Grading the dormant `client-invite` email** (subject *"{senderName} invited you to Patina"*, body *"Hi, {designerName} would like to collaborate with you on Patina"* + optional personal-message callout + project line + `Accept invitation` CTA + "expires in 7 days" + studio sign-off):

- **Passes** on named sender (subject and sign-off both carry a real name), specific project line, softer 7-day expiry (true and unhurried, not a countdown), and — when a designer writes one — a genuine personal message, which is the single strongest legitimacy signal available (nobody phishing you writes "here's everything we talked about on Tuesday").
- **Fails** on reply-to — research confirms this function does not set `replyTo`, so the "real reply address" heuristic is unmet even though the infrastructure for it already exists elsewhere in the codebase.
- **Partially fails** on CTA label — "Accept invitation" is generic-invite-template language, indistinguishable from a hundred real phishing kits. A concrete label naming the actual content reads as more human and is harder to template-clone.
- **Grade: C+/B-.** Meaningfully better than the live path, with two cheap fixes available.

## 3. What earns the open, what earns the click, what happens after

**Open** is earned by Q1's pattern: a recognizable name plus a specific real place. **Click** is earned by the preheader/first-line telling her plainly what she gets and that it costs her nothing — no purchase, no form, no "let's set up your account." The one thing she should be able to do immediately after clicking is **see what Leah is showing her** — the project, the plans, the note — landing already inside the view, not staring at a signup wall first.

What she should **not** have to do: set a password, understand "an account" as a concept, or install anything. This is a real tension with the current dormant path — flagged as a disagreement in Q6.

*Confidence: high. This is the load-bearing recommendation of the whole lens — everything else is in service of "see it first, sign in almost invisibly."*

## 4. The footer, for someone who didn't expect this

She needs to be able to close the tab and never think about it again, with two facts and zero apology: who this was from, and that nothing happens without her. Recommended footer line, no wordmark, small type:

> *If you weren't expecting this, you can ignore it — Middle West Studio won't write again unless you visit the link above.*

Reject anything defensive ("We apologize for any confusion," "If you believe this was sent in error, contact support") — apology reads as guilt the recipient didn't ask for, and "contact support" is corporate-legal language that undercuts the person-to-person tone the rest of the letter is built on. *Confidence: high — this directly extends the existing R16/blacklist "no apologetic copy" ruling, which was written for reminder emails but applies with equal force here.*

## 5. Continuity after the click

The landing page's headline must use the **exact same name(s)** as the email — same studio, same designer, same project — and should re-render any personal note verbatim (the dormant landing page already does this for `personal_message` as a blockquote; keep it). *Confidence: high that this matters; flagged in Q6 that it is currently broken.*

## 6. Where I disagree with the current design or prior rulings

- **The live GoTrue path is the wrong transport for a first touch, full stop.** It cannot carry a name, a project, or a note, and its 60-minute expiry actively damages trust on a cold send. This isn't a copy tweak; the wiring needs to point at the branded sender. *(High confidence; outside my lens to solve, but it's the single fact from research that most needs surfacing.)*
- **The dormant landing page does not call `resolve_studio_identity`** — it falls back to `profiles.full_name`, so the email can say "Middle West Studio" while the landing page says "Leah Kochaver." That breaks the continuity this lens calls for in Q5 and should be fixed regardless of which other proposal ships. *(High confidence, is a bug not a design choice.)*
- **`AcceptInviteForm` requires setting a password before Dave sees anything.** I disagree with this for a cold first-touch invite specifically — it puts an "account" concept and a form between the click and the thing that earned the click. Recommend she can view read-only content pre-password, with account creation deferred to the point she wants to do something that needs it (reply, decide, revisit later). I recognize this may be in tension with R73's "signing stays in the client portal" — I'm flagging the trade-off, not overriding it.
- **The CTA label "Accept invitation."** I'd drop it in favor of naming the destination plainly (e.g., "Open the project"). "Accept" is invite-template boilerplate and is one of the cheaper phishing tells to remove.
- **Whether PP-1's colophon law extends to the email itself is marked unruled in research — I'd rule it yes.** A prominent Patina wordmark at the top of a stranger's first letter reintroduces exactly the "unfamiliar brand vouching for another unfamiliar brand" problem described in Q2. The email should follow the same law as the client pages it leads to: studio-authored, Patina named once, small, at the bottom.
