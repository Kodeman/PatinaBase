/// <reference lib="webworker" />

/**
 * palette-quantize.worker.ts
 *
 * Web worker that runs a median-cut color-quantization pass on raw RGBA
 * pixel data and returns the top-K dominant colors (plus a representative
 * source pixel for each).
 *
 * This is intentionally self-contained — no external deps — so the worker
 * bundle stays tiny and there is no "DOM-only" import (e.g. `Image`) that
 * would explode when this is instantiated in a non-DOM worker context.
 *
 * Protocol:
 *   Host posts:
 *     {
 *       type: 'quantize',
 *       width: number,
 *       height: number,
 *       pixels: Uint8ClampedArray,   // RGBA, length = width*height*4
 *       k: number                    // number of clusters to produce
 *     }
 *
 *   Worker replies:
 *     { type: 'result', swatches: Array<{ hex: string; sourcePixel: { x: number; y: number } }> }
 *   or
 *     { type: 'error', message: string }
 */

interface Pixel {
  r: number
  g: number
  b: number
  index: number // index into the original ImageData
}

interface QuantizeRequest {
  type: 'quantize'
  width: number
  height: number
  pixels: Uint8ClampedArray
  k: number
}

interface QuantizeResult {
  type: 'result'
  swatches: Array<{ hex: string; sourcePixel: { x: number; y: number } }>
}

interface QuantizeError {
  type: 'error'
  message: string
}

function toHex(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)))
  return v.toString(16).padStart(2, '0')
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/**
 * Recursive median-cut: split the pixel population on the channel with
 * the largest spread until we have K buckets.
 */
function medianCut(pixels: Pixel[], depth: number, target: number): Pixel[][] {
  if (pixels.length === 0) return []
  if (depth >= Math.log2(target) || pixels.length <= 1) {
    return [pixels]
  }

  let rMin = 255, rMax = 0
  let gMin = 255, gMax = 0
  let bMin = 255, bMax = 0
  for (const p of pixels) {
    if (p.r < rMin) rMin = p.r
    if (p.r > rMax) rMax = p.r
    if (p.g < gMin) gMin = p.g
    if (p.g > gMax) gMax = p.g
    if (p.b < bMin) bMin = p.b
    if (p.b > bMax) bMax = p.b
  }

  const rRange = rMax - rMin
  const gRange = gMax - gMin
  const bRange = bMax - bMin

  let channel: 'r' | 'g' | 'b' = 'r'
  if (gRange >= rRange && gRange >= bRange) channel = 'g'
  else if (bRange >= rRange && bRange >= gRange) channel = 'b'

  pixels.sort((a, b) => a[channel] - b[channel])
  const mid = Math.floor(pixels.length / 2)
  const left = pixels.slice(0, mid)
  const right = pixels.slice(mid)

  return [
    ...medianCut(left, depth + 1, target),
    ...medianCut(right, depth + 1, target),
  ]
}

/**
 * Take the average color of a bucket and pick the pixel closest to that
 * average as the "representative" source pixel.
 */
function bucketSwatch(
  bucket: Pixel[],
  width: number
): { hex: string; sourcePixel: { x: number; y: number } } {
  let rSum = 0, gSum = 0, bSum = 0
  for (const p of bucket) {
    rSum += p.r
    gSum += p.g
    bSum += p.b
  }
  const rAvg = rSum / bucket.length
  const gAvg = gSum / bucket.length
  const bAvg = bSum / bucket.length

  // Find the pixel closest to the centroid.
  let bestDist = Infinity
  let bestPixel = bucket[0]
  for (const p of bucket) {
    const d =
      (p.r - rAvg) * (p.r - rAvg) +
      (p.g - gAvg) * (p.g - gAvg) +
      (p.b - bAvg) * (p.b - bAvg)
    if (d < bestDist) {
      bestDist = d
      bestPixel = p
    }
  }

  const x = bestPixel.index % width
  const y = Math.floor(bestPixel.index / width)
  return { hex: rgbToHex(rAvg, gAvg, bAvg), sourcePixel: { x, y } }
}

function quantize(req: QuantizeRequest): QuantizeResult {
  const { width, pixels, k } = req
  const targetK = Math.max(1, Math.min(16, k))

  // Subsample heavily — every Nth pixel — so the median-cut runs in
  // milliseconds even on a large image. The downsample-to-800px happens
  // host-side; this is the second cushion.
  const stride = Math.max(1, Math.floor(pixels.length / 4 / 4000))

  const sample: Pixel[] = []
  for (let i = 0, idx = 0; i < pixels.length; i += 4 * stride, idx += stride) {
    const a = pixels[i + 3]
    if (a === 0) continue // ignore transparent
    sample.push({
      r: pixels[i],
      g: pixels[i + 1],
      b: pixels[i + 2],
      index: i / 4,
    })
  }

  if (sample.length === 0) {
    return { type: 'result', swatches: [] }
  }

  const buckets = medianCut(sample, 0, targetK).slice(0, targetK)
  const swatches = buckets
    .filter((b) => b.length > 0)
    .map((b) => bucketSwatch(b, width))

  return { type: 'result', swatches }
}

// ─── Worker entry ─────────────────────────────────────────────────────────────

self.addEventListener('message', (event: MessageEvent<QuantizeRequest>) => {
  const data = event.data
  try {
    if (!data || data.type !== 'quantize') {
      const err: QuantizeError = {
        type: 'error',
        message: `Unknown message type: ${(data as { type?: string })?.type ?? 'undefined'}`,
      }
      ;(self as unknown as Worker).postMessage(err)
      return
    }
    const result = quantize(data)
    ;(self as unknown as Worker).postMessage(result)
  } catch (err) {
    const errMsg: QuantizeError = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Quantize failed',
    }
    ;(self as unknown as Worker).postMessage(errMsg)
  }
})

export {}
