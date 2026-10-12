# US-26 adversarial review (SQ-797)

<!-- GPT-6 Luna, readonly, other provider. Saved by the orchestrator from ticket comments c_mv5j6poj_bf2a4b, c_mv5j6tu4_774d36, c_mv5j7537_1e0043, c_mv5j8094_abed18. -->

## R1

Finding — **high severity, confidence high**: The recommended A direction contradicts its “each job once” model for the studio-scope opening frame. `specimens/SPEC.md:62–75` puts Marsh Street’s PO in one of A’s four Today cards and also lists the Marsh Street hand-off in the Jordan ledger group. That splits the same job across the ranked card and lower ledger, despite `synthesis/direction.md:39, 86, 144–146` promising one job unit and excluding sheet jobs from the ledger. It also separates the hand-off context from the PO it explains, which direction A’s M5 claims to avoid (`direction.md:113–121, 161`). The frame/fixture needs a single, explicit rule for attaching the hand-off to the Marsh Street Today card in this studio-scope case, or otherwise avoiding the duplicate.

## R2

Finding — **high severity, confidence high**: M8 is not fully answered: the brief explicitly asks at close of day “what moved, what’s waiting on others, what comes back tomorrow?” (`BRIEF.md:45`). The proposal renders waiting and coming-back facts, but expressly excludes any moved-today surface (`specimens/SPEC.md:144–164`; `synthesis/direction.md:164, 444–445`), and its M8 row describes only clearing needs and reading the two other groups (`direction.md:153–164`). “Since today” on waiting entries does not identify the full set of work moved, including actions that are not waiting on another party. This leaves a named success scenario unresolved; if V18’s ban on a moved/cleared list is the intended constraint, the deck should make the conflict and founder decision explicit rather than claim the close is complete (`direction.md:55, 459`).

## R3

Finding — **medium severity, confidence high**: The 390 fold claims understate the scroll needed to read Today. A says its five lines occupy “about one screen” while parenthetically measuring 1,095 px (`synthesis/direction.md:147–151`), which exceeds the 844 px viewport before accounting for the 92 px header and section framing; its 4/5 glanceability rationale mentions only “what can wait” being below fold (`:172`). B similarly estimates five Now cards at about 150 px each as “about 1 screen” (`:258`), or 750 px for cards alone before header/section framing. The mockups/metrics should distinguish the visible first fold from the full height and account for the Today content itself being scroll-bound on mobile.

## Reviewer summary

Readonly adversarial review complete. Findings are recorded in ticket comments c_mv5j6poj_bf2a4b, c_mv5j6tu4_774d36, and c_mv5j7537_1e0043:
- High, confidence high — A's studio-scope frame duplicates Marsh Street across Today and ledger, splitting the PO and hand-off context.
- High, confidence high — M8 omits the brief's “what moved” objective; the proposal deliberately excludes a moved-today surface without framing this as an unresolved founder conflict.
- Medium, confidence high — mobile first-fold/one-screen claims for A and B understate scroll: A's own 1,095px Today height exceeds the 844px viewport; B's 750px card stack excludes header and section framing.

Focused verification: `node artifacts/desk-redesign-2026-10-12/specimens/check.mjs` passed all six files (7 frames each at 1440; 6 at 390). The gate checks frame anchors and static constraints, not rendered behavior or the claimed mark counts. No AI copy was found in specimen content; deck source/docs naturally mention the prohibition itself. Did not build deck because build writes generated output in this read-only review. No quality gate is configured for this project; Quartermaster setup can add one.
