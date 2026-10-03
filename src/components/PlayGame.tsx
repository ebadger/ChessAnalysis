import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, BookOpen, Download, Flag, Flower2, Leaf, LoaderCircle, Plus, RotateCw, Shuffle, Sprout, Swords, Undo2, X } from 'lucide-react'
import type { Color, Square } from 'chess.js'
import { BOT_LEVELS, getBotLevel, matchPgn } from '../chess/bots'
import type { BotLevelId, ColorChoice } from '../chess/bots'
import { colorName, downloadPgn, parseGame, PIECE_NAMES } from '../chess/game'
import type { ParsedGame } from '../chess/types'
import type { BotGameController } from '../hooks/useBotGame'
import { Badger } from './Badger'
import { Chessboard, ChessPiece } from './Chessboard'
import { useDialog } from './Dialogs'

function BotSetup({ level, color, onLevel, onColor, onStart }: {
  level: BotLevelId
  color: ColorChoice
  onLevel: (id: BotLevelId) => void
  onColor: (color: ColorChoice) => void
  onStart: () => void
}) {
  return <div className="bot-setup">
    <h3>Choose your companion</h3>
    <div className="bot-options" aria-label="Bot difficulty">
      {BOT_LEVELS.map((bot, index) => <button key={bot.id} className={`bot-option${level === bot.id ? ' bot-option-selected' : ''}`} aria-label={`${bot.name}, ${bot.label}`} aria-pressed={level === bot.id} onClick={() => onLevel(bot.id)}>
        <span className={`bot-avatar bot-avatar-${bot.id}`}>{index < 2 ? <Sprout size={20} /> : index < 4 ? <Flower2 size={20} /> : <Leaf size={20} />}</span>
        <span><strong>{bot.name}</strong><small>{bot.label}</small></span>
        <span className="difficulty-dots" aria-hidden="true">{BOT_LEVELS.map((_, dot) => <i key={dot} className={dot <= index ? 'dot-filled' : ''} />)}</span>
      </button>)}
    </div>
    <p className="bot-description">{getBotLevel(level).description} Levels vary Stockfish's skill and search time, not a claimed Elo rating.</p>
    <h3>Your pieces</h3>
    <div className="color-choices" aria-label="Choose your color">
      {(['w', 'b', 'random'] as const).map((choice) => <button key={choice} aria-pressed={color === choice} onClick={() => onColor(choice)}>
        {choice === 'random' ? <Shuffle size={18} /> : <ChessPiece type="k" color={choice} />}
        {choice === 'random' ? 'Surprise me' : colorName(choice)}
      </button>)}
    </div>
    <button className="primary-button start-bot-game" onClick={onStart}><Swords size={17} /> Start game <ArrowRight size={17} /></button>
    <p className="bot-setup-note">No clock, no pressure. Takebacks are welcome. Everything runs on your device.</p>
  </div>
}

export function PlayGame({ game, onAnalyze, onNotice }: {
  game: BotGameController
  onAnalyze: (game: ParsedGame) => void
  onNotice: (message: string) => void
}) {
  const [level, setLevel] = useState<BotLevelId>('clover')
  const [color, setColor] = useState<ColorChoice>('w')
  const [orientation, setOrientation] = useState<{ matchId: number; flipped: boolean } | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [resignOpen, setResignOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const newDialog = useDialog(newGameOpen, () => setNewGameOpen(false))
  const resignDialog = useDialog(resignOpen, () => setResignOpen(false))
  const promotionDialog = useDialog(promotion !== null, () => setPromotion(null))
  const historyRef = useRef<HTMLDivElement>(null)
  const fen = game.chess.fen()
  const history = useMemo(() => game.chess.history({ verbose: true }), [game.chess])
  const last = history[history.length - 1]
  const legal = selected ? game.chess.moves({ square: selected, verbose: true }) : []
  const bot = getBotLevel(game.match?.levelId ?? level)
  const waiting = game.status === 'loading' || game.status === 'thinking'
  const flipped = game.match && orientation?.matchId === game.match.id ? orientation.flipped : game.match?.humanColor === 'b'

  useEffect(() => {
    setSelected(null)
    setPromotion(null)
    setFeedback(null)
    if (game.finished) setResignOpen(false)
  }, [fen, game.match?.id, game.finished])
  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight
  }, [history.length])

  const attempt = (action: () => void) => {
    try { action(); setFeedback(null) }
    catch (cause) { setFeedback(cause instanceof Error ? cause.message : String(cause)) }
  }
  const selectSquare = (square: Square) => {
    if (!game.humanTurn) { setFeedback('Wait for your turn before choosing a move.'); return }
    if (square === selected) { setSelected(null); return }
    const destinations = legal.filter((move) => move.to === square)
    if (selected && destinations.length) {
      if (destinations.some((move) => move.promotion)) setPromotion({ from: selected, to: square })
      else attempt(() => game.playMove(`${selected}${square}`))
      return
    }
    const piece = game.chess.get(square)
    if (piece?.color === game.match?.humanColor) {
      setSelected(square)
      setFeedback(game.chess.moves({ square }).length ? null : 'This piece has no legal moves in this position. Try another piece.')
    } else {
      setFeedback(selected ? 'Choose a highlighted destination, or tap another one of your pieces.' : 'Tap one of your pieces first to see its legal moves.')
    }
  }
  const startGame = () => {
    game.startGame(level, color)
    setNewGameOpen(false)
    setResignOpen(false)
    setFeedback(null)
  }
  const analyze = () => {
    const match = game.match
    if (match) attempt(() => onAnalyze(parseGame(matchPgn(match))))
  }
  const saveGame = () => {
    if (!game.match) return
    downloadPgn(matchPgn(game.match), 'badger-flores-practice.pgn')
    onNotice('Your bot game has been saved as a PGN. You can import it again any time.')
  }
  const player = (pieceColor: Color) => {
    const human = game.match?.humanColor === pieceColor
    const toMove = !game.finished && game.chess.turn() === pieceColor
    return <div className={`player-row play-player${toMove ? ' player-to-move' : ''}`}>
      <span className={`player-avatar avatar-${pieceColor}`}><ChessPiece type="k" color={pieceColor} /></span>
      <div className="player-info"><strong>{human ? 'You' : bot.name}{!human && <span className="bot-player-tag">{bot.label}</span>}</strong><span>{colorName(pieceColor)} pieces{toMove && <><i />{human ? 'Your turn' : 'Bot to move'}</>}</span></div>
      {!human && <span className="local-bot-label"><Sprout size={12} /> Local bot</span>}
    </div>
  }

  return <>
    {!game.match ? <section className="play-welcome panel" id="play-board">
      <div className="play-welcome-copy"><Badger /><span className="eyebrow">A FRIENDLY RIVAL. A FRESH BEGINNING.</span><h2>A little practice.<br />A lot of possibility.</h2><p>Meet our garden of chess companions. Find a comfortable challenge, play at your own pace, then let Badger-Flores help you learn from the game.</p><span className="play-welcome-note"><BookOpen size={15} /> Already have a game? PGN import is always at the top.</span></div>
      <BotSetup level={level} color={color} onLevel={setLevel} onColor={setColor} onStart={startGame} />
    </section> : <div className="play-workspace">
      <section className="play-board-column" id="play-board" aria-label="Play against a local bot">
        <div className="play-game-topline"><span><Swords size={15} /> A friendly game with {bot.name}</span><button className="icon-button" aria-label="Flip playing board" onClick={() => setOrientation({ matchId: game.match!.id, flipped: !flipped })}><RotateCw size={17} /></button></div>
        {player(flipped ? 'w' : 'b')}
        <Chessboard key={game.match.id} fen={fen} flipped={flipped} lastMove={last} showEvaluation={false} interaction={{ enabled: game.humanTurn, selected, destinations: legal.map((move) => move.to), onSelect: selectSquare }} />
        {player(flipped ? 'b' : 'w')}
        <div className={`play-turn-status${game.finished ? ' play-result' : ''}`} role="status">
          {waiting ? <LoaderCircle size={17} className="thinking-spinner" /> : game.finished ? <Flag size={17} /> : <Sprout size={17} />}
          <div><strong>{game.finished ? game.outcome?.reason : game.status === 'error' ? 'The bot is paused.' : game.humanTurn ? game.chess.isCheck() ? 'Your king is in check.' : 'Your move. Take your time.' : `${bot.name} is ${game.status === 'loading' ? 'getting ready' : 'thinking'}...`}</strong><span>{game.finished ? 'The game is over. The learning is just beginning.' : game.humanTurn ? 'Tap a piece, then a highlighted square.' : 'Your opponent is calculating on this device.'}</span></div>
          {game.finished && <b>{game.outcome?.result}</b>}
        </div>
        {feedback && <p className="play-feedback" role="alert">{feedback}</p>}
        {game.error && <div className="bot-error" role="alert"><p>{game.error} Your game is safe here.</p><button className="secondary-button" onClick={game.retry}><RotateCw size={15} /> Retry bot</button></div>}
        <div className="play-actions">
          <button className="secondary-button" disabled={!game.canTakeBack} onClick={() => attempt(game.takeBack)}><Undo2 size={16} /> Take back</button>
          <button className="secondary-button" onClick={() => { setLevel(game.match!.levelId); setColor(game.match!.humanColor); setNewGameOpen(true) }}><Plus size={16} /> New game</button>
          {!game.finished && <button className="text-button resign-button" onClick={() => setResignOpen(true)}><Flag size={14} /> Resign</button>}
          <button className="icon-button save-bot-pgn" aria-label="Save game PGN" title="Save game PGN" disabled={!history.length} onClick={saveGame}><Download size={18} /></button>
        </div>
        <button className="primary-button analyze-bot-game" disabled={!history.length} onClick={analyze}><BookOpen size={17} /> {game.finished ? 'Analyze this game' : 'Analyze the game so far'} <ArrowRight size={17} /></button>
        <p className="play-memory-note">Your game stays here when you switch to Review. Save the PGN before refreshing or closing this page.</p>
      </section>
      <aside className="play-sidebar">
        <section className="play-coach-card panel">
          <div className="play-coach-portrait"><Badger /><span><strong>Badger-Flores</strong><small>In your corner, every move.</small></span></div>
          <h2>{game.finished ? "Played. Now let's grow." : game.chess.isCheck() ? 'First, look after your king.' : 'A good game starts with curiosity.'}</h2>
          <p>{game.finished ? 'Which move changed the story? Open your analysis to find the turning points, missed tactics, and better paths. You can also take back a move and try another idea.' : game.chess.isCheck() ? 'You must answer the check: move the king, capture the checking piece, or block the attack. The highlighted squares show legal choices.' : 'Before you move, look for checks, captures, and threats for both sides. No clock is ticking, and a takeback is just another chance to learn.'}</p>
          <div className="play-coach-footnote"><Flower2 size={13} /> Five skill levels. One patient companion.</div>
        </section>
        <section className="play-scorecard panel" aria-label="Bot game move history">
          <div className="section-heading"><span><BookOpen size={15} /> Your game, so far</span><small>{history.length} half-moves</small></div>
          <div className="practice-moves" ref={historyRef} data-ply-count={history.length}>
            {history.length === 0 ? <p className="empty-copy">{game.humanTurn ? 'Your first move starts the story.' : 'Your companion will make the first move.'}</p> : history.map((move, index) => <span key={index} className={index === history.length - 1 ? 'practice-last-move' : ''}>{move.color === 'w' && <small>{move.before.split(' ')[5]}.</small>}{move.san}</span>)}
          </div>
          <p className="practice-moves-note">The evaluation stays hidden while you play. Your full review is one tap away.</p>
        </section>
      </aside>
    </div>}

    <dialog {...newDialog} className="app-dialog new-bot-dialog" aria-labelledby="new-bot-title">
      <div className="dialog-heading"><span className="dialog-flower"><Sprout size={24} /></span><button className="icon-button" aria-label="Close new game dialog" onClick={() => setNewGameOpen(false)}><X size={20} /></button></div>
      <h2 id="new-bot-title">A new companion. A new chapter.</h2>
      <p className="dialog-intro">Starting a new game replaces this bot match. Save its PGN first if you want to keep it.</p>
      <BotSetup level={level} color={color} onLevel={setLevel} onColor={setColor} onStart={startGame} />
    </dialog>
    <dialog {...resignDialog} className="app-dialog resign-dialog" aria-labelledby="resign-title">
      <div className="dialog-heading"><span className="dialog-flower"><Flag size={24} /></span><button className="icon-button" aria-label="Close resignation dialog" onClick={() => setResignOpen(false)}><X size={20} /></button></div>
      <h2 id="resign-title">Finish this game?</h2><p className="dialog-intro">Resigning gives the win to your companion. You can still analyze the game afterward.</p>
      <div className="resign-actions"><button className="secondary-button" onClick={() => setResignOpen(false)}>Keep playing</button><button className="primary-button" onClick={() => { attempt(game.resign); setResignOpen(false) }}>Resign game</button></div>
    </dialog>
    <dialog {...promotionDialog} className="app-dialog promotion-dialog" aria-labelledby="promotion-title">
      <h2 id="promotion-title">Choose your new piece.</h2><p className="dialog-intro">Your pawn has reached the last rank. What would you like it to become?</p>
      <div className="promotion-options">{(['q', 'r', 'b', 'n'] as const).map((piece) => <button key={piece} aria-label={`Promote to ${PIECE_NAMES[piece]}`} onClick={() => {
        if (promotion) attempt(() => game.playMove(`${promotion.from}${promotion.to}${piece}`))
        setPromotion(null)
      }}><ChessPiece type={piece} color={game.match?.humanColor ?? 'w'} /><span>{PIECE_NAMES[piece]}</span></button>)}</div>
      <button className="text-button" onClick={() => setPromotion(null)}>Choose a different move</button>
    </dialog>
  </>
}
