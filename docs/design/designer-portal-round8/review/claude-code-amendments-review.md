# Independent review: Room Proof 08 preparation branch

**Verdict:** the branch is ready to hand to the team starting WP-00. None of the remaining findings blocks WP-00. Two planning gaps should be closed before the work that depends on them: finding 1 before WP-10C/WP-10 are dispatched, and finding 2 before the first release slice goes to main. The rest are documentation nits.

I only read files. I ran no checks, builds or scripts. My spot-checks were limited to confirming that a few cited paths exist and that the client-portal `edition-usability` project and the `ios-gate.sh` tiers match what brief 07 says.

## The initial concerns are now addressed
I found no new evidence that reopens any of the 21 dispositions:
- **Client-side acceptance (1):** it now has an owner. WP-10C and brief 07 cover it, A20 jointly owns it, and it is a WP-10 dependency.
- **Unknown approval kinds (2):** C4 lines 36–38 keep the strict-parser claim to shared web, separate native's string decoding, and default to a separate record. X08 adds the mixed-record test.
- **External fulfilment (3, 4):** C5 has one owner, and A17 covers the totals and closeout readers.
- **Design-build gates (5):** CODEBASE-MAP line 34 is accurate: the composer needs two gates and Account licensing still needs three.
- **Flags and DNT (8):** ROLLOUT line 17 calls DNT an SDK setting and gives WP-00 the test, not an assumed consent gate.
- **Project closure (10):** C6 forbids service acceptance from writing `projects.status` or closure fields.
- **Worktrees (20):** the checkout text no longer depends on the Herdr wording.
- **Instruction conflicts (7):** the app CLAUDE.md pointer and the appended Document entry acknowledge R203's Next plate and deferred dark mode.

## Remaining findings

### 1. WP-10C and WP-10 have no workable start order
- **Type:** planning omission
- **Severity / confidence:** Medium / High
- **Location:** DELIVERY-PLAN WP-10C and WP-10 rows (lines 19–20) and the `M --> K` edge (line 42); brief 05 lines 16 and 20; brief 07 lines 7 and 25.
- **Evidence:** WP-10C must deliver authenticated portal/iOS responses against "the same authority/version contract", and brief 07 says consumer teams must not introduce their own acceptance status. But the record, RPC and projection themselves sit inside WP-10's domain slice (brief 05 line 16, "Add service-acceptance evidence…"). WP-10 in turn depends on WP-10C. Line 62's "integration readiness, not serial" note softens this but doesn't say which piece lands first. A WP-10C team could start with nothing to consume, or be pushed to build the RPC itself and create a second owner.
- **Fix:** split WP-10 into two parts:
  - **WP-10a:** the closeout-domain record/RPC/projection and policy. Depends on C4/C6 and P06/P07.
  - **WP-10b:** the designer completion and care work. It passes only after WP-10C's sign-off.

  Then make WP-10C depend on WP-10a, and update the diagram and the brief 05 ownership line to match.

### 2. Merging to main has no server-side gate for new mutations or migrations
- **Type:** planning omission, which WP-00/P10/P12 can own but must name
- **Severity / confidence:** Medium / Medium
- **Location:** AGENT-HANDOFF line 68; ROLLOUT §2–§3 and §5; DECISIONS P10 and P12; C4 line 40 ("before enabling the new acceptance mutations").
- **Evidence:** release slices merge to main "behind the agreed renderer flag". But that flag is a client-only PostHog read (ROLLOUT line 17), so it cannot stop a newly granted RPC from being called. Once a slice is on main, a later deploy for unrelated work could apply its migrations and expose its RPCs. I did not read `patina-deploy` to confirm whether deploys apply all pending migrations, hence medium confidence. The plan never says how "enabling" a consequential mutation is controlled on the server.
- **Fix:** add a P12/P10 rule. New consequential RPCs (acceptance, external fulfilment, fabrication authority) land on main either inert or server-gated, with grant timing and a server-side kill or enable control. Every migration merged to main must be safe to apply alone. Record the coordination with whoever deploys main.

### 3. The preparation evidence can't be reproduced or fully audited
- **Type:** documentation defect
- **Severity / confidence:** Low / High
- **Location:** PREPARATION-RECORD line 30 ("evidence files/commands below") and lines 48–52; VERIFICATION line 81; `evidence/preparation-checks.json`.
- **Evidence:**
  - The JSON gives only counts (for example "100 source anchors"), with no list of checked paths and no committed script. The record describes the method in prose rather than giving commands.
  - VERIFICATION line 81 says outcomes are in PREPARATION-RECORD, which in turn points to the JSON.
  - VERIFICATION claims a whitespace check, but the JSON has no whitespace result. It appears only as a commit-gate statement.
  - Whether brief 07's anchors were among the 100 can't be told. The four I opened do exist.
- **Fix:** add the list of checked paths, or the check script, to `evidence/`. Add the `diff --check` result to the JSON. Point VERIFICATION line 81 at the JSON.

### 4. WP-06's dependency on WP-03 is stricter in the table than in the brief
- **Type:** inconsistency
- **Severity / confidence:** Low / Medium
- **Location:** DELIVERY-PLAN WP-06 row (line 15) and the `D --> G` edge, against brief 04 slice 1 and P05.
- **Evidence:** the table makes all of WP-06 wait for WP-03. Brief 04, P05 and DELIVERY-PLAN line 23 limit that to external-buying mutations. Studio-funded decisions, orders and receipt work would be held back for no reason, or the conflict would be settled informally.
- **Fix:** annotate the row: "WP-03/C2/C5 gate external-buying mutations only."

### 5. The CLAUDE.md pointer doesn't cover navigation and drawer decisions
- **Type:** possible instruction gap
- **Severity / confidence:** Low / Low–Medium
- **Location:** `apps/designer-portal/CLAUDE.md` line 3, against D1/D8 (Document DECISIONS lines 12 and 19) and P03.
- **Evidence:** the pointer routes only "fill/shadow/token/breakpoint" changes through P01/P02/P03. P03 changes navigation ("Global nav belongs on the studio; job keeps a return and contents") and cites D1/D8. Locked D8 says the Studio Drawer stays on every screen. An agent that loads CLAUDE.md could treat D8 as untouchable and stop. I did not check whether a later ruling already amended D8, or exactly what Round 8 shows inside a job, hence the low confidence.
- **Fix:** add "navigation/drawer presence (D1/D8)" to the pointer's list of items settled under P03.

### 6. The appended Document entry has no ID
- **Type:** convention nit
- **Severity / confidence:** Informational / Low
- **Location:** Document DECISIONS line 1709 onward.
- **Evidence:** the log usually gives each entry an R/I ID and an "Entries add … last id" footer. The new entry has neither, which makes it hard to cite. There is precedent for unnumbered entries (US-38, line 11681), so this is optional.
- **Fix:** give it a new ID, for example an R-number after R203, when P01/P02 are adopted.

## Future implementation obligations (not preparation defects)
These are deliberately owned in WP-00 or the contract slices, and the handoff specifies them well enough:
- DNT, blocked-SDK and consent testing, plus the fallback layout for cohorts whose flag never resolves (P10).
- The flag inventory for each environment.
- The C5 purchase-model inventory and the FF&E representation decision.
- The P06/P07 rulings.
- The P11 scale strategy.
- Migration-number reconciliation.
- Separate bundle measurement for manual AI-gate runs.
- Old-reader tests for iOS and web.
- The runtime baseline.
