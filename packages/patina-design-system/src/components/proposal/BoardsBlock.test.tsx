import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BoardComposition, BoardsBlock, type BoardsBlockBoard } from './BoardsBlock'

// A product pin whose snapshot carries the detail-only fields (lead time +
// provenance). Presentation must ignore them; detail must surface them.
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

describe('BoardComposition mode prop', () => {
  it('defaults to presentation: no lead-time or provenance overlay', () => {
    const { container } = render(<BoardComposition board={productBoard()} />)
    // The product still renders (name shows on the pin + featured list).
    expect(container.textContent).toContain('Halyard Lounge Chair')
    // But the detail-only context is absent.
    expect(container.textContent).not.toContain('6 wk lead time')
    expect(container.textContent).not.toContain('west-elm.com')
  })

  it('default output is byte-identical to explicit presentation', () => {
    const a = render(<BoardComposition board={productBoard()} />)
    const b = render(<BoardComposition board={productBoard()} mode="presentation" />)
    expect(a.container.innerHTML).toBe(b.container.innerHTML)
  })

  it('detail mode overlays lead time + source host on product pins', () => {
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
    expect(container.textContent).not.toContain('west-elm.com')
  })
})

// The per-pin render-prop seams (B3 guest render · B4 verdicts · B5 drift /
// send-to-schedule). Undefined by default so a guest share stays byte-stable.
describe('BoardsBlock per-pin render props', () => {
  it('renderPinOverlay draws a quiet overlay on product/capture tiles', () => {
    const { container } = render(
      <BoardComposition
        board={productBoard()}
        renderPinOverlay={(item) => <span>chip-{item.id}</span>}
      />,
    )
    expect(container.textContent).toContain('chip-i1')
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
      <BoardComposition board={productBoard()} renderPinOverlay={undefined} renderPinDetail={undefined} />,
    )
    const plain = render(<BoardComposition board={productBoard()} />)
    expect(withUndefined.container.innerHTML).toBe(plain.container.innerHTML)
  })

  it('does not invoke renderPinOverlay for non-product tiles', () => {
    const noteBoard: BoardsBlockBoard = {
      ...productBoard(),
      items: [
        { id: 'note-1', type: 'note', x: 0, y: 0, width: 200, height: 120, z_index: 0, content: 'Hi' },
      ],
    }
    const seen: string[] = []
    render(
      <BoardComposition
        board={noteBoard}
        renderPinOverlay={(item) => {
          seen.push(item.id)
          return null
        }}
      />,
    )
    expect(seen).not.toContain('note-1')
  })
})
