import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import type { EditableMoodBoardItem, MoodBoardSection } from '@patina/types'
import { MOOD_BOARD_GOLDEN_FIXTURE } from '../../mood-board'
import { BoardRoomCanvas, type BoardItemsMovedCommit } from './BoardRoomCanvas'

const meta: Meta<typeof BoardRoomCanvas> = {
  title: 'Mood Board/BoardRoomCanvas',
  component: BoardRoomCanvas,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: '100dvh', minHeight: 620 }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof BoardRoomCanvas>

const goldenItems: EditableMoodBoardItem[] =
  MOOD_BOARD_GOLDEN_FIXTURE.items.map((item, index) => ({
    ...item,
    id: item.id ?? `snapshot-${index}`,
  }))

function Pin({ item }: { item: EditableMoodBoardItem }) {
  const name =
    typeof item.data?.name === 'string'
      ? item.data.name
      : item.type.replace('_', ' ')
  if (item.type === 'note') {
    return (
      <div className="h-full rounded-sm border border-[#e0d2b8] bg-[#f3e9d5] p-3 text-sm text-[#4a4137]">
        {item.content}
      </div>
    )
  }
  if (item.type === 'palette') {
    const swatches = Array.isArray(item.data?.swatches)
      ? item.data.swatches
      : []
    return (
      <div className="flex h-full overflow-hidden rounded-sm border border-black/10 bg-white">
        {swatches.map((swatch, index) => (
          <div
            key={index}
            className="flex-1"
            style={{
              background: typeof swatch.hex === 'string' ? swatch.hex : '#ddd',
            }}
          />
        ))}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-sm border border-black/10 bg-white">
      <div className="min-h-0 flex-1 bg-gradient-to-br from-[#e9e0d5] to-[#c9b6a4]" />
      <div className="p-2 text-xs text-[#493f36]">{name}</div>
    </div>
  )
}

function ControlledRoom({
  initialItems,
  sections = [],
  initialSelection = [],
}: {
  initialItems: EditableMoodBoardItem[]
  sections?: MoodBoardSection[]
  initialSelection?: string[]
}) {
  const [items, setItems] = React.useState(initialItems)
  const [selection, setSelection] = React.useState(initialSelection)
  const handleMoved = (commit: BoardItemsMovedCommit) => {
    const patches = new Map(commit.after.map((item) => [item.id, item]))
    setItems((current) =>
      current.map((item) => ({ ...item, ...(patches.get(item.id) ?? {}) })),
    )
  }
  return (
    <BoardRoomCanvas
      boardName="Golden Living Room"
      items={items}
      sections={sections}
      selectedItemIds={selection}
      onSelectionChange={setSelection}
      onItemsMoved={handleMoved}
      renderItem={(item) => <Pin item={item} />}
      showGrid
      snapToGrid
      defaultView={{ pan: { x: 56, y: 56 }, zoom: 0.72 }}
    />
  )
}

export const EmptyBoard: Story = {
  render: () => <ControlledRoom initialItems={[]} />,
}

export const Sections: Story = {
  render: () => (
    <ControlledRoom
      initialItems={goldenItems}
      sections={MOOD_BOARD_GOLDEN_FIXTURE.sections}
    />
  ),
}

export const RotatedItems: Story = {
  render: () => (
    <ControlledRoom
      initialItems={goldenItems.map((item, index) => ({
        ...item,
        rotation: item.rotation ?? (index - 2) * 8,
      }))}
    />
  ),
}

export const MultiSelectionWithHandles: Story = {
  render: () => (
    <ControlledRoom
      initialItems={goldenItems}
      sections={MOOD_BOARD_GOLDEN_FIXTURE.sections}
      initialSelection={['chair', 'snapshot-1', 'note']}
    />
  ),
}

const denseItems: EditableMoodBoardItem[] = Array.from(
  { length: 64 },
  (_, index) => ({
    id: `dense-${index + 1}`,
    type: index % 7 === 0 ? 'note' : index % 5 === 0 ? 'palette' : 'image',
    x: 32 + (index % 8) * 142,
    y: 40 + Math.floor(index / 8) * 104,
    width: 120,
    height: 82,
    zIndex: index,
    rotation: index % 9 === 0 ? -4 : index % 11 === 0 ? 5 : 0,
    content: index % 7 === 0 ? `Note ${index + 1}` : null,
    data: { name: `Reference ${index + 1}` },
  }),
)

export const DenseBoard64Pins: Story = {
  render: () => <ControlledRoom initialItems={denseItems} />,
}

export const ReducedMotion: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Use the Storybook reduced-motion accessibility setting: view transforms stop easing while guides remain visible.',
      },
    },
  },
  render: () => (
    <ControlledRoom
      initialItems={goldenItems}
      sections={MOOD_BOARD_GOLDEN_FIXTURE.sections}
      initialSelection={['chair']}
    />
  ),
}
