# Studio Rosters — the Call Sheet program

**Status: built.** Waves 1–5 are on `main` (2026-08-04), behind the `call-sheet`
feature flag. Ship to prod is still pending — no migration in this program has
been pushed to Strata, and the flag does not exist in PostHog yet.

A studio is a crew; a project is a production; Patina should know the call
sheet. The program gives the studio three things it never had:

1. **Staff titles** — a real vocabulary for who works at the studio, instead of
   free-text job titles that mean nothing to the software.
2. **The rolodex** — the studio's own contact book (`studio_contacts`), so the
   fifth project doesn't retype the same tile setter.
3. **The roster** — every person on a project, in one sheet, with the one fact
   that matters about each: *how do you actually reach them.*

## The two decks

Both live in this folder. They were written on 4 August 2026 as **proposals**,
and both say so in their own body copy ("Nothing here is built", "No migration,
no table, no route, no component"). That framing is **historical** — it was
true the morning they were written and false by that evening. Only the status
badges have been updated; the argument the decks make has been left exactly as
it was written.

| Deck | What it argues |
|---|---|
| [`the-call-sheet-proposal.html`](./the-call-sheet-proposal.html) | The concept: why the studio, the rolodex, and the roster are one program, and the four-phase build sequence. |
| [`the-call-sheet-ui-proposal.html`](./the-call-sheet-ui-proposal.html) | The screens: 8 full + 6 details, the sheet's three groups, the reach chip, the unfold, the kickoff band. |

## What shipped

### Migrations

| # | What |
|---|---|
| `00416_studio_staff_titles` | `organization_members.staff_role` / `job_title` — the staffing vocabulary's storage. |
| `00417_studio_contacts` | `studio_contacts` — the studio rolodex table + RLS. |
| `00418_studio_contacts_backfill` | Seeds the rolodex from work the studio already did (parties, saved vendors), with the fold's dedupe rules. |
| `00419_project_roster_wiring` | `project_parties.party_kind` widened (architect / photographer / stager / client), `show_to_client`, and `v_project_roster` — the Call Sheet's read model. |
| `00420_people_directory_studio_scope_and_client_read` | `people_directory` gains the new roster kinds, a `scope` discriminator (mine / studio), and a client read path. |
| `00421_studio_comember_read_policies` | Studio co-member SELECT policies for parties, team members, and saved vendors. |

### Surfaces

- **Wave 1 — titles.** `StaffRole` vocab in `@patina/types`, the `TitlePicker`,
  the member title line, staff role on studio invites, the day-1 studio setup
  checklist (U3) and the Desk's setup whisper (U7).
- **Wave 2 — the rolodex.** `studio_contacts` hooks, the rolodex section and
  seed review on the Account sheet's Studio page, and the `PromoteBand` inside
  `PartyProfileSheet` (promote a party into the studio rolodex).
- **Wave 3 — the sheet.** `v_project_roster` + `useProjectRoster`, the Call
  Sheet itself (`components/document/roster/`), the roster row and its unfold,
  the reach chip, the rolodex picker, the kickoff band, the letterhead
  instrument ("CALL SHEET · N · N ON PAPER"), the ⌘K doorway, and the
  coordination composer's party mini rows. `RoomSheet` joined the managed
  dialog stack in this wave — the reason a profile sheet can now open over the
  call sheet without either one eating the other's Esc.
- **Wave 4 — the directory.** The People Room's MINE · STUDIO lens over the
  studio-scoped `people_directory`, and the client portal's "On the job" group
  (`ProjectTeamPanel`) — the opted-in half of the roster, seen from the client's
  side.
- **Wave 5 — closing the gaps.** The project's own client on the call sheet (a
  synthetic row — `v_project_roster` has no client branch), the roster chevron
  wired to `PartyProfileSheet` (it had no `onOpenProfile`, so every chevron was
  dead and the promote route from the sheet was orphaned), `junior_designer` in
  the staff vocabulary, the Desk whisper's rolodex count, and these docs.

### The flag

Everything is gated on **`call-sheet`**, checked at each consumer (never in the
surface registry — that file stays data-only). The flag **has not been created
in PostHog**. Until it is, the only way to see any of this is the local
override:

```bash
# apps/designer-portal/.env.local
NEXT_PUBLIC_FLAG_OVERRIDES=call-sheet:true
```

Flags fail closed, so with no PostHog flag and no override the entire program is
invisible — which is the intended pre-ship posture.

## Follow-ups

Open work, roughly by weight. None of it blocks the ship; all of it was either
cut on purpose or surfaced by the Wave 5 audit.

| # | Follow-up | Note |
|---|---|---|
| 1 | **Staff typeahead writes `project_team_members`.** | Naming a studio member on a project still has no typeahead — the roster reads team rows it cannot help you create. |
| 2 | **Playwright walks.** | Four owed: W1 title-setting, W2 promote-to-rolodex, W3 instrument → sheet → unfold, W4 client-portal seeded roster. Jest covers the units; nothing walks the program end to end. |
| 3 | **CSV rolodex import.** | Cut from day-1 seeding in favour of the 00418 backfill. Needs a ruling before it's built — it is a different promise ("bring your book") than the one the fold makes. |
| 4 | **`project_parties` REMOVE is a hard delete.** | Taking someone off the call sheet destroys the row, its consent history, and its field-link lineage. A soft-delete ruling is owed. |
| 5 | **Picker Companies chip.** | The rolodex picker filters by kind but has no company lens — a studio with three contacts at one vendor can't ask for "everyone at Ochoa". |
| 6 | **Composer mini-row field-link reach.** | The coordination composer's mini rows show the party but not whether a field link is live for them. |
| 7 | **Persistent archived-rolodex doorway.** | `useStudioContacts({ includeArchived })` exists; no surface reaches it, so an archived contact is only recoverable through SQL. |
| 8 | **Call-sheet company avatars (U5).** | `RosterRow` draws a person avatar for every row, including company-shaped ones (vendors, receivers). U5 in the UI deck proposes a company mark. |
| 9 | **Collapse devices ("+N more").** | The sheet prints every row at any length. The deck's long-roster device is unbuilt. |
| 10 | **Instrument count vs sheet count.** | The letterhead instrument counts `v_project_roster` rows only, so a project reads "CALL SHEET · 3" beside a sheet that says "4 ON THE JOB" — the difference is the synthetic client row. Either the instrument learns the client or the sheet's mono line is re-scoped; it is a design ruling, not a bug fix. |
| 11 | **"Nothing here is built" cards in the decks.** | The proposal deck still carries a body card saying no code exists. Only status badges were updated (Wave 5's brief); the card is left as written for the historical record. |
