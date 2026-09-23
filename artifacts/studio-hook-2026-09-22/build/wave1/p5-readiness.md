# P5 readiness — can the outside-house invoice trial run?

Read-only pass, 2026-09-22/23. Contract: `../../PROGRAM.md` §3 (Deploy 1 row "P5 readiness") and §8; `../../../design/completeness-critic.md` §0.1 and §1 P5.

**Method and boundaries.** Every production fact below came from Strata (`bkvcixdmuyejfzcijpdg`) through the Supabase Management API `POST /v1/projects/{ref}/database/query` with `read_only: true` and SELECT statements only. The lane was proved before use: `select current_user` returned **`supabase_read_only_user`**, so the API enforced the read-only role server-side — no production mutation was possible on this path, and none was attempted. Emails are masked to their first three characters; no key, token or full address appears here. One local statement ran against the **local** Postgres inside `begin; … rollback;` (item 3), and changed nothing.

## Verdict

**GO** — the trial can run, on Leah's seat and on Kody's `@middlewest.studio` seat, and the First Letter accept leg is **not** unverified in production as §8 assumes: it has completed **9 times**, most recently **2026-09-21 18:06 UTC**.

Nothing blocks. Four things must be carried into the trial rather than discovered during it, all detailed below:

1. **The seat that matters is `19e7ae9b` (`kod***@middlewest.studio`), not `74056c2a` (`kod***@kochaver.com`).** Signed in as `74056c2a`, drawing an invoice on a Middle West project fails — that account holds no Middle West membership at all.
2. **No invitation in production has ever carried a project** (0 of 12). The P5 letter is meant to be *about a house*, so the trial exercises a letter variant that has never been sent to a real recipient.
3. **The homeowner invite is unavoidable**, exactly as the critic said: the invoice path refuses a project without a client, and the picker only yields a client for a household that already holds a profile.
4. **The local leg of item 3 could not be run** and is not the reason for the GO — the local Postgres is 13 migrations behind this checkout and `supabase db reset` belongs to another ticket in this wave. Evidence and the exact error are under item 3.

A correction to the program's own bookkeeping, incidental to this note but load-bearing for the pause work: **`19e7ae9b`, `1a94f78f` and `86cdd0aa` are `profiles.id` values, not enrollment ids.** `sequence_enrollments` holds no row with any of those ids. The live active enrollments are `24f71966` (user `19e7ae9b`, next step **2026-09-25 15:25 UTC**), `82a64492` (user `1a94f78f`, next step **2026-09-25 16:05 UTC**) and `9ad7029e` (user `86cdd0aa`, `tes***@patina.cloud`, next step 2026-09-28 13:30 UTC).

---

## Item 1 — Kody's Middle West seat: role and role domain — **GO**

### What the rows say

Studio `7ba72774…` is **Middle West Studio** (slug `leah`, `organizations.type = 'design_studio'`, `status = 'active'`). There is no `studios` or `studio_members` table in Strata; a studio is a row in `organizations`, and membership is `organization_members`.

The three members:

| Member (masked) | `profiles.id` | `organization_members.id` | `role` | `staff_role` | `status` |
|---|---|---|---|---|---|
| `lea***@middlewest.studio` | `ce3aee90…` | `b702d3fa…` | `owner` | *(null)* | active |
| `kod***@middlewest.studio` | **`19e7ae9b…`** | `c4d9370b…` | `admin` | `studio_manager` | active |
| `ash***@middlewest.studio` | `1a94f78f…` | `85f526de…` | `member` | `designer` | active |

Role **domains** come from `user_roles` → `roles.domain`, which is what the gates read:

| Seat | Roles held (`roles.name` / `roles.domain`) | designer-domain roles |
|---|---|---|
| `19e7ae9b` — Kody, Middle West | `studio_admin`/**designer**, `studio_designer`/**designer**, `super_admin`/admin, `app_user`/consumer | **2** |
| `ce3aee90` — Leah | `studio_admin`/**designer**, `studio_owner`/**designer**, `super_admin`/admin, `app_user`/consumer | **2** |
| `1a94f78f` — Ashley | `studio_designer`/**designer**, `app_user`/consumer | 1 |
| `74056c2a` — Kody, `@kochaver.com` | `studio_owner`/**designer**, `studio_admin`/**designer**, `super_admin`/admin, `app_user`/consumer | 2 |

So Kody's Middle West seat is **`admin` / `studio_manager` at the membership level, with role domain `designer`** (two designer-domain roles). `member_role` is an enum of `owner, admin, member, guest`; `admin` is not `guest`, which is the only value the gates exclude.

### What the gates require

**`open_project_direct` (00331:~408).** `v_designer uuid := auth.uid()` and the INSERT writes `designer_id = v_designer, created_by = v_designer`. Whoever clicks *Open the project* becomes the project's lead designer. The function is `SECURITY DEFINER` and `GRANT EXECUTE … TO authenticated` (00331:501) — it checks only that a user is authenticated, a title is present, and the budget band is sane. **It performs no role check.** `p_client_id` defaults to NULL, so a project may be opened with no household.

Note the INSERT column list omits `studio_id`. The `set_project_studio_id` BEFORE INSERT trigger (00317, regrafted at 00511:3066) fills it from `_primary_studio_for(NEW.designer_id)` (00315:64-79) — the lead designer's primary `design_studio`, owner-role first then earliest joined. Each seat above has exactly **one** active `design_studio` membership, so this resolves unambiguously: `19e7ae9b`, `ce3aee90` and `1a94f78f` all resolve to Middle West `7ba72774…`; `74056c2a` resolves to **Middle Studio `bb1d4d5a…`** (slug `kody`), a different studio.

**`create_draft_invoice` (00511:~3392) — the draw.** Admission requires all of: the caller's active role is `authenticated`; the project is `status='active'` with the expected designer/client/studio tuple; `studio.type='design_studio'` and `studio.status='active'`; **the actor** holds an `organization_members` row in the project's studio with `status='active'` and `role <> 'guest'`; **the project's `designer_id`** holds the same; and **the project's `designer_id`** holds a `user_roles` → `roles` row with **`role.domain = 'designer'`**. Any miss raises `insufficient_privilege` as `invoice project not found or access denied`.

**`issue_invoice` (00578:~2250) — the issue.** Same shape: the actor may be the client, the project's designer, or any active non-guest member of the project's studio; and the project's `designer_id` must again hold a `roles.domain = 'designer'` row (`FOR SHARE OF user_role`, `IF NOT FOUND THEN RAISE`).

### Verdict against those gates

| Who opens the project | Draw (00511) | Issue (00578) | Why |
|---|---|---|---|
| `19e7ae9b` Kody @middlewest | **passes** | **passes** | active `admin` membership in `7ba72774…`; `studio_admin` + `studio_designer` are designer-domain; studio is an active `design_studio`; trigger stamps Middle West |
| `ce3aee90` Leah | **passes** | **passes** | active `owner`; `studio_owner` + `studio_admin` designer-domain |
| `1a94f78f` Ashley | **passes** | **passes** | active `member` (not guest); `studio_designer` designer-domain |
| `74056c2a` Kody @kochaver | **fails** | **fails** | holds designer-domain roles, but **no `organization_members` row in `7ba72774…`** — both the actor-membership and lead-membership joins find nothing. Its primary studio is Middle Studio, so a project it opens is stamped to the wrong studio |

**No change is needed for the trial**, provided the seat used is `19e7ae9b`. The smallest reversible change if Kody must act as `74056c2a` (recommendation only — **not made**, and it is a production mutation requiring its own explicit ask) would be a single row: `insert into organization_members (user_id, organization_id, role, status) values ('74056c2a-…','7ba72774-…','admin','active')`, reversible by deleting that one row. It is **not recommended**: it adds a second Kody identity to Leah's studio, muddies the founder-seat attribution snapshot that P1 depends on, and the `19e7ae9b` seat already satisfies every gate.

One attribution consequence worth carrying into the observation, since no code enforces it: because `open_project_direct` stamps `designer_id = auth.uid()`, **whoever opens the house owns the invoice as lead designer**. If Kody opens it, the trial's invoice reads as Kody's, and "she did it herself" is not demonstrated. `issue_invoice` would still let Leah issue it, so the distortion is silent. **Leah should click *Open the project*.**

---

## Item 2 — household → client picker: an invitation must precede the bill — **GO (confirmed)**

The critic's §0.1 finding holds exactly. Traced end to end:

**A project can be opened with no household.** `apps/designer-portal/src/components/document/overlays/open-project-sheet.tsx:46` holds `clientId` as `useState<string | null>(null)`; the `ClientPicker` is wired at `:135-136`; and the submit button at `:196` is disabled on `!title.trim() || !dateValid` — **`clientId` is not in that condition**. The RPC agrees: `open_project_direct(p_client_id uuid default null)` (00331:397).

**The picker yields a `client_id` only for a household that already holds a profile.** `apps/designer-portal/src/components/portal/client-picker.tsx:341` computes `const linkable = !!dc.client_id;` and `:345` `const invitable = !linkable && !!dc.client_email;`. The row is disabled outright when neither holds (`:360`, `disabled={!linkable && !invitable}`). In `onSelect` (`:363-374`) the only branch that selects is the linkable one — `onChange(dc.client_id)` — while an invitable row merely **arms** (`setArmedInviteId(dc.id)`), which the comment at `:95-99` states is deliberate ("J2 — selecting an invitable row only ARMS it; sending the invite (a real send) is a separate act"). The prop doc at `:18` fixes the type: the value is "a `profiles.id` (`designer_clients.client_id`)". A household with neither a profile nor an email is, per `:56`, "non-selectable either way".

**The link is created by an invitation, not by the picker.** Sending runs `handleInviteAndLink` (`client-picker.tsx:223-251`) → `useInviteAndLinkClient` (`packages/supabase/src/hooks/use-clients.ts:727`), which POSTs `/api/clients/invite` with `invite: true` (`:758-769`) and returns `{ designerClientId, profileId, invited, alreadyExists }` (`:781-786`). The `profileId` it mints is what later makes the row linkable.

**The invoice path refuses a project without a client.** `packages/supabase/src/hooks/use-invoices.ts` loads `id, designer_id, client_id, studio_id` for the project and throws at **`:773`** — `'Invoice project is missing its canonical billing tuple'` — whenever `!project.designer_id || !project.client_id || !project.studio_id` (`:768-772`); `:775` additionally rejects a `clientId` that disagrees with the project's. The composer feeds it `clientId: selectedProject?.client_id ?? null` (`apps/designer-portal/src/components/document/accounts/invoice-composer.tsx:419`).

**The studio-invoice variant refuses the same way.** `apps/designer-portal/src/lib/document/invoice-composer.ts:302-309`, `canDraftStudioInvoice`, requires `Boolean(draft.clientId) && title && Boolean(draft.studioId) && lines.length > 0`; the composer disables the draw button on `!canDraft` (`invoice-composer.tsx:951`). So even the no-project billing route needs a linked household.

**And the database is the backstop.** `create_draft_invoice` (00511:~3380) matches on `project.client_id = p_expected_client_id`; with a NULL client that comparison is never true and the RPC raises `insufficient_privilege`, independent of the client.

**Conclusion.** To bill a house outside Patina, Leah must invite that homeowner to Patina first. There is no path from a captured household to a drawn invoice that skips the invitation — in the UI, in the hook, or in the RPC. This is a designed consent gate, not a gap, but it means the trial's first act toward her client is an email.

---

## Item 3 — First Letter accept leg

### 3a. Local end-to-end walk — **NOT RUN (blocked), and not relied on**

The walk could not be run truthfully, for a reason that is itself worth recording.

The local Postgres is **13 migrations behind this checkout**: local head is `00641` (594 applied rows plus `20260910152111`), while this worktree and Strata both carry **`00654`** (606 applied rows in Strata). Four of the missing migrations touch `client_invitations` — `00650`, `00651`, `00652`, and `00654_client_letter_phone_status` — and `00654` is precisely the client-letter path.

The consequence is concrete rather than theoretical. This checkout's `supabase/functions/client-invite/index.ts:502-533` inserts a snapshot row whose payload includes **`phone`** (`:510`). The local table has no such column. Confirmed against the local database, inside a transaction that was rolled back:

```
BEGIN
ERROR:  column "phone" of relation "client_invitations" does not exist
LINE 1: ...ert into public.client_invitations (token, email, phone, des...
ROLLBACK
```

Local `client_invitations` columns end at `writer_id`; Strata's continue to `phone`. So an invite sent locally from this checkout fails deterministically at the snapshot insert. Any screenshot of that failure would document a stale local schema, not the readiness of P5 — a false NO-GO.

Bringing local to head needs `supabase db reset`, which **this ticket does not own**: the local Postgres is shared across sessions, and the reset for this wave belongs to another ticket, which announces its own window. I did not run one, and I did not hand-apply `00642`–`00654` either, since that would move shared schema under another ticket mid-flight.

Two further preconditions were absent and are recorded for whoever runs this later: **no `supabase_edge_runtime_supabase` container is running** (the `supabase_*` stack, `patina-redis`, `patina-minio` and `patina-mailhog` are up, but nothing serves `supabase/functions`), and neither portal was listening (3000 and 3002 both closed).

One premise in the ticket should also be corrected before anyone retries: **the letter can never appear in Mailhog.** `client-invite` sends through `sendCompliantEmail` → Resend over HTTPS (`supabase/functions/_shared/send-email.ts`), never SMTP, so the local SMTP catcher cannot hold it; the repo's own spec says so at `apps/designer-portal/e2e/people/add-client-letter.spec.ts:16-27`. The accept URL for a local walk has to come from the `client_invitations.token` snapshot row (or from `EMAIL_DEV_MODE=dry_run`, `send-email.ts:260-262`, which skips the provider while still rendering and still writing the row). Mailpit earns exactly one assertion there: **zero** messages for the address, proving the `generateLink` leg did not also send.

`artifacts/studio-hook-2026-09-22/build/wave1/shots/` is therefore **empty**. No screenshot was taken, and none was invented.

### 3b. Has any accept ever succeeded in production? — **YES. GO**

This is the question §8 rests on, and the data answers it directly. `client_invitations` in Strata holds **12 rows, all `kind = 'invite'`, of which 9 have a non-null `accepted_at`.**

The five most recent by `sent_at` (emails masked, `accepted_by` truncated):

| Invited | sent_at (UTC) | expires_at | accepted_at | accepted_by | resends | email log |
|---|---|---|---|---|---|---|
| `tka***` | 2026-09-18 17:24 | 2026-09-25 17:24 | **2026-09-21 18:06** | `caea8cc0…` | 1 | `sent` |
| `nic***` | 2026-09-14 20:06 | 2026-09-21 20:06 | **2026-09-14 20:11** | `1c8f6245…` | 0 | `sent` |
| `j.e***` | 2026-09-10 02:39 | 2026-09-17 02:39 | NULL | NULL | 0 | `sent` |
| `mat***` | 2026-09-09 23:13 | 2026-09-16 23:13 | NULL | NULL | 0 | `sent` |
| `gmb***` | 2026-09-09 23:09 | 2026-09-16 23:09 | **2026-09-10 12:52** | `082db6eb…` | 0 | `sent` |

`accepted_at` alone could in principle be written without the rest of the leg landing, so the five most recent accepts were checked through to their consequences. Every one of them: the `accepted_by` user **has a profile** (`profiles.role = 'homeowner'`), holds exactly **one** `designer_clients` row, and that row is **the same `designer_client_id` the invitation named**. The accept leg does not merely stamp a timestamp — it mints the account and completes the designer↔client link, in production, repeatedly.

The three unaccepted rows are all **expired unopened** (`revoked_at` and `superseded_by` both NULL, `expires_at` already past), i.e. recipients who did not click. That is not a product failure, and 9/12 is a plausible click rate for a cold first touch.

Both functions on the path are deployed and current:

| Function | Version | Status | `verify_jwt` | Last deployed (UTC) |
|---|---|---|---|---|
| `client-invite` | **48** | ACTIVE | true | 2026-09-20 00:08:36 |
| `invoice-send` | **49** | ACTIVE | true | 2026-09-16 17:29:44 |

Strata's migration head is **`00654`**, identical to this checkout — so the deployed schema is the one this branch reasons about.

The invoice letter also demonstrably reaches clients. `notification_log` carries `invoice_*` rows in `delivered` and `sent` states, most recently **2026-09-22 15:30 UTC** (`invoice_check_intent` delivered ×6 / sent ×4; `invoice_overdue` delivered ×12; `invoice_reminder` sent ×16 with `ref_type='invoice'`; `invoice_paid` delivered ×3). The invoice rail is not cold.

### 3c. The part that is genuinely first-time — carry this into the trial

**No invitation in production has ever carried a project: `project_id` is NULL on all 12 rows, and `project_name` is NULL on every accepted one.** Every letter sent so far rendered the projectless subject *"Leah set up a page for your work together."*

P5's letter is about a house, so it takes the other branch of `letterSubject` (`supabase/functions/_shared/client-letter.ts:185-197`) — *"{who} invited you to the {project}"* — and the other branch of `standingSentence` (`:216-231`), *"{who} added you to the {project} on {date}. The page below holds the studio's record of the job — the plans, the papers, and the numbers."* The CTA label also flips from *Open the page* to **Open the project** (`:245-247`). This variant has unit coverage but has never been rendered to a real recipient, and `invite → accept` with a `project_id` set has never run in production.

Two smaller first-times on the same path: **Middle West has exactly one project today** (`studio_id = 7ba72774…`, count = 1), and it already carries a client, a designer and `status='active'` — so it is billable as it stands. The trial's outside house will be project **#2**, and the first Middle West project ever opened through the invite-then-bill sequence. There are **zero** Middle West projects with a NULL client and zero with a NULL `studio_id`, so no pre-existing half-linked house is waiting to confuse the walk.

---

## Item 4 — consent and notice surfaces the homeowner sees — **GO, and not among P2a's three templates**

### Are the client-facing emails among the three templates P2a is editing?

**No.** P2a's three are `designer-invite`, `milestone-first-payment`, `onboarding-aesthete`. All three are **designer**-facing: the first two and the third are seeded as designer-onboarding sequence templates (`00292_designer_onboarding_enrollment.sql:174` maps the `payment_received` engagement event to `milestone-first-payment`), and none is on the homeowner path.

The homeowner sees two letters, and **neither is a `packages/email` template at all**:

- the **invite letter**, rendered by `supabase/functions/_shared/client-letter.ts` (`renderClientLetter`) and sent by `supabase/functions/client-invite`;
- the **invoice letter**, rendered by `supabase/functions/_shared/invoice-emails.ts` and sent by `supabase/functions/invoice-send`.

So P2a's copy work and these two letters do not intersect. Whatever P2a lands, these two need their own reading — which is what follows.

### Does either still mention the Pledge or commission?

**No.** Case-insensitive grep for `pledge|commission` across `supabase/functions/client-invite/index.ts`, `client-invite/lib.ts`, `invoice-send/index.ts`, `_shared/client-letter.ts` and `_shared/invoice-emails.ts` returns **zero matches**. (A looser pattern including `share` and `margin` is not usable as a gate here — it hits `margin:0` in the letters' inline CSS. `pledge|commission` is the load-bearing one.) For contrast the same grep over P2a's three templates hits four times: `designer-invite.tsx:35`, `milestone-first-payment.tsx:13` (preview text) and `:22`, `onboarding-aesthete.tsx:32` — all variants of *"a quarter of our commission goes back to the designers who teach the…"*. **The Pledge is confined to the designer-facing side; it is not in front of Leah's homeowner.**

### The invite letter, as the homeowner reads it

Subject, with a project (the P5 branch, `client-letter.ts:185-197`):

> **{Designer} invited you to the {Project}**

degrading to *"{Studio} added you to the {Project}"*, then *"You've been added to the {Project}"*. Without a project (every letter sent so far): *"{Designer} set up a page for your work together."* The subject never names Patina and never names the client.

Preheader (`:200-207`): **"Where {Studio} keeps the record of your job."**

Standing sentence (`:216-231`):

> **{Designer} of {Studio} added you to the {Project} on {date}. The page below holds the studio's record of the job — the plans, the papers, and the numbers.**

Call to action (`:244-247`): **"Open the project"** (or *"Open the page"* with no project).

Expiry line (`:330-334`): **"The link works until {date}; {sender} can send another."**

Letterhead (`:260-292`): the studio's logo and name, the signature city and the long date, and right-aligned **"Prepared for {Recipient}"**.

Colophon, the whole consent and provenance disclosure (`:293-318`):

> **Prepared by {Studio} · Sent through Patina**
> **Sent to {recipient email} at the request of {Studio}.**
> **If this isn't for you, nothing happens — ignore it and the link lapses on its own.**
> **Button not working? Paste this link into your browser: {url}**

Sign-off (`:253-258`): `{Designer full name} · {Studio} · {City}`, each segment dropped if absent rather than left as a stranded separator.

Read as a homeowner: it says who sent it, on whose behalf, what the page is for, that ignoring it costs nothing, and when the link dies. It makes no claim about Patina's business model, asks for no payment, and names no fee. **It is clean for the trial.**

### The invoice letter, as the homeowner reads it

Subject (`invoice-emails.ts:185`):

> **{Designer} sent you invoice {number} for {Project}**

Body (`:186-205`), eyebrow **"Invoice"**, audience `client`, co-branded with the studio's name and logo:

> Hi {Client},
> **{Designer} has sent you an invoice for {Project}.**
> *(the designer's optional personal line, when written)*
> **Invoice:** {number}
> **Amount due:** {formatted total}
> *Payment is due by {date}.*
> *Pay by bank transfer to keep fees lowest — card payments add a processing fee.*

Button: **"View invoice"**. Reply-to is set to the designer's own address (`invoice-send/index.ts:357`) — "a question about an invoice belongs with the designer who sent it". It is logged as `notificationType: 'invoice_sent'`, `templateId: 'invoice-sent'`, `category: 'operational'`, `ref: {type:'invoice'}` (`:361-366`).

**One thing to flag, not to fix.** The fee sentence — *"Pay by bank transfer to keep fees lowest — card payments add a processing fee"* — is the only money-mechanics claim the homeowner sees, and it names no figure by design (`:200-203`: "a stale number in an email would lie"). It is a surcharge disclosure, not commission copy, so it is outside P2a's remit. But it is the one sentence in the trial that tells Leah's client Patina charges for something, and Leah will not have seen it before she sends. **Show her both rendered letters at the sit-down before she sends either.** Filed here; not changed.

---

## What was not verified

- **The local invite→accept→invoice walk** (item 3a) — blocked on the 13-migration local lag and a `supabase db reset` this ticket does not own. `shots/` is empty. Re-run needs, in order: a reset to `00654`, the edge-runtime container serving *this* checkout's `supabase/functions` (verify the bind mount first), portals on 3000 and 3002, and the accept URL taken from `client_invitations.token` rather than from Mailhog.
- **Live flag state for `client-invite-letter` and `studio-invoice`** — the critic asks for a live read of both before the visit (§6 item 6). Both are read through PostHog (`useFeatureFlag`, e.g. `client-picker.tsx:111-112`), PostHog OAuth is deferred for this program, and flags are fail-closed. Not readable from the Strata read lane; **still owed before the trial.**
- **The project-bearing letter variant against a real recipient** (item 3c) — unexercised in production; the trial is its first run.
- Whether `19e7ae9b`'s `staff_role = 'studio_manager'` carries any product meaning beyond display. The three gates read `organization_members.role` and `roles.domain` only; `staff_role` appears in neither. If some surface elsewhere keys off `staff_role`, that was out of scope here.
