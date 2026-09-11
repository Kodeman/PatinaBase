# Construction re-read — CS1 (GC/PM) + CS4 (electrical sub owner) walk the specimens

Seats: CS1 (Tom Marrow lens on the GC/PM memo), CS4 (Dana Kowalski's own seat, the electrical
sub owner). Read: `panel/construction/cs-1-gc-pm.md`, `panel/construction/cs-4-trade-sub-owner.md`,
`panel/ux/ux-5-leah-walk.md`, `synthesis/direction.md` §6, both specimen HTML files, and all 12
plates in `shots/`. Evidence below is `file:line`, exact strings, and `state-*` hash — no paraphrase.

Both specimens (`specimens/people-room-1440.html`, `specimens/people-room-390.html`) render the
same six states from the same fixture: `state-directory`, `state-person`, `state-company`,
`state-roster`, `state-add`, `state-access`. `shots/people-room-console.json` reports
`horizontalOverflow: false` for all six 390px captures; I confirmed no overflow visually at 1440
either (max-widths of 720/760/1200px sit inside the 1440 viewport).

**Clean = false.** 4 blocking, 6 major, 4 minor findings below (CR-1 … CR-14).

---

## 1. CS1 and CS4 top-5 asks — tracked on the face?

| # | Ask (CS1 §8 / CS4 §8) | Tracked on a face? | Where | Builder/sub language? |
|---|---|---|---|---|
| CS1-1 | Compliance document w/ expiry on the firm (COI, W-9, licence, per-draw waiver) | **Yes**, mostly | `state-company` (Paper table: type/number/issuer/expires/state/held-by/blocks) and mirrored on `state-person` for Dana | Yes — "COI, general liability · GL-9021-18 · Lakes Casualty · expired 31 March 2026" and "Blocks site access, payment and the draw." reads exactly like CS1's own COI story. Per-draw waiver is only a link-out ("Draw 1 waiver ledger, in the money book"), not shown (CR-10). |
| CS1-2 | Authority set (money, CO, schedule, site, key) on party-on-job / household | **Partial** | `state-roster` (`e.authority` line), `state-directory` (rule clause), `state-person`/site-access (`access` word) | Yes, in prose: "Signs sub payments. Prices change orders.", "Signs money to $2,500.", "Controls the gate.", "Holds a key." — but combined into one free-text line per person, not itemised money/CO/schedule/site/key, and never reaches an invoice/CO screen (CR-13). |
| CS1-3 | Contact rule (primary/never/route-through) on person and party row | **Yes** | `state-directory`, `state-roster`, `state-person` (Contact rule region) | Yes — "Do not contact directly. Write Rosa Delgado instead." and "Never text. Office phone or the 311 portal only." are exactly CS1's own phrasing. |
| CS1-4 | Phone-scoped consent shown truthfully, inherited on a new job | **Yes, and it is the fixed version** | `state-directory`/`state-roster`, Pete Rusk (F-12) row | Pete now reads **"Opted out"** with "Opted out by text, 3 December 2025, on the Lindqvist kitchen." — the exact CS1-4/CS4-6 defect ("Not asked" masking a phone-wide STOP) is resolved on this face. |
| CS1-5 | Relationship stage per firm per studio, `warranty_until`, link lifetime that follows the job | **Yes** | `state-roster` bands (Bidding/Done/Awarded), `state-company` header ("warranty through 21 Nov 2026"), `state-person` Access grants ("Ends with the job, 13 August 2027. Renews when they use it.") | Yes, plain construction words ("Off the job 2 October 2026. The slab program went to Stonehaven Tile Gallery.") — and the 90-day-link defect (CS1-8) is visibly gone: the grant text is job-scoped, not clock-scoped. |

| # | Ask (CS4 §8) | Tracked on a face? | Where | Builder/sub language? |
|---|---|---|---|---|
| CS4-1 | Compliance docs w/ expiry: COI (GL, WC, auto), W-9, licence, bond | **Partial** | `state-company` Paper table | GL and WC modeled (WC correctly "Not on file", flagged as blocking — see CR-14 for its colour); no **auto** COI document exists anywhere in the fixture for any firm, and no bond document type exists (CR-11). |
| CS4-2 | Role at firm, do-not-contact, firm's paperwork contact | **Yes for Northgate, unverifiable for Twin Cities Drywall** | `state-company` Crew & designations: "Dana Kowalski · owner-operator · paperwork contact · signer · site contact · holds the trade licence" | Exactly CS4's own phrasing. But Rosa/Frank's firm (`tcdrywall`) has no reachable company card at all (CR-2), so the same claim for "Rosa is the paperwork contact, Frank is the signer" can only be read off the Directory row's plain word ("Signs: Frank Bauer"), not a company card. |
| CS4-3 | Authority per person: money/CO ceiling, selections, schedule, site access, key | **Partial**, same as CS1-2 | `state-roster`, `state-directory` | Same prose pattern; also violates PR-t at 390 width (CR-4). |
| CS4-4 | Reach preference + hard never-text, typed phones, separate from SMS consent | **Yes for the rule text; typed-channel table only reachable for Dana** | `state-person` Channels table ("Mobile · … · preferred · verified"; "Email · … " held with a reason) | Matches CS4's ask in words. Office/311-portal typed channels exist in the fixture for Rosa (F-14) and Ray Thao (F-27) but their Person cards are unreachable (CR-3), so this can only be confirmed for Dana. |
| CS4-5 | Who holds the trade's paper (`contracted_through`) + per-draw waiver ledger | **Partial** | `state-person`: "Contracted through Marrow & Sons." | Exactly CS4's own vocabulary. The per-draw waiver ledger is a link-out only (CR-10), same gap as CS1-11. |

**Read-out for both seats:** every top-5 ask is at least partially represented, in the seat's own
words, and the two worst current-state bugs each seat's memo used as a war story — the phone-wide
STOP misread as "Not asked" (Pete Rusk) and the 90-day link clock outliving a ten-month job
(Dana's grant) — are demonstrably fixed on this face. The two weak spots are structural: (a) only
one company (Northgate) and one person (Dana) have a reachable detail card, so several claims
about *other* rows can only be checked at the row-clause level, never the card level; (b) authority
is one free-text sentence, never decomposed into the five distinct facts (money/CO/schedule/site/key)
either seat's memo asked for.

---

## 2. Leah's six tasks — acceptance criterion met? On which state? Act count.

| # | Task | Acceptance criterion (direction.md §6) | Met on the face? | State(s) | Acts counted |
|---|---|---|---|---|---|
| 1 | Add Dana, text only | "A rule on the person that every add, every send, and every future edit honours without retyping" | **Yes** | `state-person` (Contact rule region + "Edit the rule"), `state-directory` row clause, `state-roster` row clause | Rule is visible with **0 clicks** everywhere Dana appears (Directory, Roster, Person). "Edit the rule" is 1 act on the Person card. Matches direction.md's claimed "2 for the rule." |
| 2 | Give Adaeze the app; Chidi signs money over $2,500 | "A login and an authority grant recorded as two separate facts, **the grant visible on the invoice or CO that needs it**" | **Partial — first half yes, second half unverifiable** | `state-directory` (Chidi's row: "Signs money to $2,500." rule text), `state-roster` (Chidi's engagement: "Signs money to $2,500." authority text) | The two facts (Adaeze = Account reach; Chidi = authority sentence) are visible with 0 extra clicks on Directory/Roster rows. **No invoice or CO face exists among the six states** (CR-13) — the acceptance criterion's own second clause cannot be exercised on any built face. |
| 3 | Who has site access right now | "Key holder, gate control, hours, and who was told last, from one screen" | **Yes, fully** | `state-access` | **1 click** from the Roster ("Open the site access card") lands on a single screen with all four facts (Ngozi/key, Luis/gate, hours, changeLog sorted newest-first). Matches the "1" click target exactly. |
| 4 | Mark Frank do-not-contact; route to Rosa | "Every attempted contact and every future pick shows 'write Rosa instead'" | **Yes for the row clause; the "company card C7" leg is unreachable** | `state-directory` (Frank's row: "Do not contact directly. Write Rosa Delgado instead."), `state-roster` (same clause, terracotta rule) | **0 clicks** — the clause prints inline on both faces without opening anything. But clicking "Twin Cities Drywall & Plaster" in the Directory does **not** open a company card (CR-2) — only Northgate's card is wired — so the C7 resolution ("Frank named as signer with no channel printed; Rosa's channel shown instead") cannot be checked on any state. |
| 5 | Bring Dana, Pete, Ingrid, the Stonehaven rep onto Okonkwo | "Each arrives with current consent, document status, and one history line, never with old pricing" | **No state to exercise this on** | none | Direction.md §6 names "Rolodex picker travel-list pane with multi-select" as the surface; **no such state exists** among the six built faces. `state-add` only demonstrates typing in one brand-new person (Joe Wozniak) from scratch — no rolodex search, no multi-select, no carried-forward consent/COI notice. (CR-6) |
| 6 | Everyone on Okonkwo by role, this week | "The roster narrows to who is on site this week, **by role**, leaving out unopened/closed windows" | **Partial — window banding yes, role narrowing no** | `state-roster` | **1 click** to open the Call Sheet, correctly banded (Studio/Client/This week/Later/Bidding/Done) so a Feb-2027 radon sub does not list with this week's framer. But **no role-narrow control exists on the Roster face at all** — the "Narrow the crew by trade" chips live only in `renderDirectory()` (`specimens/people-room-1440.html:694-703`), never in `renderRoster()` (`:940-978`). The "2 to narrow by role" click path direction.md §6 claims cannot be performed. (CR-5) |

---

## 3. Things a GC or a sub would read as wrong, naive, or unusable

### CR-1 — Blocking — Vitals line doesn't add up to the bands printed directly under it
`state-roster` prints **"14 on the job this week"**
(`specimens/people-room-1440.html:949`, `specimens/people-room-390.html:545`), but the engagement
bands rendered immediately below it sum to 12, not 14: `"band": "studio"` ×3 + `"band": "client"`
×2 + `"band": "week"` ×7 = 12 (verified by `grep -o '"band": "[a-z]*"' … | sort | uniq -c`). A GC
reading a headcount that doesn't match the roster under it (CS4-21's own complaint: "the room head
count counts party rows, not humans") would not trust either number. Same string, same mismatch,
both widths.
**Fix:** derive the vitals line from the actual band counts, or correct the fixture to make the
count true.

### CR-2 — Blocking — Only one company card is wired; every other firm row is a dead click
`renderCompany()` is hardcoded to Northgate Electric in both files
(`specimens/people-room-1440.html:826`: `const co = C['northgate'];`;
`specimens/people-room-390.html:827`: `const c = firm('northgate');`). The Directory's firm-row
click handler only navigates for Northgate — Marrow & Sons and Twin Cities Drywall & Plaster
announce their name via the `aria-live` region and do nothing visible:
`specimens/people-room-1440.html:1195-1199`
(`if (company.getAttribute('data-company') === 'northgate') goto('state-company'); else announce(...)`),
mirrored at `specimens/people-room-390.html:696` (`cid === 'northgate' ? ' data-go=...' : ''`). This
makes direction.md's own **C7 conflict resolution** ("Frank Bauer is named as signer on Twin
Cities Drywall & Plaster's card with no channel printed; the routed channel shown is Rosa
Delgado's" — `synthesis/direction.md` §3.9 C7) unverifiable on any face, and it is one of the two
surfaces Leah's Task 4 acceptance path names ("company card C7").
**Fix:** wire the company card to open by the clicked firm id, or ship a second exemplar card for
Twin Cities Drywall & Plaster.

### CR-3 — Major — Only one person card is wired; every other person row is a dead click
Same pattern as CR-2, one level down: `specimens/people-room-1440.html:1202-1206`
(`if (person.getAttribute('data-person') === 'F-11') goto('state-person'); else announce(...)`);
`specimens/people-room-390.html:666,876` (`pid === 'F-11'`, `e.person === 'F-11'`). Chidi, Adaeze,
Frank, Rosa, Ray Thao, Carol Nystrom — none of them opens a Person card; only Dana Kowalski does.
The underlying facts these people carry (Chidi's threshold, Frank's rule, Rosa's typed office
phone, Ray's never-text rule) are all visible at the row level (see §1/§2 above), so this does not
break the acceptance strings themselves, but it means "Person card R3/R4" as a named surface in
direction.md's own screen inventory (§3.2) and Task 2/4's "Met by" column is unreachable for anyone
but Dana.
**Fix:** wire the Person card to open for any clicked row, or add exemplar cards for Chidi and
Frank specifically, since both are named in Leah's six tasks.

### CR-4 — Major — A dollar threshold prints at mobile width, contradicting the panel's own ruling
`synthesis/direction.md` PR-t rules: *"Show the yes or no ('may approve this change order'), and
the figure only on the desk … A phone in a hallway is read over a shoulder."* The 390px specimen
violates this directly: Chidi Okonkwo's row on `state-roster` prints
**"Signs money to \$2,500."** verbatim (`specimens/people-room-390.html:468`, same string as the
1440 fixture, rendered by the same `rosterPersonRow`), and his `state-directory` row prints
**"Email first. Call for anything over \$2,500."** — the dollar figure appears at 390 exactly as
it does at 1440, with no yes/no substitution. Confirmed visually in
`shots/people-room-state-roster-390.png` and `shots/people-room-state-directory-390.png`.
**Fix:** at ≤390 width, replace the authority sentence with a yes/no readout and move the figure to
the 1440 face only, per PR-t. (Caveat: PR-t may have been written with Patina Field's native app in
mind rather than the designer portal resized to a phone; flagging regardless since the 390
specimen is the artifact under review and the string is identical either way.)

### CR-5 — Major — No "narrow by role" control exists on the Call Sheet
Direction.md §6's own table claims Task 6 costs "1 to open already grouped, 2 to narrow by role."
No such control exists: the only `role="group"` chip rows in either file are inside
`renderDirectory()` (`specimens/people-room-1440.html:694,700`) and `renderAdd()` (`:998`); grep
confirms zero chip rows inside `renderRoster()` (`:940-978`). `state-roster` in both specimens has
no role-narrowing act of any kind.
**Fix:** add a trade/role chip row to the Call Sheet, or correct the claimed click count in
direction.md.

### CR-6 — Major — The Task-5 "bring forward" surface doesn't exist as a state
Direction.md §6 names "Rolodex picker travel-list pane with multi-select" as what satisfies Task 5.
None of the six built states is this surface. `state-add` (`renderAdd`) only demonstrates a single
brand-new hire typed from a blank form (Joe Wozniak) — no search, no multi-select, no rendering of
a picked person's carried-forward consent/COI/history (the "carried-forward notice" the screen
inventory itself promises at §3.5: *"on a rolodex pick: 'Opted out by text 3 Dec 2025, on the
Lindqvist kitchen.'"*). Task 5's acceptance criterion cannot be exercised anywhere on this
specimen round.
**Fix:** either scope Task 5 out of this review round explicitly, or add the picker/travel-list
state before claiming the click counts in direction.md §6.

### CR-7 — Minor — "licence" spelling in Minnesota paperwork copy
Both construction panelists write American **"license"** consistently (12 instances across
`cs-1-gc-pm.md` and `cs-4-trade-sub-owner.md`), but the specimens spell it the British way,
**"licence,"** three times per file: `specimens/people-room-1440.html:352` ("MN BC contractor
licence"), `:361` ("MN electrical contractor licence"), `:843` ("holds the trade licence") — same
three at `specimens/people-room-390.html:343,352,541`. A Minnesota GC or electrical sub reading
their own paperwork would flag this as wrong.
**Fix:** respell "licence" → "license" throughout both specimens.

### CR-8 — Minor — Global head count leaks onto every state at 390px
At 1440, `room-count` ("29 people · 22 firms") is explicitly hidden outside the Directory:
`specimens/people-room-1440.html:1142` (`document.getElementById('room-count').hidden = (state !==
'state-directory');`). At 390, the equivalent `head-count` element is set once in `boot()`
(`specimens/people-room-390.html:1084`) and never toggled — it stays visible under "The People
Room" heading on **every** state, confirmed in `shots/people-room-state-person-390.png`,
`-company-390.png`, `-add-390.png`, `-access-390.png` and `-roster-390.png`. A studio member
opening the Site Access card on a phone sees an irrelevant studio-wide tally above the address.
**Fix:** hide `head-count` outside `state-directory` at 390, matching the 1440 behaviour.

### CR-9 — Minor — Add sheet's kind list doesn't carry PR-f's widened vocabulary
`synthesis/direction.md` PR-f rules: *"Widen in code now: client_rep, inspector with an
ahj/lender/third_party subtype, lender, engineer, vendor, other_named…"* The fixture's own
engagement data reflects this (`"kind": "inspector"` at F-26/F-27; company `"kind": "Lender"` for
Great Northern Bank, `"kind": "Authority"` for the City of Minneapolis) — but the one door a studio
member would actually use to add such a party, the Add sheet's kind switcher, is unchanged:
`const KINDS = ['a client', 'a household member', 'a maker', 'a GC', 'a sub', 'an installer', 'a
receiver', 'someone else'];` (`specimens/people-room-1440.html:980`, identical at
`specimens/people-room-390.html:961`). There is no "an inspector" or "a lender" pick.
**Fix:** either widen the Add sheet's kind list to match PR-f, or state explicitly that inspectors
and lenders are added via "someone else."

### CR-10 — Minor — Per-draw lien-waiver ledger (CS1-11 / CS4-9) is a link-out, not a fact
Both memos' #1/#5 top asks name a per-draw waiver ledger as something Patina should track. The
Company card's "Jobs" region only offers `<button class="act act--inline">Draw 1 waiver ledger, in
the money book</button>` (`specimens/people-room-1440.html:809`) with no draw number, waiver
type, or received-date rendered on the People Room face itself.
**Fix:** acceptable if deliberately deferred to the money book — confirm scope with Kody rather
than silently dropping a fact both construction seats named as a top-5 ask.

### CR-11 — Minor — "COI (GL, WC, auto)" is only ever GL + WC; no auto-liability document type exists
CS4-1 named GL, WC, and auto as the three COI types a firm carries. Northgate's `documents` array
(`specimens/people-room-1440.html:358-363`) has GL, W-9, licence, and WC (correctly "Not on file")
— no firm in the fixture has an auto-liability document at all.
**Fix:** add an auto-liability COI type if CS4-1's three-part ask is meant to be fully modeled.

### CR-12 — Minor (expected/phased) — No household object or grouping UI
LH-3/PR-c rule a household object holding Adaeze and Chidi together with a shared threshold.
Nothing on any face groups them — they are two independent rows sharing only the identical
free-text `roleAtFirm` string `"Okonkwo household"` (`specimens/people-room-1440.html:392-393`).
This matches direction.md's own Phase table (`client_households` is scheduled **P2**), so the gap
is expected on a P1-scoped specimen — flagged for completeness per the review brief, not as a
surprise defect.

### CR-13 — Blocking — Task 2's second acceptance clause has no face to check it on
Direction.md §6's acceptance criterion for Task 2 requires the authority grant be "visible on the
invoice or CO that needs it." No invoice or change-order state exists among the six built faces
(`state-directory`, `state-person`, `state-company`, `state-roster`, `state-add`, `state-access`).
The fact is visible only as a row sentence on Directory/Roster (§2 above) — never at an actual
approval moment.
**Fix:** confirm with Kody whether invoice/CO screens are out of the People Room's scope entirely
(they may belong to Orders/the money book); if so, soften the acceptance-criterion wording in
direction.md §6 rather than leaving an unmeetable clause on the books.

### CR-14 — Major — "Not on file" reads as neutral grey even though it blocks exactly like "Lapsed"
Per `synthesis/direction.md` §3.8, the Paper word family maps "Not on file" to the **dormant**
(ink-faint, no colour) tone, same as "no data yet" — confirmed in code:
`specimens/people-room-1440.html:576` and `specimens/people-room-390.html:602`
(`'Not on file': 'dormant'`). Yet Northgate's "COI, workers compensation" row is `"state": "Not on
file"` with `"blocks": ["site access", "draw"]` — functionally identical in consequence to the
"Lapsed" GL row two lines above it, which *does* get the alarming terracotta/blocked treatment. A
GC or PM scanning the Paper table (`state-company`) would visually skip past an uninsured,
never-verified sub while their eye catches the lapsed one.
**Fix:** give "Not on file" the same blocked/terracotta treatment as "Lapsed" whenever its `blocks`
array is non-empty, or introduce a fifth explicit alarm state for "never verified but currently
required."

---

## 4. Writing surfaces for a trade or a homeowner — confirmed none

All six states are studio-only surfaces. Direct evidence:
- `state-access`: *"Studio only. This card never reaches a client page."*
  (`specimens/people-room-1440.html:1047`).
- Every mutating act carries a non-automated-send consequence sentence, consistent with the Agent
  OS rule "No automated external sends — drafts land `awaiting_review`" (`AGENTS.md`): "Chase the
  renewal" → *"This drafts a note … and files it for your review. Nothing is sent until you send
  it."*; "Add to the roster" → *"Adding Joe Wozniak puts him on the Okonkwo residence Call Sheet
  and opens a field link… It never opens billing or the agreement."*; "Send a text" →
  *"Nothing sends until you send it."*
- The site-access gate code is explicitly **not** stored or printed — *"The code is held off
  Patina; ask Luis Ochoa"* — matching `PR-r`'s ruling, and resolving UX-5's own Open Question 3.
- `synthesis/direction.md` PR-a / P-1 explicitly parks the one ask that would have put a write
  door in front of a trade (a COI/W-9/licence upload over the field link): *"The writer is a
  trade, not the studio… Compliant version: the studio records the document on the company card."*
  Nothing in either specimen contradicts this — there is no upload field, no trade-facing kind of
  state, and the Add sheet is filled in by a studio member describing someone else, never by that
  person themselves.

No finding under this heading; the constraint holds on the face as built.

---

## Findings table

| ID | Severity | Confidence | File(s) | State | Claim | Fix |
|---|---|---|---|---|---|---|
| CR-1 | Blocking | High | `specimens/people-room-1440.html:949`, `specimens/people-room-390.html:545` | `state-roster` | Vitals line "14 on the job this week" doesn't match the 12 people the studio/client/week bands actually sum to (3+2+7) | Recompute the vitals line from the real band counts |
| CR-2 | Blocking | High | `specimens/people-room-1440.html:826,1195-1199`; `specimens/people-room-390.html:696,827` | `state-directory`→`state-company` | Only Northgate Electric's company card is wired; clicking Marrow & Sons or Twin Cities Drywall & Plaster in the Directory is a dead click (announce-only), leaving C7's resolution and Task 4's "company card" leg unverifiable | Wire the company card to the clicked firm id, or add a second exemplar for Twin Cities Drywall & Plaster |
| CR-3 | Major | High | `specimens/people-room-1440.html:1202-1206`; `specimens/people-room-390.html:666,876` | `state-directory`/`state-roster`→`state-person` | Only Dana Kowalski's person card is wired; every other person row is a dead click | Wire the person card to the clicked row id, or add exemplar cards for Chidi and Frank |
| CR-4 | Major | High | `specimens/people-room-390.html:468` + roster/directory render | `state-roster`, `state-directory` at 390 | Chidi's exact dollar threshold ("Signs money to \$2,500.") prints at mobile width, contradicting PR-t ("the figure only on the desk") | Substitute a yes/no readout at ≤390 width; keep the figure on the 1440 face only |
| CR-5 | Major | High | `specimens/people-room-1440.html:940-978,694-703`; `specimens/people-room-390.html:915-951` | `state-roster` | No "narrow by role" control exists on the Call Sheet, though direction.md §6 claims a 2-click role-narrow path for Task 6 | Add a role/trade chip row to the Call Sheet, or correct the claimed click count |
| CR-6 | Major | High | both specimens' `STATES`/`renderAdd` | none built | The rolodex-picker/travel-list surface direction.md names as satisfying Task 5 (multi-select, carried-forward consent/COI/history) doesn't exist as a state | Add the picker/travel-list state, or scope Task 5 out of this review round explicitly |
| CR-7 | Minor | High | `specimens/people-room-1440.html:352,361,843`; `specimens/people-room-390.html:343,352,541` | `state-company`, `state-person` | "licence" (British spelling) used 3×/file for a Minnesota licence, while both construction memos consistently write "license" | Respell "licence" → "license" |
| CR-8 | Minor | Medium | `specimens/people-room-390.html:311,1084` vs `specimens/people-room-1440.html:1142` | all states at 390 | The global "29 people · 22 firms" count is never hidden outside Directory at 390 (it is at 1440) | Hide `head-count` outside `state-directory` at 390 |
| CR-9 | Minor | Medium | `specimens/people-room-1440.html:980`; `specimens/people-room-390.html:961` | `state-add` | Add sheet's kind list still lacks inspector/lender/engineer despite PR-f ruling to widen them "in code now" | Widen the Add sheet's kind list, or state that inspectors/lenders route through "someone else" |
| CR-10 | Minor | Medium | `specimens/people-room-1440.html:809` (Jobs region) | `state-company` | Per-draw lien-waiver ledger (CS1-11/CS4-9 top-5 ask) is a link-out with no draw facts shown on the People Room face | Confirm scope with Kody; consider a one-line waiver status |
| CR-11 | Minor | Low | `specimens/people-room-1440.html:358-363` | `state-company` | CS4-1 asked for GL/WC/auto COI; no firm in the fixture has an auto-liability document | Add an auto-liability document type if the three-part ask is meant to be fully modeled |
| CR-12 | Minor | High | `specimens/people-room-1440.html:392-393`; `synthesis/direction.md` Phase table | `state-directory`/`state-roster` | No household object/grouping UI exists (expected — `client_households` is Phase P2 per direction.md) | None needed now; confirm P2 still covers it |
| CR-13 | Blocking | High | `synthesis/direction.md` §6 Task 2 row; all 6 states | none built | Task 2's acceptance criterion requires the authority grant "visible on the invoice or CO that needs it" — no invoice/CO face exists anywhere in the specimen | Confirm scope (may belong to Orders/money book) and soften or relocate the acceptance-criterion wording |
| CR-14 | Major | Medium | `specimens/people-room-1440.html:576`; `specimens/people-room-390.html:602`; direction.md §3.8 | `state-company` | "Not on file" prints in the neutral/dormant tone though it blocks site access + the draw exactly like "Lapsed" (terracotta) does | Give "Not on file" the blocked/terracotta treatment when its `blocks` array is non-empty |
