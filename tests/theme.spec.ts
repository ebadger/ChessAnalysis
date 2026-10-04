import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function checkContrast(page: Page, selector: string) {
  const colors = await page.locator(selector).first().evaluate((element) => {
    let parent: Element | null = element
    let background = 'rgb(24, 27, 34)'
    while (parent) {
      const value = getComputedStyle(parent).backgroundColor
      if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') { background = value; break }
      parent = parent.parentElement
    }
    return { text: getComputedStyle(element).color, background }
  })
  const luminance = (color: string) => {
    const values = color.match(/[\d.]+/g)!.slice(0, 3).map((value) => {
      const channel = Number(value) / 255
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
    })
    return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]
  }
  const a = luminance(colors.text)
  const b = luminance(colors.background)
  expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05), `${selector}: ${JSON.stringify(colors)}`).toBeGreaterThanOrEqual(4.5)
}

async function noBrightPanels(page: Page) {
  const panels = await page.evaluate(() => [...document.querySelectorAll('body *')].flatMap((element) => {
    const rectangle = element.getBoundingClientRect()
    const color = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number)
    if (rectangle.width < 80 || rectangle.height < 24 || !color || color[3] === 0 || element.closest('.chessboard')) return []
    return color.slice(0, 3).every((value) => value > 210) ? [element.className.toString()] : []
  }))
  expect(panels).toEqual([])
}

test('theme follows the device, remembers a manual choice, and can return to automatic', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  expect(await page.evaluate(() => localStorage.getItem('badger-flores-theme'))).toBe('light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'The study guide' }).click()
  await page.getByRole('button', { name: 'Follow device', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#181b22')
})

for (const viewport of [{ width: 1440, height: 1100 }, { width: 320, height: 568 }]) {
  test(`dark review, bot play, and dialogs are readable at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('./')
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100', { timeout: 60000 })
    await checkContrast(page, '.coach-feedback > p')
    await checkContrast(page, '.best-alternative .alternative-main > strong')
    await noBrightPanels(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
    if (viewport.width === 320) {
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height + 1)
    }
    await page.screenshot({ path: testInfo.outputPath(`dark-review-${viewport.width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Import a game' }).click()
    await checkContrast(page, '#pgn-input')
    await noBrightPanels(page)
    await page.getByRole('button', { name: 'Close import dialog' }).click()
    await page.getByRole('tab', { name: 'Play a bot' }).click()
    await noBrightPanels(page)
    await checkContrast(page, '.play-welcome-copy > h2')
    await page.getByRole('button', { name: 'Start game', exact: true }).click()
    await checkContrast(page, '.play-coach-card > p')
    await noBrightPanels(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
  })
}

test('appearance still changes when storage is blocked, with an explicit warning', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage blocked') }
    Storage.prototype.setItem = () => { throw new Error('Storage blocked') }
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.toast')).toContainText('could not save')
})

test('a saved dark theme loads and can change while fully offline', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('.offline-status')).toContainText('Available offline')
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
