import { describe, expect, it } from 'vitest'
import { parseGame } from './game'
import { detectTactics } from './tactics'

describe('board-grounded tactical patterns', () => {
  it('finds a knight fork of a king and queen', () => {
    const tactics = detectTactics('q3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7')
    const fork = tactics.find((tactic) => tactic.kind === 'fork')
    expect(fork?.squares).toEqual(expect.arrayContaining(['c7', 'a8', 'e8']))
    expect(fork?.description).toContain('fork pattern')
  })

  it('finds a pawn double attack', () => {
    const tactics = detectTactics('6k1/8/8/2q1r3/8/3P4/8/K7 w - - 0 1', 'd3d4')
    expect(tactics.some((tactic) => tactic.kind === 'fork')).toBe(true)
  })

  it('finds an absolute bishop pin to a king', () => {
    const tactics = detectTactics('7k/8/5n2/8/8/8/8/2B1K3 w - - 0 1', 'c1b2')
    expect(tactics.find((tactic) => tactic.kind === 'pin')?.squares).toEqual(['b2', 'f6', 'h8'])
  })

  it('does not call an unrelated blocked line a pin', () => {
    const tactics = detectTactics('7k/6p1/5n2/8/8/8/8/2B1K3 w - - 0 1', 'c1b2')
    expect(tactics.some((tactic) => tactic.kind === 'pin')).toBe(false)
  })

  it('distinguishes a relative pin to a queen from an absolute pin', () => {
    const tactics = detectTactics('3qk3/8/5n2/8/8/8/8/2B1K3 w - - 0 1', 'c1g5')
    const pin = tactics.find((tactic) => tactic.kind === 'pin')
    expect(pin?.squares).toEqual(['g5', 'f6', 'd8'])
    expect(pin?.title).toBe('A relative pin')
    expect(pin?.description).toContain('can legally move')
  })

  it('finds a king-queen skewer', () => {
    const tactics = detectTactics('4q3/3k4/8/8/2B5/8/8/7K w - - 0 1', 'c4b5')
    expect(tactics.find((tactic) => tactic.kind === 'skewer')?.squares).toEqual(['b5', 'd7', 'e8'])
  })

  it('finds an attack uncovered by moving a different piece', () => {
    const tactics = detectTactics('q6k/8/8/8/8/8/B7/R5K1 w - - 0 1', 'a2b3')
    expect(tactics.find((tactic) => tactic.kind === 'discovery')?.squares).toEqual(['b3', 'a1', 'a8'])
  })

  it('calls out undefended high-value targets without guaranteeing a capture', () => {
    const tactics = detectTactics('4k3/8/8/3q4/8/8/2N5/4K3 w - - 0 1', 'c2e3')
    const loose = tactics.find((tactic) => tactic.kind === 'loose-piece')
    expect(loose?.squares).toEqual(['e3', 'd5'])
    expect(loose?.description).toContain("forcing replies")
  })

  it('recognizes checkmate using legal board state', () => {
    const game = parseGame('1. f3 e5 2. g4 Qh4# 0-1')
    const final = game.moves[3]
    const tactics = detectTactics(final.before, final.uci)
    expect(tactics).toHaveLength(1)
    expect(tactics[0].kind).toBe('mate')
  })
})
