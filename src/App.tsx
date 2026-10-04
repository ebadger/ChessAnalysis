import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowUpRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, CircleHelp, CloudOff, Download, Flower2, Focus, GitBranch,
  Leaf, ListFilter, LoaderCircle, LockKeyhole, Pause, Play, RotateCcw, RotateCw, ShieldCheck,
  SkipBack, SkipForward, Sprout, Swords, TrendingUp, Upload, X,
} from 'lucide-react'
import type { Color } from 'chess.js'
import { Chess } from 'chess.js'
import { CLASSIFICATIONS, describeMoveIdea, studyAccuracy } from './chess/analysis'
import { colorName, DEMO_PGN, downloadPgn, exportAnnotatedPgn, formatEvaluation, materialBalance, moveLabel, parseGame, replayLine } from './chess/game'
import { detectTactics } from './chess/tactics'
import type { AnalysisMode, BoardArrow, EngineLine, ParsedGame, Tactic, Variation } from './chess/types'
import { Badger } from './components/Badger'
import { Chessboard, ChessPiece } from './components/Chessboard'
import { Coach } from './components/Coach'
import { GuideDialog, ImportDialog } from './components/Dialogs'
import { EvaluationGraph } from './components/EvaluationGraph'
import { GradeBadge, MoveList } from './components/MoveList'
import { PlayGame } from './components/PlayGame'
import { useAnalysis } from './hooks/useAnalysis'
import { useBotGame } from './hooks/useBotGame'
import { useOffline } from './hooks/useOffline'
import { usePhoneLayout } from './hooks/usePhoneLayout'

const exampleGame = parseGame(DEMO_PGN)
const PHONE_PANELS = ['coach', 'moves', 'chart'] as const

function App() {
  const [view, setView] = useState<'review' | 'play'>('review')
  const phoneLayout = usePhoneLayout()
  const phoneReview = phoneLayout && view === 'review'
  const [phonePanel, setPhonePanel] = useState<(typeof PHONE_PANELS)[number]>('coach')
  const phonePanelRef = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState(exampleGame)
  const [mode, setMode] = useState<AnalysisMode>('quick')
  const [selectedPly, setSelectedPly] = useState(18)
  const [flipped, setFlipped] = useState(false)
  const [hints, setHints] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [variation, setVariation] = useState<Variation | null>(null)
  const [activeTactic, setActiveTactic] = useState<Tactic | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [onlyCritical, setOnlyCritical] = useState(false)
  const [journalTab, setJournalTab] = useState<'moves' | 'insights'>('moves')
  const [notice, setNotice] = useState<string | null>(null)
  const { status, analyses, positions, error, start, stop } = useAnalysis(game, mode, view === 'review')
  const botGame = useBotGame(view === 'play')
  const offline = useOffline()
  const pending = status === 'loading' || status === 'analyzing'
  const move = game.moves[selectedPly - 1]
  const analysis = analyses[selectedPly - 1]
  const criticalPlies = useMemo(() => analyses.filter((item) => item.critical).map((item) => item.move.ply), [analyses])
  const nextCritical = criticalPlies.find((ply) => ply > selectedPly)
  const previousCritical = [...criticalPlies].reverse().find((ply) => ply < selectedPly)
  const branchChess = useMemo(() => variation ? replayLine(variation.baseFen, variation.line.moves, variation.index) : null, [variation])
  const fen = branchChess?.fen() ?? game.positions[selectedPly].fen
  const displayedChess = useMemo(() => new Chess(fen), [fen])
  const branchHistory = branchChess?.history({ verbose: true })
  const branchLast = branchHistory?.[branchHistory.length - 1]
  const branchStart = variation ? new Chess(variation.baseFen) : null
  const branchMaterialChange = branchStart && branchChess
    ? (materialBalance(branchChess, branchStart.turn()) - materialBalance(branchStart, branchStart.turn())) / 100
    : 0
  const lastMove = variation ? branchLast : move
  const evaluation = variation?.line.score ?? positions[selectedPly]?.evaluation
  const positionIndex = variation?.index ?? selectedPly
  const lastIndex = variation?.line.moves.length ?? game.moves.length
  const progress = Math.round(analyses.length / game.moves.length * 100)

  const selectMove = useCallback((ply: number) => {
    setSelectedPly(ply)
    setVariation(null)
    setActiveTactic(null)
    setPlaying(false)
  }, [])
  const leaveVariation = useCallback(() => {
    setVariation(null)
    setActiveTactic(null)
    setPlaying(false)
  }, [])
  const step = useCallback((direction: number) => {
    setActiveTactic(null)
    if (variation) {
      setVariation({ ...variation, index: Math.max(0, Math.min(variation.line.moves.length, variation.index + direction)) })
    } else {
      setSelectedPly((ply) => Math.max(0, Math.min(game.moves.length, ply + direction)))
    }
  }, [game.moves.length, variation])
  const jump = useCallback((end: boolean) => {
    setActiveTactic(null)
    setPlaying(false)
    if (variation) setVariation({ ...variation, index: end ? variation.line.moves.length : 0 })
    else setSelectedPly(end ? game.moves.length : 0)
  }, [game.moves.length, variation])
  const explore = useCallback((line: EngineLine) => {
    if (!move) return
    setVariation({ baseFen: move.before, label: `What if ${move.number}${move.color === 'w' ? '.' : '...'} ${line.sans[0]}?`, kind: 'alternative', line, index: 0 })
    setActiveTactic(null)
    setPlaying(false)
    setHints(true)
    setPhonePanel('coach')
  }, [move])
  const exploreReply = () => {
    if (!analysis?.after.lines[0] || !move) return
    setVariation({ baseFen: move.after, label: `${colorName(new Chess(move.after).turn())}'s strongest response`, kind: 'reply', line: analysis.after.lines[0], index: 0 })
    setActiveTactic(null)
    setPlaying(false)
    setHints(true)
    setPhonePanel('coach')
  }
  const showTactic = (tactic: Tactic, suggested: boolean) => {
    setPlaying(false)
    setHints(true)
    setPhonePanel('coach')
    if (suggested && analysis?.best && move) {
      setVariation({ baseFen: move.before, label: `The idea behind ${analysis.best.sans[0]}`, kind: 'alternative', line: analysis.best, index: tactic.lineStep ?? 1 })
    } else setVariation(null)
    setActiveTactic((current) => current === tactic ? null : tactic)
  }

  useEffect(() => {
    if (!playing) return
    if (positionIndex >= lastIndex) { setPlaying(false); return }
    const timer = window.setInterval(() => step(1), 1300)
    return () => window.clearInterval(timer)
  }, [playing, positionIndex, lastIndex, step])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (view !== 'review' || importOpen || guideOpen || event.ctrlKey || event.altKey || event.metaKey ||
          (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select')))) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        setPlaying(false)
        step(event.key === 'ArrowRight' ? 1 : -1)
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        jump(event.key === 'End')
      } else if (event.key.toLowerCase() === 'f') {
        setFlipped((value) => !value)
      } else if (event.key.toLowerCase() === 'j') {
        const targetPly = event.shiftKey ? previousCritical : nextCritical
        if (targetPly !== undefined) selectMove(targetPly)
      } else if (event.key === 'Escape') leaveVariation()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, importOpen, guideOpen, jump, leaveVariation, nextCritical, previousCritical, selectMove, step])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (phoneReview && phonePanelRef.current) phonePanelRef.current.scrollTop = 0
  }, [phoneReview, phonePanel, selectedPly, variation?.baseFen, variation?.line, variation?.index])

  const importGame = (newGame: ParsedGame) => {
    setGame(newGame)
    selectMove(1)
    setOnlyCritical(false)
    setJournalTab('moves')
    setView('review')
    setPhonePanel('coach')
  }

  const exportGame = () => {
    downloadPgn(exportAnnotatedPgn(game, analyses), 'badger-flores-study.pgn')
    setNotice('Your annotated PGN is ready to keep and revisit.')
  }

  const arrows: BoardArrow[] = []
  if (hints && activeTactic) arrows.push(...activeTactic.arrows)
  else if (hints && variation && variation.index < variation.line.moves.length) {
    const next = variation.line.moves[variation.index]
    const nextMove = new Chess(fen).move({ from: next.slice(0, 2), to: next.slice(2, 4), promotion: next[4] })
    arrows.push({ from: nextMove.from, to: nextMove.to, tone: variation.kind === 'reply' ? 'rose' : 'sage' })
  }

  const player = (color: Color) => {
    const headerName = game.headers[color === 'w' ? 'White' : 'Black']
    const name = headerName && headerName !== '?' ? headerName : colorName(color)
    const elo = game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo']
    const accuracy = studyAccuracy(analyses, color)
    return <div className="player-row">
      <span className={`player-avatar avatar-${color}`}><ChessPiece type="k" color={color} /></span>
      <div className="player-info"><strong title={name}>{name}{elo && elo !== '?' && <span className="player-elo">({elo})</span>}</strong><span>{colorName(color)} pieces{displayedChess.turn() === color && !displayedChess.isGameOver() && <><i />To move</>}</span></div>
      {accuracy !== null && <span className="player-accuracy" title="Independent estimated study accuracy for the moves analyzed so far."><span>{accuracy}<small>%</small></span><small>study accuracy</small></span>}
    </div>
  }

  const journalView = (tab: 'moves' | 'insights', compact = false) => <MoveList game={game} analyses={analyses} selectedPly={selectedPly} onSelect={selectMove} onlyCritical={onlyCritical} onToggleCritical={() => setOnlyCritical((value) => !value)} tab={tab} onTabChange={setJournalTab} compact={compact} />
  const coachView = <Coach analysis={analysis} move={move} pending={pending} onExplore={explore} onReply={exploreReply} onTactic={showTactic} activeTactic={activeTactic} />
  const graphView = <EvaluationGraph game={game} positions={positions} selectedPly={selectedPly} onSelect={selectMove} />
  const boardView = <Chessboard fen={fen} flipped={flipped} lastMove={lastMove} arrows={arrows} highlighted={hints ? activeTactic?.squares : []} evaluation={evaluation} />
  const engineWarning = error && <div className="engine-error" role="alert"><CircleHelp size={20} /><span>{error} The board and PGN navigation still work.</span><button className="text-button" onClick={() => { void start() }}>Retry analysis <RotateCw size={14} /></button></div>
  const offlineWarning = offline.status === 'error' && <div className="offline-warning" role="alert"><CloudOff size={18} /><span>Offline saving needs attention: {offline.message} You can still review games while this site is available.</span><button className="text-button" onClick={offline.retry}>Retry offline saving <RotateCw size={14} /></button></div>
  const navigationView = <div className="board-navigation">
    <div className="playback-controls">
      <button className="icon-button" aria-label="First position" disabled={positionIndex === 0} onClick={() => jump(false)}><ChevronsLeft size={19} /></button>
      <button className="icon-button" aria-label="Previous move" disabled={positionIndex === 0} onClick={() => { setPlaying(false); step(-1) }}><ChevronLeft size={22} /></button>
      <button className="play-button" aria-label={playing ? 'Pause playback' : 'Play moves'} disabled={positionIndex === lastIndex && !playing} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
      <button className="icon-button" aria-label="Next move" disabled={positionIndex === lastIndex} onClick={() => { setPlaying(false); step(1) }}><ChevronRight size={22} /></button>
      <button className="icon-button" aria-label="Last position" disabled={positionIndex === lastIndex} onClick={() => jump(true)}><ChevronsRight size={19} /></button>
    </div>
    <span className="nav-separator" />
    <div className="critical-controls">
      <button className="icon-button" aria-label="Previous key moment" title="Previous key moment (Shift+J)" disabled={previousCritical === undefined} onClick={() => { if (previousCritical !== undefined) { selectMove(previousCritical); setPhonePanel('coach') } }}><SkipBack size={16} /></button>
      <button className="next-critical-button" aria-label="Next key moment" title="Next key moment (J)" disabled={nextCritical === undefined} onClick={() => { if (nextCritical !== undefined) { selectMove(nextCritical); setPhonePanel('coach') } }}><span className="critical-label-full">Key moment</span><span className="critical-label-short">Key</span><SkipForward size={15} /></button>
    </div>
  </div>
  const variationView = variation && <div className="variation-strip panel">
    <div><span><GitBranch size={14} /> FOLLOW THE POSSIBILITY</span><button className="text-button" onClick={leaveVariation}><ArrowLeft size={13} /> Original game</button></div>
    <div className="variation-moves"><button className={variation.index === 0 ? 'variation-selected' : ''} onClick={() => { setVariation({ ...variation, index: 0 }); setActiveTactic(null); setPlaying(false) }} aria-label="Alternative starting position"><RotateCcw size={13} /></button>{variation.line.sans.map((san, index) => <button key={`${index}-${san}`} className={variation.index === index + 1 ? 'variation-selected' : ''} onClick={() => { setVariation({ ...variation, index: index + 1 }); setActiveTactic(null); setPlaying(false) }} aria-label={`Alternative step ${index + 1}: ${san}`} aria-current={variation.index === index + 1 ? 'step' : undefined}>{san}</button>)}</div>
    <div className="variation-step-explanation" aria-live="polite">
      <strong>{activeTactic?.title ?? (branchLast ? `${colorName(branchLast.color)} plays ${branchLast.san}` : 'The road not taken.')}</strong>
      <p>{activeTactic?.description ?? (branchLast
        ? describeMoveIdea(branchLast.before, branchLast.lan, detectTactics(branchLast.before, branchLast.lan))
        : variation.kind === 'alternative'
          ? 'We have rewound to before the played move. Follow the green arrow, then step through the replies to see how this idea works.'
          : "This begins after the played move. Follow the rose arrow to discover the opponent's strongest continuation.")}</p>
      {branchStart && branchMaterialChange !== 0 && <small>Net material change for {colorName(branchStart.turn())}: {branchMaterialChange > 0 ? '+' : ''}{branchMaterialChange.toFixed(1)} pawns since this line began.</small>}
    </div>
  </div>

  return (
    <div className={`app-shell${phoneReview ? ' phone-review-app' : ''}`}>
      <a className="skip-link" href={view === 'review' ? '#study-board' : '#play-board'}>Skip to the chessboard</a>
      <header className="site-header">
        <a className="brand" href="./" aria-label="Badger-Flores home" onClick={(event) => { event.preventDefault(); setPlaying(false); setView('review') }}>
          <span className="brand-character"><Badger small /></span>
          <span><strong>Badger<span className="brand-hyphen">-</span>Flores<Flower2 size={18} /></strong><small>A little better, every move.</small></span>
        </a>
        <nav className="header-actions" aria-label="Main navigation">
          <span className="privacy-label" title={offline.message}>{offline.status === 'ready' ? <CloudOff size={15} /> : <ShieldCheck size={15} />}{offline.status === 'ready' ? 'Works offline' : 'Private by nature'}</span>
          <button className="header-guide" aria-label={phoneReview ? 'About the coach & analysis' : undefined} title="The study guide" onClick={() => setGuideOpen(true)}><BookOpen size={16} /><span>The study guide</span></button>
          <button className="primary-button import-button" onClick={() => setImportOpen(true)}><Upload size={16} /> Import a game</button>
        </nav>
      </header>

      <main className={`page-shell page-${view}`}>
        <div className="workspace-mode-bar">
          <div className="workspace-modes" role="tablist" aria-label="Choose a chess activity">
            <button id="review-tab" role="tab" aria-controls="review-panel" aria-selected={view === 'review'} onClick={() => { setPlaying(false); setView('review') }}><BookOpen size={16} /> Review a game</button>
            <button id="play-tab" role="tab" aria-controls="play-panel" aria-selected={view === 'play'} onClick={() => { setPlaying(false); setView('play') }}><Swords size={16} /> Play a bot{botGame.match && !botGame.finished && <i title="Your game is waiting" />}</button>
          </div>
          <span><Sprout size={13} /> Play a little. Learn a little. Grow a little.</span>
        </div>
        {!phoneReview && offlineWarning}
        {view === 'review' ? <section id="review-panel" role="tabpanel" aria-labelledby="review-tab">
        {phoneReview ? <h1 className="sr-only">Game analysis</h1> : <div className="page-heading">
          <div><div className="breadcrumb"><Sprout size={14} /> Your study space <ChevronRight size={12} /><span>Game review</span></div><h1>Good games teach. <span>Every game can.</span></h1><p>Slow down, follow an idea, and discover your next little breakthrough.</p></div>
          <div className="game-heading-actions"><span className="example-label"><Leaf size={13} /> {game === exampleGame ? 'A CLASSIC TO LEARN FROM' : 'YOUR NEXT CHAPTER'}</span><button className="secondary-button export-button" disabled={analyses.length === 0} onClick={exportGame}><Download size={15} /> Export study</button></div>
        </div>}

        <div className="review-status">
          <div className="status-copy">
            <span className={`status-icon${pending ? ' is-working' : ''}`}>{pending ? <LoaderCircle size={17} /> : status === 'error' ? <CircleHelp size={17} /> : <Flower2 size={17} />}</span>
            <div><strong>{phoneReview
              ? status === 'loading' ? 'Loading local engine...' : status === 'analyzing' ? `Reviewing ${analyses.length} / ${game.moves.length}` : status === 'complete' ? `Reviewed · ${criticalPlies.length} key moments` : status === 'error' ? 'Engine needs attention' : 'Review paused'
              : status === 'loading' ? 'Waking up your local coach...' : status === 'analyzing' ? 'Finding the moments that matter...' : status === 'complete' ? 'Your game, thoughtfully reviewed.' : status === 'error' ? "The engine needs a little attention." : 'Your review is paused.'}</strong><span>{status === 'loading' ? 'Loading Stockfish on your device. The first visit may take a moment.' : `${analyses.length} / ${game.moves.length} half-moves reviewed${criticalPlies.length ? ` · ${criticalPlies.length} key moments to explore` : ''}`}</span></div>
          </div>
          <div className="review-status-actions">
            {phoneReview && <span className={`offline-status phone-offline-indicator offline-${offline.status}`} role="status" title={offline.message}><CloudOff size={13} /><span className="sr-only">{offline.message}</span></span>}
            {pending && <span className="progress-percent">{progress}%</span>}
            <label className="depth-select"><span className="sr-only">Review depth</span><select value={mode} onChange={(event) => { setMode(event.target.value as AnalysisMode); leaveVariation() }}><option value="quick">Quick review</option><option value="deep">Deep review</option></select><ChevronDown size={13} /></label>
            {pending ? <button className="icon-button" aria-label="Stop analysis" title="Stop analysis (completed moves are kept)" onClick={stop}><Pause size={17} /></button> : <button className="icon-button" aria-label="Restart analysis" title="Restart analysis" onClick={() => { leaveVariation(); void start() }}><RotateCw size={17} /></button>}
          </div>
          <div className="analysis-progress" role="progressbar" aria-label="Game analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{ width: `${progress}%` }} /></div>
        </div>
        {!phoneReview && engineWarning}

        {phoneReview ? <div className="phone-review-workspace">
          <section className="phone-board" id="study-board" aria-label="Always-visible review board">
            <div className="phone-board-heading">
              <div className="board-caption" aria-live="polite">
                {variation ? <><GitBranch size={14} /><span><strong>{variation.kind === 'reply' ? 'Response' : 'Alternative'} · {variation.index}/{variation.line.moves.length}</strong> {variation.index ? variation.line.sans[variation.index - 1] : variation.line.sans[0]}</span></>
                  : move ? <>{analysis && <GradeBadge kind={analysis.classification} small />}<span><strong>{moveLabel(move)}</strong> · {game.positions[selectedPly].terminalReason ?? (analysis ? CLASSIFICATIONS[analysis.classification].label : 'Waiting for review')}</span></>
                    : <><Sprout size={14} /><span>Starting position · {colorName(displayedChess.turn())} to move</span></>}
              </div>
              {variation && <button className="icon-button phone-back-to-game" aria-label="Back to game" title="Return to the original game" onClick={leaveVariation}><X size={16} /></button>}
              <button className="icon-button" aria-label="Flip board" title="Flip board (F)" onClick={() => setFlipped((value) => !value)}><RotateCw size={16} /></button>
            </div>
            <div className={`board-frame${variation ? ' board-branching' : ''}`}>{boardView}</div>
            {navigationView}
          </section>
          <section className="phone-review-details" aria-label="Review details">
            <div className="phone-panel-toolbar">
              <div role="tablist" aria-label="Analysis panels">
                {PHONE_PANELS.map((panel, index) => <button key={panel} id={`phone-tab-${panel}`} role="tab" aria-controls="phone-review-content" aria-selected={phonePanel === panel} tabIndex={phonePanel === panel ? 0 : -1} onClick={() => setPhonePanel(panel)} onKeyDown={(event) => {
                  let next: number
                  if (event.key === 'ArrowRight') next = (index + 1) % PHONE_PANELS.length
                  else if (event.key === 'ArrowLeft') next = (index + PHONE_PANELS.length - 1) % PHONE_PANELS.length
                  else if (event.key === 'Home') next = 0
                  else if (event.key === 'End') next = PHONE_PANELS.length - 1
                  else return
                  event.preventDefault()
                  event.stopPropagation()
                  setPhonePanel(PHONE_PANELS[next])
                  document.getElementById(`phone-tab-${PHONE_PANELS[next]}`)?.focus({ preventScroll: true })
                }}>{panel === 'coach' ? <Flower2 size={14} /> : panel === 'moves' ? <ListFilter size={14} /> : <TrendingUp size={14} />}{panel[0].toUpperCase() + panel.slice(1)}</button>)}
              </div>
              <button className={`icon-button phone-hints${hints ? ' hints-on' : ''}`} aria-label={`Board hints ${hints ? 'on' : 'off'}`} aria-pressed={hints} title="Toggle board hints" onClick={() => setHints((value) => !value)}><Focus size={15} /></button>
              <button className="icon-button" aria-label="Export study" title="Export annotated PGN" disabled={!analyses.length} onClick={exportGame}><Download size={15} /></button>
            </div>
            <div id="phone-review-content" className={`phone-panel-scroll phone-panel-${phonePanel}`} role="tabpanel" aria-labelledby={`phone-tab-${phonePanel}`} tabIndex={0} ref={phonePanelRef}>
              {engineWarning}{offlineWarning}
              {phonePanel === 'coach' ? variationView || coachView : phonePanel === 'moves' ? journalView('moves', true) : <>
                {graphView}
                <div className="phone-game-players">{player('w')}{player('b')}</div>
                <p className="phone-opening">{game.opening ?? 'Custom starting position or unrecognized opening'}</p>
                {journalView('insights', true)}
                <p className="phone-offline-copy">{offline.message}</p>
              </>}
            </div>
          </section>
        </div> : <div className="study-workspace">
          {journalView(journalTab)}

          <section className="board-column" id="study-board" aria-label="Interactive game review">
            <div className="board-topline"><span>{game.headers.Event && game.headers.Event !== '?' ? game.headers.Event : 'Your game'}<span className="game-year">{game.headers.Date?.slice(0, 4) !== '????' && game.headers.Date ? ` · ${game.headers.Date.slice(0, 4)}` : ''}</span></span><button className="icon-button" aria-label="Flip board" title="Flip board (F)" onClick={() => setFlipped((value) => !value)}><RotateCw size={16} /></button></div>
            {player(flipped ? 'w' : 'b')}
            <div className={`board-frame${variation ? ' board-branching' : ''}`}>
              {variation && <div className="branch-banner"><GitBranch size={14} /><strong>{variation.label}</strong><button aria-label="Back to game" onClick={leaveVariation}><X size={15} /><span>Back to game</span></button></div>}
              {boardView}
            </div>
            {player(flipped ? 'b' : 'w')}

            <div className="board-caption" aria-live="polite">
              {variation ? <><GitBranch size={14} /><span>Alternative reality <strong>{variation.index === 0 ? 'Starting position' : `${variation.index} / ${variation.line.moves.length} steps`}</strong></span><span className="branch-eval-note">Line starts at {formatEvaluation(variation.line.score)}</span></> : move ? <>{analysis ? <GradeBadge kind={analysis.classification} small /> : <span className="caption-dot" />}<span><strong>{moveLabel(move)}</strong>{analysis ? ` · ${CLASSIFICATIONS[analysis.classification].label}` : ' · Ready to explore'}</span>{game.positions[selectedPly].terminalReason && <small>{game.positions[selectedPly].terminalReason}</small>}</> : <><Sprout size={14} /><span>The starting position. A whole game of possibilities.</span></>}
            </div>
            {navigationView}

            {variationView || <div className="board-underbar"><span><span className="keycap">←</span><span className="keycap">→</span> Take it one move at a time.</span><button className={`text-button hint-toggle${hints ? ' hints-on' : ''}`} aria-pressed={hints} onClick={() => setHints((value) => !value)}><Focus size={14} /> Board hints {hints ? 'on' : 'off'}</button></div>}

            {graphView}
            <div className="board-bottom-note"><LockKeyhole size={12} /><span>Local Stockfish 17.1 lite · No accounts. No uploads. Just your next move.</span></div>
            <div className={`offline-status offline-${offline.status}`} role="status"><CloudOff size={12} /><span>{offline.message}</span></div>
          </section>

          {coachView}
        </div>}
        </section> : <section id="play-panel" role="tabpanel" aria-labelledby="play-tab">
          <div className={`play-page-heading${botGame.match ? ' play-heading-active' : ''}`}><h1>Your next chapter <span>starts on the board.</span></h1><p>A garden of local bots, from gentle beginnings to a serious challenge.</p></div>
          <PlayGame game={botGame} onAnalyze={importGame} onNotice={setNotice} />
          <div className={`offline-status offline-${offline.status}`} role="status"><CloudOff size={12} /><span>{offline.message}</span></div>
        </section>}

        <footer className="site-footer"><span><Flower2 size={15} /> Made for curious minds and growing games.</span><button className="text-button" onClick={() => setGuideOpen(true)}>About the coach & analysis <ArrowUpRight size={13} /></button></footer>
      </main>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={importGame} />
      <GuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
      {notice && <div className="toast" role="status"><Download size={16} />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button></div>}
      <span className="sr-only" role="status">{view === 'review' && status === 'complete' ? `Analysis complete. ${criticalPlies.length} key moments found.` : ''}</span>
    </div>
  )
}

export default App
