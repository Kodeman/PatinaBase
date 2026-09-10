/**
 * F3 — "Editing someone's details" help content (authored copy).
 *
 * Typed view over `people-editing-details-help-content.json`, mirroring the
 * `decisions-help-content.ts` pattern so this one entry never drifts from a
 * hand-authored JSON copy. Document shape mirrors
 * `studios/help-system/schemas/helpContent.ts`'s `helpArticle` branch (nested
 * `helpArticleContent: { title, oneSentenceAnswer, body }`) — the content is
 * a helpArticle, not a tooltip (F3-R2-04: no People-room component renders a
 * tooltip bound to this surfaceKey, and ContextualHelpPanel's ARTICLES_QUERY
 * only ever matches contentType == "helpArticle").
 *
 * Surface: `designer-portal/document/people` (DOCUMENT_SURFACE_KEYS.people in
 * `apps/designer-portal/src/lib/help-system/document-surface-keys.ts`) — the
 * People room as a whole, since editing an entry is something every person
 * kind on the roster can reach for, not one sub-view of it.
 *
 * Voice (Patina, plain and warm): what to do, then the one exception worth
 * knowing (a profile-holding person manages their own name/email/phone).
 */
import rawDocs from './people-editing-details-help-content.json'

export interface HelpContentSeedDoc {
  _id: string
  _type: 'helpContent'
  surfaceKey: string
  persona: 'all'
  contentType: 'helpArticle'
  helpArticleContent: {
    title: string
    oneSentenceAnswer: string
    body: unknown[]
  }
}

export const PEOPLE_EDITING_DETAILS_HELP_DOCS: HelpContentSeedDoc[] =
  rawDocs as HelpContentSeedDoc[]
