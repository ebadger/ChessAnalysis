import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { archivesFixture, gameFixture } from '../../tests/fixtures/chessCom'
import { chessComResult, getChessComArchives, getChessComGames, getChessComPlayer, normalizeChessComUsername } from './chessCom'

const fetchMock = vi.fn<typeof fetch>()
const signal = () => new AbortController().signal
const month = { key: '2026/10', label: 'October 2026', url: 'https://api.chess.com/pub/player/student/games/2026/10' }
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('optional Chess.com public-game lookup', () => {
  it('normalizes a username and does not send credentials or cache game data', async () => {
    fetchMock.mockResolvedValueOnce(json({ username: 'Student' }))
    expect(normalizeChessComUsername(' @Student ')).toBe('student')
    expect(await getChessComPlayer(' @Student ', signal())).toBe('Student')
    expect(fetchMock).toHaveBeenCalledWith('https://api.chess.com/pub/player/student', expect.objectContaining({ credentials: 'omit', cache: 'no-store' }))
    await expect(getChessComPlayer('bad/name', signal())).rejects.toThrow('username')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('exposes the complete monthly archive index, newest first', async () => {
    fetchMock.mockResolvedValueOnce(json(archivesFixture))
    const result = await getChessComArchives('Student', signal())
    expect(result.map((archive) => archive.key)).toEqual(['2026/10', '2020/01'])
    expect(result[0].label).toBe('October 2026')
  })

  it('never follows unexpected archive links supplied by an API response', async () => {
    fetchMock.mockResolvedValueOnce(json({ archives: ['https://example.invalid/collect'] }))
    await expect(getChessComArchives('student', signal())).rejects.toThrow('unexpected archive')
    await expect(getChessComGames({ ...month, url: 'https://example.invalid/game' }, signal())).rejects.toThrow('not a Chess.com')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sorts games, preserves missing PGN and variants, and computes the player result', async () => {
    fetchMock.mockResolvedValueOnce(json({ games: [gameFixture(0), { ...gameFixture(1, 'chess960'), pgn: undefined }] }))
    const games = await getChessComGames(month, signal())
    expect(games.map((game) => game.black.username)).toEqual(['Opponent1', 'Opponent0'])
    expect(games[0].pgn).toBeNull()
    expect(games[0].rules).toBe('chess960')
    expect(chessComResult(games[1], 'student')).toMatchObject({ label: 'Win', tone: 'win' })
    expect(chessComResult(games[1], 'opponent0')).toMatchObject({ label: 'Loss', tone: 'loss' })
    expect(chessComResult({ ...games[1], white: { ...games[1].white, result: 'repetition' }, black: { ...games[1].black, result: 'repetition' } }, 'student').label).toBe('Draw')
  })

  it('distinguishes empty history from malformed responses', async () => {
    fetchMock.mockResolvedValueOnce(json({ archives: [] })).mockResolvedValueOnce(json({ games: [] })).mockResolvedValueOnce(json({ games: 'bad' }))
    expect(await getChessComArchives('student', signal())).toEqual([])
    expect(await getChessComGames(month, signal())).toEqual([])
    await expect(getChessComGames(month, signal())).rejects.toThrow('invalid game list')
  })

  it('rejects dates that cannot be displayed instead of crashing the game browser', async () => {
    fetchMock.mockResolvedValueOnce(json({ games: [{ ...gameFixture(), end_time: Number.MAX_SAFE_INTEGER }] }))
    await expect(getChessComGames(month, signal())).rejects.toThrow('date information')
  })

  it.each([
    [404, 'could not be found'],
    [429, 'Wait 3 seconds'],
    [503, 'HTTP 503'],
  ])('surfaces HTTP %s without a success-shaped empty result', async (status, message) => {
    fetchMock.mockResolvedValueOnce(json({}, status, { 'Retry-After': '3' }))
    await expect(getChessComPlayer('student', signal())).rejects.toThrow(message)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports network and JSON failures explicitly', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(new Response('<html>error</html>'))
    await expect(getChessComPlayer('student', signal())).rejects.toThrow('Could not connect')
    await expect(getChessComPlayer('student', signal())).rejects.toThrow('unreadable')
  })

  it('aborts pending requests', async () => {
    fetchMock.mockImplementation((_url, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))
    }))
    const controller = new AbortController()
    const pending = getChessComPlayer('student', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
