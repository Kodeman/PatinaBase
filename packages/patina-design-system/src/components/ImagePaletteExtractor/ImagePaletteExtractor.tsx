'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedSwatch {
  hex: string
  sourcePixel: { x: number; y: number }
}

export interface ImagePaletteExtractorProps {
  /** URL to the image. May be cross-origin if the server allows CORS. */
  imageUrl: string
  /** Number of clusters to produce. Defaults to 5. Clamped to 1..16. */
  k?: number
  /** Called once when extraction completes. */
  onExtracted: (swatches: ExtractedSwatch[]) => void
  /** Optional className applied to the wrapper. */
  className?: string
  /** Set to false to suppress the inline preview + extracted swatch row. */
  showPreview?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_EDGE = 800

/**
 * Load an image and return the underlying ImageData scaled so the longest
 * edge is at most MAX_EDGE. crossOrigin is set so the canvas is not
 * tainted (the host needs to serve the image with CORS headers; in
 * practice Supabase Storage public buckets do).
 */
function loadImageData(url: string): Promise<{ width: number; height: number; pixels: Uint8ClampedArray }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1
        const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        let imageData: ImageData
        try {
          imageData = ctx.getImageData(0, 0, w, h)
        } catch (err) {
          reject(err instanceof Error ? err : new Error('getImageData failed (CORS?)'))
          return
        }
        resolve({ width: w, height: h, pixels: imageData.data })
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Image processing failed'))
      }
    }
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Spawn the palette-quantize worker. Bundlers (Vite/webpack 5) understand
 * the `new Worker(new URL(...), { type: 'module' })` pattern.
 */
function spawnWorker(): Worker {
  return new Worker(new URL('../../workers/palette-quantize.worker.ts', import.meta.url), {
    type: 'module',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ImagePaletteExtractor — runs k-means quantization on an image (in a
 * web worker) and emits the top-K dominant colors via `onExtracted`.
 *
 * Implementation notes:
 *  - Image is downsampled to a maximum edge of 800px before being read
 *    into ImageData, so the worker pass is bounded to <640k pixels.
 *  - The worker runs a median-cut pass (no external deps).
 *  - If the canvas read throws (cross-origin), we surface the error in
 *    `error` state and emit nothing.
 */
export function ImagePaletteExtractor({
  imageUrl,
  k = 5,
  onExtracted,
  className,
  showPreview = true,
}: ImagePaletteExtractorProps) {
  const [swatches, setSwatches] = React.useState<ExtractedSwatch[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const onExtractedRef = React.useRef(onExtracted)
  React.useEffect(() => {
    onExtractedRef.current = onExtracted
  }, [onExtracted])

  React.useEffect(() => {
    if (!imageUrl) return
    let cancelled = false
    let worker: Worker | null = null

    async function run() {
      setLoading(true)
      setError(null)
      setSwatches([])

      let imgData: { width: number; height: number; pixels: Uint8ClampedArray }
      try {
        imgData = await loadImageData(imageUrl)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Image load failed')
          setLoading(false)
        }
        return
      }
      if (cancelled) return

      try {
        worker = spawnWorker()
      } catch (err) {
        // Some test/server environments (jsdom) won't allow Workers;
        // surface the error rather than crashing.
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Worker creation failed')
          setLoading(false)
        }
        return
      }

      const w = worker
      const handle = (event: MessageEvent) => {
        if (cancelled) return
        const data = event.data
        if (data?.type === 'result') {
          const result = data.swatches as ExtractedSwatch[]
          setSwatches(result)
          onExtractedRef.current(result)
          setLoading(false)
        } else if (data?.type === 'error') {
          setError(typeof data.message === 'string' ? data.message : 'Quantize error')
          setLoading(false)
        }
        w.removeEventListener('message', handle)
        w.terminate()
      }
      w.addEventListener('message', handle)
      w.addEventListener('error', () => {
        if (cancelled) return
        setError('Worker error')
        setLoading(false)
        w.removeEventListener('message', handle)
        w.terminate()
      })

      // Transfer the buffer so we don't allocate a copy. The host's
      // ImageData copy is dropped immediately after we postMessage.
      w.postMessage(
        {
          type: 'quantize',
          width: imgData.width,
          height: imgData.height,
          pixels: imgData.pixels,
          k,
        },
        [imgData.pixels.buffer]
      )
    }

    void run()
    return () => {
      cancelled = true
      if (worker) {
        try {
          worker.terminate()
        } catch {
          // ignore
        }
      }
    }
  }, [imageUrl, k])

  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      {showPreview && imageUrl && (
        <div className="relative overflow-hidden rounded-md border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Source for palette extraction"
            className="block h-auto w-full max-h-[400px] object-contain"
            crossOrigin="anonymous"
          />
        </div>
      )}

      {loading && (
        <p className="text-xs text-muted-foreground">Extracting palette…</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {showPreview && swatches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {swatches.map((s, i) => (
            <div
              key={`${s.hex}-${i}`}
              className="flex flex-col items-start gap-1"
              title={s.hex}
            >
              <div
                className="h-12 w-12 rounded border border-border"
                style={{ backgroundColor: s.hex }}
              />
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                {s.hex}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
