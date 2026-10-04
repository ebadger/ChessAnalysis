import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BookOpen, FileUp, Flower2, Globe, LockKeyhole, Upload, X } from 'lucide-react'
import { CLASSIFICATIONS } from '../chess/analysis'
import { DEMO_PGN, FORK_PGN, parseGame } from '../chess/game'
import type { Classification, ParsedGame } from '../chess/types'
import type { ThemePreference } from '../hooks/useTheme'
import { GradeBadge } from './MoveList'
import { ChessComBrowser } from './ChessComBrowser'

export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal()
    if (!open && ref.current?.open) ref.current?.close()
  }, [open])
  return { ref, onCancel: onClose, onClose }
}

export function ImportDialog({ open, onClose, onImport }: {
  open: boolean
  onClose: () => void
  onImport: (game: ParsedGame) => void
}) {
  const dialog = useDialog(open, onClose)
  const [pgn, setPgn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'pgn' | 'chess-com'>('pgn')
  const fileRef = useRef<HTMLInputElement>(null)
  const submit = () => {
    try {
      const game = parseGame(pgn)
      onImport(game)
      setError(null)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <dialog {...dialog} className={`app-dialog import-dialog${source === 'chess-com' ? ' chess-import' : ''}`} aria-labelledby="import-title">
      <div className="dialog-heading"><span className="dialog-flower"><Flower2 size={25} /></span><button className="icon-button" aria-label="Close import dialog" onClick={onClose}><X size={20} /></button></div>
      <span className="eyebrow">MAKE ROOM FOR A LITTLE GROWTH</span>
      <h2 id="import-title">Every game has something to teach.</h2>
      <p className="dialog-intro">Paste a PGN from anywhere you play, or browse a Chess.com player's public games. Badger-Flores will help you find the ideas inside.</p>
      <div className="import-sources" role="tablist" aria-label="Game import source">
        <button role="tab" aria-selected={source === 'pgn'} onClick={() => setSource('pgn')}><FileUp size={15} /> Paste PGN</button>
        <button role="tab" aria-selected={source === 'chess-com'} onClick={() => setSource('chess-com')}><Globe size={15} /> Chess.com username</button>
      </div>
      {source === 'chess-com' ? <ChessComBrowser active={open} onSelect={(game) => { onImport(game); onClose() }} /> : <form onSubmit={(event) => { event.preventDefault(); submit() }}>
        <div className="pgn-label"><label htmlFor="pgn-input">Your game in PGN format</label><button type="button" className="text-button" onClick={() => fileRef.current?.click()}><FileUp size={14} /> Choose .pgn file</button></div>
        <textarea id="pgn-input" value={pgn} onChange={(event) => { setPgn(event.target.value); setError(null) }} spellCheck={false} placeholder={'[White "Your name"]\n[Black "Your opponent"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 ...'} aria-invalid={Boolean(error)} aria-describedby={error ? 'pgn-error' : 'pgn-hint'} autoFocus />
        <input ref={fileRef} type="file" accept=".pgn,text/plain" hidden onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          if (file.size > 250000) { setError('Please choose a single-game PGN file under 250 KB.'); return }
          try { setPgn(await file.text()); setError(null) }
          catch (cause) { setError(`The file could not be read: ${cause instanceof Error ? cause.message : String(cause)}`) }
        }} />
        {error ? <p id="pgn-error" className="form-error" role="alert">{error}</p> : <p id="pgn-hint" className="input-hint">One standard-chess game at a time. Comments and variations are accepted; the main line is reviewed.</p>}
        <div className="example-divider"><span>OR START WITH A LITTLE INSPIRATION</span></div>
        <div className="example-games">
          <button type="button" onClick={() => { setPgn(DEMO_PGN); setError(null) }}><BookOpen size={18} /><span><strong>The Opera Game</strong><small>Morphy, 1858 · Development & sacrifice</small></span><ArrowRight size={16} /></button>
          <button type="button" onClick={() => { setPgn(FORK_PGN); setError(null) }}><Flower2 size={18} /><span><strong>A knight's double attack</strong><small>A short lesson in threats & counterplay</small></span><ArrowRight size={16} /></button>
        </div>
        <div className="dialog-actions"><span><LockKeyhole size={13} /> Your PGN stays on your device.</span><button type="submit" className="primary-button"><Upload size={16} /> Review this game <ArrowRight size={16} /></button></div>
      </form>}
    </dialog>
  )
}

export function GuideDialog({ open, onClose, themePreference, onThemeChange, themeWarning }: {
  open: boolean
  onClose: () => void
  themePreference: ThemePreference
  onThemeChange: (preference: ThemePreference) => void
  themeWarning: string | null
}) {
  const dialog = useDialog(open, onClose)
  return (
    <dialog {...dialog} className="app-dialog guide-dialog" aria-labelledby="guide-title">
      <div className="dialog-heading"><span className="dialog-flower"><BookOpen size={24} /></span><button className="icon-button" aria-label="Close study guide" onClick={onClose}><X size={20} /></button></div>
      <span className="eyebrow">A THOUGHTFUL WAY TO REVIEW</span>
      <h2 id="guide-title">Understanding your study companion.</h2>
      <div className="guide-content">
        <h3>Make yourself comfortable</h3>
        <div className="theme-options" role="group" aria-label="Color theme">
          {(['system', 'light', 'dark'] as const).map((preference) => <button key={preference} aria-pressed={themePreference === preference} onClick={() => onThemeChange(preference)}>{preference === 'system' ? 'Follow device' : preference === 'light' ? 'Light' : 'Dark'}</button>)}
        </div>
        <p>The moon/sun button beside the activity tabs switches themes instantly. Your choice is saved on this device, separately from games; games are still kept only in memory.</p>
        {themeWarning && <p className="form-error" role="alert">{themeWarning}</p>}
        <h3>Explore, don't just memorize</h3>
        <p>Choose any move in the journal. Use the board controls or left/right arrow keys to step through the game. The key-moment buttons jump to critical moves. Click a suggested alternative to rewind to the position <em>before</em> the played move, then play through both sides of that possible future. "Back to game" returns to the original position.</p>
        <p><strong>Compare</strong> is on by default. The board shows the position before the selected move: a solid green arrow marks the engine's best move, and a dashed rose arrow marks what was played. The recommended piece is outlined. If both moves are the same, only one green arrow appears. The legend includes move notation so color is not the only cue.</p>
        <p>Use the comparison control beside the flip button to see the actual position after the move instead. The evaluation bar follows the displayed position; the chart shows actual after-move evaluations. If the engine has not reached a position yet, the best move is marked pending rather than invented. Overlapping comparison paths are separated.</p>
        <p>Inside a continuation, green arrows show its next move, rose arrows show the opponent's response, and gold arrows show a selected tactical pattern. These views use their own correct positions; returning to the game restores your selected comparison mode.</p>
        <p>The key-moment buttons quickly replay the moves in between, in either direction, so you can follow how the position develops. In comparison mode they stop before the destination move, then reveal its arrows without a final rewind. The middle pause button stops the replay, and the destination card can skip straight there. Tapping another key-moment button redirects the replay; J and Shift+J work the same way. Reduced-motion settings keep instant jumps instead.</p>
        <h3>Find a public Chess.com game</h3>
        <p>Open <strong>Import a game</strong>, choose <strong>Chess.com username</strong>, and enter a player name. Find games retrieves the player's public archive index, then the newest month. Every archived month is available in the month selector, and games are paged ten at a time. Select a game to start local analysis.</p>
        <p>This is the one optional online feature: it sends the requested username to Chess.com's public API at api.chess.com, without login credentials. Monthly downloads run one at a time. The list includes published completed games; recently finished games may not appear immediately. Variants and records without PGN are labeled and cannot be analyzed. A selected game's analysis remains local, and pasted PGNs never need this lookup.</p>
        <h3>Everything stays together on a phone</h3>
        <p>The board and navigation stay on screen while you read. Switch between <strong>Coach</strong>, <strong>Moves</strong>, and <strong>Chart</strong> in the compact panel underneath; swipe within that panel for longer explanations. Tap a suggested move and watch the board above change immediately. The board label shows when you are in an alternate line and which step you are viewing.</p>
        <p>The close button beside an alternate-line label returns to the game. Chart includes the evaluation timeline, player information, and study accuracy. The panel toolbar keeps board hints and PGN export within reach. In landscape, the details move beside the board rather than below it.</p>
        <h3>Play a little, then learn a little</h3>
        <p>Choose <strong>Play a bot</strong> to meet Sprout (Beginner), Clover (Casual), Fern (Club), Iris (Advanced), or Oak (Expert). Each uses a different local Stockfish skill and search budget. These are practice levels, not official Elo ratings. Choose White, Black, or a surprise color; there is no clock.</p>
        <p>On a phone, tap a piece and then a highlighted square. Castling works by moving the king to its castling square. When a pawn reaches the last rank, choose its new piece. With a keyboard, arrow keys navigate the playing board and Enter/Space selects a piece or destination.</p>
        <p><strong>Take back</strong> returns to your last decision and removes the bot's response, even if it is still thinking. <strong>Analyze this game</strong> sends the result to a full-strength review; you can also analyze a game in progress. Switching activities keeps the bot match and previous review in memory and pauses the inactive engine. Chess.com PGN import remains available at the top of the page.</p>
        <p>Bot games are not stored automatically. Save the game PGN before refreshing or closing the page. Practice games finish automatically on checkmate, resignation, stalemate, insufficient material, threefold repetition, or the fifty-move rule.</p>
        <h3>Familiar labels. Independent estimates.</h3>
        <p>These categories are inspired by Chess.com's public definitions, not its proprietary Game Review algorithm. Stockfish evaluates each position; we compare before/after expected scores using a fixed centipawn curve. We do not adjust for player rating. "Great," "Brilliant," and "Miss" use conservative, documented heuristics. Opening recognition uses a small exact-match repertoire, not an exhaustive database.</p>
        <div className="grade-guide">{Object.entries(CLASSIFICATIONS).map(([key, value]) => <div key={key}><GradeBadge kind={key as Classification} /><span><strong>{value.label}</strong><p>{value.description}</p></span></div>)}</div>
        <h3>What the engine can (and cannot) tell you</h3>
        <p>Quick review searches up to depth 12, with 0.4 seconds per position; Deep review searches up to depth 18, with 1.4 seconds per position. Slower devices may reach lower depths. Both use the single-threaded Stockfish 17.1 lite engine with up to three candidate moves. The lite engine trades some strength for a smaller download.</p>
        <p>Positive scores favor White; negative scores favor Black. M3 means White can force mate in three; -M3 means Black can. Scores measure the position, not just material. The graph and bar indicate advantage, not a guaranteed probability of winning. Study accuracy is an independent expected-score-based estimate, not Chess.com accuracy.</p>
        <p>Tactical callouts identify board patterns, not guaranteed material wins. A pinned attacker or a forcing counterattack can change the outcome. The commentary is generated from board facts and engine lines, not a language model. Try a deeper review before drawing conclusions about a subtle move.</p>
        <h3>Private, by design</h3>
        <p>Your PGN is processed in memory. It is not uploaded, stored in a browser database, or sent to an AI service. The page downloads its bundled engine assets from this site's host, never an external analysis API or CDN. Only an explicitly requested Chess.com username lookup contacts the public game API. Your theme preference is saved locally; game lists and PGNs are not. Export an annotated PGN to keep your study; refreshing the page resets it.</p>
        <h3>Take your study offline</h3>
        <p>In a production build, the app saves all its own files and the full local engine in an offline cache. Once "Available offline" appears, you can disconnect, reload, import new PGNs, play bots, and complete fresh analyses in either theme. Looking up another Chess.com account or month still requires a connection. Only app files are cached, not your games. Browser storage clearing or eviction removes the offline copy; reconnect to save it again.</p>
        <p>First-time loading still needs access to this static site. Alternatively, download the complete build and serve it on localhost: no internet connection is needed to run it. Offline saving requires HTTPS or localhost and a browser that permits service workers. Development mode deliberately does not cache files.</p>
        <h3>A badger, a flower, and a family name</h3>
        <p>Our original little coach honors the name Badger-Flores: the curiosity of a badger, the patience of a gardener, and a flower that makes the two inseparable.</p>
        <h3>Open-source engine & references</h3>
        <p>The engine license is included in the offline copy. The optional source and reference links below open external websites only when you choose them; they are never needed for analysis.</p>
        <p><a href="https://github.com/nmrugg/stockfish.js/tree/v17.1.0" target="_blank" rel="noreferrer">Stockfish.js source</a> · <a href={`${import.meta.env.BASE_URL}engine/COPYING.txt`} target="_blank" rel="noreferrer">GNU GPL v3 engine license</a> · <a href="https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc" target="_blank" rel="noreferrer">Chess.com classification reference</a> · <a href="https://www.chessigma.com/" target="_blank" rel="noreferrer">Chessigma</a></p>
        <h3>Keyboard shortcuts</h3>
        <p><kbd>←</kbd> <kbd>→</kbd> Previous / next step · <kbd>Home</kbd> <kbd>End</kbd> Start / end · <kbd>J</kbd> Next key moment · <kbd>Shift J</kbd> Previous key moment · <kbd>F</kbd> Flip board · <kbd>Esc</kbd> Leave an alternative.</p>
      </div>
    </dialog>
  )
}
