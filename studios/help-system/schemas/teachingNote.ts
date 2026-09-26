import { defineType, defineField, defineArrayMember } from 'sanity'

/**
 * teachingNote — one Workshop Note (return teaching). Fields follow
 * artifacts/return-teaching-2026-09-25/design/system-architecture.md §1.1.
 *
 * Drafts are the awaiting-review state: the portal reads only the published
 * perspective, and Publish is limited to SANITY_STUDIO_PUBLISHER_IDS
 * (sanity.config.ts).
 */

// Enum values are shared with migration 00673 and the content seed.
export const featureKeyOptions = [
  { title: 'Galley', value: 'galley' },
  { title: 'Ledger', value: 'ledger' },
  { title: 'Hours', value: 'hours' },
  { title: 'People', value: 'people' },
  { title: 'Field capture', value: 'field_capture' },
  { title: 'Client page', value: 'client_page' },
  { title: 'Purchase orders', value: 'purchase_orders' },
  { title: 'Seats', value: 'seats' },
]

const NOTE_KEY = /^[a-z0-9-]+@\d+$/
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

type TeachingNoteFields = {
  kind?: string
  trigger?: string
  releaseId?: string
  flag?: string
  boundary?: string
}

export default defineType({
  name: 'teachingNote',
  title: 'Teaching Note',
  type: 'document',
  fields: [
    defineField({
      name: 'noteKey',
      title: 'Note Key',
      type: 'string',
      description: 'Versioned key, e.g. "galley-po@1". Bump the version to re-arm the note once.',
      validation: (Rule) =>
        Rule.required().regex(NOTE_KEY, { name: 'note-key-format', invert: false }),
    }),
    defineField({
      name: 'kind',
      title: 'Kind',
      type: 'string',
      options: {
        list: [
          { title: 'Release', value: 'release' },
          { title: 'Unused benefit', value: 'unused_benefit' },
          { title: 'Faster way', value: 'faster_way' },
          { title: 'Owner capability', value: 'owner_capability' },
          { title: 'Client promise', value: 'client_promise' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'audience',
      title: 'Audience',
      type: 'string',
      options: {
        list: [
          { title: 'Owner', value: 'owner' },
          { title: 'Hand', value: 'hand' },
          { title: 'All', value: 'all' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'trigger',
      title: 'Trigger',
      type: 'string',
      options: {
        list: [
          { title: 'Return', value: 'return' },
          { title: 'Anchor', value: 'anchor' },
          { title: 'Act', value: 'act' },
          { title: 'Pull only', value: 'pull_only' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'surfaceKey',
      title: 'Surface Key',
      type: 'string',
      description:
        'Must match a key from @patina/help-system/surfaceKeys — e.g. "designer-portal/document/accounts"',
      validation: (Rule) =>
        Rule.required().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/, {
          name: 'surface-key-format',
          invert: false,
        }),
    }),
    defineField({
      name: 'anchor',
      title: 'Anchor',
      type: 'string',
      description: 'Optional DocumentActionGroup regionKey inside the surface.',
    }),
    defineField({
      name: 'releaseId',
      title: 'Release ID',
      type: 'string',
      description: 'Must match a teaching-releases.ts manifest entry. Required when kind is Release.',
    }),
    defineField({
      name: 'flag',
      title: 'PostHog Flag',
      type: 'string',
      description: 'A flag that is loading or off makes the note ineligible.',
    }),
    defineField({
      name: 'featureKey',
      title: 'Feature Key',
      type: 'string',
      options: { list: featureKeyOptions },
    }),
    defineField({
      name: 'boundary',
      title: 'Boundary',
      type: 'string',
      description: 'The completion act the note waits for. Required for Anchor and Faster way notes.',
      options: {
        list: [
          { title: 'Invoice sent', value: 'invoice_sent' },
          { title: 'Time logged', value: 'time_logged' },
          { title: 'Part saved', value: 'part_saved' },
          { title: 'Invite sent', value: 'invite_sent' },
          { title: 'Client page sent', value: 'client_page_sent' },
        ],
      },
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      rows: 2,
      description: 'One sentence of outcome. May carry {binding} tokens.',
      validation: (Rule) => Rule.max(140).required(),
    }),
    defineField({
      name: 'act',
      title: 'Act',
      type: 'object',
      description: 'Optional single act. Both parts may carry {binding} tokens.',
      fields: [
        defineField({ name: 'label', title: 'Label', type: 'string' }),
        defineField({ name: 'hrefTemplate', title: 'Href Template', type: 'string' }),
      ],
    }),
    defineField({
      name: 'bindings',
      title: 'Bindings',
      type: 'array',
      description: 'Token → source. A binding that cannot resolve makes the note ineligible.',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'binding',
          fields: [
            defineField({
              name: 'token',
              title: 'Token',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'source',
              title: 'Source',
              type: 'string',
              options: {
                list: [
                  { title: 'Project name', value: 'projectName' },
                  { title: 'Person name', value: 'personName' },
                  { title: 'Invoice number', value: 'invoiceNumber' },
                  { title: 'Invoice ID', value: 'invoiceId' },
                ],
              },
              validation: (Rule) => Rule.required(),
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'successSignal',
      title: 'Success Signal',
      type: 'string',
      description: 'The teaching_signals() instant that proves the downstream task happened.',
      options: {
        list: [
          { title: 'Agreement signed unrevised', value: 'agreement_signed_unrevised' },
          { title: 'Invoice line from time', value: 'invoice_line_from_time' },
          { title: 'Time entry field visit', value: 'time_entry_field_visit' },
          { title: 'Invoice line from member time', value: 'invoice_line_from_member_time' },
          { title: 'Invite with handoff note', value: 'invite_with_handoff_note' },
        ],
      },
    }),
    defineField({
      name: 'successEvent',
      title: 'Success Event',
      type: 'string',
      description: 'PostHog event for the downstream outcome, never the note’s own act.',
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'number',
      description: 'Tie-break only (1–5).',
      validation: (Rule) => Rule.integer().min(1).max(5),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'string',
      description: 'ISO 8601 datetime, e.g. 2026-09-25T14:00:00Z.',
      validation: (Rule) => Rule.regex(ISO_DATETIME, { name: 'iso-datetime', invert: false }),
    }),
    defineField({
      name: 'expiresAt',
      title: 'Expires At',
      type: 'string',
      description: 'Optional ISO 8601 datetime. After this, the note is not eligible.',
      validation: (Rule) => Rule.regex(ISO_DATETIME, { name: 'iso-datetime', invert: false }),
    }),
    defineField({
      name: 'recedeOn',
      title: 'Recede On',
      type: 'array',
      description: 'Window CustomEvent names that recede the note.',
      of: [defineArrayMember({ type: 'string' })],
    }),
    defineField({
      name: 'maxDisplays',
      title: 'Max Displays',
      type: 'number',
      initialValue: 3,
      validation: (Rule) => Rule.integer().min(1),
    }),
    defineField({
      name: 'prerequisite',
      title: 'Prerequisite',
      type: 'string',
      description: 'noteKey of a note that must be seen first.',
      validation: (Rule) => Rule.regex(NOTE_KEY, { name: 'note-key-format', invert: false }),
    }),
    defineField({
      name: 'supersedes',
      title: 'Supersedes',
      type: 'string',
      description: 'noteKey of the note this one replaces.',
      validation: (Rule) => Rule.regex(NOTE_KEY, { name: 'note-key-format', invert: false }),
    }),
    defineField({
      name: 'learnMore',
      title: 'Learn More',
      type: 'reference',
      to: [{ type: 'helpContent' }],
      description: 'Optional help article.',
    }),
    defineField({
      name: 'provenance',
      title: 'Provenance',
      type: 'string',
      options: {
        list: [
          { title: 'Agent', value: 'agent' },
          { title: 'Leah', value: 'leah' },
        ],
      },
    }),
  ],
  validation: (Rule) =>
    Rule.custom((doc) => {
      const note = (doc ?? {}) as TeachingNoteFields
      if (note.kind === 'release' && !note.releaseId) {
        return 'A release note requires a Release ID.'
      }
      if (note.kind !== 'release' && !note.flag && !note.releaseId) {
        return 'A non-release note requires a PostHog Flag or a Release ID.'
      }
      if ((note.trigger === 'anchor' || note.kind === 'faster_way') && !note.boundary) {
        return 'Anchor and Faster way notes require a Boundary.'
      }
      return true
    }),
  preview: {
    select: { title: 'noteKey', subtitle: 'body' },
  },
})
