import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  MOOD_BOARD_GOLDEN_FIXTURE,
  renderMoodBoardPng,
} from '../../mood-board'
import {
  BoardComposition,
  type BoardCompositionBoard,
  type BoardCompositionItem,
} from './BoardsBlock'

const safeImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAACACAIAAADS5vE8AAABdklEQVR4nO3WsQ2AMBAEQYwokHIojAJJDQmyNp3JTLw6ftzXuU3G/PD0/Hvu74+wRkAkAiI5vn82WGGBSAREIiASNxCJBSIREImASNxAJBaIREAkAiJxA5FYIBIBkQiIxA1EYoFIBEQiIBI3EIkFIhEQiYBI3EAkFohEQCQCInEDkVggEgGRCIjEDURigUgERCIgEjcQiQUiERCJgEjcQCQWiERAJAIicQORWCASAZEIiMQNRGKBSAREIiASNxCJBSIREImASNxAJBaIREAkAiJxA5FYIBIBkQiIxA1EYoFIBEQiIBI3EIkFIhEQiYBI3EAkFohEQCQCInEDkVggEgGRCIjEDURigUgERCIgEjcQiQUiERCJgEjcQCQWiERAJAIicQORWCASAZEIiMQNRGKBSAREIiASNxCJBSIREImASNxAJBaIREAkAiJxA5FYIBIBkQiIxA1EYoFIBEQiIBI3EIkFIhEQiYBI3EAkFohEQCQCYise0YEC/8CDz/0AAAAASUVORK5CYII='

const parityFixture = {
  ...MOOD_BOARD_GOLDEN_FIXTURE,
  items: MOOD_BOARD_GOLDEN_FIXTURE.items.map((item) => ({
    ...item,
    imageUrl:
      item.type === 'product' ||
      item.type === 'capture' ||
      item.type === 'image' ||
      item.type === 'room_scan'
        ? safeImage
        : item.imageUrl,
    data:
      item.id === 'note' || item.id === 'sofa'
        ? { ...item.data, section_id: 'empty' }
        : item.data,
  })),
}

const items: BoardCompositionItem[] = parityFixture.items.map(
  (item) => ({
    id: item.id,
    type: item.type,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height ?? null,
    z_index: item.zIndex,
    rotation: item.rotation,
    image_url: item.imageUrl,
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

function ExportPainterParityHarness() {
  const [rasterUrl, setRasterUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    void renderMoodBoardPng(parityFixture, { scale: 1 })
      .then((result) => {
        if (!active) return
        objectUrl = URL.createObjectURL(result.blob)
        setRasterUrl(objectUrl)
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Painter failed')
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])

  return (
    <div className="w-full" data-export-parity-harness="true">
      <div
        className="w-full"
        style={{ aspectRatio: `${board.canvas_width} / ${board.canvas_height}` }}
        data-export-parity-dom="true"
      >
        <BoardComposition
          board={board}
          fit="width"
          fullBleed
        />
      </div>
      <div
        className="mt-8 w-full"
        style={{ aspectRatio: `${board.canvas_width} / ${board.canvas_height}` }}
      >
        {rasterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rasterUrl}
            alt="Painter parity raster"
            className="block h-full w-full"
            data-export-parity-painter="true"
          />
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  )
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

/** AC3.1: same six-pin/three-section fixture rendered by DOM and painter. */
export const ExportPainterParity: Story = {
  render: () => <ExportPainterParityHarness />,
}

// ─── AC2.1: Present vs. guest/client geometry parity ─────────────────────────
//
// Present mode (board-room-shell.tsx) and the guest-share surface
// (apps/client-portal .../share/[token]/page.tsx) both render through this
// SAME `BoardComposition` component, but reach it via two different prop
// paths: Present forwards the live edit session's canvasWidth/canvasHeight/
// backgroundColor/sections as top-level overrides (its in-memory state can
// be ahead of what's persisted on `board`), while guest/client/mirror pass
// only `board` and let BoardComposition read its nested fields. AC2.1
// ("Present/client/guest/mirror geometry matches visually") was Waived as
// MANUAL-PARITY; this harness makes the one real risk in that gap — the two
// prop paths silently disagreeing — an automated, code-verified assertion
// instead of a screenshot someone has to remember to take.
//
// Fixture: MOOD_BOARD_GOLDEN_FIXTURE (sections + a rotated id-less item +
// a palette) plus one added item with no image at all, to also exercise the
// placeholder-parity fix (VD12, board-item-renderer.tsx/BoardsBlock.tsx
// ImageTile) across both surfaces.

const presentGuestParityFixture = {
  ...MOOD_BOARD_GOLDEN_FIXTURE,
  items: [
    ...MOOD_BOARD_GOLDEN_FIXTURE.items.map((fixtureItem) => ({
      ...fixtureItem,
      imageUrl:
        fixtureItem.type === 'product' ||
        fixtureItem.type === 'capture' ||
        fixtureItem.type === 'image' ||
        fixtureItem.type === 'room_scan'
          ? safeImage
          : fixtureItem.imageUrl,
    })),
    {
      id: 'placeholder-plan',
      type: 'image' as const,
      x: 40,
      y: 620,
      width: 200,
      height: 140,
      zIndex: 6,
      data: { section_id: 'living', name: 'Floor plan reference' },
    },
  ],
}

const presentGuestParityItems: BoardCompositionItem[] = presentGuestParityFixture.items.map(
  (fixtureItem) => ({
    id: fixtureItem.id,
    type: fixtureItem.type,
    x: fixtureItem.x,
    y: fixtureItem.y,
    width: fixtureItem.width,
    height: fixtureItem.height ?? null,
    z_index: fixtureItem.zIndex,
    rotation: fixtureItem.rotation,
    image_url: fixtureItem.imageUrl,
    content: fixtureItem.content,
    data: fixtureItem.data,
  }),
)

const presentGuestParityBoard: BoardCompositionBoard = {
  id: 'present-guest-parity-board',
  name: presentGuestParityFixture.name,
  canvas_width: presentGuestParityFixture.canvasWidth,
  canvas_height: presentGuestParityFixture.canvasHeight,
  background_color: presentGuestParityFixture.backgroundColor,
  sections: presentGuestParityFixture.sections,
  items: presentGuestParityItems,
}

function PresentGuestParityHarness() {
  return (
    <div data-present-guest-parity-harness="true">
      {/* Present's exact prop shape — top-level canvas/section overrides
          plus the designer-only verdict overlay. */}
      <div
        data-parity-surface="present"
        style={{ width: 1200, height: 800, position: 'relative' }}
      >
        <BoardComposition
          board={presentGuestParityBoard}
          sections={presentGuestParityBoard.sections}
          canvasWidth={presentGuestParityBoard.canvas_width}
          canvasHeight={presentGuestParityBoard.canvas_height}
          backgroundColor={presentGuestParityBoard.background_color}
          renderPinOverlay={(item) =>
            item.id ? (
              <span
                data-present-verdict-badge="true"
                style={{ fontSize: 9, background: '#fff', borderRadius: 9999, padding: '1px 4px' }}
              >
                ✓
              </span>
            ) : null
          }
          fullBleed
          fit="contain"
          showNotes
        />
      </div>
      {/* Guest/client's exact prop shape — `board` only, no overrides. */}
      <div
        data-parity-surface="guest"
        style={{ width: 1200, height: 800, marginTop: 32, position: 'relative' }}
      >
        <BoardComposition
          board={presentGuestParityBoard}
          fit="contain"
          fullBleed
          showNotes
          interactive={false}
        />
      </div>
    </div>
  )
}

/**
 * AC2.1: Present and the guest/client-portal surface render one board
 * fixture (sections + a no-image placeholder + a rotated item + a palette)
 * through the same shared `BoardComposition`, via each surface's real prop
 * shape. `present-guest-parity.visual.pw.ts` asserts every item's resolved
 * geometry agrees between the two.
 */
export const PresentGuestParity: Story = {
  render: () => <PresentGuestParityHarness />,
}
