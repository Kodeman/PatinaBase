import { describe, expect, it, vi } from 'vitest'
import { resolveMoodBoardGeometry } from './geometry'
import {
  MOOD_BOARD_GOLDEN_FIXTURE,
  MOOD_BOARD_GOLDEN_GEOMETRY,
} from './__fixtures__/golden-board'
import {
  paintMoodBoardGeometry,
  type MoodBoardPainterContext,
} from './painter-core'
import {
  MOOD_BOARD_MONO_FONT,
  MOOD_BOARD_VISUAL,
  resolveMoodBoardPlate,
} from './visual-contract'
import {
  computeMoodBoardRasterScale,
  renderMoodBoardCover,
  renderMoodBoardPng,
  type MoodBoardRasterCanvas,
  type MoodBoardRasterEnvironment,
} from './painter'

class RecordingContext implements MoodBoardPainterContext {
  fillStyle = '#000000'
  strokeStyle = '#000000'
  lineWidth = 1
  font = '10px sans-serif'
  textAlign: CanvasTextAlign = 'start'
  textBaseline: CanvasTextBaseline = 'alphabetic'
  globalAlpha = 1
  calls: Array<{ name: string; args: unknown[] }> = []

  private call(name: string, ...args: unknown[]) {
    this.calls.push({ name, args })
  }

  save() {
    this.call('save')
  }
  restore() {
    this.call('restore')
  }
  scale(x: number, y: number) {
    this.call('scale', x, y)
  }
  translate(x: number, y: number) {
    this.call('translate', x, y)
  }
  rotate(radians: number) {
    this.call('rotate', radians)
  }
  fillRect(x: number, y: number, width: number, height: number) {
    this.call('fillRect', x, y, width, height, this.fillStyle)
  }
  strokeRect(x: number, y: number, width: number, height: number) {
    this.call('strokeRect', x, y, width, height, this.strokeStyle)
  }
  beginPath() {
    this.call('beginPath')
  }
  moveTo(x: number, y: number) {
    this.call('moveTo', x, y)
  }
  lineTo(x: number, y: number) {
    this.call('lineTo', x, y)
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    this.call('quadraticCurveTo', cpx, cpy, x, y)
  }
  closePath() {
    this.call('closePath')
  }
  fill() {
    this.call('fill', this.fillStyle)
  }
  stroke() {
    this.call('stroke', this.strokeStyle)
  }
  clip() {
    this.call('clip')
  }
  setLineDash(segments: number[]) {
    this.call('setLineDash', segments)
  }
  drawImage(
    image: unknown,
    dx: number,
    dy: number,
    dWidth: number,
    dHeight: number,
  ) {
    this.call('drawImage', image, dx, dy, dWidth, dHeight)
  }
  fillText(text: string, x: number, y: number, maxWidth?: number) {
    this.call('fillText', text, x, y, maxWidth, this.fillStyle, this.font)
  }
  measureText(text: string) {
    return { width: text.length * 6 }
  }
}

function rasterEnvironment(
  context: RecordingContext,
  order: string[] = [],
): MoodBoardRasterEnvironment {
  const canvas: MoodBoardRasterCanvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  }
  return {
    async waitForFonts() {
      order.push('fonts')
    },
    createCanvas(width, height) {
      order.push(`canvas:${width}x${height}`)
      canvas.width = width
      canvas.height = height
      return canvas
    },
    async resolveImage(request) {
      order.push(`image:${request.itemKey}`)
      return { source: { key: request.itemKey }, width: 400, height: 300 }
    },
    async encode(encodedCanvas) {
      order.push(`encode:${encodedCanvas.width}x${encodedCanvas.height}`)
      return new Blob(['png'], { type: 'image/png' })
    },
  }
}

describe('worker-safe mood-board painter core', () => {
  it('draws background, sections and all six pin families in z order', async () => {
    const context = new RecordingContext()
    const geometry = resolveMoodBoardGeometry(MOOD_BOARD_GOLDEN_FIXTURE)
    const progress = vi.fn()
    const result = await paintMoodBoardGeometry({
      context,
      geometry,
      transform: {
        scale: 2,
        offsetX: 0,
        offsetY: 0,
        viewportWidth: 2400,
        viewportHeight: 1600,
      },
      resolveImage: async (request) =>
        request.itemId === 'scan'
          ? null
          : { source: { key: request.itemKey }, width: 400, height: 300 },
      onProgress: progress,
    })

    expect(result.paintedItemKeys).toEqual(MOOD_BOARD_GOLDEN_GEOMETRY.itemOrder)
    expect(result.warnings).toEqual([
      expect.objectContaining({ itemId: 'scan', reason: 'image-load-failed' }),
    ])
    expect(context.calls[1]?.name).toBe('fillRect')
    expect(context.calls[1]?.args.slice(0, 4)).toEqual([0, 0, 2400, 1600])
    expect(
      context.calls.some((call) => call.name === 'scale' && call.args[0] === 2),
    ).toBe(true)
    expect(
      context.calls.filter((call) => call.name === 'drawImage'),
    ).toHaveLength(3)
    expect(
      context.calls.some(
        (call) =>
          call.name === 'rotate' &&
          Math.abs((call.args[0] as number) - Math.PI / 6) < 0.0001,
      ),
    ).toBe(true)
    expect(
      context.calls.some(
        (call) =>
          call.name === 'fillText' && String(call.args[0]).includes('Quiet'),
      ),
    ).toBe(true)
    expect(
      context.calls.some(
        (call) => call.name === 'fillText' && call.args[0] === 'maker.example',
      ),
    ).toBe(true)
    expect(progress.mock.lastCall?.[0]).toBe(1)
  })

  it('contains images within their boxes instead of cropping them', async () => {
    const context = new RecordingContext()
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: 200,
      canvasHeight: 100,
      backgroundColor: '#fff',
      sections: [],
      items: [
        {
          id: 'wide',
          type: 'image',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          imageUrl: 'x',
          data: {},
        },
      ],
    })
    await paintMoodBoardGeometry({
      context,
      geometry,
      transform: {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        viewportWidth: 200,
        viewportHeight: 100,
      },
      resolveImage: async () => ({ source: {}, width: 400, height: 100 }),
    })
    const draw = context.calls.find((call) => call.name === 'drawImage')!
    // Contained inside the plate's 1px card edge (US-28 S12): 98 x 98 media.
    expect(draw.args.slice(1)).toEqual([1, 37.75, 98, 24.5])
  })

  it('paints a product as a plate and a whole caption, never clamped (US-28 S12)', async () => {
    const context = new RecordingContext()
    const name =
      'Arden lounge chair in a long bouclé with walnut legs and a deep seat'
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: 400,
      canvasHeight: 400,
      backgroundColor: '#FCFAF6',
      sections: [],
      items: [
        {
          id: 'arden',
          type: 'product',
          x: 0,
          y: 0,
          width: 180,
          height: 260,
          data: {
            name,
            image_url: 'arden.jpg',
            vendor_name: 'Calloway & Brandt Upholstery',
            price_cents: 418000,
            source_url: 'https://www.maker.example/arden',
          },
        },
      ],
    })
    await paintMoodBoardGeometry({
      context,
      geometry,
      transform: { scale: 1, offsetX: 0, offsetY: 0, viewportWidth: 400, viewportHeight: 400 },
      resolveImage: async () => ({ source: {}, width: 300, height: 200 }),
    })
    const texts = context.calls
      .filter((call) => call.name === 'fillText')
      .map((call) => String(call.args[0]))
    // Every word of the name prints, across as many lines as it needs.
    const nameLines = texts.filter((text) => name.includes(text))
    expect(nameLines.length).toBeGreaterThan(2)
    expect(nameLines.join(' ')).toBe(name)
    expect(texts.some((text) => text.includes('…'))).toBe(false)
    expect(texts.join(' ')).toContain('Calloway & Brandt Upholstery · $4,180')
    expect(texts).toContain('maker.example')
    // The plate's 1px card edge, then nothing white, nothing filled as a card.
    expect(
      context.calls.some(
        (call) => call.name === 'stroke' && call.args[0] === MOOD_BOARD_VISUAL.colors.cardEdge,
      ),
    ).toBe(true)
    expect(
      context.calls.some(
        (call) =>
          (call.name === 'fill' || call.name === 'fillRect') &&
          String(call.args.at(-1)).toLowerCase() === '#ffffff',
      ),
    ).toBe(false)
    // The caption sits under the plate, which gave up height to it.
    const draw = context.calls.find((call) => call.name === 'drawImage')!
    const plateBottom = (draw.args[2] as number) + (draw.args[4] as number)
    const captionTops = context.calls
      .filter((call) => call.name === 'fillText')
      .map((call) => call.args[2] as number)
    expect(Math.min(...captionTops)).toBeGreaterThan(plateBottom)
  })

  it('keeps the plate at its minimum and grows the item for a long caption (R13)', () => {
    const { plateMin, caption } = MOOD_BOARD_VISUAL
    // A roomy tile: the plate gives up exactly the caption's height.
    expect(resolveMoodBoardPlate(200, 200, 40)).toEqual({
      plate: { x: 0, y: 0, width: 200, height: 160 },
      captionTop: 160 + caption.gap,
    })
    // The canvas's smallest tile with a caption taller than it: the plate
    // stays at plateMin and the caption starts under it, past the saved box.
    expect(resolveMoodBoardPlate(40, 40, 264)).toEqual({
      plate: { x: 0, y: 0, width: 40, height: plateMin },
      captionTop: plateMin + caption.gap,
    })
  })

  it('paints a long caption whole under a kept plate at the minimum tile size (R13)', async () => {
    const context = new RecordingContext()
    const name = 'Halyard lounge chair in a long walnut and boucle finish'
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: 400,
      canvasHeight: 400,
      backgroundColor: '#FCFAF6',
      sections: [],
      items: [
        {
          id: 'halyard',
          type: 'product',
          x: 0,
          y: 0,
          width: 40,
          height: 40,
          data: { name, image_url: 'halyard.jpg', vendor_name: 'West Elm' },
        },
      ],
    })
    await paintMoodBoardGeometry({
      context,
      geometry,
      transform: { scale: 1, offsetX: 0, offsetY: 0, viewportWidth: 400, viewportHeight: 400 },
      resolveImage: async () => ({ source: {}, width: 300, height: 200 }),
    })
    const texts = context.calls.filter((call) => call.name === 'fillText')
    // At 40px the name breaks inside words (overflow-wrap: anywhere); every
    // letter of the name, then the facts, still prints in order.
    expect(texts.length).toBeGreaterThan(4)
    expect(texts.map((call) => String(call.args[0])).join('').replace(/\s+/g, '')).toBe(
      `${name}West Elm`.replace(/\s+/g, ''),
    )
    expect(texts.some((call) => String(call.args[0]).includes('…'))).toBe(false)
    // The photo still paints, contained in a plate that kept its 40px.
    const draw = context.calls.find((call) => call.name === 'drawImage')!
    expect(draw.args[4] as number).toBeGreaterThan(20)
    const captionTops = texts.map((call) => call.args[2] as number)
    expect(Math.min(...captionTops)).toBeGreaterThan(MOOD_BOARD_VISUAL.plateMin)
    // The caption runs past the 40px saved box rather than being cut.
    expect(Math.max(...captionTops)).toBeGreaterThan(40)
  })

  it('paints zones as a dashed edge with an ink word: no fill, no pill (US-28 S12)', async () => {
    const context = new RecordingContext()
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: 800,
      canvasHeight: 600,
      backgroundColor: '#FCFAF6',
      sections: [{ id: 'pieces', name: 'Pieces', color: '#718573' }],
      items: [
        {
          id: 'lamp',
          type: 'image',
          x: 40,
          y: 40,
          width: 120,
          height: 120,
          imageUrl: 'x',
          data: { section_id: 'pieces' },
        },
      ],
    })
    await paintMoodBoardGeometry({
      context,
      geometry,
      transform: { scale: 1, offsetX: 0, offsetY: 0, viewportWidth: 800, viewportHeight: 600 },
      resolveImage: async () => ({ source: {}, width: 100, height: 100 }),
    })
    const section = geometry.sections[0]!
    expect(
      context.calls.some((call) => call.name === 'stroke' && call.args[0] === '#718573'),
    ).toBe(true)
    expect(
      context.calls.some(
        (call) => (call.name === 'fill' || call.name === 'fillRect') && call.args.at(-1) === '#718573',
      ),
    ).toBe(false)
    const word = context.calls.find(
      (call) => call.name === 'fillText' && call.args[0] === 'PIECES',
    )!
    expect(word).toBeDefined()
    expect(word.args[1]).toBe(section.bounds.x + MOOD_BOARD_VISUAL.zoneWordInsetX)
    expect(word.args[4]).toBe(MOOD_BOARD_VISUAL.colors.text)
    expect(String(word.args[5])).toContain(MOOD_BOARD_MONO_FONT)
  })

  it('never paints selection, handles, drop targets or any canvas chrome into an export (US-28 S12)', async () => {
    const context = new RecordingContext()
    const geometry = resolveMoodBoardGeometry(MOOD_BOARD_GOLDEN_FIXTURE)
    await paintMoodBoardGeometry({
      context,
      geometry,
      transform: { scale: 1, offsetX: 0, offsetY: 0, viewportWidth: 1200, viewportHeight: 800 },
      resolveImage: async (request) => ({ source: { key: request.itemKey }, width: 400, height: 300 }),
    })
    const swatches = MOOD_BOARD_GOLDEN_FIXTURE.items.flatMap((item) =>
      Array.isArray(item.data?.swatches)
        ? (item.data.swatches as Array<{ hex: string }>).map((swatch) => swatch.hex)
        : [],
    )
    const allowed = new Set(
      [
        MOOD_BOARD_GOLDEN_FIXTURE.backgroundColor,
        ...Object.values(MOOD_BOARD_VISUAL.colors),
        ...MOOD_BOARD_GOLDEN_FIXTURE.sections.map((section) => section.color),
        ...swatches,
      ].map((color) => String(color).toLowerCase()),
    )
    const painted = context.calls
      .filter((call) => ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText'].includes(call.name))
      .map((call) =>
        String(call.name === 'fillText' ? call.args[4] : call.args.at(-1)).toLowerCase(),
      )
    // Only the board, its zones' edges, its items and their words: never the
    // clay-ink selection ring, a handle, a drop-target edge or a guide.
    expect(painted.filter((color) => !allowed.has(color))).toEqual([])
    expect(painted).not.toContain('#7c5e30')
  })

  it('prints a note as text on the oak note edge, with no fill (US-28 S12)', async () => {
    const context = new RecordingContext()
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: 400,
      canvasHeight: 300,
      backgroundColor: '#FCFAF6',
      sections: [],
      items: [
        {
          id: 'note',
          type: 'note',
          x: 0,
          y: 0,
          width: 240,
          height: 120,
          content: 'What repeats? What contrasts?',
          data: {},
        },
      ],
    })
    await paintMoodBoardGeometry({
      context,
      geometry,
      transform: { scale: 1, offsetX: 0, offsetY: 0, viewportWidth: 400, viewportHeight: 300 },
    })
    const fills = context.calls.filter(
      (call) => (call.name === 'fill' || call.name === 'fillRect') && call.args.at(-1) !== '#FCFAF6',
    )
    expect(fills).toEqual([
      expect.objectContaining({
        name: 'fillRect',
        args: [0, 0, MOOD_BOARD_VISUAL.note.edge, 120, MOOD_BOARD_VISUAL.colors.noteEdge],
      }),
    ])
    const text = context.calls.find((call) => call.name === 'fillText')!
    expect(text.args[1]).toBe(MOOD_BOARD_VISUAL.note.edge + MOOD_BOARD_VISUAL.note.padLeft)
    expect(text.args[4]).toBe(MOOD_BOARD_VISUAL.colors.muted)
  })

  it('exports 100 image pins with bounded parallel loading, monotonic progress and cooperative yields', async () => {
    const context = new RecordingContext()
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: 2000,
      canvasHeight: 1400,
      backgroundColor: '#faf8f5',
      sections: [],
      items: Array.from({ length: 100 }, (_, index) => ({
        id: `pin-${index}`,
        type: 'image' as const,
        x: (index % 10) * 190,
        y: Math.floor(index / 10) * 130,
        width: 160,
        height: 100,
        zIndex: index,
        imageUrl: `https://images.example/${index}.png`,
        data: { name: `Reference ${index}` },
      })),
    })
    const progress: number[] = []
    let activeLoads = 0
    let maxActiveLoads = 0
    let yieldCount = 0
    let heartbeatCount = 0
    const heartbeat = setInterval(() => {
      heartbeatCount += 1
    }, 0)
    const started = performance.now()
    try {
      const result = await paintMoodBoardGeometry({
        context,
        geometry,
        transform: {
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          viewportWidth: 2000,
          viewportHeight: 1400,
        },
        imageLoadConcurrency: 8,
        resolveImage: async () => {
          activeLoads += 1
          maxActiveLoads = Math.max(maxActiveLoads, activeLoads)
          await new Promise<void>((resolve) => setTimeout(resolve, 2))
          activeLoads -= 1
          return { source: {}, width: 160, height: 100 }
        },
        onProgress: (value) => progress.push(value),
        yieldControl: async () => {
          yieldCount += 1
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
        },
      })
      expect(result.paintedItemKeys).toHaveLength(100)
    } finally {
      clearInterval(heartbeat)
    }
    const elapsedMs = performance.now() - started

    expect(elapsedMs).toBeLessThan(10_000)
    expect(maxActiveLoads).toBe(8)
    expect(yieldCount).toBeGreaterThan(0)
    expect(heartbeatCount).toBeGreaterThan(0)
    expect(progress.at(-1)).toBe(1)
    expect(progress.length).toBeGreaterThan(100)
    expect(
      progress.every((value, index) => index === 0 || value >= progress[index - 1]!),
    ).toBe(true)
  })
})

describe('PNG and cover raster wrappers', () => {
  it('uses 2x output and uniformly caps the longest edge at 8192px', () => {
    expect(computeMoodBoardRasterScale({ width: 1200, height: 800 })).toEqual({
      scale: 2,
      width: 2400,
      height: 1600,
    })
    const capped = computeMoodBoardRasterScale({ width: 5000, height: 3000 })
    expect(capped.width).toBe(8192)
    expect(capped.height).toBe(4915)
    expect(capped.scale).toBeCloseTo(1.6384, 6)
  })

  it('waits for fonts, paints, then encodes a 2x PNG', async () => {
    const context = new RecordingContext()
    const order: string[] = []
    const result = await renderMoodBoardPng(MOOD_BOARD_GOLDEN_FIXTURE, {
      environment: rasterEnvironment(context, order),
    })
    expect(result).toMatchObject({
      width: 2400,
      height: 1600,
      effectiveScale: 2,
    })
    expect(result.blob.type).toBe('image/png')
    expect(order[0]).toBe('fonts')
    expect(order[1]).toBe('canvas:2400x1600')
    expect(order.at(-1)).toBe('encode:2400x1600')
  })

  it('falls back to the system font stack when document font readiness rejects', async () => {
    const context = new RecordingContext()
    const order: string[] = []
    const environment = rasterEnvironment(context, order)
    environment.waitForFonts = async () => {
      order.push('fonts:rejected')
      throw new Error('forced font load failure')
    }

    const result = await renderMoodBoardPng(MOOD_BOARD_GOLDEN_FIXTURE, {
      environment,
    })

    expect(result.blob.type).toBe('image/png')
    expect(order[0]).toBe('fonts:rejected')
    expect(order[1]).toBe('canvas:2400x1600')
    expect(
      context.calls.some(
        (call) =>
          call.name === 'fillText' && String(call.args.at(-1)).includes('system-ui'),
      ),
    ).toBe(true)
  })

  it('renders an 800x600 fit-contain cover through the same painter', async () => {
    const context = new RecordingContext()
    const result = await renderMoodBoardCover(MOOD_BOARD_GOLDEN_FIXTURE, {
      environment: rasterEnvironment(context),
    })
    expect(result).toMatchObject({ width: 800, height: 600 })
    expect(result.effectiveScale).toBeCloseTo(2 / 3, 6)
    expect(
      context.calls.some(
        (call) =>
          call.name === 'translate' &&
          Math.abs((call.args[1] as number) - 33.333333) < 0.001,
      ),
    ).toBe(true)
  })
})
