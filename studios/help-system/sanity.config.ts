import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemas'

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
})
