# W4 (P3) — round-2 runtime QA, against LOCAL PRODUCTION BUILDS

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Designer portal (`next build --webpack` + `next start`, :3000) and client portal
(same, :3002) both built and started against a freshly reset local DB
(`pnpm supabase:reset`, ledger head `00638`) with every env var passed inline
per the binding instruction — no `.env.local` created or read. `paperwork-upload`
served locally via `supabase functions serve paperwork-upload --no-verify-jwt`.

Port rule: 3000 and 3002 had no listeners before this round started — nothing
to evict.

No prod: no `db push`, no `functions deploy`, no secrets set.

---

## 1. Build and test gates

| Gate | Result |
|---|---|
| `pnpm supabase:reset` | green, ledger head `00638` |
| `pnpm --dir apps/designer-portal build` (inline env) | clean, `/people`, `/doc/[id]` etc. all present |
| `pnpm --dir apps/client-portal build` (inline env) | clean, `/paperwork/[token]` present in the route table |
| `next start` both, against the production `.next` output | both serve; the pre-existing "next start does not work with output: standalone" warning is expected noise (same warning this program's earlier rounds have logged) |
| `paperwork-upload` served locally, `--no-verify-jwt` | live; `OPTIONS` → 204, empty `POST` → 400 |
| designer e2e `e2e/people/paperwork-inbound.spec.ts` (chromium, `--workers=1`) | **1 passed** |
| client e2e `tests/paperwork-link.spec.ts` (chromium) | **3 passed** — including the real upload spec, against the production build, through the real `paperwork-upload` function. This is the spec QA-M1 (round 1) named as failing against a production build before the CSP fix; it now passes, confirming that fix holds |

---

## 2. Re-check of every round-1 finding

| Finding | Status this round |
|---|---|
| B-1/QA-B2 (pay-link readers still SELECTed the plaintext token) | Not re-exercised directly (no `invoice_links` rows exist in this fresh dev-seed DB to probe — 0 rows). Not re-opened; nothing observed contradicts the fix. |
| B-2 (out touch filed to the wrong studio) | Not directly re-exercised (would need a live send through a served sender function); nothing observed contradicts the fix. See §3 finding W4R2-1, which is upstream of B-2 in the same file and makes the whole channel-lookup path (B-2's own fix included) dead code against the real schema — see below. |
| M-1 (decision stamped `failed_unknown_sender`) | Not re-exercised (sms-inbound not driven this round). |
| M-2 (`v_access_grants` invoice_pay tier never-expires) | Not re-exercised. |
| M-3 (`confirm_inbound_document`'s R-AZ pre-check incomplete) | Not re-exercised directly, but the confirm act we drove (§4) completed cleanly with no trigger-raised error, consistent with the fix. |
| M-4 (three sms-inbound branches wrote no touch) | Not re-exercised. |
| M-5 (folio's copy-address act destroyed what it minted) | Not re-exercised (designer folio not opened this round). |
| **QA-B1/MAJOR-2 (unverified AND rejected paper read as current)** | **RE-VERIFIED FIXED, live.** Walked end to end (§4): before Confirm, the firm's own `/paperwork/<token>` page read "Licence is not on file." beside "Received. Local Dev Studio will confirm it."; the studio's Paper table showed no CURRENT chip for the Licence. After Confirm, both the studio's card and the firm's own page flipped to "current." Screenshots `01`–`03`. |
| **MAJOR-1 (firm told "Received" about paper it never sent)** | Consistent with the fix on inspection (the receipt sentence and the word only ever spoke about the Licence we ourselves uploaded); not independently forced against a counter-case this round. |
| MAJOR-3 (revoke left the mint band claiming open) | Not re-exercised (we minted but did not revoke). |
| MAJOR-4 (ruling id on the face) | Not re-exercised (the mint we drove had an active engagement, so the "no clock to fall back on" branch never rendered). |
| MAJOR-5/6 (help-system keys, em-dashes) | Out of scope for a runtime walk; not checked. |
| **QA-M1 (client-portal CSP had no path for another Supabase origin)** | **RE-VERIFIED FIXED, live.** The real upload — both via Playwright (§1) and via our own manual walk (§4) — went through the browser straight to `http://127.0.0.1:54321/functions/v1/paperwork-upload` with no CSP block, confirming the origin is derived from `NEXT_PUBLIC_SUPABASE_URL` as the fix says. |

No prior finding was found to have regressed.

---

## 3. NEW findings, this round

### W4R2-1 — BLOCKING — the email channel-status suppression gate is dead code against the real schema: a dead or unsubscribed channel's next email is NOT refused

**Where:** `supabase/functions/_shared/send-email.ts`, `resolveContactChannel()` (line ~148,
this wave's own CRM-12 object, §1 of `w4-data-edge-report.md`).

**What's wrong.** `resolveContactChannel` selects
`"id, owner_type, owner_id, organization_id, value, status"` from
`studio_contact_channels`. That table **has no `organization_id` column** —
confirmed by `\d studio_contact_channels` against the live local schema (its
columns are `id, owner_type, owner_id, channel_kind, value, label,
sms_capable, verified, verified_at, preferred, status, status_at, created_by,
created_at, updated_at`; `organization_id` lives on `studio_contacts`, one
join away, exactly as the migration's own comment says: "RLS gates on the
OWNING CARD's organization_id via studio_contact_org(uuid)",
`00593_studio_contact_channels.sql:41`).

Every call to this query therefore returns Postgres error `42703 undefined_column`.
The function's own catch swallows it (`console.error(...); return null;`), so
`resolveContactChannel` returns `null` for **every recipient, every time** —
not only the one I unsubscribed. `prepareCompliantEmail` reads a `null`
channel as "no channel on file" and lets the send proceed, meaning
**the entire suppression gate for account-less recipients (D-4, D-5, D-6 of
this wave's own report) is a no-op against the real database.**

**Reproduced live, end to end, against the local production stack:**

1. Minted a real signed unsubscribe token with the same secret and library the
   app uses (`jose`, `SUPABASE_SERVICE_ROLE_KEY`), `sub = "channel:<id>"` for
   Rosa Delgado's real channel row (`rosa@twin-cities-drywall-plaster.com`,
   `studio_contact_channels.id = 7d84830f-257d-44df-899c-ed438547a591`).
2. Hit `http://localhost:3000/api/unsubscribe?token=…` on the real running
   designer-portal build. Landed on "You've been unsubscribed." (screenshot
   `05-unsubscribe-landing-applied.jpg`).
3. Confirmed in the database: that channel row's `status` flipped to
   `unsubscribed`, `status_at` stamped.
4. Ran the **actual production function**, `prepareCompliantEmail`, from
   `_shared/send-email.ts` (imported verbatim, not reimplemented) against the
   same local Supabase project, `to: "rosa@twin-cities-drywall-plaster.com"`.
   The console printed the swallowed error:
   `column studio_contact_channels.organization_id does not exist`, and the
   function's own return value was:
   `{"state":"ready", "request": {"to":["rosa@twin-cities-drywall-plaster.com"], ...}}`
   — **`ready` to send, not `suppressed`.** A real send through this path
   (`invoice-send`, `po-send`, `quote-request-send`, `trade-rfq-send`,
   `trade-agreement-send` — the five account-less senders `w4-data-edge-report.md`
   §9 names) would mail an address that had just unsubscribed.

**Why this passed the wave's own gates.** `_tests/email-channel-status.test.ts`
drives `resolveContactChannel`/`prepareCompliantEmail` against a **hand-rolled
in-memory fake** whose `ChannelRow` type carries an `organization_id?` field
that does not exist on the real table (`_tests/email-channel-status.test.ts:46`).
777 Deno tests passing, including this file's 15, proves the code compiles
and the fake's contract is internally consistent — it proves nothing about
the real schema, which is exactly the trap `patina-verification` warns about.
`deno check`'s "clean" result is equally uninformative here: nothing about an
unknown column name is a type error in a `supabase-js` builder chain.

**Blast radius.** This is not scoped to the one channel I flipped — it is
every `resolveContactChannel` call, so:
- A `dead` (hard-bounced) or `unsubscribed` (complained) address for a
  no-account recipient is **never** refused a send, contradicting D-5/D-6 and
  the acceptance criterion this wave was built to satisfy.
- `channel.studioRow` (B-2's round-1 fix, the "only the sending studio's own
  row" attribution) can also never populate, since `channel` is always
  `null` — B-2's fix is unreachable code on the real schema, though I did not
  independently re-verify a live send to confirm the touch-write consequence.
- The `List-Unsubscribe` header (D-4) that this wave adds for an
  account-less recipient's letters likewise never gets attached via the
  `channel` branch, since `channel` is always null (I did not verify the
  header directly — the header path is a smaller, cosmetic-compliance
  consequence of the same root cause, not a separate defect).

**Fix shape (not applied — read-only QA):** `resolveContactChannel`'s query
needs to resolve `organization_id` through `owner_id` — either a join
(`studio_contacts!inner(organization_id)` or the equivalent embed syntax) or a
second lookup, or by calling the existing `studio_contact_org(owner_id)`
function the RLS policies already use for exactly this purpose.

**Confidence:** high. Root-caused against the live schema (`\d`), reproduced
against the real function with the real local database, and the swallowing
`catch` block is read directly from source — this is not an inference from
symptoms.

---

### W4R2-2 — MAJOR — a live, non-revoked `paperwork_link` grant never appears in the company card's Access Grants section; its Revoke act is unreachable from any UI

**Where:** `apps/designer-portal/src/components/document/people/reach-access.tsx`,
the `shownGrants` memo (~line 798).

**What's wrong.** For a company card (`!isPerson`), the component filters the
fetched grants to `grant.subject_type === "contact"` before handing them to
`<AccessGrantList>`:

```
const shownGrants = useMemo(
  () =>
    isPerson
      ? grants
      : (grants ?? []).filter((grant) => grant.subject_type === "contact"),
  [grants, isPerson],
);
```

The comment above it explains this filter was written for **`agreement_link`**
— the pre-W4 firm-scoped tier, whose `v_access_grants` row carries
`subject_type = 'contact'` (`studio_trade_agreements.contact_id`). W4's new
**`paperwork_link`** tier is also firm-scoped, but its `v_access_grants` branch
stamps `subject_type = 'company'` by design (`00637_paperwork_upload_door.sql:1221`,
confirmed in the migration and matching the live row). Nobody widened this
render-time filter when the second firm-scoped tier was added, so a
`paperwork_link` grant is **filtered out before it ever reaches the list
component**, regardless of what the database holds.

This directly contradicts `w4-studio-report.md` §2's own claim: *"The door's
**revoke** needed no new surface: `v_access_grants`' twelfth branch keys the
row on `company_id`, which is the company card's own id, so the firm's Access
grants list already carries it."* It does not.

**Reproduced live, end to end:**

1. As Leah, minted a paperwork link for Twin Cities Drywall & Plaster (§4)
   from the company card's own "Mint a paperwork link" act.
2. Confirmed via direct PostgREST query, **authenticated as the same
   designer** (not service-role — this is exactly what the browser's own
   client would see), that `v_access_grants` correctly returns the row:
   `tier: "paperwork_link", subject_type: "company", subject_id: "d0e2…0006",
   revoked_at: null, expires_at: "2026-10-15T23:59:59+00:00"`.
3. Reloaded the company card (full hard navigation, not a soft nav — no stale
   client cache in play) three separate times. Every time, "Access grants"
   read **"No grant on file."** — screenshot
   `04-FINDING-access-grants-no-grant-on-file-despite-live-paperwork-link.jpg`.

**Consequence.** Since the row never renders, the **Revoke act for this tier
is unreachable from the company card** — the one surface spec §2 and
`direction.md` §5.1 name for it ("Company variant: … Access grants lists
firm-scoped tokens only"). `revoke_paperwork_link` exists in the database and
in the hook layer (`use-access-grants.ts`'s `ACCESS_GRANT_REVOKE_ROUTES`), but
there is no button anywhere in this build that can call it for a live link —
a studio member who wants to close a paperwork door early has no UI path to
do so. This is both "a reader disagreeing with the record" and "an inert or
unreachable act" per the two MAJOR categories named in the brief.

**Fix shape (not applied):** widen the company-card filter to
`grant.subject_type === "contact" || grant.subject_type === "company"`, or
(cleaner) filter positively by the set of tiers that are actually firm-scoped
(`agreement_link`, `paperwork_link`) rather than by `subject_type`, since a
third firm-scoped tier with yet another `subject_type` would trip the same
bug again.

**Confidence:** high. Confirmed at three layers (migration source, live API
response as the authenticated user, and three independent hard-reloaded
screenshots of the rendered page).

---

## 4. The Leah/Rosa walk, step by step (with evidence)

1. **Signed in as Leah** (`designer@patina.dev`) on the local-prod designer
   portal build.
2. **Minted a paperwork link** for Twin Cities Drywall & Plaster from the
   company card's "Mint a paperwork link" act, chose "Thirty days — 15
   October 2026," pressed "Open the door." Toast: "A paperwork link for Twin
   Cities Drywall & Plaster is open." Address shown once:
   `http://localhost:3002/paperwork/<64-hex-token>`.
3. **Opened the link in a fresh tab at 390px width, as Rosa** — the page
   correctly resolved through `resolve_paperwork_link`, showed "Paperwork for
   Local Dev Studio," and the three expected document rows (COI current, W-9
   current, Licence not on file, form open by default). Screenshot `01`.
4. **Uploaded a small generated PDF** (480 bytes, `application/pdf`) as the
   Licence, with number/issuer/issued/expires filled in, through the real
   client-portal form. It posted straight to the real, locally-served
   `paperwork-upload` edge function (confirmed in the function's own log:
   `serving the request with supabase/functions/paperwork-upload` at the
   exact timestamp of the click).
5. **Saw it land unverified**: page read "Licence is not on file." + "Received.
   Local Dev Studio will confirm it." Database row confirmed: `holder_type =
   'company'`, `holder_id` = the firm's own id, `doc_type = 'license'`,
   `source = 'field_link'`, `inbound = true`, `verified_by`/`verified_at`/
   `rejected_at`/`superseded_by` all `NULL`. Storage: the file landed in
   `compliance-documents` at `{org}/{company}/{uuid}/w9-test.pdf` — every
   segment before the filename a real uuid. Screenshot `02`.
6. **Saw the inbound band on the company card**: "1 document waiting for your
   check" / "Licence, uploaded 15 Sep 2026 by Twin Cities Drywall & Plaster.",
   with Confirm/Reject, printed above the ordinary Paper table exactly as
   spec §6 and S-1 describe.
7. **Confirmed it** (two-step inline confirm, no modal — "Confirming makes
   this the paper the studio holds…" → "Confirm the document"). Toast:
   "Licence, uploaded 15 Sep 2026 by Twin Cities Drywall & Plaster is
   confirmed." The Paper table now showed the Licence as CURRENT.
8. **Saw the firm's own paper word flip**: reloaded Rosa's page — "Licence,
   current." Screenshot `03`. This closes the loop the round-1 MAJOR-2 fix
   was meant to guarantee, confirmed live end to end.
9. Along the way, found **W4R2-2** (§3): the mint from step 2 never appeared
   in the same card's "Access grants" region, despite being a live grant the
   database and the API both correctly hold.
10. **Unsubscribe walk**: minted a real, correctly-signed unsubscribe token
    for Rosa's own channel and hit the real `/api/unsubscribe` landing on the
    real running designer-portal build; the row flipped to `unsubscribed` in
    the database. Confirming "the next send is refused" surfaced **W4R2-1**
    (§3) — it is not refused, because the lookup that would refuse it always
    errors on the real schema.
11. **"Log who was told"**: from the same project's Call Sheet → Site Access
    card, edited "The way in" (Lockbox version 3 → 4), which correctly opened
    the "Who was told" band with every checkbox starting unticked (S-6).
    Checked Luis Ochoa and Ngozi Eze, saved. The card read "Told: Luis Ochoa,
    Ngozi Eze. 2 more names are on the notice." and the database held exactly
    the row the report's own worked example describes: `subject_type =
    'project'`, `direction = 'out'`, `notice_of = "The way in changed 15 Sep
    2026. Lockbox, version 4."`, `notified_refs` holding both people's ids.

**Not walked, for lack of a live sender function in scope this round**: an
actual outbound email through `invoice-send`/`po-send`/etc. (only
`paperwork-upload` was served, per the binding instruction). W4R2-1 was
instead verified by calling the real shared gate function directly against the
real local database — the same code path a served sender function would call,
with the same result it would get.

---

## 5. Screenshots

All in `qa-w4-r2/`:

- `01-paperwork-page-form-filled.jpg` — Rosa's page, Licence form filled, pre-submit
- `02-paperwork-upload-received.jpg` — post-upload, unverified state on the firm's own page
- `03-paperwork-page-after-confirm-current.jpg` — Rosa's page after the studio confirmed: "Licence, current."
- `04-FINDING-access-grants-no-grant-on-file-despite-live-paperwork-link.jpg` — the company card's Access Grants region reading "No grant on file." with a live, non-revoked paperwork link on record (W4R2-2)
- `05-unsubscribe-landing-applied.jpg` — the real `/api/unsubscribe` landing, `status=applied`

---

## 6. Cleanup

- Both `next start` processes (designer :3000, client :3002) stopped.
- `supabase functions serve` stopped.
- Confirmed via `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN`: both ports free.
- `supabase status` confirms the edge runtime is stopped again (as it was
  before this round started) — no orphaned containers left running beyond
  the shared Postgres/API stack this program owns for the branch.
- Local test fixtures created by this round (the QA-minted paperwork link and
  the uploaded Licence document on Twin Cities Drywall & Plaster, the "way
  in" edit to Lockbox version 4, the unsubscribe of Rosa Delgado's channel)
  were **not** rolled back — they are real rows in the shared local database
  this wave owns, left as evidence. Flagging for the next round: Rosa
  Delgado's email channel is now genuinely `unsubscribed` in the local DB,
  and the Okonkwo residence project's lockbox version is now `4` with a
  logged notice — a future round replaying the same steps should account for
  this state rather than assume version 3 / active.

## 7. Not findings (settled)

Every ruling in `rulings.md` §3 is treated as settled and not re-litigated
here, per instruction.
