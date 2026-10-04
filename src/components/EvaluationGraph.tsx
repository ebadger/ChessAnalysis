import { TrendingUp } from 'lucide-react'
import type { ParsedGame, PositionAnalysis } from '../chess/types'
import { formatEvaluation } from '../chess/game'

export function EvaluationGraph({
  game, positions, selectedPly, onSelect,
}: {
  game: ParsedGame
  positions: PositionAnalysis[]
  selectedPly: number
  onSelect: (ply: number) => void
}) {
  const points = positions.map((position, index) => ({
    x: 8 + index / game.moves.length * 584,
    y: 42 - Math.tanh(position.evaluation.cp / 450) * 32,
  }))
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  const selected = points[selectedPly]
  return (
    <section className="evaluation-graph panel" aria-label="Game evaluation timeline, White's perspective" title="Actual game evaluations after each played move, from White's perspective.">
      <div className="graph-heading"><span><TrendingUp size={15} /> The shape of your game</span><small>After each move</small></div>
      <div className="graph-plot">
        <svg viewBox="0 0 600 84" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="graph-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-fill, #a98fba)" stopOpacity=".26" /><stop offset="100%" stopColor="var(--chart-fill, #a98fba)" stopOpacity=".03" /></linearGradient></defs>
          <path d="M0 42H600" stroke="var(--chart-grid, #d9d6da)" strokeDasharray="4 5" />
          {points.length > 1 && <path d={`${line} L${points[points.length - 1].x},84 L8,84 Z`} fill="url(#graph-fill)" />}
          {line && <path d={line} stroke="var(--chart-line, #8b6c9b)" strokeWidth="2.2" fill="none" strokeLinejoin="round" />}
          {selected && <>
            <path d={`M${selected.x} 2V84`} stroke="var(--chart-line, #81668f)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={selected.x} cy={selected.y} r="4" fill="var(--chart-line, #765687)" stroke="var(--paper)" strokeWidth="2" />
          </>}
        </svg>
        {!positions.length && <span className="graph-placeholder">Your game's story will appear here.</span>}
        <input type="range" min="0" max={game.moves.length} value={selectedPly} onChange={(event) => onSelect(Number(event.target.value))} aria-label="Navigate the game timeline" aria-valuetext={`Half-move ${selectedPly}, evaluation ${formatEvaluation(positions[selectedPly]?.evaluation)}`} />
      </div>
      <div className="graph-footer"><span>Opening</span><span>Click or drag to revisit a moment</span><span>Move {game.moves[game.moves.length - 1].number}</span></div>
    </section>
  )
}
