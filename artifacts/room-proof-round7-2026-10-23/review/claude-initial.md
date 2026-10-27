# Room Proof 07: design review of the presentation and local mockup

I read only the five files named, plus `round7.css`. I didn't open `presentation.css`, the linked earlier rounds, `assets/`, `COLLABORATION.md`, `VERIFICATION.md` or `DESIGN-PLAN.md`, so I haven't checked whether those links work. I treated the prewritten scenes as fixtures and kept optional future ideas separate from real findings.

**Overall:** the idea that decisions are separate records holds up. The main weakness is the job configurator: it lets you build contradictory arrangements and then reports them as complete. The acceptance model also mixes up the designer's service with the construction contract.

## What works
- **Separate decisions.** Design sign-off, the go-ahead to fabricate, package acceptance and final service acceptance are kept apart throughout (`.acceptance-timeline`, `.preview-acceptance`, the `ready` scene's gate list). Nothing collapses into one "Approved" stamp.
- **Issued sets don't get rewritten.** The `change` scene keeps IS-03 fixed and treats CH-01 as a separate proposal with its own decision and instruction path. The `.scope-change` copy says the same.
- **Missing setup holds only the affected commitments.** `gaps()` → `#setup-needs` says "Design can continue. The affected commitment remains held." The `complete` acceptance example also respects open gaps (`renderAcceptance`, the `mode==='complete'&&missing.length` check).
- **Honest boundaries.** The note at the end of `#acceptance`, the `#evidence` intro and `SOURCE-MAP.md` avoid claiming that client-gated closeout exists today. The SOURCE-MAP row about the submittals approval control is a good example of careful wording.
- **Safe local mechanics.** Nothing is sent. `innerHTML` is always fed through `esc()`. Smooth scrolling respects reduced motion, clearing notes needs a second click, and scrollable tables are focusable regions.

## Material findings

### High

**1. The configurator allows contradictions and still shows "Responsibilities named"** (confidence: high)
- **Where:** `study.js` `gaps()` and the `#setup-needs` ready state in `renderConfig`.
- **Problem:** `gaps()` only flags unassigned fields and two studio-purchasing cases. It accepts, without comment:
  - cabinetry purchaser = Client, contractor = Leah/studio, payer = "GC pays maker";
  - contractor = GC with instructor = Client (the client directly instructs the GC's subcontractor);
  - payer = Studio, or contractor = Studio, while purchasing administration is excluded.
- **Result:** the panel turns green with "Responsibilities named for this example", and the `ready` scene marks Commercial scope "Recorded".
- **Fix:**
  - Add consistency rules: purchaser should equal the contractor unless an explicit agency note is recorded. The instructor should be the contracting party or someone it delegates to, and a delegation record is needed. If the studio pays or contracts, purchasing administration must be included and the arrangement flagged as the studio acting as contracting party.
  - Show these as "Conflicts" separately from "Unassigned".
  - Consider merging "Cabinetry purchaser" and "Who contracts the maker". As two fields they invite contradictions.

**2. The acceptance gate treats acceptance of the cabinetry contract as part of the designer's service** (confidence: medium)
- **Where:** `renderAcceptance` (`subject`, `scope`, `allScope`) and the `.acceptance-timeline` "Package acceptance" entry.
- **Problem:** in the default `full` preset, Ana/GC contracts Northline and the client funds it. Even so, "CP-01 delivered cabinetry" acceptance becomes a step in *studio* completion, and `included()` lists "Custom cabinetry" as a designer service.
- **Why it matters:** the client accepting the built work under the GC's contract is not the same as accepting the studio's design and coordination. Mixing them puts the studio in the chain of authority for work it didn't contract.
- **Fix:**
  - Name the contracting party on each acceptance record, e.g. "Cabinetry acceptance under Ana/GC contract — linked, informs studio".
  - Make the designer-service acceptance cover the studio's deliverables: design, review, coordination, and checking that the built work matches design intent.
  - Rename the service item to "Custom cabinetry design & package" unless the studio contracts the maker.

### Medium

**3. Whether the cabinetry counts as "delivered" depends on the wrong field** (confidence: high)
- **Where:** `renderAcceptance`, `physical=applied.installation`.
- **Problem:** `installation` means the studio's *Installation / styling management* service. In the `cabinet` preset Northline still installs, but acceptance reads "CP-01 design and included coordination". Meanwhile the `site` scene and `.site-sequence` show the cabinetry installed. Unchecking installation in `full` causes the same mismatch.
- **Fix:** work out "physical work exists" from `cabinet` plus the installer, not from the studio's service checkbox.

**4. Fixtures ignore excluded services** (confidence: high)
- **Where:** `renderTeam` (`gc` and `electrician` views), the `sceneData().site` act, and `.site-sequence`.
- **Problem:** with Building-team coordination unchecked, or under the `design` preset, Ana's and Jo's threads still show the studio coordinating site questions and sending trade instructions.
- **Fix:** if coordination is excluded, either label these views "Outside this arrangement — reference" (the way `#cabinet-excluded` does) or reword them so the GC coordinates and the studio only answers design questions.

**5. Site trades are instructed around their contracting party** (confidence: medium)
- **Where:** `renderTeam` → `electrician.thread`: "Studio / site coordinator → Jo" and "Studio + maker + coordinator … return a clear instruction to the trade".
- **Problem:** Jo is normally the GC's subcontractor, and the studio is shown instructing her directly.
- **Fix:** the studio may ask questions and receive evidence, but instructions to Jo should come from her contracting party (Ana/GC, or whoever is configured). Add a "Jo contracted by" fact to `team-access`.

**6. The "separate cabinetry reference" uses the job's hidden, disabled field values** (confidence: high)
- **Where:** the `show-reference` and `show-substitution` handlers together with `sceneData`, `rowsFor` and `renderTeam`.
- **Problem:** under `furnishings`, contractor and instructor are `unknown`. The scenes then render "Unassigned owns the proposed maker appointment" and Commercial scope shows "Held". But `gaps()` returns nothing because `cabinet` is false, so `#inspect-act` stays enabled. Under `design`, the reference says the client owns the maker appointment. The reference claims to be separate from the job but isn't.
- **Fix:** render reference mode from a fixed arrangement (for example `presets.cabinet`) and label it as such.

**7. Fixture evidence gets re-credited to whoever is selected** (confidence: high)
- **Where:** `rowsFor` (the SM row) and the `ready` checks ("SM-02/A / "+person[measurer]).
- **Problem:** changing the measurer dropdown changes who appears to have *already* verified the site. Choosing Unassigned still shows an SM-02/A record, now attributed to "Unassigned".
- **Fix:** keep fixture authorship fixed. If the configured owner differs, show "Assigned: X; fixture evidence by Sam — reassignment requires new verification". If unassigned, show "No verification record".

**8. Package-level settings live in the job form, and only one field inherits** (confidence: medium)
- **Where:** `#package-config` and `cabinetBuyer()`. Compare `SOURCE-MAP.md`, rule 2.
- **Problem:** only the purchaser has a job default and override. Contractor, instructor, payer, measurer, receiver and installer have no job-level default, which contradicts "Package exceptions inherit from the job". The design also assumes there is only ever one package (CP-01). A real job will have a kitchen, vanities and built-ins.
- **Fix:** set job-level defaults in section 01 and put a responsibility card for each package at the head of section 02. Each field shows "inherits / exception".

**9. Hardware and appliances have no defined place in the package** (confidence: medium)
- **Where:** `rowsFor` HW-01 and AP-01 (Q-12), and the `hardware` thread "Foundry → purchaser".
- **Problem:** nothing says who buys HW-01 (maker-supplied, studio-purchased, or supplied by the owner) or whether it falls under CP-01's purchaser. The appliance specs drive the Q-12 clearance question, but there's no appliance supplier view.
- **Fix:**
  - Add a "Supplied by" column to the manifest so each line shows who supplies it.
  - Either add an appliance-supplier view in `.team-selector` or name AP-01's owner.

**10. The client acceptance rule has no "declined" or "no response" path** (confidence: high)
- **Where:** the `#acceptance-example` options.
- **Problem:** if completion needs client sign-off, the paper has to show what happens when the client returns items or doesn't answer. Otherwise the founder's rule leaves the job stuck with nothing on record.
- **Fix:** add fixtures for "Returned with items (owner, due date)" and "Requested · no response (dated reminders, studio still held)". Leave "deemed acceptance" as an open contract question. Don't make it a default.

**11. The client decision-makers are hard-coded** (confidence: high)
- **Where:** `.acceptance-required` and `renderAcceptance` (Nora and Eli).
- **Problem:** configurable job types need a configurable decision rule: one client, both, an entity signatory, or an owner's rep.
- **Fix:** add a "Client decision rule" field in section 01. It must not include any option that removes acceptance.

**12. Switchers work against the "continuous paper" priority** (confidence: medium)
- **Where:**
  - `.scene-switch` (5 moments) and `.team-selector` (4 views);
  - the `#acceptance-example` select (5 states);
  - folds: `#package-fold`, "Audience and commercial boundaries", "Review method";
  - jumps: `show-substitution` scrolls back from section 03 to 02, and `apply-config` scrolls away from the form.
- **Problem:** these are tabs inside a section, and each hides most of its content.
- **Fix:**
  - Lay the five cabinetry moments out as dated entries down the paper, each with its own manifest.
  - Show the four collaborator exchanges inline under CP-01.
  - Keep a single acceptance record whose dated entries build up over time.
  - Leave the boundaries visible rather than folded.

**13. Text is too small** (confidence: high)
- **Where:** `round7.css` sets 9–10px for `.manifest caption`, `.preview-mast`, `.plate-foot`, `.field-pair label`, `.issue-stamp small` and `.scope-reading li span`. Form hints are 11px.
- **Fix:** at least 12px for labels and body text, at least 11px for metadata.

**14. Focus isn't moved after jumps** (confidence: high)
- **Where:** `applyConfiguration` and `show-substitution` use `scrollIntoView` only.
- **Problem:** keyboard and screen-reader users stay on the button while the view moves. `show-substitution` also announces nothing.
- **Fix:** give `#job-arrangement` and `#scene-title` `tabindex="-1"`, call `.focus()` after scrolling, and set a status message.

**15. Product-sounding names in fictional copy** (confidence: medium)
- **Where:** `renderTeam` → `electrician.summary`: "A narrow Field work copy".
- **Problem:** the capitalised name reads like an existing product surface. SOURCE-MAP only supports a printable trade work order, with no per-question return.
- **Fix:** "A proposed narrow work copy".

### Low

- **Cover stamps** (`.package-stamps`): "Exact drawings" next to "Not a fabrication document". Change it to "Exact editions". *(high confidence)*
- **Eligible state shows in the "held" colour:** `.completion-status.eligible` is never toggled. Add `classList.toggle('eligible', mode==='complete'&&!missing.length)`. *(high)*
- **Over-eager announcements:** `#acceptance-book` has `aria-live` and also contains `#completion-result` (role=status), so every change re-reads the whole book. Remove `aria-live` from the book and announce a one-line summary instead. *(medium)*
- **Truncated dropdowns on phones:** at ≤680px `.field-pair` goes back to two columns, and long options are cut off with an ellipsis. Use one column. *(high)*
- **Reload behaves differently from the session:** the init code (`applied=configuration()` after restoring) applies a draft on reload that was never previewed in the session. The download note calls these edits "unsaved", but they are saved. Store `applied` separately and say "not yet previewed". *(high)*
- **Awkward text when a role is unassigned or a mapping is loose:**
  - "Unassigned is the proposed fabrication instruction owner" (`renderJob`), "Unassigned verifies…" (`review.owner`) and "Unassigned reviews…" (`ready.next`).
  - In `person`, `studio` maps to "Leah / studio" for both the measurer and the payer.
  - Fix: "No one is assigned to …" and role-specific labels. *(high)*
- **Summary text that contradicts the settings:**
  - `outcome()` says "included coordination" when coordination is excluded.
  - `furnishings` with installation unchecked shows "design package … client implements".
  - When the buyer is studio and purchasing is excluded, the chapter list says "Client or contractor purchases". *(high)*
- **Irrelevant options:** the receiver and installer dropdowns still offer Northline when there's no cabinetry. *(medium)*
- **Unclear wording:**
  - "H-14 accepted in the later issue" (`rowsFor`): say who chose it and in which record.
  - "Held for fabrication" (`change.purpose`) reads like "on hold". Use "Issued for fabrication · held by Northline". *(medium)*
- **Self-reference:** the `site` manifest lists IS-04 inside IS-04. *(medium)*
- **Overstated status:** the `#acceptance` intro calls this "a firm product requirement". Founder direction isn't yet a spec, so "founder requirement for this proposal" is more accurate. The `#evidence` "Review method" text also describes this Claude Code critique as already done. *(medium)*
- **Construction sequence:** `.site-sequence` skips stone templating after the cabinets go in and the adjustments afterward, even though `site.detail` mentions follow-on stone work. *(medium)*

## Optional future concepts (not defects)
- Retention or holdback tied to an acceptance that has exceptions.
- A professional-liability prompt when the studio becomes the measurer, or uses the designer-details route.
- A view of the GC's markup when the GC contracts the maker.
- A printed version that lays out every scene. Today the print CSS prints only the scene currently selected.
