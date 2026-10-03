import { Chess, DEFAULT_POSITION } from 'chess.js'
import type { Color } from 'chess.js'
import { colorName, opposite, playUci } from './game'

export const BOT_LEVELS = [
  { id: 'sprout', name: 'Sprout', label: 'Beginner', description: 'A gentle place to start.', skill: 0, depth: 3, milliseconds: 120 },
  { id: 'clover', name: 'Clover', label: 'Casual', description: 'A friendly little challenge.', skill: 3, depth: 6, milliseconds: 220 },
  { id: 'fern', name: 'Fern', label: 'Club', description: 'Make a plan. Watch the replies.', skill: 8, depth: 10, milliseconds: 400 },
  { id: 'iris', name: 'Iris', label: 'Advanced', description: 'Sharper tactics, stronger resistance.', skill: 14, depth: 14, milliseconds: 750 },
  { id: 'oak', name: 'Oak', label: 'Expert', description: 'A sturdy opponent to grow against.', skill: 20, depth: 18, milliseconds: 1400 },
] as const

export type BotLevelId = (typeof BOT_LEVELS)[number]['id']
export type ColorChoice = Color | 'random'
export type GameResult = '*' | '1-0' | '0-1' | '1/2-1/2'

export interface BotMatch {
  id: number
  levelId: BotLevelId
  humanColor: Color
  initialFen: string
  moves: string[]
  date: string
  resigned: Color | null
}

let nextMatchId = 0

export function getBotLevel(id: BotLevelId) {
  const level = BOT_LEVELS.find((candidate) => candidate.id === id)
  if (!level) throw new Error(`Unknown bot level: ${id}`)
  return level
}

export function createBotMatch(levelId: BotLevelId, color: ColorChoice): BotMatch {
  getBotLevel(levelId)
  return {
    id: ++nextMatchId,
    levelId,
    humanColor: color === 'random' ? (Math.random() < .5 ? 'w' : 'b') : color,
    initialFen: DEFAULT_POSITION,
    moves: [],
    date: new Date().toISOString().slice(0, 10).replaceAll('-', '.'),
    resigned: null,
  }
}

export function matchBoard(match: BotMatch): Chess {
  const chess = new Chess(match.initialFen)
  for (const uci of match.moves) playUci(chess, uci)
  return chess
}

export function matchOutcome(match: BotMatch, chess = matchBoard(match)): { result: GameResult; reason: string } {
  if (match.resigned) {
    return { result: match.resigned === 'w' ? '0-1' : '1-0', reason: `${colorName(opposite(match.resigned))} wins by resignation.` }
  }
  if (chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? '0-1' : '1-0', reason: `${colorName(opposite(chess.turn()))} wins by checkmate.` }
  }
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'Draw by stalemate.' }
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'Draw by insufficient material.' }
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'Draw by threefold repetition.' }
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', reason: 'Draw by the fifty-move rule.' }
  return { result: '*', reason: `${colorName(chess.turn())} to move.` }
}

export function appendMatchMove(match: BotMatch, uci: string, actor: Color): BotMatch {
  const chess = matchBoard(match)
  if (matchOutcome(match, chess).result !== '*') throw new Error('This game has finished. Start a new game or take back a move.')
  if (chess.turn() !== actor) throw new Error(`It is ${colorName(chess.turn())}'s turn.`)
  const move = playUci(chess, uci)
  return { ...match, moves: [...match.moves, move.lan] }
}

export function lastHumanMoveIndex(match: BotMatch): number {
  const history = matchBoard(match).history({ verbose: true })
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index].color === match.humanColor) return index
  }
  return -1
}

export function takeBackMatch(match: BotMatch): BotMatch {
  const index = lastHumanMoveIndex(match)
  if (index < 0) throw new Error('Play a move before taking one back.')
  return { ...match, moves: match.moves.slice(0, index), resigned: null }
}

export function matchPgn(match: BotMatch): string {
  const chess = matchBoard(match)
  const bot = getBotLevel(match.levelId)
  const opponent = `${bot.name} (${bot.label})`
  chess.setHeader('Event', 'Badger-Flores practice')
  chess.setHeader('Site', 'Local browser')
  chess.setHeader('Date', match.date)
  chess.setHeader('White', match.humanColor === 'w' ? 'You' : opponent)
  chess.setHeader('Black', match.humanColor === 'b' ? 'You' : opponent)
  chess.setHeader('Result', matchOutcome(match, chess).result)
  chess.setHeader('BotSkill', String(bot.skill))
  if (match.resigned) chess.setHeader('Termination', 'resignation')
  return chess.pgn({ maxWidth: 88 })
}
