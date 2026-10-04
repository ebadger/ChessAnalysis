import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Chess } from 'chess.js'
import { readFile } from 'node:fs/promises'
import { DEMO_PGN, parseGame } from '../src/chess/game'
import { showPlayedPosition } from './helpers/review'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

async function expectCompactViewport(page: Page, minimumBoard: number) {
  const viewport = page.viewportSize()!
  const board = (await page.locator('.chessboard').boundingBox())!
  const navigation = (await page.locator('.board-navigation').boundingBox())!
  const details = (await page.locator('.phone-review-details').boundingBox())!
  const content = (await page.locator('.phone-panel-scroll').boundingBox())!
  expect(board.width).toBeGreaterThanOrEqual(minimumBoard)
  expect(board.height).toBeCloseTo(board.width, 0)
  for (const rectangle of [board, navigation, details]) {
    expect(rectangle.y).toBeGreaterThanOrEqual(0)
    expect(rectangle.x).toBeGreaterThanOrEqual(0)
    expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(viewport.height + 1)
    expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(viewport.width + 1)
  }
  expect(content.height).toBeGreaterThanOrEqual(100)
  const documentSize = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    scroll: scrollY,
  }))
  expect(documentSize.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(documentSize.height).toBeLessThanOrEqual(viewport.height + 1)
  expect(documentSize.scroll).toBe(0)
  return board
}

for (const viewport of [
  { width: 390, height: 844, minimumBoard: 330 },
  { width: 360, height: 640, minimumBoard: 250 },
  { width: 320, height: 568, minimumBoard: 180 },
]) {
  test(`board stays in view while reading and exploring at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize(viewport)
    await page.goto('./')
    await showPlayedPosition(page)
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100', { timeout: 60000 })
    const originalBoard = await expectCompactViewport(page, viewport.minimumBoard)
    await page.locator('.phone-panel-coach').evaluate((panel) => { panel.scrollTop = panel.scrollHeight })
    expect(await page.locator('.phone-panel-coach').evaluate((panel) => panel.scrollTop)).toBeGreaterThan(0)
    const scrolledBoard = await expectCompactViewport(page, viewport.minimumBoard)
    expect(scrolledBoard.y).toBeCloseTo(originalBoard.y, 0)

    const alternative = page.getByRole('button', { name: /^Explore best alternative/ })
    const san = (await alternative.getAttribute('aria-label'))!.replace('Explore best alternative ', '')
    await alternative.tap()
    const before = parseGame(DEMO_PGN).moves[17].before
    await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', before)
    await expect(page.locator('.board-caption')).toContainText('Alternative · 0/')
    await expect(page.locator('.variation-step-explanation')).toContainText('The road not taken')
    expect(await page.locator('.phone-panel-scroll').evaluate((panel) => panel.scrollTop)).toBe(0)
    await page.getByRole('button', { name: 'Next move', exact: true }).tap()
    const continuation = new Chess(before)
    continuation.move(san)
    await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', continuation.fen())
    const exploredBoard = await expectCompactViewport(page, viewport.minimumBoard)
    expect(exploredBoard.y).toBeCloseTo(originalBoard.y, 0)
    await page.screenshot({ path: testInfo.outputPath(`compact-review-${viewport.width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Back to game', exact: true }).tap()
    await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', parseGame(DEMO_PGN).moves[17].after)
    expect(errors).toEqual([])
  })
}

test('moves, chart, key moments, keyboard tabs, and export stay available beside the visible board', async ({ page }) => {
  await page.goto('./')
  await showPlayedPosition(page)
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100', { timeout: 60000 })
  await page.getByRole('tab', { name: 'Moves', exact: true }).tap()
  await expect(page.locator('.move-cell')).toHaveCount(33)
  await page.getByRole('button', { name: /^17\. Rd8#/ }).tap()
  const game = parseGame(DEMO_PGN)
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', game.positions[33].fen)
  await expectCompactViewport(page, 330)
  await page.getByRole('button', { name: /Key moments only/ }).tap()
  expect(await page.locator('.move-cell').count()).toBeLessThan(33)
  await page.getByRole('tab', { name: 'Chart', exact: true }).tap()
  const timeline = page.getByRole('slider', { name: 'Navigate the game timeline' })
  await timeline.focus()
  await page.keyboard.press('Home')
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', game.initialFen)
  await page.keyboard.press('End')
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', game.positions[33].fen)
  await expect(page.locator('.classification-counts > div')).toHaveCount(10)
  await expectCompactViewport(page, 330)

  await page.getByRole('tab', { name: 'Coach', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Moves', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', game.positions[33].fen)
  await page.getByRole('button', { name: 'First position' }).tap()
  await page.getByRole('button', { name: 'Next key moment', exact: true }).tap()
  await expect(page.getByRole('tab', { name: 'Coach', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.chessboard')).not.toHaveAttribute('data-fen', game.initialFen)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export study' }).tap()
  const download = await downloadPromise
  expect(parseGame(await readFile((await download.path())!, 'utf8')).moves).toHaveLength(33)
})

test('rotating a phone and returning to desktop retain the same analysis and alternate position', async ({ page }, testInfo) => {
  await page.goto('./')
  await showPlayedPosition(page)
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100', { timeout: 60000 })
  await page.getByRole('button', { name: /^Explore best alternative/ }).tap()
  await page.getByRole('button', { name: 'Next move', exact: true }).tap()
  const fen = await page.locator('.chessboard').getAttribute('data-fen')
  await page.setViewportSize({ width: 844, height: 390 })
  await expectCompactViewport(page, 210)
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', fen!)
  await page.screenshot({ path: testInfo.outputPath('compact-review-landscape.png'), fullPage: true })
  await page.getByRole('button', { name: 'Flip board' }).tap()
  await expect(page.locator('.board-square').first()).toHaveAttribute('data-square', 'h1')
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.locator('.phone-review-app')).toHaveCount(0)
  await expect(page.locator('.study-workspace')).toBeVisible()
  await expect(page.locator('.coach-portrait')).toBeVisible()
  await expect(page.locator('.move-cell')).toHaveCount(33)
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', fen!)
})

test('compact phone review and visible line exploration work after an offline reload', async ({ page, context }) => {
  const failed: string[] = []
  await page.goto('./')
  await expect(page.locator('.offline-status')).toContainText('Available offline')
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  page.on('requestfailed', (request) => failed.push(request.url()))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Import a game' }).tap()
  await page.getByRole('textbox', { name: 'Your game in PGN format' }).fill('1. f3 e5 2. g4 Qh4# 0-1')
  await page.getByRole('button', { name: 'Review this game' }).tap()
  await showPlayedPosition(page)
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await page.getByRole('button', { name: 'Last position' }).tap()
  await page.getByRole('button', { name: /^Explore best alternative/ }).tap()
  await page.getByRole('button', { name: 'Next move', exact: true }).tap()
  await expect(page.locator('.variation-step-explanation')).toContainText('Black plays Qh4#')
  await expectCompactViewport(page, 330)
  expect(failed).toEqual([])
})
