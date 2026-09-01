import { expect, test } from '@playwright/test'

/**
 * AC2.1 (docs/prds/MoodBoard/06-acceptance-evidence.md) — "Present/client/
 * guest/mirror geometry matches visually" was Waived: RENDER-UNIT proved one
 * shared renderer exists, but the required four-surface screenshot
 * comparison was MANUAL-PARITY and never signed off (VD14).
 *
 * Present mode (board-room-shell.tsx) and the guest-share surface
 * (apps/client-portal .../share/[token]/page.tsx) already render through the
 * SAME `BoardComposition` component — the actual cross-surface risk isn't
 * divergent code paths, it's the two call sites' differing prop shapes:
 * Present forwards live edit-session canvasWidth/canvasHeight/
 * backgroundColor/sections as top-level overrides; guest/client/mirror pass
 * only `board` and let BoardComposition read its nested fields. This spec
 * renders one board fixture — sections, a no-image placeholder item (VD12),
 * a rotated id-less item, and a palette — through both prop shapes side by
 * side (`BoardComposition.stories.tsx`'s `PresentGuestParity` story) and
 * asserts every item's resolved geometry (position/size/rotation), every
 * section band's bounds, and the placeholder's caption agree — closing
 * AC2.1 with an automated test in place of the waiver.
 *
 * Steward run command (same storybook-server harness + config as EXPORT-VISUAL
 * in docs/prds/MoodBoard/06-acceptance-evidence.md; this file matches the
 * config's testMatch glob for files ending in ".visual.pw.ts", so the bare
 * form below also runs export-parity.visual.pw.ts alongside it):
 *   pnpm --dir apps/designer-portal exec playwright test --config playwright.mood-board-visual.config.ts
 *
 * To run only this spec:
 *   pnpm --dir apps/designer-portal exec playwright test --config playwright.mood-board-visual.config.ts e2e/mood-board/present-guest-parity.visual.pw.ts
 */

const ITEM_KEYS = ['chair', 'note', 'palette', 'scan', 'sofa', 'placeholder-plan', 'snapshot:1']

test('Present and guest/client surfaces agree on BoardComposition geometry (AC2.1)', async ({
  page,
}, testInfo) => {
  await page.goto(
    '/iframe.html?id=mood-board-boardcomposition--present-guest-parity&viewMode=story',
  )

  const present = page.locator(
    '[data-parity-surface="present"] [data-board-composition-canvas="true"]',
  )
  const guest = page.locator(
    '[data-parity-surface="guest"] [data-board-composition-canvas="true"]',
  )
  await expect(present).toBeVisible()
  await expect(guest).toBeVisible()

  // Both prop shapes resolve to the same canvas dimensions.
  for (const canvas of [present, guest]) {
    await expect(canvas).toHaveAttribute('data-canvas-width', '1200')
    await expect(canvas).toHaveAttribute('data-canvas-height', '800')
  }
  await expect
    .poll(() =>
      present.locator('img').evaluateAll((images) =>
        images.every((node) => node instanceof HTMLImageElement && node.complete),
      ),
    )
    .toBe(true)
  await expect
    .poll(() =>
      guest.locator('img').evaluateAll((images) =>
        images.every((node) => node instanceof HTMLImageElement && node.complete),
      ),
    )
    .toBe(true)
  await page.evaluate(() => document.fonts.ready)

  // The two surfaces are stacked vertically in the harness (guest sits
  // `marginTop: 32` below present's 800px-tall box), so raw boundingBox()
  // values are page-absolute and carry a ~832px Y offset that has nothing to
  // do with layout parity. Every comparison below is container-relative:
  // each surface's own canvas origin is subtracted out first.
  const presentOrigin = await present.boundingBox()
  const guestOrigin = await guest.boundingBox()
  expect(presentOrigin).not.toBeNull()
  expect(guestOrigin).not.toBeNull()
  const relativeBox = (
    box: { x: number; y: number; width: number; height: number } | null,
    origin: { x: number; y: number },
  ) => (box ? { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height } : null)

  // Section bands agree in count and bounds.
  const presentSections = present.locator('[data-composition-section]')
  const guestSections = guest.locator('[data-composition-section]')
  const sectionCount = await presentSections.count()
  expect(sectionCount).toBeGreaterThanOrEqual(2)
  await expect(guestSections).toHaveCount(sectionCount)
  for (let i = 0; i < sectionCount; i += 1) {
    const presentBox = relativeBox(await presentSections.nth(i).boundingBox(), presentOrigin!)
    const guestBox = relativeBox(await guestSections.nth(i).boundingBox(), guestOrigin!)
    expect(presentBox).not.toBeNull()
    expect(guestBox).not.toBeNull()
    expect(Math.abs(presentBox!.x - guestBox!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(presentBox!.y - guestBox!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(presentBox!.width - guestBox!.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(presentBox!.height - guestBox!.height)).toBeLessThanOrEqual(1)
  }

  // Every pin — including the placeholder (VD12/F6) and the rotated id-less
  // item — resolves to the same box and rotation on both surfaces.
  for (const key of ITEM_KEYS) {
    const selector = `[data-board-item-id="${key}"], [data-board-snapshot-key="${key}"]`
    const presentItem = present.locator(selector).first()
    const guestItem = guest.locator(selector).first()
    await expect(presentItem, key).toBeVisible()
    await expect(guestItem, key).toBeVisible()

    const presentBox = relativeBox(await presentItem.boundingBox(), presentOrigin!)
    const guestBox = relativeBox(await guestItem.boundingBox(), guestOrigin!)
    expect(presentBox, key).not.toBeNull()
    expect(guestBox, key).not.toBeNull()
    expect(Math.abs(presentBox!.x - guestBox!.x), key).toBeLessThanOrEqual(1)
    expect(Math.abs(presentBox!.y - guestBox!.y), key).toBeLessThanOrEqual(1)
    expect(Math.abs(presentBox!.width - guestBox!.width), key).toBeLessThanOrEqual(1)
    expect(Math.abs(presentBox!.height - guestBox!.height), key).toBeLessThanOrEqual(1)

    const presentTransform = await presentItem.evaluate((node) => getComputedStyle(node).transform)
    const guestTransform = await guestItem.evaluate((node) => getComputedStyle(node).transform)
    expect(presentTransform, key).toBe(guestTransform)
  }

  // The placeholder specifically proves the VD12 fix: no image, but the
  // same friendly caption, on both surfaces.
  await expect(present.locator('[data-board-item-id="placeholder-plan"]')).toContainText(
    'Floor plan reference',
  )
  await expect(guest.locator('[data-board-item-id="placeholder-plan"]')).toContainText(
    'Floor plan reference',
  )

  // Whole-canvas pixel diff, same convention as export-parity.visual.pw.ts.
  // The only legitimate divergence is Present's verdict-overlay badges.
  const [presentPng, guestPng] = await Promise.all([
    present.screenshot({ animations: 'disabled', path: testInfo.outputPath('present.png') }),
    guest.screenshot({ animations: 'disabled', path: testInfo.outputPath('guest.png') }),
  ])
  await testInfo.attach('present-surface', { body: presentPng, contentType: 'image/png' })
  await testInfo.attach('guest-surface', { body: guestPng, contentType: 'image/png' })

  const diff = await page.evaluate(
    async ({ presentBase64, guestBase64 }) => {
      const load = (base64: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('Unable to decode parity screenshot'))
          image.src = `data:image/png;base64,${base64}`
        })
      const [presentImage, guestImage] = await Promise.all([
        load(presentBase64),
        load(guestBase64),
      ])
      const width = Math.min(presentImage.width, guestImage.width)
      const height = Math.min(presentImage.height, guestImage.height)
      const read = (image: HTMLImageElement) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        context.drawImage(image, 0, 0, width, height)
        return context.getImageData(0, 0, width, height).data
      }
      const actual = read(presentImage)
      const expected = read(guestImage)
      let differentPixels = 0
      let summedChannelDelta = 0
      for (let index = 0; index < actual.length; index += 4) {
        const red = Math.abs(actual[index]! - expected[index]!)
        const green = Math.abs(actual[index + 1]! - expected[index + 1]!)
        const blue = Math.abs(actual[index + 2]! - expected[index + 2]!)
        const alpha = Math.abs(actual[index + 3]! - expected[index + 3]!)
        const maxDelta = Math.max(red, green, blue, alpha)
        summedChannelDelta += red + green + blue + alpha
        if (maxDelta > 36) differentPixels += 1
      }
      const pixels = width * height
      return {
        width,
        height,
        differentPixels,
        differentRatio: differentPixels / pixels,
        meanChannelDelta: summedChannelDelta / (pixels * 4),
      }
    },
    { presentBase64: presentPng.toString('base64'), guestBase64: guestPng.toString('base64') },
  )

  // Present's verdict badges are small; budget slightly above
  // export-parity's 0.06/5 DOM-vs-painter antialiasing tolerance to also
  // cover that one legitimate decorative difference.
  expect(diff.differentRatio, JSON.stringify(diff)).toBeLessThan(0.08)
  expect(diff.meanChannelDelta, JSON.stringify(diff)).toBeLessThan(6)
})
