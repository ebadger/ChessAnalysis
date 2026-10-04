import { Chess } from 'chess.js'
import type { Color } from 'chess.js'
import { colorName, describeEvaluation, materialBalance, moveLabel, opposite, PIECE_NAMES, playUci, replayLine } from './game'
import { isBookMove } from './openings'
import { detectTactics, findLineTactics } from './tactics'
import type { Classification, EngineLine, MoveAnalysis, ParsedGame, PositionAnalysis, Tactic } from './types'

export const CLASSIFICATIONS: Record<Classification, { label: string; symbol: string; summary: string; description: string }> = {
  brilliant: { label: 'Brilliant', symbol: '!!', summary: 'A sound piece sacrifice with a strong follow-up.', description: 'A near-best sacrifice in a position not already clearly won. Detected conservatively from the best-play line.' },
  great: { label: 'Great', symbol: '!', summary: 'A best move with much weaker alternatives.', description: 'The best candidate exceeds the runner-up by more than 12 percentage points in the grading model.' },
  best: { label: 'Best', symbol: '★', summary: "The engine's first choice.", description: "Stockfish's top move at the completed search depth. Other moves can be close in value." },
  excellent: { label: 'Excellent', symbol: '✓', summary: 'Very close to the best move.', description: 'At most 2 percentage points of estimated expected-score loss.' },
  good: { label: 'Good', symbol: '✓', summary: 'A reasonable move, with a small cost.', description: 'More than 2 and at most 5 percentage points of estimated expected-score loss.' },
  book: { label: 'Book', symbol: '▤', summary: 'A familiar opening move from our repertoire.', description: 'An exact match in a small, curated opening repertoire, without a significant evaluation loss.' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', summary: 'A small setback in the position.', description: 'More than 5 and at most 10 percentage points of estimated expected-score loss.' },
  mistake: { label: 'Mistake', symbol: '?', summary: 'A significant setback in position value.', description: 'More than 10 and at most 20 percentage points of estimated expected-score loss.' },
  blunder: { label: 'Blunder', symbol: '??', summary: 'A major, often game-changing setback.', description: 'More than 20 percentage points of estimated expected-score loss.' },
  miss: { label: 'Miss', symbol: '×', summary: 'A valuable opportunity was left on the board.', description: 'A missed mating or material opportunity, or failure to exploit a substantial previous mistake.' },
}

const criticalClasses = new Set<Classification>(['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder', 'miss'])

export function isKeyClassification(classification: Classification): boolean {
  return criticalClasses.has(classification)
}

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

  const critical = isKeyClassification(classification)
  const mover = colorName(move.color)
  const opponent = colorName(opposite(move.color))
  const finiteLoss = before.evaluation.mate === null && after.evaluation.mate === null
  let keyReason: string | null = null
  if (classification === 'brilliant' && best) {
    const investment = -materialGain(move.before, best, move.color, 2) / 100
    keyReason = `The best-play line accepts a sacrifice of about ${investment.toFixed(1)} material points from ${mover}, yet the engine still finds a sound position. The compensation, not the material count alone, makes this move special.`
  } else if (classification === 'great' && best && before.lines[1]) {
    const runnerUp = before.lines[1]
    const gap = bestCp - runnerUp.score.cp * direction
    const margin = before.evaluation.mate === null && runnerUp.score.mate === null
      ? `about ${(gap / 100).toFixed(1)} evaluation points`
      : `about ${((expectedScore(bestCp) - expectedScore(runnerUp.score.cp * direction)) * 100).toFixed(1)} percentage points in the grading model`
    keyReason = `${move.san} is the strongest candidate. The next choice, ${runnerUp.sans[0]}, is ${margin} weaker for ${mover} at this depth. Finding this move preserves value that another choice would give up.`
  } else if (classification === 'miss' && best) {
    if (availableMate && (after.evaluation.mate === null || playedCp < 0)) {
      keyReason = `The engine found a forced mating line for ${mover} beginning with ${best.sans[0]}. ${move.san} does not retain that detected mating line at this depth, making it a missed winning opportunity.`
    } else if (gainedMaterial >= 200 && missedTactics.length) {
      keyReason = `The stronger line beginning with ${best.sans[0]} gains about ${(gainedMaterial / 100).toFixed(1)} material points for ${mover} across the displayed ${best.moves.length} half-moves. The played move gives up a meaningful amount of the position's value instead.`
    } else if (previous) {
      keyReason = `${moveLabel(previous.move)} left an opportunity for ${mover}. ${best.sans[0]} takes better advantage of it; ${move.san} gives up part of the advantage that was available.`
    }
  } else if (critical) {
    if (after.evaluation.mate !== null && playedCp < 0) {
      keyReason = after.evaluation.mate === 0
        ? `${opponent} has checkmate after this move. A forced result matters more than any material count.`
        : `The engine now finds a forced mate for ${opponent} in ${Math.abs(after.evaluation.mate)} ${Math.abs(after.evaluation.mate) === 1 ? 'move' : 'moves'}. This is a decisive consequence, not just a small change in material.`
    } else {
      const magnitude = classification === 'inaccuracy' ? 'small' : classification === 'mistake' ? 'significant' : 'major'
      keyReason = finiteLoss
        ? `This gives up about ${(cpLoss / 100).toFixed(1)} evaluation points for ${mover}, shifting the position toward ${opponent}. That ${magnitude} setback makes it a useful moment to study, even if no piece was captured immediately.`
        : `The engine's mating assessment changes at this move. This is a key study point because a forced result cannot be measured as an ordinary pawn-point loss.`
    }
  }
  const materialChange = (materialBalance(new Chess(move.after), move.color) - materialBalance(new Chess(move.before), move.color)) / 100
  const reply = critical && expectedLoss > .05 ? after.lines[0] : undefined
  let replyExplanation = reply?.moves[0]
    ? `${opponent}'s strongest reply is ${reply.sans[0]}. ${describeMoveIdea(move.after, reply.moves[0], detectTactics(move.after, reply.moves[0]))}`
    : null
  if (reply && replyExplanation && playedCp <= 0 && isSoundSacrifice(move.after, reply, opposite(move.color))) {
    const investment = -materialGain(move.after, reply, opposite(move.color), 2) / 100
    replyExplanation += ` In the shown line, ${opponent} then invests about ${investment.toFixed(1)} material points over the first two half-moves while keeping a sound evaluation. The idea depends on the continuation, not just the initial capture.`
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
    critical, keyReason, materialChange, replyExplanation,
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
