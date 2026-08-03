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
    expect(draw.args.slice(1)).toEqual([0, 37.5, 100, 25])
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
