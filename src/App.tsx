import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowLeftRight, ArrowUpRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, CircleHelp, CloudOff, Download, Flower2, Focus, GitBranch,
  Info, Leaf, ListFilter, LoaderCircle, LockKeyhole, Moon, Pause, Play, RotateCcw, RotateCw, ShieldCheck,
  SkipBack, SkipForward, Sprout, Sun, Swords, TrendingUp, Upload, X,
} from 'lucide-react'
import type { Color } from 'chess.js'
import { Chess } from 'chess.js'
import { CLASSIFICATIONS, describeMoveIdea, studyAccuracy } from './chess/analysis'
import { colorName, DEMO_PGN, downloadPgn, exportAnnotatedPgn, formatEvaluation, materialBalance, moveLabel, parseGame, replayLine } from './chess/game'
import { detectTactics } from './chess/tactics'
import { replayPieceMotions, reviewPositionIndex } from './chess/navigation'
import { compareSelectedMove } from './chess/comparison'
import { matchPgn } from './chess/bots'
import type { AnalysisMode, BoardArrow, EngineLine, ParsedGame, Tactic, Variation } from './chess/types'
import { Chessboard, ChessPiece } from './components/Chessboard'
import { Coach } from './components/Coach'
import { CategoryDialog, GuideDialog, ImportDialog } from './components/Dialogs'
import { EvaluationGraph } from './components/EvaluationGraph'
import { GradeBadge, MoveList } from './components/MoveList'
import { PlayGame } from './components/PlayGame'
import { useAnalysis } from './hooks/useAnalysis'
import { useBotGame } from './hooks/useBotGame'
import { useOffline } from './hooks/useOffline'
import { usePhoneLayout } from './hooks/usePhoneLayout'
import { useTheme } from './hooks/useTheme'
import { useKeyMomentReplay } from './hooks/useKeyMomentReplay'
import type { ThemeSettings } from './hooks/useTheme'

const exampleGame = parseGame(DEMO_PGN)
const PHONE_PANELS = ['coach', 'moves', 'chart'] as const

function App({ initialTheme }: { initialTheme: ThemeSettings }) {
  const theme = useTheme(initialTheme)
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
  const [compareMoves, setCompareMoves] = useState(true)
  const [playing, setPlaying] = useState(false)
  const autoplayTimer = useRef<number | null>(null)
  const [variation, setVariation] = useState<Variation | null>(null)
  const [activeTactic, setActiveTactic] = useState<Tactic | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [onlyCritical, setOnlyCritical] = useState(false)
  const [journalTab, setJournalTab] = useState<'moves' | 'insights'>('moves')
  const [notice, setNotice] = useState<string | null>(null)
  const { status, analyses, positions, error, start, stop } = useAnalysis(game, mode, view === 'review')
  const botGame = useBotGame(view === 'play' && !guideOpen)
  const offline = useOffline()
  const keyReplay = useKeyMomentReplay(game, selectedPly, setSelectedPly, view === 'review', compareMoves)
  const replayJourney = keyReplay.journey?.game === game && view === 'review' ? keyReplay.journey : null
  const replaying = replayJourney !== null
  const pending = status === 'loading' || status === 'analyzing'
  const move = game.moves[selectedPly - 1]
  const analysis = analyses[selectedPly - 1]
  const criticalPlies = useMemo(() => analyses.filter((item) => item.critical).map((item) => item.move.ply), [analyses])
  const keyAnchor = replayJourney?.targetPly ?? selectedPly
  const nextCritical = criticalPlies.find((ply) => ply > keyAnchor)
  const previousCritical = [...criticalPlies].reverse().find((ply) => ply < keyAnchor)
  const comparisonActive = compareMoves && !variation && !activeTactic
  const beforePosition = reviewPositionIndex(selectedPly, true)
  const beforeAnalysis = positions[beforePosition]
  const comparison = useMemo(() => compareSelectedMove(game, selectedPly, beforeAnalysis), [game, selectedPly, beforeAnalysis])
  const boardPosition = comparisonActive ? beforePosition : selectedPly
  const branchChess = useMemo(() => variation ? replayLine(variation.baseFen, variation.line.moves, variation.index) : null, [variation])
  const fen = branchChess?.fen() ?? game.positions[boardPosition].fen
  const displayedChess = useMemo(() => new Chess(fen), [fen])
  const branchHistory = branchChess?.history({ verbose: true })
  const branchLast = branchHistory?.[branchHistory.length - 1]
  const branchStart = variation ? new Chess(variation.baseFen) : null
  const branchMaterialChange = branchStart && branchChess
    ? (materialBalance(branchChess, branchStart.turn()) - materialBalance(branchStart, branchStart.turn())) / 100
    : 0
  const boardMotion = useMemo(() => {
    const frame = keyReplay.transition
    if (!frame || frame.game !== game || frame.toPly !== boardPosition || variation || activeTactic || view !== 'review') return null
    return { id: frame.id, duration: frame.duration, pieces: replayPieceMotions(game, frame.fromPly, frame.toPly) }
  }, [keyReplay.transition, game, boardPosition, variation, activeTactic, view])
  const lastMove = variation ? branchLast : boardMotion?.pieces[0] ?? (comparisonActive ? undefined : move)
  const evaluation = variation?.line.score ?? positions[boardPosition]?.evaluation
  const captionMove = replaying ? game.moves[boardPosition - 1] : move
  const captionAnalysis = replaying ? analyses[boardPosition - 1] : analysis
  const terminalReason = !comparisonActive && !variation ? game.positions[boardPosition].terminalReason : null
  const positionIndex = variation?.index ?? selectedPly
  const lastIndex = variation?.line.moves.length ?? game.moves.length
  const progress = Math.round(analyses.length / game.moves.length * 100)

  const haltPlayback = useCallback((announce = false) => {
    if (autoplayTimer.current !== null) window.clearInterval(autoplayTimer.current)
    autoplayTimer.current = null
    setPlaying(false)
    keyReplay.cancel(announce)
  }, [keyReplay.cancel])

  const selectMove = useCallback((ply: number) => {
    haltPlayback()
    setSelectedPly(ply)
    setVariation(null)
    setActiveTactic(null)
  }, [haltPlayback])
  const leaveVariation = useCallback(() => {
    haltPlayback()
    setVariation(null)
    setActiveTactic(null)
  }, [haltPlayback])
  const selectCritical = useCallback((ply: number | undefined) => {
    if (ply === undefined) return
    haltPlayback()
    setVariation(null)
    setActiveTactic(null)
    setPhonePanel('coach')
    keyReplay.go(ply)
  }, [haltPlayback, keyReplay.go])
  const flipBoard = useCallback(() => {
    haltPlayback()
    setFlipped((value) => !value)
  }, [haltPlayback])
  const toggleComparison = () => {
    haltPlayback()
    setCompareMoves(!comparisonActive)
    setVariation(null)
    setActiveTactic(null)
    if (!comparisonActive) setHints(true)
  }
  const changeView = (next: 'review' | 'play') => { haltPlayback(); setView(next) }
  const openImport = () => { haltPlayback(); setImportOpen(true) }
  const openGuide = () => { haltPlayback(); setGuideOpen(true) }
  const openCategories = () => { haltPlayback(); setCategoriesOpen(true) }
  const step = useCallback((direction: number) => {
    setActiveTactic(null)
    if (variation) {
      setVariation({ ...variation, index: Math.max(0, Math.min(variation.line.moves.length, variation.index + direction)) })
    } else {
      setSelectedPly((ply) => Math.max(0, Math.min(game.moves.length, ply + direction)))
    }
  }, [game.moves.length, variation])
  const jump = useCallback((end: boolean) => {
    haltPlayback()
    setActiveTactic(null)
    if (variation) setVariation({ ...variation, index: end ? variation.line.moves.length : 0 })
    else setSelectedPly(end ? game.moves.length : 0)
  }, [game.moves.length, variation, haltPlayback])
  const explore = useCallback((line: EngineLine) => {
    if (!move) return
    haltPlayback()
    setVariation({ baseFen: move.before, label: `What if ${move.number}${move.color === 'w' ? '.' : '...'} ${line.sans[0]}?`, kind: 'alternative', line, index: 0 })
    setActiveTactic(null)
    setHints(true)
    setPhonePanel('coach')
  }, [move, haltPlayback])
  const exploreReply = () => {
    if (!analysis?.after.lines[0] || !move) return
    haltPlayback()
    setVariation({ baseFen: move.after, label: `${colorName(new Chess(move.after).turn())}'s strongest response`, kind: 'reply', line: analysis.after.lines[0], index: 0 })
    setActiveTactic(null)
    setHints(true)
    setPhonePanel('coach')
  }
  const showTactic = (tactic: Tactic, suggested: boolean) => {
    haltPlayback()
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
    autoplayTimer.current = timer
    return () => {
      window.clearInterval(timer)
      if (autoplayTimer.current === timer) autoplayTimer.current = null
    }
  }, [playing, positionIndex, lastIndex, step])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (view !== 'review' || importOpen || guideOpen || categoriesOpen || event.ctrlKey || event.altKey || event.metaKey ||
          (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select')))) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        haltPlayback()
        step(event.key === 'ArrowRight' ? 1 : -1)
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        jump(event.key === 'End')
      } else if (event.key.toLowerCase() === 'f') {
        flipBoard()
      } else if (event.key.toLowerCase() === 'j') {
        const targetPly = event.shiftKey ? previousCritical : nextCritical
        selectCritical(targetPly)
      } else if (event.key === 'Escape') leaveVariation()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, importOpen, guideOpen, categoriesOpen, jump, leaveVariation, nextCritical, previousCritical, selectCritical, step, haltPlayback, flipBoard])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (theme.warning) setNotice(theme.warning)
  }, [theme.warning])

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
    setCompareMoves(true)
    setHints(true)
  }

  const exportGame = () => {
    downloadPgn(exportAnnotatedPgn(game, analyses), 'flores-badger-study.pgn')
    setNotice('Your annotated PGN is ready to keep and revisit.')
  }
  const exportBotGame = () => {
    if (!botGame.match || !botGame.match.moves.length) {
      setNotice('There are no bot moves to save yet.')
      return
    }
    downloadPgn(matchPgn(botGame.match), 'flores-badger-practice.pgn')
    setNotice('Your bot game is ready to keep before reloading.')
  }

  const arrows: BoardArrow[] = []
  if (hints && !replaying && activeTactic) arrows.push(...activeTactic.arrows)
  else if (hints && !replaying && variation && variation.index < variation.line.moves.length) {
    const next = variation.line.moves[variation.index]
    const nextMove = new Chess(fen).move({ from: next.slice(0, 2), to: next.slice(2, 4), promotion: next[4] })
    arrows.push({ from: nextMove.from, to: nextMove.to, tone: variation.kind === 'reply' ? 'rose' : 'sage' })
  } else if (hints && !replaying && comparisonActive) arrows.push(...comparison.arrows)

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

  const journalView = (tab: 'moves' | 'insights', compact = false) => <MoveList game={game} analyses={analyses} selectedPly={replaying ? boardPosition : selectedPly} onSelect={selectMove} onlyCritical={onlyCritical} onToggleCritical={() => setOnlyCritical((value) => !value)} tab={tab} onTabChange={setJournalTab} compact={compact} onShowCategories={openCategories} />
  const coachPly = replayJourney?.startPly ?? selectedPly
  const replayLabel = replayJourney ? replayJourney.targetPly ? `${replayJourney.beforeMove ? 'before ' : ''}${moveLabel(game.moves[replayJourney.targetPly - 1])}` : 'the starting position' : ''
  const coachView = <div className={`coach-region${replaying ? ' replay-in-progress' : ''}`}>
    <div className="coach-content" aria-hidden={replaying || undefined}><Coach analysis={analyses[coachPly - 1]} move={game.moves[coachPly - 1]} pending={pending} onExplore={explore} onReply={exploreReply} onTactic={showTactic} activeTactic={activeTactic} onShowCategories={openCategories} /></div>
    {replayJourney && <section className="key-replay-card panel" aria-label="Fast replay" data-start-ply={replayJourney.startPly} data-target-ply={replayJourney.targetPly} data-start-position={replayJourney.startPosition} data-target-position={replayJourney.targetPosition}>
      <span className="eyebrow">{replayJourney.targetPly > replayJourney.startPly ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />} FOLLOWING THE GAME</span>
      <h2>{replayJourney.targetPly > replayJourney.startPly ? 'Forward to' : 'Back to'} <strong>{replayLabel}</strong></h2>
      <p>A quick look at every move in between. You can stop at any position.</p>
      <div className="key-replay-progress" aria-hidden="true"><span style={{ width: `${100 * Math.abs(boardPosition - replayJourney.startPosition) / Math.abs(replayJourney.targetPosition - replayJourney.startPosition)}%` }} /></div>
      <div className="key-replay-actions"><button className="text-button" onClick={() => haltPlayback(true)}><Pause size={13} /> Stop here</button><button className="text-button" onClick={keyReplay.finish}>Skip to key moment <SkipForward size={13} /></button></div>
    </section>}
  </div>
  const graphView = <EvaluationGraph game={game} positions={positions} selectedPly={replaying ? boardPosition : selectedPly} onSelect={selectMove} />
  const boardView = <Chessboard fen={fen} flipped={flipped} lastMove={lastMove} arrows={arrows} highlighted={hints ? activeTactic?.squares : []} evaluation={evaluation} motion={boardMotion} recommendedFrom={comparisonActive && hints && !replaying ? comparison.best?.from : undefined} />
  const comparisonToggle = <button className="comparison-toggle icon-button" aria-label="Compare best and played moves" aria-pressed={comparisonActive} title={comparisonActive ? 'Show the position after the played move' : 'Compare played and best moves before the move'} onClick={toggleComparison}><ArrowLeftRight size={16} /><span>Compare</span></button>
  const comparisonLegend = <div className={`comparison-legend${hints ? '' : ' arrows-hidden'}`} role="note" aria-label="Board move legend">
    {replaying ? <span>Replaying the original game...</span>
      : variation ? <><span>{variation.kind === 'reply' ? 'Response line' : 'Alternative line'}</span><span className={variation.kind === 'reply' ? 'legend-played' : 'legend-best'}>{variation.index < variation.line.sans.length ? `Next: ${variation.line.sans[variation.index]}` : 'Line complete'}</span></>
        : activeTactic ? <span className="legend-tactic">Tactic view · after {move ? moveLabel(move) : 'the move'}</span>
          : comparisonActive ? <>
            <span className="comparison-position">{move ? 'Before move' : 'Start'}</span>
            {comparison.sameMove ? <span className="legend-best" title={`Played and best: ${comparison.best?.san}`}><i className="legend-swatch" />Played = best: {comparison.best?.san}</span>
              : <><span className="legend-best" title={`Best: ${comparison.best?.san ?? 'Not analyzed yet'}`}><i className="legend-swatch" />Best: {comparison.best?.san ?? (beforeAnalysis?.terminal ? 'No line' : pending ? 'Pending' : 'Not analyzed')}</span>{comparison.played && <span className="legend-played" title={`Played: ${comparison.played.san}`}><i className="legend-swatch" />Played: {comparison.played.san}</span>}</>}
            {!hints && <span>Arrows off</span>}
          </> : <span>{move ? 'After move · actual game position' : 'Starting position'}</span>}
  </div>
  const engineWarning = error && <div className="engine-error" role="alert"><CircleHelp size={20} /><span>{error} The board and PGN navigation still work.</span><button className="text-button" onClick={() => { haltPlayback(); void start() }}>Retry analysis <RotateCw size={14} /></button></div>
  const offlineWarning = offline.status === 'error' && <div className="offline-warning" role="alert"><CloudOff size={18} /><span>Offline saving needs attention: {offline.message} You can still review games while this site is available.</span><button className="text-button" onClick={offline.retry}>Retry offline saving <RotateCw size={14} /></button></div>
  const navigationView = <div className="board-navigation">
    <div className="playback-controls">
      <button className="icon-button" aria-label="First position" disabled={positionIndex === 0} onClick={() => jump(false)}><ChevronsLeft size={19} /></button>
      <button className="icon-button" aria-label="Previous move" disabled={positionIndex === 0} onClick={() => { haltPlayback(); step(-1) }}><ChevronLeft size={22} /></button>
      <button className="play-button" aria-label={replaying ? 'Stop fast replay' : playing ? 'Pause playback' : 'Play moves'} disabled={positionIndex === lastIndex && !playing && !replaying} onClick={() => { if (playing || replaying) haltPlayback(true); else setPlaying(true) }}>{playing || replaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
      <button className="icon-button" aria-label="Next move" disabled={positionIndex === lastIndex} onClick={() => { haltPlayback(); step(1) }}><ChevronRight size={22} /></button>
      <button className="icon-button" aria-label="Last position" disabled={positionIndex === lastIndex} onClick={() => jump(true)}><ChevronsRight size={19} /></button>
    </div>
    <span className="nav-separator" />
    <div className="critical-controls">
      <button className="icon-button" aria-label="Previous key moment" title="Previous key moment (Shift+J)" disabled={previousCritical === undefined} onClick={() => selectCritical(previousCritical)}><SkipBack size={16} /></button>
      <button className="next-critical-button" aria-label="Next key moment" title="Next key moment (J)" disabled={nextCritical === undefined} onClick={() => selectCritical(nextCritical)}><span className="critical-label-full">Key moment</span><span className="critical-label-short">Key</span><SkipForward size={15} /></button>
    </div>
  </div>
  const variationView = variation && <div className="variation-strip panel">
    <div><span><GitBranch size={14} /> FOLLOW THE POSSIBILITY</span><button className="text-button" onClick={leaveVariation}><ArrowLeft size={13} /> Original game</button></div>
    <div className="variation-moves"><button className={variation.index === 0 ? 'variation-selected' : ''} onClick={() => { haltPlayback(); setVariation({ ...variation, index: 0 }); setActiveTactic(null) }} aria-label="Alternative starting position"><RotateCcw size={13} /></button>{variation.line.sans.map((san, index) => <button key={`${index}-${san}`} className={variation.index === index + 1 ? 'variation-selected' : ''} onClick={() => { haltPlayback(); setVariation({ ...variation, index: index + 1 }); setActiveTactic(null) }} aria-label={`Alternative step ${index + 1}: ${san}`} aria-current={variation.index === index + 1 ? 'step' : undefined}>{san}</button>)}</div>
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
        <a className="brand" href="./" aria-label="Flores-Badger home" onClick={(event) => { event.preventDefault(); changeView('review') }}>
          <span><strong>Flores<span className="brand-hyphen">-</span>Badger<Flower2 size={18} /></strong><small>A little better, every move.</small></span>
        </a>
        <nav className="header-actions" aria-label="Main navigation">
          <span className="privacy-label" title={offline.message}>{offline.status === 'ready' ? <CloudOff size={15} /> : <ShieldCheck size={15} />}{offline.status === 'ready' ? 'Works offline' : 'Private by nature'}</span>
          <button className="header-guide" aria-label={phoneReview ? 'About the coach & analysis' : undefined} title={offline.updates.state.status === 'available' ? 'An app update is available. Open the guide to reload safely.' : 'The study guide'} onClick={openGuide}><BookOpen size={16} /><span>The study guide</span>{offline.updates.state.status === 'available' && <i className="app-update-dot" aria-hidden="true" />}</button>
          <button className="primary-button import-button" onClick={openImport}><Upload size={16} /> Import a game</button>
        </nav>
      </header>

      <main className={`page-shell page-${view}`}>
        <div className="workspace-mode-bar">
          <div className="workspace-modes" role="tablist" aria-label="Choose a chess activity">
            <button id="review-tab" role="tab" aria-controls="review-panel" aria-selected={view === 'review'} onClick={() => changeView('review')}><BookOpen size={16} /> Review a game</button>
            <button id="play-tab" role="tab" aria-controls="play-panel" aria-selected={view === 'play'} onClick={() => changeView('play')}><Swords size={16} /> Play a bot{botGame.match && !botGame.finished && <i title="Your game is waiting" />}</button>
          </div>
          <span><Sprout size={13} /> Play a little. Learn a little. Grow a little.</span>
          <button className="icon-button theme-toggle" aria-label={`Switch to ${theme.theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme.theme === 'dark' ? 'light' : 'dark'} mode`} onClick={theme.toggle}>{theme.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
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
            {pending ? <button className="icon-button" aria-label="Stop analysis" title="Stop analysis (completed moves are kept)" onClick={() => { haltPlayback(); stop() }}><Pause size={17} /></button> : <button className="icon-button" aria-label="Restart analysis" title="Restart analysis" onClick={() => { leaveVariation(); void start() }}><RotateCw size={17} /></button>}
          </div>
          <div className="analysis-progress" role="progressbar" aria-label="Game analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{ width: `${progress}%` }} /></div>
        </div>
        {!phoneReview && engineWarning}

        {phoneReview ? <div className="phone-review-workspace">
          <section className="phone-board" id="study-board" aria-label="Always-visible review board">
            <div className="phone-board-header">
            <div className="phone-board-heading">
              <div className="board-caption" aria-live={replaying ? 'off' : 'polite'}>
                {replayJourney && <span className="replay-direction" aria-hidden="true">{replayJourney.targetPly > replayJourney.startPly ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}</span>}
                {variation ? <><GitBranch size={14} /><span><strong>{variation.kind === 'reply' ? 'Response' : 'Alternative'} · {variation.index}/{variation.line.moves.length}</strong> {variation.index ? variation.line.sans[variation.index - 1] : variation.line.sans[0]}</span></>
                  : captionMove ? <>{captionAnalysis && <GradeBadge kind={captionAnalysis.classification} small />}<span><strong>{comparisonActive && !replaying ? 'Before ' : ''}{moveLabel(captionMove)}</strong> · {terminalReason ?? (captionAnalysis ? CLASSIFICATIONS[captionAnalysis.classification].label : 'Waiting for review')}</span></>
                    : <><Sprout size={14} /><span>Starting position · {colorName(displayedChess.turn())} to move</span></>}
              </div>
              {variation && <button className="icon-button phone-back-to-game" aria-label="Back to game" title="Return to the original game" onClick={leaveVariation}><X size={16} /></button>}
              {comparisonToggle}
              <button className="icon-button" aria-label="Flip board" title="Flip board (F)" onClick={flipBoard}><RotateCw size={16} /></button>
            </div>
            {comparisonLegend}
            </div>
            <div className={`board-frame${variation ? ' board-branching' : ''}${replaying ? ' board-replaying' : ''}`}>{boardView}</div>
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
            <div className="board-topline"><span>{game.headers.Event && game.headers.Event !== '?' ? game.headers.Event : 'Your game'}<span className="game-year">{game.headers.Date?.slice(0, 4) !== '????' && game.headers.Date ? ` · ${game.headers.Date.slice(0, 4)}` : ''}</span></span><div className="board-tools">{comparisonToggle}<button className="icon-button" aria-label="Flip board" title="Flip board (F)" onClick={flipBoard}><RotateCw size={16} /></button></div></div>
            {player(flipped ? 'w' : 'b')}
            <div className={`board-frame${variation ? ' board-branching' : ''}${replaying ? ' board-replaying' : ''}`}>
              {variation && <div className="branch-banner"><GitBranch size={14} /><strong>{variation.label}</strong><button aria-label="Back to game" onClick={leaveVariation}><X size={15} /><span>Back to game</span></button></div>}
              {boardView}
            </div>
            {comparisonLegend}
            {player(flipped ? 'b' : 'w')}

            <div className="board-caption" aria-live={replaying ? 'off' : 'polite'}>
              {replayJourney && <span className="replay-direction" aria-hidden="true">{replayJourney.targetPly > replayJourney.startPly ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}</span>}
              {variation ? <><GitBranch size={14} /><span>Alternative reality <strong>{variation.index === 0 ? 'Starting position' : `${variation.index} / ${variation.line.moves.length} steps`}</strong></span><span className="branch-eval-note">Line starts at {formatEvaluation(variation.line.score)}</span></> : captionMove ? <>{captionAnalysis ? <GradeBadge kind={captionAnalysis.classification} small /> : <span className="caption-dot" />}<span><strong>{comparisonActive && !replaying ? 'Before ' : ''}{moveLabel(captionMove)}</strong>{captionAnalysis ? ` · ${CLASSIFICATIONS[captionAnalysis.classification].label}` : ' · Ready to explore'}</span>{terminalReason && <small>{terminalReason}</small>}</> : <><Sprout size={14} /><span>The starting position. A whole game of possibilities.</span></>}
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

        <footer className="site-footer"><span><Flower2 size={15} /> Made for curious minds and growing games.</span><button className="text-button" onClick={openGuide}>About the coach & analysis <ArrowUpRight size={13} /></button></footer>
      </main>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={importGame} />
      <GuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} themePreference={theme.preference} onThemeChange={theme.setPreference} themeWarning={theme.warning} updates={offline.updates} onSaveStudy={exportGame} onSaveBotGame={botGame.match?.moves.length ? exportBotGame : undefined} />
      <CategoryDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
      {notice && <div className="toast" role="status"><Info size={16} />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button></div>}
      <span className="sr-only" role="status">{view === 'review' && status === 'complete' ? `Analysis complete. ${criticalPlies.length} key moments found.` : ''}</span>
      <span className="sr-only" role="status">{keyReplay.announcement}</span>
    </div>
  )
}

export default App
