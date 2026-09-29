// US-14 arrival — the card's faces. next/font sets the family variables on <body> (globals.css,
// "must be on body (not :root)"); the literal families are the fallback.
import { BUDGET } from './types'
import type { Host } from './types'

const VARS = [
  ['--font-heading', "'Playfair Display'"],
  ['--font-inter', "'Inter'"],
  ['--font-mono', "'DM Mono'"],
] as const

/** [heading, body, meta]: the first family of each body custom property (next/font appends its
 *  metric fallback), else the literal family. The one face reader: `host.faces()` is this. */
export function readFaces(doc: Document = document): string[] {
  const cs = doc.defaultView?.getComputedStyle(doc.body)
  return VARS.map(([name, fallback]) => cs?.getPropertyValue(name).split(',')[0]?.trim() || fallback)
}

/** arrival.js:868 — every face the card sets. */
function descriptors(faces: string[]): string[] {
  const [display, body, meta] = [
    faces[0] || VARS[0][1],
    faces[1] || VARS[1][1],
    faces[2] || VARS[2][1],
  ]
  return [
    `500 34px ${display}`, `500 20px ${display}`,
    `400 16px ${body}`, `400 14px ${body}`,
    `400 11px ${meta}`, `500 11px ${meta}`,
  ]
}

/**
 * Every face loaded, or false: a timeout, a rejection or a face that resolves to nothing never plays
 * the card in a fallback face (arrival.js:870-873).
 */
export function loadFaces(host: Host, timeoutMs: number = BUDGET.FONTS_MS): Promise<boolean> {
  const set = typeof document !== 'undefined' ? document.fonts : undefined
  if (!set || typeof set.load !== 'function') return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    let loads: Promise<FontFace[]>[]
    try {
      loads = descriptors(host.faces()).map((f) => set.load(f))
    } catch {
      done(false)
      return
    }
    Promise.all(loads).then(
      (all) => done(all.every((faces) => faces.length > 0)),
      () => done(false),
    )
  })
}
