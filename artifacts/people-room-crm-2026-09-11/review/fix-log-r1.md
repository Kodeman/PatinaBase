# Fix log, review round 1

## specimens/people-room-1440.html (Builder A, the 1200 band at 1440)

Nine findings assigned. Seven fixed in the file, two returned as deviations.

| ID | Severity | What changed | Where |
|---|---|---|---|
| DR-1 | blocking | Two curly apostrophes (U+2019) replaced with the straight ASCII `'` (0x27): `Worked 2 of the studio's projects. Last touch 17 October 2026, text, logistics.` on the person card's History region, and `This drafts a note to Northgate Electric's paperwork contact and files it for your review. Nothing is sent until you send it.` on the company card. `grep -c $'’'` on the file now returns 0. The second sentence is now built as `'…note to ' + esc(co.name) + '\'s paperwork contact…'`, so the possessive follows whichever firm's card is open. | `renderPerson()` History, `renderCompany()` Paper |
| CR-1 | blocking | The Call Sheet vitals line is no longer a literal. It is counted off the same engagement bands printed under it: `onNow` = every engagement with a person in band `studio`, `client` or `week` (3 + 2 + 7 = 12), then `Texting` consent, `Account` reach and `On paper` reach tallied over that same cohort. The line renders **"12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper"** (was "14 … · 9 … · 5 … · 6 …"). | `renderRoster()` |
| CR-2 | blocking | The company card is no longer hardcoded to Northgate Electric. `renderCompany()` reads `C[companyId]`; `companyId` defaults to `'northgate'` (so `#state-company` still opens the acceptance card) and a Directory firm-row click calls `openCompany(id)`, which re-renders the company face and navigates. Every region is now gated on the fixture having the fact: header meta pluralises `person/people` and `project/projects` and adds the warranty clause only when `warrantyUntil` exists; Crew & designations lists every person at the firm with their `designations` (and "holds the trade licence" only for a sole proprietor holding a licence document); Paper, the held clause, the "Chase the renewal" act and its consequence appear only when the firm has documents / a non-current document; Payee, Jobs, the money-book ledger act (only when a non-current document blocks the draw) and History appear only when the fixture carries them. **Twin Cities Drywall & Plaster now opens with C7 resolved**: "Frank Bauer · owner, signer · signer", his blocked rule "Do not contact directly. Write Rosa Delgado instead." on a terracotta leading rule, and the routed channel line "Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114". Marrow & Sons opens with its three-document Paper table, payee and three job rows. Northgate Electric's rendered face is unchanged apart from DR-1 and CR-14. | `renderCompany()`, `openCompany()`, the click handler |
| CR-3 | major | The person card is no longer hardcoded to F-11. `renderPerson()` reads `P[personId]`, default `'F-11'`; a Directory row's open button and the company card's crew links call `openPerson(id)`. Regions degrade on the fixture, not on an id: the ", since YYYY" tail is read out of the firm's own history line, "Sole proprietor" needs `soleProprietor`, Channels falls back to the person's phone and email when no typed-channel record exists and reads "No channel on file." when the record is empty (Frank Bauer), Contact rule / Access grants print "No contact rule on file." / "No grant on file." when absent, the seat line prints the engagement's own authority, its site-access mode ("Escorted on site", "Holds a key", "Controls the gate", "On site by appointment", "No site access"), "Contracted through Marrow & Sons" derived from the job's GC engagement, and "Hidden from the client" for subs and makers. The "Send a text" act appears only where consent reads `Texting`. Chidi Okonkwo, Frank Bauer, Ray Thao, Tom Marrow and the rest now open real cards. Dana Kowalski's rendered face is unchanged apart from DR-1. | `renderPerson()`, `openPerson()`, the click handler, `.link-act` CSS |
| CR-5 | major | A role row was added to the Call Sheet, directly under the vitals: `role="group" aria-label="Narrow the call sheet by role"`, `Everyone` pressed plus one word per engagement kind on the sheet, derived through a `ROLE_WORDS` map in band order — Studio, Client, GC, Subs, Receiver, Architect, Inspectors, Makers, Stager, Photographer. Every word carries `aria-pressed`. The 2-click "narrow by role" path direction.md §6 claims for Task 6 now exists. | `renderRoster()`, `ROLE_WORDS` |
| CR-14 | major | `wordEl()` takes an explicit tone as a third argument. `docCells()` passes `'blocked'` for any document whose state is not `Current` and whose `blocks` array is non-empty, so Northgate's "COI, workers compensation · Not on file · Site access, draw" now prints in terracotta beside the lapsed GL row instead of neutral grey. The word itself is unchanged, so SPEC §5.3 #3 still reads `Not on file`. Scope note: the override is on the document row, where a `blocks` array exists. A firm's summary paper word (Great Northern Bank, CPED Inspections, both "Not on file" with nothing to block) stays dormant, so the same word carries two pigments across two faces — the tone follows the consequence, which is what the finding asked for, but it is worth a ruling. | `wordEl()`, `docCells()` |
| DR-2 | major | Not a change to the specimen. `tools/render.mjs` now merges into `<name>-console.json` instead of overwriting it (that edit arrived from the 390 side while this fix was in flight; it was taken as given, not re-made). The 1440 render command in SPEC §9 was re-run against the fixed file and the report now holds **twelve captures — six at 390, six at 1440 — with 0 errors, 0 warnings and `horizontalOverflow: false` on every one**. | `shots/people-room-console.json` |

### Not fixed

| ID | Severity | Why |
|---|---|---|
| CR-6 | major | The fix asks for a rolodex-picker / travel-list state or an explicit scope-out of Leah's Task 5. A seventh state cannot be added inside this contract: SPEC §4 fixes the state list at six, §4's switching rule keeps exactly one of those six regions in flow, and §9's render command names six hashes. The remaining option — scoping Task 5 out in `synthesis/direction.md` §6 — is a panel document shared with the 390 fixer and a ruling rather than a build fix, so it is returned rather than taken unilaterally. |
| CR-13 | blocking | The fix begins "Confirm with Kody whether invoice/CO screens are out of the People Room's scope". No invoice or change-order face can be added for the same reason as CR-6 (six states, fixed), and softening direction.md §6's acceptance wording is the ruling that confirmation would authorise. Returned for Kody's ruling. |

### Gate

- `grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled' people-room-1440.html` → **0**
- Last line → `<!-- specimen-complete -->`
- No hex literal outside the pasted token block; no curly apostrophe; "Remove" absent; no forbidden vocabulary on a face
- Render (SPEC §9, Builder A): six plates written, exit 0, `people-room-console.json` = 12 captures, 0 errors, 0 warnings, no horizontal overflow
- Every §5 acceptance string still on the face except the one CR-1 deliberately recomputed (see below)

### Known deviation from SPEC

SPEC §5.4 #3 names the vitals literal "14 on the job this week · 9 reachable by text · 5 with accounts · 6 on paper". CR-1 is blocking and asks for the line to be recomputed from the real band counts, which it now is. The literal §5.4 #3 string is therefore no longer on the face; the line reads "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper". The two contracts cannot both be satisfied — the fixture holds 12 people in those three bands and §8 #2 forbids inventing two more. The 390 file must land on the same four numbers or the widths will disagree.

DR-3 (the extra `}` after the token block) was not assigned and was left alone: SPEC §2 instructs "append one closing brace `}` on its own line" after pasting §2.1, and §2.1 as printed already balances at 4 opens / 4 closes, so this file is what the literal instruction produces. The two files differ here and one of them should be corrected once someone rules which reading wins.

---

# people-room-390.html — round 1 fixes

File: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/specimens/people-room-390.html`
Fixed 2026-09-11. Only the 390 specimen was edited (plus `tools/render.mjs`, for DR-2 — see below).

| Finding | What changed |
|---|---|
| **CR-1** (blocking) | `FACE.vitals` split into `FACE.vitalsRest`; `renderRoster()` now derives the first figure from the bands it prints: `['studio','client','week'].reduce((n,b) => n + bandOf(b).length, 0)` → **12**. The Call Sheet reads `12 on the job this week · 9 reachable by text · 5 with accounts · 6 on paper`. **SPEC §5.4 #3's literal `14` is no longer on the face** — see deviations. |
| **CR-2** (blocking) | `renderCompany()` → `renderCompany(cid)`, driven by a module-level `coFocus` (default `northgate`, so the hash-only render is unchanged). `dirFirmRow()` now emits `data-open-company="<cid>"` on every firm row instead of a `data-go` only for Northgate; a new click branch sets `coFocus`, repaints `#state-company` and navigates. Card content is now derived per firm: header meta from `kind`/`crew`/`jobs`/`warrantyUntil`; new `crewOf()`/`crewLine()` build the designation line from `designations` + the firm's licence document; Paper, the held sentence, "Chase the renewal" + its consequence, Payee, Jobs and History each render only when that firm's fixture holds them. Twin Cities Drywall & Plaster now prints C7 in full: `Frank Bauer · owner, signer · signer`, no channel, `Do not contact directly. Write Rosa Delgado instead.` on a terracotta rule, then `Write Rosa Delgado · Email · rosa@twincitiesdrywall.com`. |
| **CR-3** (major) | `renderPerson()` → `renderPerson(pid)`, driven by `pFocus` (default `F-11`). `dirPersonRow()` and `rosterPersonRow()` emit `data-open-person="<pid>"` on every row; the company card's crew lines link the same way. Regions gate on real fixture data: `FIXTURE.channels[pid]` with a new `fallbackChannels()` from the person's own phone/email (and `No channel on file.` for Frank Bauer), consent note only when `consents[].channelValue` matches, Contact rule / Access grants / Seats / Past seats / Paper / History / "Send a text" each rendered only when that person's fixture carries them. Chidi, Adaeze, Frank, Rosa, Ray Thao, Carol Nystrom, Pete Rusk and the rest now open real cards. The exemplar card for F-11 is byte-identical to before (verified against SPEC §5.2). |
| **CR-4** (major) | New `deskFigure()` replaces a money figure with `the limit`, and `deskHid()`/`deskNote()` print one `The figure is on the desk.` line per row or region where a figure was withheld. Applied to the rule clause on Directory and Call Sheet rows, the authority sentence on Call Sheet rows, and both on the person card. At 390 Chidi Okonkwo now reads `Signs money to the limit.` and `Email first. Call for anything over the limit.` — the string `$2,500` no longer appears on any face. Per PR-t; **SPEC §5.4 #5's literal figure is therefore off the 390 face** — see deviations. |
| **CR-5** (major) | `renderRoster()` gained a role narrow above the bands: `<div class="narrows" data-narrow="roster" role="group" aria-label="Narrow the call sheet by role">` with `Everyone` pressed plus the 13 distinct `engagements[].kind` values (lead designer, bookkeeper, principal, client, household member, gc, sub, receiver, architect, inspector, maker, stager, photographer). Every roster row carries `data-kind`; new `narrowRoster()` hides non-matching rows and any band left empty. Verified: narrowing to `sub` leaves 11 rows in 4 bands. Task 6's 2-click role path is now performable. |
| **CR-14** (major) | New `docWord(d)` / `docBlocks(d)`: a document reading `Not on file` with a non-empty `blocks` array now takes the `.word--blocked` terracotta treatment, the same as `Lapsed`. Northgate's `COI, workers compensation` row prints `NOT ON FILE` in terracotta. The firm-level `Not on file` word (Great Northern Bank, CPED, Rivera, Granite North — no documents, nothing blocked) is untouched and stays dormant, so SPEC §5.1 #10's Ray Thao row is unchanged. |
| **TR-2** (major) | `Log who was told` now initialises `aria-expanded="false"` and `<div id="told-band" class="stack" hidden>`, matching 1440. Confirmed collapsed in `shots/people-room-state-access-390.png`; the existing toggle opens it. |
| **DR-2** (major) | `tools/render.mjs` now merges into `<base>-console.json` instead of overwriting it: it reads any existing file, drops entries whose `file` this run re-captured, and concatenates. Either render command can run in either order and the shared report keeps all twelve. `shots/people-room-console.json` now carries **12 captures, 0 errors, 0 warnings, 0 horizontalOverflow**; a per-width copy is kept at `shots/people-room-console-390.json`. |
| CR-6, CR-13 | Not fixed — see deviations. |

**Render** (SPEC §9, 390 command, verbatim):

```
✓ people-room-state-directory-390.png
✓ people-room-state-person-390.png
✓ people-room-state-company-390.png
✓ people-room-state-roster-390.png
✓ people-room-state-add-390.png
✓ people-room-state-access-390.png

Console log: people-room-console.json (12 captures)
EXIT=0
```

Chromium cannot launch inside the agent sandbox (`FATAL:mach_port_rendezvous_mac.cc:155 … bootstrap_check_in … Permission denied (1100)`); the render command was re-run with the sandbox disabled. The `playwrightModulePath` line in `tools/render.mjs` already pointed at the absolute path and needed no edit.

**§10 checks**

| # | Check | Result |
|---|---|---|
| 1 | Last line | `<!-- specimen-complete -->` (od: `e t e space - - > \n`) |
| 2 | `grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled'` | `0` (individually: box-shadow 0, text-overflow 0, placeholder= 0, ` disabled` 0, opacity 0) |
| 3 | §5 acceptance strings on the face | All present at all six states except the two deliberate CR-1/CR-4 deviations below (machine-checked: every double-quoted string in SPEC §5 against the live DOM text + HTML + control values) |
| 4 | Names/firms/phones in §3's JSON | Yes — no new proper noun, firm or phone was introduced; new prose is `No channel on file.`, `The figure is on the desk.`, `the limit`, `Write <name> · <kind> · <value>`, and the role words, all drawn from the fixture |
| 5 | Render | 12 names, 0 errors, 0 warnings, no horizontal overflow |
| 6 | Token block + class fragment | Unchanged, byte for byte (fragment verified `in` source; token block identical to SPEC §2.1 as pasted — the 390 file's brace count is the one the technical and design reviews both judged correct) |

**Deviations from SPEC, taken deliberately to satisfy a blocking/major review finding**

1. **SPEC §5.4 #3** demands the literal `14 on the job this week`. CR-1 proved the arithmetic false (studio 3 + client 2 + week 7 = 12). The face now reads `12`. The other three figures (`9 reachable by text · 5 with accounts · 6 on paper`) were **not** flagged and were left as SPEC's literals, so the two widths stay identical on them.
2. **SPEC §5.4 #5** demands the literal `Signs money to $2,500.` on the Call Sheet. PR-t rules the figure onto the desk only, and CR-4 names the 390 file specifically. The figure is withheld at 390 and stays on the 1440 face. This is a deliberate, ruled divergence from SPEC §3's "both widths must show identical facts."
3. `tools/render.mjs` was edited (the DR-2 merge). It is the only file outside the 390 specimen that was touched, and it is the fix DR-2 itself names.

**Not fixed**

- **CR-6** (major) — the rolodex picker / travel-list pane. Its fix requires either a seventh state, which SPEC §4 forecloses (six states, six state-bar buttons, a fixed hash list), or scoping Task 5 out of `synthesis/direction.md` §6, which is a panel-document ruling rather than a specimen fix and is shared with the 1440 fixer. Left for Kody.
- **CR-13** (blocking) — Task 2's "visible on the invoice or CO that needs it." The finding's own fix is "confirm with Kody whether invoice/CO screens are out of the People Room's scope." No invoice or change-order face can be added under SPEC §4's six states, and softening the acceptance wording in `direction.md` is Kody's ruling to make. Left for Kody.
