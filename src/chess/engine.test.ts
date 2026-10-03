import { describe, expect, it } from 'vitest'
import { completedEngineLines, parseEngineInfo } from './engine'

describe('Stockfish UCI parsing', () => {
  it('reads depth, MultiPV, and a legal-move-shaped principal variation', () => {
    const result = parseEngineInfo('info depth 14 seldepth 20 multipv 2 score cp 57 nodes 8025 pv e2e4 e7e5 g1f3', 'w')
    expect(result).toEqual({
      depth: 14, rank: 2, score: { cp: 57, mate: null }, moves: ['e2e4', 'e7e5', 'g1f3'],
    })
  })

  it('converts Black-relative scores and mates to White perspective', () => {
    expect(parseEngineInfo('info depth 9 score cp 82 pv e7e5', 'b')?.score).toEqual({ cp: -82, mate: null })
    expect(parseEngineInfo('info depth 9 score mate 3 pv e7e5', 'b')?.score).toEqual({ cp: -100000, mate: -3 })
    expect(parseEngineInfo('info depth 9 score mate -2 pv e7e5', 'b')?.score).toEqual({ cp: 100000, mate: 2 })
    expect(parseEngineInfo('info depth 9 score mate -2 pv e2e4', 'w')?.score).toEqual({ cp: -100000, mate: -2 })
  })

  it('retains UCI underpromotion suffixes', () => {
    expect(parseEngineInfo('info depth 4 score cp 100 pv a7a8n', 'w')?.moves).toEqual(['a7a8n'])
  })

  it.each([
    'info string NNUE evaluation using network',
    'info depth 4 score cp 20 lowerbound pv e2e4',
    'info depth 4 score cp 20 upperbound pv e2e4',
    'bestmove e2e4 ponder e7e5',
    'info depth 12 nodes 1',
  ])('ignores unscored and bound-only output', (message) => {
    expect(parseEngineInfo(message, 'w')).toBeNull()
  })

  it('never mixes candidate ranks from an interrupted MultiPV iteration', () => {
    const candidates = [
      'info depth 8 multipv 1 score cp 40 pv e2e4',
      'info depth 8 multipv 2 score cp 30 pv d2d4',
      'info depth 8 multipv 3 score cp 20 pv g1f3',
      'info depth 9 multipv 1 score cp 50 pv d2d4',
    ].map((message) => parseEngineInfo(message, 'w')!)
    const completed = completedEngineLines(candidates, 20)
    expect(completed).toHaveLength(3)
    expect(completed.every((line) => line.depth === 8)).toBe(true)
    expect(completed[0].moves).toEqual(['e2e4'])
  })

  it('accepts a completed iteration when fewer than three legal moves exist', () => {
    const line = parseEngineInfo('info depth 5 score cp 0 pv e1d1', 'w')!
    expect(completedEngineLines([line], 1)).toEqual([line])
    expect(completedEngineLines([line], 20)).toEqual([])
  })
})
