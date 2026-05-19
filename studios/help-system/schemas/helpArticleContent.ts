import { defineType, defineField } from 'sanity'

/**
 * helpArticleContent — standalone document type for long-form help articles.
 *
 * Articles are rendered in the Contextual Help Panel slide-out and may
 * be linked from empty states via `secondaryActionArticleKey`. The `wordCount`
 * and `readingTimeMinutes` fields are marked readOnly; they are intended to be
 * auto-populated by a Sanity webhook or a client-side document action that
 * counts tokens in the `body` portable text array on save. The `lastUpdated`
 * date is also readOnly — set by the same automation so content reviewers
 * always know the staleness of an article.
 *
 * Same top-level vs. inline trade-off as the other types: the inline object
 * inside `helpContent` is the primary authoring path; this type exists for
 * dedicated list views.
 */
export default defineType({
  name: 'helpArticleContent',
  title: 'Help Article Content',
  type: 'document',
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
      // Auto-calculated by a Sanity document action or webhook on save.
      // Aim for under 600 words (spec §8.2). If this field is missing,
      // the consuming component should fall back to estimating from body length.
      description: 'Auto-calculated. Should be under 600.',
    }),
    defineField({
      name: 'readingTimeMinutes',
      title: 'Reading Time (min)',
      type: 'number',
      readOnly: true,
      // Derived from wordCount at 200 words/minute (average adult reading speed).
      // Auto-calculated alongside wordCount.
    }),
    defineField({
      name: 'lastUpdated',
      title: 'Last Updated',
      type: 'date',
      readOnly: true,
      // Set automatically when content is published. Used to surface
      // "Last updated X days ago" in the Contextual Help Panel footer.
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

  preview: {
    select: {
      title: 'title',
      subtitle: 'oneSentenceAnswer',
    },
    prepare({ title, subtitle }) {
      return {
        title: title ?? '(no title)',
        subtitle: subtitle ? String(subtitle).slice(0, 80) : '',
      }
    },
  },
})
