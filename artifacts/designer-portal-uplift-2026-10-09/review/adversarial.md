# US-24 adversarial review

Reviewed against the frozen US-24 BRIEF, `walk/WALK.md`, `briefing/current-state.md`, `synthesis/direction.md`, `specimens/SPEC.md` and all six proposed specimen files, plus `deck/DECK.md` and `deck/src/index.html`. The specimens are static illustrations, not usability evidence; estimates remain estimates. Persona-seat statements are consistently described as simulated in the synthesis and deck.

## Findings

### ADV-01 — S5 exposes a maker-facing act that conflicts with the hand-off instruction

- **Severity:** S2
- **Confidence:** High
- **Evidence:** The illustrative Marsh Street hand-off note says, “ask me before anything goes to them in writing” (`specimens/SPEC.md:164-166`); the A and C mockups show that note alongside an immediately available “Chase the maker” action (`specimens/proposed-a-1440.html:847-851`; `proposed-c-1440.html:815-819`). B likewise exposes “Chase the maker” on Jordan's Day Sheet without showing or requiring the note to be read (`proposed-b-1440.html:457`). Yet B says the hire's client- or maker-facing action on a job they do not lead becomes a draft for Leah, and the fixture's own note sets a stricter boundary even though Jordan leads this job (`synthesis/direction.md:312`; `WALK.md:63-67` has the walk's distinct hand-off note). The proposed directions do not explain how the explicit job instruction is respected before the chase is sent.
- **Impact:** Jordan can take an outward-facing action contrary to Leah's recorded instruction. The interface presents the act as ready before the hire has read the hand-off context; B's “Read her note” and chase are parallel lines rather than a dependency.
- **Suggested fix:** Make the chase open a draft and carry the job's “ask Leah first” requirement into the review/send path, or gate the action until the note is read and Leah approves. Keep the instruction and action consistent across A, B and C. Also label the mockup's changed hand-off wording clearly as a new illustrative instruction rather than implying it is the walk's same note.

### ADV-02 — Q10's finance-visibility answer is not implemented by the proposed scope

- **Severity:** S2
- **Confidence:** High
- **Evidence:** Q10 recommends that a hire see receivables only on jobs they lead, with Leah able to grant more (`synthesis/direction.md:311`); the specimens promise no studio money totals on hire views (`specimens/SPEC.md:109-117`). But the same synthesis leaves Orders and Accounts ledgers where they are (`direction.md:140`), and the current Accounts sheet still calculates and displays studio-wide revenue and A/R for every viewer: `accounts-book.tsx:62-67,85-103`. Only margin is conditional on `useCanSeeMargin`; the revenue and A/R entries are unconditional. The day-sheet proposal does not describe a new permission or filtering rule for those existing paths.
- **Impact:** A hire can still reach studio-wide financial totals through the existing Accounts ledger, contrary to the proposed Q10 answer and the “no studio money totals” assurance. Hiding totals on the Desk mockup does not close the existing route.
- **Suggested fix:** Make Q10's scope cover the Accounts/Orders entry points too. Specify and cite a permission/filtering mechanism for studio-wide revenue and A/R (or revise the answer to state exactly what remains visible); do not imply “Leah can grant more” until that authority is established.

### ADV-03 — Direction C misses the BRIEF's S1 time target

- **Severity:** S2
- **Confidence:** High
- **Evidence:** The S1 success test is knowing the three to five cross-job actions in under 10 seconds (`BRIEF §4-5`). Direction C estimates 10–15 seconds and says its uncapped lane is “found but unbounded” (`synthesis/direction.md:204`; `proposed-c-1440.html`, frame `frame-c1`; `deck/src/index.html:1035`). The estimate therefore exceeds the target even on the proposed fixture; the uncapped lane cannot guarantee the specified three-to-five bound.
- **Impact:** C does not pass S1 as defined, even though its estimate table calls the moment “found.” This makes it a structural alternative with an explicit S1 failure, not a direction meeting the stated success test.
- **Suggested fix:** Mark S1 as partial/fails the under-10-second target in the direction score and comparison, and keep the “unbounded” limitation beside the score. Do not describe C as satisfying S1 unless a bounded reading and sub-10-second evidence are provided.

## Count by severity

- S1: 0
- S2: 3
- S3: 0
- S4: 0
- **Total: 3**
