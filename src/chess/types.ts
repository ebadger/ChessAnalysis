import type { Color, PieceSymbol, Square } from 'chess.js'

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss'

export interface Evaluation {
  /** Centipawns from White's perspective; mate is represented by +/- 100000. */
  cp: number
  mate: number | null
}

export interface GameMove {
  ply: number
  number: number
  color: Color
  san: string
  uci: string
  from: Square
  to: Square
  piece: PieceSymbol
  captured?: PieceSymbol
  before: string
  after: string
}

export interface GamePosition {
  fen: string
  terminal: Evaluation | null
  terminalReason: string | null
}

export interface ParsedGame {
  pgn: string
  headers: Record<string, string>
  moves: GameMove[]
  positions: GamePosition[]
  initialFen: string
  opening: string | null
}

export interface EngineLine {
  rank: number
  depth: number
  score: Evaluation
  moves: string[]
  sans: string[]
}

export interface PositionAnalysis {
  fen: string
  evaluation: Evaluation
  depth: number
  lines: EngineLine[]
  terminal: boolean
}

export interface BoardArrow {
  from: Square
  to: Square
  tone?: 'sage' | 'rose' | 'gold'
}

export interface PieceMotion {
  from: Square
  to: Square
  type: PieceSymbol
  color: Color
}

export interface BoardMotion {
  id: number
  duration: number
  pieces: PieceMotion[]
}

export type TacticKind = 'mate' | 'fork' | 'pin' | 'skewer' | 'discovery' | 'loose-piece' | 'capture' | 'check'

export interface Tactic {
  kind: TacticKind
  title: string
  description: string
  squares: Square[]
  arrows: BoardArrow[]
  lineStep?: number
}

export interface MoveAnalysis {
  move: GameMove
  classification: Classification
  cpLoss: number
  expectedLoss: number
  before: PositionAnalysis
  after: PositionAnalysis
  best: EngineLine | null
  tactics: Tactic[]
  missedTactics: Tactic[]
  critical: boolean
  heading: string
  explanation: string
  lesson: string
}

export interface Variation {
  baseFen: string
  label: string
  kind: 'alternative' | 'reply'
  line: EngineLine
  index: number
}

export type AnalysisMode = 'quick' | 'deep'
export type AnalysisStatus = 'idle' | 'loading' | 'analyzing' | 'complete' | 'stopped' | 'error'
