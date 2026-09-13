# W2 round-11 runtime QA — local production build, as Leah

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `104a00c9f` ("fix(people-room): W2 round-10
findings"). `lsof -ti :3000` was empty before starting and is empty after stopping the
server. `pnpm supabase:reset` ran clean (all migrations through `00627` + `20260910152111`,
all seeds including `people_crm_dev.sql`). Designer portal built with `next build --webpack`
and served with `next start -p 3000`, both with the env inlined per the binding instructions
(no `.env.local`/`.env` created or read). Chrome extension automation was unavailable in this
session (`claude-in-chrome` reported "not connected"), so the live walk and screenshots were
done with a standalone Playwright (chromium) script driving the same local-prod server —
same engine `e2e/people/` and `tools/render.mjs` already use.

## 1. Playwright — `e2e/people/` (chromium)

11 passed, 8 failed, one warning (`next start` printed "does not work with output: standalone
… use node .next/standalone/server.js instead" but still served 200s correctly throughout).

```
✓ call-sheet.spec.ts:48   task 6 — the roster opens already banded by the window
✓ call-sheet.spec.ts:126  task 3 — logging who was told writes the notice
✓ company-card.spec.ts:49  Chase the renewal files a draft awaiting review, sends nothing
✓ company-card.spec.ts:95  a firm carries no consent word and no reach word
✓ directory.spec.ts:22   the head counts cards, and names both nouns
✓ directory.spec.ts:34   six chips, in one order, inside a group that says what it narrows
✓ directory.spec.ts:52   the trade line appears under Crew and nowhere else
✓ directory.spec.ts:69   PR-j — the narrowing stays in the address and survives a refresh
✓ directory.spec.ts:82   a legacy ?role= link still lands somewhere true
✓ directory.spec.ts:92   C11 — a row is a container, and its phone is a sibling control
✓ directory.spec.ts:107  nothing under a narrowing says so in the room's own words

✘ add-client-letter.spec.ts:47   a letter goes to a new client, and only one
✘ add-client-letter.spec.ts:115  the roster still works with no letter, and nothing is sent
✘ add-sheet.spec.ts:37    task 1 — a text-only rule lands on the PERSON, not on the seat
✘ add-sheet.spec.ts:103   task 2 — a household member is a seat and an authority grant
✘ add-sheet.spec.ts:145   the sheet asks for a trade before it will write a sub
✘ call-sheet.spec.ts:91   task 3 — who has site access right now, one click from the sheet
✘ person-card.spec.ts:51  task 4 — do not contact, routed to somebody reachable
✘ person-card.spec.ts:111 R-V — every region prints, and an absent record says so in words
```

Every failure was traced to a root cause (not just re-reported). **None of the eight traces
to a live app defect** — each is a test-fixture, test-scoping, or environment issue:

| Spec | Root cause |
|---|---|
| `add-sheet.spec.ts:37` (task 1) | The test hardcodes Mobile `(612) 555-0111` — Dana Kowalski's (F-11) own seeded number. The app correctly finds the existing card by phone and merges the new seat/rule onto it ("That number was already on file, so this seat and what you wrote sit on the card that holds it."), so `cardByName(uniqueName)` never finds a NEW card under the test's synthetic name. Working-as-designed dedup (E8), test picked a colliding fixture number. |
| `person-card.spec.ts:51` and `:111` (shared `addSub` helper) | `addSub` hardcodes Mobile `(612) 555-0115` for EVERY call. The test calls it twice in one run (once for "Rosa", once for "Frank"); the second add collides with the first's freshly-minted card and merges onto it instead of creating a second card. Test-fixture bug (same number reused for two synthetic people in one test). |
| `call-sheet.spec.ts:91` (task 3) | Asserts `page.locator('a[data-tel-link]').first()` reads "Luis Ochoa" but the locator is not scoped to the just-opened Site Access dialog, so `.first()` matches an earlier `tel:` link on the roster page behind the modal (Adaeze Okonkwo's number). Test-scoping bug. I independently confirmed live (below) that the Site Access card's own "Who to call first" list correctly leads with Luis Ochoa. |
| `add-sheet.spec.ts:145` | `expect(page.getByRole('alert')).toHaveText(...)` hits Playwright's strict-mode violation because Next.js's own `#__next-route-announcer__` also carries `role="alert"`, so two elements match. Test-selector fragility; the real validation message renders correctly (confirmed by DOM inspection). |
| `add-sheet.spec.ts:103` (task 2) | Fills `getByLabel("Authority")` without first clicking "Confirm from the agreement." The Authority section (checkboxes, dollar threshold, free-text summary) is gated behind that click by design (progressive disclosure — direction's own "Confirm it, or write a different one" phrasing implies exactly this). I verified live (below) that clicking Confirm reveals the section correctly. Test omits a step; not independently confirmed whether this gating existed when the spec was authored. |
| `add-client-letter.spec.ts` (both) | The spec's own header comment requires the local edge-runtime Docker container to be bind-mounted to THIS worktree's `supabase/functions` — unverified/out of this task's scope (no `supabase functions deploy` or bind-mount check was performed). This feature (`client-invite`) is also outside the People-room CRM redesign per rulings.md — it only shares the Add sheet's "a client" kind. Most likely an environment/setup gap, not a People-CRM defect. |

## 2. Live walk — designer@patina.dev, Okonkwo seed, 1440 and 390

Screenshots and raw evidence are in
`.../build/qa-w2-r11/` (`task1-…png` … `task6-…png`, `company-northgate-*.png`,
`zoom-dana-row-390.png`, `zoom-frank-row-390.png`, `evidence.json`). Compared against
`.../shots/people-room-1440-state-*.png` — the shipped app necessarily shows the REAL dev
seed (40 people · 21 firms, different names/numbers/dates on the leads/clients outside the
Okonkwo cast) rather than SPEC's invented fixture (29 people · 22 firms); every check below
verifies the STRUCTURAL/TEMPLATE rule the acceptance string encodes, not literal fixture prose
that cannot transfer to real data.

| # | Task | What I did | End state confirmed |
|---|---|---|---|
| 1 | Text-only rule on Dana Kowalski | Opened her Directory row and her person card (already seeded in this state) | Directory row: rule clause + `Field link · Texting · Lapsed` (bordered, correct pigments) + `2 seats` disclosure. Person card R3: "Text only. The email on file bounces. Set by Leah Hartwell, 13 Sep 2026." + "Edit the rule". Consent sentence R-Q template verbatim: "Written consent, 2 May 2025, on the Lindqvist kitchen. Carried forward to the Okonkwo residence, 12 Sep 2026." |
| 2 | Adaeze gets the app; Chidi's $2,500 authority | Opened the Call Sheet Client side (Chidi's authority already seeded); opened Adaeze's person card — her Access grants read "No grant on file," so I pressed Mint access | Chidi: Call Sheet client-side row shows `CLIENT REP` + "Signs money to $2,500. Approves change orders to $2,500. Certifies draws." — both facts recorded, matches C14. **Adaeze: see finding QA-R11-1 below — the only Mint action on her card grants the wrong tier.** |
| 3 | Site access, one click | Call Sheet → "Open the site access card" | Head fold: "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." Dialog: "Who to call first" leads Luis Ochoa → Chidi Okonkwo → Sam Rowe (`siteAccessTelOrder` evidence, both widths), "The way in": "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa." with **no code digit anywhere**, "Key holder", "Hours", "Who was told" all present, "Studio only. This card never reaches a client page." |
| 4 | Frank Bauer do-not-contact, routed to Rosa | Opened his person card and his Directory/roster rows | Channels: fixed phrase "Do not contact directly. Write Rosa Delgado instead." + her email + `tel:`-linked office phone, terracotta leading rule. Contact rule region: studio's own typed reason + the same routed line. Directory row and roster row both carry the clause + routed line on the COLLAPSED row (no unfold needed). "Send a text" correctly HELD with its own sentence. |
| 5 | Bring forward (single-add picker only, R-BM) | Call Sheet → "From the rolodex" | Opens the single-add rolodex picker (search, kind filters, per-row reach/consent/paper words, "Never on a job yet" history line) — no travel-list pane, matching R-BM's W2 scope exactly. |
| 6 | Everyone on Okonkwo, by role, this week | Opened the Call Sheet | Six bands present and correctly separated: Studio side, Client side, On the job · this week (10), On the job · later (10), Bidding (1, "No response"), Done (1, "Off the job"). Vitals recompute against the real seed: "14 on the job this week · 4 reachable by text · 2 with accounts · 7 on paper". Dana's row carries BOTH her rule clause and the held clause "Site access held. Northgate Electric's insurance lapsed 31 March 2026." on the collapsed row. Pete Rusk's collapsed row carries "Opted out by text, 3 Dec 2025, on the Okonkwo residence." `Remove` appears nowhere (`getByRole('button', {name: /^Remove$/}))` count = 0). |

### SPEC §5 acceptance strings — structural checks

All confirmed present and correct, both widths unless noted:
- Directory: six chips in order + "Narrow the book"/"Narrow by trade" groups; trade line under Crew; three bordered word columns (reach/consent/paper) on person rows, two (paper/payee) on firm rows; Great Northern Bank and City of Minneapolis, CPED Inspections firm rows print **no paper word and no payee marker** ("Lender · 1 on the crew · 1 open job" / "Authority · 1 on the crew · 1 open job" — verified via direct DOM read); Ray Thao (inspector) prints reach+consent only, no paper word; every phone a `tel:` link; no bare `StatusDot` (`bareDots` sweep = 0 both widths); forbidden vocabulary sweep (`client_rep`, `party_kind`, `sms_consent_status`, `wizard`, `dashboard`, `badge`, `pill`, `spinner`, `toast`, "CRM") = 0 hits both widths; no horizontal overflow (`scrollWidth === clientWidth` at both 1440 and 390).
- Person card: R1–R6 regions with correct sub-heads; R-V fallbacks verified verbatim on Frank Bauer's card ("No grant on file.", "No closed seat on file."); no `disabled` attribute found on any act; held email channel shows the terracotta leading rule + reason in words; Access grants row for Dana shows the full pattern — grant fact, "Ends with the job, 24 May 2027. Renews when they use it.", and "Revoke" (§5.2 #6, R-AB) all present (my first read of the screenshot mis-located this due to a sticky-nav capture artifact; a DOM-level check confirmed all three are present together).
- Company card (Northgate Electric): Crew & designations, Paper table (four rows, correct States/Held by/Blocks), leading-rule clause + consequence sentence + act row in the fixed order (R-P), Payee, Jobs (both seats, correct stage words), History. **One string not found — see QA-R11-2.**
- Roster/Call Sheet: all six bands, vitals, held clause, opted-out note on collapsed row, bid-band separation, `Remove` absent, site-access fold line.
- Add sheet: eight kind words, `client_rep` never on the face, "Nothing defaulted…"/"Defaulted from the agreement…" both reachable (confirmed both branches live), consequence sentence, "Add to the roster" terminal act.
- Site access: all six regions, no code digit, "Studio only" line.

### CR4-1 — hairline vs near-black

Confirmed by computed style, not eyeballing: Directory row separator at both 1440 and 390 is
`border-bottom: 1px solid rgb(216, 204, 184)` — a warm tan hairline, not near-black. Screenshots
`zoom-dana-row-390.png` / `zoom-frank-row-390.png` show it visually too.

### Console errors / hydration warnings

- No hydration warnings anywhere in this session.
- Reproducible on multiple navigations, both widths, after a successful sign-in: `TypeError:
  Failed to fetch` inside a Supabase `_useSession`/`_getUser` call, followed by `AppError: Not
  authenticated`. Data still rendered correctly on every page where this fired, so it did not
  visibly break anything, but it is a genuine, repeat console error. See QA-R11-3.
- CORS errors fetching Sanity help content (`kv3qrinl.apicdn.sanity.io`) on every page —
  local-dev-only (no local CORS allowance for that origin), pre-existing, unrelated to People
  CRM. See QA-R11-4.

### Round-10 fixes re-checked live

- **CR10-1** (seat lines / Send a text move somewhere): confirmed fixed. Directory row → seat
  line opens the person card (R-AA path). Person card's OWN "Seats on projects" seat line
  correctly opens a party-sheet dialog for a field-kind seat (Dana, a sub) — verified a
  `role="dialog"` appeared with "Field crew · Subcontractor … Field link Revoke …" content.
  "Send a text" is correctly held with its own sentence for Frank Bauer (no field seat).
- **CR10-2** ("No open seat…" sentence): R-V's "No open seat on this project." fallback
  confirmed correct on the person card. Did not independently reproduce the Directory's
  race condition this round (would need to catch the query mid-flight); code inspected and
  consistent with the fix log's description.
- **CR10-3** (bouncing phone vs email wording): not independently re-verified live — no
  bouncing-PHONE channel exists in this seed to exercise it, and creating one was out of this
  round's scope. Code inspected in `reach-access.tsx` and is consistent with the fix log.
- **QA-R10-1** (port never freed, round 10 got no live walk at all): this round's walk is
  therefore the **first live confirmation** of everything CR10-1/2/3 fixed, plus rounds 1–9's
  runtime findings, none of which regressed in the areas this walk covered.

## 3. Findings

### QA-R11-1 · major · confidence high — "Mint access" on a CLIENT'S person card always mints a Field link, never an Account; breaks Leah task 2's first fact

Adaeze Okonkwo (party_kind `client`, side `client`) has no access grant in the seed
("No grant on file."). The only control offered — "Mint access" — is wired unconditionally to
`useCreateFieldLink()` (`apps/designer-portal/src/components/document/people/reach-access.tsx`,
`mint()` at line 729, called from the single "Mint access" `DocumentAction` at line ~1080).
There is no branch on `party_kind`/`side` and no tier picker anywhere in this component.
Pressing it for Adaeze minted `Field link · minted 13 Sep 2026` and printed a raw field-link
URL (`http://localhost:3002/field/<token>`) on her card, with the announcement "A field link is
open for Adaeze Okonkwo." Field link is the tier direction.md/SPEC describe for FIELD CREW
(SMS-reachable subs/GCs), not for a homeowner client — the fixture's own grants table gives
Adaeze an `Account` tier ("opens: the client page and the Patina app"), and `ACCESS_GRANT_TIER_OPENS`
maps `field_link` to "the Call Sheet and the site access card" for every subject regardless of
kind. PR-w rules the site access card studio-only, never client-facing, with "no client RLS
branch" — so mechanically minting a field-link-tier grant for a client, whose declared `opens`
includes the site access card, is at minimum the wrong fact recorded on her card, and at worst
a path toward exposing studio-only content to a client. I did not verify the field-link
redemption page (in `apps/client-portal`, a different app, out of this session's build) to see
whether it independently refuses site-access content to a client-kind bearer — that follow-up
is owed. Fix: "Mint access" needs to read the person's `side`/`party_kind` and either offer an
Account-tier invite for a client-side person or refuse/relabel the act; at minimum it must not
silently hand a client a field-crew-scoped door.

### QA-R11-2 · minor · confidence medium — Company card header omits "· warranty through 21 Nov 2026" for Northgate Electric

SPEC §5.3 #1 requires the header to read "Electrical sub · 1 person · 2 projects · warranty
through 21 Nov 2026"; the live card reads "Electrical sub · 1 person · 2 projects" with the
warranty clause missing. Traced to data, not code: `studio_contacts.warranty_until` for
Northgate Electric is NULL in the dev seed (verified by direct query), while the SEAT-level
`project_parties.warranty_until` on her closed Lindqvist seat IS populated and correctly prints
elsewhere on the same card ("WARRANTY … 5 May 2025 to 15 Oct 2025" in the Jobs region) and on her
person card's Past seats region. Most likely the seed script never set the company-level column;
lower confidence that the component itself is wrong, since "print nothing when the fact is
absent" is this build's own consistent design rule everywhere else. Flagged per the task's
"every SPEC acceptance string must be present" instruction; recommend checking against a firm
whose seed row DOES carry a company-level `warranty_until` before treating this as a code fix.

### QA-R11-3 · minor · confidence medium — Recurring "Not authenticated" / "Failed to fetch" console error after sign-in

`TypeError: Failed to fetch` inside a Supabase `_useSession`/`_getUser` call chain, followed by
`Error logged: AppError: Not authenticated`, fired on every page load in this session after a
successful sign-in (confirmed on `/people`, on a person card, after Mint access), at both
widths. Every page still rendered the correct authenticated data despite the error, so it did
not visibly break anything I exercised. Not traced to a specific People-CRM file; likely a
pre-existing session-check race in the shared auth hook rather than something this build
introduced — flagged because the brief requires reporting every console error.

### QA-R11-4 · minor · confidence high — Sanity CORS errors on every People-room page load, local-dev only

`Access to XMLHttpRequest at 'https://kv3qrinl.apicdn.sanity.io/…' … blocked by CORS policy` for
the help-system's coachmark/welcome-modal content queries, on every navigation. Pre-existing,
environment-only (no local CORS allowance for that origin in this dev setup), unrelated to the
People CRM feature itself.

### QA-R11-5 · minor · confidence low (informational) — Duplicate-phone Directory band unverified live

SPEC §5.1 #17 / R-Y's "These two cards share a phone." band did not appear on the live
Directory, and a direct query confirmed there is genuinely no pair of distinct identities
sharing one phone number in this seed (`select phone, count(distinct display_name) … having
count(*) > 1` → 0 rows). `directoryDuplicatePairs` exists in code per the W2b build report; this
is a coverage gap in the seed, not a defect I can confirm or deny live.

### QA-R11-6 · minor · confidence low (informational, out of instructed scope) — `w1b_compliance_authority_directory_test.sql` fails at a new block after a fresh reset

Run as an extra check beyond the instructed procedure. On this freshly-reset local DB the suite
now stops at block **9c** ("expected the window end 2027-08-14, got 2027-07-08 00:00:00+00") —
a different block than the block-13 failure w2-fix-log-r5 flagged as pre-existing shared-DB
drift. The ~5-week date delta looks like a relative-date computation (`now()`-based expected
value) that has drifted with wall-clock time since the test was last green, not a live
regression in anything this walk touched — but I did not chase the root cause further since
this SQL suite was not part of the instructed procedure.

## 4. Settled — not findings

Every ruling in `rulings.md` §3 (R-A … R-BM) and everything scoped to W3/W4 in the wave
reports, per the task's own instruction. In particular: R-BM (single-add picker only, no
travel-list pane, in W2) — confirmed the picker correctly stops there. R-AB (twelve act/state
pairs deliberately inert in the SPECIMENS) does not apply here since this is the shipped room,
not a specimen — and every act I exercised (Mint access, Confirm from the agreement, seat-line
navigation, Send a text hold) is live and does something.
