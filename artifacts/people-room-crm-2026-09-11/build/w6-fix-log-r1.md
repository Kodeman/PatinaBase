# W6 fix log — round 1 (F1–F4)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`. Local DB only; no prod, no servers started.

## F1 — corrupted dollar-quoted block in `supabase/seed/00-legacy-grants.sql` (blocking) — FIXED

Committed the working-tree restoration of the missing pair immediately before the
`-- 00592_people_cards_affiliations_rules.sql` marker:

```
   REVOKE ALL ON FUNCTION public.project_roster_books_elsewhere(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
+EXCEPTION WHEN undefined_function OR undefined_table OR undefined_object OR undefined_column THEN NULL;
+END $g$;
+
 -- 00592_people_cards_affiliations_rules.sql
```

Matches `origin/main`'s own copy of the block (`git show origin/main:supabase/seed/00-legacy-grants.sql`, lines 15953–15956).

Gate: `pnpm supabase:reset` (sandbox disabled — Docker socket) replayed every
migration 00560–00638 + `20260910152111`, then every seed file including
`00-legacy-grants.sql` and `people_crm_dev.sql`, ending
`Finished supabase db reset on branch main.` / `Reset local database.`
Balance after the fix: `$g$` = 5782 (even); `DO $g$ BEGIN` = 2891, `END $g$;` = 2891.

## F2 — the R-CC Hours-door gate could not fire on a real carded teammate (blocking) — FIXED

`apps/designer-portal/src/components/document/people/views/person-profile.tsx`.
The gate now asks the studio-member question the way the Directory's own six
chips ask it, instead of keying on the `role` discriminator 00626 warned
consumers off:

```ts
const viewerSeesStudioMember =
  !!person &&
  directoryEntryKind(person) === "person" &&
  directoryBandOf(person) === "studio";
…
{viewerSeesStudioMember && person.profile_id && viewerIsOwnerOrAdmin && ( … Hours … )}
```

`directoryBandOf` reduces through `directoryContactKind`, whose `STUDIO_KINDS`
set holds BOTH `'studio'` (a carded human, `meta.contact_kind`) and `'team'`
(an uncarded seat, which falls back to `p.role`). So R-CC's literal — the
`role: 'team'` shape its `renderTeammate` uses — and the shipped v4 shape both
resolve through one predicate. R-CC's three conditions are unchanged in
substance: studio member, linked account, owner/admin viewer; the door still
sits once in the card head and still calls
`openHoursForMember(profile_id, display_name)`.

Live confirmation of the claim, and of the fix's premise, against the freshly
reset DB (`public.people_directory` read as `authenticated` with
`request.jwt.claims.sub = a0000000-0000-0000-0000-000000000004`):

```
  display_name   |  role   |              profile_id              |   ek   |   ck
-----------------+---------+--------------------------------------+--------+--------
 Dale Whitcomb   | contact |                                      | person | studio
 Leah Hartwell   | contact | a0000000-0000-0000-0000-000000000004 | person | studio
 Priya Natarajan | contact |                                      | person | studio
```

Second clause of the prescribed fix — "verify at least one seeded team member
has a non-null `profile_id` linked to a real `auth.users` row" — VERIFIED, no
seed change needed:

```
    full_name    |              profile_id              |        email
-----------------+--------------------------------------+---------------------
 Leah Hartwell   | a0000000-0000-0000-0000-000000000004 | designer@patina.dev
```

Priya Natarajan and Dale Whitcomb carry no linked account, so R-CC's own second
condition correctly withholds the door on their cards; Leah Hartwell's card is
where a real carded teammate's Hours door now stands.

Regression cover added to
`apps/designer-portal/src/components/document/people/__tests__/person-profile.test.tsx`
(HT-8 describe block), pinning the shape the old gate missed:

- `opens on a CARDED studio member, who arrives as role 'contact'`
- `is absent on a CARDED crew member with an account — 'contact' alone is not the studio`

Proof the first one reproduces F2: with the gate temporarily reverted to
`person.role === "team"`, that test FAILS (`Test Suites: 1 failed … Tests: 1
failed`); with the fix in place the whole HT-8 block is green (6/6), and the
file is 27/27.

Gates: `jest src/components/document/people` → **31 suites / 469 tests passed**;
`tsc --noEmit` on designer-portal → clean; eslint on the changed source files →
0 errors.

### Note on F2's second piece of cited evidence
`e2e/document/hours.spec.ts:60/72` is NOT evidence of this defect. That
assertion is `expect.poll(() => new URL(page.url()).search).toBe('')` on
`/desk?sheet=hours` — the Desk doorway's own address cleanup. It touches neither
the person card nor the R-CC gate; nothing on the person card can make
`/desk?sheet=hours` fail to scrub its query string. It is an unrelated red and
is NOT closed by this round. Flagged rather than silently folded into F2.

## F3 — first `data-tel-link` on the Call Sheet resolves to a client (blocking) — FIXED, root cause differs from the finding

The finding reads as a roster-band ordering regression against PR-r. It is not.
Measured facts:

1. The site access card's stored order already leads with Luis Ochoa —
   `project_site_access_cards.emergency_lines[0]` for Okonkwo
   (`d0e00000-0000-0000-0000-00000000000a`) is
   `{"name":"Luis Ochoa","label":"Superintendent","phone":"+16125550109"}`,
   and `site-access-card.tsx` renders `lines` in stored order inside the first
   section, `Who to call first`. The product prints the right person first.
2. The band order is already right: `CALL_SHEET_BANDS` puts `studioSide` before
   `clientSide`, and `call-sheet.spec.ts` asserts exactly that two lines above
   the failing one (`bands.first()` → `data-roster-band="studioSide"`), which
   passes.
3. The studio side carries NO number to link. `v_project_roster` for Okonkwo:

```
 source |       kind       |   display_name   |     phone
--------+------------------+------------------+----------------
 team   | lead_designer    | Leah Hartwell    |
 team   | support_designer | Studio Manager   |
 party  | client           | Adaeze Okonkwo   | (612) 555-0104
```

   `callSheetRowFromTeam` takes `row.phone`, which is NULL on both team rows, so
   `roster-row.tsx`'s `{row.phone && …<TelLink/>}` renders nothing for the studio
   side. Reordering the bands (the prescribed fix) therefore cannot change which
   tel link comes first.

The actual cause is the locator's scope: the Call Sheet `DocSheet` stays mounted
behind the Site access `DocSheet` (`call-sheet.tsx` renders `<SiteAccessCard>` as
a sibling of the still-open sheet), so a page-wide
`page.locator('a[data-tel-link]').first()` reads the roster's own first linked
number — the Client side band, which sorts the client first, i.e. Adaeze Okonkwo
`(612) 555-0104`, exactly what QA saw. The assertion's own comment says "Who to
call first", so the fix is to ask the card it means:

```ts
const firstCall = page
  .locator('[data-site-access-card] a[data-tel-link]')
  .first();
```

No product change: the ruled behaviour (R-U's head line, CR-10's gate-controller
sentence, PR-r's no-stored-code) is already correct on the face. The assertion is
narrowed, never weakened — it still pins the first linked line of `Who to call
first` to Luis Ochoa with a `tel:+` href.

Gate: `tsc --noEmit` over `e2e/**/*.ts` — no error on `e2e/people/call-sheet.spec.ts`.
Per the round's binding instruction no servers were started, so the Playwright
run itself is owed to the next QA pass.

## F4 — `getByLabel('Trade')` strict-mode violation (major) — FIXED, not an a11y contract break

The two elements do not share an accessible name: the Directory filter is
`<div role="group" aria-label="Narrow by trade">` and the Add sheet's control is
`<select id="add-party-trade">` labelled `Trade`. Those are distinct names on
distinct roles — no duplicate-name defect. The strict-mode violation comes from
Playwright's `getByLabel` matching a **substring, case-insensitively** by
default, so the bare word `Trade` matched both while the Add sheet stood over
the Directory.

That also means the prescribed fix would not have worked: renaming the group to
"Filter by trade" still contains `trade` and would still match, while a rename
that drops the word would break `e2e/people/directory.spec.ts:57/61/65` and
`__tests__/directory-scope.test.tsx:209/214` and read worse. The fix is to ask
for the name the select actually has:

```ts
await page.getByLabel("Trade", { exact: true }).selectOption(trade);
```

`apps/designer-portal/e2e/people/person-card.spec.ts`, the `addSub` helper
(the only caller inside this spec). `e2e/people/add-sheet.spec.ts:49` and
`e2e/field/field-coordination.spec.ts:69` use the same bare locator but were not
reported red and are opened from surfaces where the Directory's trade line is not
mounted; they are left alone per "fix exactly these findings, nothing else".

Gate: `tsc --noEmit` over `e2e/**/*.ts` — no error on `e2e/people/person-card.spec.ts`.

## Files changed

- `supabase/seed/00-legacy-grants.sql`
- `apps/designer-portal/src/components/document/people/views/person-profile.tsx`
- `apps/designer-portal/src/components/document/people/__tests__/person-profile.test.tsx`
- `apps/designer-portal/e2e/people/call-sheet.spec.ts`
- `apps/designer-portal/e2e/people/person-card.spec.ts`
