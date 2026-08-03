import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import {
  BoardComposition,
  BoardsBlock,
  type BoardCompositionBoard,
  type BoardsBlockBoard,
} from './BoardsBlock'

// A product pin whose snapshot carries detail-only lead time and always-visible
// captured-source provenance.
function productBoard(): BoardsBlockBoard {
  return {
    id: 'b1',
    name: 'Living Room',
    canvas_width: 1200,
    canvas_height: 800,
    background_color: '#FAF8F5',
    items: [
      {
        id: 'i1',
        type: 'product',
        x: 40,
        y: 40,
        width: 220,
        height: 260,
        z_index: 0,
        data: {
          name: 'Halyard Lounge Chair',
          vendor_name: 'West Elm',
          price_cents: 120000,
          lead_time_weeks: 6,
          source_url: 'https://www.west-elm.com/products/halyard',
        },
      },
    ],
  }
}

const PIN_TYPES = ['product', 'capture', 'image', 'palette', 'note', 'room_scan'] as const

function allPinTypesBoard(): BoardCompositionBoard {
  return {
    id: 'all-pin-types',
    name: 'All pin types',
    canvas_width: 1200,
    canvas_height: 800,
    background_color: '#FAF8F5',
    items: PIN_TYPES.map((type, index) => ({
      id: `pin-${type}`,
      type,
      x: 40 + index * 180,
      y: index < 3 ? 40 : 360,
      width: type === 'palette' ? 260 : 160,
      height: type === 'palette' ? 80 : 180,
      z_index: index,
      image_url:
        type === 'product' || type === 'capture' || type === 'image' || type === 'room_scan'
          ? `https://images.example/${type}.jpg`
          : null,
      content: type === 'note' ? 'Pin-level note' : null,
      data:
        type === 'palette'
          ? { name: 'Clay', swatches: [{ hex: '#A66D4F', name: 'Clay' }] }
          : { name: `${type} pin` },
    })),
  }
}

describe('BoardComposition mode prop', () => {
  it('defaults to presentation with provenance but no lead-time overlay', () => {
    const { container } = render(<BoardComposition board={productBoard()} />)
    // The product still renders (name shows on the pin + featured list).
    expect(container.textContent).toContain('Halyard Lounge Chair')
    // Lead time is designer detail; captured provenance is artifact truth.
    expect(container.textContent).not.toContain('6 wk lead time')
    expect(container.textContent).toContain('west-elm.com')
  })

  it('default output is byte-identical to explicit presentation', () => {
    const a = render(<BoardComposition board={productBoard()} />)
    const b = render(<BoardComposition board={productBoard()} mode="presentation" />)
    expect(a.container.innerHTML).toBe(b.container.innerHTML)
  })

  it('detail mode adds lead time while retaining the source host', () => {
    const { container } = render(<BoardComposition board={productBoard()} mode="detail" />)
    expect(container.textContent).toContain('6 wk lead time')
    // Host is stripped of a leading www.
    expect(container.textContent).toContain('west-elm.com')
    // Presentation content still present (detail is additive).
    expect(container.textContent).toContain('Halyard Lounge Chair')
  })

  it('detail render differs from presentation (the overlay is real)', () => {
    const pres = render(<BoardComposition board={productBoard()} />)
    const det = render(<BoardComposition board={productBoard()} mode="detail" />)
    expect(det.container.innerHTML).not.toBe(pres.container.innerHTML)
  })
})

describe('BoardsBlock mode prop', () => {
  it('defaults to presentation for the client copy', () => {
    const { container } = render(<BoardsBlock boards={[productBoard()]} />)
    expect(container.textContent).toContain('Halyard Lounge Chair')
    expect(container.textContent).toContain('west-elm.com')
  })
})

// The per-pin render-prop seams (B3 guest render · B4 verdicts · B5 drift /
// send-to-schedule). Undefined by default so a guest share stays byte-stable.
describe('BoardsBlock per-pin render props', () => {
  it('draws pin overlays for all six types on the canvas and stacked presentation', () => {
    const seen: string[] = []
    const { container } = render(
      <BoardComposition
        board={allPinTypesBoard()}
        renderPinOverlay={(item) => {
          seen.push(item.type)
          return <span>{`chip-${item.type}`}</span>
        }}
      />,
    )

    const canvas = container.querySelector('[data-board-composition-canvas="true"]')
    const stacked = container.querySelector('[data-stacked-board-items="true"]')
    expect(canvas).not.toBeNull()
    expect(stacked).not.toBeNull()
    expect(canvas?.querySelectorAll('[data-pin-overlay="true"]')).toHaveLength(PIN_TYPES.length)
    expect(stacked?.querySelectorAll('[data-pin-overlay="true"]')).toHaveLength(PIN_TYPES.length)

    for (const type of PIN_TYPES) {
      expect(
        canvas?.querySelector(`[data-board-item-id="pin-${type}"] [data-pin-overlay="true"]`),
      ).toHaveTextContent(`chip-${type}`)
      expect(
        stacked?.querySelector(`[data-board-item-type="${type}"] [data-pin-overlay="true"]`),
      ).toHaveTextContent(`chip-${type}`)
    }
    expect(new Set(seen)).toEqual(new Set(PIN_TYPES))
  })

  it('renderPinDetail draws an interactive block per pin in the Featured list', () => {
    const { getAllByText } = render(
      <BoardComposition
        board={productBoard()}
        renderPinDetail={(item) => <button>act-{item.id}</button>}
      />,
    )
    expect(getAllByText('act-i1').length).toBeGreaterThan(0)
  })

  it('omitting both render props is byte-identical to the plain render (guest byte-stability)', () => {
    const withUndefined = render(
      <BoardComposition
        board={productBoard()}
        renderPinOverlay={undefined}
        renderPinDetail={undefined}
      />,
    )
    const plain = render(<BoardComposition board={productBoard()} />)
    expect(withUndefined.container.innerHTML).toBe(plain.container.innerHTML)
  })

  it('does not offer pin overlays to frozen snapshots without ids', () => {
    const frozenBoard: BoardCompositionBoard = {
      ...allPinTypesBoard(),
      items: allPinTypesBoard().items.map(({ id: _id, ...item }) => item),
    }
    const seen: string[] = []
    render(
      <BoardComposition
        board={frozenBoard}
        renderPinOverlay={(item) => {
          seen.push(item.id)
          return null
        }}
      />,
    )
    expect(seen).toEqual([])
  })
})

describe('BoardComposition pin interaction parity', () => {
  it('exposes keyboard pin targets and host interactions for all six stacked pin types', () => {
    const activate = vi.fn()
    const interaction = vi.fn((item: BoardCompositionBoard['items'][number]) => (
      <button type="button" aria-label={`Review ${item.type}`}>
        Review
      </button>
    ))
    const { container } = render(
      <BoardComposition
        board={allPinTypesBoard()}
        interactive
        onItemActivate={activate}
        renderPinInteraction={interaction}
      />,
    )
    const stacked = container.querySelector('[data-stacked-board-items="true"]')
    expect(stacked).not.toBeNull()
    if (!stacked) return

    for (const type of PIN_TYPES) {
      const frame = stacked.querySelector(`[data-board-item-type="${type}"]`)
      expect(frame).toHaveAttribute('role', 'button')
      expect(frame).toHaveAttribute('tabindex', '0')
      expect(frame).toHaveAccessibleName(`${type.replace('_', ' ')} board item`)
      expect(
        within(frame as HTMLElement).getByRole('button', {
          name: `Review ${type}`,
        }),
      ).toBeVisible()
    }
    expect(new Set(interaction.mock.calls.map(([item]) => item.type))).toEqual(new Set(PIN_TYPES))

    const noteFrame = stacked.querySelector('[data-board-item-type="note"]')
    expect(noteFrame).not.toBeNull()
    if (!noteFrame) return
    fireEvent.keyDown(noteFrame, { key: 'Enter' })
    expect(activate).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'pin-note', type: 'note' }),
    )

    activate.mockClear()
    fireEvent.click(
      within(noteFrame as HTMLElement).getByRole('button', {
        name: 'Review note',
      }),
    )
    expect(activate).not.toHaveBeenCalled()
  })

  it('keeps authored canvas geometry unchanged when pin chrome is added', () => {
    const plain = render(<BoardComposition board={allPinTypesBoard()} />)
    const decorated = render(
      <BoardComposition
        board={allPinTypesBoard()}
        interactive
        renderPinOverlay={(item) => <span>{item.type}</span>}
        renderPinInteraction={() => <span>Review</span>}
      />,
    )

    const plainCanvas = plain.container.querySelector('[data-board-composition-canvas="true"]')
    const decoratedCanvas = decorated.container.querySelector(
      '[data-board-composition-canvas="true"]',
    )
    for (const type of PIN_TYPES) {
      const selector = `[data-board-item-id="pin-${type}"]`
      expect(decoratedCanvas?.querySelector(selector)?.getAttribute('style')).toBe(
        plainCanvas?.querySelector(selector)?.getAttribute('style'),
      )
    }
  })
})

describe('BoardComposition unified renderer props', () => {
  function sectionBoard(): BoardCompositionBoard {
    return {
      ...productBoard(),
      sections: [
        { id: 'seating', name: 'Seating', color: '#a66d4f' },
        { id: 'empty', name: 'Empty' },
      ],
      items: [
        {
          ...productBoard().items[0],
          data: {
            ...((productBoard().items[0].data ?? {}) as object),
            section_id: 'seating',
          },
        },
        {
          // Frozen project-board snapshots intentionally carry no item id.
          type: 'image',
          x: 320,
          y: 80,
          width: 240,
          height: null,
          z_index: 1,
          image_url: 'https://images.example/reference.jpg',
          data: {
            section_id: 'seating',
            resolved_height: 180,
            thumbnail_url: 'https://images.example/reference-thumb.jpg',
          },
        },
        {
          id: 'note-1',
          type: 'note',
          x: 600,
          y: 80,
          width: 200,
          height: null,
          z_index: 2,
          content: 'Working annotation',
          data: { resolved_height: 140 },
        },
      ],
    }
  }

  it('uses the shared geometry for non-empty section bands and mobile headings', () => {
    const { container } = render(<BoardComposition board={sectionBoard()} />)
    expect(container.querySelector('[data-composition-section="seating"]')).toBeInTheDocument()
    expect(container.querySelector('[data-composition-section="empty"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-stacked-section="seating"]')).toHaveTextContent('Seating')
  })

  it('uses display imagery on the composition canvas and thumbnails in the stacked fallback', () => {
    const { container } = render(<BoardComposition board={sectionBoard()} />)
    expect(
      container.querySelector('[data-board-snapshot-key] img[src="https://images.example/reference.jpg"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('img[src="https://images.example/reference-thumb.jpg"]'),
    ).toBeInTheDocument()
  })

  it('honors dimension, fit, full-bleed and background overrides additively', () => {
    const { container } = render(
      <BoardComposition
        board={sectionBoard()}
        canvasWidth={1800}
        canvasHeight={1000}
        backgroundColor="#112233"
        fit="contain"
        fullBleed
      />,
    )
    const canvas = container.querySelector('[data-board-composition-canvas="true"]')
    expect(canvas).toHaveAttribute('data-fit', 'contain')
    expect(canvas).toHaveAttribute('data-full-bleed', 'true')
    expect(canvas).toHaveAttribute('data-canvas-width', '1800')
    expect(canvas).toHaveAttribute('data-canvas-height', '1000')
    expect(container.querySelector('h3')).not.toBeInTheDocument()
    expect(container).toHaveTextContent('Featured pieces')
  })

  it('removes note pins from desktop and stacked DOM when showNotes is false', () => {
    const { container } = render(<BoardComposition board={sectionBoard()} showNotes={false} />)
    expect(container).not.toHaveTextContent('Working annotation')
  })

  it('enables hit targets only for id-backed items and skips frozen snapshot affordances', () => {
    const activate = vi.fn()
    const interaction = vi.fn((item: BoardCompositionBoard['items'][number]) => (
      <span>act-{item.id}</span>
    ))
    const { container } = render(
      <BoardComposition
        board={sectionBoard()}
        interactive
        onItemActivate={activate}
        renderPinInteraction={interaction}
      />,
    )
    expect(container.querySelector('[data-board-item-id="i1"]')).toHaveAttribute(
      'data-interactive',
      'true',
    )
    expect(container.querySelector('[data-board-snapshot-key="snapshot:1"]')).toHaveAttribute(
      'data-interactive',
      'false',
    )
    expect(interaction.mock.calls.some(([item]) => item.id === undefined)).toBe(false)
  })

  it('uses contain image fit for every composition image surface', () => {
    const { container } = render(<BoardComposition board={sectionBoard()} />)
    const images = Array.from(container.querySelectorAll('img'))
    expect(images.length).toBeGreaterThan(0)
    expect(images.every((image) => image.className.includes('object-contain'))).toBe(true)
  })

  it('keeps default output identical to explicitly supplied additive defaults', () => {
    const a = render(<BoardComposition board={sectionBoard()} />)
    const b = render(
      <BoardComposition
        board={sectionBoard()}
        sections={sectionBoard().sections}
        canvasWidth={1200}
        canvasHeight={800}
        backgroundColor="#FAF8F5"
        fit="width"
        fullBleed={false}
        showNotes
        interactive={false}
      />,
    )
    expect(a.container.innerHTML).toBe(b.container.innerHTML)
  })
})
