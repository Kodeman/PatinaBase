# Studio Asks — QA Hotfix Run, 2026-09-10

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-sa-program`
Commit under test: `8948a4c82d7a9f36942ce5cdda17029e4e109430` (fix(studio-asks): hotfix review round 2)
Signed in as: `designer@patina.dev` (Leah Hartwell), via the sign-in page's "Dev Accounts" instant sign-in
Server: `next dev --webpack -p 3010` (started with the sandbox disabled so `.env.local` loaded — without that, Next reports `EPERM` reading `.env.local` and falls back to an empty `NEXT_PUBLIC_SUPABASE_URL`, same footgun documented in the prior QA-NOTES.md). Local Supabase already had migrations through `00587_return_to_lead_hardening.sql` applied — no reset needed.

## Flow results

### Flow B — Undo toast — PASS
Captured lead "QA Undo 2026-09-10" (email `qa-undo-2026-09-10@example.com`, phone `(312) 555-0199`) → Accept · begin → navigated to the Discovery folder → the "Moved to Discovery / UNDO" toast was visible and clicked within its window → returned to the Brief.
- psql: `leads.status='new'`, `accepted_at` NULL, no `designer_clients` row for the lead. Confirmed.

### Flow C — Folder action ("Move back to New Lead") — PASS (both halves)
- Accept · begin (2nd time) → Discovery folder, 0 of 5 essentials captured → "Move back to New Lead" enabled → clicked → back to Brief.
  - psql: `leads.status='new'`, `accepted_at` NULL, no `designer_clients` row. Confirmed — this is the defect from the prior QA run (00585/00586) and it is now fixed.
- Accept · begin (3rd time) → in Discovery, added a room ("Living Room") to Scope & rooms → reloaded → "Move back to New Lead" now renders disabled, with the reason "Discovery has already been filled in for this client." Clicking it does nothing (confirmed no navigation/mutation).
  - `return_to_lead_check(designer_client_id)` called as the designer (`request.jwt.claims` impersonation of `designer@patina.dev`, `a0000000-0000-0000-0000-000000000004`) returns:
    `{"allowed": false, "reason": "Discovery has already been filled in for this client.", "lead_id": "1ab1aa55-9f10-4c36-a752-88086088c93a"}` — matches the UI exactly.
- Screenshot: `screenshots/flowC-move-back-disabled-with-reason.jpg`

### Flow D — Phone carries to designer_clients — PASS
`designer_clients` row for `lead_id=1ab1aa55-9f10-4c36-a752-88086088c93a`: `client_phone='(312) 555-0199'`, `client_phone_e164='+13125550199'`.

### Flow E — People edit (field party) — PASS (both halves)
- People → Field filter (empty) → Add person → kind Sub, project "Chen Residence", name "QA Field Sub 2026-09-10", company "QA Sub Co", trade Electrical, phone `(312) 555-0188`, email `qa-field-sub-2026-09-10@example.com` → created in `project_parties` (`id=9e5b9acc-e84b-4c00-8579-837a1e6faadb`) with all fields populated correctly.
- Opened the card, pressed Edit immediately on load, Save with no changes.
  - psql: `company_name`, `trade`, `phone`, `phone_e164`, `email` all unchanged — the empty-snapshot-on-save regression from the prior QA run is fixed.
- Edit again → cleared the Phone field → Save.
  - psql: `phone IS NULL` = true, `phone_e164 IS NULL` = true. Confirmed.

### Flow A — Regression: lead with email + phone — PASS
Lead "QA Undo 2026-09-10" captured with email + phone. Brief eventually renders `QA Undo 2026-09-10 · qa-undo-2026-09-10@example.com · (312) 555-0199` with Accept · begin / Nurture / Pass. `leads.contact_phone_e164 = '+13125550199'`. See Defect 1 below — this content does not render immediately.

### Flow F — Console
Two non-fatal console errors were captured, both benign in effect:
- `Error: AppError: client relationship <id> not found or access denied` — logged twice (once per "Move back to New Lead" success in Flow C), timestamped seconds after each successful revert. This is a stale background refetch of the just-reverted `designer_clients` row (its RLS visibility changed once it stopped being `accepted`), not a user-facing failure — the revert itself worked and was confirmed via psql both times. Worth a look so a background query doesn't retry/alarm on an expected 404-shaped state.
- Repeated `[help-system] Sanity fetch failed` warnings — the local dev environment has no network path to Sanity's CDN; unrelated to this hotfix, cosmetic help-content only.
No React/hydration errors, no errors from the four flows' actual mutations.

## Defects

1. **[UI rendering, all of Flows A/B/C are affected] Brief and Discovery panel content — including contact info, Accept · begin / Nurture / Pass, and "Move back to New Lead" — is present in the DOM/accessibility tree on page load but does not paint into the visible layout until some unrelated interaction (scrolling, expanding the "+N MORE" chip) happens.** Reproduced consistently across three different documents (the fresh Brief for "QA Undo 2026-09-10", and two different Discovery folders after 2nd and 3rd Accept). On a bare page load / full reload, the visible page shows only the stale placeholder ("Nothing yet") with none of the actual content or action buttons below it — a designer who does not know to scroll would see an apparently-empty, action-less document and have no way to know Accept · begin or Move back to New Lead exist. Confirmed via accessibility-tree reads showing the real content already present, and via `scroll`/`scroll_to` calls that make it visually appear without any new network request firing. This is not a data or authorization bug — every action worked once revealed — but it blocks normal use of exactly the flows this QA pass covers. Screenshots: `screenshots/defect-hidden-move-back-action-before-interaction.jpg` (before) vs `screenshots/flowC-move-back-disabled-with-reason.jpg` (after scrolling one tick). Not root-caused past the browser side (no failed network request seen — `read_network_requests` shows no additional fetch between the two states) — worth a source-level look at whatever gates the brief/discovery block's visibility (a stale `isPending`/skeleton flag that doesn't clear, or a CSS class keyed off a prop that only updates on reflow).
2. **[Minor, cosmetic] Two "AppError: client relationship ... not found or access denied" console errors fire a few seconds after each successful "Move back to New Lead"** — a background query still holding the old (now-reverted) `designer_client` id refetches after its RLS visibility has changed. Behavior was correct in both cases (confirmed via psql); this is redundant/noisy error logging, not a failure.

## Screenshots
- `screenshots/defect-hidden-move-back-action-before-interaction.jpg` — Discovery folder immediately after navigation, Defect 1's placeholder-only render.
- `screenshots/flowC-move-back-disabled-with-reason.jpg` — same document, one scroll tick later: "Move back to New Lead" visible and disabled with reason "Discovery has already been filled in for this client."

## Not verified
- Root cause of Defect 1 (the DOM-present-but-not-painted content) was not traced into source — confirmed reproducible and non-blocking-once-revealed from the browser side only.
- Whether Defect 1 also affects other document types beyond Brief/Discovery (Direction, Proposal, Project) was out of scope for this run.
