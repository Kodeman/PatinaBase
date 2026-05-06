import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { PaintColorPicker, type PaintColorOption } from './PaintColorPicker'

const meta = {
  title: 'Pickers/PaintColorPicker',
  component: PaintColorPicker,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof PaintColorPicker>

export default meta
type Story = StoryObj<typeof meta>

// ─── Mock catalog used by stories ─────────────────────────────────────────────

const MOCK_CATALOG: PaintColorOption[] = [
  { id: '1', brand: 'sherwin_williams', code: 'SW7008', name: 'Alabaster',         hex: '#EDEAE0' },
  { id: '2', brand: 'sherwin_williams', code: 'SW6204', name: 'Sea Salt',          hex: '#CDD3C8' },
  { id: '3', brand: 'sherwin_williams', code: 'SW7016', name: 'Mindful Gray',      hex: '#BDB6AB' },
  { id: '4', brand: 'benjamin_moore',   code: 'OC-17',  name: 'White Dove',        hex: '#EDE8DA' },
  { id: '5', brand: 'benjamin_moore',   code: 'HC-172', name: 'Revere Pewter',     hex: '#C6BCAA' },
  { id: '6', brand: 'farrow_ball',      code: '9',      name: 'Off-White',         hex: '#E0DBCB' },
  { id: '7', brand: 'farrow_ball',      code: '228',    name: 'Cornforth White',   hex: '#C8C3B8' },
  { id: '8', brand: 'pantone_tpg',      code: '11-0601',name: 'Bright White',      hex: '#F4F5F0' },
  { id: '9', brand: 'pantone_tpg',      code: '14-4318',name: 'Hawaiian Ocean',    hex: '#5BB0CA' },
]

const handleSearch = async (query: string, brand?: string): Promise<PaintColorOption[]> => {
  const q = query.toLowerCase().trim()
  return MOCK_CATALOG.filter((c) => {
    if (brand && c.brand !== brand) return false
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.brand.toLowerCase().includes(q)
    )
  })
}

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Empty: Story = {
  args: {
    value: null,
    onChange: () => {},
    onSearch: handleSearch,
  },
  render: function Render(args) {
    const [value, setValue] = React.useState<PaintColorOption | null>(null)
    return (
      <div style={{ width: 360 }}>
        <PaintColorPicker {...args} value={value} onChange={setValue} />
      </div>
    )
  },
}

export const WithSelection: Story = {
  args: {
    value: MOCK_CATALOG[0],
    onChange: () => {},
    onSearch: handleSearch,
  },
  render: function Render(args) {
    const [value, setValue] = React.useState<PaintColorOption | null>(args.value ?? null)
    return (
      <div style={{ width: 360 }}>
        <PaintColorPicker {...args} value={value} onChange={setValue} />
      </div>
    )
  },
}

export const RestrictedToBenjaminMoore: Story = {
  args: {
    value: null,
    onChange: () => {},
    onSearch: handleSearch,
    brands: ['benjamin_moore'],
  },
  render: function Render(args) {
    const [value, setValue] = React.useState<PaintColorOption | null>(null)
    return (
      <div style={{ width: 360 }}>
        <PaintColorPicker {...args} value={value} onChange={setValue} />
      </div>
    )
  },
}
