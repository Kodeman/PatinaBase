# Field Companion · Wave 4 ledger — "It lands in the Document"

Branch `feat/field-companion-w4` · worktree `.claude/worktrees/field-companion-w4` · base `97f728f15` (main, W3 merged).

Conductor-maintained. One writer at a time, serialized on `writer.lock.d` at the worktree root.

## Conductor rulings (W4)

| # | Ruling | Rationale |
|---|---|---|
| W4-C1 | **Migration numbers draw from `00543`, not the 00530–00535 band.** The plan's band is exhausted and mis-stated: `00533_piece_detail_contract`, `00534_client_attention_notifications`, `00535_saved_items_price_snapshot` are on `main` and were drawn by other lanes. `main` head is `00542_product_images_owner_folder_insert`. | Filesystem census on `main@97f728f15` + local applied ledger (`schema_migrations` max `00542`). |
| W4-C2 | **Task 0.1's gate 2 ("`00530` applied to Strata") is RELAXED to a recorded owed item, not a blocker.** W4 proceeds on: `00530` + `00532` on `main` AND applied to the local DB. Prod apply of `00530`/`00532` (and of `00533–00542`) is Kody's GO, outside this wave. | Kody's standing instruction for this wave; prod mutation needs an explicit in-session request. The wave report carries the prod-apply debt. |
| W4-C3 | **W4 migrations must not depend on schema objects introduced by `00533–00542`.** Dependencies on `00530`/`00532` (the W1 routing + W3 visit columns) are unavoidable and are declared in each migration header and in the wave report. | Conductor brief; `00533–00542` are unapplied on prod. |

## Task status

| # | Task | Model | Status | Commit | Gate |
|---|---|---|---|---|---|
| 0 | Pre-flight re-verification + three accumulated debts | Sonnet | pending | — | — |
| 0a | R27 offline project CREATE at the door | — | pending | — | — |
| 0b | N-2 `resolve` 4-hour window ends an idle live visit | — | pending | — | — |
| 0c | `SmartGuessKeywords.category(forVisionLabel:)` ordered-substring bug | — | pending | — | — |
| 1 | The margin migration | Sonnet | pending | — | — |
| 2 | The margin renders the whole note | Sonnet | pending | — | — |
| 3 | The play button and the photo strip | Sonnet | pending | — | — |
| 4 | Escalation carries the whole note | Haiku | pending | — | — |
| 5 | `useProjectVisits` | Sonnet | pending | — | — |
| 6 | The Visits block on the project spread | Sonnet | pending | — | — |
| 7 | The punch back-reference migration | Sonnet | pending | — | — |
| 8 | The time-entry migration | Haiku | pending | — | — |
| 9 | CaptureKit: the margin-note lane | Opus | pending | — | — |
| 10 | CaptureKit: the task lane + court rule | Opus | pending | — | — |
| 11 | The app writes the two rows on the drain | Opus | pending | — | — |
| 12 | The three verbs on the card | Opus | pending | — | — |
| 13 | The punch photo | Sonnet | pending | — | — |
| 14 | CaptureKit: visit review + close record | Sonnet | pending | — | — |
| 15 | V4 Visit review screen | Opus | pending | — | — |
| 16 | One tap logs the visit as hours | Sonnet | pending | — | — |
| 17 | The Library provenance chip | Haiku | pending | — | — |
| 18 | Wave gate: browser proof, device pass, report | Sonnet | pending | — | — |

## Environment facts (recorded 2026-08-31)

- Local Supabase is up on `127.0.0.1:54322`; `schema_migrations` max = `00542`.
- `field_captures` carries `capture_kind`, `voice_audio_segments`, `transcript_source`, `note_setting`, `visit_id`, `visit_kind`, `visit_kit`, `visit_label`, `visit_started_at`, `visit_ended_at`, `suggested_project_id`, `suggested_project_room_id`, `suggestion_basis`, `suggestion_confidence` — W1 (`00530`) and W3 (`00532`) columns are present locally.
- Bash runs sandboxed: the Docker socket is denied and `**/.env*` is unreadable/unwritable. Any command needing Docker (`pnpm supabase:reset`, `supabase start`) must run with the sandbox disabled.
