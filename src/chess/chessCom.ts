export const CHESS_COM_API = 'https://api.chess.com'

export interface ChessComArchive {
  key: string
  label: string
  url: string
}

interface ChessComPlayer {
  username: string
  rating: number | null
  result: string
}

export interface ChessComGame {
  id: string
  pgn: string | null
  white: ChessComPlayer
  black: ChessComPlayer
  endTime: number
  timeClass: string
  rules: string
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Chess.com returned an invalid ${field}. Please try again later.`)
  return value
}

export function normalizeChessComUsername(input: string): string {
  const username = input.trim().replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9_-]{1,50}$/.test(username)) {
    throw new Error('Enter a Chess.com username using letters, numbers, hyphens, or underscores.')
  }
  return username
}

async function requestJson(url: string, signal: AbortSignal, kind: 'player' | 'archives' | 'games'): Promise<unknown> {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = window.setTimeout(() => { timedOut = true; controller.abort() }, 20000)
  try {
    if (signal.aborted) throw new DOMException('Lookup cancelled.', 'AbortError')
    let response: Response
    try {
      response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } })
    } catch (cause) {
      if (signal.aborted) throw cause
      if (timedOut) throw new Error('Chess.com took too long to respond. Please try again.')
      throw new Error('Could not connect to Chess.com. Check your connection and try again; pasted PGNs still work offline.')
    }
    if (response.status === 404) {
      throw new Error(kind === 'player'
        ? 'That Chess.com player could not be found. Check the username and try again.'
        : kind === 'archives' ? 'Chess.com could not provide an archive index for this player.'
          : 'This monthly archive is not available from Chess.com. Choose another month or retry.')
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null
      throw new Error(`Chess.com is limiting requests. ${seconds ? `Wait ${seconds} seconds before retrying.` : 'Please wait a little before retrying.'}`)
    }
    if (!response.ok) throw new Error(`Chess.com returned HTTP ${response.status}. Please try again later.`)
    try {
      const data: unknown = await response.json()
      return data
    } catch (cause) {
      if (signal.aborted) throw cause
      if (timedOut) throw new Error('The game download took too long. Please retry.')
      throw new Error('Chess.com returned unreadable game data. Please try again later.')
    }
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export async function getChessComPlayer(input: string, signal: AbortSignal): Promise<string> {
  const username = normalizeChessComUsername(input)
  const data = await requestJson(`${CHESS_COM_API}/pub/player/${encodeURIComponent(username)}`, signal, 'player')
  if (!object(data)) throw new Error('Chess.com returned invalid player information.')
  const canonical = text(data.username, 'player name')
  normalizeChessComUsername(canonical)
  return canonical
}

export async function getChessComArchives(username: string, signal: AbortSignal): Promise<ChessComArchive[]> {
  const name = normalizeChessComUsername(username)
  const prefix = `/pub/player/${encodeURIComponent(name)}/games/`
  const data = await requestJson(`${CHESS_COM_API}${prefix}archives`, signal, 'archives')
  if (!object(data) || !Array.isArray(data.archives)) throw new Error('Chess.com returned an invalid archive index.')
  const months = new Map<string, ChessComArchive>()
  for (const entry of data.archives) {
    let url: URL
    try { url = new URL(text(entry, 'archive address')) }
    catch { throw new Error('Chess.com returned an invalid archive address.') }
    const match = url.pathname.toLowerCase().startsWith(prefix)
      ? url.pathname.slice(prefix.length).match(/^(\d{4})\/(0[1-9]|1[0-2])$/)
      : null
    if (url.origin !== CHESS_COM_API || url.username || url.password || url.search || url.hash || !match) {
      throw new Error('Chess.com returned an unexpected archive address. No games were requested from it.')
    }
    const key = `${match[1]}/${match[2]}`
    const label = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${match[1]}-${match[2]}-01T00:00:00Z`))
    months.set(key, { key, label, url: `${CHESS_COM_API}${prefix}${key}` })
  }
  return [...months.values()].sort((a, b) => b.key.localeCompare(a.key))
}

function player(value: unknown): ChessComPlayer {
  if (!object(value)) throw new Error('Chess.com returned invalid player details in a game.')
  const username = text(value.username, 'game participant')
  return {
    username,
    rating: typeof value.rating === 'number' && Number.isFinite(value.rating) ? value.rating : null,
    result: text(value.result, 'game result'),
  }
}

export async function getChessComGames(archive: ChessComArchive, signal: AbortSignal): Promise<ChessComGame[]> {
  const url = new URL(archive.url)
  if (url.origin !== CHESS_COM_API || url.username || url.password || url.search || url.hash ||
    !/^\/pub\/player\/[a-z0-9_-]+\/games\/\d{4}\/(0[1-9]|1[0-2])$/.test(url.pathname)) {
    throw new Error('The requested archive address is not a Chess.com monthly archive.')
  }
  const data = await requestJson(url.href, signal, 'games')
  if (!object(data) || !Array.isArray(data.games)) throw new Error('Chess.com returned an invalid game list.')
  return data.games.map((game: unknown): ChessComGame => {
    if (!object(game) || typeof game.end_time !== 'number' || !Number.isSafeInteger(game.end_time) || game.end_time <= 0 || !Number.isFinite(new Date(game.end_time * 1000).getTime())) {
      throw new Error('Chess.com returned a game with invalid date information.')
    }
    return {
      id: text(game.url, 'game identifier'),
      pgn: typeof game.pgn === 'string' && game.pgn.trim() ? game.pgn : null,
      white: player(game.white),
      black: player(game.black),
      endTime: game.end_time,
      timeClass: text(game.time_class, 'time category'),
      rules: text(game.rules, 'chess variant'),
    }
  }).sort((a, b) => b.endTime - a.endTime)
}

const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

export function chessComResult(game: ChessComGame, username: string): { label: string; tone: 'win' | 'loss' | 'draw' } {
  const name = username.toLowerCase()
  const side = game.white.username.toLowerCase() === name ? 'white' : game.black.username.toLowerCase() === name ? 'black' : null
  const winner = game.white.result === 'win' ? 'white' : game.black.result === 'win' ? 'black' : null
  if (winner) return { label: side ? (winner === side ? 'Win' : 'Loss') : `${winner === 'white' ? 'White' : 'Black'} won`, tone: side && side !== winner ? 'loss' : 'win' }
  if (DRAW_RESULTS.has(game.white.result) || DRAW_RESULTS.has(game.black.result)) return { label: 'Draw', tone: 'draw' }
  return { label: `Result: ${side ? game[side].result : game.white.result}`, tone: 'draw' }
}
