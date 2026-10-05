import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleHelp, Flower2, Lightbulb, ScanEye, Sparkles, Sprout } from 'lucide-react'
import { CLASSIFICATIONS } from '../chess/analysis'
import { colorName, evaluationPointLoss, formatEvaluation, moveLabel } from '../chess/game'
import type { EngineLine, GameMove, MoveAnalysis, Tactic } from '../chess/types'
import { GradeBadge } from './MoveList'

export function Coach({
  analysis, move, pending, onExplore, onReply, onTactic, activeTactic, onShowCategories,
}: {
  analysis?: MoveAnalysis
  move?: GameMove
  pending: boolean
  onExplore: (line: EngineLine) => void
  onReply: () => void
  onTactic: (tactic: Tactic, suggested: boolean) => void
  activeTactic: Tactic | null
  onShowCategories: () => void
}) {
  const suggested = Boolean(analysis?.missedTactics.length)
  const tactics = analysis ? (suggested ? analysis.missedTactics : analysis.tactics) : []
  const best = analysis?.best
  const loss = analysis ? evaluationPointLoss(analysis) : null
  return (
    <aside className="coach-column" aria-label="Flores-Badger coaching">
      <section className="coach-card">
        <div className="coach-intro"><span className="eyebrow"><Flower2 size={13} /> A LITTLE WISDOM, A LITTLE WILDFLOWER</span></div>
        <div className="coach-heading">
          <div className="coach-name">Flores-Badger <Flower2 size={14} /></div>
          <span className="coach-role">Your companion at the board</span>
        </div>
        <div className="coach-feedback">
          {analysis && move ? <>
            <div className="classification-heading">
              <GradeBadge kind={analysis.classification} />
              <div><strong className={`classification-name text-${analysis.classification}`}>{CLASSIFICATIONS[analysis.classification].label}</strong><span>{moveLabel(move)}{analysis.critical && <b className="key-moment-tag">KEY MOMENT</b>}</span></div>
              <button className="icon-button" aria-label="Explain move categories" title="What do the move categories mean?" onClick={onShowCategories}><CircleHelp size={18} /></button>
            </div>
            <p className="classification-summary">{CLASSIFICATIONS[analysis.classification].summary}</p>
            <div className="move-impact-grid">
              <div><span className="impact-label">White evaluation</span><div className="evaluation-comparison" title="Before and after the played move, from White's perspective."><strong>{formatEvaluation(analysis.before.evaluation)}</strong><ArrowRight size={13} /><strong>{formatEvaluation(analysis.after.evaluation)}</strong></div></div>
              <div className="move-cost"><span className="impact-label">{colorName(move.color)}'s move cost</span><strong>{loss === null ? 'Mate score' : `${loss.toFixed(1)} points`}</strong></div>
            </div>
            <p className="points-note">{loss === null ? 'Mate is a forced result, not a finite pawn-point loss.' : 'Evaluation points: one pawn unit each, not necessarily captured material.'}</p>
            {analysis.materialChange !== 0 && <p className="material-change">Material on the played move: <strong>{analysis.materialChange > 0 ? '+' : ''}{analysis.materialChange.toFixed(1)} points</strong>. Replies can change this.</p>}
            {analysis.keyReason && <section className="key-move-reason" aria-label="Why this is a key move"><h3>Why this is a key move</h3><p>{analysis.keyReason}</p></section>}
            <details className="grading-details"><summary>Why this classification?</summary><p>The grading-model drop for {colorName(move.color)} is about <strong>{(analysis.expectedLoss * 100).toFixed(1)} percentage points</strong>. {CLASSIFICATIONS[analysis.classification].description}</p><p>These are independent study estimates, not Elo points or a guaranteed win probability. Values are rounded; a deeper search may change them.</p><button className="text-button" onClick={onShowCategories}>See all move categories <ArrowRight size={12} /></button></details>
            <h3 className="move-idea-heading">{best?.moves[0] === move.uci ? 'The idea in your move' : 'What to notice'}</h3>
            <p className="move-explanation">{analysis.explanation}</p>
            {analysis.replyExplanation && <p className="reply-explanation">{analysis.replyExplanation}</p>}
          </> : <>
            <div className="coach-move-label"><Sprout size={16} /><span>{!move ? 'A fresh perspective' : pending ? 'Looking a little closer...' : 'Ready when you are'}</span></div>
            <h2>Let's find your next little breakthrough.</h2>
            <p>{!move
            ? "Every game has a story. Step forward through the moves, or jump to a key moment to see where the story changes."
            : pending
              ? "I'm checking the moves with Stockfish, right here on your device. You can explore the board while I find the ideas worth pausing for."
              : 'Start or restart the review to discover the possibilities in this position. Your game stays right here, just between us.'}</p>
          </>}
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
