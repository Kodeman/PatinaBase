# Program charter — hour tracking (2026-09-11)

## §1 · The rulings in force

| ID | Ruling |
|---|---|
| **HT-1** | Yes. The server owns hourly_rate_cents on every project kind; a client-supplied rate is discarded. Non-services projects lose the legacy change-order leg. |
| **HT-3** | A per-member studio rate exists (tier 2). Edited on a studio settings page (extend /preferences or a sibling page), owner/admin only, dated, append-only history. NOT the People Room. |
| **HT-4** | Rate-card rows bind to the roster role enum (lead_designer / support_designer / bookkeeper / vendor), no free text. |
| **HT-41** | The member picks the role per entry via a role chip shown only when they hold more than one role; the entry records the role in rate_source. |
| **HT-10** | Narrow to owner/admin. Members read own rows plus aggregates on rostered projects. |
| **HT-13** | Any date, until the entry is invoiced; entries older than 30 days carry a quiet "backdated" mark. |
| **HT-25** | Auto-roster as support_designer on first log; the seat is visible on the roster and removable by the owner. |
| **HT-30** | Amend VISION §6 with an explicit exception for ledgers (the Hours sheet is a permitted reporting surface); record as a V-entry in VISION-DECISIONS.md. |
| **HT-34** | Running timer > 8 h writes one quiet Record row only; the unlogged-day reminder is built opt-in per member, weekly at most, behind a flag that ships off. |
| **HT-35** | Disclose once on a member's first document open; per-member opt-out on their own profile, default on, falls back to one-tap manual start. |
| **HT-36** | Aggregate by default; notes only behind an explicit detail act; the rollup's return shape never includes notes, asserted per role in SQL. |
| **HT-37** | Delete useStudioTimeReport; build a server-side rollup RPC. |
| **HT-38** | PANEL DEFAULT ACCEPTED — the rollup RPC is SECURITY INVOKER (Kody did not overrule). |
| **HT-7** | PANEL DEFAULT ACCEPTED — Field never owns the running-timer slot in v1. |
| **P-1** | Sequencing → W0 → W1 rate truth → W2 views (six seats over Leah's visibility-first) |
| **P-2** | Scope → all eight waves W0–W7 in one program |
| **P-3** | Ship cadence → one ship at the end after W7 passes its gate and the final review is clean |
| **P-4** | Historical backfill → none; new entries only; invoiced and unbilled history keep their amounts |
| **P-5** | Flags → unflagged, matching today's precedent |
| **P-6** | Field device pass → Simulator gate (capture-gate.sh) is sufficient to ship; Kody walks the device afterwards |
| **P-7** | Leah → ship, then walk her through it; reactions recorded as provisional rulings |
| **P-8** | Timeline → gates only, no date |

## §2 · Amendments to architecture.md these rulings force

(List only — architecture.md itself is not edited.)

| Ruling | Amendment |
|---|---|
| HT-3 | Moves the rate card from the People Room to a studio settings page (W1 portal work changes). |
| HT-4 | Enum binding, not person binding (W7 becomes a picker on the enum + a normalisation migration, smaller). |
| HT-41 | Adds a role chip to the log strip, ledger row, ⌘K verb and Field sheet for multi-role members (W3 + W6). |
| HT-37 / HT-38 | INVOKER rollup RPC replaces the JS hook (W2 DB work grows by one migration + per-role SQL test). |
| HT-25 | Adds an auto-roster trigger (W0 or W3, architect decides). |
| HT-13 | Adds a "backdated" mark (W3). |
| HT-30 | Adds a docs task: VISION.md §6 exception + VISION-DECISIONS.md V-entry. |
| P-4 | Removes W1's backfill step. |
| P-5 | Removes every flag reference. |
| P-3 | Replaces per-wave ship gates with one integration branch and one ship. |

## §3 · Lanes

Head migration = `00591` (origin/main after fetch, `2ff00bb2b`, 2026-09-11). Ranges below resolve architecture.md's `head+n` notation against that head.

| Lane | Owner model | Waves | Worktree | Reserved migration range | Gate command |
|---|---|---|---|---|---|
| **A — server** | Opus | W0, W1 DB, W2 DB, W4 | `.codex/worktrees/agent-server` | W0 `00592–00594`; W1 `00595–00600`; W2 `00601–00604`; W4 `00607–00611` | `supabase db reset` clean + `scripts/run-sql-tests.sh -d supabase/tests/billing` + `-d supabase/tests/commercial` |
| **B — portal** | Sonnet (Opus for the ⌘K parser and the ledger scope lens) | W2 UI, W3, W5, settings rate table, HT-35 disclosure + opt-out, W7 picker | `.codex/worktrees/agent-portal` | W3 `00605–00606`; W5 none (`00612` reserved, unused); W7 `00615–00617` | `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test && pnpm --filter @patina/designer-portal lint` |
| **C — iOS** | Opus | W6 | `.codex/worktrees/agent-ios` | W6 `00613–00614` | `ruby apps/mobile/Capture/scripts/generate_project.rb && apps/mobile/Capture/scripts/capture-gate.sh all` |
| **D — edge + analytics** | Sonnet | W4's time-nudges function + cron entry, the PostHog event set | `.codex/worktrees/agent-edge` | shares W4's `00607–00611` (edge/cron entries only; no new migration) | `deno test --config supabase/functions/deno.json` (run under `supabase/functions`) |

## §4 · Merge order and integration

| Step | Action |
|---|---|
| 1 | A's W0 and W1 (DB) merge first into integration branch `hour-tracking/integration`. |
| 2 | B and C branch from `hour-tracking/integration` only after W1 lands. |
| 3 | D branches and merges any time. |
| 4 | W2 DB (lane A) lands before W2 UI (lane B). |
| 5 | Final integration review: two adversarial lenses, Opus, separate context — must return clean before the single ship. |
| 6 | Ship chain (per patina-deploy): `supabase db push` → `supabase functions deploy` for touched functions → `./infra/deploy-portal.sh designer-portal` → verify with `wrangler deployments list` + behaviour probes. |
| 7 | iOS ships via TestFlight after `capture-gate.sh`. |

## §5 · What Kody does

| After ship | Action |
|---|---|
| 1 | Signed-in walk at 1440 / 1024 / 390: scope lens, ⌘K verb, backdate, settings rate table, disclosure sentence. |
| 2 | iPhone airplane-mode drain walk. |
| 3 | Walk Leah's studio through it. |
| 4 | Rule the provisional reactions. |
| 5 | Widen nothing (no flags). |

## §6 · Not in this program

| Item | Reason |
|---|---|
| Widget / App Intents / Live Activity | XL, un-gateable. |
| Approval/lock workflow | Not in scope. |
| Daily nudges | Not in scope (HT-34 caps at weekly, opt-in). |
| Backfill of history | Excluded by P-4. |
| Client-facing hours breakdown beyond the composer naming the person | Not in scope. |
