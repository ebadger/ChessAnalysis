import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compareSelectedMove } from './comparison'
import { parseGame, playUci } from './game'
import { reviewPositionIndex } from './navigation'
import type { PositionAnalysis } from './types'
import { Chessboard } from '../components/Chessboard'

function evaluated(fen: string, uci: string): PositionAnalysis {
  const move = playUci(new Chess(fen), uci)
  const score = { cp: 30, mate: null }
  return { fen, evaluation: score, depth: 12, terminal: false, lines: [{ rank: 1, depth: 12, score, moves: [uci], sans: [move.san] }] }
}

describe('played and best move comparison', () => {
  it('uses the position before the selected move and highlights the recommended piece', () => {
    const game = parseGame('1. h3 *')
    const comparison = compareSelectedMove(game, 1, evaluated(game.initialFen, 'g1f3'))
    expect(comparison.fen).toBe(game.initialFen)
    expect(new Chess(comparison.fen).get('g1')).toEqual({ type: 'n', color: 'w' })
    expect(comparison.arrows).toEqual([
      { from: 'h2', to: 'h3', tone: 'rose', dashed: true },
      { from: 'g1', to: 'f3', tone: 'sage' },
    ])
  })

  it('draws just one best arrow when the move played matches it', () => {
    const game = parseGame('1. e4 *')
    const comparison = compareSelectedMove(game, 1, evaluated(game.initialFen, 'e2e4'))
    expect(comparison.sameMove).toBe(true)
    expect(comparison.arrows).toEqual([{ from: 'e2', to: 'e4', tone: 'sage' }])
  })

  it('works for Black without reversing the meaning of the arrows', () => {
    const game = parseGame('1. e4 h6 *')
    const comparison = compareSelectedMove(game, 2, evaluated(game.moves[1].before, 'e7e5'))
    expect(new Chess(comparison.fen).turn()).toBe('b')
    expect(comparison.arrows[1]).toMatchObject({ from: 'e7', to: 'e5', tone: 'sage' })
  })

  it('does not fabricate a best move before its position has been analyzed', () => {
    const game = parseGame('1. e4 *')
    const pending = compareSelectedMove(game, 1)
    const stale = compareSelectedMove(game, 1, evaluated(game.moves[0].after, 'e7e5'))
    expect(pending.best).toBeNull()
    expect(stale.best).toBeNull()
    expect(pending.arrows).toEqual([{ from: 'e2', to: 'e4', tone: 'rose', dashed: true }])
  })

  it('shows a best-only arrow at the initial position with no selected move', () => {
    const game = parseGame('1. h3 *')
    const comparison = compareSelectedMove(game, 0, evaluated(game.initialFen, 'e2e4'))
    expect(comparison.played).toBeNull()
    expect(comparison.arrows).toEqual([{ from: 'e2', to: 'e4', tone: 'sage' }])
  })

  it('separates overlapping paths and distinguishes different promotions', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+ *')
    const comparison = compareSelectedMove(game, 1, evaluated(game.initialFen, 'a7a8n'))
    expect(comparison.sameMove).toBe(false)
    expect(comparison.arrows).toHaveLength(2)
    expect(comparison.arrows.map((arrow) => arrow.offset)).toEqual([-10, 10])
    const markup = renderToStaticMarkup(createElement(Chessboard, { fen: comparison.fen, flipped: false, arrows: comparison.arrows }))
    const paths = [...markup.matchAll(/<path d="([^"]+)"[^>]*marker-end=/g)].map((match) => match[1])
    expect(paths).toHaveLength(2)
    expect(paths[0]).not.toBe(paths[1])
    expect(paths.every((path) => path.includes(' Q'))).toBe(true)
    expect(markup).toContain('stroke-dasharray="22 16"')
  })

  it('preserves the piece locations needed for castling and en passant comparisons', () => {
    const castle = parseGame('[SetUp "1"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]\n\n1. O-O *')
    expect(compareSelectedMove(castle, 1, evaluated(castle.initialFen, 'e1g1')).arrows).toEqual([{ from: 'e1', to: 'g1', tone: 'sage' }])
    const game = parseGame('1. e4 a6 2. e5 d5 3. exd6 *')
    const comparison = compareSelectedMove(game, 5, evaluated(game.moves[4].before, 'e5d6'))
    expect(new Chess(comparison.fen).get('d5')?.type).toBe('p')
    expect(comparison.arrows).toEqual([{ from: 'e5', to: 'd6', tone: 'sage' }])
  })

  it('maps selection boundaries correctly in both display modes', () => {
    expect(reviewPositionIndex(0, true)).toBe(0)
    expect(reviewPositionIndex(1, true)).toBe(0)
    expect(reviewPositionIndex(10, true)).toBe(9)
    expect(reviewPositionIndex(10, false)).toBe(10)
    const game = parseGame('1. e4 *')
    expect(() => compareSelectedMove(game, 2)).toThrow('in this game')
  })
})
