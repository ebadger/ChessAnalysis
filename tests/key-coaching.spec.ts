import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' })

test('a key move explains its cause, points, and strongest reply without hiding the board', async ({ page }, testInfo) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Import a game' }).tap()
  await page.getByRole('textbox', { name: 'Your game in PGN format' }).fill('1. f3 e5 2. g4 Qh4# 0-1')
  await page.getByRole('button', { name: 'Review this game' }).tap()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await page.getByRole('tab', { name: 'Moves', exact: true }).tap()
  await expect(page.locator('.move-grade-name')).toHaveCount(4)
  await page.getByRole('button', { name: /^2\. g4/ }).tap()
  await page.getByRole('tab', { name: 'Coach', exact: true }).tap()
  await expect(page.locator('.classification-name')).toHaveText('Blunder')
  await expect(page.locator('.classification-summary')).toContainText('major')
  await expect(page.locator('.key-move-reason')).toContainText('forced mate for Black in 1')
  await expect(page.locator('.move-cost')).toContainText('Mate score')
  await expect(page.locator('.points-note')).toContainText('not a finite')
  await expect(page.locator('.reply-explanation')).toContainText('Qh4#')
  const before = (await page.locator('.chessboard').boundingBox())!
  await page.locator('.key-move-reason').scrollIntoViewIfNeeded()
  const after = (await page.locator('.chessboard').boundingBox())!
  expect(after.y).toBeCloseTo(before.y, 0)
  expect(after.y + after.height).toBeLessThanOrEqual(844)
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await page.locator('.grading-details > summary').tap()
  await expect(page.locator('.grading-details')).toContainText('percentage points')
  await expect(page.locator('.grading-details')).toContainText('not Elo points')
  await page.locator('.phone-panel-scroll').evaluate((panel) => { panel.scrollTop = 0 })
  await page.screenshot({ path: testInfo.outputPath('key-move-points-phone.png'), fullPage: true })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export study' }).tap()
  const download = await downloadPromise
  const exported = await readFile((await download.path())!, 'utf8')
  const annotationText = exported.replace(/\s+/g, ' ')
  expect(annotationText).toContain('Key moment:')
  expect(annotationText).toContain('forced mate for Black in 1')
  expect(annotationText).toContain('Mate score: no finite evaluation-point loss')
})

test('finite evaluation costs are labeled and every journal icon has its category name', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100', { timeout: 60000 })
  await expect(page.locator('.move-cost > strong')).toHaveText(/^\d+\.\d points$/)
  const [before, after] = await page.locator('.evaluation-comparison strong').allTextContents()
  const cost = Number((await page.locator('.move-cost > strong').innerText()).split(' ')[0])
  expect(Math.abs(cost - Math.max(0, Number(after) - Number(before)))).toBeLessThanOrEqual(.11)
  await expect(page.locator('.key-move-reason > p')).not.toBeEmpty()
  await expect(page.locator('.points-note')).toContainText('not necessarily captured material')
  await page.getByRole('tab', { name: 'Moves', exact: true }).tap()
  const labelsMatch = await page.locator('.move-cell').evaluateAll((buttons) => buttons.every((button) =>
    button.querySelector('.move-grade-name')?.textContent === button.querySelector('.grade-badge')?.getAttribute('aria-label'),
  ))
  expect(labelsMatch).toBe(true)
})

test('the category guide explains all labels and stays dismissible on the smallest phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100', { timeout: 60000 })
  await page.getByRole('tab', { name: 'Moves', exact: true }).tap()
  const fen = await page.locator('.chessboard').getAttribute('data-fen')
  await page.getByRole('button', { name: 'Explain move categories', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Move categories', exact: true })).toBeVisible()
  await expect(page.locator('.category-row')).toHaveCount(10)
  await expect(page.locator('.category-row .key-moment-tag')).toHaveCount(6)
  await expect(page.locator('.category-dialog-content')).toContainText('not always a game-deciding move')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.chessboard')).toHaveAttribute('data-fen', fen!)
  await page.locator('.category-dialog-content').evaluate((content) => { content.scrollTop = content.scrollHeight })
  await expect(page.locator('.category-dialog-content')).toContainText('100 centipawns')
  const close = (await page.getByRole('button', { name: 'Close move categories' }).boundingBox())!
  expect(close.y).toBeGreaterThanOrEqual(0)
  expect(close.y + close.height).toBeLessThanOrEqual(568)
  await page.screenshot({ path: testInfo.outputPath('category-guide-phone.png'), fullPage: true })
  await page.getByRole('button', { name: 'Close move categories' }).tap()
  await expect(page.getByRole('dialog', { name: 'Move categories', exact: true })).not.toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(569)
})
