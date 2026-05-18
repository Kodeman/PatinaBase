# @patina/help-system-studio

Sanity Studio for the Patina Help & Guidance System.

This workspace manages all contextual help copy — tooltips, field helpers, empty states, and long-form articles — that appears across `designer-portal`, `admin-portal`, and `client-portal`. Content is fetched at runtime by surface key using the `useHelpContent` hook in `@patina/help-system`.

## Project details

| Key | Value |
|-----|-------|
| Sanity project ID | `kv3qrinl` |
| Dataset | `production` |
| Workspace name | `help-system` |
| Studio base path | `/help-system` |

## Local development

```bash
# From this directory
pnpm dev
```

The studio runs at `http://localhost:3333/help-system`. You must be authenticated with Sanity (`sanity login`) before editing content.

## Building

```bash
pnpm build
```

Produces a static site in `dist/`. This does not deploy to Sanity — it produces local build output for CI verification.

## Deploying

```bash
pnpm deploy
```

Deploys the studio to `https://kv3qrinl.sanity.studio`. Requires Sanity credentials with deploy rights on project `kv3qrinl`.

**Deployment is normally triggered by the orchestrator/CI, not by individual engineers.** See the master plan at `/Users/kody/.claude/plans/review-the-documenation-for-compressed-shore.md`.

## Schema overview

| Schema | Purpose | Key constraints |
|--------|---------|----------------|
| `helpContent` | Base document type. Every piece of help content starts here. | `surfaceKey` required, regex-validated. `contentType` required. Inline sub-objects for each type (conditionally shown). |
| `tooltipContent` | Standalone tooltip documents (used for dedicated list views). | `body` required, max 160 chars. |
| `emptyStateContent` | Standalone empty-state documents. | `heading` required max 50, `description` required max 300. |
| `helpArticleContent` | Long-form articles rendered in the Contextual Help Panel. | `title` + `oneSentenceAnswer` + `body` required. `wordCount`, `readingTimeMinutes`, `lastUpdated` are read-only (auto-set). |

### `helpContent` inline design

Rather than requiring editors to create a separate `tooltipContent` document and then reference it from `helpContent`, the `helpContent` schema embeds type-specific fields as conditional inline objects (`tooltipContent`, `emptyStateContent`, `helpArticleContent`). Fields for non-selected types are hidden. This keeps all content for a given surface key in one document, which simplifies GROQ queries and the `useHelpContent` hook (single fetch, no join).

## Spec reference

Full content architecture is documented in:

```
docs/prds/Guide/patina-help-guidance-engineering-handoff.md
```

Section 7 covers schemas; Section 8 covers writing standards that content editors must follow.
