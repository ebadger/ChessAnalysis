import { ArrowDownRight, ArrowRight, ArrowUpRight, Flower2, Lightbulb, ScanEye, Sparkles, Sprout } from 'lucide-react'
import { CLASSIFICATIONS } from '../chess/analysis'
import { formatEvaluation, moveLabel } from '../chess/game'
import type { EngineLine, GameMove, MoveAnalysis, Tactic } from '../chess/types'
import { Badger } from './Badger'
import { GradeBadge } from './MoveList'

export function Coach({
  analysis, move, pending, onExplore, onReply, onTactic, activeTactic,
}: {
  analysis?: MoveAnalysis
  move?: GameMove
  pending: boolean
  onExplore: (line: EngineLine) => void
  onReply: () => void
  onTactic: (tactic: Tactic, suggested: boolean) => void
  activeTactic: Tactic | null
}) {
  const suggested = Boolean(analysis?.missedTactics.length)
  const tactics = analysis ? (suggested ? analysis.missedTactics : analysis.tactics) : []
  const best = analysis?.best
  return (
    <aside className="coach-column" aria-label="Badger-Flores coaching">
      <section className="coach-card">
        <div className="coach-intro"><span className="eyebrow"><Flower2 size={13} /> A LITTLE WISDOM, A LITTLE WILDFLOWER</span></div>
        <div className="coach-portrait">
          <div className="portrait-halo" />
          <span className="portrait-spark spark-one">+</span><span className="portrait-spark spark-two">+</span>
          <Badger />
          <div className="coach-name">Badger-Flores <Flower2 size={14} /></div>
          <span className="coach-role">Your companion at the board</span>
        </div>
        <div className="coach-feedback">
          {analysis && move ? <div className={`coach-move-label text-${analysis.classification}`}>
            <GradeBadge kind={analysis.classification} small />
            <strong>{moveLabel(move)}</strong><span>· {CLASSIFICATIONS[analysis.classification].label}</span>
          </div> : <div className="coach-move-label"><Sprout size={16} /><span>{!move ? 'A fresh perspective' : pending ? 'Looking a little closer...' : 'Ready when you are'}</span></div>}
          <h2>{analysis?.heading ?? "Let's find your next little breakthrough."}</h2>
          <p>{analysis?.explanation ?? (!move
            ? "Every game has a story. Step forward through the moves, or jump to a key moment to see where the story changes."
            : pending
              ? "I'm checking the moves with Stockfish, right here on your device. You can explore the board while I find the ideas worth pausing for."
              : 'Start or restart the review to discover the possibilities in this position. Your game stays right here, just between us.')}</p>
          {analysis && <div className="evaluation-comparison" title="Engine evaluations from White's perspective, before and after the played move. These are not material counts.">
            <span>Before <strong>{formatEvaluation(analysis.before.evaluation)}</strong></span>
            <ArrowRight size={14} />
            <span>After <strong>{formatEvaluation(analysis.after.evaluation)}</strong></span>
            <small>White eval</small>
          </div>}
          {analysis && analysis.expectedLoss > .05 && analysis.after.lines[0] && <button className="text-button response-button" onClick={onReply}>
            <ScanEye size={15} /> See what the opponent can do <ArrowUpRight size={14} />
          </button>}
        </div>
      </section>

      {best && analysis && <section className="alternatives-card panel">
        <div className="section-heading"><span><Sparkles size={15} /> {best.moves[0] === move?.uci ? 'Keep the idea growing' : 'A better path'}</span><small>depth {best.depth}</small></div>
        <button className="best-alternative" onClick={() => onExplore(best)} aria-label={`Explore best alternative ${best.sans[0]}`}>
          <span className="alternative-main"><span className="alternative-star">★</span><strong>{move?.number}{move?.color === 'w' ? '.' : '...'} {best.sans[0]}</strong><span className="best-tag">BEST</span><span className="alternative-eval">{formatEvaluation(best.score)}</span></span>
          <span className="alternative-preview">{best.sans.slice(1, 6).join('  ')}{best.sans.length > 6 ? ' ...' : ''}</span>
          <span className="explore-label">Walk through this line <ArrowRight size={15} /></span>
        </button>
        {analysis.before.lines.length > 1 && <details className="more-alternatives">
          <summary>Compare {analysis.before.lines.length - 1} more {analysis.before.lines.length === 2 ? 'idea' : 'ideas'}</summary>
          {analysis.before.lines.slice(1).map((line) => <button key={line.rank} onClick={() => onExplore(line)} aria-label={`Explore alternative ${line.sans[0]}`}>
            <span><strong>{line.sans[0]}</strong><small>{line.sans.slice(1, 4).join(' ')}</small></span><span>{formatEvaluation(line.score)} <ArrowUpRight size={14} /></span>
          </button>)}
        </details>}
        <p className="line-disclaimer">Best-play possibilities, not predictions. All scores are from White's perspective.</p>
      </section>}

      {tactics.length > 0 && <section className="tactics-card panel">
        <div className="section-heading"><span><ScanEye size={16} /> {suggested ? 'An idea worth noticing' : 'Tactics on the board'}</span></div>
        {tactics.slice(0, 3).map((tactic, index) =>
          <button key={`${tactic.kind}-${index}`} className={`tactic-item${activeTactic === tactic ? ' tactic-active' : ''}`} aria-pressed={activeTactic === tactic} onClick={() => onTactic(tactic, suggested)}>
            <span className="tactic-icon">{tactic.kind === 'fork' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}</span>
            <span><strong>{tactic.title}</strong><small>{tactic.squares.length ? `${tactic.squares.join(' · ')}${tactic.lineStep && tactic.lineStep > 1 ? ` · Line step ${tactic.lineStep}` : ' · Show on board'}` : 'Explore the continuation'}</small></span>
            <ArrowRight size={14} />
          </button>,
        )}
        {activeTactic && <p className="tactic-description">{activeTactic.description}</p>}
      </section>}

      <div className="takeaway-card">
        <span className="takeaway-icon"><Lightbulb size={18} /></span>
        <div><h3>One little habit to take away</h3><p>{analysis?.lesson ?? 'Before every move, ask: what changed, what is threatened, and what would my opponent like to do next?'}</p></div>
      </div>
    </aside>
  )
}
