import { defineType, defineField } from 'sanity'

/**
 * helpContent — the base document type for all Help & Guidance System entries.
 *
 * Design note: The spec describes type-specific sub-document fields as
 * conditionally shown. Rather than using cross-document references (which
 * would require two-step authoring — first create a tooltip doc, then link it),
 * this schema uses inline conditional objects. This keeps all content for a
 * given surface key in one document, which matches the `useHelpContent` hook's
 * single-query fetching pattern and dramatically simplifies the GROQ queries
 * in task A5. Content editors fill in only the fields relevant to the chosen
 * contentType; all other type blocks are hidden via Sanity's `hidden` callback.
 */
export default defineType({
  name: 'helpContent',
  title: 'Help Content',
  type: 'document',
  fields: [
    defineField({
      name: 'surfaceKey',
      title: 'Surface Key',
      type: 'string',
      description:
        'Must match a key from @patina/help-system/surfaceKeys — e.g. "designer-portal/pipeline/project-list"',
      validation: (Rule) =>
        Rule.required().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/, {
          name: 'surface-key-format',
          invert: false,
        }),
    }),
    defineField({
      name: 'persona',
      title: 'Persona',
      type: 'string',
      options: {
        list: [
          { title: 'Designer', value: 'designer' },
          { title: 'Maker / Manufacturer', value: 'maker' },
          { title: 'Consumer', value: 'consumer' },
          { title: 'Admin', value: 'admin' },
          { title: 'All', value: 'all' },
        ],
      },
      initialValue: 'all',
    }),
    defineField({
      name: 'contentType',
      title: 'Content Type',
      type: 'string',
      options: {
        list: [
          { title: 'Tooltip', value: 'tooltip' },
          { title: 'Field Helper', value: 'fieldHelper' },
          { title: 'Empty State', value: 'emptyState' },
          { title: 'Learn More', value: 'learnMore' },
          { title: 'Coachmark', value: 'coachmark' },
          { title: 'Help Article', value: 'helpArticle' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),

    // ── Tooltip fields (shown when contentType === 'tooltip' or 'fieldHelper' or 'learnMore' or 'coachmark') ──
    // Tooltip, fieldHelper, learnMore, and coachmark all share the same
    // lightweight copy structure (eyebrow + body). The consuming hook
    // distinguishes rendering; the schema does not need separate sub-types
    // for these very similar variants.
    defineField({
      name: 'tooltipContent',
      title: 'Tooltip / Field Helper / Coachmark Content',
      type: 'object',
      hidden: ({ document }) =>
        !['tooltip', 'fieldHelper', 'learnMore', 'coachmark'].includes(
          (document?.contentType as string) ?? ''
        ),
      fields: [
        defineField({
          name: 'eyebrow',
          title: 'Eyebrow Label',
          type: 'string',
          description: 'Optional uppercase label, e.g., "What this means"',
        }),
        defineField({
          name: 'body',
          title: 'Body Text',
          type: 'text',
          rows: 3,
          validation: (Rule) => Rule.required().max(160),
        }),
      ],
    }),

    // ── Empty State fields ──
    defineField({
      name: 'emptyStateContent',
      title: 'Empty State Content',
      type: 'object',
      hidden: ({ document }) => (document?.contentType as string) !== 'emptyState',
      fields: [
        defineField({
          name: 'icon',
          title: 'Typographic Icon',
          type: 'string',
          description: '◇ ◉ ▣ ◎ ⌕ ⌂ ★ ◈ — use these only',
        }),
        defineField({
          name: 'heading',
          title: 'Heading',
          type: 'string',
          validation: (Rule) => Rule.required().max(50),
        }),
        defineField({
          name: 'description',
          title: 'Description',
          type: 'text',
          rows: 3,
          validation: (Rule) => Rule.required().max(300),
        }),
        defineField({
          name: 'primaryActionLabel',
          title: 'Primary CTA Label',
          type: 'string',
        }),
        defineField({
          name: 'secondaryActionLabel',
          title: 'Secondary Action Label',
          type: 'string',
        }),
        defineField({
          name: 'secondaryActionArticleKey',
          title: 'Linked Article Key',
          type: 'string',
        }),
      ],
    }),

    // ── Help Article fields ──
    defineField({
      name: 'helpArticleContent',
      title: 'Help Article Content',
      type: 'object',
      hidden: ({ document }) => (document?.contentType as string) !== 'helpArticle',
      fields: [
        defineField({
          name: 'eyebrow',
          title: 'Eyebrow',
          type: 'string',
        }),
        defineField({
          name: 'title',
          title: 'Title (the question)',
          type: 'string',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'oneSentenceAnswer',
          title: 'One-Sentence Answer',
          type: 'text',
          rows: 2,
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'body',
          title: 'Body',
          type: 'array',
          of: [{ type: 'block' }, { type: 'image' }],
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'wordCount',
          title: 'Word Count',
          type: 'number',
          readOnly: true,
          description: 'Auto-calculated on save. Should be under 600.',
        }),
        defineField({
          name: 'readingTimeMinutes',
          title: 'Reading Time (min)',
          type: 'number',
          readOnly: true,
        }),
        defineField({
          name: 'lastUpdated',
          title: 'Last Updated',
          type: 'date',
          readOnly: true,
        }),
        defineField({
          name: 'relatedArticles',
          title: 'Related Articles',
          type: 'array',
          of: [{ type: 'reference', to: [{ type: 'helpContent' }] }],
        }),
        defineField({
          name: 'videoUrl',
          title: 'Optional Video URL',
          type: 'url',
        }),
      ],
    }),
  ],

  preview: {
    select: {
      title: 'surfaceKey',
      subtitle: 'contentType',
    },
    prepare({ title, subtitle }) {
      return {
        title: title ?? '(no surface key)',
        subtitle: subtitle ?? '',
      }
    },
  },
})
