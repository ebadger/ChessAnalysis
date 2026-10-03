import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BookOpen, FileUp, Flower2, LockKeyhole, Upload, X } from 'lucide-react'
import { CLASSIFICATIONS } from '../chess/analysis'
import { DEMO_PGN, FORK_PGN, parseGame } from '../chess/game'
import type { Classification, ParsedGame } from '../chess/types'
import { GradeBadge } from './MoveList'

function useDialog(open: boolean, onClose: () => void) {
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
    <dialog {...dialog} className="app-dialog import-dialog" aria-labelledby="import-title">
      <div className="dialog-heading"><span className="dialog-flower"><Flower2 size={25} /></span><button className="icon-button" aria-label="Close import dialog" onClick={onClose}><X size={20} /></button></div>
      <span className="eyebrow">MAKE ROOM FOR A LITTLE GROWTH</span>
      <h2 id="import-title">Every game has something to teach.</h2>
      <p className="dialog-intro">Paste a game from Chess.com, Lichess, or anywhere you play. Badger-Flores will help you find the ideas inside it.</p>
      <form onSubmit={(event) => { event.preventDefault(); submit() }}>
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
      </form>
    </dialog>
  )
}

export function GuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useDialog(open, onClose)
  return (
    <dialog {...dialog} className="app-dialog guide-dialog" aria-labelledby="guide-title">
      <div className="dialog-heading"><span className="dialog-flower"><BookOpen size={24} /></span><button className="icon-button" aria-label="Close study guide" onClick={onClose}><X size={20} /></button></div>
      <span className="eyebrow">A THOUGHTFUL WAY TO REVIEW</span>
      <h2 id="guide-title">Understanding your study companion.</h2>
      <div className="guide-content">
        <h3>Explore, don't just memorize</h3>
        <p>Choose any move in the journal. Use the board controls or left/right arrow keys to step through the game. The key-moment buttons jump to critical moves. Click a suggested alternative to rewind to the position <em>before</em> the played move, then play through both sides of that possible future. "Back to game" returns to the original position.</p>
        <p>Green arrows show the next move in an alternative; rose arrows show the next move in the opponent's response; gold arrows show a tactical pattern. No alternative arrow is drawn on an unrelated position.</p>
        <h3>Familiar labels. Independent estimates.</h3>
        <p>These categories are inspired by Chess.com's public definitions, not its proprietary Game Review algorithm. Stockfish evaluates each position; we compare before/after expected scores using a fixed centipawn curve. We do not adjust for player rating. "Great," "Brilliant," and "Miss" use conservative, documented heuristics. Opening recognition uses a small exact-match repertoire, not an exhaustive database.</p>
        <div className="grade-guide">{Object.entries(CLASSIFICATIONS).map(([key, value]) => <div key={key}><GradeBadge kind={key as Classification} /><span><strong>{value.label}</strong><p>{value.description}</p></span></div>)}</div>
        <h3>What the engine can (and cannot) tell you</h3>
        <p>Quick review searches up to depth 12, with 0.4 seconds per position; Deep review searches up to depth 18, with 1.4 seconds per position. Slower devices may reach lower depths. Both use the single-threaded Stockfish 17.1 lite engine with up to three candidate moves. The lite engine trades some strength for a smaller download.</p>
        <p>Positive scores favor White; negative scores favor Black. M3 means White can force mate in three; -M3 means Black can. Scores measure the position, not just material. The graph and bar indicate advantage, not a guaranteed probability of winning. Study accuracy is an independent expected-score-based estimate, not Chess.com accuracy.</p>
        <p>Tactical callouts identify board patterns, not guaranteed material wins. A pinned attacker or a forcing counterattack can change the outcome. The commentary is generated from board facts and engine lines, not a language model. Try a deeper review before drawing conclusions about a subtle move.</p>
        <h3>Private, by design</h3>
        <p>Your PGN is processed in memory. It is not uploaded, stored in a browser database, or sent to an AI service. The page downloads its bundled engine assets from this site's host, never an external analysis API or CDN. Export an annotated PGN to keep your study; refreshing the page resets it.</p>
        <h3>Take your study offline</h3>
        <p>In a production build, the app saves all its own files and the full local engine in an offline cache. Once "Available offline" appears, you can disconnect, reload, import new PGNs, and complete fresh analyses. Only app files are cached, not your games. Browser storage clearing or eviction removes the offline copy; reconnect to save it again.</p>
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
