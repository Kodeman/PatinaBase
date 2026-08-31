import * as React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { EditableMoodBoardItem, MoodBoardSection } from '@patina/types'
import { BoardRoomCanvas, type BoardRoomCanvasProps } from './BoardRoomCanvas'

beforeAll(() => {
  class PointerEventMock extends MouseEvent {
    pointerId: number
    pointerType: string

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: PointerEventMock,
  })
})

const ITEMS: EditableMoodBoardItem[] = [
  {
    id: 'chair',
    type: 'product',
    x: 40,
    y: 80,
    width: 240,
    height: 276,
    zIndex: 2,
    data: { section_id: 'living', name: 'Chair' },
  },
  {
    id: 'image',
    type: 'image',
    x: 340,
    y: 100,
    width: 220,
    height: 160,
    zIndex: 1,
    data: { section_id: 'living' },
  },
  {
    id: 'note',
    type: 'note',
    x: 680,
    y: 100,
    width: 200,
    height: 230,
    zIndex: 3,
    rotation: -10,
    content: 'Collected and warm',
    data: {},
  },
  {
    id: 'locked',
    type: 'palette',
    x: 80,
    y: 500,
    width: 400,
    height: 96,
    zIndex: 0,
    locked: true,
    data: {},
  },
]

const SECTIONS: MoodBoardSection[] = [
  { id: 'living', name: 'Living', color: '#a66d4f' },
  { id: 'empty', name: 'Empty' },
]

function renderCanvas(overrides: Partial<BoardRoomCanvasProps> = {}) {
  const props: BoardRoomCanvasProps = {
    boardName: 'Living Room',
    items: ITEMS,
    sections: SECTIONS,
    selectedItemIds: [],
    renderItem: (item) => <span>{item.id}</span>,
    ...overrides,
  }
  return render(<BoardRoomCanvas {...props} />)
}

describe('BoardRoomCanvas accessibility and view controls', () => {
  it('exposes an application landmark and items in bottom-to-top z order', () => {
    const { container } = renderCanvas()
    expect(
      screen.getByRole('application', { name: 'Living Room mood board' }),
    ).toHaveAttribute('tabindex', '0')
    const ids = Array.from(
      container.querySelectorAll('[data-board-item-id]'),
    ).map((node) => node.getAttribute('data-board-item-id'))
    expect(ids).toEqual(['locked', 'image', 'chair', 'note'])
    expect(
      screen.getByText(/Use Tab to move through items/),
    ).toBeInTheDocument()
  })

  it('pans on a plain wheel and zooms at the pointer on ctrl-wheel', () => {
    const onViewChange = vi.fn()
    renderCanvas({ onViewChange })
    const application = screen.getByRole('application')

    fireEvent.wheel(application, { deltaX: 5, deltaY: 20 })
    expect(onViewChange).toHaveBeenLastCalledWith(
      { pan: { x: 27, y: 12 }, zoom: 1 },
      'pan',
    )

    fireEvent.wheel(application, {
      clientX: 200,
      clientY: 150,
      deltaY: -100,
      ctrlKey: true,
    })
    expect(onViewChange.mock.lastCall?.[1]).toBe('zoom')
    expect(onViewChange.mock.lastCall?.[0].zoom).toBeGreaterThan(1)
  })

  it('fits from the keyboard and activates the focused item with Enter', () => {
    const onViewChange = vi.fn()
    const onItemActivate = vi.fn()
    renderCanvas({ onViewChange, onItemActivate })
    const application = screen.getByRole('application')
    Object.defineProperty(application, 'getBoundingClientRect', {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
      }),
    })
    fireEvent.keyDown(application, { key: '1' })
    expect(onViewChange.mock.lastCall?.[1]).toBe('fit')

    const chair = application.querySelector('[data-board-item-id="chair"]')!
    fireEvent.focus(chair)
    fireEvent.keyDown(chair, { key: 'Enter' })
    expect(onItemActivate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'chair' }),
    )
  })

  it('opens the same semantic context request from Shift+F10', () => {
    const onContextMenuRequest = vi.fn()
    renderCanvas({ onContextMenuRequest })
    const note = document.querySelector('[data-board-item-id="note"]')!
    fireEvent.focus(note)
    fireEvent.keyDown(note, { key: 'F10', shiftKey: true })
    expect(onContextMenuRequest).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'note', source: 'keyboard' }),
    )
  })

  it('targets an unfocused right-clicked pin and selects it', () => {
    const onContextMenuRequest = vi.fn()
    const onSelectionChange = vi.fn()
    renderCanvas({
      selectedItemIds: ['chair'],
      onContextMenuRequest,
      onSelectionChange,
    })
    const image = document.querySelector('[data-board-item-id="image"]')!

    fireEvent.contextMenu(image, { clientX: 420, clientY: 180 })

    expect(onContextMenuRequest).toHaveBeenCalledWith({
      itemId: 'image',
      clientPoint: { x: 420, y: 180 },
      source: 'pointer',
    })
    expect(onSelectionChange).toHaveBeenCalledWith(['image'], {
      reason: 'item',
    })
    expect(document.activeElement).toBe(image)
  })

  it('opens one context request on stationary touch long-press and cancels on movement or pointer-up', () => {
    vi.useFakeTimers()
    try {
      const onContextMenuRequest = vi.fn()
      const onItemActivate = vi.fn()
      renderCanvas({ onContextMenuRequest, onItemActivate })
      const application = screen.getByRole('application')
      const image = document.querySelector('[data-board-item-id="image"]')!

      fireEvent.pointerDown(image, {
        button: 0,
        pointerId: 21,
        pointerType: 'touch',
        clientX: 400,
        clientY: 160,
      })
      act(() => vi.advanceTimersByTime(500))
      expect(onContextMenuRequest).toHaveBeenCalledTimes(1)
      expect(onContextMenuRequest).toHaveBeenLastCalledWith({
        itemId: 'image',
        clientPoint: { x: 400, y: 160 },
        source: 'pointer',
      })
      fireEvent.pointerUp(application, { pointerId: 21, pointerType: 'touch' })
      fireEvent.click(image)
      fireEvent.contextMenu(image)
      expect(onContextMenuRequest).toHaveBeenCalledTimes(1)
      expect(onItemActivate).not.toHaveBeenCalled()

      fireEvent.pointerDown(image, {
        button: 0,
        pointerId: 22,
        pointerType: 'touch',
        clientX: 400,
        clientY: 160,
      })
      fireEvent.pointerMove(application, {
        pointerId: 22,
        pointerType: 'touch',
        clientX: 420,
        clientY: 160,
      })
      act(() => vi.advanceTimersByTime(500))
      expect(onContextMenuRequest).toHaveBeenCalledTimes(1)

      fireEvent.pointerDown(image, {
        button: 0,
        pointerId: 23,
        pointerType: 'touch',
        clientX: 400,
        clientY: 160,
      })
      fireEvent.pointerUp(application, { pointerId: 23, pointerType: 'touch' })
      act(() => vi.advanceTimersByTime(500))
      expect(onContextMenuRequest).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('BoardRoomCanvas selection', () => {
  it('selects by click, toggles with shift, and skips locked items in Select All', () => {
    const onSelectionChange = vi.fn()
    const { rerender } = renderCanvas({ onSelectionChange })
    fireEvent.pointerDown(
      document.querySelector('[data-board-item-id="chair"]')!,
      {
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      },
    )
    expect(onSelectionChange).toHaveBeenLastCalledWith(['chair'], {
      reason: 'item',
    })

    rerender(
      <BoardRoomCanvas
        boardName="Living Room"
        items={ITEMS}
        sections={SECTIONS}
        selectedItemIds={['chair']}
        onSelectionChange={onSelectionChange}
        renderItem={(item) => <span>{item.id}</span>}
      />,
    )
    fireEvent.pointerDown(
      document.querySelector('[data-board-item-id="image"]')!,
      {
        button: 0,
        pointerId: 2,
        shiftKey: true,
        clientX: 400,
        clientY: 150,
      },
    )
    expect(onSelectionChange).toHaveBeenLastCalledWith(['chair', 'image'], {
      reason: 'item',
    })

    fireEvent.keyDown(screen.getByRole('application'), {
      key: 'a',
      metaKey: true,
    })
    expect(onSelectionChange.mock.lastCall?.[0]).toEqual([
      'image',
      'chair',
      'note',
    ])
  })

  it('marquee-selects intersecting unlocked items once on pointer-up', () => {
    const onSelectionChange = vi.fn()
    renderCanvas({
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onSelectionChange,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    fireEvent.pointerDown(application, {
      button: 0,
      pointerId: 4,
      clientX: 20,
      clientY: 50,
    })
    fireEvent.pointerMove(application, {
      pointerId: 4,
      clientX: 600,
      clientY: 400,
    })
    expect(screen.getByTestId('board-marquee')).toBeInTheDocument()
    expect(onSelectionChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(application, {
      pointerId: 4,
      clientX: 600,
      clientY: 400,
    })
    expect(onSelectionChange.mock.lastCall?.[0]).toEqual(['image', 'chair'])
  })

  it('keeps the first click in an immediately-following shift-click, even before the controlled prop echoes back (aria-pressed regression)', () => {
    // Root cause: the shift-click branch used to read the `selectedItemIds`
    // PROP directly. A parent that has not yet re-rendered with the first
    // click's selection (no intervening render here — no `rerender()` call)
    // would still see the pre-click value, so the shift-click's "add to
    // selection" silently dropped the first item. The fix mirrors the prop
    // into a ref that this component's own `setSelection` updates eagerly.
    const onSelectionChange = vi.fn()
    renderCanvas({ onSelectionChange })
    const chair = document.querySelector('[data-board-item-id="chair"]')!
    const image = document.querySelector('[data-board-item-id="image"]')!
    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 90,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerUp(chair, { pointerId: 90, clientX: 100, clientY: 100 })
    // No rerender: the parent has not echoed the updated selectedItemIds prop.
    fireEvent.pointerDown(image, {
      button: 0,
      pointerId: 91,
      shiftKey: true,
      clientX: 400,
      clientY: 150,
    })
    expect(onSelectionChange).toHaveBeenLastCalledWith(['chair', 'image'], {
      reason: 'item',
    })
  })

  it('marks every item selected by click + shift-click as pressed, including after a subsequent marquee extends it', () => {
    const onSelectionChange = vi.fn()
    const { rerender } = renderCanvas({ onSelectionChange, showViewControls: false })
    const chair = document.querySelector('[data-board-item-id="chair"]')!
    fireEvent.pointerDown(chair, { button: 0, pointerId: 92, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(chair, { pointerId: 92, clientX: 100, clientY: 100 })

    rerender(
      <BoardRoomCanvas
        boardName="Living Room"
        items={ITEMS}
        sections={SECTIONS}
        selectedItemIds={['chair']}
        onSelectionChange={onSelectionChange}
        showViewControls={false}
        renderItem={(item) => <span>{item.id}</span>}
      />,
    )
    expect(chair).toHaveAttribute('aria-pressed', 'true')

    const image = document.querySelector('[data-board-item-id="image"]')!
    fireEvent.pointerDown(image, {
      button: 0,
      pointerId: 93,
      shiftKey: true,
      clientX: 400,
      clientY: 150,
    })
    fireEvent.pointerUp(image, { pointerId: 93, clientX: 400, clientY: 150 })
    expect(onSelectionChange).toHaveBeenLastCalledWith(['chair', 'image'], {
      reason: 'item',
    })

    rerender(
      <BoardRoomCanvas
        boardName="Living Room"
        items={ITEMS}
        sections={SECTIONS}
        selectedItemIds={['chair', 'image']}
        onSelectionChange={onSelectionChange}
        view={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        showViewControls={false}
        renderItem={(item) => <span>{item.id}</span>}
      />,
    )
    expect(chair).toHaveAttribute('aria-pressed', 'true')
    expect(image).toHaveAttribute('aria-pressed', 'true')

    const application = screen.getByRole('application')
    // Shift-marquee (additive) over empty space must still preserve the
    // prior click + shift-click selection — the same ref-based fix as the
    // item-click path above, applied to the marquee's additive union.
    fireEvent.pointerDown(application, {
      button: 0,
      pointerId: 94,
      shiftKey: true,
      clientX: 900,
      clientY: 700,
    })
    fireEvent.pointerMove(application, {
      pointerId: 94,
      shiftKey: true,
      clientX: 950,
      clientY: 750,
    })
    fireEvent.pointerUp(application, {
      pointerId: 94,
      shiftKey: true,
      clientX: 950,
      clientY: 750,
    })
    expect(onSelectionChange.mock.lastCall?.[0]).toEqual(['chair', 'image'])
  })
})

describe('BoardRoomCanvas semantic commits', () => {
  it('drags a section label as one semantic commit for every member (AC1.27)', () => {
    const onSectionBandMoved = vi.fn()
    const onItemsMoved = vi.fn()
    renderCanvas({
      view: { pan: { x: 0, y: 0 }, zoom: 2 },
      onSectionBandMoved,
      onItemsMoved,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const label = document.querySelector('[data-board-section-label="living"]')!
    fireEvent.pointerDown(label, {
      button: 0,
      pointerId: 12,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(application, {
      pointerId: 12,
      clientX: 200,
      clientY: 160,
    })
    expect(onSectionBandMoved).not.toHaveBeenCalled()
    expect(
      (document.querySelector('[data-board-item-id="chair"]') as HTMLElement)
        .style.left,
    ).toBe('90px')
    fireEvent.pointerUp(application, {
      pointerId: 12,
      clientX: 200,
      clientY: 160,
    })
    expect(onSectionBandMoved).toHaveBeenCalledTimes(1)
    expect(onSectionBandMoved).toHaveBeenCalledWith({
      sectionId: 'living',
      itemIds: ['chair', 'image'],
      delta: { x: 50, y: 30 },
    })
    expect(onItemsMoved).not.toHaveBeenCalled()
  })

  it('commits section name and color edits from the band label', () => {
    const onSectionUpdated = vi.fn()
    renderCanvas({ onSectionUpdated, showViewControls: false })

    const name = screen.getByRole('textbox', {
      name: 'Rename Living section',
    })
    fireEvent.change(name, { target: { value: 'Conversation area' } })
    fireEvent.blur(name)
    expect(onSectionUpdated).toHaveBeenCalledWith({
      sectionId: 'living',
      patch: { name: 'Conversation area' },
    })

    fireEvent.change(
      screen.getByLabelText('Change Living section color'),
      { target: { value: '#526b5f' } },
    )
    expect(onSectionUpdated).toHaveBeenLastCalledWith({
      sectionId: 'living',
      patch: { color: '#526b5f' },
    })
  })

  it('emits one logical move commit on pointer-up, not pointer-move', () => {
    const onItemsMoved = vi.fn()
    renderCanvas({
      selectedItemIds: ['chair'],
      view: { pan: { x: 0, y: 0 }, zoom: 2 },
      onItemsMoved,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const chair = document.querySelector('[data-board-item-id="chair"]')!
    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 5,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(application, {
      pointerId: 5,
      clientX: 300,
      clientY: 200,
    })
    expect(onItemsMoved).not.toHaveBeenCalled()
    fireEvent.pointerUp(application, {
      pointerId: 5,
      clientX: 300,
      clientY: 200,
    })
    expect(onItemsMoved).toHaveBeenCalledTimes(1)
    expect(onItemsMoved).toHaveBeenCalledWith(
      expect.objectContaining({
        itemIds: ['chair'],
        before: [{ id: 'chair', x: 40, y: 80 }],
        after: [{ id: 'chair', x: 140, y: 130 }],
        delta: { x: 100, y: 50 },
        reason: 'drag',
      }),
    )
  })

  it.each([
    { label: '5%', zoom: 0.05 },
    { label: '100%', zoom: 1 },
    { label: '400%', zoom: 4 },
  ])('converts a rail drop to the same logical release point at $label (AC1.9)', ({ zoom }) => {
    const onItemsDropped = vi.fn()
    const pan = { x: 37, y: 23 }
    const release = { x: 512, y: 288 }
    renderCanvas({
      view: { pan, zoom },
      onItemsDropped,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const dataTransfer = { files: [] }

    const drop = new MouseEvent('drop', {
      bubbles: true,
      clientX: pan.x + release.x * zoom,
      clientY: pan.y + release.y * zoom,
    })
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
    fireEvent(application, drop)

    expect(onItemsDropped).toHaveBeenCalledTimes(1)
    const commit = onItemsDropped.mock.lastCall?.[0]
    expect(commit).toMatchObject({
      files: [],
      dataTransfer,
    })
    expect(commit.point.x).toBeCloseTo(release.x, 5)
    expect(commit.point.y).toBeCloseTo(release.y, 5)
  })

  it.each([
    {
      label: 'snaps with the grid hidden',
      showGrid: false,
      snapToGrid: true,
      expected: { x: 50, y: 100 },
    },
    {
      label: 'moves freely with the grid visible when snap is off',
      showGrid: true,
      snapToGrid: false,
      expected: { x: 63, y: 97 },
    },
  ])('$label (AC1.16)', ({ showGrid, snapToGrid, expected }) => {
    const onItemsMoved = vi.fn()
    renderCanvas({
      selectedItemIds: ['chair'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      gridSize: 50,
      showGrid,
      snapToGrid,
      showGuides: false,
      showViewControls: false,
      onItemsMoved,
    })
    const application = screen.getByRole('application')
    const chair = document.querySelector('[data-board-item-id="chair"]')!
    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 71,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(application, {
      pointerId: 71,
      clientX: 123,
      clientY: 117,
    })
    fireEvent.pointerUp(application, {
      pointerId: 71,
      clientX: 123,
      clientY: 117,
    })

    expect(onItemsMoved).toHaveBeenCalledWith(
      expect.objectContaining({
        itemIds: ['chair'],
        after: [{ id: 'chair', ...expected }],
        reason: 'drag',
      }),
    )
  })

  it('previews Alt-drag copies, preserves selection offsets, and leaves originals still', () => {
    const onItemsAltDragged = vi.fn(() => ['chair-copy', 'image-copy'])
    renderCanvas({
      selectedItemIds: ['chair', 'image'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemsAltDragged,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const chair = document.querySelector('[data-board-item-id="chair"]') as HTMLElement
    const image = document.querySelector('[data-board-item-id="image"]') as HTMLElement

    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 31,
      altKey: true,
      clientX: 100,
      clientY: 100,
    })
    expect(document.querySelectorAll('[data-alt-drag-copy-of]')).toHaveLength(2)
    fireEvent.pointerMove(application, {
      pointerId: 31,
      altKey: true,
      clientX: 150,
      clientY: 125,
    })
    expect(chair.style.left).toBe('40px')
    expect(image.style.left).toBe('340px')
    expect(
      (document.querySelector('[data-alt-drag-copy-of="chair"]') as HTMLElement).style.left,
    ).toBe('90px')
    expect(
      (document.querySelector('[data-alt-drag-copy-of="image"]') as HTMLElement).style.left,
    ).toBe('390px')

    fireEvent.pointerUp(application, {
      pointerId: 31,
      altKey: true,
      clientX: 150,
      clientY: 125,
    })
    expect(onItemsAltDragged).toHaveBeenCalledTimes(1)
    expect(onItemsAltDragged).toHaveBeenCalledWith(
      expect.objectContaining({
        itemIds: ['chair', 'image'],
        delta: { x: 50, y: 25 },
        before: [
          { id: 'chair', x: 40, y: 80 },
          { id: 'image', x: 340, y: 100 },
        ],
        after: [
          { id: 'chair', x: 90, y: 105 },
          { id: 'image', x: 390, y: 125 },
        ],
      }),
    )
    expect(document.querySelector('[data-alt-drag-copy-of]')).toBeNull()
  })

  it('never re-stacks the dragged item: no zIndexPatches in the move commit, but it renders on top mid-drag (CI-03)', () => {
    const onItemsMoved = vi.fn()
    renderCanvas({
      selectedItemIds: ['image'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemsMoved,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const image = document.querySelector('[data-board-item-id="image"]') as HTMLElement
    // 'image' starts at zIndex 1, below 'note' (3) — confirm it renders under
    // note before the drag begins.
    expect(Number(image.style.zIndex)).toBeLessThan(3)
    fireEvent.pointerDown(image, {
      button: 0,
      pointerId: 32,
      clientX: 400,
      clientY: 150,
    })
    fireEvent.pointerMove(application, {
      pointerId: 32,
      clientX: 410,
      clientY: 150,
    })
    // Mid-drag: a render-only boost puts it above every sibling.
    expect(Number(image.style.zIndex)).toBeGreaterThan(9000)
    fireEvent.pointerUp(application, {
      pointerId: 32,
      clientX: 410,
      clientY: 150,
    })

    expect(onItemsMoved).toHaveBeenCalledTimes(1)
    const commit = onItemsMoved.mock.calls[0]![0]
    expect(commit).toEqual(
      expect.objectContaining({
        reason: 'drag',
        after: [{ id: 'image', x: 350, y: 100 }],
      }),
    )
    expect(commit.zIndexPatches).toBeUndefined()
    // After release, it settles back to its real (unchanged) stacking order.
    expect(Number(image.style.zIndex)).toBe(1)
  })

  it('arms a move only past a 3-4px screen-space threshold: a 3px wobble is a click-select, not a move (CI-04)', () => {
    const onItemsMoved = vi.fn()
    const onSelectionChange = vi.fn()
    renderCanvas({
      selectedItemIds: [],
      onSelectionChange,
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemsMoved,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const chair = document.querySelector('[data-board-item-id="chair"]') as HTMLElement
    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 50,
      clientX: 100,
      clientY: 100,
    })
    // Sub-threshold travel: no visual move, no history entry, no write.
    fireEvent.pointerMove(application, {
      pointerId: 50,
      clientX: 103,
      clientY: 100,
    })
    expect(chair.style.left).toBe('40px')
    fireEvent.pointerUp(application, {
      pointerId: 50,
      clientX: 103,
      clientY: 100,
    })
    expect(onItemsMoved).not.toHaveBeenCalled()
    // The click-select still happened.
    expect(onSelectionChange).toHaveBeenCalledWith(['chair'], { reason: 'item' })
  })

  it('arms a move once travel clears the threshold (CI-04)', () => {
    const onItemsMoved = vi.fn()
    renderCanvas({
      selectedItemIds: ['chair'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemsMoved,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const chair = document.querySelector('[data-board-item-id="chair"]') as HTMLElement
    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 51,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(application, {
      pointerId: 51,
      clientX: 105,
      clientY: 100,
    })
    expect(chair.style.left).toBe('45px')
    fireEvent.pointerUp(application, {
      pointerId: 51,
      clientX: 105,
      clientY: 100,
    })
    expect(onItemsMoved).toHaveBeenCalledTimes(1)
    expect(onItemsMoved).toHaveBeenCalledWith(
      expect.objectContaining({ after: [{ id: 'chair', x: 45, y: 80 }] }),
    )
  })

  it('reports gesture-active transitions via onGestureActiveChange, once per start/end (not per pointermove)', () => {
    const onGestureActiveChange = vi.fn()
    renderCanvas({
      selectedItemIds: ['chair'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onGestureActiveChange,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const chair = document.querySelector('[data-board-item-id="chair"]') as HTMLElement
    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 95,
      clientX: 100,
      clientY: 100,
    })
    expect(onGestureActiveChange).toHaveBeenCalledTimes(1)
    expect(onGestureActiveChange).toHaveBeenLastCalledWith(true)
    fireEvent.pointerMove(application, {
      pointerId: 95,
      clientX: 110,
      clientY: 100,
    })
    // A pointermove within the same gesture doesn't re-fire the transition.
    expect(onGestureActiveChange).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(application, {
      pointerId: 95,
      clientX: 110,
      clientY: 100,
    })
    expect(onGestureActiveChange).toHaveBeenCalledTimes(2)
    expect(onGestureActiveChange).toHaveBeenLastCalledWith(false)
  })

  it('reports the gesture ending on pointer-cancel too', () => {
    const onGestureActiveChange = vi.fn()
    renderCanvas({
      selectedItemIds: ['chair'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onGestureActiveChange,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const chair = document.querySelector('[data-board-item-id="chair"]') as HTMLElement
    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 96,
      clientX: 100,
      clientY: 100,
    })
    expect(onGestureActiveChange).toHaveBeenLastCalledWith(true)
    fireEvent.pointerCancel(application, { pointerId: 96 })
    expect(onGestureActiveChange).toHaveBeenLastCalledWith(false)
  })

  it('evaluates section membership against the section bounds captured before a move', () => {
    const onSectionMembership = vi.fn()
    renderCanvas({
      selectedItemIds: ['chair'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onSectionMembership,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const chair = document.querySelector('[data-board-item-id="chair"]')!
    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 9,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(application, {
      pointerId: 9,
      clientX: 1100,
      clientY: 100,
    })
    fireEvent.pointerUp(application, {
      pointerId: 9,
      clientX: 1100,
      clientY: 100,
    })

    expect(onSectionMembership).toHaveBeenCalledWith({
      itemId: 'chair',
      sectionId: null,
    })
  })

  it('keeps image aspect on horizontal and vertical edge resizes while preserving auto height only for width-only resize', () => {
    const onItemResized = vi.fn()
    const autoHeight = ITEMS.map((item) =>
      item.id === 'image'
        ? { ...item, height: null, data: { resolved_height: 160 } }
        : item,
    )
    const { rerender } = renderCanvas({
      items: autoHeight,
      selectedItemIds: ['image'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemResized,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const east = screen.getByRole('button', { name: 'Resize e' })
    fireEvent.pointerDown(east, {
      button: 0,
      pointerId: 6,
      clientX: 560,
      clientY: 180,
    })
    fireEvent.pointerMove(application, {
      pointerId: 6,
      clientX: 620,
      clientY: 180,
    })
    expect(onItemResized).not.toHaveBeenCalled()
    fireEvent.pointerUp(application, {
      pointerId: 6,
      clientX: 620,
      clientY: 180,
    })
    const eastCommit = onItemResized.mock.lastCall?.[0]
    expect(eastCommit).toEqual(expect.objectContaining({ itemId: 'image', handle: 'e' }))
    expect(eastCommit.after.width).toBe(280)
    expect(eastCommit.after.height).toBeNull()
    expect(eastCommit.after.resolvedHeight).toBeCloseTo(203.636, 2)
    expect(eastCommit.after.y).toBeCloseTo(78.182, 2)
    rerender(<div />)

    onItemResized.mockClear()
    renderCanvas({
      items: autoHeight,
      selectedItemIds: ['image'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemResized,
      showViewControls: false,
    })
    const northApplication = screen.getByRole('application')
    const north = screen.getByRole('button', { name: 'Resize n' })
    fireEvent.pointerDown(north, {
      button: 0,
      pointerId: 7,
      clientX: 450,
      clientY: 100,
    })
    fireEvent.pointerMove(northApplication, {
      pointerId: 7,
      clientX: 450,
      clientY: 60,
    })
    fireEvent.pointerUp(northApplication, {
      pointerId: 7,
      clientX: 450,
      clientY: 60,
    })
    const northCommit = onItemResized.mock.lastCall?.[0]
    expect(northCommit).toEqual(expect.objectContaining({ itemId: 'image', handle: 'n' }))
    expect(northCommit.after.width).toBe(275)
    expect(northCommit.after.x).toBeCloseTo(312.5, 2)
    expect(northCommit.after.height).toBe(200)
    expect(northCommit.after.resolvedHeight).toBe(200)
  })

  it('exposes eight constant-screen-size group handles and scales every member about the anchor', () => {
    const onItemsResized = vi.fn()
    renderCanvas({
      selectedItemIds: ['chair', 'image'],
      view: { pan: { x: 0, y: 0 }, zoom: 2 },
      onItemsResized,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const handles = screen.getAllByRole('button', {
      name: /Resize selection/,
    })
    expect(handles).toHaveLength(8)
    // 24px screen hit area / zoom 2 (CI-10) — the painted dot stays smaller.
    expect(handles[0]).toHaveStyle({ width: '12px', height: '12px' })
    expect(screen.queryByRole('button', { name: 'Rotate item' })).toBeNull()

    const southeast = screen.getByRole('button', {
      name: 'Resize selection se',
    })
    fireEvent.pointerDown(southeast, {
      button: 0,
      pointerId: 33,
      clientX: 1120,
      clientY: 712,
    })
    fireEvent.pointerMove(application, {
      pointerId: 33,
      clientX: 1640,
      clientY: 988,
    })
    expect(onItemsResized).not.toHaveBeenCalled()
    fireEvent.pointerUp(application, {
      pointerId: 33,
      clientX: 1640,
      clientY: 988,
    })

    expect(onItemsResized).toHaveBeenCalledTimes(1)
    const commit = onItemsResized.mock.lastCall?.[0]
    const chair = commit.after.find((item: { id: string }) => item.id === 'chair')
    const image = commit.after.find((item: { id: string }) => item.id === 'image')
    expect(chair).toMatchObject({ x: 40, y: 80, width: 360, resolvedHeight: 414 })
    expect(image).toMatchObject({ x: 490, y: 110, width: 330, resolvedHeight: 240 })
  })

  it('shows equal-spacing guides while resizing, snaps the edge, and lets Ctrl/Cmd suppress both (CI-09)', () => {
    const guideItems: EditableMoodBoardItem[] = [
      { id: 'a', type: 'image', x: 0, y: 100, width: 100, height: 100, data: {} },
      { id: 'b', type: 'image', x: 200, y: 100, width: 100, height: 100, data: {} },
      { id: 'moving', type: 'note', x: 400, y: 100, width: 90, height: 100, data: {} },
      { id: 'right', type: 'image', x: 600, y: 100, width: 100, height: 100, data: {} },
    ]
    const onItemResized = vi.fn()
    const { rerender } = renderCanvas({
      items: guideItems,
      sections: [],
      selectedItemIds: ['moving'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemResized,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const east = screen.getByRole('button', { name: 'Resize e' })
    fireEvent.pointerDown(east, {
      button: 0,
      pointerId: 34,
      clientX: 490,
      clientY: 150,
    })
    fireEvent.pointerMove(application, {
      pointerId: 34,
      clientX: 496,
      clientY: 150,
    })
    expect(
      document.querySelectorAll('[data-board-guide-kind="spacing"]'),
    ).toHaveLength(2)
    fireEvent.pointerUp(application, {
      pointerId: 34,
      clientX: 496,
      clientY: 150,
    })
    expect(onItemResized.mock.lastCall?.[0].after.width).toBe(100)

    onItemResized.mockClear()
    rerender(
      <BoardRoomCanvas
        boardName="Living Room"
        items={guideItems}
        sections={[]}
        selectedItemIds={['moving']}
        view={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        onItemResized={onItemResized}
        showViewControls={false}
        renderItem={(item) => <span>{item.id}</span>}
      />,
    )
    const eastAgain = screen.getByRole('button', { name: 'Resize e' })
    fireEvent.pointerDown(eastAgain, {
      button: 0,
      pointerId: 35,
      clientX: 490,
      clientY: 150,
      ctrlKey: true,
    })
    fireEvent.pointerMove(application, {
      pointerId: 35,
      clientX: 496,
      clientY: 150,
      ctrlKey: true,
    })
    expect(document.querySelector('[data-board-guide]')).toBeNull()
    fireEvent.pointerUp(application, {
      pointerId: 35,
      clientX: 496,
      clientY: 150,
      ctrlKey: true,
    })
    expect(onItemResized.mock.lastCall?.[0].after.width).toBe(96)
  })

  it('Shift imposes aspect lock on an item with no default lock (revises AC1.13, CI-08)', () => {
    const stickyItems: EditableMoodBoardItem[] = [
      { id: 'sticky', type: 'note', x: 0, y: 0, width: 200, height: 100, data: {} },
    ]
    const onItemResized = vi.fn()
    const { rerender } = renderCanvas({
      items: stickyItems,
      sections: [],
      selectedItemIds: ['sticky'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemResized,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const east = screen.getByRole('button', { name: 'Resize e' })
    // Without Shift, a note has no default aspect lock — width moves freely.
    fireEvent.pointerDown(east, { button: 0, pointerId: 60, clientX: 200, clientY: 50 })
    fireEvent.pointerMove(application, { pointerId: 60, clientX: 260, clientY: 50 })
    fireEvent.pointerUp(application, { pointerId: 60, clientX: 260, clientY: 50 })
    expect(onItemResized.mock.lastCall?.[0].after).toMatchObject({
      width: 260,
      resolvedHeight: 100,
    })

    onItemResized.mockClear()
    rerender(
      <BoardRoomCanvas
        boardName="Living Room"
        items={stickyItems}
        sections={[]}
        selectedItemIds={['sticky']}
        view={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        onItemResized={onItemResized}
        showGuides={false}
        showViewControls={false}
        renderItem={(item) => <span>{item.id}</span>}
      />,
    )
    const eastAgain = screen.getByRole('button', { name: 'Resize e' })
    // Holding Shift now imposes the lock — the opposite of the old
    // Shift-releases behaviour.
    fireEvent.pointerDown(eastAgain, {
      button: 0,
      pointerId: 61,
      clientX: 200,
      clientY: 50,
      shiftKey: true,
    })
    fireEvent.pointerMove(application, {
      pointerId: 61,
      clientX: 260,
      clientY: 50,
      shiftKey: true,
    })
    fireEvent.pointerUp(application, {
      pointerId: 61,
      clientX: 260,
      clientY: 50,
      shiftKey: true,
    })
    const shiftCommit = onItemResized.mock.lastCall?.[0].after
    expect(shiftCommit.width).toBe(260)
    expect(shiftCommit.resolvedHeight).toBeCloseTo(130, 5)
  })

  it('an aspect-locked-by-default item ignores Shift — no gesture-time release exists (CI-08)', () => {
    const photoItems: EditableMoodBoardItem[] = [
      { id: 'photo', type: 'image', x: 0, y: 0, width: 200, height: 100, data: {} },
    ]
    const onItemResized = vi.fn()
    const { rerender } = renderCanvas({
      items: photoItems,
      sections: [],
      selectedItemIds: ['photo'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemResized,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const east = screen.getByRole('button', { name: 'Resize e' })
    fireEvent.pointerDown(east, { button: 0, pointerId: 70, clientX: 200, clientY: 50 })
    fireEvent.pointerMove(application, { pointerId: 70, clientX: 260, clientY: 50 })
    fireEvent.pointerUp(application, { pointerId: 70, clientX: 260, clientY: 50 })
    const withoutShift = onItemResized.mock.lastCall?.[0].after

    onItemResized.mockClear()
    rerender(
      <BoardRoomCanvas
        boardName="Living Room"
        items={photoItems}
        sections={[]}
        selectedItemIds={['photo']}
        view={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        onItemResized={onItemResized}
        showGuides={false}
        showViewControls={false}
        renderItem={(item) => <span>{item.id}</span>}
      />,
    )
    const eastAgain = screen.getByRole('button', { name: 'Resize e' })
    fireEvent.pointerDown(eastAgain, {
      button: 0,
      pointerId: 71,
      clientX: 200,
      clientY: 50,
      shiftKey: true,
    })
    fireEvent.pointerMove(application, {
      pointerId: 71,
      clientX: 260,
      clientY: 50,
      shiftKey: true,
    })
    fireEvent.pointerUp(application, {
      pointerId: 71,
      clientX: 260,
      clientY: 50,
      shiftKey: true,
    })
    const withShift = onItemResized.mock.lastCall?.[0].after
    expect(withShift).toEqual(withoutShift)
    expect(withShift.resolvedHeight).toBeCloseTo(130, 5)
  })

  it('keeps smart guides active during an Alt-drag duplicate — Alt means duplicate only (CI-09)', () => {
    const onItemsAltDragged = vi.fn(() => ['mover-copy'])
    const alignedItems: EditableMoodBoardItem[] = [
      { id: 'anchor', type: 'image', x: 0, y: 100, width: 100, height: 100, data: {} },
      { id: 'mover', type: 'image', x: 400, y: 100, width: 100, height: 100, data: {} },
    ]
    renderCanvas({
      items: alignedItems,
      sections: [],
      selectedItemIds: ['mover'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemsAltDragged,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const mover = document.querySelector('[data-board-item-id="mover"]')!
    fireEvent.pointerDown(mover, {
      button: 0,
      pointerId: 80,
      altKey: true,
      clientX: 450,
      clientY: 150,
    })
    fireEvent.pointerMove(application, {
      pointerId: 80,
      altKey: true,
      clientX: 445,
      clientY: 150,
    })
    // Alt used to also suppress guides; now it's duplicate-only, so the
    // aligned edge still snaps a guide into view mid-drag.
    expect(document.querySelector('[data-board-guide]')).not.toBeNull()
    fireEvent.pointerUp(application, {
      pointerId: 80,
      altKey: true,
      clientX: 445,
      clientY: 150,
    })
    expect(onItemsAltDragged).toHaveBeenCalledTimes(1)
  })

  it('snaps rotation to 15 degrees while Shift is held', () => {
    const onItemRotated = vi.fn()
    renderCanvas({
      selectedItemIds: ['note'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemRotated,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const rotate = screen.getByRole('button', { name: 'Rotate item' })
    fireEvent.pointerDown(rotate, { pointerId: 7, clientX: 780, clientY: 80 })
    fireEvent.pointerMove(application, {
      pointerId: 7,
      clientX: 920,
      clientY: 215,
      shiftKey: true,
    })
    fireEvent.pointerUp(application, {
      pointerId: 7,
      clientX: 920,
      clientY: 215,
    })
    expect(onItemRotated.mock.lastCall?.[0].after % 15).toBe(0)
  })

  it('nudges from keyboard focus and exposes align/distribute actions', () => {
    const onItemsMoved = vi.fn()
    const onSelectionChange = vi.fn()
    const { rerender } = renderCanvas({
      selectedItemIds: ['image'],
      onItemsMoved,
      onSelectionChange,
    })
    const chair = document.querySelector('[data-board-item-id="chair"]')!
    fireEvent.focus(chair)
    fireEvent.keyDown(chair, { key: 'ArrowRight', shiftKey: true })
    // Keyboard focus wins over a stale selection on a different pin.
    expect(onSelectionChange).toHaveBeenCalledWith(['chair'], {
      reason: 'keyboard',
    })
    expect(onItemsMoved).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reason: 'keyboard',
        after: [{ id: 'chair', x: 50, y: 80 }],
      }),
    )

    rerender(
      <BoardRoomCanvas
        boardName="Living Room"
        items={ITEMS}
        sections={SECTIONS}
        selectedItemIds={['chair', 'image', 'note']}
        onItemsMoved={onItemsMoved}
        renderItem={(item) => <span>{item.id}</span>}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Align left' }))
    expect(onItemsMoved.mock.lastCall?.[0].reason).toBe('align')
    fireEvent.click(
      screen.getByRole('button', { name: 'Distribute horizontal centers' }),
    )
    expect(onItemsMoved.mock.lastCall?.[0].reason).toBe('distribute')
  })

  it('hides the bottom-center alignment cluster while a gesture is in flight, so a dragged item never paints over it', () => {
    renderCanvas({
      selectedItemIds: ['chair', 'image'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      showGuides: false,
    })
    expect(
      screen.getByRole('toolbar', { name: 'Board alignment' }),
    ).toBeInTheDocument()

    const application = screen.getByRole('application')
    const chair = document.querySelector('[data-board-item-id="chair"]') as HTMLElement
    fireEvent.pointerDown(chair, {
      button: 0,
      pointerId: 97,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(application, {
      pointerId: 97,
      clientX: 110,
      clientY: 100,
    })
    expect(
      screen.queryByRole('toolbar', { name: 'Board alignment' }),
    ).not.toBeInTheDocument()

    fireEvent.pointerUp(application, {
      pointerId: 97,
      clientX: 110,
      clientY: 100,
    })
    expect(
      screen.getByRole('toolbar', { name: 'Board alignment' }),
    ).toBeInTheDocument()
  })

  it('reports auto-grow separately after a committed move', () => {
    const onCanvasGrow = vi.fn()
    const edgeItem: EditableMoodBoardItem = {
      id: 'edge',
      type: 'image',
      x: 1100,
      y: 200,
      width: 200,
      height: 160,
      data: {},
    }
    renderCanvas({
      items: [edgeItem],
      selectedItemIds: ['edge'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onCanvasGrow,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const edge = document.querySelector('[data-board-item-id="edge"]')!
    fireEvent.pointerDown(edge, {
      button: 0,
      pointerId: 8,
      clientX: 1150,
      clientY: 250,
    })
    fireEvent.pointerMove(application, {
      pointerId: 8,
      clientX: 1250,
      clientY: 250,
    })
    fireEvent.pointerUp(application, {
      pointerId: 8,
      clientX: 1250,
      clientY: 250,
    })
    expect(onCanvasGrow).toHaveBeenCalledWith(
      expect.objectContaining({
        grew: true,
        reason: 'move',
        canvas: { width: 1640, height: 800 },
      }),
    )
  })
})
