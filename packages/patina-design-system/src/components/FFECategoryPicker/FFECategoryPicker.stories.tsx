import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { FFECategoryPicker, type FFECategoryOption } from './FFECategoryPicker'

const meta: Meta<typeof FFECategoryPicker> = {
  title: 'Designer Portal/FFECategoryPicker',
  component: FFECategoryPicker,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Multi-select picker for FF&E categories. Renders selected slugs as removable chips and opens a searchable popover. Supports inline custom-category creation when `allowCustom` is set. The component is purely presentational — it does no data fetching of its own.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof FFECategoryPicker>

const SYSTEM_CATEGORIES: FFECategoryOption[] = [
  { slug: 'seating', label: 'Seating', icon: 'armchair', isCustom: false },
  { slug: 'tables', label: 'Tables', icon: 'table', isCustom: false },
  { slug: 'lighting', label: 'Lighting', icon: 'lamp', isCustom: false },
  { slug: 'storage', label: 'Storage', icon: 'archive', isCustom: false },
  { slug: 'soft_goods', label: 'Soft Goods', icon: 'layers', isCustom: false },
  { slug: 'window_treatments', label: 'Window Treatments', icon: 'blinds', isCustom: false },
  { slug: 'rugs', label: 'Rugs', icon: 'square-asterisk', isCustom: false },
  { slug: 'art', label: 'Art', icon: 'image', isCustom: false },
  { slug: 'accessories', label: 'Accessories', icon: 'gem', isCustom: false },
]

export const Default: Story = {
  render: function DefaultStory() {
    const [value, setValue] = useState<string[]>([])
    return (
      <div className="w-[480px]">
        <FFECategoryPicker value={value} onChange={setValue} categories={SYSTEM_CATEGORIES} />
      </div>
    )
  },
}

export const WithSelection: Story = {
  render: function WithSelectionStory() {
    const [value, setValue] = useState<string[]>(['seating', 'lighting', 'rugs'])
    return (
      <div className="w-[480px]">
        <FFECategoryPicker value={value} onChange={setValue} categories={SYSTEM_CATEGORIES} />
      </div>
    )
  },
}

export const SystemAndCustomMix: Story = {
  render: function MixStory() {
    const [value, setValue] = useState<string[]>(['seating', 'art_glass'])
    const categories: FFECategoryOption[] = [
      ...SYSTEM_CATEGORIES,
      { slug: 'art_glass', label: 'Art Glass', isCustom: true },
      { slug: 'built_ins', label: 'Built-Ins', isCustom: true },
    ]
    return (
      <div className="w-[480px]">
        <FFECategoryPicker value={value} onChange={setValue} categories={categories} />
      </div>
    )
  },
}

export const WithCustomCreation: Story = {
  render: function CustomCreationStory() {
    const [categories, setCategories] = useState<FFECategoryOption[]>(SYSTEM_CATEGORIES)
    const [value, setValue] = useState<string[]>(['lighting'])

    const handleCreate = async (label: string) => {
      const slug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
      const next: FFECategoryOption = { slug, label, isCustom: true }
      // Simulate the round-trip latency the real hook would have.
      await new Promise((r) => setTimeout(r, 250))
      setCategories((prev) => [...prev, next])
      return { slug }
    }

    return (
      <div className="w-[480px] space-y-3">
        <FFECategoryPicker
          value={value}
          onChange={setValue}
          categories={categories}
          allowCustom
          onCreateCustom={handleCreate}
          scope="proposal"
        />
        <p className="text-xs text-muted-foreground">
          Type a name not in the list (e.g. <em>Casework</em>) and use the &ldquo;+ Add&rdquo; affordance.
        </p>
      </div>
    )
  },
}

export const Disabled: Story = {
  render: function DisabledStory() {
    return (
      <div className="w-[480px]">
        <FFECategoryPicker
          value={['seating', 'lighting']}
          onChange={() => undefined}
          categories={SYSTEM_CATEGORIES}
          disabled
        />
      </div>
    )
  },
}
