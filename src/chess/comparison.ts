import { Chess } from 'chess.js'
import { playUci } from './game'
import { reviewPositionIndex } from './navigation'
import type { BoardArrow, ParsedGame, PositionAnalysis } from './types'

export function compareSelectedMove(game: ParsedGame, selectedPly: number, before?: PositionAnalysis) {
  if (!Number.isInteger(selectedPly) || selectedPly < 0 || selectedPly > game.moves.length) {
    throw new Error('Move comparison requires a position in this game.')
  }
  const positionIndex = reviewPositionIndex(selectedPly, true)
  const fen = game.positions[positionIndex].fen
  const played = game.moves[selectedPly - 1] ?? null
  const bestUci = before?.fen === fen ? before.lines[0]?.moves[0] : undefined
  const best = bestUci ? playUci(new Chess(fen), bestUci) : null
  const sameMove = best !== null && played?.uci === best.lan
  const arrows: BoardArrow[] = []
  if (played && !sameMove) arrows.push({ from: played.from, to: played.to, tone: 'rose', dashed: true })
  if (best) arrows.push({ from: best.from, to: best.to, tone: 'sage' })

  if (arrows.length === 2) {
    const [actual, preferred] = arrows
    const dx = actual.to.charCodeAt(0) - actual.from.charCodeAt(0)
    const dy = Number(actual.to[1]) - Number(actual.from[1])
    const onLine = (square: string) => dx * (Number(square[1]) - Number(actual.from[1])) === dy * (square.charCodeAt(0) - actual.from.charCodeAt(0))
    if (actual.from === preferred.from || actual.to === preferred.to || (onLine(preferred.from) && onLine(preferred.to))) {
      actual.offset = -10
      actual.bend = -25
      preferred.offset = 10
      preferred.bend = 25
    }
  }
  return { positionIndex, fen, played, best, sameMove, arrows }
}
