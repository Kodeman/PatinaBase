import { defineType, defineField } from 'sanity'

/**
 * coachmarkContent — standalone document type for coachmark content
 * (Sprint 4 Task S4-4).
 *
 * Sprint 3 reused `tooltipContent.eyebrow` as the visual heading and
 * `tooltipContent.body` as the card body for coachmarks. That worked for
 * the first authoring pass, but the iOS + web `CoachmarkContent` types
 * model a richer shape — heading, body, and an optional ctaLabel —
 * which the shared tooltip payload cannot express.
 *
 * This dedicated type pairs with the inline `coachmarkContent` object on
 * `helpContent` (see helpContent.ts) and exists as a top-level type for
 * dedicated list views and future cross-referencing, matching the pattern
 * used by `tooltipContent` and `emptyStateContent`.
 *
 * Field caps follow spec §8 (coachmark copy):
 *   - heading ≤ 60 chars (single line, sentence case)
 *   - body    ≤ 120 chars (one or two short sentences)
 *   - ctaLabel ≤ 20 chars (e.g. "Next", "Got it", "Start tour")
 *
 * Caps are advisory `warning` rules so authors see the over-length call out
 * in the Studio UI without being blocked.
 */
export default defineType({
  name: 'coachmarkContent',
  title: 'Coachmark Content',
  type: 'document',
  fields: [
    defineField({
      name: 'heading',
      title: 'Heading',
      type: 'string',
      description: 'Card heading — short, sentence case (≤ 60 chars).',
      validation: (Rule) =>
        Rule.required()
          .max(60)
          .warning('Coachmark headings should be short — under 60 characters.'),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      rows: 2,
      description: 'One or two short sentences (spec §8 caps at 120 chars).',
      validation: (Rule) =>
        Rule.required()
          .max(120)
          .warning(
            'Coachmark bodies should be brief — under 120 characters per spec §8.',
          ),
    }),
    defineField({
      name: 'ctaLabel',
      title: 'CTA Button Label',
      type: 'string',
      description:
        'Optional CTA label override, e.g. "Next", "Got it", "Start tour". When omitted the component falls back to "Next".',
      validation: (Rule) =>
        Rule.max(20).warning('CTA labels should be terse — under 20 characters.'),
    }),
  ],

  preview: {
    select: {
      title: 'heading',
      subtitle: 'body',
    },
    prepare({ title, subtitle }) {
      return {
        title: title ?? '(no heading)',
        subtitle: subtitle ? String(subtitle).slice(0, 60) : '',
      }
    },
  },
})
