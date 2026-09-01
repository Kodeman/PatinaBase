import { describe, expect, it } from 'vitest'
import {
  alignBoardItems,
  computeBoardAutoGrow,
  distributeBoardItems,
  findBoardAlignmentGuides,
  findBoardCascadePlacement,
  findBoardSmartGuides,
  fitBoardGeometry,
  marqueeIntersections,
  resolveMoodBoardGeometry,
  rotateBoardVector,
  rotatedResizeAnchorCorrection,
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

  it('grows to whole pixels even when the overflowing pin is rotated', () => {
    const geometry = resolveMoodBoardGeometry({
      ...MOOD_BOARD_GOLDEN_FIXTURE,
      canvasWidth: 500,
      canvasHeight: 400,
      sections: [],
      items: [
        {
          id: 'tilted',
          type: 'image',
          x: 320,
          y: 240,
          width: 220,
          height: 180,
          rotation: 30,
          data: {},
        },
      ],
    })
    const growth = computeBoardAutoGrow(geometry)
    expect(growth.grew).toBe(true)
    // A fractional canvas is unwritable: canvas_width/canvas_height are
    // integer columns and apply_board_room_state rejects anything else.
    expect(Number.isInteger(growth.canvas.width)).toBe(true)
    expect(Number.isInteger(growth.canvas.height)).toBe(true)
  })
})

describe('findBoardCascadePlacement (CI-11)', () => {
  it('returns the base point untouched when nothing occupies it', () => {
    const point = findBoardCascadePlacement({ x: 100, y: 200 }, [])
    expect(point).toEqual({ x: 100, y: 200 })
  })

  it('steps by (24, 24) past every occupied slot until a free one is found', () => {
    const base = { x: 100, y: 200 }
    const occupied = [
      { x: 100, y: 200 },
      { x: 124, y: 224 },
      { x: 148, y: 248 },
    ]
    const point = findBoardCascadePlacement(base, occupied)
    expect(point).toEqual({ x: 172, y: 272 })
  })

  it('is insensitive to sub-pixel drift within tolerance, so re-adding near a prior slot still cascades', () => {
    const base = { x: 100, y: 200 }
    const occupied = [{ x: 100.5, y: 199.7 }]
    const point = findBoardCascadePlacement(base, occupied)
    expect(point).toEqual({ x: 124, y: 224 })
  })

  it('honors a custom step and tolerance', () => {
    const base = { x: 0, y: 0 }
    const occupied = [{ x: 0, y: 0 }]
    const point = findBoardCascadePlacement(base, occupied, { step: 10 })
    expect(point).toEqual({ x: 10, y: 10 })
  })

  it('treats avoidRects (e.g. section-band bounds, label included) as occupied, so a click-add never lands under a band', () => {
    const base = { x: 50, y: 50 }
    const bandRect = { x: 0, y: 0, width: 200, height: 100 }
    const point = findBoardCascadePlacement(base, [], {
      avoidRects: [bandRect],
    })
    // Attempts 0-2 (50,50 / 74,74 / 98,98) all still land inside the band;
    // attempt 3 (122,122) clears its bottom edge.
    expect(point).toEqual({ x: 122, y: 122 })
  })

  it('combines occupied points and avoidRects — a slot must clear both', () => {
    const base = { x: 0, y: 0 }
    const bandRect = { x: 0, y: 0, width: 30, height: 30 }
    const occupied = [{ x: 48, y: 48 }]
    const point = findBoardCascadePlacement(base, occupied, {
      avoidRects: [bandRect],
    })
    // attempt 0 (0,0) is inside the band; attempt 1 (24,24) is inside the
    // band too; attempt 2 (48,48) clears the band but hits the occupied
    // item; attempt 3 (72,72) is the first free slot.
    expect(point).toEqual({ x: 72, y: 72 })
  })

  it('falls back to the final cascade point rather than looping forever once maxAttempts is exhausted', () => {
    const base = { x: 0, y: 0 }
    const maxAttempts = 5
    const occupied = Array.from({ length: maxAttempts }, (_, attempt) => ({
      x: base.x + 24 * attempt,
      y: base.y + 24 * attempt,
    }))
    const point = findBoardCascadePlacement(base, occupied, { maxAttempts })
    expect(point).toEqual({ x: 24 * maxAttempts, y: 24 * maxAttempts })
  })
})

describe('rotated resize frame (CI-07)', () => {
  it('leaves an unrotated vector alone', () => {
    expect(rotateBoardVector({ x: 30, y: -12 }, 0)).toEqual({ x: 30, y: -12 })
  })

  it('counter-rotates a pointer delta into a rotated pin\u2019s local frame', () => {
    // A pin rotated 90deg: dragging the pointer 10px right pushes its local
    // -y edge, not its local +x edge.
    const local = rotateBoardVector({ x: 10, y: 0 }, -90)
    expect(local.x).toBeCloseTo(0, 6)
    expect(local.y).toBeCloseTo(-10, 6)
  })

  it('rotates past a half turn and past a three-quarter turn', () => {
    const half = rotateBoardVector({ x: 10, y: 0 }, 180)
    expect(half.x).toBeCloseTo(-10, 6)
    expect(half.y).toBeCloseTo(0, 6)

    const threeQuarter = rotateBoardVector({ x: 3, y: 4 }, -270)
    expect(threeQuarter.x).toBeCloseTo(-4, 6)
    expect(threeQuarter.y).toBeCloseTo(3, 6)
  })

  it('round-trips through the item frame and back', () => {
    const delta = { x: 17, y: -4 }
    const back = rotateBoardVector(rotateBoardVector(delta, -37), 37)
    expect(back.x).toBeCloseTo(delta.x, 6)
    expect(back.y).toBeCloseTo(delta.y, 6)
  })

  it('needs no correction when the pin is not rotated', () => {
    expect(
      rotatedResizeAnchorCorrection(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 140, height: 100 },
        { x: 0, y: 0 },
        0,
      ),
    ).toEqual({ x: 0, y: 0 })
  })

  // Expected values are worked by hand from
  //   correction = (centreBefore - centreAfter) + R(deg)(offsetBefore - offsetAfter)
  // so a sign or transposition error in the implementation cannot satisfy them.
  it.each([
    {
      label: 'se handle at +30deg anchors the NW corner',
      before: { x: 0, y: 0, width: 100, height: 100 },
      after: { x: 0, y: 0, width: 160, height: 140 },
      anchor: { x: 0, y: 0 },
      degrees: 30,
      expected: { x: -14.019238, y: 12.320508 },
    },
    {
      label: 's handle at -45deg anchors the top edge',
      before: { x: 10, y: 20, width: 200, height: 100 },
      after: { x: 10, y: 20, width: 200, height: 160 },
      anchor: { x: 0.5, y: 0 },
      degrees: -45,
      expected: { x: 21.213203, y: -8.786797 },
    },
    {
      label: 'w handle at +135deg anchors the east edge',
      before: { x: 0, y: 0, width: 80, height: 80 },
      after: { x: 0, y: 0, width: 120, height: 80 },
      anchor: { x: 1, y: 0.5 },
      degrees: 135,
      expected: { x: -5.857864, y: -14.142136 },
    },
  ])('$label', ({ before, after, anchor, degrees, expected }) => {
    const correction = rotatedResizeAnchorCorrection(
      before,
      after,
      anchor,
      degrees,
    )
    expect(correction.x).toBeCloseTo(expected.x, 5)
    expect(correction.y).toBeCloseTo(expected.y, 5)
  })

  it('actually holds the anchor still once the correction is applied', () => {
    const before = { x: 0, y: 0, width: 100, height: 100 }
    const after = { x: 0, y: 0, width: 160, height: 140 }
    const anchor = { x: 0, y: 0 }
    const degrees = 30
    const renderedAnchor = (rect: typeof before) => {
      const offset = rotateBoardVector(
        {
          x: (anchor.x - 0.5) * rect.width,
          y: (anchor.y - 0.5) * rect.height,
        },
        degrees,
      )
      return {
        x: rect.x + rect.width / 2 + offset.x,
        y: rect.y + rect.height / 2 + offset.y,
      }
    }
    const correction = rotatedResizeAnchorCorrection(
      before,
      after,
      anchor,
      degrees,
    )
    const corrected = {
      ...after,
      x: after.x + correction.x,
      y: after.y + correction.y,
    }
    expect(renderedAnchor(corrected).x).toBeCloseTo(renderedAnchor(before).x, 6)
    expect(renderedAnchor(corrected).y).toBeCloseTo(renderedAnchor(before).y, 6)
    // Without the correction the anchor really does drift — the defect.
    expect(renderedAnchor(after).x).not.toBeCloseTo(renderedAnchor(before).x, 3)
  })
})
