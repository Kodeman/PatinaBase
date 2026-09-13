# W2 fix log — round 7

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, base HEAD `4aadffce4` (the round-6
fix commit). Six findings assigned: `QA-R7-1`, `QA-R7-2`, `QA-R7-3` (blocking),
`CR7-1` (blocking), `CR7-2` (major), `CR7-3` (major). Nothing else in
`w2-review-r7-qa.md` or `w2-review-r7-code.md` was touched — `QA-R7-4`,
`QA-R7-5`, `QA-5..QA-12` and the 41 carried code-review minors are untouched
and still open. **No migration was minted** (W2 still mints from `00628`); no
server was started, no port taken, no production anything. The local database
was read for evidence only.

## Gates, after the edits

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check
EXIT=0

$ pnpm --dir <worktree> --filter @patina/supabase type-check
EXIT=0

$ cd <worktree>/apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document src/components/document/rooms 'src/app/(document)/desk' \
    src/components/document/mobile src/components/document/coordination \
    src/components/document/__tests__ src/lib/analytics
Test Suites: 269 passed, 269 total
Tests:       4128 passed, 4128 total
EXIT=0

$ pnpm --dir <worktree> --filter @patina/admin-portal build
EXIT=0   (@patina/supabase changed — the shared-package gate)

$ npx eslint <the eight touched non-test files + the new test>
(no output)
```

`packages/types` was **not** touched this round, so no dist rebuild was owed;
`@patina/supabase` is source-resolved, and the admin-portal build is the gate
that proves it.

---

## QA-R7-1 — the Directory identity line prints the trade again

**What was wrong.** `personIdentityLine` appended `directoryTradeOf(p)`, which
reads `meta.trade` / `meta.specialties[0]`. `people_directory`'s CONTACTS
branch — where 00626 put every carded human — carries neither for a crew or sub
card, because **trade is a SEAT fact** (`project_parties.trade`) and the card
has no column for it. So every crew/sub row printed the firm's name alone where
SPEC §5.1 #8 fixes it as "Northgate Electric · electrical".

**What changed.** The portal route, not the view (no migration):

- `lib/document/people-derivation.ts` — new `directorySeatTradeIndex(seats)`:
  one pass over `people_directory_seats`, keyed on **both** joins a Directory
  row answers to (`identity_key` and `person_id`), answering with the trade of
  the most relevant seat — an OPEN seat's trade over a finished one's (worst
  case falls back to a finished seat), blank trades skipped, first-wins within
  either group over the view's now-deterministic order (CR7-3).
- `personIdentityLine(p, seatTrade?)` — the card's own trade or specialty still
  wins; the seat answers when the card carries none.
- `directory/person-row.tsx` — new `seatTrade` prop, used by both the printed
  line and `openPersonLabel` (so the screen-reader name and the visible line
  stay the same sentence).
- `views/directory-view.tsx` — computes the index from `usePeopleSeats({all:
  true})`, **which the view already read** for the firm rows' "N open jobs"
  (QA-R2-2), and hands each row its trade. No new query.

**Evidence.** Local DB, the seats behind the rows QA sampled:

```
 trade             | stage    | full_name        | project
-------------------+----------+------------------+-------------------
 electrical        | active   | Dana Kowalski    | Okonkwo residence
 electrical        | warranty | Dana Kowalski    | Lindqvist kitchen
 drywall           | awarded  | Rosa Delgado     | Okonkwo residence
 carpentry_framing | active   | Joe Wozniak      | Okonkwo residence
 plumbing          | awarded  | Pete Rusk        | Okonkwo residence
 cabinetry         | awarded  | Ingrid Halvorsen | Okonkwo residence
```

So Dana's row now reads `Northgate Electric · electrical` (the OPEN Okonkwo
seat, not the Lindqvist warranty one), Rosa `· drywall`, Joe `· carpentry &
framing`, Pete `· plumbing`, Ingrid `· cabinetry`. Tom Marrow and Ray Thao
carry no trade on any seat and correctly still print the firm alone.
`people_directory_seats.person_id` is `COALESCE(studio_contact_id, …)`
(00626:2061), i.e. the card id — the same value the contacts branch emits as
`person_id` — so the join key is exact.

**Tests.** `people-directory-derivation.test.ts` → "QA-R7-1 — the trade lives on
the seat" (4 cases: firm alone, seat trade appended, card outranks seat, open
seat outranks a warranty seat on both keys + blank skipped).

---

## QA-R7-2 — no raw specialty token on a face

**What was wrong.** `studio_contacts.specialties = {tile_stone}` for Claire
Bissett (confirmed in the local DB). `directoryTradeOf` returned it verbatim and
`personIdentityLine` labelled it with `getFieldTradeLabel`, whose fallback is
**the raw string** for anything outside `FieldTrade` — and `tile_stone` is a
`VendorSpecialty`, a different vocabulary. Her row printed
"Stonehaven Tile Gallery · tile_stone", a schema word on a face (SPEC §8 #3).

**What changed.** `packages/types` already carries the specialty map
(`VENDOR_SPECIALTY_LABELS.tile_stone = 'Tile & stone'`, `getVendorSpecialtyLabel`,
`studio-config.ts:120/148`) and `people-derivation.ts` already imported it, so
no new map and no dist-bearing edit was needed — the branch just had to be
routed through it:

- `directoryTradeEntryOf(p)` now returns `{ value, vocabulary }`, naming which
  of the two lists the value came out of. `directoryTradeOf(p)` is kept as the
  raw-value wrapper, so the Directory's trade chip (`directory-view.tsx:328`)
  narrows on exactly what it narrowed on before.
- `directoryTradeLabel(value, vocabulary)` labels out of the right list, and —
  because `getFieldTradeLabel` hands back the raw token for anything it does not
  know — puts an unrecognized *trade* through the specialty map's humanizing
  fallback too. Nothing reaches a face as snake_case, from either list or from
  legacy free text.
- `personIdentityLine` and `directoryEntryMatches` (the ask bar's haystack) both
  use it, so the studio can search on the words the row prints.

**Evidence.** `tile_stone` → "Tile & stone" → row prints
"Stonehaven Tile Gallery · tile & stone". `radon_mitigation` (a real
`FieldTrade`) still resolves through the trade map. An unknown token
(`chimney_sweep`) humanizes rather than printing raw.

**Tests.** "QA-R7-2 — two vocabularies, no schema words" (3 cases, including
Claire Bissett's whole identity line and the ask-bar match).

---

## QA-R7-3 — a legacy `designer_clients` row is no longer a person card

**What was wrong.** `people_directory`'s CLIENTS branch emits one row per
`designer_clients` row — the pre-People-CRM lead/client tracker. The Okonkwo
seed's row there is the **household**:

```
id           d0e80000-0000-0000-0000-000000000001
client_name  The Okonkwo household
client_phone (612) 555-0104      ← Adaeze's own number
```

The Directory stood it up as a first-class person row **and** paired it with
Adaeze in the duplicate-phone band, where R-Y asks for the two people who share
a number. The card it opened contradicted the row that opened it — the branch
hard-codes `seat_count` 0 and NULL for `consent_status`, `paper_state` and
`contact_rule_summary` (00626:1461-1487), so the card read "Nothing on file
yet…", "No contact rule on file.", "No grant on file.", "Worked 0 of the
studio's projects." under a row printing a live `tel:` to that very number.

**What changed.** `directoryEntryIsLegacyClientRecord(p)` — `p.role ===
'client'`, the CLIENTS branch's own literal (00626:1437) — and it is excluded in
two places:

- `directoryIdentityRows()`, which is the single filter behind **both** the
  Directory's list (`directory-view.tsx:152`) and the head count
  (`people-room.tsx:476`). The standalone row and its contribution to the head
  both go.
- `directoryDuplicatePairs()` itself, as a guard, so the function is safe called
  with raw rows (a test calls it directly).

E1 person identity is `studio_contacts` (direction §2.2). Adaeze
(`d0e10000-…-0004`) and Chidi (`…-0005`) each hold one and are untouched — they
are the cards the Directory stands for. A household's own Directory presence is
PR-c's `client_households` object, P2 scope.

**Left standing, deliberately.** Adaeze and Chidi hold *different* numbers in
this seed (`…0104` / `…0105`), so no duplicate band renders for them. That is
the seed telling the truth: SPEC §5.1 #17's two-spouses-share-a-number scenario
is not in the data, and manufacturing it would be a seed change this round was
not asked for. The band's machinery is proven by a unit test that gives them the
same number.

**Tests.** "QA-R7-3 — a legacy designer_clients row is not a person card"
(3 cases: out of the identity list and the head count; out of the duplicate
scan; two real cards sharing a number still pair).

---

## CR7-1 — the People Room's head count prints at 390

**What was wrong.** `room-shell.tsx:151-155` rendered the count in a span
classed `hidden … sm:inline`. Tailwind's default `sm` is 640px and the designer
portal's `tailwind.config.ts` defines no `screens` override, so below 640 the
head fact SPEC §5.1 #1 fixes — the `<h1>` **and, beside it**, "N people · N
firms" — computed to `display:none`. Round 6's own capture
(`build/qa-w2-r6/live-390-directory.html`) holds the string in the DOM, painted
at neither 390 nor anything under 640.

**What changed.** `RoomShell` is shared by nine Rooms, so the fix is an opt-in,
not a global unhide:

- `rooms/room-shell.tsx` — new `countAtEveryWidth?: boolean`. When set, the
  count span drops `hidden sm:inline` for `inline`, and the head's middle cell
  gains `min-w-0 flex-wrap justify-center gap-y-0.5` so the count **wraps under
  the heading** instead of widening the row. A narrow screen gains a line of
  head, never a sideways scroll (SPEC §6.2 / the 390 overflow check). The span
  also gains `data-room-count` so the next QA round can assert on it directly.
- `people/people-room.tsx` — passes `countAtEveryWidth`.

The other eight Rooms are byte-identical in behaviour: without the prop the
class string is exactly what it was.

**Not done, per the finding's own instruction.** The compact selector's
`directoryCount={all?.length}` was left alone — it is a view chooser, not the
room's head, and CR7-5 carries that raw-count defect separately.

**Tests.** New `rooms/__tests__/room-shell-count.test.tsx` (3 cases: the default
Room keeps `hidden sm:inline`; the People Room prints `inline` with no `hidden`;
heading and count share one wrapping head row).

---

## CR7-2 — a firm's card reads firm-scoped tokens only

**What was wrong.** `company-card.tsx:342-345` built `firmSeatIds` from every
seat of every crew member and passed it as `grantSubjectIds`. On a `field_link`,
`v_access_grants.subject_id` **is the engagement** (00627:385), so the FIRM's
card listed its people's personal doors: `ACCESS_GRANT_TIER_LABELS.field_link` =
"Field link" — one of direction §3.8's three reach words — on a card SPEC §5.3
#9 says carries no reach word at all, with a live **Revoke** beside it, because
`isAccessGrantRevokable('field_link')` is true. Confirmed on the live seed
(Erin Sato ×2, Luis Ochoa, Dana Kowalski, Pete Rusk, Joe Wozniak).

**What changed.** The company variant now reads the firm's OWN tokens:

- `company-card.tsx` — `firmSeatIds` is gone; `firmGrantSubjectIds` is
  `[card.id]`. The one tier keyed on a firm is `agreement_link`
  (`subject_type = 'contact'`, `subject_id = studio_trade_agreements.contact_id`,
  00627:199) — i.e. this card's id. An engagement-keyed door cannot match a card
  id, so no reach word and no crew Revoke can appear.
- `reach-access.tsx` — the render holds the same promise structurally: when
  `cardKind === 'company'` the grants are filtered to `subject_type ===
  'contact'`. Belt and braces, so a future subject list cannot reopen it.

The empty state stays R-V's exact sentence, "No grant on file." — accurate for a
firm holding no agreement link, and no new copy invented.

**Tests.** reach-access.test.tsx → "CR7-2 — a firm's card reads firm-scoped
tokens only" (3 cases: a crew `field_link` is withheld, word AND Revoke, and the
region falls back to "No grant on file."; a firm's own `agreement_link` still
prints; a person's own card is untouched). The mock's tier-label map gained
`agreement_link`, which the real `@patina/supabase` map has carried since 00627.

---

## CR7-3 — the acts name the seat they land on

**What was wrong.** `person-profile.tsx:278` takes `firstSeat = liveSeats[0]`
and that one seat drives three writes — the minted field link's `partyId`, the
recorded consent's `origin_project_id` (the job R-Q prints in every consent
sentence afterwards), and the sheet "Send a text" opens. `usePeopleSeats`
(`use-people.ts:307-326`) issued `select('*')` with **no `.order()`**, so
`liveSeats[0]` was whatever order PostgREST returned. Latent on today's seed
(every multi-seat identity holds one live seat plus one `warranty`, and
`warranty` is in `DONE_STAGES`), ordinary the moment a sub runs two live jobs —
Leah task 5's own premise.

**What changed.** Both halves the finding names:

1. `packages/supabase/src/hooks/use-people.ts` — `usePeopleSeats` now orders
   `on_site_from` descending with **nulls last**, then `seat_id` ascending. One
   card reads the same way twice, and `directorySeatTradeIndex` (QA-R7-1) rests
   on the same determinism.
2. The face names the job:
   - `mintConsequenceSentence(name, windowEnd, projectName?)` prints "…to Dana
     Kowalski, **on the Okonkwo residence**, until the job's window closes,
     13 August 2027…". With no project name the sentence is byte-identical to
     what it was, so the no-window case is unchanged.
   - The Record-consent band opens with "This is recorded on the Okonkwo
     residence." (`data-consent-origin`), in R-Q's own "on the <project>"
     grammar — the band that stamps `origin_project_id` now says which job it is
     stamping.

**Not done, deliberately.** No seat CHOOSER was added: the finding offers "let
the studio pick … **or** print the job", and a picker inside Reach & access is a
new control this round was not scoped for. "Send a text" was left alone for the
same reason — the fix direction names the mint sentence and the consent band.

**Tests.** reach-access.test.tsx → "CR7-3 — the acts name the job they land on"
(the mint sentence with a project; the consent band's line after opening
"Record consent"), plus the pre-existing mint assertion updated to the new
string and the no-window case left asserting the old one.

---

## Files touched

```
apps/designer-portal/src/lib/document/people-derivation.ts
apps/designer-portal/src/components/document/people/views/directory-view.tsx
apps/designer-portal/src/components/document/people/directory/person-row.tsx
apps/designer-portal/src/components/document/people/people-room.tsx
apps/designer-portal/src/components/document/people/company-card.tsx
apps/designer-portal/src/components/document/people/reach-access.tsx
apps/designer-portal/src/components/document/rooms/room-shell.tsx
packages/supabase/src/hooks/use-people.ts
apps/designer-portal/src/components/document/people/__tests__/people-directory-derivation.test.ts
apps/designer-portal/src/components/document/people/__tests__/reach-access.test.tsx
apps/designer-portal/src/components/document/rooms/__tests__/room-shell-count.test.tsx   (new)
```

## What the next round should re-walk

- The head count changes value: the legacy `designer_clients` rows leave it, so
  r7's live "41 people · 21 firms" will read lower. That is QA-R7-3 landing, not
  a regression — and the count is now visible at 390, which is where CR7-1 said
  it had to be.
- The Directory's Clients chip now lists only carded clients
  (`studio_contacts`), which in the Okonkwo seed is Adaeze and Chidi.
- Northgate Electric's company card should print "No grant on file." under
  Access grants where it printed Dana's field link.
