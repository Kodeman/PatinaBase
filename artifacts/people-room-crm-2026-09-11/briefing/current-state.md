# The People room today

Briefing file 1 of 3 for the People room / construction CRM panel. Every claim carries a `path:line` opened in the worktree `.codex/worktrees/agent-people-crm` (branch `panel/people-room-crm-2026-09-11`). Paths are relative to the worktree root. Migration citations point at the LATEST shaping migration for each object, not the birth migration, unless the birth migration is the only shaping one.

Seed claims that did not verify are marked inline as `SEED CLAIM NOT VERIFIED:` and collected in §G.

Read order for a seat: §A, §B, §C, §D, §F first. §E (gaps register) only after your own findings are written (see `panel-brief-common.md` §5).

---

## A. Surface map

### A1. Route, doors, params

| Item | Value | Evidence |
|---|---|---|
| Route | `/people` renders `PeopleRoom` inside the `(document)` layout | `apps/designer-portal/src/app/(document)/people/page.tsx:12-14` |
| Registry entry | key `people`, kind `room`, label "People", aliases include `clients`, `contacts`, `vendors`, `makers`, `crm`, `directory`; chord `g p`; help blurb "Everyone the studio works with" | `apps/designer-portal/src/lib/document/registry.tsx:96-108` |
| Studio Drawer door | `DOOR_HREF.people = '/people'` (room-weight door) | `apps/designer-portal/src/components/document/studio-drawer.tsx:79` |
| ⌘K / chord door | `ROOM_HREF.people = '/people'` | `apps/designer-portal/src/components/document/registry-shortcuts.tsx:36` |
| Mobile door | sheet entry `people`, name "People", `weight: 'room'`; bar title "The People Room" | `apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:120-125`; `mobile/mobile-bar.tsx:45` |
| Legacy redirects | `/portal/clients` → `/people?role=client`; `/portal/clients?add=1` → `/people?role=client&add=client`; `/portal/clients/:id` → `?person=:id&role=client`; `/portal/vendors/new` → `?add=maker`; `/portal/vendors/saved` → `?role=maker`; `/portal/vendors/:id` → `?person=:id&role=maker` | `apps/designer-portal/next.config.js:415-422` |
| Query params read once on mount | `person`, `role`, `thread`, `add`, `view`, `scope` | `apps/designer-portal/src/components/document/people/people-room.tsx:162-171` |
| `?person=` role resolution list | `client, lead, maker, gc, team, sub, installer, receiver` (8 of 12 PartyRole values; architect/photographer/stager/contact deep-links resolve only via the loaded roster) | `people-room.tsx:173-182`, `:184-197` |
| Field party deep-link | `isFieldRosterRole(role)` opens `PartyProfileSheet`, everyone else opens `PersonProfile` | `people-room.tsx:200-202`, `:281-282` |
| Page width | outer `max-w-[1100px]`, main panel `max-w-[760px]` | `people-room.tsx:415`, `:428` |
| Head count | `${all.length} people` from `usePeopleDirectory({ role: 'all' })` (studio-wide, unscoped) | `people-room.tsx:115`, `:383` |
| Primary action | "Add person" (room head + mobile primary action) | `people-room.tsx:102-108`, `:390-397` |

### A2. Views (`?view=`)

Source of truth: `PEOPLE_VIEW_GROUPS` at `apps/designer-portal/src/components/document/people/view-shell.tsx:25-49`; param map `peopleViewFromParam` at `view-shell.tsx:55-60`.

| Group | View key | Component | What it is | Evidence |
|---|---|---|---|---|
| Directory | `directory` | `views/directory-view.tsx` | the unified roster, role-chipped | `directory-view.tsx:180-219` |
| Relationships | `threads` | `views/threads-view.tsx` | unified inbox over `use-comms` | `threads-view.tsx:3-12` |
| Relationships | `nurture` | `views/nurture-view.tsx` | dormancy queue via `deriveNurtureQueue` | `nurture-view.tsx:3-10` |
| Relationships | `reviews` | `views/reviews-view.tsx` | review requests pending / collected / queued | `reviews-view.tsx:3-10` |
| Practice | `portfolio` | `views/portfolio-view.tsx` | completed-projects gallery | `portfolio-view.tsx:3-11` |
| Practice | `outreach` | `views/outreach-view.tsx` | campaigns / templates / audiences | `outreach-view.tsx:3-12` |
| Practice | `your-eye` | `profile/your-eye.tsx` | the designer's own taste profile (not a party) | `people/types.ts:19-24`; `your-eye.tsx:3-7` |

### A3. Role filter vocabulary (`?role=`)

`DIRECTORY_ROLES` at `apps/designer-portal/src/lib/document/directory-roles.ts:15-27`: `all, field, client, lead, maker, team, gc, sub, installer, receiver, company`. `DirectoryRole = PartyRole | 'all' | 'field' | 'company'` at `directory-view.tsx:74`.

| Chip set | Values in order | When | Evidence |
|---|---|---|---|
| `ROLE_TABS` (flag off) | All · Clients · Leads · Makers · Field · Team | `call-sheet` flag off | `directory-view.tsx:80-88` |
| `ROLE_TABS_CALL_SHEET` (flag on) | All · Field · Clients · Leads · Makers · Team · GCs · Subs · Installers · Receivers · Companies | `call-sheet` flag on, mounted INSTEAD of the above | `directory-view.tsx:93-105`, `:349` |
| `field` | client-side narrowing to `gc/sub/installer/receiver`; query still reads `all` | any | `directory-view.tsx:69-71`, `:226`, `:295` |
| `company` | reads `studio_contacts` (entity_kind company), not `people_directory` | flag on only | `directory-view.tsx:72-73`, `:244-251`, `:353` |
| Trade / specialty sub-chips | `ALL_FIELD_TRADES` under Subs, `ALL_VENDOR_SPECIALTIES` under Makers | flag on | `directory-view.tsx:329-338`, `:350`; `directory/trade-chip-row.tsx:43-45` |
| Row order | client 0 · lead 1 · gc 2 · sub 3 · installer 4 · receiver 5 · architect 6 · photographer 7 · stager 8 · maker 9 · team 10 · contact 11; name within band | any | `directory-view.tsx:109-129` |
| Excluded rows | `role = 'contact'` never rendered in any chip | any | `directory-view.tsx:34-44`, `:294` |
| Live search | name · role label · `meta.company_name` · email, case-insensitive, in memory | any | `directory-view.tsx:304-316` |

No chip exists for `architect`, `photographer`, `stager`, or person-kind rolodex contacts; those rows appear only under All / Field-adjacent ordering (`directory-view.tsx:116-121`) or not at all (`:294`).

### A4. Components and what each renders

| Component | Main export | Reads | Renders (fields / columns) | Evidence |
|---|---|---|---|---|
| `people-room.tsx` | `PeopleRoom` `:63` | `usePeopleDirectory({role:'all'})` and `{scope:'mine'}`; `useOrganizations` | shell, ask bar, compact selector, desktop rail, body slot, AddPersonSheet, PartyProfileSheet, toast | `people-room.tsx:115`, `:123`, `:129-133`, `:336-378`, `:380-468` |
| `view-shell.tsx` | `PeopleDesktopRail`, `PeopleCompactSelector`, `ViewHeader`, `EmptyTeach` | view groups | the rail's three group heads with one Strata mark each, directory count, nudge line | `view-shell.tsx:25-49`, `:90-140` |
| `views/directory-view.tsx` | `DirectoryView` `:180` | `usePeopleDirectory({role, scope})`, `useStudioContacts(org)` | role chips, ScopeLens, teach note, makers lens line, trade chips, company list with inline "who works here" unfold, person rows with `ClientLetterLine` siblings, empty teaches | `directory-view.tsx:233-236`, `:244-247`, `:372-391`, `:394`, `:419-445`, `:458-507`, `:547-577` |
| `directory/person-row.tsx` | `PersonRow` `:44` | one `PeopleDirectoryRow` | circle `Avatar`, `display_name`, `RoleBadge`, relationship line (terracotta when due), `RolodexMarker` (MINE lens + field role + rolodex match), `ConsentChip` (field roles only), `StatusDot`, chevron | `person-row.tsx:76-99` |
| `directory/company-row.tsx` | `CompanyRow` `:67` | `studio_contacts` company card | 42px rounded-square `Avatar`, `company_name`, kind pill from `COMPANY_KIND_LABELS` (gc, workroom, showroom, vendor, supplier; else prettified raw), line = "N people · N projects · last: X" or "Not yet on a project", optional status dot, NO consent dot | `company-row.tsx:34-40`, `:76-84`, `:89-107` |
| `directory/scope-lens.tsx` | `ScopeLens`, `DEFAULT_CONTACT_SCOPE = 'studio'` | `ContactScope` | two scored words `mine` · `studio` | `scope-lens.tsx:23`, `:25-28`, `:43-58` |
| `directory/trade-chip-row.tsx` | `TradeChipRow` `:31` | `ALL_FIELD_TRADES` / `ALL_VENDOR_SPECIALTIES` | `all` + one lowercase mono word per token; a legacy free-text value renders as a selected extra chip | `trade-chip-row.tsx:43-46`, `:73-82` |
| `directory/ask-bar.tsx` | `AskBar`, `routePeopleAsk` | keyword regexes | "Ask the Engine" input; routes nurture words → Nurture, maker words → Makers, gc words → GCs, lead words → Leads, else live search | `ask-bar.tsx:26-45` |
| `directory/add-person-sheet.tsx` | `AddPersonSheet` `:152` | `useAddClient`, `findOrCreateVendor` + `saveVendor`, `useAddProjectParty`, `useUpdateStudioContact` | see A5 | `add-person-sheet.tsx:308`, `:357-363`, `:406-416`, `:510` |
| `directory/client-letter-line.tsx` | `ClientLetterLine` | invite state for a `designer_clients` id | R9 dated-prose line under a client row ("Write again") | `client-letter-line.tsx:3-14`; mounted `directory-view.tsx:568-574` |
| `directory/rolodex-seed-sheet.tsx` | `RolodexSeedSheet` | `useStudioContacts({includeArchived:true})` | owner review of the 00418 fold: every card incl. archived, ARCHIVE / RESTORE words, DONE | `rolodex-seed-sheet.tsx:3-12` |
| `directory/makers-marketplace.tsx` | `MakersMarketplace` | `useVendors` | every maker in the book; save = admission to roster | `makers-marketplace.tsx:3-12` |
| `views/person-profile.tsx` | `PersonProfile` `:899` | `usePerson(personId, role)` + per-branch hooks | branch by role: maker → `MakerProfile`; client/lead → `ClientProfile`; gc → `NetworkProfile`; EVERYTHING ELSE (team, architect, photographer, stager, contact) → `TeamProfile` | `person-profile.tsx:911-912`, `:941-948`, `:951-952`, `:955` |
| `ClientProfile` | (internal) `:172` | `useClient`, `useClientProjects`, `useProposals`, decisions, threads, touchpoints, reviews | actions Message / Schedule a touchpoint / View as them / Edit details; `StyleDna`, `RelationshipJourney`, `NurtureCard`, `ProjectsCard`, `TrustCard` "Trust & history", `NoteCard` | `person-profile.tsx:442-467`, `:496-514` |
| `NetworkProfile` (gc) | (internal) `:587` | journey inputs | actions Open in Orders / Coordination; journey; "Engagements"; "Track record" | `person-profile.tsx:688-699`, `:714-735` |
| `TeamProfile` | (internal) `:778` | `usePersonDocuments` | "Adjust visibility"; "On these documents"; "Studio role" (humanized from `project_team_members.role`) | `person-profile.tsx:820`, `:856-870`, `:882-890` |
| `profile/maker-profile.tsx` | `MakerProfile` | vendor book | products carried, reviews, request-a-quote, roster save/unsave, Orders cross-link; read-only (vendor-owned) | `person-profile.tsx:10-14`, `:32` |
| `party-profile-sheet.tsx` | `PartyProfileSheet` `:183` | `usePerson`, `usePartySmsThread`, `useActiveFieldLink`, `useCreateFieldLink`, `useRevokeFieldLink`, `useProjectParties`, `useRecordPartySmsConsent`, `useUpdateProjectParty` | see A6 | `party-profile-sheet.tsx:24-42` |
| `promote-band.tsx` | `PromoteBand` `:23` | `usePromoteToStudioContact` | "Not in the studio rolodex yet." + "Add to the rolodex" → "In the rolodex — the whole studio can find them now." | `promote-band.tsx:45`, `:54`, `:70` |
| `person-bits.tsx` | `Avatar`, `RoleBadge`, `ConsentChip`, `StatusDot`, `companyKindBadgeStyle` | vocab maps | consent chip labels Not asked / Invited / Texting / Opted out (`SMS_CONSENT_DISPLAY`); `dotOnly` variant for the roster row | `person-bits.tsx:56`, `:84-98`, `:172-203`, `:206-214`; `packages/types/src/field-config.ts:175-180` |

### A5. Add person sheet: kinds and fields

`AddedPersonKind = client | maker | gc | sub | installer | receiver` (`add-person-sheet.tsx:69-75`); `KIND_CHOICES` labels "a client / a maker / a GC / a sub / an installer / a receiver" (`:98-105`). Trade shown only for sub and installer (`:88`). Edit mode for an existing `studio_contacts` card (kind locked) since F3 (`:22-25`, `:510`).

| Kind | Fields | Write path | Evidence |
|---|---|---|---|
| client | name, email (required), "invite / send the letter" checkbox, note | `useAddClient` → `POST /api/clients/invite` (see §C) | `add-person-sheet.tsx:203-206`, `:298-316`; `packages/supabase/src/hooks/use-clients.ts:557-589` |
| maker | maker name, category, orders email, website | `findOrCreateVendor` then `saveVendor` (`saved_vendors`) | `add-person-sheet.tsx:212-215`, `:357-363` |
| gc / sub / installer / receiver | project (required), name (required), company, trade (sub/installer), phone, email, "text updates" checkbox; if checked: consent method (verbal / written / web_form / other) + consent record text (both required) | `useAddProjectParty` → `project_parties` insert | `add-person-sheet.tsx:217-229`, `:399-416`, `:935-972` |

No kind exists for architect, photographer, stager, client_rep, vendor-as-party, or "other"; those enter only through the Call Sheet rolodex picker (`roster/rolodex-picker.tsx:47`, `:176`) or migrations.

### A6. Party profile sheet (field party) contents

| Region | What | Evidence |
|---|---|---|
| Identity | name, kind label, `ConsentChip` | `party-profile-sheet.tsx:497-503` |
| Promote band | shown when party has no `studio_contact_id` and an org resolves | `party-profile-sheet.tsx:230`, `:508-509` |
| Contact card | Kind, Company, Trade, Phone, Email, Project | `party-profile-sheet.tsx:271-278` |
| Edit form | Name / Company / Trade (select from `ALL_FIELD_TRADES`) / Phone / Email; Kind and Project read-only; a changed phone revokes consent | `party-profile-sheet.tsx:15-19`, `:350-353`, `:548-594` |
| Field link | mint (`create_field_link`), raw URL shown once, Copy / Regenerate, revoke | `party-profile-sheet.tsx:9-10`, `:420-436`, `:686-710` |
| SMS thread | inbound / outbound bubbles, MMS via signed URLs, template provenance | `party-profile-sheet.tsx:11-12`, `:195` |
| Composer | "Send text", disabled until consent `granted`; `not_asked` + phone shows "Invite to texts"; no phone shows "Add a phone number to invite this party to texts." | `party-profile-sheet.tsx:740-756`, `:786`, `:893` |

### A7. Reach chip states

`ReachState = account | field_link | on_paper` (`packages/types/src/studio-config.ts:169`); labels Account / Field link / On paper (`:171-175`); tints sage / golden / pearl (`apps/designer-portal/src/components/document/roster/reach-chip.tsx:19-35`). Derivation, strict precedence: `profile_id` non-null → account; `has_active_field_link` → field_link; else on_paper (`apps/designer-portal/src/lib/document/roster-derivation.ts:360-364`). Rendered on every Call Sheet row (`roster/roster-row.tsx:94`, `:157`) and on picker mini rows (`roster/party-mini-row.tsx:3-8`). NOT rendered in the People room Directory (person-row.tsx renders no reach chip: `person-row.tsx:76-99`).

### A8. Call Sheet (project roster)

| Item | Value | Evidence |
|---|---|---|
| Mount | `CallSheetMount` in `/doc/[id]/page.tsx`, opened by `document:open-call-sheet` from the letterhead instrument, ⌘K, kickoff band | `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:133`, `:1111`, `:1223`; `components/document/letterhead-instruments.tsx:454-473`; `roster/kickoff-band.tsx:21-26` |
| Sheet | 760px `DocSheet`, title "Call sheet", `wide` | `roster/call-sheet.tsx:4-6`, `:126` |
| Modes | `sheet | picker | add` | `call-sheet.tsx:49`, `:109-114` |
| Flag | `call-sheet` at the consumer; `null` when off | `call-sheet.tsx:76`, `:116` |
| Vitals line | "N ON THE JOB · N REACHABLE BY TEXT · N WITH ACCOUNTS"; instrument suffix "· N ON PAPER" | `roster-derivation.ts:402-405`, `:412-415` |
| Actions | From the rolodex (primary) · New person (secondary) · Print (tertiary) | `call-sheet.tsx:150-170` |
| Groups | Studio side (`source='team'`) · Client side (kind client / client_rep, synthetic client prepended) · Build & supply (architect → gc → sub → vendor → installer → receiver → photographer → stager → other, then by trade, then name) | `roster/roster-groups.tsx:9-13`, `:26`; `roster-derivation.ts:54`, `:64-74`, `:228-274` |
| Synthetic client row | from the document's `client_name` / `client_profile_id`; no party row behind it, never counted textable | `roster-derivation.ts:85-148`, `:378-395` |
| Dedupe | by `profile_id`, `studio_contact_id`, email+name, phone+name; team wins | `roster-derivation.ts:282-323` |
| Row | 34px avatar, name + consent dot, group-specific second line (staff role · title / kind / kind · trade), reach chip, chevron (only for gc/sub/installer/receiver/architect/photographer/stager party rows) | `roster-row.tsx:6-11`, `:50-66`, `:87-94`, `:139`, `:157-161`; `roster-derivation.ts:178-197` |
| Unfold | phone, email, full consent chip, words Text / Copy field link / Show to client / Remove (hard delete with confirm) | `roster-row.tsx:170-184`, `:229-283`; `packages/supabase/src/hooks/use-coordination.ts:808-816` |
| Picker | rolodex search, kind chips pre-scoped, "Save to the studio rolodex" on by default, inline add | `roster/rolodex-picker.tsx:3-18`, `:47`, `:176` |
| Kickoff band | retires itself at four names or LATER | `roster/kickoff-band.tsx:3-14`; `roster-derivation.ts:427-429` |
| `project-team-roster.tsx` | `ProjectTeamRoster` exported; referenced by no other production file (only itself) | `roster/project-team-roster.tsx:24`; grep of `apps/designer-portal/src` returns only that file |

### A9. Derivations

| File | Role | Evidence |
|---|---|---|
| `lib/document/people-derivation.ts` | `PartyStatus = active | warm | due | cool`; `roleLabel`; `deriveStatusDot` (lead new/viewed → due; client by lifecycle + dormancy; maker by founding circle / 75 days; gc + team → active; sub/installer/receiver by SMS consent; architect/photographer/stager/contact → cool); `deriveRelationshipLine`; `deriveNurtureQueue`; `deriveRelationshipJourney` | `people-derivation.ts:45`, `:114`, `:197-253`, `:305`, `:408`, `:549` |
| `lib/document/roster-derivation.ts` | grouping, synthetic client, dedupe, reach, vitals, kickoff | `roster-derivation.ts:228`, `:123`, `:308`, `:360`, `:385`, `:427` |
| `lib/document/desk-roster-derivation.ts` | the Desk's roster of JOBS by stage, not people (`live` jobs, need lines, motion chips) | `desk-roster-derivation.ts:1-11`, `:330` |

---

## B. Data map

### B1. Objects

| Object | Latest shaping migration | Columns (as shaped) | Auth linkage | RLS predicate (latest) | Read by |
|---|---|---|---|---|---|
| `public.people_directory` (view, `security_invoker`) | `supabase/migrations/00589_return_to_lead_hardening.sql:696-935` (lineage 00221 → 00281 → 00420 → 00478 → 00583 → 00589 per `:102`) | `person_id, role, display_name, email, phone, profile_id, project_id, designer_id, status_raw, last_touch_at, meta jsonb, scope` (`:703-734`); six UNION ALL branches: clients (`designer_clients`, `:702-737`), leads open only (`:743-769`), makers (`vendors` saved or engaged, `:775-818`), parties (`project_parties` kinds gc/sub/installer/receiver/architect/photographer/stager, `:824-860`), team (`project_team_members` DISTINCT ON user, excluding self, roles lead_designer/support_designer/bookkeeper/previous_lead, `:866-906`), contacts (`studio_contacts`, `:912-935`) | `profile_id` = `designer_clients.client_id` / `leads.homeowner_id` / `vendors.contact_profile_id` / `project_parties.profile_id` / `project_team_members.user_id` / `studio_contacts.profile_id` | per branch `is_studio_comember(designer_id)` or project owner/lead/creator co-member, `is_active_studio_member(org)`; base-table RLS still applies (`00420:32-49` scope note) | `usePeopleDirectory`, `usePerson` (`packages/supabase/src/hooks/use-people.ts:120-168`); Directory, profiles, party sheet, nurture, outreach |
| `public.studio_contacts` | `00417_studio_contacts.sql:70-120` | `id, organization_id, entity_kind (person|company CHECK), company_id (self FK), contact_kind TEXT no CHECK, full_name, company_name, email, phone, phone_e164, specialties text[], vendor_id, profile_id, created_by, notes, archived_at, created_at, updated_at`; name CHECK by kind `:112-115`; company link CHECK `:118-120`; zero consent or compliance columns | `profile_id → profiles` soft | select/insert/update `is_active_studio_member(organization_id)` (`:219-249`); archive/restore admin only (`:257-261`); no DELETE policy (`:124-128`) | `useStudioContacts` and siblings (`use-studio-contacts.ts:119-320`); Companies chip, rolodex picker, seed sheet, promote band |
| `public.project_parties` | birth `00212_project_parties.sql:27-43`; widened `00281_field_parties.sql:48-61`; lineage `00418_studio_contacts_backfill.sql:59-63`; kinds + visibility `00419_project_roster_wiring.sql:43-47`, `:61-62`; consent evidence `00432_twilio_activation_hardening.sql:4-11` | `id, project_id, party_kind CHECK (gc, vendor, client_rep, other, sub, installer, receiver, architect, photographer, stager, client), display_name, company_name, email, phone, phone_e164 (trigger), trade TEXT, sms_consent_status (not_asked|pending|granted|opted_out), sms_consented_at, sms_opt_out_at, sms_consent_source (verbal|written|web_form|inbound_sms|other), sms_consent_evidence, sms_consent_recorded_at, sms_consent_recorded_by, sms_consent_disclosure_version, vendor_id, profile_id, studio_contact_id, show_to_client bool default false, created_by, created_at, updated_at` | `profile_id → profiles`, never written by any code path (`00420:57-60` comment; hooks grep: only typed at `use-coordination.ts:75`, `:843`) | designer all (`00212:83-99`); project team select (`:104-107`); self select (`:116-119`); studio co-member select (`00421_studio_comember_read_policies.sql:85-96`); client select where `show_to_client` (`00420:373-383`); studio insert/update/delete via `is_studio_comember(p.designer_id)` (`00584_studio_comember_rls_sweep.sql:884-921`) | `useProjectParties`, `useAddProjectParty`, `useUpdateProjectParty`, `useRecordPartySmsConsent`, `useRemoveProjectParty` (`use-coordination.ts:368`, `:415`, `:538`, `:686`, `:808`); party sheet, roster, client threshold |
| `public.v_project_roster` (view, `security_invoker`) | `00419:94-158` | `roster_id, source (party|team), project_id, kind, display_name, company_name, email, phone, trade, job_title, staff_role, studio_contact_id, profile_id, show_to_client, has_active_field_link (EXISTS active unexpired field_link_tokens), sms_consent_status, updated_at` (`:97-147`) | party `profile_id`; team `user_id` | base tables' RLS; `GRANT SELECT TO authenticated` (`:158`) | `useProjectRoster` (`use-coordination.ts:857-872`); Call Sheet, letterhead instrument, kickoff band, ProjectTeamRoster |
| `public.organization_members` | `00021_user_management_foundation.sql:132-146`; `00416_studio_staff_titles.sql:19-21` | `id, user_id, organization_id, role member_role (owner|admin|member|guest, :22-24), permissions_override jsonb, invited_by, invitation_token, invitation_expires_at, status member_status (active|invited|suspended|removed, :26-28), joined_at, created_at, updated_at, job_title TEXT, staff_role TEXT` | `user_id → profiles` | own rows select `00021:308`; admins view / owners insert / admins update / admins delete `:311-356` | `useOrganizationMembers`, `useInviteMember`, `useRemoveMember`, `useUpdateMemberStaffRole` (`use-organizations.ts:210`, `:330`, `:477`, `:636`); team branch of people_directory; roster team branch |
| `public.project_team_members` | `00084_project_management_mvp.sql:160-172`; role widened `00093_lead_reassignment.sql:30-43` | `id, project_id, user_id, role CHECK (lead_designer, support_designer, vendor, client, bookkeeper, previous_lead), permissions jsonb, assigned_at, assigned_by, removed_at, created_at, updated_at`; UNIQUE (project, user, role) | `user_id → profiles` (always a login) | lead designer ALL (`00084:181-189`); team members select (`:191-200`); studio co-member select (`00421:116`) | roster team branch; people_directory team branch; no writer in the People room or Call Sheet (`docs/design/studio-rosters/README.md:91`) |
| `public.designer_clients` | birth `00014_portal_business_features.sql:72-100`; direct contact `00018_designer_clients_direct_contact.sql:7-11`; v2 `00062_client_management_v2.sql:18-26`; phone `00583_lead_contact_phone.sql:73-75` | `id, designer_id, client_id (nullable since 00018), nickname, notes, tags, source, lead_id (ON DELETE SET NULL), status, total_projects, total_revenue, first_project_at, last_project_at, client_email, client_name, referral_source, location, preferred_contact TEXT, style_tags, style_preferences, inspiration_quote, last_contacted_at, satisfaction_score, client_phone, client_phone_e164, timestamps` | `client_id → profiles`; `designer_id → profiles` | `designer_clients_studio_rw` = `is_studio_comember(designer_id)` (`00316_studio_shared_workspace_rls.sql:39-42`) | clients branch of people_directory; `useClient`, `useAddClient` (`use-clients.ts:557`); ClientProfile; invite routes |
| `public.leads` | birth `00014:11-43`; phone `00583:61-63` | `id, homeowner_id, designer_id, project_type, project_description, budget_range, timeline, location_city/state/zip, match_score, match_reasons, status (new|viewed|contacted|accepted|declined|expired), response_deadline, contacted_at, accepted_at, declined_at, contact_phone, contact_phone_e164, timestamps` (+ `contact_name`, `contact_email` read at `00589:746-747`) | `homeowner_id → profiles` optional | `leads_studio_select` / `leads_studio_update` = `is_studio_comember(designer_id)` (`00316:46-53`); insert `00584:951-952` | leads branch (open only); Desk capture; return-to-lead RPC (`00589:552-679`) |
| `public.vendors` + `public.saved_vendors` | vendors birth `00001_initial_schema.sql:14-23`, widened `00009_vendor_management.sql:16-28`; saved_vendors `00009:167-174` | vendors: `id, name, website, trade_terms, contact_info jsonb, notes, logo_url, market_position, production_model, founded_year, ownership, headquarters_*, parent_company_id, primary_category, secondary_categories, designer_rating_avg, review_count, lead_times, …` (also `orders_email`, `trade_account_email`, `contact_profile_id`, `nomination_status`, `founding_circle`, `preferred_contact` read at `00589:779-796`); saved_vendors: `id, designer_id, vendor_id, saved_at, notes` | `vendors.contact_profile_id → profiles` (the maker login) | saved_vendors own-row ALL (`00009:322-326`) + studio co-member select (`00421:146`); vendors anon read was open and is closed in `00555_ios_round_one_security.sql:179-180` | makers branch; `MakerProfile`; marketplace lens; `designer_vendor_accounts` carries sales-rep name/email/phone (`00009:59-76`) |

Vocabulary that binds these (code-resident, DB is TEXT):

| Vocab | Values | Evidence |
|---|---|---|
| `PartyRole` (directory discriminator) | 12: client, maker, gc, team, lead, sub, installer, receiver, architect, photographer, stager, contact | `use-people.ts:27-39` |
| `FIELD_ROSTER_ROLES` | gc, sub, installer, receiver | `use-people.ts:44-49` |
| `PartyKind` (project_parties.party_kind) | 11: gc, vendor, client_rep, other, sub, installer, receiver, architect, photographer, stager, client. SEED CLAIM NOT VERIFIED: seed says "PartyKind 12"; the union has 11 members | `packages/types/src/field-config.ts:110-121` |
| `FieldTrade` | 23 values, electrical … demo | `field-config.ts:18-41` |
| `SmsConsentStatus` + display | not_asked "Not asked" · pending "Invited" · granted "Texting" · opted_out "Opted out" | `field-config.ts:159`, `:175-180` |
| `StaffRole` | 10 values, principal … bookkeeper; default tiers | `packages/types/src/studio-config.ts:14-24`, `:59-70` |
| `VendorSpecialty` | 21 values | `studio-config.ts:76-97` |
| `ContactScope` / `RosterSource` / `ReachState` | mine|studio / party|team / account|field_link|on_paper | `studio-config.ts:157`, `:163`, `:169` |
| `ContactKind` | promised by `use-studio-contacts.ts:31-34` and `00417:82-87`; does not exist in `packages/types/src` (grep empty) | `use-studio-contacts.ts:31-34` |
| Company kind labels | gc, workroom, showroom, vendor, supplier (UI-only) | `company-row.tsx:34-40` |

### B2. One human, how many rows

Worked example: a general contractor's owner who is in the studio rolodex and on two projects (the fixture's Tom Marrow, Marrow & Sons, on Okonkwo and on a second job).

| # | Row | Table | Key facts | Evidence |
|---|---|---|---|---|
| 1 | rolodex person card | `studio_contacts` (entity_kind person, contact_kind `gc`, company_id → row 2) | shared studio-wide; phone, email, specialties, notes; no consent, no docs | `00417:70-120` |
| 2 | rolodex company card | `studio_contacts` (entity_kind company, contact_kind `gc`) | name only + people count in UI | `00417:76-80`; `company-row.tsx:76-84` |
| 3 | party on project A | `project_parties` (party_kind `gc`, project A) | own snapshot of name/company/phone/email/trade; own `sms_consent_status`, evidence, `show_to_client`, `studio_contact_id` → row 1 | `00418:70-77` (lineage, not a live join) |
| 4 | party on project B | `project_parties` (party_kind `gc`, project B) | a second, independent snapshot and consent ledger | same |
| 5, 6 | field links | `field_link_tokens` one per party row (90 days) | reach = field_link only where the link is live | `00283_field_links.sql:26-33` |
| 7 | trade agreement | `studio_trade_agreements` keyed by `contact_id` (retainage, lien waiver policy, insurance certificate required) | the only place COI / lien / retainage words exist | `00579_trade_agreements.sql:58-108` |
| 8 | SMS conversation | `sms_conversations` one per (twilio number, phone) | consent is reduced across ALL party rows on the phone at send time | `00282_sms_core.sql:29-31`; `supabase/functions/_shared/sms.ts:174-185` |
| 9, 10 | directory rows | `people_directory` role `gc`, one per party row (person_id = party id) | the People room lists him twice under GCs; the head count counts both | `00589:824-860`; `people-room.tsx:383` |
| 11 | directory row | `people_directory` role `contact` (person_id = studio_contacts id) | excluded from every Directory chip | `00589:912-935`; `directory-view.tsx:294` |
| 12, 13 | roster rows | `v_project_roster` source party, one per project | reach chip, vitals | `00419:97-122` |
| 0 | login | `profiles` | none: no code writes `project_parties.profile_id`; a GC has no account tier | `00420:57-60`; §C |

Count: one human = 2 rolodex cards + N party rows + N field links + N directory rows + 1 hidden directory row + N roster rows + 0 logins. Identity across them is heuristic (name + phone_e164, `directory-view.tsx:155-178`; phone / email / profile / contact keys, `roster-derivation.ts:282-294`; fold key `00418:40-52`).

---

## C. Access tiers

| Tier | Grant record | Grant UI / path | Revoke path | Who can hold it | Evidence |
|---|---|---|---|---|---|
| Studio member | `organization_members` row (`status='invited'` then `active`; `role` owner/admin/member/guest) | `useInviteMember` → edge fn `workspace-member-invite` (mints/resolves auth user, inserts invited row first, optional `studio_designer` grant, branded email) | `useRemoveMember` deletes the row; `useLeaveOrganization` | studio staff only | `packages/supabase/src/hooks/use-organizations.ts:324-345`, `:477-494`; `supabase/functions/workspace-member-invite/index.ts:19-22`, `:202-206`; `00021:132-146` |
| Designer platform role | `user_roles` → `roles.domain = 'designer'`; trigger syncs `profiles.is_designer` | designer-invite / workspace invite | none surfaced | studio staff | `00290_designer_invite_foundation.sql:30-62`; `00021:4-17`, `:30-32` |
| Platform admin | `user_roles` → `roles.domain = 'admin'` | seeded / admin portal | none surfaced | Patina staff | `00040_notification_preferences.sql:108-114`; `00024_designer_applications.sql:83` |
| Project team seat | `project_team_members` (role lead_designer / support_designer / vendor / client / bookkeeper / previous_lead) | no typeahead or picker writes it | lead designer ALL policy | studio staff (logins only) | `00084:160-172`; `00093:30-43`; `docs/design/studio-rosters/README.md:91` |
| Client account, path (a) "the letter" | `client_invitations` row (token, 7-day `expires_at`, `accepted_at`, `revoked_at`) + GoTrue magic link minted at accept | `POST /api/clients/invite` with `letter:true` (flag `client-invite-letter`) → `send-the-letter.ts` → edge fn `client-invite` (`/accept`, `/resend`, `/refresh`); lands `apps/client-portal/src/app/auth/invite/[token]` | designer delete while unaccepted (`00118:40-44`); `revoked_at` read by the landing page | homeowner | `apps/designer-portal/src/app/api/clients/invite/route.ts:33-37`, `:134`; `send-the-letter.ts:6-10`; `supabase/functions/client-invite/index.ts:4-6`, `:340-344`, `:363-387`; `apps/client-portal/src/app/auth/invite/[token]/page.tsx:18`, `:91`; `00118_client_invitations.sql:5-16` |
| Client account, path (b) direct GoTrue | none: `auth.admin.inviteUserByEmail`, then `user_roles` insert, then `designer_clients` row; no `client_invitations` record | same route with the flag off or `invite=true` legacy branch | none (no record to revoke; GoTrue link expires at otp_expiry) | homeowner | `route.ts:53-54`, `:171`, `:217`, `:232`; `client-invite/index.ts:16-21` (why the 7-day object exists) |
| Client account, iOS Patina | Supabase Auth: password / Apple / Google / magic link / OTP | app sign-in | account deletion (`00025`) | homeowner | `apps/mobile/Patina/Patina/Services/Auth/AuthService.swift:94-95`, `:119-122` |
| Client read of the crew | `project_parties.show_to_client` per row | roster row "Show to client" toggle | toggle off | homeowner (read only) | `00419:61-62`; `00420:373-383`; `roster-row.tsx:263-268`; `apps/client-portal/src/components/threshold/threshold.tsx:1014-1019` |
| Patina Field (iOS) login | `field://login?v=1&th=<hash>` minted by edge fn `field-login-token` for the CALLER'S OWN email only | designer session QR | n/a | studio staff only; no trades identity | `supabase/functions/field-login-token/index.ts:7-15` |
| Ambient QR (web) | `qr_auth_sessions` (session_token, status pending/approved/expired/denied, token_hash, expires_at) + rate limit | `/api/auth/qr/{generate,status,verify}` (designer portal) | expiry / deny | studio staff | `00033_qr_auth_sessions.sql:5-19`; `00426_harden_qr_auth_handoff.sql:12`; `00427_atomic_qr_auth_rate_limit.sql:22`; `apps/designer-portal/src/app/api/auth/qr/` |
| Document share link | `document_shares` (sha256 `token_hash`, status active/revoked, optional `expires_at`) | `create_document_share` RPC; read at `/share/[token]` | `revoke_document_share` | anyone with the link | `00266_document_shares.sql:27-37`, `:89`, `:140`, `:181`; `apps/client-portal/src/app/share/[token]` |
| Field link | `field_link_tokens` per party per project (hash, active/revoked, 90 days) | `create_field_link` from the party sheet / roster row; read at `/field/[token]` via `resolve_field_link` | `revoke_field_link`; mint supersedes | trade (no login) | `00283:26-33`, `:86`, `:139`, `:182`; `apps/client-portal/src/app/field/[token]/page.tsx:42`; `party-profile-sheet.tsx:420` |
| Trade RFQ link | `trade_rfq_tokens` (hash, 30 days, mint service_role only) | `trade-rfq-send` edge fn; read at `/rfq/[token]` | scope close `_close_trade_rfqs_for_scope` | trade | `00424_trade_rfq_rail.sql:124-135`, `:447`, `:492`, `:522`, `:902`; `apps/client-portal/src/app/rfq/[token]` |
| Trade Agreement link | `studio_trade_agreement_tokens` (hash, 30 days, `contact_id` keyed) | `send_trade_agreement` → `mint_trade_agreement_token`; read at `/trade/[token]`; sign by token | mint revokes prior active | trade | `00579:182-191`, `:535`, `:598`, `:628-635`, `:684`, `:787`; `apps/client-portal/src/app/trade/[token]` |
| Plan transmittal link | `plan_transmittal_tokens` (hash, 90 days); transmittal record is immutable and statusless | plan room issue; read at `/plans/[token]` | token revoke only | trade / architect | `00429_plan_room_foundation.sql:260-264`, `:302-313`; `apps/client-portal/src/app/plans/[token]` |
| Site request access | `site_request_access`; `site_requests.consent_status_snapshot` | field site-request loop over the field link | request close / expiry | trade | `00374_field_site_request_loop.sql:20-40`, `:236` |
| Invoice pay link | `invoice_links` (PLAINTEXT 64-hex token, no expiry, status active/revoked/closed) | minted on issue; read at `/pay/[token]` | Regenerate (revoked) / void (closed) | homeowner or anyone with the link | `00574_invoice_links.sql:63-89`, `:104`, `:117`; `apps/client-portal/src/app/pay/[token]` |
| Evidence upload link | `fulfillment_evidence_upload_tokens` (plain token PK, `expires_at`, `revoked`, `used_count`) | fulfillment exception flow; read at `/evidence/[token]` | `revoked` flag | vendor / receiver | `00364_fulfillment_exceptions.sql:55-64`; `apps/client-portal/src/app/evidence/[token]` |
| Project review access | `project_review_access` (edition_id, actor_id → profiles, status, expires_at, revoke reason required) | FF&E release | revoke with reason | logins only | `00438_ffe_release_security_hardening.sql:12-26` |

Divergence marked: rows "Client account, path (a)" and "(b)" are the two client-invite paths the seed names; which runs is decided per request by the `client-invite-letter` flag and the `letter` body field (`route.ts:33-37`, `:134`).

---

## D. Channels

| Channel | Table(s) | Consent / preference field | Opt-out handling | Covered | Bypasses | Evidence |
|---|---|---|---|---|---|---|
| Email, account holder | `profiles.email_suppressed`; `notification_log` | `notification_preferences.channels_email` (00040); category transactional vs other | suppression check only when `options.userId` is set; `List-Unsubscribe` headers only when non-transactional AND `userId` | people with a `profiles` row | everyone else | `supabase/functions/_shared/send-email.ts:247-253`, `:293-295`, `:188-189`; `00040:18-26` |
| Email, non-account person (party, vendor, rolodex) | `notification_log` row only when `userId` OR `ref` (user_id nullable since 00591) | none | none: no suppression, no unsubscribe; explicit at the RFQ sender | trades, vendors, rolodex | all compliance | `send-email.ts:430-434`, `:438-446`; `supabase/functions/trade-rfq-send/index.ts:207-215`. SEED CLAIM NOT VERIFIED: seed says "notification_log only when a userId resolves to a profile"; a `ref` now earns a log row too (`send-email.ts:430-434`) |
| SMS, field party (10DLC) | `project_parties.sms_consent_*`; `sms_conversations`, `sms_messages` (service-role writes) | `sms_consent_status` per party row; source/evidence/disclosure version required to reach `pending` (trigger) | inbound `STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT` sets `opted_out` on EVERY party row with that `phone_e164`; `START/UNSTOP` re-grants; `YES` grants pending; `HELP/INFO` replies; send gate reduces consent across all rows on the phone, `opted_out` wins | gc/sub/installer/receiver rows | account-holder rail (separate) | `00281:55-61`; `00432:34-48`; `00282:29-31`, `:111-112`; `supabase/functions/sms-inbound/pipeline.ts:28-29`, `:159-177`, `:311-362`; `_shared/sms.ts:6-8`, `:174-185` |
| SMS, account holder | `profiles.phone`, `profiles.sms_opt_in`; `notification_preferences.channels_sms` | `sms_opt_in` + `channels_sms` | preference flip | logins | parties | `00162_designer_portal_backlog_schema.sql:151-157`; `00040:26`; `supabase/functions/sms-dispatch/index.ts:29-40`, `:99-106` |
| `notification_preferences` duplicate | `public.notification_preferences` (user_id uuid → profiles) AND `svc_projects` `notification_preferences` (user_id TEXT) | two tables, same name | independent | logins | n/a | `00040:18-20`; `00054_svc_projects_schema.sql:276-278` |
| Push | `device_push_tokens` (user_id → auth.users) | none beyond registration | token removal | iOS logins | everyone else | `00335_device_push_tokens.sql:23-25` |
| Thread notifications | `comms_thread_participants.notification_pref` all / mentions / none | per thread per profile | preference | logins | parties | `00101_comms_tables.sql:58-69` |
| GDPR consent ledger | `consent_records` (user_id → auth.users, consent_type, granted, version), `consent_audit_log` | per account | revoke | logins | not read by any send path; referenced only by `use-gdpr.ts` | `00025_gdpr_compliance.sql:187-213`, `:256`; `packages/supabase/src/hooks/use-gdpr.ts:18` |
| Preferred channel / do-not-contact | `designer_clients.preferred_contact` TEXT exists; nothing on `project_parties`, `studio_contacts`, `organization_members`, `vendors` (vendors carries a `preferred_contact` JSON of a sales contact, not a channel) | free text; typed in the hook; no People-room surface reads or writes it; used only as a "has content" test in return-to-lead | none | n/a | everyone | `00062_client_management_v2.sql:20`; `use-clients.ts:36`; `00589:268-276`; `apps/designer-portal/src/lib/vendor-columns.ts:13`. SEED CLAIM NOT VERIFIED: seed says no such field exists anywhere; one exists on `designer_clients`, unused by the room |

---

## E. Gaps register

Do not read this section until your own findings are written (`panel-brief-common.md` §5).

| ID | Gap | Evidence | Consequence |
|---|---|---|---|
| G-1 | No single person entity: the same human is `profiles` + `designer_clients` + `leads` + `studio_contacts` (person and company cards) + N `project_parties` + `vendors`/`saved_vendors` | `00589:696-935`; §B2 | Identity is re-derived heuristically at every seam (`directory-view.tsx:155-178`; `roster-derivation.ts:282-294`; `00418:40-52`) |
| G-2 | Lead → client link is one-way and optional (`designer_clients.lead_id` ON DELETE SET NULL; `leads` has no client pointer) | `00014:84`; `00589:552-679` | A lead's inquiry history does not travel with the client; undo needs a guarded RPC |
| G-3 | SMS consent is stored per `project_parties` row while STOP and the send gate act phone-globally; the studio's UI reads and writes one row (chip, add sheet, record-consent hook) | `pipeline.ts:159-164`; `sms.ts:174-185`; `person-row.tsx:95`; `use-coordination.ts:686`; `00432:4-11` | One row can read "Texting" while the same phone is opted out on another job; evidence lives on whichever row captured it. SEED CLAIM NOT VERIFIED as stated ("opting out of one project's texts does not opt out others"): the inbound STOP updates every row on the phone; the storage is what is per-project |
| G-4 | Rolodex card carries zero consent, zero compliance, zero preference columns | `00417:70-120` | Consent and documents cannot roll up to the person the studio keeps |
| G-5 | Trades have no account tier: `project_parties.profile_id` is never written; Patina Field login mints only for the caller's own email; the reach chip can never read ACCOUNT for a trade | `00420:57-60`; `field-login-token/index.ts:7-15`; `roster-derivation.ts:360-364` | "Account" reach exists only for staff and homeowners |
| G-6 | Operational email to non-profile people has no suppression and no unsubscribe | `send-email.ts:247-253`, `:293-295`; `trade-rfq-send/index.ts:207-215` | A sub who says "stop emailing me" has no switch |
| G-7 | No preferred-channel / do-not-text / do-not-call field on parties, rolodex, staff; `designer_clients.preferred_contact` is free text no surface reads | `00062:20`; `use-clients.ts:36`; grep of `components/document` empty | The fixture's "contact the office manager, not the owner" and "AHJ: never text" cannot be recorded |
| G-8 | Two divergent client-invite paths chosen per request by a flag; path (b) leaves no invitation record and has no revoke | `route.ts:33-37`, `:134`, `:171-232`; `client-invite/index.ts:4-21` | Invite state is unknowable from the People room for path (b) rows |
| G-9 | The Room head count is `${all.length} people` over `people_directory`, which counts one row per party per project and includes `role='contact'` cards the Directory never renders | `people-room.tsx:383`; `directory-view.tsx:294`; `00589:824-860` | The number over-counts humans and under-shows the rolodex |
| G-10 | REMOVE from a call sheet is a hard delete of the party row (consent ledger and field-link lineage go with it) | `use-coordination.ts:808-816`; `docs/design/studio-rosters/README.md:94` | Consent evidence is destroyed by a roster edit |
| G-11 | Archived rolodex cards are reachable only through the seed-review sheet | `rolodex-seed-sheet.tsx:3-12`; `README.md:97`; grep `useArchiveStudioContact` → one consumer | No standing archive / restore door |
| G-12 | `studio_contacts.contact_kind` is free text with a promised `ContactKind` vocab that does not exist; company kinds are five UI-only labels | `use-studio-contacts.ts:31-34`; `00417:82-87`; `company-row.tsx:34-40` | Filtering the rolodex by kind rests on whatever string was typed |
| G-13 | Vocabulary has no kind for owner's rep, lender / draw inspector, AHJ inspector, engineer, surveyor; `FieldTrade` has no radon, insulation, waterproofing, low-slope roofing/solar, septic; `other` rows never open a profile | `field-config.ts:18-41`, `:110-121`; `roster-derivation.ts:178-186` | Construction parties are forced into `other` and go dark |
| G-14 | Compliance documents (COI, W-9, license, lien waivers) have no table; the only words live as policy fields on `studio_trade_agreements` (`lien_waiver_policy`, `insurance_certificate_required`, `retainage_bps`) | grep of migrations; `00579:58-108` | "Do we hold a current COI for this sub" is unanswerable |
| G-15 | Authority is not modeled: no field says who may approve money, sign change orders, or enter the site; the only authority vocabulary is the decision `court` CHECK (designer/client/gc/vendor/sub/installer/receiver) | `00281:158-171`; `00416:30-36` (staff_role "descriptive, not authorizing") | The fixture's "Adaeze decides finishes, Chidi signs money" has no home |
| G-16 | Studio-side roster has no writer: nothing creates `project_team_members` from the Call Sheet or People room; `ProjectTeamRoster` has no production mount | `README.md:91`; `project-team-roster.tsx:24`; grep | Staff on a job is whatever the project birth wrote |
| G-17 | Person-kind rolodex contacts with no project have no chip and never render in the Directory | `directory-view.tsx:34-44`, `:294` | The rolodex is invisible except via Companies and the seed sheet |
| G-18 | `PersonProfile` sends architect / photographer / stager / contact rows to `TeamProfile` (studio-role colophon) because only maker, client/lead, and gc branch | `person-profile.tsx:911-955` | Opening an architect shows "Studio role" and document visibility for a non-staff person |
| G-19 | Makers surface as companies: directory phone is NULL, email is the orders / trade-account address; the human rep lives in `designer_vendor_accounts.sales_rep_*` which the room never reads | `00589:779-781`; `00009:59-76` | No person to call at a vendor |
| G-20 | Field links, consent, and `show_to_client` are per party row per project; a person on two jobs has two of each; link expiry (90 days) is visible only on the roster, never in the Directory | `00283:26-33`; `00419:113-118`; `person-row.tsx:76-99` | Reach state drifts per project and silently lapses |
| G-21 | Reach chip is absent from the People room; only the Call Sheet shows account / field link / on paper | `person-row.tsx:76-99`; `roster-row.tsx:157` | The studio-wide view cannot answer "how do I reach them" |
| G-22 | Staff titles are descriptive only; the permission tier is owner/admin/member/guest with no per-surface scoping (a part-time bookkeeper sees what a member sees) | `00416:30-36`; `00021:22-24`; `studio-config.ts:59-70` | "Bookkeeper sees invoices only" cannot be expressed |
| G-23 | Directory rows truncate name and relationship line with `text-overflow` where the house sheet forbids truncation on specimens | `person-row.tsx:79`, `:85`; `docs/design/house-sheet/SPEC.md:161-162` | A redesign inherits a rule violation |
| G-24 | Repeat-vendor history is a count on the party row's lineage (`useStudioContactHistory` over `project_parties.studio_contact_id`), not on the card, and the lineage stamp also marks evidence-free fold cards that reuse the party id | `use-studio-contacts.ts:356-365`; `roster-derivation.ts:14-18` | "Worked 3 of your projects" is right only when the fold or promote stamped it |

---

## F. Prior decisions register

Settled unless Kody overrules. Context for the panel, not a veto (`panel-brief-common.md` §6).

| ID | Decision | Source confirmed in worktree |
|---|---|---|
| PD-1 | The rolodex is `studio_contacts`, studio-wide and shared: every active non-guest member reads and writes the same book; soft delete only (Call Sheet R1) | `00417:124-128`; `packages/supabase/src/hooks/use-studio-contacts.ts:8-17`; `docs/design/studio-rosters/README.md:12-13`, `:38` |
| PD-2 | The rolodex is auto-seeded from `saved_vendors` and `project_parties`, then owner-reviewed; merges require evidence (phone, then email, else the party id) (Call Sheet R5) | `00418:1-12`, `:40-52`; `rolodex-seed-sheet.tsx:3-12`; `README.md:39` |
| PD-3 | The project roster = `project_parties` (external) + `project_team_members` (staff) behind one `v_project_roster`; party rows keep their own snapshot, `studio_contact_id` is lineage not a join | `00419:30-33`, `:74-95`, `:160-167`; `00418:70-77`; `README.md:40` |
| PD-4 | Taxonomy is code-resident vocabulary; the DB stores free TEXT with no CHECK (trade, contact_kind, staff_role, job_title, specialties) | `00281:63-66`; `00417:82-87`; `00416:30-36`; `packages/types/src/field-config.ts:9-12`; `studio-config.ts:1-8` |
| PD-5 | The People room's default lens is STUDIO; a designer opts into MINE (U6, Wave 4) | `scope-lens.tsx:21-23`; `people-room.tsx:91-94`; `docs/design/studio-rosters/the-call-sheet-ui-proposal.html` ("U6 · the default lens"); `README.md:59-60` |
| PD-6 | The Call Sheet is a DocSheet opened from the letterhead instrument ("not a tab; an instrument on the letterhead"), never a route or a tab | `call-sheet.tsx:4-6`; `letterhead-instruments.tsx:454-473`; `the-call-sheet-ui-proposal.html` ("DocSheet on /doc/<project> · letterhead instrument"); `README.md:52-58` |
| PD-7 | The People room is a walk-in Room with a unified directory of every party, role-filterable, one row per party with role badge + relationship line + status dot; six rail views (R57, pkg R50) | `docs/design/the-document/DECISIONS.md:2214-2222`; `docs/design/the-document/people/the-document-people-room-package.md:34-47`; `people/WAVE-0-ARCHITECTURE.md:9-13`, `:27-39` |
| PD-8 | The relationship journey is a derivation, never a stored activity log (R51); threads are one shared model with the document margin (R52) | `the-document-people-room-package.md:49-78`; `WAVE-0-ARCHITECTURE.md:58-61`; `person-profile.tsx:20-23` |
| PD-9 | Makers are added in People, trade terms and POs stay in the Orders book; marketplace save = admission (R78) | `DECISIONS.md:2652-2654`; `makers-marketplace.tsx:3-12` |
| PD-10 | Field parties (gc/sub/installer/receiver) open the field party sheet over the Room, not the relationship profile (D1) | `people-room.tsx:71-77`, `:281-282`; `use-people.ts:41-49` |
| PD-11 | Per-row client visibility is opt-in (`show_to_client`, default false) (Call Sheet R4/U2) | `00419:22-28`, `:61-62`; `00420:373-383` |
| PD-12 | Reach is one of three words on every roster row: Account, Field link, On paper; account wins over a live link | `studio-config.ts:169-175`; `roster-derivation.ts:351-364`; `reach-chip.tsx:3-15` |
| PD-13 | Flag posture: the whole Call Sheet program sits behind `call-sheet`, checked at each consumer; flags fail closed | `README.md:69-82`; `directory-view.tsx:220`; `call-sheet.tsx:76` (flag state in PostHog not verifiable from this worktree) |
| PD-14 | Studio surfaces may run to a 1200px band; prose caps at 65ch; client pages keep the 1100px measure (house sheet §F-Q) | `docs/design/house-sheet/SPEC.md:1182-1186`, `:165` |

Docs present in the worktree: `docs/design/studio-rosters/README.md`, `the-call-sheet-proposal.html`, `the-call-sheet-ui-proposal.html`; `docs/design/the-document/people/WAVE-0-ARCHITECTURE.md`, `the-document-people-room-package.md`, `patina-people-room-prototype.html`. `docs/vision/VISION.md` is NOT in this worktree; `docs/vision/VISION-DECISIONS.md:18-21` carries the S1/S2/S4 constraints the panel brief quotes.

---

## G. Seed claims not verified

| # | Seed claim | Finding |
|---|---|---|
| 1 | "PartyKind 12" | `PartyKind` has 11 members (`field-config.ts:110-121`); `PartyRole` has 12 (`use-people.ts:27-39`) |
| 2 | "per-project SMS consent (opting out of one project's texts does not opt out others)" | Storage is per row, but inbound STOP opts out every `project_parties` row on the phone (`pipeline.ts:159-164`) and the send gate reduces across rows with opted_out winning (`sms.ts:174-185`). The studio-facing read and write are per row (G-3) |
| 3 | "NO contact_preference / preferred_channel / do_not_contact field anywhere" | `designer_clients.preferred_contact` TEXT exists (`00062:20`), typed at `use-clients.ts:36`, read only as a content test at `00589:273`; no People-room surface uses it. No such field on parties, rolodex, staff |
| 4 | "notification_log only when a userId resolves to a profile" | A `ref` also earns a log row since 00591 (`send-email.ts:430-434`); suppression and unsubscribe still require `userId` (`:247-253`, `:293-295`) |
| 5 | "docs/vision/VISION.md wins over every other doc" (CLAUDE.md) | File absent from this worktree; only `docs/vision/VISION-DECISIONS.md` is present (`ls docs/vision`) |
| 6 | "project_team_members role CHECK lead_designer|support_designer|vendor|client|bookkeeper|previous_lead (00084)" | 00084 has five values (`00084:164-165`); `previous_lead` was added by `00093:30-43` |
| 7 | "designer_clients: client_id nullable" | True, but shaped by `00018:7`, not 00583; `client_email` / `client_name` also from `00018:10-11` |
| 8 | "site_request_access (00374)" as a share-token table | `site_request_access` exists (`00374:236`) but the guest read rides the field link; the consent snapshot sits on `site_requests` (`:28-29`). No separate token column verified |
| 9 | "the client portal's 'On the job' group (`ProjectTeamPanel`)" (studio-rosters README) | No `ProjectTeamPanel` export found; the client-side read is inline at `apps/client-portal/src/components/threshold/threshold.tsx:1014-1019` |

All other seed claims verified at the lines cited above.
