import { useId, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Chess, SQUARES } from 'chess.js'
import type { Color, PieceSymbol, Square } from 'chess.js'
import { colorName, formatEvaluation, PIECE_NAMES } from '../chess/game'
import type { BoardArrow, Evaluation } from '../chess/types'

export function ChessPiece({ type, color }: { type: PieceSymbol; color: Color }) {
  const fill = color === 'w' ? 'var(--piece-white, #fffcf2)' : 'var(--piece-black, #393743)'
  const stroke = color === 'w' ? 'var(--piece-white-edge, #47444b)' : 'var(--piece-black-edge, #25232f)'
  const detail = color === 'w' ? 'var(--piece-white-detail, #47444b)' : 'var(--piece-black-detail, #bcb6c5)'
  return (
    <svg className={`chess-piece piece-${color}`} viewBox="0 0 48 48" aria-hidden="true">
      <g fill={fill} stroke={stroke} strokeWidth="1.65" strokeLinejoin="round" strokeLinecap="round">
        {type === 'p' && <>
          <circle cx="24" cy="13" r="6" />
          <path d="M20 19q-2 6-4 9l-3 7h22l-3-7q-3-4-4-9Z" />
          <path d="M13 35h22l2 6H11Z" />
          <path d="M17 28h14" fill="none" stroke={detail} strokeWidth="1.2" />
        </>}
        {type === 'r' && <>
          <path d="M12 7h6v5h4V7h4v5h4V7h6v13l-5 5 2 10H15l2-10-5-5Z" />
          <path d="M12 35h24l2 6H10Z" />
          <path d="M15 20h18M17 25h14" stroke={detail} fill="none" strokeWidth="1.3" />
        </>}
        {type === 'n' && <>
          <path d="M14 35q0-9 12-17l-7 2-5 7-7-5 6-11 10-4 2-4 4 6q10 5 10 16l-3 10Z" />
          <path d="M12 35h25l2 6H10Z" />
          <path d="M29 11q8 12-3 21M9 22l6 0" stroke={detail} fill="none" strokeWidth="1.4" />
          <circle cx="21" cy="13" r="1.8" fill={detail} stroke="none" />
        </>}
        {type === 'b' && <>
          <circle cx="24" cy="6.5" r="2.5" />
          <path d="M24 9q-15 10-7 17l3 3-5 6h18l-5-6 3-3q8-7-7-17Z" />
          <path d="m26 12-6 10M18 27h12" stroke={detail} fill="none" strokeWidth="1.6" />
          <path d="M13 35h22l3 6H10Z" />
        </>}
        {type === 'q' && <>
          <path d="m10 14 6 5 2-10 6 10 6-10 2 10 6-5-5 18H15Z" />
          <path d="M15 32h18l2 4H13ZM12 36h24l2 5H10Z" />
          <circle cx="10" cy="12" r="2.6" />
          <circle cx="18" cy="7" r="2.6" />
          <circle cx="30" cy="7" r="2.6" />
          <circle cx="38" cy="12" r="2.6" />
          <path d="M17 28h14" stroke={detail} fill="none" strokeWidth="1.3" />
        </>}
        {type === 'k' && <>
          <path d="M22 4h4v4h4v4h-4v5h-4v-5h-4V8h4Z" />
          <path d="M24 18q-10-10-14-1-3 8 6 15h16q9-7 6-15-4-9-14 1Z" />
          <path d="M16 32h16l3 4H13ZM12 36h24l2 5H10Z" />
          <path d="M24 19v10m-8 0h16" stroke={detail} fill="none" strokeWidth="1.3" />
        </>}
      </g>
    </svg>
  )
}

function squarePoint(square: Square, flipped: boolean) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  return {
    x: (flipped ? 7 - file : file) * 100 + 50,
    y: (flipped ? rank : 7 - rank) * 100 + 50,
  }
}

export function Chessboard({
  fen, flipped, lastMove, arrows = [], highlighted = [], evaluation, showEvaluation = true, interaction,
}: {
  fen: string
  flipped: boolean
  lastMove?: { from: Square; to: Square }
  arrows?: BoardArrow[]
  highlighted?: Square[]
  evaluation?: Evaluation
  showEvaluation?: boolean
  interaction?: {
    enabled: boolean
    selected: Square | null
    destinations: Square[]
    onSelect: (square: Square) => void
  }
}) {
  const chess = useMemo(() => new Chess(fen), [fen])
  const markerId = useId().replace(/:/g, '')
  const files = flipped ? 'hgfedcba' : 'abcdefgh'
  const ranks = flipped ? '12345678' : '87654321'
  const [focusSquare, setFocusSquare] = useState<Square>(flipped ? 'e7' : 'e2')
  const inCheck = chess.isCheck()
  const whiteShare = evaluation ? Math.min(96, Math.max(4, 50 + 46 * Math.tanh(evaluation.cp / 600))) : 50
  const description = SQUARES.flatMap((square) => {
    const piece = chess.get(square)
    return piece ? [`${colorName(piece.color)} ${PIECE_NAMES[piece.type]} on ${square}`] : []
  }).join(', ')

  const navigateSquare = (event: KeyboardEvent<HTMLButtonElement>, row: number, col: number) => {
    let nextRow = row
    let nextCol = col
    if (event.key === 'ArrowUp') nextRow--
    else if (event.key === 'ArrowDown') nextRow++
    else if (event.key === 'ArrowLeft') nextCol--
    else if (event.key === 'ArrowRight') nextCol++
    else if (event.key === 'Home') nextCol = 0
    else if (event.key === 'End') nextCol = 7
    else if (event.key === 'Escape' && interaction?.selected) {
      event.stopPropagation()
      interaction.onSelect(interaction.selected)
      return
    } else return
    event.preventDefault()
    event.stopPropagation()
    const next = `${files[Math.max(0, Math.min(7, nextCol))]}${ranks[Math.max(0, Math.min(7, nextRow))]}` as Square
    setFocusSquare(next)
    event.currentTarget.closest('.chessboard')?.querySelector<HTMLButtonElement>(`button[data-square="${next}"]`)?.focus()
  }

  return (
    <div className={`board-with-eval${showEvaluation ? '' : ' board-no-eval'}`}>
      {showEvaluation && <div className={`evaluation-bar${flipped ? ' eval-flipped' : ''}`} title="White's evaluation. The bar is an advantage indicator, not a win probability." aria-label={`Evaluation: ${formatEvaluation(evaluation)}, from White's perspective`}>
        <div className="eval-white" style={{ height: `${whiteShare}%` }} />
        <span className={`eval-number${evaluation && evaluation.cp < 0 ? ' eval-negative' : ''}`}>{formatEvaluation(evaluation)}</span>
      </div>}
      <div className="chessboard" role={interaction ? 'grid' : 'img'} aria-label={`Chessboard. ${colorName(chess.turn())} to move. ${flipped ? 'Black' : 'White'} at the bottom.${interaction ? ' Select a piece, then a highlighted destination. Arrow keys navigate squares; Enter selects.' : ` ${description}`}`} data-fen={fen}>
        {[...ranks].map((rank, row) => <div className="board-rank" key={rank} role={interaction ? 'row' : undefined}>{[...files].map((file, col) => {
          const square = `${file}${rank}` as Square
          const piece = chess.get(square)
          const dark = ((file.charCodeAt(0) - 97) + Number(rank)) % 2 === 0
          const last = lastMove?.from === square || lastMove?.to === square
          const checked = inCheck && piece?.type === 'k' && piece.color === chess.turn()
          const selected = interaction?.selected === square
          const legal = interaction?.destinations.includes(square)
          const className = `board-square ${dark ? 'square-dark' : 'square-light'}${last ? ' square-last' : ''}${highlighted.includes(square) ? ' square-tactic' : ''}${checked ? ' square-check' : ''}${selected ? ' square-selected' : ''}`
          const contents = <>
              {piece && <ChessPiece type={piece.type} color={piece.color} />}
              {legal && <span className={piece ? 'legal-capture' : 'legal-dot'} />}
              {col === 0 && <span className="coordinate coordinate-rank">{rank}</span>}
              {row === 7 && <span className="coordinate coordinate-file">{file}</span>}
          </>
          return interaction ? <button
            key={square} type="button" data-square={square} className={className} role="gridcell"
            aria-label={`${square}, ${piece ? `${colorName(piece.color)} ${PIECE_NAMES[piece.type]}` : 'empty'}${legal ? ', legal destination' : ''}`}
            aria-selected={selected} disabled={!interaction.enabled} tabIndex={focusSquare === square ? 0 : -1}
            onFocus={() => setFocusSquare(square)} onKeyDown={(event) => navigateSquare(event, row, col)} onClick={() => interaction.onSelect(square)}
          >{contents}</button> : <div key={square} data-square={square} className={className}>{contents}</div>
        })}</div>)}
        <svg className="board-arrows" viewBox="0 0 800 800" aria-hidden="true">
          <defs>
            {(['sage', 'rose', 'gold'] as const).map((tone) =>
              <marker key={tone} id={`${markerId}-${tone}`} markerWidth="42" markerHeight="42" refX="31" refY="21" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M2 2 39 21 2 40 10 21Z" className={`arrow-fill-${tone}`} />
              </marker>,
            )}
          </defs>
          {arrows.map((arrow, index) => {
            const from = squarePoint(arrow.from, flipped)
            const to = squarePoint(arrow.to, flipped)
            const dx = to.x - from.x
            const dy = to.y - from.y
            const length = Math.hypot(dx, dy)
            if (length === 0) return null
            const end = { x: to.x - dx / length * 8, y: to.y - dy / length * 8 }
            const tone = arrow.tone ?? 'sage'
            return <g key={`${arrow.from}-${arrow.to}-${index}`} opacity=".83">
              <circle cx={from.x} cy={from.y} r="14" className={`arrow-fill-${tone}`} />
              <path d={`M${from.x},${from.y} L${end.x},${end.y}`} fill="none" strokeWidth="16" strokeLinecap="round" className={`arrow-stroke-${tone}`} markerEnd={`url(#${markerId}-${tone})`} />
            </g>
          })}
        </svg>
      </div>
    </div>
  )
}
