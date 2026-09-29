/**
 * US-14 arrival — FACES: families from the body's next/font variables, every face loaded inside FONTS_MS or no
 * arrival (B9: never the card in a fallback face).
 */
import { loadFaces, readFaces } from '../faces'
import { BUDGET } from '../types'
import { makeHost } from './dom-harness.test'

type Load = (font: string) => Promise<unknown[]>

function fonts(load: Load | null) {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: load ? { load: jest.fn(load) } : undefined,
  })
  return (document as unknown as { fonts?: { load: jest.Mock } }).fonts
}

afterEach(() => {
  delete (document as unknown as { fonts?: unknown }).fonts
  document.body.removeAttribute('style')
  jest.useRealTimers()
})

describe('readFaces', () => {
  it('reads --font-heading / --font-inter / --font-mono off <body>', () => {
    document.body.style.setProperty('--font-heading', "'__Playfair_Display_a1'")
    document.body.style.setProperty('--font-inter', "'__Inter_b2'")
    document.body.style.setProperty('--font-mono', "'__DM_Mono_c3'")
    expect(readFaces()).toEqual(["'__Playfair_Display_a1'", "'__Inter_b2'", "'__DM_Mono_c3'"])
  })
  it('falls back to the literal families', () => {
    expect(readFaces()).toEqual(["'Playfair Display'", "'Inter'", "'DM Mono'"])
  })
  it('keeps only the first family of a stack (next/font appends its metric fallback)', () => {
    document.body.style.setProperty('--font-heading', "'__Playfair_a1', '__Playfair_Fallback_a1'")
    document.body.style.setProperty('--font-inter', "'__Inter_b2', '__Inter_Fallback_b2'")
    expect(readFaces()).toEqual(["'__Playfair_a1'", "'__Inter_b2'", "'DM Mono'"])
  })
})

describe('loadFaces', () => {
  const host = makeHost(null, { faces: () => ["'__P'", "'__I'", "'__M'"] })

  it('loads the six card faces in the host families', async () => {
    const set = fonts(async () => [{}])
    await expect(loadFaces(host)).resolves.toBe(true)
    expect(set?.load.mock.calls.map((c) => c[0])).toEqual([
      "500 34px '__P'", "500 20px '__P'", "400 16px '__I'", "400 14px '__I'", "400 11px '__M'", "500 11px '__M'",
    ])
  })
  it('B9: a face that resolves to nothing → false', async () => {
    let i = 0
    fonts(async () => (i++ === 3 ? [] : [{}]))
    await expect(loadFaces(host)).resolves.toBe(false)
  })
  it('B9: a rejected load → false', async () => {
    fonts(() => Promise.reject(new Error('blocked')))
    await expect(loadFaces(host)).resolves.toBe(false)
  })
  it('B9: a load that never settles → false at FONTS_MS', async () => {
    jest.useFakeTimers()
    fonts(() => new Promise(() => undefined))
    const out = loadFaces(host)
    jest.advanceTimersByTime(BUDGET.FONTS_MS)
    await expect(out).resolves.toBe(false)
  })
  it('no FontFaceSet → false', async () => {
    fonts(null)
    await expect(loadFaces(host)).resolves.toBe(false)
  })
})
