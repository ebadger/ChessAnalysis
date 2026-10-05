import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appendMatchMove, BOT_LEVELS, createBotMatch, lastHumanMoveIndex, matchBoard, matchOutcome, matchPgn, takeBackMatch,
} from './bots'
import { parseGame } from './game'

afterEach(() => vi.restoreAllMocks())

describe('local bot practice games', () => {
  it('offers five distinct, increasing strength presets without invented Elo ratings', () => {
    expect(BOT_LEVELS).toHaveLength(5)
    expect(new Set(BOT_LEVELS.map((bot) => bot.skill)).size).toBe(5)
    expect(BOT_LEVELS[0].skill).toBe(0)
    expect(BOT_LEVELS[4].skill).toBe(20)
    for (let index = 1; index < BOT_LEVELS.length; index++) {
      expect(BOT_LEVELS[index].depth).toBeGreaterThan(BOT_LEVELS[index - 1].depth)
      expect(BOT_LEVELS[index].milliseconds).toBeGreaterThan(BOT_LEVELS[index - 1].milliseconds)
    }
  })

  it('starts as either color and resolves a random choice once per match', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(.99)
    const white = createBotMatch('sprout', 'random')
    const black = createBotMatch('oak', 'random')
    expect(white.humanColor).toBe('w')
    expect(black.humanColor).toBe('b')
    expect(black.id).not.toBe(white.id)
    expect(matchBoard(black).turn()).toBe('w')
    expect(lastHumanMoveIndex(black)).toBe(-1)
  })

  it('only accepts legal moves by the side whose turn it is', () => {
    const initial = createBotMatch('clover', 'w')
    expect(() => appendMatchMove(initial, 'e7e5', 'b')).toThrow("White's turn")
    expect(() => appendMatchMove(initial, 'e2e5', 'w')).toThrow()
    const after = appendMatchMove(initial, 'e2e4', 'w')
    expect(initial.moves).toEqual([])
    expect(after.moves).toEqual(['e2e4'])
    expect(matchBoard(after).turn()).toBe('b')
  })

  it('takes back a pending human move or the whole completed turn', () => {
    const initial = createBotMatch('fern', 'w')
    const pending = appendMatchMove(initial, 'e2e4', 'w')
    const replied = appendMatchMove(pending, 'e7e5', 'b')
    expect(takeBackMatch(pending).moves).toEqual([])
    expect(takeBackMatch(replied).moves).toEqual([])
    expect(() => takeBackMatch(initial)).toThrow('Play a move')
  })

  it('preserves the bot opening when taking back as Black', () => {
    let match = createBotMatch('iris', 'b')
    match = appendMatchMove(match, 'e2e4', 'w')
    expect(() => takeBackMatch(match)).toThrow()
    match = appendMatchMove(match, 'c7c5', 'b')
    match = appendMatchMove(match, 'g1f3', 'w')
    const undone = takeBackMatch(match)
    expect(undone.moves).toEqual(['e2e4'])
    expect(matchBoard(undone).turn()).toBe('b')
  })

  it('ends a checkmated game and exports a reviewable main line', () => {
    let match = createBotMatch('oak', 'w')
    for (const move of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) {
      match = appendMatchMove(match, move, matchBoard(match).turn())
    }
    expect(matchOutcome(match)).toEqual({ result: '0-1', reason: 'Black wins by checkmate.' })
    expect(() => appendMatchMove(match, 'a2a3', 'w')).toThrow('finished')
    const review = parseGame(matchPgn(match))
    expect(review.moves.map((move) => move.uci)).toEqual(match.moves)
    expect(review.headers).toMatchObject({ Event: 'Flores-Badger practice', White: 'You', Black: 'Oak (Expert)', Result: '0-1', BotSkill: '20' })
  })

  it('records resignation without adding a phantom move', () => {
    let match = createBotMatch('sprout', 'b')
    match = appendMatchMove(match, 'e2e4', 'w')
    match = { ...match, resigned: 'b' }
    const review = parseGame(matchPgn(match))
    expect(review.headers.Result).toBe('1-0')
    expect(review.headers.Termination).toBe('resignation')
    expect(review.moves).toHaveLength(1)
  })

  it('supports castling and en passant through the same move path', () => {
    let castling = { ...createBotMatch('clover', 'w'), initialFen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' }
    castling = appendMatchMove(castling, 'e1g1', 'w')
    castling = appendMatchMove(castling, 'e8c8', 'b')
    expect(matchBoard(castling).get('f1')?.type).toBe('r')
    expect(matchBoard(castling).get('d8')?.type).toBe('r')
    let enPassant = createBotMatch('clover', 'w')
    for (const uci of ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']) {
      enPassant = appendMatchMove(enPassant, uci, matchBoard(enPassant).turn())
    }
    expect(matchBoard(enPassant).get('d5')).toBeUndefined()
    expect(matchBoard(enPassant).get('d6')).toEqual({ type: 'p', color: 'w' })
  })

  it.each(['q', 'r', 'b', 'n'] as const)('preserves a chosen promotion to %s', (piece) => {
    const initial = { ...createBotMatch('clover', 'w'), initialFen: '7k/P7/8/8/8/8/8/7K w - - 0 1' }
    const match = appendMatchMove(initial, `a7a8${piece}`, 'w')
    expect(matchBoard(match).get('a8')).toEqual({ type: piece, color: 'w' })
    expect(parseGame(matchPgn(match)).moves[0].uci).toBe(`a7a8${piece}`)
  })

  it('automatically ends drawn practice positions, including repetition', () => {
    let match = createBotMatch('clover', 'w')
    for (const uci of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']) {
      match = appendMatchMove(match, uci, matchBoard(match).turn())
    }
    expect(matchOutcome(match).result).toBe('1/2-1/2')
    expect(matchOutcome(match).reason).toContain('threefold')
    const stale = { ...createBotMatch('clover', 'w'), initialFen: '7k/5K2/6Q1/8/8/8/8/8 b - - 0 1' }
    expect(matchOutcome(stale).reason).toContain('stalemate')
  })
})
