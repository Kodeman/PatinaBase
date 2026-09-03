import { defineType, defineField } from "sanity";

/**
 * videoContent — standalone document type for Layer 4 (Reference) video
 * walkthroughs hosted on Cloudflare Stream (decision 14,
 * artifacts/designer-onboarding-learning-2026-09-03/synthesis/decisions.md).
 *
 * `streamUid` is the Cloudflare Stream video id — `VideoPlayer` renders it as
 * `https://iframe.videodelivery.net/<streamUid>`. This schema is wired ahead
 * of any recordings existing (decision 14: "after Wave 1"); the studio ships
 * it with zero docs until Kody records the first video.
 */
export default defineType({
  name: "videoContent",
  title: "Video Content",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required().max(80),
    }),
    defineField({
      name: "streamUid",
      title: "Cloudflare Stream UID",
      type: "string",
      description:
        "The video id from Cloudflare Stream — rendered as https://iframe.videodelivery.net/<streamUid>",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "surfaceKey",
      title: "Surface Key",
      type: "string",
      description:
        'Must match a key from @patina/help-system/surfaceKeys — e.g. "designer-portal/pipeline/project-list"',
      validation: (Rule) =>
        Rule.required().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/, {
          name: "surface-key-format",
          invert: false,
        }),
    }),
    defineField({
      name: "persona",
      title: "Persona",
      type: "string",
      options: {
        list: [
          { title: "Designer", value: "designer" },
          { title: "Maker / Manufacturer", value: "maker" },
          { title: "Consumer", value: "consumer" },
          { title: "Admin", value: "admin" },
          { title: "All", value: "all" },
        ],
      },
      initialValue: "all",
    }),
    defineField({
      name: "durationSeconds",
      title: "Duration (seconds)",
      type: "number",
      validation: (Rule) => Rule.required().positive().integer(),
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "surfaceKey",
    },
  },
});
