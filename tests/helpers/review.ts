import type { Page } from '@playwright/test'

export async function showPlayedPosition(page: Page) {
  const toggle = page.getByRole('button', { name: 'Compare best and played moves', exact: true })
  if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click()
}

export async function recordFrames(page: Page) {
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

export async function recordedFrames(page: Page): Promise<unknown> {
  await page.locator('.chessboard').evaluate((board) => board.setAttribute('data-recording', 'false'))
  return JSON.parse((await page.locator('.chessboard').getAttribute('data-painted-fens'))!)
}
