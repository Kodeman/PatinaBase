import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemas'

// Only these Sanity user ids may publish teaching notes and releases; a draft is
// the awaiting-review state. This hides the Studio button, it is not an API guard.
const TEACHING_TYPES = ['teachingNote', 'teachingRelease']
const publisherIds = (process.env.SANITY_STUDIO_PUBLISHER_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)

if (publisherIds.length === 0) {
  console.warn('teaching notes: SANITY_STUDIO_PUBLISHER_IDS unset; Publish is open')
}

export default defineConfig({
  name: 'help-system',
  title: 'Patina Help System',
  projectId: 'kv3qrinl',
  dataset: 'production',
  basePath: '/help-system',
  plugins: [structureTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
  document: {
    actions: (prev, context) =>
      publisherIds.length === 0 ||
      !TEACHING_TYPES.includes(context.schemaType) ||
      publisherIds.includes(context.currentUser?.id ?? '')
        ? prev
        : prev.filter((action) => action.action !== 'publish'),
  },
})
