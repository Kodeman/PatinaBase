# W4 fix log — round 8

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.

Scope of this pass: the six findings named in the brief, which are four defects — the same two
are filed twice from two contexts:

| Brief id | File | What it is |
|---|---|---|
| `MAJOR-1` (data+edge) · `F3` (QA) | `supabase/functions/paperwork-upload/core.ts` | every write failure answered "invalid or expired token", and left the object behind |
| `F1` (QA) · `MAJOR-1` (code) | `apps/client-portal/src/components/paperwork/paperwork-sheet.tsx` | the row's own sentence did not move with the send |
| `F2` (QA) | `apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx` | a pre-hydration click degraded into a native GET that dropped the file |
| `MAJOR-2` (code) | `apps/designer-portal/.../invoice-folio.tsx` + `packages/supabase/src/hooks/use-invoices.ts` | the bounce band read the link cache as it stood before the send |

Nothing else was touched. **No migration was minted or edited** — this round is edge code, portal
code and tests only. No prod call of any kind (no `db push`, no `functions deploy`, no secrets).

---

## 1. `MAJOR-1` (data+edge) / `F3` (QA) — the door blamed the token, and kept the file

`uploadPaperwork` collapsed every `record_inbound_compliance_document` error that was not
`/paperwork_token_invalid/` into `400 {error: "invalid or expired token"}` — a statement about a
token the same request had verified twice (`paperwork_link_storage_context`, then the RPC's own
re-verification). Reversing the two date fields raises 00623's
`studio_compliance_documents_dates_check`, so a typo made the act permanently unreachable with no
way to discover why; and because nothing called `.remove(key)`, each attempt left an object in
`compliance-documents` that no row pointed at.

`supabase/functions/paperwork-upload/core.ts`:

- **The common case never reaches the bucket.** A new field check beside the others: with both
  dates in ISO shape and `expires_on < issued_on`, the answer is `400` +
  `REVERSED_DATES_MESSAGE` = *"the date it expires cannot come before the date it was issued"*.
  The wording follows the constraint exactly — 00623 is `expires_on >= issued_on`, so the same
  day is allowed and is not refused here either.
- **The write's failure arm now tells the truth.** `paperwork_token_invalid` → `403` (unchanged,
  and the only arm that may speak about the token). The dates CHECK reaching the write anyway →
  `400` + the same sentence. Anything else (22007 malformed date, 22001 over-length label, any
  other constraint) → `500 {error: "we could not record that — try again"}` with
  `console.error` carrying the real message to the studio's log.
- **No arm leaves an orphan.** New `discardUpload(deps, key)` calls
  `storage.from("compliance-documents").remove([key])` before every failure answer, token arm
  included — the row was never written in any of them. A removal that itself fails is logged and
  swallowed: the firm is owed the true answer about its document, not a second failure about
  housekeeping. `PaperworkSupabaseLike.storage.from()` gains `remove(paths: string[])`.

Evidence — `supabase/functions/_tests/paperwork-upload.test.ts`, three new cases plus one
extended (the fake client grew `remove`, recording into `f.removed`):

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/paperwork-upload.test.ts
two dates the wrong way round are refused before the bucket ... ok
the dates CHECK reaching the write is named, not blamed on the token ... ok
any other write failure is Patina's, said so, and leaves no orphan ... ok
a token that dies between the context read and the write is a 4xx, not a 500 ... ok
ok | 15 passed | 0 failed (34ms)
```

The extended token case asserts `f.removed === f.uploads`; the two new write-failure cases assert
the answer's status, its sentence, and that the object that landed first is gone. `deno.lock` is
absent before and after the run.

W7 note: `paperwork-upload` is already on the redeploy list; this is a change to its own code, no
`_shared` fan-out.

## 2. `F1` (QA) / `MAJOR-1` (code) — the firm's page contradicted itself in the visit it was used

`rows` is memoized on the server-rendered `context` and nothing on the page refetches, so
`markReceived` only set a local receipt flag: the row kept printing *"W-9 is not on file."*
directly above *"Received. Local Dev Studio will confirm it."* (QA screenshot
`qa-w4-r8/02b-upload-receipt-390.png`, with Licence).

- `apps/client-portal/src/components/paperwork/paperwork-model.ts` — new pure
  `receivedReading(row)`, which is **R-BU applied to the visit in which the firm acts**, so the
  page says now exactly what the next load will say:
  - nothing on file → the row becomes `awaiting_check`, sentence `rowSentence('awaiting_check',
    title, null)` → *"W-9, not yet checked."*, `blocksSentence` dropped with the sentence that
    named it, `openByDefault` false;
  - paper already on file → the confirmed paper is still the row and `awaitingCheck` is its flag
    (R-BU's own words: *the verified row is the row, `awaiting_check=true` is its flag*), so
    *"Licence, lapsed 1 May 2026."* and *"Blocks site access."* both stand — they remain true
    until a member opens the new paper, and they are what the reload prints;
  - refused → untouched, because the refusal is the whole word on that row and its form stays
    open (W4 r7 M-4).
- `apps/client-portal/src/components/paperwork/paperwork-sheet.tsx` — the map applies
  `receivedReading` to a row sent **in this visit** (`received[key] === true`) and renders that
  reading; `isReceived` now reads the same flag. Server-supplied `awaitingCheck` rows are
  untouched, so R-BU's reload path is exactly as it was.

Evidence — `pnpm --dir apps/client-portal exec jest src/components/paperwork` →
**3 suites, 56 tests, all pass**. New/extended:

- `paperwork-sheet.test.tsx` — the send test now asserts the row's own sentence:
  `getByText('W-9, not yet checked.')` present and `queryByText('W-9 is not on file.')` absent
  after the click (it passed before the fix — that is the gap the reviewers named), plus that the
  untouched Licence row still reads *"Licence is not on file."*. A second new case proves a
  renewal sent against lapsed paper keeps *"Licence, lapsed 1 May 2026."* and *"Blocks site
  access."* beside its receipt.
- `paperwork-model.test.ts` — three cases on `receivedReading`: the not-on-file move, the
  already-on-file flag-only reading, and the refused row returned identically.

## 3. `F2` (QA) — a click that beat hydration became a GET that dropped the file

The `<form>` declared no `method` and no `encType`, so a native submit landing before React
attached `onSubmit` was a GET to the same page: the typed fields rode onto the URL and the file,
which cannot serialize into one, was silently lost.

- `apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx` — the form now carries
  `method="post"` and `encType="multipart/form-data"`, and deliberately **no `action`**: nothing
  here is meant to submit natively, so a pre-hydration submit is a POST carrying the file that
  the route refuses loudly, never a GET that swallows the document. The handler is unchanged
  (`'use client'`, `preventDefault()`); it was always correct.

`aria-disabled` is the house rule for a held control and does not stop a native submit, so the
button-gate alternative the finding offers could not be the fix on its own; the declared method is.

Evidence — `paperwork-upload-form.test.tsx`, new case *"declares its own submission so a
pre-hydration click cannot lose the file"*: `method=post`, `enctype=multipart/form-data`, and no
`action` attribute. Included in the 56 above.

## 4. `MAJOR-2` (code) — the bounce band stated the opposite of the record

R-BW made the band branch on whether a live link EXISTS (`invoiceLinkIsLive(invoiceLink)` /
`invoiceLink?.status`), and R-BV had removed the only invalidation of `['invoice-link', id]`. With
`staleTime: 5min`, `refetchOnWindowFocus: false` and no remount, the band read the cache as it
stood **before** the send — and both `invoice-send` and `issue_invoice` mint a link, so a bounced
send of a draft printed *"this invoice has no live link"* about an invoice that had just been
given one.

Fix taken: option 1 of the two the reviewer blessed — refresh the read, without letting an address
ride along. `packages/supabase/src/hooks/use-invoices.ts`:

- New `invalidateInvoiceLinkFact(queryClient, invoiceId)`, documented with why both rulings hold:
  00636 froze `invoices.token`, so `get_invoice_link` answers `token: NULL` forever and this
  refetch cannot carry an address home; the minted address lives in the folio's own component
  state, where R-BV put it, out of reach of any invalidation.
- `useIssueInvoice.onSuccess` calls it (issuing mints the invoice's first link).
- `useSendInvoice` calls it from **`onSettled`**, not `onSuccess`: `invoice-send` mints the link
  before it attempts the email, and the failed send is exactly the moment the band is mounted to
  describe it.
- `invalidateInvoiceEffects` is untouched — still `void invoiceId`, so record-payment and void
  still leave the key alone (R-BV).

Evidence:

- `pnpm --dir apps/designer-portal exec jest src/components/document/accounts` →
  **6 suites, 65 tests, all pass.** `invoice-folio-minted-address.test.tsx` (the un-mocked suite,
  real hooks + real QueryClient) now carries both halves: the first case asserts the send fires a
  **fresh** `get_invoice_link` read *and* that the minted address is still on screen and still the
  string on the clipboard; the new second case gives the mount no link, has `invoice-send` mint
  one and report `emailSent: false`, and asserts the band prints *"This invoice has a live link,
  but Patina cannot show you its address again…"* and never *"this invoice has no live link"*.
- **Negative control** (run, then reverted): with `invalidateInvoiceLinkFact` stubbed out of
  `useSendInvoice.onSettled`, both cases fail — `2 failed, 2 total`. The suite proves the fix, not
  the ambient behaviour.
- `packages/supabase` — `pnpm --filter @patina/supabase exec vitest run
  src/hooks/__tests__/use-invoices.test.ts` → **64 tests pass**. The R-BV describe block is
  re-headed *"invoice-link invalidation (R-BV × R-BW)"*: `useRecordPayment` / `useVoidInvoice`
  still must not touch the key (their `onSettled` is exercised too), while `useIssueInvoice` and
  `useSendInvoice` (settled both ways — landed and bounced) must.

---

## 5. Gates

| Gate | Result |
|---|---|
| `deno test --no-check --allow-all --config supabase/functions/deno.json _tests/paperwork-upload.test.ts` | **15 passed, 0 failed**; no `deno.lock` created |
| `pnpm --dir apps/client-portal exec jest src/components/paperwork` | **3 suites / 56 tests passed** |
| `pnpm --dir apps/designer-portal exec jest src/components/document/accounts` | **6 suites / 65 tests passed** |
| `pnpm --filter @patina/supabase exec vitest run src/hooks/__tests__/use-invoices.test.ts` | **64 passed** |
| `pnpm --filter @patina/supabase run type-check` | clean |
| `pnpm --filter @patina/designer-portal run type-check` | clean |
| `pnpm --filter @patina/admin-portal run build` | **green** (the strictest gate; run because `packages/supabase` was edited) |
| `pnpm --filter @patina/client-portal run type-check` | **RED, pre-existing and unrelated** — the single error is in generated output, `.next/types/app/page.ts(37,29) TS2344 … 'undefined' is not assignable to type 'PageProps'`. No file this round touches appears in it; it is r8 code-review m-12, already on the books |

No migration replay was needed (no SQL changed). No server was started; no Playwright run
(the brief's "no servers"), so `apps/client-portal/tests/paperwork-link.spec.ts` is unchanged —
its existing assertions (the two *"is not on file"* lines are read **before** the upload, the
receipt after) stay true under this change.

## 6. Notes for the next round

- The in-session reading deliberately follows **R-BU** rather than moving every sent row to
  `awaiting_check`: a row whose confirmed paper still stands keeps its word and its block, because
  that is what the reload prints and what the studio's own book says. The reported contradiction
  (a `not_on_file` row printing over its own receipt) is the case that moves.
- A refused row that is re-uploaded in this visit still shows no receipt and keeps its form open
  (W4 r7 M-4's shape, unchanged by this round). That behaviour was not in the brief and was left
  exactly as it stood.
