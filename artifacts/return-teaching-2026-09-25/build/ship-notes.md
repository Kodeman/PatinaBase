# Return teaching (US-13): ship notes for W4

The deploy runbook for the return-teaching build (W1 to W3), in order. Every
step below is a production mutation: run it only on Kody's explicit ship
request (patina-deploy GATE). Nothing a designer can see changes until step 4
turns the flag on for someone and step 6 publishes content.

## Runbook

### 1. Migrations (Strata)

```bash
supabase db push        # applies 00672, 00673, 00674 in order
```

- `00672_teaching_note_state.sql`: the `teaching_note_state` table, RLS, and
  the `teaching_note_state_patch(text[], jsonb)` RPC. It revokes INSERT and
  UPDATE on the table from `authenticated`: clients write only through the RPC
  (SQ-297). The RPC SETS values; it never increments.
- `00673_teaching_signals.sql`: `teaching_signals()` (used features, boundary
  and success instants).
- `00674_help_state_merge.sql`: `help_state_merge(p_patch jsonb)`, a two-level
  merge. A JSON `null` at the second level deletes that entry (for example
  `{"tours": {"<id>": null}}`); deeper nulls are kept. The web adapter uses it.
  **Owed follow-up:** iOS `SupabaseHelpStateAdapter.swift` still writes the
  whole `help_state` blob and does not call this RPC (SQ-265 territory).

All three were edited in place during the build (SQ-297, SQ-290). Local apply
through `psql -f` is idempotent.

### 2. Sanity schema and Studio

```bash
cd studios/help-system
npx sanity@latest schema deploy
SANITY_STUDIO_PUBLISHER_IDS=<Leah's Sanity user id> npx sanity deploy
# equivalently: SANITY_STUDIO_PUBLISHER_IDS=<id> pnpm --filter @patina/help-system-studio run deploy
```

- `sanity schema extract` was deferred to this deploy; run it here if the
  schema deploy asks for it.
- The Studio needs `SANITY_STUDIO_PUBLISHER_IDS` (comma-separated Sanity user
  ids, read at Studio build). It hides Publish on `teachingNote` and
  `teachingRelease` for everyone else. Unset means Publish is open to anyone,
  with a console warning. It hides the button only; an API token can still
  publish.

### 3. Seed the content as drafts

```bash
node studios/help-system/scripts/run-teaching-notes-seed.mjs            # dry run, no token
SANITY_AUTH_TOKEN=<write token> node studios/help-system/scripts/run-teaching-notes-seed.mjs --commit
```

It writes 11 **drafts** (SQ-293) and never publishes. It needs a Sanity write
token in `SANITY_AUTH_TOKEN`.

### 4. PostHog flag

Create the feature flag `teaching-notes` **off**, then release it to Kody only.
The portal fails closed: if the flag does not exist or cannot be read, no
teaching note or since-line renders and no teaching state is written.

### 5. Designer portal

```bash
pnpm --filter @patina/designer-portal type-check     # the build ignores TS errors
./infra/deploy-portal.sh designer
```

The script takes `designer`, not `designer-portal` (it accepts
`client|designer|admin|manufacturer`). Export the Supabase trio from
`apps/designer-portal/wrangler.jsonc` in the same shell first: the script's
Phase 0 does not read wrangler.jsonc.

### 6. Leah publishes

Nothing renders until Leah publishes in the Studio. The portal reads only the
`published` perspective, so a draft is the awaiting-review state. Content to
review and publish (the seed's 11 drafts):

- Releases, which must match `apps/designer-portal/src/content/teaching-releases.ts`:
  `2026-09-10-galley-parts` (workflow-changing), `2026-09-11-ledger-invoice-delivery`,
  `2026-09-11-invoice-print`.
- Release notes: `invoice-delivery-status@1`, `invoice-print@1`, `galley-parts-fold@1`.
- Faster ways: `hours-shortcut@1`, `draw-from-time@1`, `field-hours@1`.
- Owner capabilities: `second-seat-hours@1`, `invite-handoff-note@1`.

A release note shows only when its `teachingRelease` is published too.

## Verification probes

1. **Migrations:** `supabase migration list` shows 00672, 00673 and 00674 on
   the remote. Read-only SQL on Strata:
   - `select to_regclass('public.teaching_note_state');` is not null.
   - `select has_table_privilege('authenticated', 'public.teaching_note_state', 'INSERT'), has_table_privilege('authenticated', 'public.teaching_note_state', 'UPDATE');` returns `false, false`.
   - `select has_function_privilege('authenticated', 'public.teaching_note_state_patch(text[], jsonb)', 'EXECUTE'), has_function_privilege('authenticated', 'public.teaching_signals()', 'EXECUTE'), has_function_privilege('authenticated', 'public.help_state_merge(jsonb)', 'EXECUTE');` returns all `true`.
2. **Sanity:** the hosted Studio lists Teaching note and Teaching release. A
   non-publisher sees no Publish button on either. A published-perspective
   query for `*[_type == "teachingRelease"]` returns only what Leah published.
3. **Portal:** `npx wrangler deployments list --name patina-designer-portal`,
   bottom row, is this deploy. Signed in as Kody with the flag on:
   `/help/changes` renders; the Desk shows at most one line below the roster
   head; opening an invoice or the Galley raises no console errors from the
   teaching reads. Signed in as anyone with the flag off: the Desk is
   unchanged, and the network shows no `teaching_note_state_patch` call.
4. **Help state:** reset a Desk tour in the web portal, reload, and confirm the
   tour offers again (the null-as-delete path through `help_state_merge`).

## Rollback

1. Turn the `teaching-notes` flag off. Teaching disappears everywhere at once,
   and nothing more is written.
2. Unpublish any note or release in the Studio. The portal stops showing it
   on its next Sanity read (the portal caches teaching reads for up to 30
   minutes per session).
3. The migrations are additive: they add a table and three functions and move
   no existing write path. Leave them in place. Do not drop `help_state_merge`
   (00674): the web help-state adapter now calls it.

## Known gaps (recorded, not fixed)

- **Walkthrough offer timing.** The Desk Walkthrough offer has no loading
  state. If it turns eligible after the Desk's first paint, the teaching note
  can miss that visit.
- **`desk-first-touch`** shows only within one hour of account creation.
- **Since-line.** It shows after 30 days away and takes the teaching slot for
  that visit, so no teaching note shows beside it. It writes no teaching state
  (no `unsolicitedShown`, no weekly count). Ranking against pinned projects
  (R-RT3) is not implemented: no release is linked to a project.
- **Client page send.** `useAddClient` is tagged `client_page_sent`, by ruling
  (SQ-287).
- **"Draw an invoice · new"** is retired from the Desk contents
  (`desk-contents.tsx`). The row stays as "Draw an invoice"; the release note
  now says what is new.
- **Release checklist line: owed to the patina-deploy skill.** The skill file
  is `.agents/skills/patina-deploy/SKILL.md` (`.claude/skills` is a symlink to
  it). SQ-292's scope named only the symlinked path, and the scope request for
  the real path was refused, so the line was not added. Add it to the portal
  procedure (after item 5) verbatim:

  > If `apps/designer-portal/src/content/teaching-releases.ts` gained an entry,
  > confirm its `teachingRelease` + notes are published in Sanity after the
  > deploy verifies. Unpublished copy keeps the release dark.

  Until then, it applies to this deploy through step 6 above.
