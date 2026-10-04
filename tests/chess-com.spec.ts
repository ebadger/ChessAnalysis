import { expect, test } from '@playwright/test'
import type { Route } from '@playwright/test'
import { archivesFixture, gameFixture } from './fixtures/chessCom'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' })

const reply = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({
  status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Retry-After', ...headers }, body: JSON.stringify(body),
})

test('lookup is opt-in, exposes old months and every game page, and imports a selected PGN', async ({ page, context }, testInfo) => {
  const calls: string[] = []
  await context.route('https://api.chess.com/**', (route) => {
    const url = route.request().url()
    calls.push(url)
    if (url.endsWith('/archives')) return reply(route, archivesFixture)
    if (url.endsWith('/2026/10')) return reply(route, { games: Array.from({ length: 22 }, (_, index) => gameFixture(index, index === 21 ? 'chess960' : 'chess')) })
    if (url.endsWith('/2020/01')) return reply(route, { games: [{ ...gameFixture(99), end_time: Date.UTC(2020, 0, 3) / 1000 }] })
    return reply(route, { username: 'Student' })
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Import a game' }).tap()
  expect(calls).toHaveLength(0)
  await page.getByRole('tab', { name: 'Chess.com username', exact: true }).tap()
  expect(calls).toHaveLength(0)
  await page.getByRole('textbox', { name: 'Chess.com username', exact: true }).fill(' @Student ')
  await page.getByRole('button', { name: 'Find games', exact: true }).tap()
  await expect(page.locator('.archive-summary')).toContainText('2 archived months')
  await expect(page.locator('.remote-game')).toHaveCount(10)
  await expect(page.locator('.remote-game').first()).toBeDisabled()
  await expect(page.locator('.remote-game').first()).toContainText('chess960 is not supported')
  await page.locator('.remote-game-list').evaluate((list) => { list.scrollTop = list.scrollHeight })
  await page.getByRole('button', { name: 'Next games page' }).tap()
  await expect(page.locator('.remote-game')).toHaveCount(10)
  expect(await page.locator('.remote-game-list').evaluate((list) => list.scrollTop)).toBe(0)
  await page.getByRole('button', { name: 'Next games page' }).tap()
  await expect(page.locator('.remote-game')).toHaveCount(2)
  await expect(page.locator('.archive-pagination')).toContainText('21–22 of 22')
  expect(calls).toHaveLength(3)
  await page.getByRole('combobox', { name: 'Game archive month' }).selectOption('2020/01')
  await expect(page.locator('.remote-game')).toHaveCount(1)
  await expect(page.locator('.remote-game')).toContainText('Opponent99')
  await page.screenshot({ path: testInfo.outputPath('dark-chess-com-library.png'), fullPage: true })
  await page.getByRole('button', { name: /^Analyze Student versus Opponent99/ }).tap()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('tab', { name: 'Moves', exact: true }).tap()
  await expect(page.locator('.move-cell')).toHaveCount(4)
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  expect(calls).toHaveLength(4)
  await page.getByRole('button', { name: 'Import a game' }).tap()
  await page.getByRole('tab', { name: 'Paste PGN', exact: true }).tap()
  await page.getByRole('textbox', { name: 'Your game in PGN format' }).fill('1. f3 e5 2. g4 Qh4# 0-1')
  await page.getByRole('button', { name: 'Review this game' }).tap()
  await page.getByRole('button', { name: 'Last position' }).tap()
  await expect(page.locator('.board-caption')).toContainText('Black wins by checkmate')
  expect(calls).toHaveLength(4)
})

test('not-found and rate-limited responses are explicit and retryable', async ({ page, context }) => {
  let notFound = true
  let rateLimited = true
  let calls = 0
  await context.route('https://api.chess.com/**', (route) => {
    calls++
    if (notFound) return reply(route, {}, 404)
    if (route.request().url().endsWith('/archives')) return reply(route, archivesFixture)
    if (route.request().url().endsWith('/2026/10')) return rateLimited ? reply(route, {}, 429, { 'Retry-After': '3' }) : reply(route, { games: [gameFixture()] })
    return reply(route, { username: 'Student' })
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Import a game' }).click()
  await page.getByRole('tab', { name: 'Chess.com username', exact: true }).click()
  await page.getByRole('textbox', { name: 'Chess.com username', exact: true }).fill('student')
  await page.getByRole('button', { name: 'Find games', exact: true }).click()
  await expect(page.locator('.library-error')).toContainText('could not be found')
  expect(calls).toBe(1)
  notFound = false
  await page.getByRole('button', { name: 'Retry lookup' }).click()
  await expect(page.locator('.library-error')).toContainText('Wait 3 seconds')
  expect(calls).toBe(4)
  rateLimited = false
  await page.getByRole('button', { name: 'Retry lookup' }).click()
  await expect(page.locator('.remote-game')).toHaveCount(1)
  expect(calls).toBe(5)
  await expect(page.locator('.library-error')).toHaveCount(0)
})

test('an empty archive is not an error, and an offline lookup leaves PGN import usable', async ({ page, context }) => {
  await context.route('https://api.chess.com/**', (route) => reply(route, route.request().url().endsWith('/archives') ? { archives: [] } : { username: 'Student' }))
  await page.goto('./')
  await page.getByRole('button', { name: 'Import a game' }).click()
  await page.getByRole('tab', { name: 'Chess.com username', exact: true }).click()
  await page.getByRole('textbox', { name: 'Chess.com username', exact: true }).fill('student')
  await page.getByRole('button', { name: 'Find games', exact: true }).click()
  await expect(page.locator('.library-empty')).toContainText('no archived public games')
  await expect(page.locator('.library-error')).toHaveCount(0)
  await context.unroute('https://api.chess.com/**')
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Find games', exact: true }).click()
  await expect(page.locator('.library-error')).toContainText('Could not connect')
  await page.getByRole('tab', { name: 'Paste PGN', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Your game in PGN format' })).toBeVisible()
})

test('cancelling an unfinished monthly download does not invent an empty history', async ({ page, context }) => {
  let monthStarted = false
  await context.route('https://api.chess.com/**', (route) => {
    if (route.request().url().endsWith('/archives')) return reply(route, archivesFixture)
    if (route.request().url().endsWith('/2026/10')) { monthStarted = true; return }
    return reply(route, { username: 'Student' })
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Import a game' }).click()
  await page.getByRole('tab', { name: 'Chess.com username', exact: true }).click()
  await page.getByRole('textbox', { name: 'Chess.com username', exact: true }).fill('student')
  await page.getByRole('button', { name: 'Find games', exact: true }).click()
  await expect.poll(() => monthStarted).toBe(true)
  await page.getByRole('button', { name: 'Cancel Chess.com lookup' }).click()
  await expect(page.locator('.library-error')).toContainText('Lookup cancelled')
  await expect(page.locator('.library-empty')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Find games', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Close import dialog' }).click()
})
