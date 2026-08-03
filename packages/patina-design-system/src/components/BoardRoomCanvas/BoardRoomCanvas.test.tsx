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
})

describe('BoardRoomCanvas semantic commits', () => {
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

  it('promotes the dragged selection once in the same move commit', () => {
    const onItemsMoved = vi.fn()
    renderCanvas({
      selectedItemIds: ['image'],
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      onItemsMoved,
      showGuides: false,
      showViewControls: false,
    })
    const application = screen.getByRole('application')
    const image = document.querySelector('[data-board-item-id="image"]')!
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
    fireEvent.pointerUp(application, {
      pointerId: 32,
      clientX: 410,
      clientY: 150,
    })

    expect(onItemsMoved).toHaveBeenCalledTimes(1)
    expect(onItemsMoved).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'drag',
        after: [{ id: 'image', x: 350, y: 100 }],
        zIndexPatches: [{ id: 'image', zIndex: 4 }],
      }),
    )
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

  it('emits a single free resize commit and retains nullable height for width-only resize', () => {
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
    expect(onItemResized).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'image',
        handle: 'e',
        after: expect.objectContaining({
          width: 280,
          height: null,
          resolvedHeight: 160,
        }),
      }),
    )
    rerender(<div />)
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
    expect(handles[0]).toHaveStyle({ width: '10px', height: '10px' })
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

  it('shows equal-spacing guides while resizing, snaps the edge, and lets Alt suppress both', () => {
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
      altKey: true,
    })
    fireEvent.pointerMove(application, {
      pointerId: 35,
      clientX: 496,
      clientY: 150,
      altKey: true,
    })
    expect(document.querySelector('[data-board-guide]')).toBeNull()
    fireEvent.pointerUp(application, {
      pointerId: 35,
      clientX: 496,
      clientY: 150,
      altKey: true,
    })
    expect(onItemResized.mock.lastCall?.[0].after.width).toBe(96)
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
    const { rerender } = renderCanvas({
      selectedItemIds: ['chair'],
      onItemsMoved,
    })
    const chair = document.querySelector('[data-board-item-id="chair"]')!
    fireEvent.focus(chair)
    fireEvent.keyDown(chair, { key: 'ArrowRight', shiftKey: true })
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
