# US-29 · Claude API panel: proposal record (2026-10-13)

Founder deck: https://claude.ai/artifact/U8jSGUmZVFezqbwA9HAzMC

Seat findings are verbatim from the Sidequest board, in `panel/`:
- seat 1 (studio, SQ-867)
- seat 2 (platform, SQ-868)
- seat 3 (skeptic, SQ-869, cross-provider)

This is a proposal. Nothing is built until Kody rules on R1–R7.

## Where things stand (verified)
**Claude already runs in five places, and none of them share plumbing.**
- `aesthete-dna-draft` is the best pattern: official SDK, caching, `json_schema` output, a spend ledger, and it parks when the key is missing.
- `board-deck-import-resolve`
- `project-ffe-document-extract`
- `_shared/field-parse.ts`
- `companion-message`. It is pinned to the deprecated `claude-sonnet-4-20250514`.

**The key is split across two names.** `ANTHROPIC_API_KEY` is used by dna-draft, deck-import and FF&E. `CLAUDE_API_KEY` is used by field-parse and companion, and **it isn't set on Strata** (`docs/field/sms-10dlc-runbook.md:108`). So SMS parsing and companion chat are dark in prod today. Unifying the name would switch them on, which makes it a behaviour change, not a rename.

**Bugs that block moving to the 5.5 models:**
- Forced `tool_choice` returns 400 at `board-deck-import-resolve/index.ts:244` and `project-ffe-document-extract/index.ts:94`.
- `thinking:{type:"disabled"}` returns 400 at `aesthete-dna-draft/lib.ts:361`.
- The dna-draft price table is stale ($3/$15 for Sonnet 5, real price $2/$10). It overstates spend, so the $20/day governor parks early.
- FF&E, field-parse and companion have no timeout.
- The FF&E 25 MiB upload limit base64-inflates past the 32 MB request cap.

**Vision rules every feature must pass:**
- Never "AI".
- The studio won't notice Patina.
- No engagement optimisation and no scores.
- Every outbound message is a draft a person sends.
- Nothing auto-applies (FC-R12).
- Asks don't persist (R38).
- The four-part feature test.

**Open ruling** (VISION-DECISIONS.md:419 · procurement `direction.md:317`): no model-composed drafts until a studio member can review agent output. A studio-side review sheet now exists at `components/document/buying/draft-review.tsx` (C-28).

**Correction to the earlier brief:** the "54 clicks" walk came from a panel persona (`memo-leah.md:1-3`), not from Leah. Leah's only first-hand evidence is `artifacts/pieces-building-room-2026-10-08/TRANSCRIPT.md`.

## The proposal

### Principle: Claude fills a step that already has a confirm
Every feature below feeds a confirm surface that already ships. Examples:
- the `ADD N LINES` paste preview
- the ack-check "vendor says" column
- the spec fields pane
- `draft-review.tsx`

No new chat, no new panel, no thread. That keeps "won't notice", FC-R12 and R38 intact by construction.

### Wave 0 — Foundation (no designer-visible change)
1. **`_shared/claude.ts` + `_shared/claude-models.ts`**, lifted from dna-draft:
   - the `ClaudeCaller` port, `createClaudeCaller`, `computeCostUsd`/`SpendAccumulator`, stop triage, and the order park → budget → claim (`lib.ts:131-146, 488-545, 864-889`; `claude.ts:13-52`)
   - **one key, `ANTHROPIC_API_KEY`**
   - a role registry: `triage`/`judge` = Haiku 5.5 low; `extract`/`answer` = Sonnet 5.5 medium; `draft` = Sonnet 5.5 high; Opus 5.5 only when an eval shows it's needed
   - `output_config.format` instead of forced tools, explicit effort, `fallbacks:"default"` on Sonnet/Opus 5.5
   - surface-appropriate timeouts, and content read by block type
2. **`llm_usage` + `llm_budgets` ledger**, with `record_llm_usage` and `llm_budget_check` RPCs:
   - three caps: global daily, per-feature daily, per-studio monthly
   - `job_runs.cost_usd` stays as a rollup; `aesthete_spend_ledger` moves behind a view
   - PostHog `$ai_generation` events carry no prompt or response content
   - migration number assigned at build time (00766 is reserved by US-28)
3. **Migrate in risk order:** dna-draft → deck-import → FF&E (Files API, streaming, `stop_reason` branch). Field-parse and companion stay **flag-off** until R2/R6 are ruled.
4. **`_evals/<feature>/` golden sets**, in three tiers:
   - mocked suites on every PR
   - path-filtered Batches evals when a prompt or model changes
   - nightly full sets
   - every prompt or model change bumps `prompt_version`

### Wave 1 — Now (no drafts, so the open ruling doesn't block it)
| # | Feature | Surface → existing confirm | Claude does | Est. hrs/wk |
|---|---|---|---|---|
| 1 | **Line out the room** | Build room `pieces/paste-preview.tsx`, `elevation-pane.tsx` | elevation PDF/image or shorthand → placeholder lines (name, qty, room); never a product, maker or price | 1.5–3 |
| 2 | **Read the acknowledgment** | `buying/ack-check.tsx` | vendor ack PDF, photo or email → "vendor says" values + tracking/BOL/ETA; the 00705 deterministic compare stays the authority | 1.5–3 |
| 3 | **Fill the placeholder** | `pieces/library-inline-search.tsx`, `engine/engine-results.tsx` | re-ranks `aesthete-ask` candidates with one plain reason each; the ask isn't saved; "via the Engine" mark (the DECISIONS.md:1607 blessed follow-up) | 1–2 |
| 4 | **Spec from the cut sheet** | `pieces/spec-fields-pane.tsx` | cut sheet or URL → spec fields with a cited source per field, after the deterministic `_shared/product-page/extract.ts`; prices never guessed | 1.5–3 |

All four extend the FF&E extract pattern (pattern A: sync extraction, staged, then confirmed). Together that's about **5–11 studio hours a week**. These are working estimates, not measurements.

### Wave 2 — Next (needs R4, homeowner-data disclosure)
5. **The call, filed.** `discovery/call-plan.tsx`. Pasted notes → block fills, accepted block by block.
6. **The inquiry, read.** `overlays/capture-lead-sheet.tsx`. Pasted message → sheet fields.

### Wave 3 — Later (needs R1, the drafts ruling)
7. **Services & exclusions, first pass.** Drafting room. Never Terms.
8. **The Friday letter.** Weekly Pulse body. The person edits and sends.
9. **The chase letter.** `procurement_drafts` body through `draft-review.tsx`.
10. **Paper on file.** **COI only.** The skeptic's rule "never send tax data" overrides the studio seat's W-9 idea.

Queued drafts use pattern B: a new `agent-llm-worker` → `awaiting_review`. Constraint: the `agent_tasks.assignee` CHECK only allows `('kody','leah')` (00297:46), so it must be widened first.

### Platform patterns, held for later
- Grounded job Q&A with citations, built with the caller's JWT so RLS bounds what the model sees.
- Nightly Batches (submit and collect crons).
- **Managed Agents: premature.** Vendor research runs as pattern B with `web_search`/`web_fetch` and `allowed_domains`.

### Refused outright
- auto-sending anything
- a chat sidebar or client-facing chatbot
- filing on high confidence
- a morning digest or "studio week" brief (V11: a total with no rows is a dashboard)
- productivity, accuracy or taste scores
- generated imagery of the client's home
- sending model prices or measurements straight into a PO or invoice
- persistent assistant memory from private asks

### Trust contract (applies to every feature)
1. A person confirms every commit and send, and no confidence threshold bypasses that.
2. Provenance is marked on the field where model output lands.
3. Asks are ephemeral; only the act and usage metadata persist.
4. Commerce facts (price, size, lead time) are cited to a source or left unset.
5. Uncertainty shows as a quiet "check this" cue, never a number.
6. Every applied change previews its diff and can be undone.
7. Minimum necessary data goes out; never secrets, payment, bank or tax data; untrusted text goes in the user turn as a delimited document.
8. Features fail closed and quiet, run only when the designer invokes them, and keep a deterministic fallback.

## Founder rulings needed (recommended answers in the deck)
- **R1 Drafts.** Rule narrowly: "A draft she asked for, inside the sheet she's in, unsaved until she saves or sends, is not an agent draft." Buying drafts go through `draft-review.tsx` with a named reviewer.
- **R2 The three contradictions, as one family.** One invariant: the model never applies at any confidence.
  - SMS ≥0.8 auto-apply (`sms-inbound/pipeline.ts:1825`, dormant in prod) → confirm-to-apply.
  - Capture enrichment writes (00515:250,287) → reviewable suggestions.
  - Companion history → retire it from the Engine path.
- **R3 Naming.** "Designer-Taught Intelligence" in UI; "via the Engine" only where R38 already places it; never "AI".
- **R4 Homeowner data.** Counsel reviews the privacy page (`(legal)/privacy/page.tsx:104-107`, which doesn't cover SMS parse, deck adjudication or batch) and whether studio client agreements must mention it. Confirm DPA retention and ZDR eligibility for the Files API and Batches.
- **R5 Teaching / Pledge.** Corrections stay private by default. Contributing to shared intelligence is an explicit opt-in act, and the royalty terms come before any use (legal-gated).
- **R6 Activating dark paths.** Field-parse and companion stay off after the key unification until R2 lands.
- **R7 Cost policy.** About $5/studio/month typical, about $32 heavy, $100 at extreme Sonnet volume (skeptic's arithmetic) against the working $49/$149 tiers (V2 open). Bundle it with published caps; no hidden usage billing.

