import type { Meta, StoryObj } from '@storybook/react'
import { MOOD_BOARD_GOLDEN_FIXTURE } from '../../mood-board'
import {
  BoardComposition,
  type BoardCompositionBoard,
  type BoardCompositionItem,
} from './BoardsBlock'

const safeImage =
  'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600"%3E%3Crect width="800" height="600" fill="%23ddd2c4"/%3E%3Cpath d="M0 470L230 250l150 130 120-90 300 180v130H0z" fill="%23a7b0a0"/%3E%3C/svg%3E'

const items: BoardCompositionItem[] = MOOD_BOARD_GOLDEN_FIXTURE.items.map(
  (item) => ({
    id: item.id,
    type: item.type,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height ?? null,
    z_index: item.zIndex,
    rotation: item.rotation,
    image_url:
      item.type === 'product' ||
      item.type === 'capture' ||
      item.type === 'image' ||
      item.type === 'room_scan'
        ? safeImage
        : null,
    content: item.content,
    data: item.data,
  }),
)

const board: BoardCompositionBoard = {
  id: 'golden-board',
  name: MOOD_BOARD_GOLDEN_FIXTURE.name,
  canvas_width: MOOD_BOARD_GOLDEN_FIXTURE.canvasWidth,
  canvas_height: MOOD_BOARD_GOLDEN_FIXTURE.canvasHeight,
  background_color: MOOD_BOARD_GOLDEN_FIXTURE.backgroundColor,
  sections: MOOD_BOARD_GOLDEN_FIXTURE.sections,
  items,
}

const meta: Meta<typeof BoardComposition> = {
  title: 'Mood Board/BoardComposition',
  component: BoardComposition,
  args: { board },
  decorators: [
    (Story) => (
      <div className="mx-auto min-h-[600px] max-w-6xl bg-white p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof BoardComposition>

export const InDocument: Story = {}

export const FullBleedPresent: Story = {
  args: { fit: 'contain', fullBleed: true },
  decorators: [
    (Story) => (
      <div className="h-[100dvh] min-h-[640px] bg-[#1f1c19]">
        <Story />
      </div>
    ),
  ],
}

export const NotesHidden: Story = {
  args: { showNotes: false },
}

export const InteractivePins: Story = {
  args: {
    interactive: true,
    renderPinInteraction: (item) => (
      <span className="rounded-full bg-white/95 px-2 py-1 text-[10px] shadow-sm">
        Review {item.id}
      </span>
    ),
  },
}

export const FrozenSnapshotWithoutIds: Story = {
  args: {
    board: { ...board, items: board.items.map(({ id: _id, ...item }) => item) },
    interactive: true,
  },
}

export const MobileStackedSections: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'Below the sm breakpoint, sections become labelled stacked groups instead of a tiny canvas.',
      },
    },
  },
}
