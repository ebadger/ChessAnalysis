import { Chess } from 'chess.js'
import type { Color } from 'chess.js'
import { playUci } from './game'
import type { AnalysisMode, EngineLine, ParsedGame, PositionAnalysis } from './types'

export const SEARCH_LIMITS = {
  quick: { depth: 12, milliseconds: 400 },
  deep: { depth: 18, milliseconds: 1400 },
} satisfies Record<AnalysisMode, { depth: number; milliseconds: number }>

export function parseEngineInfo(message: string, turn: Color): Omit<EngineLine, 'sans'> | null {
  if (!message.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(message)) return null
  const depth = message.match(/\bdepth (\d+)/)
  const score = message.match(/\bscore (cp|mate) (-?\d+)/)
  const pv = message.match(/\bpv ((?:[a-h][1-8][a-h][1-8][qrbn]?(?:\s|$))+)/)
  if (!depth || !score || !pv) return null
  const direction = turn === 'w' ? 1 : -1
  const value = Number(score[2])
  const mate = score[1] === 'mate' ? value * direction : null
  return {
    depth: Number(depth[1]),
    rank: Number(message.match(/\bmultipv (\d+)/)?.[1] ?? 1),
    score: {
      cp: score[1] === 'mate' ? (value > 0 ? 100000 : -100000) * direction : value * direction,
      mate,
    },
    moves: pv[1].trim().split(/\s+/).slice(0, 14),
  }
}

export function completedEngineLines(candidates: Omit<EngineLine, 'sans'>[], legalMoveCount: number): Omit<EngineLine, 'sans'>[] {
  const iterations = new Map<number, Map<number, Omit<EngineLine, 'sans'>>>()
  for (const candidate of candidates) {
    let iteration = iterations.get(candidate.depth)
    if (!iteration) {
      iteration = new Map()
      iterations.set(candidate.depth, iteration)
    }
    iteration.set(candidate.rank, candidate)
  }
  const required = Math.min(3, legalMoveCount)
  for (const depth of [...iterations.keys()].sort((a, b) => b - a)) {
    const iteration = iterations.get(depth)!
    const lines = [...iteration.values()].sort((a, b) => a.rank - b.rank)
    if (lines.length === required &&
      lines.every((line, index) => line.rank === index + 1) &&
      new Set(lines.map((line) => line.moves[0])).size === required) return lines
  }
  return []
}

export class StockfishClient {
  private worker: Worker | null = null
  private receive: ((line: string) => void) | null = null
  private rejectPending: ((reason: Error) => void) | null = null
  private disposed = false

  async initialize({ skillLevel = 20, multiPv = 3 }: { skillLevel?: number; multiPv?: 1 | 3 } = {}): Promise<void> {
    if (!Number.isInteger(skillLevel) || skillLevel < 0 || skillLevel > 20) {
      throw new Error('The bot skill level must be an integer from 0 to 20.')
    }
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      throw new Error('Local analysis needs WebAssembly and Web Workers. Please use a current version of Chrome, Edge, Firefox, or Safari.')
    }
    const url = new URL(`${import.meta.env.BASE_URL}engine/stockfish-17.1-lite-single-03e3232.js`, document.baseURI)
    this.worker = new Worker(url)
    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') return
      for (const line of event.data.split('\n')) this.receive?.(line.trim())
    }
    this.worker.onerror = (event) => {
      event.preventDefault()
      this.rejectPending?.(new Error(`The local chess engine could not start or stopped unexpectedly. ${event.message || 'Check that the engine files were deployed, and retry.'}`))
    }
    await this.exchange(['uci'], (line) => line === 'uciok', 30000)
    await this.exchange([
      'setoption name Threads value 1',
      'setoption name Hash value 32',
      `setoption name MultiPV value ${multiPv}`,
      `setoption name Skill Level value ${skillLevel}`,
      'setoption name UCI_LimitStrength value false',
      'ucinewgame',
      'isready',
    ], (line) => line === 'readyok', 10000)
  }

  private exchange(commands: string[], finished: (line: string) => boolean, timeout: number, onLine?: (line: string) => void): Promise<void> {
    if (this.disposed || !this.worker) return Promise.reject(new DOMException('Analysis stopped.', 'AbortError'))
    if (this.receive) return Promise.reject(new Error('A chess engine search is already running.'))
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        this.receive = null
        this.rejectPending = null
      }
      const timer = setTimeout(() => {
        cleanup()
        this.worker?.terminate()
        this.disposed = true
        reject(new Error('The local engine took too long to respond. Retry with a shorter review or a gentler bot, using a browser with WebAssembly enabled.'))
      }, timeout)
      this.rejectPending = (error) => {
        cleanup()
        reject(error)
      }
      this.receive = (line) => {
        onLine?.(line)
        if (finished(line)) {
          cleanup()
          resolve()
        }
      }
      for (const command of commands) this.worker!.postMessage(command)
    })
  }

  async evaluate(game: ParsedGame, positionIndex: number, mode: AnalysisMode): Promise<PositionAnalysis> {
    const position = game.positions[positionIndex]
    if (position.terminal) {
      return { fen: position.fen, evaluation: position.terminal, depth: 0, lines: [], terminal: true }
    }
    const board = new Chess(position.fen)
    const turn = board.turn()
    const candidates: Omit<EngineLine, 'sans'>[] = []
    const playedMoves = game.moves.slice(0, positionIndex).map((move) => move.uci).join(' ')
    const limit = SEARCH_LIMITS[mode]
    await this.exchange([
      `position fen ${game.initialFen}${playedMoves ? ` moves ${playedMoves}` : ''}`,
      `go depth ${limit.depth} movetime ${limit.milliseconds}`,
    ], (line) => line.startsWith('bestmove '), limit.milliseconds + 15000, (message) => {
      const info = parseEngineInfo(message, turn)
      if (info) candidates.push(info)
    })
    const lines = completedEngineLines(candidates, board.moves().length).map((candidate) => {
      const chess = new Chess(position.fen)
      return { ...candidate, sans: candidate.moves.map((move) => playUci(chess, move).san) }
    })
    if (!lines[0] || lines[0].rank !== 1) {
      throw new Error('Stockfish returned no usable continuation for this position. Please retry the analysis.')
    }
    return { fen: position.fen, evaluation: lines[0].score, depth: lines[0].depth, lines, terminal: false }
  }

  async chooseMove(chess: Chess, limits: { depth: number; milliseconds: number }): Promise<string> {
    if (chess.isGameOver()) throw new Error('The bot cannot move after the game has ended.')
    const history = chess.history({ verbose: true })
    const initialFen = history[0]?.before ?? chess.fen()
    const playedMoves = history.map((move) => move.lan).join(' ')
    let bestMove: string | undefined
    await this.exchange([
      `position fen ${initialFen}${playedMoves ? ` moves ${playedMoves}` : ''}`,
      `go depth ${limits.depth} movetime ${limits.milliseconds}`,
    ], (line) => line.startsWith('bestmove '), limits.milliseconds + 15000, (message) => {
      if (message.startsWith('bestmove ')) bestMove = message.split(/\s+/)[1]
    })
    if (!bestMove || bestMove === '(none)' || bestMove === '0000') {
      throw new Error('The bot did not return a move. Retry the bot to continue your game.')
    }
    return playUci(new Chess(chess.fen()), bestMove).lan
  }

  dispose(): void {
    this.disposed = true
    this.rejectPending?.(new DOMException('Analysis stopped.', 'AbortError'))
    this.worker?.terminate()
    this.worker = null
  }
}
