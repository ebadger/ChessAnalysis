import { Chess } from 'chess.js'
import type { Color, PieceSymbol } from 'chess.js'
import { identifyOpening } from './openings'
import type { Evaluation, GamePosition, MoveAnalysis, ParsedGame } from './types'

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
}

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
}

export const DEMO_PGN = `[Event "The Opera Game"]
[Site "Paris, France"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke & Count"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5
6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5
11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6
15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`

export const FORK_PGN = `[Event "A knight's double attack"]
[White "Curious student"]
[Black "Practice partner"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2
6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`

export function colorName(color: Color): string {
  return color === 'w' ? 'White' : 'Black'
}

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

export function moveLabel(move: { number: number; color: Color; san: string }): string {
  return `${move.number}${move.color === 'w' ? '.' : '...'} ${move.san}`
}

function gamePosition(chess: Chess, isFinal = false): GamePosition {
  let terminal: Evaluation | null = null
  let terminalReason: string | null = null
  if (chess.isCheckmate()) {
    terminal = { cp: chess.turn() === 'w' ? -100000 : 100000, mate: 0 }
    terminalReason = `${colorName(opposite(chess.turn()))} wins by checkmate.`
  } else if (chess.isStalemate() || chess.isInsufficientMaterial()) {
    terminal = { cp: 0, mate: null }
    terminalReason = chess.isStalemate() ? 'Draw by stalemate.' : 'Draw by insufficient material.'
  } else if (isFinal && (chess.isThreefoldRepetition() || chess.isDrawByFiftyMoves())) {
    terminal = { cp: 0, mate: null }
    terminalReason = chess.isThreefoldRepetition()
      ? 'Threefold repetition: a draw can be claimed.'
      : 'Fifty-move rule: a draw can be claimed.'
  }
  return { fen: chess.fen(), terminal, terminalReason }
}

export function parseGame(input: string): ParsedGame {
  const pgn = input.trim().replace(/^\uFEFF/, '')
  if (!pgn) throw new Error('Paste a PGN first, or choose one of the example games.')
  if (pgn.length > 250000) throw new Error('This PGN is too large. Please paste one game under 250 KB.')
  const events = pgn.match(/^\s*\[(?:Event|White)\s/gm) ?? []
  if (events.filter((event) => event.includes('[Event')).length > 1 ||
      events.filter((event) => event.includes('[White')).length > 1) {
    throw new Error('Please paste one game at a time. This PGN contains multiple games.')
  }
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`We couldn't read this game. Check the PGN notation. ${detail}`)
  }
  const headers = chess.getHeaders()
  if (headers.Variant && !/^(standard|chess)$/i.test(headers.Variant)) {
    throw new Error('This coach supports standard chess, not variants such as Chess960.')
  }
  const history = chess.history({ verbose: true })
  if (!history.length) throw new Error('This PGN has no moves. Include the move text, not just the game headers.')
  if (history.length > 600) throw new Error('Please use a game with 600 half-moves or fewer.')
  const initialFen = history[0].before
  const replay = new Chess(initialFen)
  const positions = [gamePosition(replay)]
  const moves = history.map((move, index) => {
    replay.move(move.san)
    positions.push(gamePosition(replay, index === history.length - 1))
    return {
      ply: index + 1,
      number: Number(move.before.split(' ')[5]),
      color: move.color,
      san: move.san,
      uci: move.lan,
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      before: move.before,
      after: move.after,
    }
  })
  return {
    pgn,
    headers,
    moves,
    positions,
    initialFen,
    opening: identifyOpening(initialFen, moves.map((move) => move.uci)),
  }
}

export function playUci(chess: Chess, uci: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    throw new Error(`Invalid engine move: ${uci}`)
  }
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
}

export function replayLine(fen: string, moves: string[], count = moves.length): Chess {
  const chess = new Chess(fen)
  for (const move of moves.slice(0, count)) playUci(chess, move)
  return chess
}

export function materialBalance(chess: Chess, color: Color): number {
  return chess.board().flat().reduce((total, piece) => {
    if (!piece) return total
    return total + PIECE_VALUES[piece.type] * (piece.color === color ? 1 : -1)
  }, 0)
}

export function formatEvaluation(evaluation: Evaluation | null | undefined): string {
  if (!evaluation) return '--'
  if (evaluation.mate !== null) return `${evaluation.cp < 0 ? '-' : ''}M${Math.abs(evaluation.mate)}`
  const pawns = evaluation.cp / 100
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`
}

export function downloadPgn(pgn: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function describeEvaluation(evaluation: Evaluation): string {
  if (evaluation.mate !== null) {
    const winner = evaluation.cp > 0 ? 'White' : 'Black'
    return evaluation.mate === 0 ? `${winner} has checkmate` : `${winner} has mate in ${Math.abs(evaluation.mate)}`
  }
  if (Math.abs(evaluation.cp) < 35) return 'the position is approximately balanced'
  return `${evaluation.cp > 0 ? 'White' : 'Black'} is ahead by about ${(Math.abs(evaluation.cp) / 100).toFixed(1)} pawns of evaluation`
}

export function evaluationPointLoss(analysis: Pick<MoveAnalysis, 'before' | 'after' | 'cpLoss'>): number | null {
  return analysis.before.evaluation.mate !== null || analysis.after.evaluation.mate !== null ? null : analysis.cpLoss / 100
}

export function exportAnnotatedPgn(game: ParsedGame, analyses: MoveAnalysis[]): string {
  const chess = new Chess(game.initialFen)
  for (const [key, value] of Object.entries(game.headers)) chess.setHeader(key, value)
  chess.setHeader('Annotator', 'Flores-Badger / Stockfish 17.1 lite')
  for (const move of game.moves) {
    chess.move(move.san)
    const analysis = analyses[move.ply - 1]
    if (!analysis) continue
    const evaluation = analysis.after.evaluation
    const evalTag = evaluation.mate === null
      ? (evaluation.cp / 100).toFixed(2)
      : `#${evaluation.cp < 0 ? '-' : ''}${Math.abs(evaluation.mate)}`
    const suggestion = analysis.best && analysis.best.moves[0] !== move.uci
      ? ` Suggested line: ${analysis.best.sans.slice(0, 8).join(' ')}.`
      : ''
    const loss = evaluationPointLoss(analysis)
    const impact = loss === null ? 'Mate score: no finite evaluation-point loss.' : `Evaluation cost: ${loss.toFixed(1)} pawn units.`
    const keyReason = analysis.keyReason ? ` Key moment: ${analysis.keyReason}` : ''
    chess.setComment(
      `[%eval ${evalTag}] ${analysis.classification}. ${impact} ${analysis.explanation}${keyReason}${suggestion} (Local study estimate, depth ${analysis.before.depth}/${analysis.after.depth}.)`,
    )
  }
  return chess.pgn({ maxWidth: 88 })
}
