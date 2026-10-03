import { describe, expect, it } from 'vitest'
import { Chess, DEFAULT_POSITION } from 'chess.js'
import {
  DEMO_PGN, FORK_PGN, formatEvaluation, materialBalance, moveLabel, parseGame, playUci, replayLine,
} from './game'
import { identifyOpening, isBookMove } from './openings'

describe('PGN import and replay', () => {
  it('replays the complete Opera Game and records its checkmate', () => {
    const game = parseGame(DEMO_PGN)
    expect(game.moves).toHaveLength(33)
    expect(game.positions).toHaveLength(34)
    expect(game.initialFen).toBe(DEFAULT_POSITION)
    expect(game.moves[17]).toMatchObject({ san: 'b5', ply: 18, color: 'b', number: 9 })
    expect(game.positions[33].terminal).toEqual({ cp: 100000, mate: 0 })
    expect(new Chess(game.positions[33].fen).isCheckmate()).toBe(true)
    expect(game.opening).toBe('Philidor Defense')
  })

  it('replays the fork example without inventing a result', () => {
    const game = parseGame(FORK_PGN)
    expect(game.moves.at(-1)?.san).toBe('Nf3#')
    expect(game.headers.Result).toBe('0-1')
    expect(game.positions.at(-1)?.terminal?.cp).toBe(-100000)
  })

  it('supports a FEN starting with Black, nonstandard move numbering, and castling', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/R3K3 b Q - 0 17"]\n\n17... Kf7 18. O-O-O *')
    expect(game.moves[0]).toMatchObject({ color: 'b', number: 17 })
    expect(moveLabel(game.moves[0])).toBe('17... Kf7')
    expect(game.moves[1].uci).toBe('e1c1')
    expect(new Chess(game.moves[1].after).get('d1')).toEqual({ type: 'r', color: 'w' })
    expect(game.opening).toBeNull()
  })

  it('preserves en passant and underpromotion', () => {
    const enPassant = parseGame('1. e4 a6 2. e5 d5 3. exd6 *')
    expect(enPassant.moves[4].uci).toBe('e5d6')
    expect(new Chess(enPassant.moves[4].after).get('d5')).toBeUndefined()
    const promotion = parseGame('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=N *')
    expect(promotion.moves[0].uci).toBe('a7a8n')
    expect(promotion.positions[1].terminalReason).toBe('Draw by insufficient material.')
  })

  it('accepts annotations and variations but analyzes only the main line', () => {
    const game = parseGame('1. e4 {A central pawn} e5 (1... c5 2. Nf3) 2. Nf3 $1 *')
    expect(game.moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3'])
  })

  it('keeps repetition history instead of treating each FEN as a fresh game', () => {
    const game = parseGame('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2')
    expect(game.positions.at(-1)?.terminalReason).toContain('Threefold repetition')
    expect(game.positions.at(-1)?.terminal).toEqual({ cp: 0, mate: null })
  })

  it.each([
    ['', 'Paste a PGN'],
    ['[Event "Empty"]', 'no moves'],
    ['1. e4 e5 2. Bh6', "couldn't read"],
    [`${DEMO_PGN}\n\n${DEMO_PGN}`, 'one game at a time'],
    ['[Variant "Chess960"]\n\n1. e4 *', 'standard chess'],
    ['x'.repeat(250001), 'too large'],
  ])('surfaces invalid input explicitly', (input, message) => {
    expect(() => parseGame(input)).toThrow(message)
  })

  it('replays UCI promotions and rejects illegal engine moves', () => {
    const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1'
    expect(replayLine(fen, ['a7a8q']).get('a8')?.type).toBe('q')
    expect(() => playUci(new Chess(), 'e2e9')).toThrow('Invalid engine move')
    expect(() => playUci(new Chess(), 'e2e5')).toThrow()
  })
})

describe('opening and score helpers', () => {
  it('marks only known exact opening prefixes as book', () => {
    expect(isBookMove(DEFAULT_POSITION, ['e2e4', 'e7e5'])).toBe(true)
    expect(isBookMove(DEFAULT_POSITION, ['e2e4', 'a7a6'])).toBe(false)
    expect(identifyOpening(DEFAULT_POSITION, ['e2e4', 'a7a6'])).toBe("King's Pawn Opening")
  })

  it('never labels a FEN game as book', () => {
    expect(isBookMove('4k3/8/8/8/8/8/8/4K3 w - - 0 1', ['e1e2'])).toBe(false)
  })

  it('formats all evaluations from White perspective, including checkmate', () => {
    expect(formatEvaluation({ cp: 140, mate: null })).toBe('+1.4')
    expect(formatEvaluation({ cp: -140, mate: null })).toBe('-1.4')
    expect(formatEvaluation({ cp: -100000, mate: -3 })).toBe('-M3')
    expect(formatEvaluation({ cp: -100000, mate: 0 })).toBe('-M0')
    expect(formatEvaluation(undefined)).toBe('--')
    expect(materialBalance(new Chess(), 'b')).toBe(0)
  })
})
