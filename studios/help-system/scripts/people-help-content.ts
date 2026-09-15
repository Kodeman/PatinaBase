/**
 * W4-help (People room CRM, 2026-09-11) — People room help content (authored copy).
 *
 * Typed view over `people-help-content.json`, mirroring the
 * `decisions-help-content.ts` pattern so this file never drifts from the
 * hand-authored JSON copy the `.mjs` runner (`run-people-help-seed.mjs`) also
 * reads. Document shape mirrors `studios/help-system/schemas/helpContent.ts`:
 *   - tooltip / fieldHelper → nested `tooltipContent: { eyebrow?, body }`
 *   - emptyState            → nested `emptyStateContent: { icon?, heading,
 *                              description, primaryActionLabel?, ... }`
 *   - helpArticle           → nested `helpArticleContent: { title,
 *                              oneSentenceAnswer, body }`
 *
 * Surfaces covered (direction.md §3.1–§3.3, §3.7, §5; rulings.md PR-a;
 * upload-door-spec.md §3):
 *   - `designer-portal/document/people`        — the Directory room: a
 *     fieldHelper intro, an emptyState for a studio with nobody on the
 *     roster yet, and standalone tooltip surfaces for the reach word, the
 *     consent word, the paper word, the contact rule clause, the MINE ·
 *     STUDIO lens, and the six chips (each its own surfaceKey — a tooltip
 *     is fetched by exact surfaceKey + contentType + persona, §5.7's
 *     `useHelpContent` contract, so six concepts sharing one surfaceKey
 *     could never resolve independently).
 *   - `designer-portal/document/people/person` — the person card: the
 *     "Editing someone's details" helpArticle, rewritten for the CRM card
 *     (account holders self-manage; Reach & access; recording consent with
 *     evidence; minting and revoking a link; the contact rule; authority on
 *     a seat), plus tooltips for Record consent, Mint access, and authority
 *     on a seat.
 *   - `designer-portal/document/people/firm`   — the company card (NEW
 *     canonical key, mirrored in `packages/help-system/src/surfaceKeys.ts`
 *     → `DesignerPortal.Document.PeopleFirm` and the app-side mirror): a
 *     fieldHelper intro plus tooltips for the three crew designations and
 *     the firm's own Paper region.
 *   - `designer-portal/document/call-sheet/site-access` — the site access
 *     card (NEW canonical key → `CallSheetSiteAccess`): a fieldHelper intro
 *     plus a tooltip for the "who was told" notice band.
 *   - `designer-portal/document/call-sheet/bring-forward` — the rolodex
 *     picker's travel-list state (NEW canonical key →
 *     `CallSheetBringForward`): a fieldHelper intro.
 *
 * The six word/concept tooltip surfaceKeys (word/reach, word/consent,
 * word/paper, contact-rule, lens, chips under `.../people`, and
 * person/consent, person/access-grant, person/authority under
 * `.../people/person`, and firm/designations, firm/paper under
 * `.../people/firm`, and call-sheet/site-access/told) are regex-valid
 * sub-paths of the five surfaces above but are NOT promoted to named
 * constants in `packages/help-system/src/surfaceKeys.ts` — this wave's
 * scope named exactly three new registry keys (PeopleFirm,
 * CallSheetSiteAccess, CallSheetBringForward). Promoting the finer-grained
 * concept keys to the registry (à la Inbox's `Concept.Channel` pattern) is
 * a follow-up, not a blocker: every consumer resolves by the literal string
 * either way.
 *
 * Voice (Studio, per CLAUDE.md / patina-brand-voice): plain, sentence case,
 * no schema words (no `channels_forbidden`, `studio_verdict`, etc. on any
 * face). Caps respected: tooltip/fieldHelper body ≤160, empty heading ≤50,
 * empty description ≤300 (schema validation) — verified programmatically
 * against this file's JSON sibling before commit.
 */
import rawDocs from './people-help-content.json'

export interface HelpArticleBlock {
  _type: 'block' | 'image'
  _key: string
  style?: string
  markDefs?: unknown[]
  children?: Array<{ _type: 'span'; _key: string; text: string; marks?: string[] }>
}

export interface HelpContentSeedDoc {
  _id: string
  _type: 'helpContent'
  surfaceKey: string
  persona: 'all'
  contentType: 'tooltip' | 'fieldHelper' | 'emptyState' | 'helpArticle'
  tooltipContent?: { eyebrow?: string; body: string }
  emptyStateContent?: {
    icon?: string
    heading: string
    description: string
    primaryActionLabel?: string
    secondaryActionLabel?: string
    secondaryActionArticleKey?: string
  }
  helpArticleContent?: {
    eyebrow?: string
    title: string
    oneSentenceAnswer: string
    body: HelpArticleBlock[]
  }
}

export const PEOPLE_HELP_DOCS: HelpContentSeedDoc[] = rawDocs as HelpContentSeedDoc[]
