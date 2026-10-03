import { useEffect, useMemo, useRef } from 'react'
import { BookOpen, Check, Flag, Flower2, ListFilter, Sparkles } from 'lucide-react'
import { CLASSIFICATIONS, studyAccuracy } from '../chess/analysis'
import { moveLabel } from '../chess/game'
import type { GameMove, MoveAnalysis, ParsedGame } from '../chess/types'

export function GradeBadge({ kind, small = false }: { kind: MoveAnalysis['classification']; small?: boolean }) {
  const category = CLASSIFICATIONS[kind]
  return <span className={`grade-badge grade-${kind}${small ? ' grade-small' : ''}`} title={`${category.label}: ${category.description}`} aria-label={category.label}>{category.symbol}</span>
}

export function MoveList({
  game, analyses, selectedPly, onSelect, onlyCritical, onToggleCritical, tab, onTabChange,
}: {
  game: ParsedGame
  analyses: MoveAnalysis[]
  selectedPly: number
  onSelect: (ply: number) => void
  onlyCritical: boolean
  onToggleCritical: () => void
  tab: 'moves' | 'insights'
  onTabChange: (tab: 'moves' | 'insights') => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const rows = useMemo(() => {
    const groups: { number: number; white?: GameMove; black?: GameMove }[] = []
    for (const move of game.moves) {
      let row = groups[groups.length - 1]
      if (!row || row.number !== move.number) {
        row = { number: move.number }
        groups.push(row)
      }
      row[move.color === 'w' ? 'white' : 'black'] = move
    }
    return groups
  }, [game])
  const criticalCount = analyses.filter((move) => move.critical).length
  useEffect(() => {
    const list = listRef.current
    const selected = selectedRef.current
    if (!list || !selected) return
    const offset = selected.getBoundingClientRect().top - list.getBoundingClientRect().top
    if (offset < 0 || offset > list.clientHeight - 40) list.scrollTop += offset - list.clientHeight / 2 + 20
  }, [selectedPly, onlyCritical, tab])

  const renderMove = (move?: GameMove) => {
    if (!move) return <span className="empty-move">...</span>
    const analysis = analyses[move.ply - 1]
    return <button
      key={move.ply}
      ref={selectedPly === move.ply ? selectedRef : undefined}
      className={`move-cell${selectedPly === move.ply ? ' move-selected' : ''}`}
      aria-label={`${moveLabel(move)}${analysis ? `, ${CLASSIFICATIONS[analysis.classification].label}` : ', not analyzed yet'}`}
      aria-current={selectedPly === move.ply ? 'step' : undefined}
      onClick={() => onSelect(move.ply)}
    >
      <span>{move.san}</span>
      {analysis ? <GradeBadge kind={analysis.classification} small /> : <span className="ungraded-dot" title="Waiting for analysis" />}
    </button>
  }

  return (
    <aside className="journal panel" aria-label="Game journal">
      <div className="journal-heading">
        <span className="eyebrow"><Flower2 size={14} /> YOUR STUDY JOURNAL</span>
        <h2>A game to grow from.</h2>
      </div>
      <div className="opening-label">
        <span className="opening-icon"><BookOpen size={17} /></span>
        <div><span>Opening</span><strong>{game.opening ?? 'A position of your own'}</strong></div>
      </div>
      <div className="journal-tabs" role="tablist" aria-label="Study journal view">
        <button role="tab" aria-selected={tab === 'moves'} onClick={() => onTabChange('moves')}>Moves <span>{game.moves.length}</span></button>
        <button role="tab" aria-selected={tab === 'insights'} onClick={() => onTabChange('insights')}>Insights <Sparkles size={13} /></button>
      </div>
      {tab === 'moves' ? <div className="moves-tab" role="tabpanel" aria-label="Game moves">
        <div className="move-column-labels"><span>#</span><span><i className="side-dot side-white" /> White</span><span><i className="side-dot side-black" /> Black</span></div>
        <div className="moves-scroller" ref={listRef}>
          {rows.filter((row) => !onlyCritical || [row.white, row.black].some((move) => move && analyses[move.ply - 1]?.critical)).map((row) =>
            <div className="move-row" key={row.number}>
              <span className="move-number">{row.number}.</span>
              {renderMove(row.white)}{renderMove(row.black)}
            </div>,
          )}
          {onlyCritical && !criticalCount && <p className="empty-copy">No turning points found yet. They will appear as the review progresses.</p>}
          {!onlyCritical && <div className="game-result"><Flag size={12} /> {game.headers.Result ?? '*'} <span>{game.headers.Result === '*' ? 'Unfinished game' : 'Game result'}</span></div>}
        </div>
        <button className={`filter-button${onlyCritical ? ' filter-active' : ''}`} aria-pressed={onlyCritical} onClick={onToggleCritical}>
          <ListFilter size={15} /> Key moments only <span>{criticalCount}</span>
        </button>
      </div> : <div className="insights-tab" role="tabpanel" aria-label="Game insights">
        <p className="section-overline">STUDY ACCURACY <span title="An expected-score-based study estimate, not an official Chess.com accuracy.">ⓘ</span></p>
        <div className="accuracy-pair">
          {(['w', 'b'] as const).map((color) => <div key={color}><span><i className={`side-dot side-${color === 'w' ? 'white' : 'black'}`} /> {color === 'w' ? 'White' : 'Black'}</span><strong>{studyAccuracy(analyses, color) ?? '--'}<small>%</small></strong></div>)}
        </div>
        <p className="insights-note">{analyses.length} of {game.moves.length} half-moves reviewed. Scores are estimates and may change with deeper search.</p>
        <div className="classification-counts">
          {Object.entries(CLASSIFICATIONS).map(([key, value]) => {
            const kind = key as MoveAnalysis['classification']
            const count = analyses.filter((analysis) => analysis.classification === kind).length
            return <div key={kind}><GradeBadge kind={kind} small /><span>{value.label}</span><strong>{count}</strong></div>
          })}
        </div>
      </div>}
      <div className="journal-footnote"><Check size={13} /><span>Every move is a learning opportunity.</span></div>
    </aside>
  )
}
