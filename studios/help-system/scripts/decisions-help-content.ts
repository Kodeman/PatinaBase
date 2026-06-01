/**
 * PT-D-2-T6-2 — Decisions help content (authored copy).
 *
 * Typed view over `decisions-help-content.json`, the single source of truth for
 * the Designer-Portal Decisions dashboard help copy. The JSON is shared with
 * the `.mjs` runner (`run-decisions-help-seed.mjs`) so the two seed paths can
 * never drift; this module just imports + type-narrows it for the `sanity exec`
 * script (`seed-decisions-help.ts`).
 *
 * Document shape mirrors `studios/help-system/schemas/helpContent.ts`:
 *   - tooltip / fieldHelper → nested `tooltipContent: { eyebrow?, body }`
 *   - emptyState            → nested `emptyStateContent: { icon?, heading,
 *                              description, primaryActionLabel?, ... }`
 *
 * Voice (spec §8, designer persona): clear, operational, decision-loop-aware.
 * Patina vocabulary used deliberately — "blocking status", "response window",
 * "procurement" — because these are the concepts the StrataInfoIcon exists to
 * explain. Caps respected: tooltip body ≤160, empty heading ≤50, empty
 * description ≤300 (schema validation).
 *
 * surfaceKeys are copied verbatim from
 * packages/help-system/src/surfaceKeys.ts → DesignerPortal.Decisions.*; if a
 * key changes there, update the JSON in the same change.
 */
import rawDocs from './decisions-help-content.json'

export interface HelpContentSeedDoc {
  _id: string
  _type: 'helpContent'
  surfaceKey: string
  persona: 'all'
  contentType: 'tooltip' | 'fieldHelper' | 'emptyState'
  tooltipContent?: { eyebrow?: string; body: string }
  emptyStateContent?: {
    icon?: string
    heading: string
    description: string
    primaryActionLabel?: string
    secondaryActionLabel?: string
    secondaryActionArticleKey?: string
  }
}

export const DECISIONS_HELP_DOCS: HelpContentSeedDoc[] =
  rawDocs as HelpContentSeedDoc[]
