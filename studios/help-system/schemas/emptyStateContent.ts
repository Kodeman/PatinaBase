import { defineType, defineField } from 'sanity'

/**
 * emptyStateContent — standalone document type for empty-state content.
 *
 * Same reasoning as tooltipContent: exists as a named top-level type for
 * dedicated list views and future extensibility, while the primary authoring
 * path uses the inline `emptyStateContent` object inside `helpContent` docs.
 */
export default defineType({
  name: 'emptyStateContent',
  title: 'Empty State Content',
  type: 'document',
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

  preview: {
    select: {
      title: 'heading',
      subtitle: 'description',
    },
    prepare({ title, subtitle }) {
      return {
        title: title ?? '(no heading)',
        subtitle: subtitle ? String(subtitle).slice(0, 60) : '',
      }
    },
  },
})
