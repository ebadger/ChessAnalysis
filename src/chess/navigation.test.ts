import { describe, expect, it } from 'vitest'
import { parseGame } from './game'
import { fastReplayInterval, replayPieceMotions } from './navigation'

describe('fast review traversal', () => {
  it('speeds up longer gaps while keeping each step perceptible', () => {
    expect(fastReplayInterval(1)).toBe(110)
    expect(fastReplayInterval(10)).toBe(110)
    expect(fastReplayInterval(20)).toBe(60)
    expect(fastReplayInterval(100)).toBe(40)
    expect(fastReplayInterval(600)).toBe(40)
    expect(() => fastReplayInterval(0)).toThrow()
  })

  it('moves the actual piece forward and backward', () => {
    const game = parseGame('1. e4 e5 *')
    expect(replayPieceMotions(game, 0, 1)).toEqual([{ from: 'e2', to: 'e4', type: 'p', color: 'w' }])
    expect(replayPieceMotions(game, 2, 1)).toEqual([{ from: 'e5', to: 'e7', type: 'p', color: 'b' }])
  })

  it('animates both castling pieces in both directions', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]\n\n1. O-O O-O-O *')
    expect(replayPieceMotions(game, 0, 1)).toEqual([
      { from: 'e1', to: 'g1', type: 'k', color: 'w' },
      { from: 'h1', to: 'f1', type: 'r', color: 'w' },
    ])
    expect(replayPieceMotions(game, 2, 1)).toEqual([
      { from: 'c8', to: 'e8', type: 'k', color: 'b' },
      { from: 'd8', to: 'a8', type: 'r', color: 'b' },
    ])
  })

  it('uses the original moving piece before promotion and the promoted piece while rewinding', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+ *')
    expect(replayPieceMotions(game, 0, 1)).toEqual([{ from: 'a7', to: 'a8', type: 'p', color: 'w' }])
    expect(replayPieceMotions(game, 1, 0)).toEqual([{ from: 'a8', to: 'a7', type: 'q', color: 'w' }])
  })

  it('reverses en passant without inventing a move for the restored pawn', () => {
    const game = parseGame('1. e4 a6 2. e5 d5 3. exd6 *')
    expect(replayPieceMotions(game, 5, 4)).toEqual([{ from: 'd6', to: 'e5', type: 'p', color: 'w' }])
    expect(game.positions[4].fen).toContain('3pP3')
  })

  it('rejects non-adjacent or out-of-range animation requests', () => {
    const game = parseGame('1. e4 e5 *')
    expect(() => replayPieceMotions(game, 0, 2)).toThrow('adjacent')
    expect(() => replayPieceMotions(game, -1, 0)).toThrow('adjacent')
    expect(() => replayPieceMotions(game, 2, 3)).toThrow('adjacent')
  })
})
