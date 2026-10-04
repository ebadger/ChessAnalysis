import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import type { ParsedGame, PieceMotion } from './types'

export function fastReplayInterval(distance: number): number {
  if (!Number.isInteger(distance) || distance < 1) throw new Error('A replay must contain at least one move.')
  return Math.max(40, Math.min(110, Math.round(1200 / distance)))
}

export function replayPieceMotions(game: ParsedGame, fromPly: number, toPly: number): PieceMotion[] {
  if (!Number.isInteger(fromPly) || !Number.isInteger(toPly) || fromPly < 0 || toPly < 0 ||
    fromPly > game.moves.length || toPly > game.moves.length || Math.abs(fromPly - toPly) !== 1) {
    throw new Error('Piece motion requires adjacent positions from the same game.')
  }
  const forward = toPly > fromPly
  const move = game.moves[Math.min(fromPly, toPly)]
  const board = new Chess(game.positions[fromPly].fen)
  const from = forward ? move.from : move.to
  const to = forward ? move.to : move.from
  const piece = board.get(from)
  if (!piece) throw new Error(`The replay position has no moving piece on ${from}.`)
  const motions: PieceMotion[] = [{ from, to, type: piece.type, color: piece.color }]
  if (move.piece === 'k' && Math.abs(move.to.charCodeAt(0) - move.from.charCodeAt(0)) === 2) {
    const kingside = move.to[0] === 'g'
    const rookStart = `${kingside ? 'h' : 'a'}${move.from[1]}` as Square
    const rookEnd = `${kingside ? 'f' : 'd'}${move.from[1]}` as Square
    const rookFrom = forward ? rookStart : rookEnd
    const rook = board.get(rookFrom)
    if (rook?.type === 'r' && rook.color === piece.color) {
      motions.push({ from: rookFrom, to: forward ? rookEnd : rookStart, type: 'r', color: rook.color })
    }
  }
  return motions
}
