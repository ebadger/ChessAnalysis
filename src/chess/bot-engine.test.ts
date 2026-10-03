import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { StockfishClient } from './engine'
import { BOT_LEVELS } from './bots'

class FakeWorker {
  static commands: string[] = []
  static reply = 'e2e4'
  static stopped = false
  static holdSearch = false
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage(command: string) {
    FakeWorker.commands.push(command)
    const line = command === 'uci' ? 'uciok' : command === 'isready' ? 'readyok' : command.startsWith('go ') && !FakeWorker.holdSearch ? `bestmove ${FakeWorker.reply}` : null
    if (line) queueMicrotask(() => this.onmessage?.(new MessageEvent('message', { data: line })))
  }
  terminate() { FakeWorker.stopped = true }
}

beforeEach(() => {
  FakeWorker.commands = []
  FakeWorker.reply = 'e2e4'
  FakeWorker.stopped = false
  FakeWorker.holdSearch = false
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('document', { baseURI: 'http://localhost/' })
})
afterEach(() => vi.unstubAllGlobals())

describe('bot engine commands', () => {
  it.each(BOT_LEVELS)('uses $name strength and its bounded search budget', async (bot) => {
    const engine = new StockfishClient()
    await engine.initialize({ skillLevel: bot.skill, multiPv: 1 })
    expect(await engine.chooseMove(new Chess(), bot)).toBe('e2e4')
    expect(FakeWorker.commands).toContain(`setoption name Skill Level value ${bot.skill}`)
    expect(FakeWorker.commands).toContain('setoption name MultiPV value 1')
    expect(FakeWorker.commands).toContain(`go depth ${bot.depth} movetime ${bot.milliseconds}`)
    engine.dispose()
  })

  it('retains move history and validates the returned bot move', async () => {
    const chess = new Chess()
    chess.move('e4')
    FakeWorker.reply = 'e7e5'
    const engine = new StockfishClient()
    await engine.initialize()
    await engine.chooseMove(chess, BOT_LEVELS[0])
    expect(FakeWorker.commands.some((command) => command.startsWith('position fen ') && command.endsWith(' moves e2e4'))).toBe(true)
    FakeWorker.reply = 'e7e4'
    await expect(engine.chooseMove(chess, BOT_LEVELS[0])).rejects.toThrow()
    engine.dispose()
  })

  it('rejects an interrupted search instead of returning a stale move', async () => {
    const engine = new StockfishClient()
    await engine.initialize()
    FakeWorker.holdSearch = true
    const search = engine.chooseMove(new Chess(), BOT_LEVELS[0])
    engine.dispose()
    await expect(search).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeWorker.stopped).toBe(true)
  })

  it('keeps review at full strength regardless of the bot preset', async () => {
    const engine = new StockfishClient()
    await engine.initialize()
    expect(FakeWorker.commands).toContain('setoption name Skill Level value 20')
    expect(FakeWorker.commands).toContain('setoption name MultiPV value 3')
    engine.dispose()
  })
})
