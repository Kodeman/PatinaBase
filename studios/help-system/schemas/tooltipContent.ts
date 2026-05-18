import { defineType, defineField } from 'sanity'

/**
 * tooltipContent — standalone document type for tooltip content.
 *
 * This schema exists as a named type so it can be reused in migrations
 * or extended in the future (e.g., adding locale fields). The primary
 * authoring path uses the inline `tooltipContent` object inside
 * `helpContent` documents; this top-level type is available for editors
 * who prefer a dedicated list view or for future cross-referencing.
 */
export default defineType({
  name: 'tooltipContent',
  title: 'Tooltip Content',
  type: 'document',
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

  preview: {
    select: {
      title: 'body',
      subtitle: 'eyebrow',
    },
    prepare({ title, subtitle }) {
      return {
        title: title ? String(title).slice(0, 60) : '(no body)',
        subtitle: subtitle ?? '',
      }
    },
  },
})
