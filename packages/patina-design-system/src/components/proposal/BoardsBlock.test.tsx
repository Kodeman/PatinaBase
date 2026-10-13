import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import {
  BoardComposition,
  BoardsBlock,
  type BoardCompositionBoard,
  type BoardsBlockBoard,
} from './BoardsBlock'
import { MOOD_BOARD_VISUAL } from '../../mood-board/visual-contract'

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

  it('uses the active cutout instead of a stale thumbnail in the stacked fallback', () => {
    const board = sectionBoard()
    const image = board.items.find((item) => item.type === 'image')!
    image.image_url = 'https://images.example/reference-cutout.png'
    image.data = {
      ...(image.data as Record<string, unknown>),
      original_image_url: 'https://images.example/reference.jpg',
      thumbnail_url: 'https://images.example/reference-thumb.jpg',
    }

    const { container } = render(<BoardComposition board={board} />)
    expect(
      container.querySelectorAll('img[src="https://images.example/reference-cutout.png"]'),
    ).toHaveLength(2)
    expect(
      container.querySelector('img[src="https://images.example/reference-thumb.jpg"]'),
    ).not.toBeInTheDocument()
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

describe('Present tiles: plate and caption, zones with an ink word (US-28 S12)', () => {
  function zonedBoard(): BoardCompositionBoard {
    const board = allPinTypesBoard()
    return {
      ...board,
      sections: [{ id: 'pieces', name: 'Pieces and the long name of this zone', color: '#718573' }],
      items: board.items.map((item) => ({
        ...item,
        data: { ...(item.data as Record<string, unknown>), section_id: 'pieces' },
      })),
    }
  }

  it('prints the zone word in ink inside a dashed edge: no fill, no white-on-colour pill, and it wraps', () => {
    const { container } = render(<BoardComposition board={zonedBoard()} />)
    const zone = container.querySelector('[data-composition-section="pieces"]') as HTMLElement
    expect(zone.style.border).toBe('1px dashed rgb(113, 133, 115)')
    expect(zone.style.backgroundColor).toBe('')
    const word = container.querySelector('[data-composition-section-word="pieces"]') as HTMLElement
    expect(word).toHaveTextContent('Pieces and the long name of this zone')
    expect(word.style.backgroundColor).toBe('')
    expect(word.style.color).toBe('rgb(44, 41, 38)')
    expect(word.style.textTransform).toBe('uppercase')
    expect(word.style.overflowWrap).toBe('anywhere')
    expect(word.className).not.toMatch(/whitespace-nowrap|rounded/)
  })

  it('draws every picture pin as a plate on a 1px card edge and its caption whole, never clamped or truncated', () => {
    const { container } = render(<BoardComposition board={productBoard()} />)
    const canvas = container.querySelector('[data-board-composition-canvas="true"]')!
    const pin = canvas.querySelector('[data-board-item-id="i1"]') as HTMLElement
    const plate = pin.querySelector('[data-board-plate]') as HTMLElement
    expect(plate.style.border).toBe('1px solid rgb(143, 140, 136)')
    expect(plate.style.backgroundColor).toBe('rgb(252, 250, 246)')
    const caption = pin.querySelector('[data-board-caption]') as HTMLElement
    expect(caption).toHaveTextContent('Halyard Lounge Chair')
    expect(caption).toHaveTextContent('West Elm · $1,200')
    expect(caption).toHaveTextContent('west-elm.com')
    expect(container.querySelector('.truncate, .line-clamp-2, [class*="shadow"]')).toBeNull()
    expect(container.innerHTML).not.toMatch(/ring-2|#fff\b|rgb\(255, 255, 255\)/)
  })

  it('keeps a long caption whole at the minimum tile size: the plate keeps 40px and the tile grows (R13)', () => {
    const name = 'Halyard Lounge Chair in a very long walnut and boucle finish with a deep seat'
    const board = productBoard()
    board.items = [{ ...board.items[0]!, width: 40, height: 40, data: { ...board.items[0]!.data, name } }]
    const { container } = render(<BoardComposition board={board} />)
    const pin = container.querySelector('[data-board-item-id="i1"]') as HTMLElement
    expect(pin.style.height).toBe('40px')
    const tile = pin.querySelector('[data-board-plate-item]') as HTMLElement
    // At least the saved box, never capped at it — the grid grows past it.
    expect(tile.style.minHeight).toBe('100%')
    expect(tile.style.height).toBe('')
    expect(tile.style.gridTemplateRows).toBe(`minmax(${MOOD_BOARD_VISUAL.plateMin}px, 1fr)`)
    const plate = pin.querySelector('[data-board-plate]') as HTMLElement
    expect(plate.style.minHeight).toBe(`${MOOD_BOARD_VISUAL.plateMin}px`)
    expect(plate.style.contain).toBe('size')
    const caption = pin.querySelector('[data-board-caption]') as HTMLElement
    expect(caption).toHaveTextContent(name)
    expect(caption.innerHTML).not.toMatch(/truncate|line-clamp|text-overflow|…/)
    expect(tile.contains(caption)).toBe(true)
  })

  it('gives every pin family the same plate stock and the note its oak edge', () => {
    const { container } = render(<BoardComposition board={allPinTypesBoard()} />)
    const canvas = container.querySelector('[data-board-composition-canvas="true"]')!
    for (const type of ['product', 'capture', 'image', 'palette', 'room_scan']) {
      expect(
        canvas.querySelector(`[data-board-item-id="pin-${type}"] [data-board-plate]`),
      ).toBeInTheDocument()
    }
    const note = canvas.querySelector('[data-board-item-id="pin-note"] > div') as HTMLElement
    expect(note.style.borderLeft).toBe('2px solid rgb(139, 115, 85)')
    expect(note.style.backgroundColor).toBe('')
  })

  it('keeps the guest view token-only: with no host acts it offers no buttons or focusable pins', () => {
    const { container } = render(<BoardsBlock boards={[zonedBoard() as BoardsBlockBoard]} />)
    expect(container.querySelector('button, [role="button"], [tabindex]')).toBeNull()
    expect(container.querySelector('[data-pin-overlay], [data-pin-interaction]')).toBeNull()
  })
})

describe('BoardComposition never clips a caption at the canvas bottom (R13b)', () => {
  const longName =
    'Halyard lounge chair in a long walnut and boucle finish, with the matching ottoman'
  function captionBoard(): BoardCompositionBoard {
    const tile = (id: string, x: number, y: number) => ({
      id,
      type: 'product',
      x,
      y,
      width: 40,
      height: 40,
      z_index: 0,
      data: { name: longName, vendor_name: 'West Elm' },
    })
    return {
      id: 'b-captions',
      name: 'Captions',
      canvas_width: 400,
      canvas_height: 300,
      background_color: '#FAF8F5',
      // A bottom-edge tile, and two tiles stacked one above the other.
      items: [tile('bottom', 300, 260), tile('upper', 40, 100), tile('lower', 40, 150)],
    }
  }

  /** Layout px a browser reports: each 40px tile prints 40 + its caption. */
  function stubLayout(printed: Record<string, number>) {
    const scroll = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return printed[this.dataset.boardItemId ?? ''] ?? 0
      })
    const width = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.dataset.boardCompositionCanvas ? 400 : 0
      })
    return () => {
      scroll.mockRestore()
      width.mockRestore()
    }
  }

  it('grows the composition to the bottom tile’s printed caption, at any tile', () => {
    const restore = stubLayout({ bottom: 160, upper: 140, lower: 140 })
    try {
      const { container } = render(<BoardComposition board={captionBoard()} />)
      const canvas = container.querySelector('[data-board-composition-canvas]') as HTMLElement
      const world = canvas.firstElementChild as HTMLElement
      // 260 + 160: the bottom tile's caption ends 120px past the 300px canvas.
      expect(canvas).toHaveAttribute('data-canvas-height', '300')
      expect(canvas).toHaveAttribute('data-content-height', '420')
      expect(world.style.height).toBe('420px')
      // At scale 1 the visible frame is the grown height, so nothing is cut.
      expect(canvas.style.height).toBe('420px')
      // Every tile's printed bottom sits inside the composition.
      for (const [id, y, printed] of [
        ['bottom', 260, 160],
        ['upper', 100, 140],
        ['lower', 150, 140],
      ] as const) {
        const tile = container.querySelector(`[data-board-item-id="${id}"]`) as HTMLElement
        expect(tile.style.top).toBe(`${y}px`)
        expect(y + printed).toBeLessThanOrEqual(420)
        expect(within(tile).getByText(longName)).toBeInTheDocument()
      }
    } finally {
      restore()
    }
  })

  it('keeps the saved canvas when every caption fits its tile', () => {
    const restore = stubLayout({ bottom: 40, upper: 40, lower: 40 })
    try {
      const { container } = render(<BoardComposition board={captionBoard()} />)
      const canvas = container.querySelector('[data-board-composition-canvas]') as HTMLElement
      expect(canvas).toHaveAttribute('data-content-height', '300')
      expect(canvas.style.height).toBe('300px')
    } finally {
      restore()
    }
  })
})
