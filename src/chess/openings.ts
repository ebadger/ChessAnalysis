import { Chess, DEFAULT_POSITION } from 'chess.js'

const openings = [
  { name: "King's Pawn Opening", san: 'e4' },
  { name: "Queen's Pawn Opening", san: 'd4' },
  { name: 'English Opening', san: 'c4' },
  { name: 'Reti Opening', san: 'Nf3' },
  { name: 'Open Game', san: 'e4 e5' },
  { name: 'Sicilian Defense', san: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3' },
  { name: 'French Defense', san: 'e4 e6 d4 d5 Nc3' },
  { name: 'Caro-Kann Defense', san: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4' },
  { name: 'Scandinavian Defense', san: 'e4 d5 exd5 Qxd5 Nc3' },
  { name: 'Philidor Defense', san: 'e4 e5 Nf3 d6 d4' },
  { name: 'Italian Game', san: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6' },
  { name: 'Two Knights Defense', san: 'e4 e5 Nf3 Nc6 Bc4 Nf6' },
  { name: 'Ruy Lopez', san: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7' },
  { name: 'Scotch Game', san: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4' },
  { name: 'Petrov Defense', san: 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4' },
  { name: "Queen's Gambit", san: 'd4 d5 c4' },
  { name: "Queen's Gambit Declined", san: 'd4 d5 c4 e6 Nc3 Nf6' },
  { name: 'Slav Defense', san: 'd4 d5 c4 c6 Nf3 Nf6' },
  { name: "King's Indian Defense", san: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6' },
  { name: 'Nimzo-Indian Defense', san: 'd4 Nf6 c4 e6 Nc3 Bb4' },
].map((opening) => {
  const chess = new Chess()
  const moves = opening.san.split(' ').map((san) => chess.move(san).lan)
  return { ...opening, moves }
})

const bookPositions = new Set(
  openings.flatMap((opening) => opening.moves.map((_, index) => opening.moves.slice(0, index + 1).join(' '))),
)

export function isBookMove(initialFen: string, moves: string[]): boolean {
  return initialFen === DEFAULT_POSITION && bookPositions.has(moves.join(' '))
}

export function identifyOpening(initialFen: string, moves: string[]): string | null {
  if (initialFen !== DEFAULT_POSITION) return null
  const matches = openings.filter((opening) => opening.moves.every((move, index) => moves[index] === move))
  return matches.sort((a, b) => b.moves.length - a.moves.length)[0]?.name ?? null
}
