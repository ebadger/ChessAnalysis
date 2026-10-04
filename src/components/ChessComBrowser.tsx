import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Globe, LoaderCircle, Search, X } from 'lucide-react'
import { chessComResult, getChessComArchives, getChessComGames, getChessComPlayer } from '../chess/chessCom'
import type { ChessComArchive, ChessComGame } from '../chess/chessCom'
import { parseGame } from '../chess/game'
import type { ParsedGame } from '../chess/types'

const PAGE_SIZE = 10
interface Library {
  username: string
  archives: ChessComArchive[]
  month: ChessComArchive | null
  games: ChessComGame[] | null
}

export function ChessComBrowser({ active, onSelect }: { active: boolean; onSelect: (game: ParsedGame) => void }) {
  const [input, setInput] = useState('')
  const [library, setLibrary] = useState<Library | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const gamesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) {
      requestRef.current?.abort()
      requestRef.current = null
      setLoading(null)
    }
    return () => requestRef.current?.abort()
  }, [active])

  useEffect(() => {
    if (gamesRef.current) gamesRef.current.scrollTop = 0
  }, [page, library?.username, library?.month?.key])

  const begin = (message: string) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(message)
    setError(null)
    setSelectionError(null)
    setPage(0)
    return controller
  }
  const finish = (controller: AbortController) => {
    if (requestRef.current === controller) {
      requestRef.current = null
      setLoading(null)
    }
  }
  const findGames = async () => {
    const controller = begin('Finding the player...')
    setLibrary(null)
    try {
      const username = await getChessComPlayer(input, controller.signal)
      if (controller.signal.aborted) return
      setLoading(`Finding ${username}'s archive...`)
      const archives = await getChessComArchives(username, controller.signal)
      if (controller.signal.aborted) return
      const month = archives[0] ?? null
      const result: Library = { username, archives, month, games: month ? null : [] }
      setLibrary(result)
      if (month) {
        setLoading(`Loading ${month.label}...`)
        const games = await getChessComGames(month, controller.signal)
        if (!controller.signal.aborted) setLibrary({ ...result, games })
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally { finish(controller) }
  }
  const loadMonth = async (month: ChessComArchive) => {
    if (!library) return
    const controller = begin(`Loading ${month.label}...`)
    const result = { ...library, month, games: null }
    setLibrary(result)
    try {
      const games = await getChessComGames(month, controller.signal)
      if (!controller.signal.aborted) setLibrary({ ...result, games })
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally { finish(controller) }
  }
  const cancel = () => {
    requestRef.current?.abort()
    requestRef.current = null
    setLoading(null)
    setError('Lookup cancelled. Choose Find games or another month to continue.')
  }
  const selectGame = (game: ChessComGame) => {
    if (!game.pgn) { setSelectionError('Chess.com did not provide PGN notation for this game.'); return }
    try { onSelect(parseGame(game.pgn)) }
    catch (cause) { setSelectionError(`This game could not be imported: ${cause instanceof Error ? cause.message : String(cause)}`) }
  }
  const games = library?.games
  const shown = games?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? []

  return <div className="chess-browser">
    <p className="network-notice"><Globe size={15} /><span>This lookup contacts Chess.com for public completed games. Only the lookup goes online; analysis stays on your device.</span></p>
    <form className="chess-lookup-form" onSubmit={(event) => { event.preventDefault(); void findGames() }}>
      <label htmlFor="chess-com-username">Chess.com username</label>
      <div><input id="chess-com-username" className="chess-user-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="e.g. erik" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={50} /><button className="primary-button" type="submit" disabled={Boolean(loading)}><Search size={15} /> Find games</button></div>
    </form>
    {loading && <div className="library-status" role="status"><LoaderCircle size={15} className="thinking-spinner" /><span>{loading}</span><button className="icon-button" aria-label="Cancel Chess.com lookup" onClick={cancel}><X size={16} /></button></div>}
    {error && <div className="form-error library-error" role="alert"><span>{error}</span><button className="text-button" disabled={Boolean(loading)} onClick={() => { if (library?.month) void loadMonth(library.month); else void findGames() }}>Retry lookup</button></div>}
    {library && <section className="game-library" aria-label={`Public games for ${library.username}`}>
      <div className="archive-summary"><strong>{library.username}</strong><span>{library.archives.length} archived {library.archives.length === 1 ? 'month' : 'months'} · full published history</span></div>
      {library.archives.length > 0 && <div className="archive-controls">
        <label className="archive-month"><span>Month</span><select aria-label="Game archive month" value={library.month?.key ?? ''} disabled={Boolean(loading)} onChange={(event) => {
          const month = library.archives.find((archive) => archive.key === event.target.value)
          if (month) void loadMonth(month)
          else setError('Choose one of the available archive months.')
        }}>{library.archives.map((archive) => <option key={archive.key} value={archive.key}>{archive.label}</option>)}</select></label>
        <span>{games === null ? 'Not downloaded' : `${games?.length ?? 0} ${games?.length === 1 ? 'game' : 'games'}`}</span>
      </div>}
      {!loading && !error && library.archives.length === 0 && <p className="library-empty">This player has no archived public games yet.</p>}
      {!loading && !error && library.month && games?.length === 0 && <p className="library-empty">No completed games were published for this month. You can choose any other archived month.</p>}
      {!loading && !error && library.month && games === null && <button className="secondary-button" onClick={() => library.month && void loadMonth(library.month)}>Load this month's games</button>}
      {selectionError && <p className="form-error" role="alert">{selectionError}</p>}
      <div className="remote-game-list" ref={gamesRef}>
        {shown.map((game, index) => {
          const result = chessComResult(game, library.username)
          const supported = game.rules === 'chess' && game.pgn !== null
          const date = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(game.endTime * 1000))
          return <button className="remote-game" key={`${game.id}-${index}`} disabled={!supported} onClick={() => selectGame(game)} aria-label={`Analyze ${game.white.username} versus ${game.black.username}, ${date}, ${game.timeClass}`}>
            <span className={`remote-result result-${result.tone}`}>{result.label}</span>
            <span className="remote-game-description"><span className="remote-game-players"><strong>{game.white.username}</strong>{game.white.rating !== null && <small>{game.white.rating}</small>}<span>vs</span><strong>{game.black.username}</strong>{game.black.rating !== null && <small>{game.black.rating}</small>}</span><span className="remote-game-meta">{date} · {game.timeClass}{!supported && ` · ${game.rules !== 'chess' ? `${game.rules} is not supported` : 'No PGN available'}`}</span></span>
            <ArrowRight size={16} />
          </button>
        })}
      </div>
      {games && games.length > 0 && <div className="archive-pagination">
        <button className="icon-button" aria-label="Previous games page" disabled={page === 0} onClick={() => { setPage((value) => value - 1); setSelectionError(null) }}><ChevronLeft size={18} /></button>
        <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, games.length)} of {games.length}</span>
        <button className="icon-button" aria-label="Next games page" disabled={(page + 1) * PAGE_SIZE >= games.length} onClick={() => { setPage((value) => value + 1); setSelectionError(null) }}><ChevronRight size={18} /></button>
      </div>}
      <p className="library-footnote">Newest first; dates are UTC. Every archived month is available, with no total-game cap. Variants are listed but only standard chess can be analyzed. Chess.com may take time to publish recently finished games.</p>
    </section>}
  </div>
}
