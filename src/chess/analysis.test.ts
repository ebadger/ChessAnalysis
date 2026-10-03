import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { analyzeMove, classifyLoss, expectedScore, studyAccuracy } from './analysis'
import { exportAnnotatedPgn, parseGame, playUci } from './game'
import type { EngineLine, PositionAnalysis } from './types'

function position(fen: string, cp: number, moves: string[], secondCp?: number): PositionAnalysis {
  const chess = new Chess(fen)
  const line: EngineLine = { rank: 1, depth: 12, score: { cp, mate: null }, moves, sans: moves.map((move) => playUci(chess, move).san) }
  const lines = [line]
  if (secondCp !== undefined) lines.push({ ...line, rank: 2, score: { cp: secondCp, mate: null } })
  return { fen, evaluation: { cp, mate: null }, depth: 12, terminal: false, lines }
}

describe('independent move grading', () => {
  it.each([
    [0, 'excellent'], [.02, 'excellent'], [.0201, 'good'], [.05, 'good'],
    [.0501, 'inaccuracy'], [.1, 'inaccuracy'], [.1001, 'mistake'],
    [.2, 'mistake'], [.2001, 'blunder'],
  ])('uses the documented expected-score thresholds', (loss, category) => {
    expect(classifyLoss(loss as number)).toBe(category)
  })

  it('compares centipawn scores from the moving side, not always White', () => {
    const game = parseGame('1. h3 h6 *')
    const before = position(game.moves[1].before, 0, ['e7e5'])
    const after = position(game.moves[1].after, 400, ['e2e4'])
    const analysis = analyzeMove(game, 1, before, after)
    expect(analysis.classification).toBe('blunder')
    expect(analysis.cpLoss).toBe(400)
  })

  it('does not invent loss from search noise', () => {
    const game = parseGame('1. h3 *')
    const analysis = analyzeMove(game, 0, position(game.initialFen, 20, ['e2e4']), position(game.moves[0].after, 30, ['e7e5']))
    expect(analysis.cpLoss).toBe(0)
    expect(analysis.expectedLoss).toBe(0)
  })

  it('recognizes best moves and distinguishes a genuinely stronger first candidate', () => {
    const game = parseGame('1. h3 *')
    const after = position(game.moves[0].after, 0, ['e7e5'])
    expect(analyzeMove(game, 0, position(game.initialFen, 0, ['h2h3']), after).classification).toBe('best')
    expect(analyzeMove(game, 0, position(game.initialFen, 0, ['h2h3'], -300), after).classification).toBe('great')
  })

  it('recognizes exact book moves without marking all opening moves as book', () => {
    const game = parseGame('1. e4 *')
    const result = analyzeMove(game, 0, position(game.initialFen, 20, ['e2e4']), position(game.moves[0].after, 20, ['e7e5']))
    expect(result.classification).toBe('book')
    const nonBook = parseGame('1. h3 *')
    const result2 = analyzeMove(nonBook, 0, position(nonBook.initialFen, 0, ['e2e4']), position(nonBook.moves[0].after, -100, ['e7e5']))
    expect(result2.classification).toBe('inaccuracy')
  })

  it('identifies a missed high-value fork in a scored best-play line', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "q3k3/8/8/3N4/8/8/8/4K3 w - - 0 1"]\n\n1. Nf4 *')
    const before = position(game.initialFen, 500, ['d5c7', 'e8d7', 'c7a8'])
    const after = position(game.moves[0].after, -500, ['e8d7'])
    const result = analyzeMove(game, 0, before, after)
    expect(result.classification).toBe('miss')
    expect(result.missedTactics.some((tactic) => tactic.kind === 'fork')).toBe(true)
    expect(result.critical).toBe(true)
  })

  it('finds deeper missed tactics and records their exact board step', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "q3k3/6pp/8/8/8/2N5/8/4K3 w - - 0 1"]\n\n1. Nb1 *')
    const before = position(game.initialFen, 500, ['c3d5', 'h7h6', 'd5c7', 'e8d7', 'c7a8'])
    const after = position(game.moves[0].after, -500, ['h7h6'])
    const result = analyzeMove(game, 0, before, after)
    const fork = result.missedTactics.find((tactic) => tactic.kind === 'fork')
    expect(fork?.lineStep).toBe(3)
    expect(fork?.description).toContain('Later in this engine line')
    expect(fork?.squares).toEqual(expect.arrayContaining(['c7', 'a8', 'e8']))
  })

  it('detects a sacrifice only when the scored best line actually gives up a piece', () => {
    const game = parseGame('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0')
    const move = game.moves[8]
    const best = position(move.before, 100, ['f3e5', 'g4d1', 'c4f7', 'e8e7', 'c3d5'])
    const after = position(move.after, 100, ['g4d1', 'c4f7', 'e8e7', 'c3d5'])
    expect(analyzeMove(game, 8, best, after).classification).toBe('brilliant')
    expect(analyzeMove(game, 8, { ...best, evaluation: { cp: 500, mate: null } }, after).classification).not.toBe('brilliant')
  })

  it('exports valid annotated PGN without changing the moves', () => {
    const game = parseGame('1. h3 h6 *')
    const result = analyzeMove(game, 0, position(game.initialFen, 0, ['e2e4']), position(game.moves[0].after, -200, ['e7e5']))
    const pgn = exportAnnotatedPgn(game, [result])
    expect(pgn).toContain('[%eval -2.00]')
    expect(pgn).toContain('Suggested line: e4')
    expect(parseGame(pgn).moves.map((move) => move.uci)).toEqual(game.moves.map((move) => move.uci))
    expect(parseGame(pgn).headers.Annotator).toContain('Badger-Flores')
  })

  it('keeps study accuracy bounded and unreviewed players unscored', () => {
    const game = parseGame('1. h3 *')
    const result = analyzeMove(game, 0, position(game.initialFen, 0, ['e2e4']), position(game.moves[0].after, -200, ['e7e5']))
    expect(studyAccuracy([], 'w')).toBeNull()
    expect(studyAccuracy([result], 'b')).toBeNull()
    expect(studyAccuracy([result], 'w')).toBeGreaterThan(0)
    expect(studyAccuracy([result], 'w')).toBeLessThan(100)
    expect(expectedScore(0)).toBe(.5)
  })
})
