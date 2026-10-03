import { Chess } from 'chess.js'
import type { Color } from 'chess.js'
import { colorName, describeEvaluation, materialBalance, PIECE_NAMES, playUci, replayLine } from './game'
import { isBookMove } from './openings'
import { detectTactics, findLineTactics } from './tactics'
import type { Classification, EngineLine, MoveAnalysis, ParsedGame, PositionAnalysis, Tactic } from './types'

export const CLASSIFICATIONS: Record<Classification, { label: string; symbol: string; description: string }> = {
  brilliant: { label: 'Brilliant', symbol: '!!', description: 'A sound, near-best piece sacrifice in a position not already clearly won. Detected conservatively.' },
  great: { label: 'Great', symbol: '!', description: 'A best move that is substantially stronger than the next engine candidate.' },
  best: { label: 'Best', symbol: '★', description: "Stockfish's first choice at the completed search depth." },
  excellent: { label: 'Excellent', symbol: '✓', description: 'Very close to best: at most 2 percentage points of estimated expected-score loss.' },
  good: { label: 'Good', symbol: '✓', description: 'A reasonable move: at most 5 percentage points of estimated expected-score loss.' },
  book: { label: 'Book', symbol: '▤', description: 'An exact match in our small, curated opening repertoire, without a significant evaluation loss.' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', description: 'A small setback: 5-10 percentage points of estimated expected-score loss.' },
  mistake: { label: 'Mistake', symbol: '?', description: 'A significant setback: 10-20 percentage points of estimated expected-score loss.' },
  blunder: { label: 'Blunder', symbol: '??', description: 'A major setback: more than 20 percentage points of estimated expected-score loss.' },
  miss: { label: 'Miss', symbol: '×', description: 'A missed mating or material opportunity, or failure to exploit a substantial previous mistake.' },
 }

const criticalClasses = new Set<Classification>(['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder', 'miss'])

export function expectedScore(cp: number): number {
  return 1 / (1 + Math.exp(-0.00368208 * cp))
}

export function classifyLoss(loss: number): Classification {
  if (loss <= 0.02) return 'excellent'
  if (loss <= 0.05) return 'good'
  if (loss <= 0.1) return 'inaccuracy'
  if (loss <= 0.2) return 'mistake'
  return 'blunder'
}

function materialGain(fen: string, line: EngineLine, color: Color, plies = line.moves.length): number {
  return materialBalance(replayLine(fen, line.moves, plies), color) - materialBalance(new Chess(fen), color)
}

function isSoundSacrifice(fen: string, line: EngineLine, color: Color): boolean {
  if (line.moves.length < 2) return false
  const chess = new Chess(fen)
  const sacrifice = playUci(chess, line.moves[0])
  const reply = playUci(chess, line.moves[1])
  return sacrifice.piece !== 'p' && sacrifice.piece !== 'k' &&
    reply.captured !== undefined && reply.captured !== 'p' &&
    materialGain(fen, line, color, 2) <= -200
}

export function describeMoveIdea(fen: string, uci: string, tactics: Tactic[]): string {
  if (tactics[0]) return tactics[0].description
  const chess = new Chess(fen)
  const move = playUci(chess, uci)
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    return 'Castling moves the king out of the center and brings a rook closer to the action.'
  }
  if ((move.piece === 'n' || move.piece === 'b') && move.from[1] === (move.color === 'w' ? '1' : '8')) {
    return `Developing the ${PIECE_NAMES[move.piece]} from ${move.from} brings another piece into play instead of leaving it on the back rank.`
  }
  if (move.captured) {
    return `This captures the ${PIECE_NAMES[move.captured]} on ${move.to}. The continuation shows how the exchanges work out.`
  }
  if (move.promotion) {
    return `Promoting the pawn adds a ${PIECE_NAMES[move.promotion]} to the position.`
  }
  const centers = ['d4', 'e4', 'd5', 'e5'] as const
  const previous = new Chess(fen)
  const gainedControl = centers.filter((square) =>
    !previous.isAttacked(square, move.color) && chess.isAttacked(square, move.color),
  )
  if (gainedControl.length) {
    return `This adds control of ${gainedControl.join(' and ')} in the center. The engine line shows how that fits with the opponent's strongest replies.`
  }
  return 'The advantage is in the continuation, not just the destination square. Step through both sides of the line to compare their threats.'
}

function teachingTip(tactics: Tactic[], move: { piece: string; from: string }): string {
  if (tactics.some((tactic) => tactic.kind === 'fork')) {
    return 'Before you move, look for a square from which one piece can attack two valuable targets.'
  }
  if (tactics.some((tactic) => tactic.kind === 'pin' || tactic.kind === 'skewer')) {
    return 'Look along the whole file, rank, or diagonal. The piece behind the target often explains the tactic.'
  }
  if (tactics.some((tactic) => tactic.kind === 'mate' || tactic.kind === 'check')) {
    return "Start with checks. A forcing move limits your opponent's choices and makes calculation easier."
  }
  if (tactics.some((tactic) => tactic.kind === 'loose-piece' || tactic.kind === 'capture')) {
    return "Count attackers and defenders, then check the opponent's strongest reply before taking material."
  }
  if (tactics.some((tactic) => tactic.kind === 'discovery')) {
    return 'Imagine lifting one of your pieces off the board. Does a rook, bishop, or queen suddenly get a new target?'
  }
  if (['n', 'b'].includes(move.piece) && ['1', '8'].includes(move.from[1])) {
    return 'In the opening, bring your pieces into play, influence the center, and give your king a safe home.'
 }
  return 'Build a small habit: scan for checks, captures, and threats for both sides before committing to a move.'
}

export function analyzeMove(
  game: ParsedGame,
  index: number,
  before: PositionAnalysis,
  after: PositionAnalysis,
  previous?: MoveAnalysis,
): MoveAnalysis {
  const move = game.moves[index]
  const direction = move.color === 'w' ? 1 : -1
  const best = before.lines[0] ?? null
  const bestCp = before.evaluation.cp * direction
  const playedCp = after.evaluation.cp * direction
  const cpLoss = Math.max(0, bestCp - playedCp)
  const expectedLoss = Math.max(0, expectedScore(bestCp) - expectedScore(playedCp))
  let classification = classifyLoss(expectedLoss)
  const isBest = best?.moves[0] === move.uci
  if (isBest) classification = 'best'
  const tactics = detectTactics(move.before, move.uci)
  const alternativeTactics = best ? detectTactics(move.before, best.moves[0]) : []
  const gainedMaterial = best ? materialGain(move.before, best, move.color) : 0
  const availableMate = before.evaluation.mate !== null && bestCp > 0
  const missedTactics = best && !isBest && expectedLoss > 0.05
    ? findLineTactics(move.before, best, move.color)
    : []

  if (best && !isBest && expectedLoss > 0.05 && gainedMaterial >= 200 && !missedTactics.length) {
    missedTactics.push({
      kind: 'capture',
      title: 'Material in the continuation',
      description: `In this displayed best-play line, ${colorName(move.color)} gains about ${(gainedMaterial / 100).toFixed(1)} pawns of net material from the starting position. Walk through the exchanges to see where it comes from.`,
      squares: [],
      arrows: [],
    })
  }
  if (best && expectedLoss > 0.05 && !isBest &&
    ((availableMate && (after.evaluation.mate === null || playedCp < 0)) ||
     (gainedMaterial >= 200 && missedTactics.length > 0) ||
     ((previous?.expectedLoss ?? 0) > 0.1 && bestCp > 100 && cpLoss >= 100))) {
    classification = 'miss'
  }
  if (best && isBest && before.lines[1] &&
    expectedScore(bestCp) - expectedScore(before.lines[1].score.cp * direction) > 0.12) {
    classification = 'great'
  }
  if (best && isBest && expectedLoss <= 0.02 && bestCp >= 0 && bestCp < 200 &&
    playedCp >= -30 && isSoundSacrifice(move.before, best, move.color)) {
    classification = 'brilliant'
  }
  if (cpLoss < 60 && isBookMove(game.initialFen, game.moves.slice(0, index + 1).map((item) => item.uci))) {
    classification = 'book'
  }

  let heading: string
  let explanation: string
  if (!best) {
    heading = 'A quiet place to finish.'
    explanation = game.positions[index].terminalReason ?? 'This position has no continuation to analyze.'
  } else if (classification === 'book') {
    heading = 'Growing from good foundations.'
    explanation = `${move.san} follows a line in our opening repertoire. ${describeMoveIdea(move.before, move.uci, tactics)}`
  } else if (classification === 'brilliant') {
    heading = 'A little courage. A lovely idea.'
    explanation = `${move.san} offers material without giving up the position's promise. The best-play line accepts the sacrifice; explore how the compensation appears.`
  } else if (classification === 'great') {
    heading = 'You found the move that matters.'
    explanation = `${move.san} stands out from the alternatives at this depth. ${describeMoveIdea(move.before, move.uci, tactics)}`
  } else if (classification === 'best') {
    heading = 'Right move. Beautifully spotted.'
    explanation = `${move.san} is the engine's first choice. ${describeMoveIdea(move.before, move.uci, tactics)}`
  } else if (expectedLoss <= 0.05) {
    heading = classification === 'excellent' ? 'A thoughtful move. Keep growing.' : 'A good idea, with room to grow.'
    explanation = `${move.san} keeps much of the position's value. ${best.sans[0]} is the engine's preference: ${describeMoveIdea(move.before, best.moves[0], alternativeTactics)}`
  } else {
    heading = classification === 'miss' ? 'An opportunity hiding in plain sight.' : 'A small pause. A big discovery.'
    explanation = `After ${move.san}, ${describeEvaluation(after.evaluation)}. Instead, consider ${best.sans[0]}. ${describeMoveIdea(move.before, best.moves[0], alternativeTactics)}`
  }

  return {
    move, classification, cpLoss, expectedLoss, before, after, best, tactics, missedTactics,
    critical: criticalClasses.has(classification),
    heading,
    explanation,
    lesson: teachingTip(missedTactics.length ? missedTactics : (isBest ? tactics : alternativeTactics), move),
  }
}

export function studyAccuracy(analyses: MoveAnalysis[], color: Color): number | null {
  const moves = analyses.filter((analysis) => analysis.move.color === color)
  if (!moves.length) return null
  return Math.round(100 * Math.exp(-4 * moves.reduce((sum, move) => sum + move.expectedLoss, 0) / moves.length))
}
