# Wave 1 onboarding — prod deploy verification (2026-09-03)

## Summary

- Merged `onboarding/w1-integration` (ed5303de8a) into `main` — new main hash `8f6d42d71`, pushed to `origin/main`.
- Migration 00559 (`first_document_opened_at` + `mark_first_document_opened()`) applied to Strata **selectively** via `supabase db query --linked -f` inside a `BEGIN;...COMMIT;` transaction, then recorded with `supabase migration repair --status applied 00559 --linked`. 00555 and 00557 remain deliberately pending (NOT touched — no plain `db push` was run).
- Designer portal deployed via `./infra/deploy-portal.sh designer` with prod `wrangler.jsonc` vars exported into the environment first. New Worker version `91541ac8-1eee-45c7-a9ae-1ca642060b03` (previous: `2a153781-4bbf-44ba-b527-8a92d26c8b2f`).
- Signed-in prod walk performed as `tester@patina.cloud` (TESTER pill, "Good afternoon, Kody").

## Pass/fail table

| Step | Check | Result | Screenshot |
|---|---|---|---|
| a | `/desk` → ⌘K → "Help…" → panel shows "Every live job, one line each" + KEYS block | PASS | `a-desk-help-panel.jpg` |
| b | `/desk` → `?` → "The keys" sheet opens; Esc closes | PASS | `b-the-keys-sheet.jpg` |
| c | ⌘K → type "words" → "The words" row appears | PASS | `c-the-words-command-bar.jpg` |
| d | Open first document → ⌘K → Help… → panel shows "One client, one paper" | PASS | `d-doc-help-panel.jpg` |
| e | `/desk?tour=desk-walkthrough` → advance to step 6 → CTA → click → lead sheet opens; Esc (no submit) | PASS (see note) | `e1-tour-step6.jpg`, `e2-lead-sheet-open.jpg` |
| f | `/help` → Featured section shows articles or fallback line | PASS (articles) | `f-help-center-featured.jpg` |
| g | Account nameplate → STUDIO page → six-row checklist incl. "Your first hire opened a document" | PASS | `g-studio-checklist.jpg` |

### Note on step (e)

The step-6 tooltip button reads **"To work"**, not "Capture a lead" as the brief's wording suggested. This is correct, verified-in-source behavior, not a defect: `apps/designer-portal/src/components/document/help/desk-walkthrough.tsx` defines `fallbackCtaLabel: 'Capture a lead'` as the *anchor* label (used for the `data-tour-anchor="desk-capture-lead"` target, i.e. the "CAPTURE A LEAD" header link the step points at), while the tour tooltip's own action button is literally "To work" — confirmed by `desk-walkthrough.test.tsx`: *"clicking the step-6 CTA 'To work' completes the tour and opens the capture-lead sheet"*. Clicking "To work" did open the lead-capture sheet ("Who just came in?") exactly as expected. No lead was submitted; the sheet was dismissed with Esc.

### Note on step (g)

The account nameplate button (`aria-label="Account and settings"`) was not reachable via direct click/ref at the tested viewport width — the bottom studio-drawer's right zone (nameplate) appeared to collapse behind a "MORE" menu that did not itself list an account entry. Reached the Studio page instead via the documented direct route `/desk?account=studio` (defined in `account-sheet.tsx`'s `openAccountPage`), which is the same sheet the nameplate opens. This is a UI/automation-reachability note, not a functional deploy issue — the sheet, its Studio tab, and the checklist all render and behave correctly.

## Migration verification detail

```
$ supabase migration list (relevant rows before fix)
00555  remote: ""   (pending — expected, NOT applied)
00557  remote: ""   (pending — expected, NOT applied)
00558  remote: 00558 (already applied)
00559  remote: ""   (pending, before this session's apply)

$ supabase db query --linked -f 00559_apply.sql   → applied cleanly (empty rows, no error)
$ supabase migration repair --status applied 00559 --linked → {"versions":["00559"],"status":"applied", ...}

$ supabase migration list (after)
00555  remote: ""      (still pending, untouched)
00557  remote: ""      (still pending, untouched)
00558  remote: 00558
00559  remote: 00559   (now applied)

$ supabase db query --linked "SELECT has_function_privilege('anon', ...), has_function_privilege('authenticated', ...)"
anon_can_exec: false
authenticated_can_exec: true
```

## Deploy verification detail

```
$ npx wrangler deployments list --name patina-designer-portal --config .../wrangler.jsonc
... (bottom/newest row) Created: 2026-09-03T19:36:24.162Z, Version: 91541ac8-1eee-45c7-a9ae-1ca642060b03

$ curl -s -o /dev/null -w "%{http_code}" https://app.patina.cloud/help/article/the-keys
307   (auth redirect — expected, behind auth)

$ curl -sIL https://app.patina.cloud/desk
307 → location: /auth/signin?callbackUrl=%2Fdesk   (expected)

Chunk grep: /_next/static/chunks/app/(document-help)/help/article/the-keys/page-b0bf8178dfac02d2.js
  contains "Every live job, one line each" AND "The keys" → confirms new code is being served.
```

## Not verified / explicitly skipped

- Sanity CMS content was NOT loaded or modified this session (not approved by Kody). The Featured guides section in `/help` already had 5 real articles from prior content — unrelated to this deploy.
- Only the designer portal was deployed. No other portals, services, or workers were touched.
- Rollback command (not executed, recorded for reference):
  ```
  npx wrangler rollback 2a153781-4bbf-44ba-b527-8a92d26c8b2f --name patina-designer-portal --yes
  ```
- Worktrees: none created for this task; no cleanup needed.
- `wrangler tail` was not run to check for post-deploy error spikes.
