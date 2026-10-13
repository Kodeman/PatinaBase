# SQ-868 — Seat 2 (platform): shared Claude foundation + API pattern per workload

## Recon corrections (verified)
- **Key split:** `ANTHROPIC_API_KEY` = dna-draft (`index.ts:46`), deck-import (`index.ts:88`), FF&E (`index.ts:84`). `CLAUDE_API_KEY` = `_shared/field-parse.ts:489`, `companion-message/index.ts:233`. `docs/field/sms-10dlc-runbook.md:108`: `CLAUDE_API_KEY` is **not provisioned on Strata**, so field-parse/companion model paths are dark in prod. **Unifying the name turns them on** — a behaviour change, not a rename.
- **Wrong price:** Sonnet 5 is $2/$10; the stale one is `aesthete-dna-draft/lib.ts:44-47` ($3/$15). It overstates escalation spend 50%, so the $20/day governor parks early.
- **Extra 5.5 break:** `lib.ts:358-362` sends `thinking:{type:"disabled"}` → 400 on Sonnet 5.5.
- `_shared/hours-judgment.ts` calls TypeSafe, not Claude — not a call site, but holds two rules to reuse: "select, never generate" (`:9-12`), "state carries no identity" (`:14-16`).
- **No timeout:** FF&E (`index.ts:86`), field-parse (`:501`), companion (`:245`). Only dna-draft (20 s + 1 retry) and deck-import (`AbortSignal.timeout(20_000)`) are bounded.

## 1. Shared module: `_shared/claude.ts` + `_shared/claude-models.ts`
**Lift from dna-draft:** the `ClaudeCaller`/`ModelResponse`/`ModelUsage` port (`lib.ts:131-146`, keeps logic SDK-free and fixture-testable); `createClaudeCaller` (`claude.ts:30-52`) incl. the `npm:` import rationale keeping the SDK out of the deno-test graph (`claude.ts:13-20`); `computeCostUsd` + `SpendAccumulator` (`lib.ts:513-545`) with cache 1.25×/0.1× (`lib.ts:48-49`); stop triage (`lib.ts:488-495`) generalised to `classifyStop()` → `ok|refusal|truncated|tool_use`; pass order park-on-no-key → budget → claim (`lib.ts:864-889`); the `PROMPT_VERSION` idiom (`lib.ts:22`).

**The module owns:**
- **One key, `ANTHROPIC_API_KEY`** (SDK default; 3 of 5 sites). No `CLAUDE_API_KEY` fallback. Ops step before deploy: list Strata secret names. Enabling field-parse/companion is a per-feature decision (§3).
- **`getClaude(feature)` → `Caller | null`**; null = park/degrade, never crash.
- **Role registry** `{model, effort, maxTokens, thinking, timeoutMs, maxRetries, pricing}`, env override `CLAUDE_MODEL_<ROLE>` (generalises `companion-message/model.ts:14`): `triage` Haiku 5.5 low (SMS intent); `judge` Haiku 5.5 low (deck adjudication, eval grading); `extract` Sonnet 5.5 medium (PDF/photo); `draft` Sonnet 5.5 high (studio prose); `answer` Sonnet 5.5 medium (grounded Q&A). Opus 5.5 only for an evaluated need.
- **One price table**, incl. Haiku 5.5's >100K card ($0.50/$2.50) and 0.5× for Batches.
- **Explicit effort always** (Opus 5.5 / Haiku 5.5 default `medium`, Sonnet 5.5 `high`). Never `thinking: disabled` (Sonnet 5.5: `between_tools` or low effort), never forced `tool_choice`, never prefill; read `content` by block `type`, never position.
- **Refusals:** Opus/Sonnet 5.5 add `fallbacks:"default"` + beta `server-side-fallback-2026-07-01` (Claude API only; Batches rejects it). Haiku 5.5 has no server fallback → refusal = `no_result` (dna-draft `lib.ts:840-846`).
- **Timeouts/retries by surface:** cron/queue 20 s + `maxRetries:1` inside the 60 s pg_net window (`claude.ts:24-28`), queue backoff = durable retry; sync user calls stream with `finalMessage()` and a longer timeout. SDK typed errors.
- **Usage capture every call:** one `record_llm_usage` row + one PostHog event, best-effort, never throws. **Budget gate** `llm_budget_check` before each call.
- **Bump SDK pin** from `0.109.1` to one that types `fallbacks`/strict tools (unverified whether 0.109.1 lacks them).

## 2. Unified usage ledger (next free number; US-28 reserved 00766)
```sql
CREATE TABLE public.llm_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  feature text NOT NULL, role text NOT NULL, model text NOT NULL, prompt_version text,
  surface text NOT NULL CHECK (surface IN ('sync','cron','agent_task','batch')),
  studio_id uuid, project_id uuid, actor_id uuid,   -- nullable: catalog work has no studio
  job_run_id bigint REFERENCES public.job_runs(id),
  agent_task_id uuid REFERENCES public.agent_tasks(id),
  request_id text,
  input_tokens int NOT NULL DEFAULT 0, output_tokens int NOT NULL DEFAULT 0,
  cache_write_tokens int NOT NULL DEFAULT 0, cache_read_tokens int NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL,  -- exact; job_runs numeric(8,2) rounds $0.004 to 0
  outcome text NOT NULL,            -- ok|refusal|truncated|schema_failure|error|parked
  fallback_model text, latency_ms int);
-- idx (studio_id, occurred_at), (feature, occurred_at); RLS admin SELECT (00300 idiom);
-- writes only via SECURITY DEFINER record_llm_usage(...) → service_role.
CREATE TABLE public.llm_budgets (scope text CHECK (scope IN ('global','feature','studio')),
  scope_key text, daily_usd numeric, monthly_usd numeric, PRIMARY KEY (scope, scope_key));
-- llm_budget_check(p_feature, p_studio_id) → (allowed, reason): one aggregate over llm_usage.
```
**Reconcile — `llm_usage` is the single source of truth.**
- `aesthete_spend_ledger` (00241:52): dna-draft writes `feature='dna_draft'`; `DEFAULT_DAILY_BUDGET_USD=20` → row `('feature','dna_draft',20)`; a later migration renames it `_legacy` behind a compatible view. Retires the read-modify-write upsert (`db.ts:187-212`, safe only because one cron runs at a time). Grep other readers first.
- `job_runs.cost_usd` (00300:50) stays a denormalised run rollup, linked via `job_run_id`; `detail.cost_usd_exact` (00677:814-818) becomes unnecessary. `agent_tasks` artifacts carry `usage_id`.

**Per-studio budgets, three layers:** global daily ceiling (key-leak bound, 00241's purpose), per-feature daily, per-studio monthly soft cap. On exceed: sync → clear 429/503 (like FF&E's `extractor_unavailable`); queued → requeue with `run_after`. Studio attribution via project (FF&E; deck→board→project; field-parse project; companion project) → cost of goods per studio against the subscription stream.

**PostHog:** `$ai_generation` with model, provider `anthropic`, tokens incl. cache, `$ai_total_cost_usd`, latency, `$ai_trace_id` (run/task id), `$ai_span_name`=feature, `$ai_is_error`, `studio` group — **no `$ai_input`/`$ai_output` content**. Reuse `captureServerEvent` (`_shared/aesthete-events.ts:33`) for never-throw + log fallback, but it hard-codes `distinct_id: aesthete:<fn>`: add a distinct_id/groups option (sync = user id per identify policy; cron = system namespace).

## 3. Migrating the 5 call sites, in order
**0. Foundation** — module, registry, ledger. No behaviour change.

**1. `aesthete-dna-draft` — lowest risk** (SDK + ports, 729-line mocked suite, gated `smoke.test.ts`). Haiku 4.5 → 5.5 (10× cheaper): thinking on by default eats `MAX_OUTPUT_TOKENS` 3000 → effort `low`. Sonnet 5 → 5.5: `lib.ts:361` disabled thinking **400s** → `between_tools`/low. Fix `PRICING`. Bump `PROMPT_VERSION` p1→p2 (`shouldReplaceDraft` compares confidences across models that aren't on one scale).

**2. `board-deck-import-resolve` — low risk** (869-line `core_test.ts`, injected `adjudicate`). Forced `tool_choice` at `index.ts:244` **400s** on Sonnet 5.5 → `output_config.format` json_schema (pure data). Keep key-id allow-list (`core.ts:390`). Move to `judge`.

**3. `project-ffe-document-extract` — medium-high** (user waiting, stages rows, `index.ts` untested glue). Forced tool `:94` **400s** on 5.5 → `output_config.format`, `validateExtractionV2` stays authority. `max_tokens:6000` vs `MAX_ROWS` 5,000, thinking eats it on 5.5, `stop_reason` never checked → truncation surfaces as 502 `invalid_extraction`: stream, raise cap, branch on `truncated`. `MAX_PDF_BYTES` 25 MiB (`lib.ts:1`) base64-inflates to ~33 MiB > 32 MB request cap → **Files API**; source is sha256-addressed, so store `file_id` on the source_document. Add 600-page check, timeout, usage capture with project/studio.

**4. `_shared/field-parse.ts` — activation decision.** Dark in prod; the key rename activates model parsing of inbound contractor SMS → decide per feature behind a flag. Haiku 5.5 doesn't list forced `tool_choice` as a break, but default thinking + `max_tokens:512` risks truncation → `output_config.format`, effort `low`. Add AbortSignal (inbound webhook path). Keep `normalizeParse` id allow-list. Golden cases exist: `_tests/field-line/cases`.

**5. `companion-message` — last, after the feature seats rule on it.** `claude-sonnet-4-20250514` pin is **deprecated** (retirement TBD). `data.content[0]?.text` breaks when thinking leads. Client `conversationHistory` spread verbatim with roles unchecked → forged assistant turns; a trailing assistant turn = prefill → 400 on every current model. No timeout, no logging. `COMPANION_MODEL` stays the escape hatch.

## 4. Pattern catalog
**A. Sync extraction (docs/photos; FF&E, deck pictures, Field photos):** Messages API, `extract`; PDFs as `document` via Files API, images base64; `output_config.format` + local validator as final gate (strict tools only when choosing actions); cache system+schema prefix; stream when `max_tokens` > ~16K; lands `unconfirmed`/staged.

**B. Queued drafting via `agent_tasks`:** new `agent-llm-worker` on pg_cron via `invoke_edge_function` every 1–2 min, cloned from `catalog-normalizer` (00307) / `fulfillment-intake` (00354). Claims `draft_*` with `claimAgentTasks` (`_shared/agent-queue.ts:110`) under 00378 lease ownership; completes `awaiting_review` with artifacts `{draft, model, prompt_version, usage_id}` + confidence. Producers use `enqueue_agent_task` + `idempotency_key`. Approval via `review_agent_task`; external send is a separate trusted step after approval, never the worker. **Constraint:** `agent_tasks.assignee` CHECK is `('kody','leah')` (00297:46) — other studios' drafts need it widened or entity-based routing first.

**C. Nightly batch (Message Batches + pg_cron, 50% off):** two crons since an edge fn can't wait past 60 s — `llm-batch-submit` (`custom_id` = entity id; batch id in `job_runs.detail`) and `llm-batch-collect` every 15 min (results keyed by `custom_id`, never position; ledger at 0.5×). Batches rejects `fallbacks`; forced `tool_choice` still 400s. First tenant: dna-draft backlog (already tolerates hours).

**D. Grounded Q&A over a job:** Messages API, `answer`; job PDFs as Files API `document` blocks + DB facts (decisions, POs, notes) as titled custom-content documents; `citations:{enabled:true}` (can't combine with `output_config.format` → prose with cited spans + pages). Cache per-project doc set, 1 h TTL. **Build context with the caller's JWT client** (FF&E `asCaller`, `index.ts:43`) so RLS bounds what the model sees. No vector store yet; `count_tokens`, add retrieval only past a budget.

**E. Managed Agents — premature.** Beta; loop + sandbox outside the Supabase boundary; session budgets outside our ledger; poor fit with "agents write only via `enqueue_agent_task`". Vendor research is the one plausible fit — do it as pattern B with server tools `web_search_20260209`/`web_fetch_20260209` + `allowed_domains`, dossier lands `awaiting_review`. Revisit for real sandbox/multi-hour/scheduled-deployment needs.

## 5. Evals
- **Location:** `supabase/functions/_evals/<feature>/` → `cases/*.json` (input refs + expected), `baseline.json` (scores, cost, latency per prompt_version × model), runner. Large binaries in storage by sha256, not git (docs history already 138 MB PNGs).
- **Graders, deterministic first:** existing validators (`validateExtractionV2`, `normalizeParse`, `validateDraft`) + exact/numeric field match; Haiku 5.5 judge with a written rubric only for prose drafts.
- **Tiers:** (1) every PR — mocked deno suites with recorded responses, $0, already exist; (2) PRs touching `_shared/claude*.ts`, registry or a feature prompt — path-filtered/label-gated workflow, 20–50 cases/feature via Batches at half price, fail on per-metric regression past threshold (own trigger; `integration.yml` isn't on PRs); (3) nightly full sets on `integration.yml` cron.
- **CI key:** separate Anthropic workspace key with a spend limit.
- **Case sourcing:** approved/rejected `awaiting_review` outcomes + `payload_patch` corrections → cases after PII scrub (the designer-taught loop).
- **Rule:** every prompt/model change bumps `prompt_version`, so prod rows map to an evaluated config.

## 6. Data & privacy
**What leaves today:** dna-draft — public retailer text + image **URLs** Anthropic fetches (`lib.ts:334-337`), no studio data. deck-import — slide text/captions/alt text (`core.ts:393+`). FF&E — the **whole uploaded document** (quotes/schedules with homeowner names, addresses, pricing). field-parse — contractor SMS + recent messages, task titles, `project_name` (often homeowner surname) (`field-parse.ts:437-455`). companion — homeowner chat history, room data, style profile.

**Disclosure:** `designer-portal/(legal)/privacy/page.tsx:104-107` names Anthropic only "when you ask us to process content" (FF&E, companion, profile draft). Not covered: field SMS parse (contractors never asked), deck adjudication, any background/batch processing. Update before B or C ship — legal call.

**Retention/ZDR:** commercial API inputs not used for training (page says so); confirm the current default retention window in the DPA, don't assume. ZDR would block `claude-fable-5-1` (Covered Model → 400 for ZDR orgs); check Files API + Batches eligibility under ZDR **before** building C/D on them. Files persist until deleted → account deletion (30-day grace, `privacy/page.tsx:126`) must delete `file_id`s; Batch results expire Anthropic-side.

**Identity minimisation:** default to hours-judgment's "state carries no identity" — opaque ids and neutral labels, not names/phones/addresses unless needed; field-parse `project_name` first.

**Prompt injection** (vendor PDFs, deck text, SMS, retailer + future research pages). Existing structural defences: select-never-generate (field-parse trusts only shown ids; deck adjudication limited to provided keys; hours-judgment); schema-validated output only; results land unconfirmed/draft/`awaiting_review` behind a human gate; no side-effecting tools for a model reading untrusted content. Fixes: untrusted text in the **user** turn as delimited documents, never `system` — field-parse puts recent SMS history in system today (`:446-455`), move it; validate companion history roles; mid-conversation `role:"system"` as operator channel on 5.5; `web_fetch` with `allowed_domains`; citations make Q&A checkable.

## Critical files
`aesthete-dna-draft/{claude,lib,db}.ts` · `board-deck-import-resolve/{index,thresholds,core}.ts` · `project-ffe-document-extract/{index,lib}.ts` · `_shared/{field-parse,agent-queue,aesthete-events,hours-judgment}.ts` · `companion-message/{index,model}.ts` · migrations 00241, 00297, 00300, 00307, 00354, 00378, 00677 · `docs/agent-os/agent-roles-runbook.md` · `docs/field/sms-10dlc-runbook.md` · `apps/designer-portal/src/app/(legal)/privacy/page.tsx`

## Open uncertainties
SDK 0.109.1 support for `fallbacks`/strict tools; whether `ANTHROPIC_API_KEY` is set on Strata; other readers of `aesthete_spend_ledger`; whether Haiku 5.5 accepts forced `tool_choice` with default thinking (recommending `output_config.format` everywhere sidesteps it).

---
Verification (manual pinned verifier): this one comment covers all six sections (shared module, usage ledger, 5-site migration, pattern catalog, evals, data/privacy), each naming its files and reused utilities. No repo files edited; nothing committed/submitted; codebase map unaffected. Board note: claim refused `dispatch_required` (no prepared dispatch after the earlier run ended terminally) — posted without a live claim; ticket NOT closed.
