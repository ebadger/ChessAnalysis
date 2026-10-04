import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { DEMO_PGN, parseGame } from '../src/chess/game'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })

const sample = parseGame(DEMO_PGN)

async function loadReview(page: Page) {
  await page.goto('./')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100', { timeout: 60000 })
  await page.getByRole('tab', { name: 'Moves', exact: true }).tap()
  const critical = await page.locator('.move-cell').evaluateAll((buttons) => buttons.flatMap((button, index) =>
    /grade-(brilliant|great|inaccuracy|mistake|blunder|miss)\b/.test(button.querySelector('.grade-badge')?.className ?? '') ? [index + 1] : [],
  ))
  expect(critical.length).toBeGreaterThanOrEqual(3)
  await page.getByRole('tab', { name: 'Coach', exact: true }).tap()
  return critical
}

async function recordFrames(page: Page) {
  await page.locator('.chessboard').evaluate((board) => {
    const frames = [board.getAttribute('data-fen')]
    board.setAttribute('data-recording', 'true')
    board.setAttribute('data-painted-fens', JSON.stringify(frames))
    board.setAttribute('data-motion-observed', 'false')
    const record = () => {
      if (!board.isConnected || board.getAttribute('data-recording') !== 'true') return
      const fen = board.getAttribute('data-fen')
      if (frames[frames.length - 1] !== fen) frames.push(fen)
      board.setAttribute('data-painted-fens', JSON.stringify(frames))
      const moving = board.querySelector('.board-piece-motion')
      const destination = moving && board.querySelector(`[data-square="${moving.getAttribute('data-to')}"]`)
      const arriving = destination?.querySelector('.piece-arriving')
      if (moving && destination && arriving && Number(getComputedStyle(moving).opacity) > .9) {
        const movingBox = moving.getBoundingClientRect()
        const targetBox = destination.getBoundingClientRect()
        if (Math.hypot(movingBox.x - targetBox.x, movingBox.y - targetBox.y) > 2 &&
          Math.abs(movingBox.width - targetBox.width) < 1 && Number(getComputedStyle(arriving).opacity) < .1) {
          board.setAttribute('data-motion-observed', 'true')
        }
      }
      requestAnimationFrame(record)
    }
    requestAnimationFrame(record)
  })
}

async function recordedFrames(page: Page): Promise<unknown> {
  await page.locator('.chessboard').evaluate((board) => board.setAttribute('data-recording', 'false'))
  return JSON.parse((await page.locator('.chessboard').getAttribute('data-painted-fens'))!)
}

function expectedFrames(from: number, to: number) {
  const direction = Math.sign(to - from)
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, index) => sample.positions[from + index * direction].fen)
}

async function finishedAt(page: Page, ply: number) {
  await expect(page.locator('.key-replay-card')).toHaveCount(0)
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', sample.positions[ply].fen)
  await expect(page.locator('.board-piece-motion')).toHaveCount(0)
}

test('forward and backward key navigation paints every intervening game position', async ({ page }) => {
  const critical = await loadReview(page)
  await page.getByRole('button', { name: 'First position' }).tap()
  const before = (await page.locator('.chessboard').boundingBox())!
  await recordFrames(page)
  await page.getByRole('button', { name: 'Next key moment', exact: true }).tap()
  await expect(page.locator('.key-replay-card')).toHaveAttribute('data-target-ply', String(critical[0]))
  await expect(page.locator('.board-piece-motion').first()).toBeAttached()
  await finishedAt(page, critical[0])
  expect(await recordedFrames(page)).toEqual(expectedFrames(0, critical[0]))
  await expect(page.locator('.chessboard')).toHaveAttribute('data-motion-observed', 'true')

  const gaps = critical.slice(1).map((end, index) => ({ start: critical[index], end, gap: end - critical[index] }))
  const widest = gaps.sort((a, b) => b.gap - a.gap)[0]
  expect(widest.gap).toBeGreaterThan(1)
  await page.getByRole('tab', { name: 'Moves', exact: true }).tap()
  await page.locator('.move-cell').nth(widest.end - 1).tap()
  await page.getByRole('tab', { name: 'Coach', exact: true }).tap()
  await recordFrames(page)
  await page.getByRole('button', { name: 'Previous key moment', exact: true }).tap()
  await expect(page.locator('.key-replay-card')).toHaveAttribute('data-target-ply', String(widest.start))
  await finishedAt(page, widest.start)
  expect(await recordedFrames(page)).toEqual(expectedFrames(widest.end, widest.start))
  const after = (await page.locator('.chessboard').boundingBox())!
  expect(after.y).toBeCloseTo(before.y, 0)
  expect(after.y + after.height).toBeLessThanOrEqual(844)
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test('rapid key taps aim at the next destination and can reverse direction', async ({ page }) => {
  const critical = await loadReview(page)
  await page.getByRole('button', { name: 'First position' }).tap()
  await recordFrames(page)
  await page.getByRole('button', { name: 'Next key moment', exact: true }).tap()
  await page.getByRole('button', { name: 'Next key moment', exact: true }).tap()
  await expect(page.locator('.key-replay-card')).toHaveAttribute('data-target-ply', String(critical[1]))
  await finishedAt(page, critical[1])
  expect(await recordedFrames(page)).toEqual(expectedFrames(0, critical[1]))

  await page.getByRole('button', { name: 'Next key moment', exact: true }).tap()
  await expect(page.locator('.chessboard')).not.toHaveAttribute('data-fen', sample.positions[critical[1]].fen)
  await page.getByRole('button', { name: 'Previous key moment', exact: true }).tap()
  await finishedAt(page, critical[1])
  await page.waitForTimeout(300)
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', sample.positions[critical[1]].fen)
})

test('stop, skip, keyboard shortcuts, and game replacement cancel stale replay callbacks', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const critical = await loadReview(page)
  await page.getByRole('button', { name: 'First position' }).tap()
  await page.keyboard.press('j')
  await expect(page.locator('.chessboard')).not.toHaveAttribute('data-fen', sample.initialFen)
  await page.getByRole('button', { name: 'Stop fast replay', exact: true }).tap()
  const stopped = await page.locator('.chessboard').getAttribute('data-fen')
  await page.waitForTimeout(300)
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', stopped!)
  await expect(page.locator('.key-replay-card')).toHaveCount(0)

  await page.getByRole('button', { name: 'First position' }).tap()
  await page.keyboard.press('j')
  await page.setViewportSize({ width: 320, height: 568 })
  const skipBox = (await page.getByRole('button', { name: 'Skip to key moment' }).boundingBox())!
  expect(skipBox.y + skipBox.height).toBeLessThanOrEqual(568)
  await page.getByRole('button', { name: 'Skip to key moment' }).tap()
  await finishedAt(page, critical[0])
  await page.getByRole('button', { name: 'First position' }).tap()
  await page.getByRole('button', { name: 'Next key moment', exact: true }).tap()
  await page.getByRole('button', { name: 'Import a game' }).tap()
  await expect(page.locator('.key-replay-card')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Your game in PGN format' }).fill('1. f3 e5 2. g4 Qh4# 0-1')
  await page.getByRole('button', { name: 'Review this game' }).tap()
  await page.waitForTimeout(350)
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', parseGame('1. f3 e5 2. g4 Qh4# 0-1').positions[1].fen)
  expect(errors).toEqual([])
})

test('reduced motion skips replay and changing the preference ends an active traversal', async ({ page }) => {
  const critical = await loadReview(page)
  await page.getByRole('button', { name: 'First position' }).tap()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await recordFrames(page)
  await page.getByRole('button', { name: 'Next key moment', exact: true }).tap()
  await finishedAt(page, critical[0])
  await page.waitForTimeout(50)
  expect(await recordedFrames(page)).toEqual([sample.initialFen, sample.positions[critical[0]].fen])

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'First position' }).tap()
  await page.getByRole('button', { name: 'Next key moment', exact: true }).tap()
  await expect(page.locator('.key-replay-card')).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await finishedAt(page, critical[0])
})
