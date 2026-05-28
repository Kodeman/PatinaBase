# SEC-06/07 Help & Guidance — Status (2026-05-28)

Live-verified against Sanity project `kv3qrinl` / dataset `production` (auth: kody.kochaver@gmail.com).

## SEC-06 — schema deploy: **DONE (no action needed)**

The deployed `helpContent` schema for the `help-system` workspace already matches the local source
(`studios/help-system/schemas/helpContent.ts`) exactly — all 7 fields, **including the Sprint-4
`coachmarkContent` object** (`heading` ≤60, `body` ≤120, `ctaLabel` ≤20). Verified via Sanity MCP
`get_schema`. No `sanity schema deploy` re-run is required.

If the schema source changes in future, deploy from the studio with the token (CLI, not the MCP
`deploy_schema` tool, which refuses Studio-deployed workspaces):
```bash
cd studios/help-system
export SANITY_AUTH_TOKEN="$(grep -E '^SANITY_AUTH_TOKEN=' .env | cut -d= -f2-)"
npx sanity@latest schema deploy
```

## SEC-07 — content authoring: **ongoing; handed to Kody**

**Live published counts** (the handoff's "5 docs" was badly stale):

| Portal | Published | Notes |
|---|---|---|
| designer-portal | 133 (**130 distinct**) | 3 duplicate surfaceKeys — see below |
| ios-app | 16 | |
| client-portal | 2 | near-greenfield |
| admin-portal | 1 | near-greenfield |
| **Total** | **151** | |

designer-portal content by type: fieldHelper ~97, tooltip ~26, emptyState ~18, coachmark ~8,
learnMore 1, helpArticle **0** (Layer-4 reference content entirely unauthored).

### Duplicate designer surfaceKeys to dedupe (two published docs each)
- `designer-portal/clients/list-intro` — ids `01370904-…` and `1aada683-…`
- `designer-portal/pipeline/project-list` — ids `20b38c2e-…` and `be293e62-…`
- (one more in the products/list-intro family — verify in Studio)

Pick the better-written doc in each pair, unpublish/delete the other in Studio.

### Why this is handed off, not auto-published
Authoring the ~69-key designer-portal gap (and the larger cross-portal gap vs the 321-key registry
in `packages/help-system/src/surfaceKeys.ts`) is **brand-voice microcopy that goes live in prod**.
Per the writing standards (`docs/prds/Guide/…handoff.md` §8) the copy needs Kody's voice and review,
so it should be drafted-then-reviewed, not auto-published.

### Recommended authoring loop (when ready)
1. Diff the registry (`SurfaceKeys`) against the published key list to get the missing-key worklist
   (prioritize surfaces already wired in code — `today`, `clients`, `settings`, `pipeline`,
   `products/capture/import`, `aesthete` — those throw `[help-system] No content found` today).
2. Draft short copy (tooltip/fieldHelper/emptyState/coachmark) via Sanity MCP
   `create_documents_from_json` → these land as **drafts** (reversible) → review in Studio →
   `publish_documents`.
3. Author `helpArticle` bodies (Portable Text) via `create_documents_from_markdown` or in Studio.
4. Respect the schema char caps (already enforced as validation).

The code surface is complete — the `useHelpContent` `coalesce(flat, nested)` projection reads both
shapes, so any newly-authored content renders without code changes.
