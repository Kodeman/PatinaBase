# Trade-side compliance upload door: build spec

Kody ruled PR-a on 2026-09-11: BUILD the trade-side compliance upload door in P3 (`docs/vision/VISION-DECISIONS.md` V10, `rulings.md` PR-a, `direction.md` §9). Five of six construction seats asked for the same object (AM-1, AM-8, AM-10, AM-13, AM-15); the panel leaned to park it, Kody overruled. This spec exists because the panel never designed it. It answers the "one ruling, one object" version: one upload door, on the field link, writing unverified paper to the company card.

## 1. Who uses it and from where

| Actor | Reaches the door from | Login | Scope |
|---|---|---|---|
| The firm's paperwork contact (E4.is_paperwork_contact, e.g. Rosa Delgado for Twin Cities Drywall & Plaster) | A "Paperwork" section on the same field link page their firm's engagement already sends them (`apps/client-portal/src/app/field/[token]`) | None | One studio, one company card. The token cannot reach any other firm, any other studio, or any person card |
| Any other holder of the same field link (a crew member, a site contact) | Sees the field link's existing work items; does not see the Paperwork section unless the RPC marks them the paperwork contact | None | n/a |
| The studio member who confirms or rejects | Signed in, on the company card | Supabase Auth session | Studio-scoped by `is_active_studio_member(organization_id)`, same as every other write on the card |

The field link (`resolve_field_link`, 00283) is minted per `project_parties` seat (a person on a project), not per company. A firm's paperwork contact may hold a seat on more than one active project for the same studio; whichever seat's field link they open, the Paperwork section resolves to the same company card, because the section reads by `company_id`, not by `party_id`. A seat with `is_paperwork_contact = false` sees no Paperwork section, even on the same firm's field link.

## 2. Token

A new table, not a repurposed `field_link_tokens` row. `field_link_tokens` is keyed to `(party_id, project_id)`: one person, one job. This door is keyed to `(organization_id, company_id)`: one firm's paper, independent of which project or which seat opened it. Same hash-at-rest shape as 00283 and the same regenerate-on-mint discipline.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | `gen_random_uuid()` |
| `organization_id` | uuid, fk `organizations` (or the studio's org table) | The studio |
| `company_id` | uuid, fk `studio_contacts(id)` | The firm's company card. `CHECK` that the referenced row is `company_kind`, not a person |
| `token_hash` | text, unique | `sha256(raw token)` as hex, following 00283. The raw token is returned once, by the mint RPC, and never stored |
| `status` | text, `CHECK IN ('active','revoked')` | Default `active` |
| `expires_at` | timestamptz | See lifetime below |
| `last_used_at` | timestamptz | Bumped on every resolve |
| `created_by` | uuid, fk `auth.users` | The studio member who minted it |
| `created_at` / `updated_at` | timestamptz | Standard |

Table name: `paperwork_link_tokens`.

**Lifetime.** PR-d retired the fixed 90-day field-link clock in favor of the engagement window; this door follows the same rule rather than reinventing one. `expires_at` is set at mint to the latest `on_site_to` across the firm's currently active `project_parties` rows at this studio (mirroring `create_field_link`'s repoint to the engagement window, not `now() + interval`), extendable to the firm's `warranty_until` at the minting studio member's choice, per PR-l. Renews on use, same as a field link (§5.3 of `direction.md`). A firm with no currently active engagement (bidding only, or between jobs) has no engagement window to borrow from; §10 flags this as a case a builder cannot resolve alone.

**Single company scope.** `company_id` is a hard column, not a claim inside a JWT or a query parameter the page trusts. Every read and write path (`resolve_paperwork_link`, the upload edge function) re-derives `company_id` from the token row itself.

**Revoke path.** Surfaces on the company card's Access grants row for this token (§5.1 `direction.md`: "Company variant: ... Access grants lists firm-scoped tokens only"), same two-step inline confirm with an optional reason used for every other grant (§5.3), never a modal. Revoke sets `status = 'revoked'`; it does not delete the row (audit, §7 below).

**Rate limit.** Reuse the shape of `qr_auth_rate_limits` (00427): a per-IP bucket table updated atomically under a `BEFORE INSERT` trigger, one rolling window, no count-then-insert race. Name it `paperwork_link_rate_limits` (same columns: `ip_address inet primary key`, `window_started_at`, `attempt_count`, `updated_at`). Applies to both the page's token-resolve call and the upload edge function; a resolve and an upload from the same IP share one bucket so a script cannot split volume across the two calls to dodge the limit.

## 3. The page

**Route.** The task that named this spec proposed `/paperwork/[token]` in the designer portal beside `/field/[token]`. That guess does not match the codebase. `/field/[token]` lives in `apps/client-portal`, not the designer portal. It is one of an established family of bearer-token guest routes documented in `apps/client-portal/src/app/trade/[token]/page.tsx`'s header comment (`/share`, `/field`, `/rfq`, `/evidence`, `/plans`, `/pay`, `/trade`). The correct placement is `apps/client-portal/src/app/paperwork/[token]`, an eighth guest prefix in that same family, not a designer-portal route.

The page itself follows the proven pattern those seven already share: `force-dynamic`, a service-role client, one RPC read, 404 on any non-answerable state (garbage token, revoked, expired), so a dead link never confirms it once existed. Same posture `trade/[token]/page.tsx` documents for its own resolve.

| Region | Content |
|---|---|
| Header | Studio name, firm name, "Paperwork" |
| Documents table | One row per compliance document type the firm owes this studio (COI, W-9, licence, and any other `doc_type` on file or expected), each carrying the paper word from §3.8 of `direction.md`: Current, Lapses in 30 days, Lapsed, Not on file |
| What it blocks | The row's `blocks[]` printed in words beside a lapsed or not-on-file row, e.g. "Blocks site access, payment, draw", same wording the company card's R3 Paper region already uses |
| What is owed | A row with no current document and a `doc_type` the studio expects reads "Not on file", with the upload form open by default |
| Upload form | Per document type: file, number, issuer, issued_on, expires_on |
| Signed-waiver case | Upload only. The page never presents an e-signature flow here. A signed waiver already carries wet or e-signatures from whatever process produced it; this door records the resulting document, it does not create the signature. `project_lien_waivers` (E11, CRM-9) is a separate table owned by the money book, not this one; a waiver uploaded here lands as a compliance document on the company card, informational to the studio's paper record, and does not itself satisfy a draw's waiver requirement in the money book. §10 flags the reconciliation between the two as a decision for whoever owns the money book build |

Copy is written in the studio's voice, addressed to the firm, with no caveat and no hedge:

| Slot | Copy |
|---|---|
| Header | "Paperwork for {studio name}" |
| Row, current | "{Doc type}, current." |
| Row, lapsing | "{Doc type}, lapses {date}." |
| Row, lapsed | "{Doc type}, lapsed {date}. Blocks {blocks in words}." |
| Row, not on file | "{Doc type} is not on file." |
| Row, awaiting check (R-BU) | "{Doc type}, not yet checked." followed by the receipt sentence below. `current` is reserved for paper a studio member has confirmed, so the firm's page and `compliance_state` say the same thing about the same paper |
| Row, refused (W4 r7 M-4) | "{Doc type} was not accepted." followed by the studio's own reason, verbatim, as its own sentence. The refusal reaches the firm here or nowhere: the chase is an agent draft that lands `awaiting_review`, and Agent OS forbids automated external sends. The reject act already tells the studio member "the firm reads this" |
| Upload button | "Add {doc type}" |
| After upload | "Received. {Studio name} will confirm it." |

No sentence tells the firm what happens if they do not upload. The block itself, printed in the row, is the whole notice.

## 4. Storage

`project-documents` is not reused. Its `storage.objects` RLS policies cast `(storage.foldername(name))[1])::uuid` (00170, patched in 00430), and prod already carries a non-uuid first segment (`fulfillment/po/PO-2026-00001-A.pdf`) that raises `22P02` on any authenticated scan of the bucket. A new bucket avoids inheriting that trap and keeps the fix scoped.

| Setting | Value |
|---|---|
| Bucket | `compliance-documents`, private |
| Key scheme | `{organization_id}/{company_id}/{document_id}/{filename}`. Every path segment a policy might cast to uuid is a real uuid; `filename` is the only free segment, at the end, never first |
| `file_size_limit` | 15 MB per file, matching the evidence-upload posture (`fulfillment-evidence`) rather than `project-documents`' 50 MB, since compliance paper is a scanned document, not project media |
| `allowed_mime_types` | `application/pdf`, `image/jpeg`, `image/png` |
| Virus / malware scanning | None exists anywhere in Patina today (no ClamAV or equivalent found in `supabase/` or `apps/`); this door adds none. The size cap, mime allowlist, and the fact that every uploaded document lands unverified until a studio member opens and confirms it are the only safeguards, consistent with, not weaker than, every other upload path in the codebase |

## 5. Write path

Edge function: **`paperwork-upload`**, `verify_jwt = false` in `config.toml`, following the `sms-inbound` / `comms-mute` shape named in the brief (the credential is checked inside the function body, not by the gateway) and the closer sibling `fulfillment-evidence` (public, browser-called, anon key, token-gated in-code, CORS wired in the function).

1. Browser posts `multipart/form-data` (token, doc_type, number, issuer, issued_on, expires_on, file) directly to the function with the anon key, no session, matching `evidence-uploader.tsx`'s pattern exactly (`Content-Type` left to the browser so the multipart boundary is set correctly).
2. The function hashes the incoming token, looks up `paperwork_link_tokens` by `token_hash`, and rejects (generic error, no detail) unless `status = 'active'` and `expires_at > now()`.
3. On a valid token, it uploads the file to `compliance-documents` at the key above, then calls a `SECURITY DEFINER` RPC, `record_inbound_compliance_document(p_token, p_doc_type, p_number, p_issuer, p_issued_on, p_expires_on, p_file_path)`, which re-verifies the token server-side (defense in depth, the same "the token IS the authority" discipline `fulfillment-evidence` documents) and inserts into `studio_compliance_documents`:
   - `holder_type = 'company'`, `holder_id = company_id` (from the token row, never from client input)
   - `source = 'field_link'`
   - `is_inbound = true`
   - `verified_by = NULL`, `verified_at = NULL`
   - `superseded_by = NULL`
4. **Never overwrites a verified document.** If a currently verified document of the same `doc_type` already exists for this holder, the new upload inserts as a new, separate row; it does not touch the verified row. The two coexist (one verified and active, one pending) until a studio member acts.
5. **Supersedes on confirm, not on upload.** When a studio member confirms the pending row (§6), that RPC sets `verified_by` / `verified_at` on the new row and writes the new row's id into the previously-verified row's `superseded_by` column. The old row is never deleted; it becomes historical, readable, and excluded from "current" by the presence of `superseded_by`.
6. `last_used_at` on the token row is bumped on every successful upload, same as a field link resolve.

## 6. Studio side

The company card's R3 Paper region (`direction.md` §3.3) gains an inbound queue band, printed above the existing document table, only when at least one pending row exists for this holder:

| State | Copy |
|---|---|
| Band header | "{N} document{s} waiting for your check" |
| Per pending row | "{Doc type}, uploaded {date} by {firm name}." with two acts: Confirm, Reject |

**Confirm.** Sets `verified_by = auth.uid()`, `verified_at = now()` on the pending row, and, if a currently-verified document of the same `doc_type` exists, sets that older row's `superseded_by` to the new row's id (§5, step 5). The confirmed row becomes the one the Paper region's table reads as current.

**Reject.** Records a reason (free text, kept with the row, see §8 for the columns this adds) and enqueues a chase to the firm's paperwork contact through the existing `enqueue_agent_task` RPC, landing `awaiting_review`, matching the "Chase the renewal" act already specified for the company card (CS4-8, AM-8) rather than inventing a second drafting path. The rejected row itself is not deleted; it stays as a record of what was tried and refused.

**Notification.** Extend `notification_log` (00041) rather than add a new table. Its `channel` enum already carries `'in_app'`, and its free-text `type` column already takes a new value per feature the way `'client_feedback'` (00267) and `'design_request_submitted'`-family types do. New type: `compliance_document_inbound`, `channel = 'in_app'`, read the same way every other in-app notice is (`use-inbox.ts`). §10 flags who the recipient `user_id` should be, see below.

## 7. Consent and audit

| Fact | Where it lives |
|---|---|
| Who minted the link, when | `paperwork_link_tokens.created_by`, `created_at` |
| Who used the link, when | `paperwork_link_tokens.last_used_at` (last use only; every use is also visible as a `studio_compliance_documents` row's `created_at`, since every upload is itself a dated record) |
| What was uploaded, from which token | `studio_compliance_documents.source = 'field_link'` plus the row's own `created_at`; the token itself is not stored on the document row (it is single-use-context, not a durable foreign key), but the upload can only occur through a valid token, so the document row's existence is itself the evidence of a valid token event |
| Who confirmed or rejected, when | `studio_compliance_documents.verified_by` / `verified_at`; a new `rejected_by` / `rejected_at` / `rejection_reason` for the reject path (§8) |
| Revocation | `paperwork_link_tokens.status = 'revoked'`, row kept, reason recorded on the same reasoned-revoke pattern as every other grant (§5.3 `direction.md`) |

**Retention.** No document row is ever deleted by this door. A superseded or rejected row stays queryable, which is the existing pattern for compliance paper (`crm-model.md` line 310: "documents of the absorbed firm keep their original holder id and are marked superseded, never deleted"). Token rows are kept indefinitely as an audit trail of who had a live door and when, matching `field_link_tokens`' own retention (revoked rows are not purged there either).

## 8. Data changes

| Table | New / extend | Columns | RLS | Cost band |
|---|---|---|---|---|
| `paperwork_link_tokens` | New | `id, organization_id, company_id, token_hash, status, expires_at, last_used_at, created_by, created_at, updated_at` | Designer/studio-member-of-org write and read (`is_active_studio_member(organization_id)`, mirroring `field_link_tokens`'s designer-of-project shape); no anon/client policy | S |
| `paperwork_link_rate_limits` | New | `ip_address, window_started_at, attempt_count, updated_at` | Service role only, no authenticated or anon grant, matching `qr_auth_rate_limits` | S |
| `studio_compliance_documents` | Extend (P1 base table gains P3 columns) | `source text`, `is_inbound boolean`, `superseded_by uuid` (self-fk), `rejected_by uuid`, `rejected_at timestamptz`, `rejection_reason text` | Unchanged `is_active_studio_member(organization_id)`; the edge function writes through a `SECURITY DEFINER` RPC, never a direct table grant to anon | S |
| `compliance-documents` (storage bucket) | New | n/a (bucket plus `storage.objects` policies keyed on `(organization_id, company_id)` path segments, studio-member read/write, no anon policy; writes flow through the edge function's service-role client, not a client-side authenticated upload) | Studio-member read; writes service-role only | S |
| `notification_log` | Extend (value only) | New `type = 'compliance_document_inbound'` value on the existing free-text column; no schema change | Unchanged | S |
| `v_access_grants` (existing `security_invoker` UNION view, §7 `direction.md`) | Extend | Add `paperwork_link_tokens` as the twelfth base table in the UNION | Deferred to the base table | S |

Every row above is additive; nothing here alters an existing column's meaning or an existing row's shape.

## 9. Acceptance list

1. A firm's paperwork contact, and only the paperwork contact, sees the Paperwork section on their field link.
2. The Paperwork section shows one row per expected document type with the correct paper word (Current, Lapses in 30 days, Lapsed, Not on file) and, for a lapsed or not-on-file row, the correct `blocks[]` sentence.
3. Uploading a document with a token scoped to Company A never creates, reads, or touches a row belonging to Company B, under any input including a forged `company_id` in the form body.
4. An expired or revoked token 404s the page and 4xxs the upload function; neither path reveals whether the token once existed.
5. An upload with a valid token and a currently-verified document of the same `doc_type` on file inserts a new pending row and leaves the verified row untouched (`verified_by`, `verified_at`, `superseded_by` all unchanged on the old row).
6. Confirming a pending row sets `verified_by`/`verified_at` on that row and, only if an older verified row of the same `doc_type` exists, sets `superseded_by` on the older row to the new row's id. No row is deleted by confirm.
7. Rejecting a pending row records `rejected_by`, `rejected_at`, and a reason, and enqueues exactly one `agent_tasks` row via `enqueue_agent_task` with `status = 'awaiting_review'` addressed to the firm's paperwork contact, reusing the existing chase-draft path rather than a new one.
8. A studio member with an unconfirmed pending document sees the inbound queue band on the company card with the correct count and per-row copy; the band disappears once every pending row for that holder is confirmed or rejected.
9. An in-app notification lands in `notification_log` with `type = 'compliance_document_inbound'`, `channel = 'in_app'`, on every new pending upload, readable through the existing inbox hook.
10. A file over 15 MB, or of a mime type outside the allowlist, is rejected by the storage bucket's own limits before the edge function's RPC call, with no partial row left in `studio_compliance_documents`.
11. Revoking a token from the company card's Access grants section is a two-step inline confirm, accepts an optional reason, sets `status = 'revoked'`, and immediately 404s any further use of that token's raw value.
12. A token's `expires_at` matches the latest active engagement window for that company at that studio (or the firm's `warranty_until`, if the minting studio member chose to extend to it), never a fixed 90-day clock.
13. Every write this door performs is visible in an audit trail: who minted the token, who used it, what was uploaded, and who confirmed or rejected it, with no step unaccounted for.

## 10. Open questions, ruled

1. **Notification recipient.** `agent_tasks.assignee` is `CHECK IN ('kody','leah')` today (00297); there is no per-organization assignee column on the existing chase-draft queue. Who receives the `compliance_document_inbound` in-app notice for a studio that is neither Kody's nor Leah's: every active studio member with an admin/office role at that organization, or a specific "paperwork owner" role this build would need to introduce? The upload door can ship without answering this (the row and the queue entry are both real either way), but the notification's `user_id` cannot be filled in correctly without it.
**Ruled 2026-09-11:** Owners and admins of the studio receive the compliance_document_inbound notice, plus the member who minted the paperwork link if they are neither. No new role. (Kody)

2. **No active engagement at mint.** A firm with no currently active `project_parties` row (bidding only, or between jobs) has no engagement window for `expires_at` to borrow from. Should the studio be blocked from minting a paperwork link at all for such a firm, or should minting fall back to a fixed short window, and if so, whose clock? This is exactly the 90-day pattern PR-d retired for field links, so a fallback here needs its own ruling, not a silent reuse of the old default.
**Ruled 2026-09-11:** A firm with no active engagement may still be minted a paperwork link; the studio chooses the end date, offered as 30 days or the firm's next engagement window, in words on the mint act (PR-l pattern). No silent fallback clock. (Fable)

3. **Reconciling an uploaded signed waiver against the draw ledger.** A waiver uploaded here lands as a compliance document on the company card; the money book's own lien-waiver record (E11, `project_lien_waivers`, CRM-9) is a separate table this program does not own. Should a confirmed waiver upload here ever write or flag anything in the money book, or does it stay purely informational until whoever builds the money book chooses to read it?
**Ruled 2026-09-11:** A confirmed waiver upload stays a compliance document on the company card; it writes nothing to the money book. The money book reads it later if it chooses (CRM-9 lean). (Fable)

4. **Multi-company paperwork contacts.** If the same person is the paperwork contact for two different firms working the same studio (rare but not impossible per the fixture's kind-widening work), does one field link ever need to show more than one company's Paperwork section, or does the studio mint a separate seat (and separate token) per firm by convention?
**Ruled 2026-09-11:** One paperwork token per firm by convention; a person who is paperwork contact for two firms holds two links. (Fable)
