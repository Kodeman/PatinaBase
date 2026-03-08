import { test, expect } from '@playwright/test'

test.describe('Timeline-3D Perfect Centering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3002/demo/timeline-3d')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000) // Let initial animations settle
  })

  test('milestone card centers perfectly at 50vh from top when active', async ({ page }) => {
    // Scroll to first milestone (after hero)
    await page.evaluate(() => {
      window.scrollTo({ top: window.innerHeight + 0 * window.innerHeight * 1.2, behavior: 'instant' })
    })
    await page.waitForTimeout(500)

    // Get viewport dimensions
    const viewportHeight = await page.evaluate(() => window.innerHeight)
    const viewportWidth = await page.evaluate(() => window.innerWidth)

    // Find the active milestone card
    const card = page.locator('[role="article"]').first()
    const cardBox = await card.boundingBox()

    expect(cardBox).not.toBeNull()
    if (!cardBox) return

    // Calculate card center position
    const cardCenterY = cardBox.y + cardBox.height / 2
    const cardCenterX = cardBox.x + cardBox.width / 2

    // Expected center positions
    const expectedCenterY = viewportHeight / 2
    const expectedCenterX = viewportWidth / 2

    // Allow 5px tolerance for sub-pixel rendering
    const tolerance = 5

    // Verify vertical centering at 50vh
    expect(Math.abs(cardCenterY - expectedCenterY)).toBeLessThan(tolerance)

    // Verify horizontal centering at 50vw
    expect(Math.abs(cardCenterX - expectedCenterX)).toBeLessThan(tolerance)
  })

  test('background darkens to 0.95 opacity by 200px scroll', async ({ page }) => {
    // Scroll exactly 200px
    await page.evaluate(() => {
      window.scrollTo({ top: 200, behavior: 'instant' })
    })
    await page.waitForTimeout(300)

    // Get the black overlay element
    const overlay = page.locator('.fixed.inset-0.bg-black').first()

    // Get computed opacity
    const opacity = await overlay.evaluate((el) => {
      return window.getComputedStyle(el).opacity
    })

    // Should be at or very close to 0.95
    const opacityNum = parseFloat(opacity)
    expect(opacityNum).toBeGreaterThanOrEqual(0.93) // Allow small tolerance
    expect(opacityNum).toBeLessThanOrEqual(0.97)
  })

  test('background darkens faster than old implementation', async ({ page }) => {
    // At 150px scroll, new implementation should be darker
    await page.evaluate(() => {
      window.scrollTo({ top: 150, behavior: 'instant' })
    })
    await page.waitForTimeout(300)

    const overlay = page.locator('.fixed.inset-0.bg-black').first()
    const opacity = await overlay.evaluate((el) => {
      return window.getComputedStyle(el).opacity
    })

    const opacityNum = parseFloat(opacity)

    // Old implementation at 150px: 150/300 = 0.5
    // New implementation at 150px: 150/200 = 0.75 * 0.95 = 0.7125
    // Should be significantly darker (> 0.6)
    expect(opacityNum).toBeGreaterThan(0.6)
  })

  test('cards use 50vh baseline for vertical positioning', async ({ page }) => {
    // Test multiple milestones to ensure consistent centering
    const milestoneCount = 3
    const viewportHeight = await page.evaluate(() => window.innerHeight)

    for (let i = 0; i < milestoneCount; i++) {
      // Scroll to milestone i
      await page.evaluate((index) => {
        const vh = window.innerHeight
        const cardSpacing = vh * 1.2 // Based on config
        window.scrollTo({ top: vh + index * cardSpacing, behavior: 'instant' })
      }, i)
      await page.waitForTimeout(500)

      // Get active card position
      const cards = page.locator('[role="article"]')
      const cardBox = await cards.nth(i).boundingBox()

      if (!cardBox) continue

      const cardCenterY = cardBox.y + cardBox.height / 2
      const expectedCenterY = viewportHeight / 2

      // Each milestone should center at same position (50vh)
      expect(Math.abs(cardCenterY - expectedCenterY)).toBeLessThan(10)
    }
  })
})
