import { describe, expect, it } from 'vitest'
import {
  alignBoardItems,
  computeBoardAutoGrow,
  distributeBoardItems,
  findBoardAlignmentGuides,
  findBoardSmartGuides,
  fitBoardGeometry,
  marqueeIntersections,
  resolveMoodBoardGeometry,
  screenPointToBoard,
  zoomBoardViewAtPoint,
} from './geometry'
import { MOOD_BOARD_GOLDEN_FIXTURE, MOOD_BOARD_GOLDEN_GEOMETRY } from './__fixtures__/golden-board'

describe('versioned mood-board geometry', () => {
  it('matches the shared golden fixture without mutating its input', () => {
    const before = structuredClone(MOOD_BOARD_GOLDEN_FIXTURE)
    const geometry = resolveMoodBoardGeometry(MOOD_BOARD_GOLDEN_FIXTURE)

    expect(MOOD_BOARD_GOLDEN_FIXTURE).toEqual(before)
    expect(geometry.version).toBe(MOOD_BOARD_GOLDEN_GEOMETRY.version)
    expect(geometry.items.map((item) => item.key)).toEqual(MOOD_BOARD_GOLDEN_GEOMETRY.itemOrder)
    expect(Object.fromEntries(geometry.items.map((item) => [item.key, item.height]))).toMatchObject(
      MOOD_BOARD_GOLDEN_GEOMETRY.heights,
    )
    expect(geometry.sections.map((section) => section.id)).toEqual(
      MOOD_BOARD_GOLDEN_GEOMETRY.sectionIds,
    )
    expect(geometry.sections[0]?.memberKeys).toEqual(['snapshot:1', 'chair'])
    expect(geometry.sections[1]?.memberKeys).toEqual(['palette', 'scan'])
  })

  it('resolves height as explicit height, measured snapshot height, then deterministic fallback', () => {
    const geometry = resolveMoodBoardGeometry(MOOD_BOARD_GOLDEN_FIXTURE)
    expect(geometry.items.find((item) => item.key === 'chair')?.height).toBe(276)
    expect(geometry.items.find((item) => item.key === 'snapshot:1')?.height).toBe(180)
    expect(geometry.items.find((item) => item.key === 'scan')?.height).toBe(216)
    expect(geometry.items.find((item) => item.key === 'sofa')?.height).toBe(253)
  })

  it('uses a rotated axis-aligned box for marquee selection', () => {
    const geometry = resolveMoodBoardGeometry(MOOD_BOARD_GOLDEN_FIXTURE)
    const rotated = geometry.items.find((item) => item.key === 'snapshot:1')!
    expect(rotated.aabb.width).toBeCloseTo(306.5064, 3)
    expect(rotated.aabb.height).toBeCloseTo(280.8846, 3)

    const ids = marqueeIntersections(geometry.items, {
      x: rotated.aabb.x - 2,
      y: rotated.aabb.y - 2,
      width: 4,
      height: 4,
    })
    expect(ids).toContain('snapshot:1')
  })
})

describe('viewport geometry', () => {
  it.each([0.05, 1, 4])('converts pointer coordinates at zoom %s', (zoom) => {
    expect(screenPointToBoard({ x: 250, y: 180 }, { x: 50, y: 30 }, zoom)).toEqual({
      x: 200 / zoom,
      y: 150 / zoom,
    })
  })

  it('keeps the logical point under the cursor fixed while zooming', () => {
    const pointer = { x: 430, y: 260 }
    const before = screenPointToBoard(pointer, { x: 80, y: 50 }, 0.75)
    const next = zoomBoardViewAtPoint({ pan: { x: 80, y: 50 }, zoom: 0.75 }, pointer, 1.8)
    const after = screenPointToBoard(pointer, next.pan, next.zoom)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
  })

  it('fits item and section geometry with a five-percent margin', () => {
    const geometry = resolveMoodBoardGeometry(MOOD_BOARD_GOLDEN_FIXTURE)
    const fit = fitBoardGeometry(geometry, { width: 1000, height: 600 })
    expect(fit.zoom).toBeGreaterThanOrEqual(0.05)
    expect(fit.zoom).toBeLessThanOrEqual(4)
    expect(fit.visibleBounds.width).toBeLessThanOrEqual(1000)
    expect(fit.visibleBounds.height).toBeLessThanOrEqual(600)
  })
})

describe('guides and multi-item operations', () => {
  it('keeps guide tolerance constant in screen pixels across zoom', () => {
    const geometry = resolveMoodBoardGeometry(MOOD_BOARD_GOLDEN_FIXTURE)
    const chair = geometry.items.find((item) => item.id === 'chair')!
    const moving = { ...chair.box, x: 286 }

    const atOne = findBoardAlignmentGuides(moving, geometry.items, {
      zoom: 1,
    }).guides
    const atFour = findBoardAlignmentGuides(moving, geometry.items, {
      zoom: 4,
    }).guides
    expect(atOne.filter((guide) => guide.axis === 'x').length).toBeGreaterThan(0)
    expect(atFour.filter((guide) => guide.axis === 'x')).toHaveLength(0)
  })

  it('snaps to an existing equal gap and emits paired spacing markers', () => {
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: 900,
      canvasHeight: 500,
      backgroundColor: '#fff',
      sections: [],
      items: [
        { id: 'a', type: 'image', x: 0, y: 100, width: 100, height: 100, data: {} },
        { id: 'b', type: 'image', x: 200, y: 100, width: 100, height: 100, data: {} },
        { id: 'right', type: 'image', x: 600, y: 100, width: 100, height: 100, data: {} },
      ],
    })
    const result = findBoardSmartGuides(
      { x: 400, y: 100, width: 96, height: 100 },
      geometry.items,
      {
        zoom: 1,
        movingValueIndices: { x: [2], y: [] },
      },
    )

    expect(result.delta).toEqual({ x: 4, y: 0 })
    expect(result.guides.filter((guide) => guide.kind === 'spacing')).toHaveLength(2)
    expect(result.guides.every((guide) => guide.axis === 'x')).toBe(true)
  })

  it('aligns unlocked items while retaining locked items as references', () => {
    const geometry = resolveMoodBoardGeometry({
      ...MOOD_BOARD_GOLDEN_FIXTURE,
      items: MOOD_BOARD_GOLDEN_FIXTURE.items.slice(0, 3).map((item, index) => ({
        ...item,
        id: item.id ?? `image-${index}`,
        locked: index === 0,
      })),
    })
    const patches = alignBoardItems(
      geometry.items,
      geometry.items.map((item) => item.id!),
      'left',
    )
    expect(patches.some((patch) => patch.id === 'chair')).toBe(false)
    expect(patches).toHaveLength(2)
  })

  it('distributes three item centers as one deterministic patch set', () => {
    const geometry = resolveMoodBoardGeometry({
      ...MOOD_BOARD_GOLDEN_FIXTURE,
      items: MOOD_BOARD_GOLDEN_FIXTURE.items.slice(0, 3).map((item, index) => ({
        ...item,
        id: item.id ?? `image-${index}`,
        rotation: 0,
      })),
    })
    const patches = distributeBoardItems(
      geometry.items,
      geometry.items.map((item) => item.id!),
      'horizontal-centers',
    )
    expect(patches).toHaveLength(1)
    const middle = geometry.items.slice().sort((a, b) => a.center.x - b.center.x)[1]!
    expect(patches[0]?.id).toBe(middle.id)
  })
})

describe('canvas auto-grow', () => {
  it('translates the origin for top/left overflow and adds 240px on exceeded edges', () => {
    const geometry = resolveMoodBoardGeometry({
      ...MOOD_BOARD_GOLDEN_FIXTURE,
      canvasWidth: 500,
      canvasHeight: 400,
      sections: [],
      items: [
        {
          id: 'outside',
          type: 'image',
          x: -50,
          y: -25,
          width: 620,
          height: 500,
          data: {},
        },
      ],
    })
    const growth = computeBoardAutoGrow(geometry)
    expect(growth.grew).toBe(true)
    expect(growth.translation).toEqual({ x: 290, y: 265 })
    expect(growth.canvas).toEqual({ width: 1100, height: 980 })
    expect(growth.items[0]).toMatchObject({ id: 'outside', x: 240, y: 240 })
  })
})
