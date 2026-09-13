# W2b — the Directory, the two cards, the add sheet

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only. **Nothing was pushed to Strata**: no `supabase db push`, no `supabase functions deploy`,
no migration minted. No dev server was started; no e2e was run (the QA reviewer owns 3000/3002).

This wave is the surface W2a's primitives were built for: the room's unit stops being the party row
and becomes the person card, a firm becomes a card that owns paper and payment, and the Directory
becomes one hairline ledger of two entry types at the 1200 studio band.

---

## 1. Files

### New, under `apps/designer-portal/src/components/document/people/`

| File | What it is |
|---|---|
| `company-card.tsx` | The company card's six regions. The only place a compliance document, a payee identity, a signer or a paperwork contact is written |
| `reach-access.tsx` | Channels · Contact rule · Access grants, in that fixed order. Mounted on the person card; the company variant is the same three sections read off the firm's card |
| `compliance-table.tsx` | The seven-heading paper table, its 390 label-over-value stack, the per-document paper word, and `paperHeldClause` |
| `access-grant-list.tsx` | One row per door, the end date in words (PR-d), a two-step inline Revoke |
| `record-document-sheet.tsx` | The Record-a-document sheet. Every field label visible, no `placeholder` attribute anywhere |
| `compliance-chase.ts` | **The one addition to a layer W2a owns** — see §6 |
| `consent-sentence.ts` | R-Q's ONE wording, everywhere |
| `people-format.ts` | Long dates, money from integer cents, the Oxford-free word list |

### Changed

| File | Change |
|---|---|
| `people-room.tsx` | 1200 band (was 760 inside 1100); the head counts CARDS; six chips replace eleven roles; `?role`/`?view`/`?scope`/`?trade` kept AND kept current (PR-j); `?firm=` opens a company card; every Directory row opens the person card |
| `views/directory-view.tsx` | Rewritten: one mixed list, six chips, the trade line, the duplicate band, the empty sentence, search over name/firm/phone digits/trade/email |
| `directory/person-row.tsx` | Rewritten: hairline ledger row, three sibling controls, three word columns at 1440 and three plain words at 390, rule clause, seat disclosure |
| `directory/company-row.tsx` | Rewritten: 42px square, two word columns, `companyKindLabel` kept (the picker's mini row and the seed sheet import it) |
| `views/person-profile.tsx` | Rewritten as the person card: six regions with silent fallbacks. The maker branch survives (§6) |
| `directory/add-person-sheet.tsx` | Eight kinds, firm create-or-match, required trade, typed channel rows, contact-rule line, authority field, consequence sentence, terminal act; every `placeholder` removed |
| `party-profile-sheet.tsx` | Four `disabled` acts become held acts with a visible `aria-describedby` reason |
| `view-shell.tsx` | The compact selector widens with the room |
| `lib/document/people-derivation.ts` | The Directory's pure read models appended (§3) |

### Tests

New: `people-directory-derivation.test.ts` (18), `company-card.test.tsx` (10), `reach-access.test.tsx` (21),
`compliance-table.test.tsx` (12), `people-room-address.test.tsx` (5),
`directory/__tests__/add-person-sheet-kinds.test.tsx` (12).

Rewritten because they pinned behaviour this wave retires (each file's header says what moved and why):
`company-row.test.tsx`, `person-row-hardening.test.tsx`, `directory-scope.test.tsx`,
`person-profile.test.tsx`. Two label lines and one held-act assertion updated in
`add-person-sheet-letter.test.tsx`, `add-person-sheet-field-refusal.test.tsx`,
`party-profile-invite-to-texts.test.tsx`.

Playwright, chromium-pinned, under `apps/designer-portal/e2e/people/`: `directory.spec.ts`,
`person-card.spec.ts` (Leah task 4), `add-sheet.spec.ts` (Leah tasks 1 and 2),
`company-card.spec.ts`, plus `people-fixture.ts` (the DB reads and the teardown). **Not run here.**

### One file outside the declared surface

`src/lib/document/__tests__/document-action-hierarchy-contract.test.ts` asserted that
`person-profile.tsx` contains exactly two `tone="dark"` ProfileShell actions. The person card renders
no ProfileShell action row at all, so that one assertion was removed with a comment saying so; the
MakerProfile half of the same test is untouched and still passes. Flagged for the orchestrator.

---

## 2. Strings added

Every one comes from SPEC §5's acceptance lists or from the room's own voice.

| Where | String |
|---|---|
| Directory head | `"29 people · 22 firms"` shape — `directoryHeadLine` |
| Chips | Everyone · Clients · Crew · Makers · Studio · Firms, group label **"Narrow the book"**, trade line group **"Narrow by trade"** |
| Directory empty | **"Nobody under this narrowing yet."** |
| Duplicate band | **"These two cards share a phone."** followed by the two names. No merge act (R-Y) |
| Person card fallbacks | **"No contact rule on file."** · **"No grant on file."** · **"No open seat on this project."** · "No closed seat on file." · "No authority on this job" |
| Person card seat facts | "Escorted on site" · "Contracted through <firm>" · "Hidden from the client" |
| Send a text | "This sends one text to the number on file. They can stop it at any time by replying STOP." / "The studio holds no standing consent for this number, so no text may go out." |
| Reach & access | "Nothing on file yet. Add a phone or email to reach them." · "Record consent" · "Put it on the books" · "They told the studio to stop" · "Mint access" · "Edit the rule" · "Save the rule" · "Revoke" · "Close this door" · "Say why the door closes. Optional, kept with the record." |
| Held channel | "This address bounced back, <d Month yyyy>. Texts and calls still reach them." (and the unsubscribed / dead variants) |
| Consent (R-Q) | `"<Source> consent, <d Mon yyyy>, on the <project>."` — "Written consent, 2 May 2025, on the Lindqvist kitchen."; "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." |
| Grant | "Ends with the job, 13 August 2027. Renews when they use it." (+ "N days left." only inside fourteen days) · "Ends with the warranty, 21 November 2026" |
| Mint consequence | "This opens the Call Sheet and the site access card to <name> until the job's window closes, <date>. It never opens billing or the agreement." |
| Company card | "Crew & designations" · "No paper is held for this firm." · "Site access, payment and the draw are held until a current certificate is on file." · "This drafts a note to <firm>'s paperwork contact and files it for your review. Nothing is sent until you send it." · "Filed for your review. Nothing is sent until you send it." · "Remit to <firm>" · "Tax id ending 4417" · "Retainage 10%" · "Waiver ledger and draw state, in the money book." · "No verdict recorded." · "Record a verdict" |
| Record a document | "Record a document" · "File this document" · "A certificate that can lapse needs the date it lapses on." · "This one does not lapse, so it needs no date." · "What it holds up until it is current" |
| Add sheet | The eight kind words; "What kind of person" (group); "Full name" · "Company" · "A firm not on this list" · "New company name" · "Trade" · "Mobile" · "Email" · "How to reach them" · "A sentence, not a setting. “Text only. No working email.”" · "Authority" · **"Nothing defaulted from the agreement."** · "What they are to this job" · "Say what they are to this job." · "A sub or an installer needs the trade they work in." · "<name> is invited, not consenting, until they reply YES." · the consequence sentence · terminal act **"Add to the roster"** |
| Party sheet (held reasons) | "Tick the consent box above first. Patina never texts somebody the studio has not recorded consent for." · "Write the message first — a text with no words is not a text." |

No schema word reaches a face. `client_rep` is written by the household-member door and printed
nowhere — an e2e assertion pins that.

---

## 3. The acts, and what each writes

| Act | Writes |
|---|---|
| A chip, the trade line, MINE·STUDIO | nothing; narrows, and the address follows (PR-j) |
| Open a person / a firm | nothing; `peopleEvents.personCardOpened` / `companyCardOpened` |
| Record consent | `record_channel_consent` (PR-m's manual refusal included) |
| Edit the rule → Save the rule | `studio_contact_rules` upsert, with `route_to_person_id` |
| Mint access | `create_field_link` with the seat's window, or the warranty end when the studio picks it (PR-l) |
| Revoke | the tier's own RPC through `useRevokeAccessGrant`; a tier with no door here says so |
| Record a document | `studio_compliance_documents` insert |
| **Chase the renewal** | `enqueue_agent_task(p_task_type := 'compliance_chase', p_status := 'awaiting_review')`. **Sends nothing.** One idempotency key per firm per paper, `p_on_conflict := 'ignore'` |
| Record a verdict | `studio_contacts.studio_verdict` |
| Add to the roster | the seat, then the card (when a rule or a channel is typed and nothing auto-linked), then the typed channels, then the rule, then the authority grant |

**The add sheet's consent goes through `record_channel_invite`, not `record_channel_consent`** —
through `useAddProjectParty`, which W2a already gated on it. The brief named
`record_channel_consent`; SPEC §5.5 #15 names the face's own word, "invited, not consenting, until
he replies YES", and W2a §3 records why a repeat sub's standing grant may not be demoted to
`pending` by a second add. `record_channel_consent` IS the door behind the person card's "Record
consent". Flagged as a deliberate deviation.

---

## 4. The derivations added to `people-derivation.ts`

All pure, `today` injected, no React:
`directoryEntryKind` · `directoryEntryCounts` · `directoryHeadLine` · `directoryContactKind` ·
`directoryTradeOf` · `directoryFirmOf` · `directoryBandOf` · `directoryChipAdmits` ·
`directoryEntryMatches` · `personIdentityLine` · `firmIdentityLine` · `entryOwesPaperWord` ·
`entryPaperWord` · `contactRuleBlocks` · `directoryDuplicatePairs` · `splitRoutedClause` ·
`DIRECTORY_DUPLICATE_SENTENCE` · `DIRECTORY_EMPTY_SENTENCE`.

`splitRoutedClause` is the one that needs explaining. `contact_rule_summary()` already writes
"Write Rosa Delgado instead." inside its fixed clause order, but R-L/C22 require the routed line to
carry a WAY TO REACH her. The clause is lifted back out of the sentence and handed to
`ContactRuleLine`, which owns the single channel-selection rule (email if present, then the office
phone tel-linked); the rest of the summary prints in the order the database wrote it.

`deriveStatusDot` is deliberately still exported: `deriveNurtureQueue` calls it, and
`lib/document/__tests__/people-derivation.test.ts` pins it. **No surface renders a dot.**

---

## 5. Gates

```
pnpm --filter @patina/designer-portal type-check     0
pnpm --filter @patina/supabase        type-check     0
pnpm --filter @patina/admin-portal    build          0   (the strictest gate)
pnpm --filter @patina/designer-portal lint           0 errors, 203 warnings (all pre-existing kinds)

cd apps/designer-portal && npx jest
Test Suites: 583 passed, 583 total
Tests:       7373 passed, 7373 total
```

Playwright was **not** run: no dev server was started, and the QA reviewer owns 3000/3002 with
`next start`.

---

## 6. Not built, and why

1. **The party sheet does not yet fold its BODY into the person card's regions.** Only the
   `disabled` → `aria-disabled` + `aria-describedby` half landed (four acts). Mounting `ReachAccess`
   inside the sheet needs eight hooks that `party-profile-edit.test.tsx` and
   `party-profile-invite-to-texts.test.tsx` do not answer in their partial
   `jest.mock('@patina/supabase')` factories, and the sheet's read-only `<dl>` is the element
   `party-profile-edit.test.tsx` reads "Moretti Plumbing" from. The substance of R2 and R4 IS
   delivered — on the person card, where direction §3.2 puts it — and the sheet stays the SEAT's
   sheet (SMS thread and composer), reached from a seat line. The remaining fold is a mechanical
   swap plus two mock factories; it is W2c-adjacent since the roster row opens the same sheet.
2. **`someone else` writes `party_kind: 'other'`, not `other_named`.**
   `project_parties_party_kind_check` still admits eleven values (W2a §6 #2), so the written label
   rides in `trade`, the seat's one free-text descriptor. The CHECK widening is the migration this
   wave did not mint.
3. **No household OBJECT.** `client_households` is P2 (w1b §"Not done"), so "a household member"
   writes the `client_rep` seat plus its authority grant, and the change-order threshold lives on
   the grant. PR-c's household membership row is owed.
4. **`useChaseTheRenewal` lives under this surface, not in `@patina/supabase`.** W2a owns
   `packages/supabase/src/hooks` and exports no chase hook. The smallest possible addition is one
   file, `people/compliance-chase.ts`, calling `enqueue_agent_task` through `createBrowserClient`.
   **It belongs in the package the moment a second portal caller appears — orchestrator's call.**
5. **A maker still opens the vendor's own book.** Direction §4 says the four role-branched documents
   collapse into one card; three of them do. `role: 'maker'` is a `saved_vendors` row, not a studio
   card — it has no `studio_contacts` id to hang channels, a rule or paper on, and the marketplace
   lens opens it PRE-admission where no directory row exists at all. `profile/maker-profile.tsx` is
   also outside this wave's file list. A maker's REP (a person at a maker firm) is a card and gets
   the person card like anyone else.
6. **No Compare & merge.** Phase 2 (R-Y). The duplicate band names both cards and opens each.
7. **The person card's authority grants are read, never written, from the card.** The Add sheet
   writes one grant (`useSetPartyAuthority`) with the studio's typed phrase as `source_clause`;
   editing a grant in place, and PR-n's admin-only scope refusal in words, are not on this surface.
8. **The seat-count disclosure label** reads "N seats" rather than a phrase SPEC names; SPEC §5.1
   #8 specifies the seat LINE's words, which are the primitive's, not the toggle's.
9. **Firm row counts** are derived from the Directory's own rows (crew = identities pointing at the
   firm; open jobs = distinct `project_id` across them). A firm whose crew is entirely outside the
   caller's RLS reach will read "0 on the crew"; the honest alternative needs a count column on the
   view, which is a W1 object.
10. **`?person=` for an uncarded seat.** v4 gives a carded human `role: 'contact'`, and the row
    opens the person card. An uncarded seat still arrives under its own party kind and opens the
    person card too — its identity row exists — but its Channels, Contact rule and Paper regions
    read empty until the seat is promoted, and the card says so in words rather than hiding them.
