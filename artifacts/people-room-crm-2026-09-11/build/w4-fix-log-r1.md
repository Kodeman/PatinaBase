# W4 (P3) — round-1 fix log

Every finding from `w4-review-r1-data-edge.md`, `w4-review-r1-qa.md` and
`w4-review-r1-code.md` that the orchestrator handed back, one entry each, with
what changed and what proves it. Nothing else was touched. `rulings.md` §3 was
treated as settled throughout.

Worktree `.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. No prod: no `db push`, no
`functions deploy`, no secrets.

---

## B-1 / QA-B2 (blocking) — two shipped readers still SELECTed `invoice_links.token`

**New migration `00638_pay_link_readers_reheaded.sql`** (minted above the
highest number on the branch, clear of the reserved 00595–00620), both bodies
grafted verbatim from 00578 with one statement each changed:

- `issue_agreement_draw_invoice` now **mints**:
  `v_pay_token := public.ensure_invoice_link(v_invoice_id);`. It IS the issuing
  transaction, so the link it revokes is the one `invoice_link_mint_on_issue`
  wrote three statements earlier and nobody holds it. NULL still means "no
  address to carry" and the caller's existing fallback is untouched.
- `get_client_commercial_document_bundle` is STABLE and read on every page load,
  so it may not call the revoking minter: its `payToken` is `NULL::text`,
  stated in the open with the reason beside it.

Client half, so the offer does not vanish:

- `apps/client-portal/src/lib/commercial-documents.ts` —
  `DesignBuildDepositOffer.payToken` is `string | null`, and R50's "every field
  or nothing" rule keeps the invoice and the figure but no longer requires the
  address.
- `apps/client-portal/src/components/threshold/door-gate.tsx` — the reload path
  builds `/?invoice=<id>` when the bundle carries no token, which folds the
  letterbox to that letter: the surface the door's own R50 note already names
  as where the deposit lives after the visit it was signed in. The in-session
  offer from the sign route still carries the live `/pay/<token>`.

**Proof.** `supabase/tests/commercial/design_build_test.sql` — 22 PASS, no
error. T13 (the sign route's own offer) asserts `payToken ~ '^[0-9a-f]{64}$'`
and passes **because** of the mint; T23 is rewritten to assert the bundle
carries none. New jest case in `door-gate.test.tsx` ("points at the letter in
her letterbox when the bundle carries no address").

Report §4 corrected: the two missed readers are now rows in its own table, and
the sentence "Every place that used to re-read the token had to change" is
replaced.

## B-2 (blocking) — the out touch was filed into whichever studio held the worst copy of the address

`supabase/functions/_shared/send-email.ts`:

- `ComplianceSendOptions.organizationId?: string | null` — the studio the
  letter is from.
- `resolveContactChannel(supabase, to, organizationId?)` keeps the lookup
  **address-wide** (D-6: a dead mailbox is dead for everyone, and that verdict
  is unchanged) and adds `studioRow`: the sending studio's own row for the
  address, or `null`.
- `sendCompliantEmail` writes the touch and the `studio_contact_channel` ref
  **only** from `studioRow`. No studio named, or the studio carries no row for
  the address → no touch, no ref (the R-AW posture). A bounce is written back by
  ADDRESS in `resend-webhook/channel-status.ts`, so an unattributable letter
  loses its log row, never its write-back.

> **CORRECTION (round 2, W4 r2 MAJOR-3).** The last sentence was FALSE as
> written. `writeChannelStatus` was reached only from inside the
> `email.bounced` / `email.complained` case bodies, which sit *after*
> `handleResendEvent`'s `if (!logEntry) return { matched: false }` early
> return — so an unattributable letter lost its write-back as well as its log
> row. Round 2 moves the address-keyed write ahead of that return; three Deno
> cases in `resend-webhook/index.test.ts` pin it. The sentence is true as of r2.

All five account-less senders now name their studio:
`invoice-send` (`identity?.studioId ?? invoice.studio_id`), `po-send` and
`quote-request-send` (`identity?.studioId`), `trade-rfq-send` (the studio id is
carried on `DesignerIdentity` and through the `sendEmail` dep),
`trade-agreement-send` (`agreement.studioId`, same route).

**Proof.** `_tests/email-channel-status.test.ts` — 15 pass, four of them new:
the touch names the sending studio's card even when another studio holds the
worse row; the suppression verdict stays address-wide and the lookup is never
narrowed by tenant; a letter naming no studio files nothing; a studio with no
row for the address files nothing. Deno across every changed dir: 530 pass.

## M-1 (major) — every coordination decision was stamped `failed_unknown_sender`

`supabase/functions/sms-inbound/pipeline.ts`, `filedDecisionFacts()`:
`court_party_id IS NULL` is now "no named court" and falls through to
`authorityVerdictFor(...)`; `failed_unknown_sender` is reserved for
`court_party_id IS NOT NULL AND court_party_id <> partyId`. A failed READ of the
decision row still fails closed as before (that is minor 6, untouched).

**Proof.** Two new Deno tests: an item with no named court whose sender holds an
in-force `selections` grant reads `passed`; an item whose court names another
seat still reads `failed_unknown_sender`.

## M-2 (major) — `v_access_grants`' invoice_pay tier said the pay link never expires

`access_grants_invoice_links()` is re-headed in **00637 section 9b** (00627's
body verbatim, `NULL::timestamptz` → `il.expires_at`). It could not be edited in
00627 in place: `invoice_links.expires_at` is 00636's column and a SQL function
body is parsed at creation — the reset proved it (`column il.expires_at does not
exist`). Branch 9's comment in 00637 is rewritten to say what 00636 made true,
and the function's COMMENT with it.

**Proof.** New W4 SQL block 9d: the tier's `expires_at` equals the link row's
own. (The seeded invoice's project records no studio — R-BD's legacy population
— so the block stamps one for the width of the transaction; what is under test
is the branch's column, not its gate.)

## M-3 (major) — `confirm_inbound_document`'s R-AZ pre-check was incomplete

`00637` section 9: the four time-varying legs of `assert_compliance_holder()`
are now all answered before the first UPDATE, un-nested from
`v_old_expires IS NOT NULL`:

| leg | trigger name | pre-check |
|---|---|---|
| dated retired by undated | `compliance_successor_undated` | `compliance_confirm_needs_a_live_date` (unchanged) |
| successor already lapsed | `compliance_successor_already_lapsed` | **new** `compliance_confirm_already_lapsed`, whenever `v_old IS NOT NULL` |
| successor ends sooner | `compliance_successor_not_later` | **new** `compliance_confirm_ends_sooner` |
| successor drops a gate | `compliance_successor_drops_a_gate` | `compliance_confirm_drops_a_gate`, lifted out of the date guard |

Note on direction: the review's fix text wrote the not_later condition as
`v_doc.expires_on > v_old_expires`. The trigger raises when the SUCCESSOR ends
EARLIER (probed in the review itself: old +400, new +120), so the implemented
condition is `v_doc.expires_on < v_old_expires`.

Both new tokens get their sentence in
`packages/supabase/src/hooks/use-inbound-documents.ts`.

> **CORRECTION (round 2, W4 r2 MAJOR-1 / R2-MAJOR-1).** They did NOT. The SQL
> half landed; the portal half was never written, so
> `compliance_confirm_already_lapsed` and `compliance_confirm_ends_sooner` fell
> through `asInboundDocumentError` and were announced to the studio verbatim in
> `inbound-queue-band`'s `role="alert"` region. Round 2 adds both sentences and
> pins every one of the eight tokens 00637 can raise at the hook layer
> (`people-crm-w4.test.ts`) and at the face (`inbound-queue-band.test.tsx`).

**Proof.** New W4 SQL block 9c: a shorter-dated replacement COI and a dated w9
replacing an undated one with a passed date are both refused as
`check_violation` carrying the pre-check's own token (not P0001 from the
trigger), nothing is stamped or superseded, and an honest renewal still lands.

## M-4 (major) — three sms-inbound branches attributed a message and wrote no touch

`recordInboundTouch(..., { decisionClass: 'none', authorityCheck: 'n/a' })`
added at the inbound STOP (before the 200 that acknowledges it, never on the
`opt_out_incomplete` path), at HELP, and at the project-chooser pick. STOP is
recorded as a contact as well as a consent act — it is not excluded.

**Proof.** Two new Deno tests (STOP; HELP + chooser pick). Report §9 rewritten:
it now names `proposal-send` as a third un-touched send path and records the
three closures.

## M-5 (major) — the folio's copy-the-address act destroyed what it minted

`packages/supabase/src/hooks/use-invoices.ts` —
`useRegenerateInvoiceLink.onSuccess` keeps `setQueryData` and drops the
`invalidateQueries` that re-read `get_invoice_link` (always `token: NULL` since
00636) and wiped the cache.

**Proof.** New vitest case in `use-invoices.test.ts`: the minted link is written
to `['invoice-link', id]` and that key is never invalidated.

## QA-B1 (blocking) / MAJOR-2 (major) — unverified AND rejected paper read as current

`compliance_state` is re-headed in **00637 section 1b** (00623's body verbatim;
it cannot live in 00623, whose file is parsed before `rejected_at` exists) with
two predicates, named separately so a later edit cannot reopen one half:

```sql
AND d.rejected_at IS NULL
AND NOT (d.inbound AND d.verified_at IS NULL)
```

`identity_paper_state` (00629) folds this function, so the Directory row, seat
lines, roster rows and company card follow from the one edit. A document the
studio recorded itself (`inbound = false`) is still held the moment it is typed
— the studio saying so IS the check.

Portal half: `retainedComplianceDocuments`
(`packages/supabase/src/hooks/use-studio-contacts.ts`) carries the same rule, so
the card's Paper table stops listing pending and refused paper beside held
paper. The inbound queue band reads its own query and is untouched.

**Proof.** New W4 SQL block 9: not_on_file → still not_on_file on an in-force
GATING inbound upload; still not_on_file after it is explicitly rejected (the
case named in its own right); `identity_paper_state` agrees; the studio's own
typed W-9 still reads current. New vitest case asserting the same four rows
through `retainedComplianceDocuments`.

## QA-M1 (major) — client-portal's production CSP had no path for another Supabase origin

`apps/client-portal/next.config.js` derives the origin (http + ws) from
`NEXT_PUBLIC_SUPABASE_URL` at build time and appends it to **both** branches of
`connect-src`, exactly as `apps/designer-portal/next.config.js` already does. An
unset or unparseable value degrades to nothing rather than widening the policy.

**Proof.** `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 node -e` on the
config's own `headers()` prints the production directive ending
`… http://127.0.0.1:54321 ws://127.0.0.1:54321`.

## MAJOR-1 (major) — the firm was told "Received" about paper it never sent

`resolve_paperwork_link` (00637): `awaiting_check` is
`doc.inbound AND doc.verified_at IS NULL AND doc.rejected_at IS NULL`.

And the word beside it, which is the same harm on the same face
(`apps/client-portal/src/components/paperwork/paperwork-model.ts`): a pending
document contributes the receipt sentence and never the word, so a type whose
only paper is awaiting the studio's check reads "Licence is not on file."
beside "Received. {Studio} will confirm it." — what `compliance_state` now says
of it — while a verified paper with a pending renewal beside it still speaks
with the held paper's word.

**Proof.** W4 SQL block 9b (the studio's own typed W-9 is not `awaiting_check`;
the firm's own upload is). Two new jest cases in `paperwork-model.test.ts`. The
existing "receipt sentence from the record" case still passes: it sets
`awaiting_check: true`, which is still what the sheet renders.

## MAJOR-3 (major) — revoking the paperwork door left the mint band claiming it was open

`packages/supabase/src/hooks/use-access-grants.ts` —
`useRevokeAccessGrant.onSuccess` also invalidates `['paperwork-links']`, by
literal key (importing `paperworkLinkKeys` back would make a cycle).

**Proof.** New vitest case: the revoke invalidates both `access-grants` and
`paperwork-links`.

## MAJOR-4 (major) — a ruling id was printed on the studio's face

`paperwork-link-act.tsx:257` now reads "Name the day it closes. There is no
clock to fall back on."

**Proof.** `paperwork-link-act.test.tsx` asserts the sentence in full and that
the rendered document carries no `R-x` token at all.

## MAJOR-5 (major) — twelve authored surfaceKeys were in neither registry

All twelve promoted to `packages/help-system/src/surfaceKeys.ts` and to
`apps/designer-portal/src/lib/help-system/document-surface-keys.ts`
(`PeopleWordReach`, `PeopleWordConsent`, `PeopleWordPaper`, `PeopleContactRule`,
`PeopleLens`, `PeopleChips`, `PeoplePersonConsent`, `PeoplePersonAccessGrant`,
`PeoplePersonAuthority`, `PeopleFirmDesignations`, `PeopleFirmPaper`,
`CallSheetSiteAccessTold`). Additive: no `_id` changed, nothing reseeded.

**The wiring is recorded as a named follow-up with an owner** —
`w4-help-report.md` §7: **W6, the portal wave**, owns the doorways
(`useDocumentSurface()`/the sheet-open hook for the three room-level keys, the
`?` doorway for the concept tooltips). Until then all 18 documents are
unreachable on the face; if W6 cannot carry it, it is Kody's to reschedule.

**Proof.** A script checking all 17 authored keys against both files reports
none missing; `surface-key-parity.test.ts` and the other 48 designer suites pass
(717 tests).

## MAJOR-6 (major) — 26 em-dashes in the help copy

All 22 strings rewritten in
`studios/help-system/scripts/people-help-content.json` with a full stop, a colon
or a comma pair. Nothing was ever committed to Sanity, so the sweep was free.

**Proof.** A walker over all 18 documents reports zero em- or en-dashes; the
caps validator (tooltip body ≤160, emptyState heading ≤50 / description ≤300)
reports zero violations; `node run-people-help-seed.mjs` dry run still reports
"18 written, 0 errored".

---

## Gates re-run after the fixes

| Gate | Result |
|---|---|
| `pnpm supabase:reset` | green, ledger head `00638` |
| `supabase/tests/people/{w1a,w1b,w3,w4}_*.sql` | 4/4 pass (`All W1a assertions passed.` / `All W1b assertions passed.` / `W3 SQL suite: all blocks passed` / `W4 SQL suite: all blocks passed`, blocks 9/9b/9c/9d new) |
| `supabase/tests/commercial/design_build_test.sql` | 22 PASS, 0 error |
| `supabase/tests/billing/invoice_links_test.sql`, `invoice_checkout_integrity_test.sql` | both clean |
| Deno, changed dirs (`_shared`, `trade-rfq-send`, `trade-agreement-send`, `paperwork-upload`, `resend-webhook`) | 530 passed, 0 failed |
| Deno `_tests/email-channel-status.test.ts` | 15 passed |
| Deno `_tests/sms-inbound.test.ts` | 56 passed (4 new) |
| Deno `_tests/paperwork-upload.test.ts` | part of 64 passed |
| `deno.lock` | deleted before and after every run; absent from the repo root |
| legacy grants | regenerated (`python3 scripts/generate-legacy-grants.py`), 00638's four statements present |
| `pnpm --dir packages/supabase type-check` | clean |
| `pnpm --dir packages/help-system type-check` | clean |
| `pnpm --dir apps/designer-portal type-check` | clean |
| `pnpm --dir apps/client-portal type-check` | clean — see the note below |
| `apps/admin-portal` build (shared package edits) | green |
| `apps/client-portal` jest + coverage | 154 suites / 2526 tests pass; 76.86 / 72.69 / 76.56 / 79.2 against the 70/60/70/70 floor |
| `apps/designer-portal` jest (help-system + people + roster) | 49 suites / 717 tests pass |
| `packages/supabase` vitest | 107 files / 1414 tests pass |
| `db:generate` | no schema drift — the regenerated file differs from the committed one only in the formatter's parentheses, so the committed file stands |

**The one note on the client type-check.** The first run failed on
`apps/client-portal/.next/types/app/page.ts` (`Type 'undefined' is not
assignable to type 'PageProps'`). That file is build output generated by the
earlier QA round's production build against an UNMODIFIED `src/app/page.tsx`
(`git status` clean on it), and this round touches neither the page nor
anything in the generated check. With the stale `.next/types` tree moved aside
the check is clean. Not a defect introduced here, and not fixed here — recorded
so the next round does not rediscover it.

## Observed, not fixed (no finding named it)

- **The client letterbox's `/pay/<token>` href** reads `useInvoiceLink`, which
  since 00636 returns null for every invoice, so the letterbox falls back to its
  settle-in-place. M-5's named fix covers the designer folio only. Recorded in
  `w4-data-edge-report.md` §4 and §9 for a ruling.
- **`proposal-send` and `flushDeferredMessages`** still write no out touch
  (review minor 11 and the wave's own §9). Left alone; named in the report.
