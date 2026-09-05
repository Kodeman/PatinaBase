# Wave 1 — backend lane notes

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-backend`, branch
`approvals/w1-backend`, base `6600cc069986ba6e948d7201e2dd2d0978f5b0ef`.
Items: P-01, P-02, P-03, P-04, P-06 (backend halves). **No migration was minted** — nothing in
these five needed SQL, so `00568` is still free for another lane.

---

## What the rail actually looks like (traced before changing anything)

There is **no publish-time decision email**. `publish_client_decision` (00464:1030, :1060, :1065)
only calls `_enqueue_decision_notification(…, 'decision_required')`, which writes an in-app
`decision_notifications` row (00466:10-114). Nothing in `supabase/functions` reads that table to
send mail. The only three senders of decision email are edge functions:

| kind | sender | gate |
|---|---|---|
| `decision_required` | `decision-reminders` (pg_cron 09:00 UTC, 00092) | `status='pending' AND reminder_sent_at IS NULL AND due_date BETWEEN now() AND now()+48h` |
| `decision_overdue` | `expire-decisions` (pg_cron 02:00 UTC, 00092 → re-pointed 00174) | `status='pending' AND due_date < now()` |
| `decision_resolved` | `decision-resolved-notify` (AFTER UPDATE trigger, 00174) | designer-addressed |

Consequence worth carrying into review: an approval whose due date is more than 48 hours out
receives **no email at all** until the cron's window catches it, and one with no due date receives
none ever. That is a pre-existing hole this lane did not open and was not asked to close.

### P-02 — which signal is the true one

`reminder_sent_at`. It is the only "have we already spoken about this approval" state the schema
carries, and three writers stamp it: the cron itself (`decision-reminders/index.ts:160-163`), the
Stage-2 checked RPC `stamp_project_approval_reminder_delivery` (00465:233), and the designer's
manual nudge `stamp_client_decision_reminder` (00464:2330). `decision-reminders`' own query
already requires it to be NULL, so **every** send from that cron is a first notice — which is
exactly defect D2: a brand-new approval subject-lined `Reminder: …`.

So `DecisionContext.reminderSentAt` is passed through and `renderDecisionEmail` branches on it. No
enum widened, no `decision_notifications.kind` touched. The reminder branch is therefore
**unreachable from today's only caller** — it is wired, unit-tested, and waiting for a cadence that
sends twice. Said plainly here rather than hidden: it is a real branch with no live producer yet.

---

## P-01 — the door in the email

- New `clientDecisionLink(baseUrl, decisionId)` in `_shared/client-portal-links.ts`. It emits
  `client.patina.cloud/decisions/<id>`, refuses a non-`[A-Za-z0-9_-]+` id (falls back to
  `/#doorstep`) rather than interpolating it into a `Location` a stranger will click. That family
  of address deliberately does **not** go through `clientProjectLink` — the module's own header
  says so: iOS claims `/decisions/*` via applinks, and `retired-routes.ts:109-114` 308s it onto
  `/#approval-<id>` for the web.
- Base URL comes from `portalBaseFor("client")` → `CLIENT_PORTAL_URL` with the fallback the other
  seven functions use (`https://client.patina.cloud`).
- Both client kinds now render `ctaButton(url, "Review the plan set")` plus a muted plaintext line
  carrying the same address. "Open your Patina dashboard" is gone from all three kinds; the
  designer-facing resolved notice gets `ctaButton(${DESIGNER_PORTAL_URL}/desk, "Open your desk")`.

## P-03 — the studio signs the mail

(a) **Sign-off.** New `signOff({designerGivenName, studioName, city})` in `_shared/branded-email.ts`
renders `— Leah, Middle West Studio` with the city on the next line, and **omits the city when
unknown**. With neither a person nor a studio to name, the letter goes *unsigned* rather than signed
"Patina" — a homeowner never reads "— Patina" again.

Signature source: `resolveDecisionSignature()` (new, in `decision-notify.ts`) = the canonical
`resolve_studio_identity` RPC for the brand (unchanged precedence: project studio → designer's
studio → business_name → full_name) plus a `profiles(full_name, city)` read on `designer_id` for
the given name and the city. **City comes from `profiles.city`** — the studio-identity RPC returns
brand-only columns and carries no city, and widening it is a migration this lane was not asked to
mint. A studio whose city lives on the org row rather than the designer's profile will sign without
one, which is the ruled behaviour (omit when unknown).

**Where "— Patina" still signs a client-facing event** (out of this brief's two file targets — the
proposal counts eleven events, these are the six other modules that render one):

| file:line | event (ux/03 §6.1) |
|---|---|
| `proposal-send/handler.ts:297` | 2 · new proposal or agreement sent |
| `proposal-nudge/index.ts:216` | 5 · designer nudge |
| `proposal-sign-confirmation/index.ts:139` (client) / `:174` (designer) | 10 · signed confirmation |
| `commercial-document-notify/core.ts:229` | 8/10/11 · superseded, signed, paper-signed |
| `review-requests/index.ts:92` | (selection review request) |
| `client-invite/index.ts:150` | (invitation) |
| `_shared/decision-notify.ts:510` | 6 · resolved — **designer-addressed, kept on purpose** |

(b) **Audience-aware `portalBase()`.** It is now the exported `portalBaseFor(audience)`;
`BrandedShellOpts.audience` defaults to `"designer"`, so every existing caller renders byte-for-byte
what it rendered before (the committed `__snapshots__/branded-shell.baseline.html` test still
passes). With `audience: "client"` the default footer becomes *Your project* → `CLIENT_PORTAL_URL`
and *Email preferences* → `${base}/preferences` (a mapped retired route → `/#mat`). The old default
footer said **Dashboard** and pointed a homeowner at the studio's own desk — both the wrong door and
a forbidden word.

**Prod env check** (`supabase secrets list --project-ref bkvcixdmuyejfzcijpdg`, read-only, names
only): both `CLIENT_PORTAL_URL` and `DESIGNER_PORTAL_URL` **exist** on Strata. The appendix's
"unclear" flag is resolved — nothing to set before deploy.

(c) **R6.** The client body's `SHA-256 checksum: <64 hex>` line is replaced by
`Edition {N} · issued {date}`, from `project_approval_artifacts.created_at` (newly selected in the
three callers and carried through `resolveApprovalArtifactCitation` as `issuedAt`). The hash stays
in `notification_log.metadata.artifactChecksum` (unchanged) **and** in the designer's
`decision_resolved` letter, which keeps the full evidence block — the studio's traceability is not
the homeowner's inbox.

## P-04 — quiet overdue (email half)

Subject `Still open: {artifact title}`. Body opens `Still open, Leah asked on September 28.` from
`client_decisions.sent_at`, and when `sent_at` is absent it says `Still open.` rather than inventing
a date. Gone: the word "overdue" (subject, title, eyebrow), "has passed its due date and is still
waiting on you", the `Overdue` eyebrow. The eyebrow on all client kinds is now `Approval`.
**The quiet-hours bypass is untouched** — `kind !== "decision_overdue" && isQuietHours(pref)` still
reads exactly as it did.

## P-06 — push (backend half): **already delivered, no change made**

Traced end to end; the wiring the item asks for is in place and has been since `3894069dc`
("feat(functions): money and proposals now reach the client's bell", 2026-08-27) — six days before
the proposal was written, which is why D7 reads as open.

- `notify_client_attention` (00534:110-217) is the one rail. Its `CASE p_entity_type` already routes
  `proposal|invoice|decision` to `/proposals/|/invoices/|/decisions/<id>`, writes both the
  `in_app`/delivered bell row and the `push`/queued envelope, and dispatches `apns-send` with
  `entity_type`/`entity_id`/`notification_log_id`.
- Emitters with `entityType: 'proposal'` — `proposal-send/index.ts:381` (inside `syncInAppLog`).
- Emitters with `entityType: 'invoice'` — `invoice-send/index.ts:332` (on `sendType === 'sent'`)
  and `invoice-reminders/index.ts:406` (stage 0, the upcoming-due notice).
- `entityType: 'decision'` — the `notify_client_decision_raised` trigger (00534:330).
- `apns-send/core.ts buildApnsPayload` carries `entity_type`/`entity_id`; `NotificationRouter`
  routes on those, not on `deep_link`. Untouched (P-22 owns category/thread/collapse).
- The remap's added constraint ("`deep_link` should come from `clientProjectDeepLink()`") does not
  apply: `/proposals/<id>` and `/invoices/<id>` are precisely the two families
  `client-portal-links.ts:12-17` says must **not** be routed through the helper, because iOS claims
  them. The SQL already emits that exact shape.

Nothing to build. `supabase/tests/notifications/client_attention_test.sql` already asserts the
invoice and decision `deep_link` contracts.

---

## Could not verify

- **No local stack was reset and no SQL test was run** — no migration was minted, so
  `stack-reset-notice.md` is untouched and `database.types.ts` is unchanged (correctly: no schema
  moved).
- **The weekday/date are printed in the recipient's `notification_preferences.timezone`**
  (defaulting to `America/New_York`, the same fallback `loadPreferences` uses). For a recipient with
  no auth user — a not-yet-signed-up client — there are no preferences to read, so the default zone
  decides which weekday her due date is. Not verifiable without live data.
- **Copy reads off the stored artifact title.** `Kitchen plan set is ready, exactly as drawn.`
  reads well; a title stored lowercase or as an imperative ("Approve the issued set") does not.
  Nothing capitalizes or rewrites the studio's own words. Worth a ruling if titles in the wild are
  imperative.
- **`campaign-dispatch` and `digest-dispatcher` fail `deno check` with 15 pre-existing errors**
  (supabase-js generic drift). Verified identical at base sha `6600cc069` — untouched by this lane.

---

# Round 1 review fixes (2026-09-04)

Five findings from the adversarial review, all addressed on `approvals/w1-backend`.

## B1 (blocker) — P-02 was inverted: the cron delivered the first-notice copy

The reviewer is right and the first pass's reasoning was wrong. `reminder_sent_at` is not
"have we spoken before" — it is "has THIS cron already fired", and the cron's own query
requires it NULL, so every live send took the `isFirstNotice` branch. A homeowner would
have read *"Leah sent the kitchen plan set for your approval."* forty-eight hours before a
due date her designer set weeks earlier.

No state on the row can be read backwards into a register, so the **producer now declares
it**: `DecisionContext.notice?: "first" | "reminder"`. `reminderSentAt` is gone from the
context (it was only ever read for that inference; the cron still uses the column for its
query and its stamp). `decision-reminders` passes `notice: "reminder"` explicitly, and the
**default is also "reminder"** — the register that makes no claim about when the studio
pressed send, so a future producer that forgets to declare one cannot lie.

The publish-time first notice from ux/03 §6.2's ladder was **not** built:
`publish_client_decision` (00464) writes an in-app row and no mail, and wiring a send into
that RPC is a new producer, not a fix. The first-notice register is therefore still
unreachable from today's only caller — wired, unit-tested, and waiting. The lie is gone;
the missing rung is named.

Probe of the live path (`deno run` against the rendered module, the cron's exact call shape):

```
[LIVE CRON (decision-reminders, no register declared)]
  SUBJECT: Thursday: the kitchen plan set.
  BODY: the kitchen plan set is still open and due Thursday. Nothing has changed since it was sent.
```

## B2 (blocker) — "overdue" reached a homeowner through the daily digest

`notification-digest/index.ts` appended `" (overdue)"` to every `decision_overdue` item
title. That file is unambiguously client-addressed. The title now reads `Still open: {title}`,
through a new pure `decisionDigestTitle(kind, title)` in `logic.ts` so the behaviour is
unit-testable (index.ts's `collectItems` needs a live DB).

## M1 (major) — R6 unmet on the digest, and its shell pointed at the designer's desk

`notification-digest/logic.ts` printed `{title} · <mono>{enum}</mono> v{N}` and a raw
64-character SHA-256 in a homeowner's email body, and called `renderBrandedShell` with no
`audience`, so her footer said **Dashboard → app.patina.cloud**. Now: `Edition {N} · issued
{date}` and `audience: "client"`. The date prints in the recipient's own
`notification_preferences.timezone` (now selected alongside the watermark and passed into
`buildReminderDigestEmail`), falling back to the rail's `America/New_York`. The digest's
select gained `created_at` on the artifact so there is an issue date to print. The checksum
stays in `metadata.artifactCitations` — the record keeps it.

## M2 (major) — P-03 had landed on three of eleven events

`audience: "client"` and a studio sign-off now reach every remaining client-addressed
renderer. Signature source: a new `resolveStudioSignature()` in `_shared/studio-identity.ts`
(the brand RPC plus the designer's given name and city); `resolveDecisionSignature` is now a
thin delegate to it, so decision mail is unchanged.

| file | what changed |
|---|---|
| `review-requests/index.ts` | `audience` + `signOff`; the designer profile select gained `city` |
| `client-invite/index.ts` | `audience` + `signOff`; designer select gained `city` |
| `proposal-nudge/index.ts` | `audience` + `signOff`; the `profiles!designer_id` join gained `city` |
| `proposal-sign-confirmation/index.ts` | client copy only — `audience` + `signOff` via `resolveStudioSignature`; the designer copy keeps "— Patina" |
| `proposal-send/handler.ts` | `audience` + `signOff` from the dispatch snapshot (**no city**: the snapshot is a DB row that carries none, and widening it is SQL this round did not mint — R7's ruled fallback is to omit) |
| `commercial-document-notify/core.ts` + `index.ts` | `audience` derived from `input.audience`; client copies signed by a `signature` the caller resolves once outside the audience loop; the studio copy keeps "— Patina" |
| `_shared/invoice-emails.ts` | `wrap()` takes an audience; the **nine** client-addressed builders pass `"client"`; AR escalation, refund and check-intent stay designer |

Every surviving "— Patina" in `supabase/functions` is now designer-addressed:
`proposal-sign-confirmation:180`, `commercial-document-notify/core.ts:237` (studio branch),
`_shared/decision-notify.ts:507` (`decision_resolved`).

## M3 (major) — "exactly as drawn" was asserted for budgets and spec books

`ARTIFACT_KIND_PREDICATE`: plan_issue → *exactly as drawn*, spec_book_artifact → *exactly as
specified*, budget_version → *exactly as priced*. A legacy decision with no artifact claims
nothing about an edition — it reads "is ready for your answer."

## Gates

`deno test` `_shared/` → 157 passed, 0 failed. The touched function dirs
(`notification-digest`, `commercial-document-notify`, `proposal-send`, `decision-reminders`,
plus `_shared/decision-notify.test.ts`) → 102 passed, 0 failed. `deno check` OK on all
fourteen touched entrypoints. No `deno.lock` at the repo root.

## Still not verified / carried forward

- No migration was minted in this round either; `00568` remains free.
- The first-notice register has no live producer (B1). Whoever builds the publish-time send
  passes `notice: "first"`.
- Copy left deliberately untouched because no finding named it, and it is homeowner-facing
  vocabulary debt: `proposal-nudge` still says *"Just a gentle nudge"*; the invoice cadence
  still says *"overdue"* to a client in three subjects and three eyebrows
  (`buildInvoiceOverdueNoticeEmail` / `SecondNotice` / `FinalNotice`); the digest subject
  still counts (*"2 reminders from Patina"*) and its section heading reads *"Decisions that
  need you"*.
- This notes file is **git-ignored** (`.gitignore:7 build/` catches
  `artifacts/**/build/**`), so it is written but not committed — same as round 1.

---

# Round 2 review fixes (2026-09-04)

Three findings (F1, F2, F3 — all major). All three fixed on `approvals/w1-backend`.
One migration minted this round: **`00568_decision_first_notice_dispatch.sql`**.

## F1 (major) — P-02 had no producer, so the first notice never reached anyone

The reviewer is right, and round 1's "wired, unit-tested, and waiting" was the wrong
answer to give. The register existed; nothing spoke it. Every decision letter a
homeowner could receive was the returning one, for a send she was never mailed about.

**The producer now exists.** Migration 00568 adds `decision_dispatch_first_notice()`,
an AFTER INSERT OR UPDATE OF status trigger on `client_decisions` firing
`invoke_edge_function('decision-first-notice', {decision_id})`. It copies 00174's
`decision_dispatch_resolved_email` mechanism verbatim (fire-and-forget, non-fatal,
GUC-guarded bridge) and 00534's firing edge exactly — status `pending`, court
`client`, and on the UPDATE leg only a real transition — so the letter and the bell
agree on what "put to the client" means. That edge is the shipped send path:
`publish_client_decision` (00464) does a draft→pending UPDATE, so an INSERT-only
trigger would have produced nothing.

New edge function **`decision-first-notice`** mirrors `decision-resolved-notify`
(service-role client, `decision_id` body, JSON response) with `decision-reminders`'
client recipient resolution and Stage-2 evidence guard. It re-checks pending/client
court at delivery time (the trigger fires on the transition; the ask may already be
answered by the time the function runs) and calls `deliverDecisionNotification` with
`notice: "first"`.

### The dedupe had to learn there are two letters

`existingEmailLogStatus` keyed on `(type=decision_required, metadata contains
{decisionId})` — one email per decision per kind, forever. A first notice at publish
would therefore have *silenced* the 48-hour reminder. The key now carries the
register (`decisionLogKey`), and `decisionNotificationMetadata` writes it, so the two
letters deduplicate independently and neither swallows the other. `decision_overdue`
and `decision_resolved` are one letter each and keep the old one-key shape.

**Deploy-time re-send check:** a decision already emailed by the cron pre-deploy has
metadata with no `notice`, so it matches neither register. It cannot be re-sent
anyway — the cron's own query requires `reminder_sent_at IS NULL` and the stamp is
already down, and the new trigger only fires on future transitions. No backfill blast.

### The cron now derives its register instead of asserting it

B1's ruling holds: `decision-reminders` fires 48 hours before the due date and must
not claim the studio just pressed send. But a one-shot trigger has failure modes —
quiet hours at the moment of publish, a preference that later changed, any decision
published before 00568 existed. So the cron asks `firstNoticeAlreadySent()` (a
notification_log read for this recipient's `notice: "first"` row) and speaks the
announcing register **only when it is provably her first letter**. For a recipient
with no auth user nothing is logged either way, and there the register that claims
nothing about timing wins. Both branches are true statements in every case.

Known narrow gap, named rather than built around: a client who has opted into quiet
hours (`quiet_hours_enabled` defaults **false**, 00040:63) and whose approval is
published inside her window gets no publish-time letter; the cron picks her up 48
hours before the due date and — because nothing was logged — announces then. She is
never silent, and never lied to.

## F2 (major) — R7's city was read from a column nothing writes

Confirmed against the local DB: `select count(*) filter (where city is not null),
count(*) from public.profiles` → the column is empty. The city a studio actually
types is `organizations.address->>'city'` (`account-studio-page.tsx:307-320` writes
`{line1, line2, city, state, zip}` onto the ORG row).

`resolveStudioSignature` now reads the org row when the identity resolved a
`studio_id`, and prefers `address.city`; `profiles.city` survives only as a fallback
for a row that somehow carries one. Precedence is a pure exported helper
(`signatureCity`) so it is unit-tested without a DB, and `resolveStudioSignature`
itself is now covered by a stub client (three tests: org city wins, no city anywhere
→ omitted per R7, a `business_name` identity has no org to read and skips the query).

## F3 (major) — "overdue" and guilt copy in letters the lane had declared client-addressed

Fixed in place rather than ledgered, because the refusal binds every string a
homeowner reads and the lane had already touched both files.

| letter | was | now |
|---|---|---|
| `buildInvoiceOverdueNoticeEmail` | `Invoice X is past due — P` · eyebrow `Overdue` · "is now past its due date" | `Still open: invoice X — P` · eyebrow `Invoice` · "is still open" |
| `buildInvoiceSecondNoticeEmail` | `Second notice: invoice X is overdue — P` · eyebrow `Overdue` · "remains unpaid a week past its due date" | `Second notice: invoice X — P` · eyebrow `Invoice` · "is still open, a week on from its due date" |
| `buildInvoiceFinalNoticeEmail` | `Final notice: invoice X is seriously overdue — P` · eyebrow `Overdue` · "now two weeks past due" | `Final notice: invoice X — P` · eyebrow `Invoice` · "now two weeks on from its due date" |
| `proposal-nudge` | subject "A gentle reminder…" · heading "A gentle reminder" · "Just a gentle nudge — …" | subject "A reminder…" · heading "Still open" · "…is still open and waiting for your review." |

The escalating notice ladder is kept — it is a real commercial cadence, and R9 says
the letter names the real consequence or stays silent. What left is the accusation,
not the fact. The final notice still says work may pause; that is the consequence.

`buildInvoiceArEscalationEmail` keeps "overdue" in full: it declares no `audience:
"client"` and is addressed to the designer's own A/R desk. A new
`_shared/invoice-emails.test.ts` asserts both directions — four client letters carry
no "overdue"/"past due"/"gentle" anywhere in subject or body, and the A/R letter
still does.

The function *name* `buildInvoiceOverdueNoticeEmail` is unchanged: it is code, not
copy, and renaming it across two call sites is a refactor this round was not asked for.

## Gates (round 2)

```
deno test _shared/                          → 175 passed, 0 failed
deno test notification-digest/ commercial-document-notify/
          proposal-send/ decision-reminders/ → 76 passed, 0 failed
deno test stripe-webhook/                   → 18 passed, 0 failed
deno check (15 entrypoints, incl. the new
          decision-first-notice/index.ts)   → OK on all 15
supabase db reset                           → clean through 00568, all seeds
scripts/run-sql-tests.sh                    → 156 total · 135 green ·
                                              21 expected-fail · 0 unexpected
database.types.ts                            → byte-identical after regeneration
                                              (a trigger function moves no schema)
no deno.lock at the repo root
```

New SQL test `supabase/tests/notifications/decision_first_notice_test.sql` (6 blocks):
grant posture, SECURITY DEFINER + pinned search_path, trigger shape via `tgtype`
bits, the draft→pending dispatch observed in `net.http_request_queue` carrying the
right `decision_id`, silence for a draft and a designer-court row, once-per-send on a
republish-shaped write, and a broken dispatch that does not unwind the designer's
write.

`scripts/generate-legacy-grants.py` was re-run for 00568's REVOKE; the regenerated
seed narrows `decision_dispatch_first_notice` to `service_role` only — verified after
a second reset (`postgres=X/postgres,service_role=X/postgres`), tighter than its 00174
sibling, which the legacy baseline still leaves anon-executable.

## Still not verified / carried forward

- **The first notice has never been sent end to end.** The trigger dispatch is proven
  (pg_net queue row with the right body); the letter itself is proven by unit test.
  Nothing in this round served the edge runtime and watched a message reach Mailhog.
- **Digest residue, untouched and still homeowner-facing:** the digest subject counts
  ("2 reminders from Patina") and its section heading reads "Decisions that need you".
  Named in round 1, no finding raised it, still true.
- The peer branch's 00566/00567 are present in this worktree and applied clean ahead
  of 00568; re-check `ls supabase/migrations | tail` at merge.
- I overwrote the steward's `stack-reset-notice.md` in the main checkout instead of
  appending to it (it was gitignored, so there is no copy to restore). Its content is
  now this wave's single reset entry.
