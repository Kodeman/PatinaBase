import type { BoardGeometrySnapshot, BoardSize } from '@patina/types'
import {
  resolveMoodBoardGeometry,
  type MoodBoardGeometryInput,
} from './geometry'
import {
  paintMoodBoardGeometry,
  type MoodBoardImageRequest,
  type MoodBoardPaintResult,
  type MoodBoardPainterContext,
  type MoodBoardResolvedImage,
} from './painter-core'

export const DEFAULT_MOOD_BOARD_EXPORT_SCALE = 2
export const MOOD_BOARD_EXPORT_MAX_EDGE = 8192
export const DEFAULT_MOOD_BOARD_COVER_SIZE = {
  width: 800,
  height: 600,
} as const

export interface MoodBoardRasterCanvas {
  width: number
  height: number
  getContext(type: '2d'): MoodBoardPainterContext | null
  convertToBlob?(options?: { type?: string; quality?: number }): Promise<Blob>
  toBlob?(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void
}

export interface MoodBoardRasterEnvironment {
  createCanvas(width: number, height: number): MoodBoardRasterCanvas
  resolveImage(
    request: MoodBoardImageRequest,
  ): Promise<MoodBoardResolvedImage | null>
  waitForFonts?(): Promise<void>
  encode?(canvas: MoodBoardRasterCanvas, type: 'image/png'): Promise<Blob>
}

export type MoodBoardRasterInput =
  | BoardGeometrySnapshot
  | MoodBoardGeometryInput

export interface MoodBoardPngOptions {
  scale?: number
  maxEdge?: number
  environment?: MoodBoardRasterEnvironment
  onProgress?: (progress: number, itemKey?: string) => void
}

export interface MoodBoardCoverOptions {
  width?: number
  height?: number
  environment?: MoodBoardRasterEnvironment
  onProgress?: (progress: number, itemKey?: string) => void
}

export interface MoodBoardRasterResult extends MoodBoardPaintResult {
  blob: Blob
  width: number
  height: number
  effectiveScale: number
  geometry: BoardGeometrySnapshot
}

function isGeometrySnapshot(
  input: MoodBoardRasterInput,
): input is BoardGeometrySnapshot {
  return (
    typeof (input as BoardGeometrySnapshot).version === 'number' &&
    !!(input as BoardGeometrySnapshot).canvas &&
    Array.isArray((input as BoardGeometrySnapshot).items)
  )
}

function geometryFor(input: MoodBoardRasterInput): BoardGeometrySnapshot {
  return isGeometrySnapshot(input) ? input : resolveMoodBoardGeometry(input)
}

export function computeMoodBoardRasterScale(
  canvas: BoardSize,
  requestedScale = DEFAULT_MOOD_BOARD_EXPORT_SCALE,
  maxEdge = MOOD_BOARD_EXPORT_MAX_EDGE,
): { scale: number; width: number; height: number } {
  const safeRequested =
    Number.isFinite(requestedScale) && requestedScale > 0 ? requestedScale : 1
  const capScale = maxEdge / Math.max(canvas.width, canvas.height)
  const scale = Math.min(safeRequested, capScale)
  return {
    scale,
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  }
}

async function encodeCanvas(
  canvas: MoodBoardRasterCanvas,
  environment: MoodBoardRasterEnvironment,
): Promise<Blob> {
  if (environment.encode) return environment.encode(canvas, 'image/png')
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/png' })
  if (canvas.toBlob) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob!((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas PNG encoding returned no data'))
      }, 'image/png')
    })
  }
  throw new Error('The raster environment cannot encode PNG output')
}

async function paintToRaster(
  geometry: BoardGeometrySnapshot,
  environment: MoodBoardRasterEnvironment,
  output: {
    width: number
    height: number
    scale: number
    offsetX: number
    offsetY: number
  },
  onProgress?: (progress: number, itemKey?: string) => void,
): Promise<MoodBoardRasterResult> {
  await environment.waitForFonts?.()
  const canvas = environment.createCanvas(output.width, output.height)
  canvas.width = output.width
  canvas.height = output.height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('A 2D canvas context is required to paint a mood board')
  const painted = await paintMoodBoardGeometry({
    context,
    geometry,
    transform: {
      scale: output.scale,
      offsetX: output.offsetX,
      offsetY: output.offsetY,
      viewportWidth: output.width,
      viewportHeight: output.height,
    },
    resolveImage: environment.resolveImage,
    onProgress,
  })
  const blob = await encodeCanvas(canvas, environment)
  return {
    ...painted,
    blob,
    width: output.width,
    height: output.height,
    effectiveScale: output.scale,
    geometry,
  }
}

/** Composition-true PNG at 2× by default, uniformly capped at 8192px. */
export async function renderMoodBoardPng(
  input: MoodBoardRasterInput,
  options: MoodBoardPngOptions = {},
): Promise<MoodBoardRasterResult> {
  const geometry = geometryFor(input)
  const output = computeMoodBoardRasterScale(
    geometry.canvas,
    options.scale,
    options.maxEdge,
  )
  return paintToRaster(
    geometry,
    options.environment ?? createDefaultMoodBoardRasterEnvironment(),
    { ...output, offsetX: 0, offsetY: 0 },
    options.onProgress,
  )
}

/** Fixed cover image using the same painter and fit-contain canvas transform. */
export async function renderMoodBoardCover(
  input: MoodBoardRasterInput,
  options: MoodBoardCoverOptions = {},
): Promise<MoodBoardRasterResult> {
  const geometry = geometryFor(input)
  const width = options.width ?? DEFAULT_MOOD_BOARD_COVER_SIZE.width
  const height = options.height ?? DEFAULT_MOOD_BOARD_COVER_SIZE.height
  const scale = Math.min(
    width / geometry.canvas.width,
    height / geometry.canvas.height,
  )
  return paintToRaster(
    geometry,
    options.environment ?? createDefaultMoodBoardRasterEnvironment(),
    {
      width,
      height,
      scale,
      offsetX: (width - geometry.canvas.width * scale) / 2,
      offsetY: (height - geometry.canvas.height * scale) / 2,
    },
    options.onProgress,
  )
}

async function defaultResolveImage(
  request: MoodBoardImageRequest,
): Promise<MoodBoardResolvedImage | null> {
  if (!request.url) return null

  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    const response = await fetch(request.url, {
      mode: 'cors',
      credentials: 'omit',
    })
    if (!response.ok)
      throw new Error(`Image request failed with ${response.status}`)
    const bitmap = await createImageBitmap(await response.blob())
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }

  if (typeof Image !== 'undefined') {
    return new Promise<MoodBoardResolvedImage>((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () =>
        resolve({
          source: image,
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        })
      image.onerror = () =>
        reject(new Error(`Unable to load image for ${request.itemKey}`))
      image.src = request.url!
    })
  }
  return null
}

/** Browser/worker adapter. The core itself remains free of these globals. */
export function createDefaultMoodBoardRasterEnvironment(): MoodBoardRasterEnvironment {
  return {
    createCanvas(width, height) {
      if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(
          width,
          height,
        ) as unknown as MoodBoardRasterCanvas
      }
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        return canvas as unknown as MoodBoardRasterCanvas
      }
      throw new Error(
        'No canvas implementation is available in this environment',
      )
    },
    resolveImage: defaultResolveImage,
    async waitForFonts() {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready
      }
    },
  }
}
