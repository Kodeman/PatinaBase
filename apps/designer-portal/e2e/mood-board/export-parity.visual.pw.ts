import { expect, test } from '@playwright/test'

test('BoardComposition and PNG painter stay within the AC3.1 pixel tolerance', async ({
  page,
}, testInfo) => {
  await page.goto(
    '/iframe.html?id=mood-board-boardcomposition--export-painter-parity&viewMode=story',
  )

  const dom = page.locator('[data-board-composition-canvas="true"]')
  const painter = page.locator('[data-export-parity-painter="true"]')
  await expect(dom).toBeVisible()
  await expect(painter).toBeVisible()
  await expect(page.locator('[data-composition-section]')).toHaveCount(3)
  for (const id of ['chair', 'note', 'palette', 'scan', 'sofa']) {
    await expect(page.locator(`[data-board-item-id="${id}"]`)).toBeVisible()
  }
  await expect(page.locator('[data-board-snapshot-key="snapshot:1"]')).toBeVisible()

  await expect
    .poll(() =>
      page.locator('[data-export-parity-painter="true"]').evaluate(
        (node) =>
          node instanceof HTMLImageElement &&
          node.complete &&
          node.naturalWidth === 1200 &&
          node.naturalHeight === 800,
      ),
    )
    .toBe(true)
  await expect
    .poll(() =>
      dom.locator('img').evaluateAll((images) =>
        images.every(
          (node) =>
            node instanceof HTMLImageElement &&
            node.complete &&
            node.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true)
  await page.evaluate(() => document.fonts.ready)

  const rotated = page.locator('[data-board-snapshot-key="snapshot:1"]')
  expect(await rotated.evaluate((node) => getComputedStyle(node).transform)).not.toBe(
    'none',
  )

  const domBox = await dom.boundingBox()
  const painterBox = await painter.boundingBox()
  expect(domBox).not.toBeNull()
  expect(painterBox).not.toBeNull()
  expect(Math.abs(domBox!.width - painterBox!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(domBox!.height - painterBox!.height)).toBeLessThanOrEqual(1)

  const [domPng, painterPng] = await Promise.all([
    dom.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('board-composition-dom.png'),
    }),
    painter.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('board-composition-painter.png'),
    }),
  ])
  await testInfo.attach('board-composition-dom', {
    body: domPng,
    contentType: 'image/png',
  })
  await testInfo.attach('board-composition-painter', {
    body: painterPng,
    contentType: 'image/png',
  })
  const diff = await page.evaluate(
    async ({ domBase64, painterBase64 }) => {
      const load = (base64: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('Unable to decode parity screenshot'))
          image.src = `data:image/png;base64,${base64}`
        })
      const [domImage, painterImage] = await Promise.all([
        load(domBase64),
        load(painterBase64),
      ])
      const width = Math.min(domImage.width, painterImage.width)
      const height = Math.min(domImage.height, painterImage.height)
      const read = (image: HTMLImageElement) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        context.drawImage(image, 0, 0, width, height)
        return context.getImageData(0, 0, width, height).data
      }
      const actual = read(domImage)
      const expected = read(painterImage)
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
    {
      domBase64: domPng.toString('base64'),
      painterBase64: painterPng.toString('base64'),
    },
  )

  expect(diff.width).toBeGreaterThan(1000)
  expect(diff.height).toBeGreaterThan(700)
  expect(diff.differentRatio, JSON.stringify(diff)).toBeLessThan(0.06)
  expect(diff.meanChannelDelta, JSON.stringify(diff)).toBeLessThan(5)
})
