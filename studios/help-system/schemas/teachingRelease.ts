import { defineType, defineField, defineArrayMember } from 'sanity'
import { featureKeyOptions } from './teachingNote'

/**
 * teachingRelease — the changes-page copy for one release. The release itself
 * lives in apps/designer-portal/src/content/teaching-releases.ts; this doc
 * renders only when its `id` is in that manifest and the doc is published
 * (system-architecture.md §1.2).
 */
export default defineType({
  name: 'teachingRelease',
  title: 'Teaching Release',
  type: 'document',
  fields: [
    defineField({
      name: 'id',
      title: 'Release ID',
      type: 'string',
      description: 'Same id as the manifest entry, e.g. "2026-09-25-galley-po".',
      validation: (Rule) =>
        Rule.required().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/, {
          name: 'release-id-format',
          invert: false,
        }),
    }),
    defineField({
      name: 'headline',
      title: 'Headline',
      type: 'string',
      validation: (Rule) => Rule.max(90),
    }),
    defineField({
      name: 'prose',
      title: 'Prose',
      type: 'text',
    }),
    defineField({
      name: 'sizeClass',
      title: 'Size Class',
      type: 'string',
      options: {
        list: [
          { title: 'Minor', value: 'minor' },
          { title: 'Useful', value: 'useful' },
          { title: 'Workflow changing', value: 'workflow_changing' },
        ],
      },
    }),
    defineField({
      name: 'shippedOn',
      title: 'Shipped On',
      type: 'string',
      description: 'ISO date, e.g. 2026-09-25.',
      validation: (Rule) => Rule.regex(/^\d{4}-\d{2}-\d{2}$/, { name: 'iso-date', invert: false }),
    }),
    defineField({
      name: 'featureKeys',
      title: 'Feature Keys',
      type: 'array',
      of: [defineArrayMember({ type: 'string' })],
      options: { list: featureKeyOptions },
    }),
  ],
  preview: {
    select: { title: 'headline', subtitle: 'id' },
  },
})
