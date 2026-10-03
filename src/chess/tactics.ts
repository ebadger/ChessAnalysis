import { Chess, SQUARES } from 'chess.js'
import type { Color, PieceSymbol, Square } from 'chess.js'
import { opposite, PIECE_NAMES, PIECE_VALUES, playUci } from './game'
import type { EngineLine, Tactic } from './types'

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

function ray(square: Square, dx: number, dy: number): Square[] {
  const result: Square[] = []
  let x = square.charCodeAt(0) - 97 + dx
  let y = Number(square[1]) - 1 + dy
  while (x >= 0 && x < 8 && y >= 0 && y < 8) {
    result.push(`${String.fromCharCode(97 + x)}${y + 1}` as Square)
    x += dx
    y += dy
  }
  return result
}

function isSlider(type: PieceSymbol, diagonal: boolean): boolean {
  return type === 'q' || type === (diagonal ? 'b' : 'r')
}

function findPins(chess: Chess, attacker: Color): Tactic[] {
  const pins: Tactic[] = []
  for (const king of SQUARES) {
    if (chess.get(king)?.type !== 'k' || chess.get(king)?.color === attacker) continue
    for (const [dx, dy] of directions) {
      const occupied = ray(king, dx, dy).filter((square) => chess.get(square))
      if (occupied.length < 2) continue
      const [pinned, source] = occupied
      const front = chess.get(pinned)!
      const back = chess.get(source)!
      if (front.color !== attacker && back.color === attacker && isSlider(back.type, dx !== 0 && dy !== 0)) {
        pins.push({
          kind: 'pin',
          title: 'An absolute pin',
          description: `The ${PIECE_NAMES[back.type]} on ${source} pins the ${PIECE_NAMES[front.type]} on ${pinned} to the king on ${king}. That piece cannot move off the line and expose its king.`,
          squares: [source, pinned, king],
          arrows: [{ from: source, to: king, tone: 'gold' }],
        })
      }
    }
  }
  return pins
}

export function detectTactics(beforeFen: string, uci: string): Tactic[] {
  const before = new Chess(beforeFen)
  const after = new Chess(beforeFen)
  const move = playUci(after, uci)
  const enemy = opposite(move.color)
  const result: Tactic[] = []

  if (after.isCheckmate()) {
    return [{
      kind: 'mate',
      title: 'A mating net',
      description: `${move.san} leaves the king in check with no legal escape, capture, or block.`,
      squares: [move.to, ...SQUARES.filter((square) => after.get(square)?.type === 'k' && after.get(square)?.color === enemy)],
      arrows: [],
    }]
  }

  const targets = SQUARES.filter((square) => {
    const piece = after.get(square)
    return piece?.color === enemy &&
      (piece.type === 'k' || PIECE_VALUES[piece.type] >= 300) &&
      after.attackers(square, move.color).includes(move.to)
  })
  if (targets.length >= 2 && targets.some((square) => {
    const target = after.get(square)!
    return target.type === 'k' || PIECE_VALUES[target.type] >= PIECE_VALUES[move.promotion ?? move.piece]
  })) {
    result.push({
      kind: 'fork',
      title: 'A double attack',
      description: `The ${PIECE_NAMES[move.promotion ?? move.piece]} on ${move.to} attacks ${targets.map((square) => `the ${PIECE_NAMES[after.get(square)!.type]} on ${square}`).join(' and ')}. This is a fork pattern; follow the line to see whether the threats can be met.`,
      squares: [move.to, ...targets],
      arrows: targets.map((to) => ({ from: move.to, to, tone: 'gold' })),
    })
  }

  const oldPins = findPins(before, move.color)
  result.push(...findPins(after, move.color).filter((pin) =>
    pin.squares[0] === move.to || !oldPins.some((old) => old.squares.join() === pin.squares.join()),
  ))

  for (const source of SQUARES) {
    const piece = after.get(source)
    if (!piece || piece.color !== move.color || !['q', 'r', 'b'].includes(piece.type)) continue
    for (const [dx, dy] of directions) {
      if (!isSlider(piece.type, dx !== 0 && dy !== 0)) continue
      const occupied = ray(source, dx, dy).filter((square) => after.get(square))
      if (occupied.length < 2) continue
      const [front, back] = occupied
      const first = after.get(front)!
      const second = after.get(back)!
      if (first.color !== enemy || second.color !== enemy || second.type === 'k') continue
      const oldBlockers = ray(source, dx, dy).filter((square) => before.get(square)).slice(0, 2)
      if (source !== move.to && oldBlockers[0] === front && oldBlockers[1] === back) continue
      if (first.type !== 'k' && PIECE_VALUES[second.type] >= 500 &&
        PIECE_VALUES[second.type] - PIECE_VALUES[first.type] >= 150) {
        result.push({
          kind: 'pin',
          title: 'A relative pin',
          description: `The ${PIECE_NAMES[piece.type]} on ${source} pins the ${PIECE_NAMES[first.type]} on ${front} to the more valuable ${PIECE_NAMES[second.type]} on ${back}. It can legally move, but doing so may expose the piece behind it.`,
          squares: [source, front, back],
          arrows: [{ from: source, to: back, tone: 'gold' }],
        })
      }
      if (first.type === 'k' || PIECE_VALUES[first.type] > PIECE_VALUES[second.type]) {
        if (PIECE_VALUES[second.type] < 300) continue
        result.push({
          kind: 'skewer',
          title: 'Pressure in a straight line',
          description: `The ${PIECE_NAMES[piece.type]} on ${source} lines up the ${PIECE_NAMES[first.type]} on ${front} with the ${PIECE_NAMES[second.type]} on ${back}. Moving the front piece can expose the one behind: a skewer pattern.`,
          squares: [source, front, back],
          arrows: [{ from: source, to: back, tone: 'gold' }],
        })
      }
    }
  }

  for (const target of SQUARES) {
    const piece = after.get(target)
    if (!piece || piece.color !== enemy) continue
    const attackers = after.attackers(target, move.color)
    if (piece.type === 'k' || PIECE_VALUES[piece.type] >= 500) {
      const discovered = attackers.find((square) => {
        const attacker = after.get(square)
        return square !== move.to && attacker && ['b', 'r', 'q'].includes(attacker.type) &&
          before.get(square)?.type === attacker.type && !before.attackers(target, move.color).includes(square)
      })
      if (discovered) {
        result.push({
          kind: 'discovery',
          title: 'A discovered attack',
          description: `Moving to ${move.to} opens the ${PIECE_NAMES[after.get(discovered)!.type]}'s line from ${discovered} to the ${PIECE_NAMES[piece.type]} on ${target}. Moving one piece creates a threat with another.`,
          squares: [move.to, discovered, target],
          arrows: [{ from: discovered, to: target, tone: 'gold' }],
        })
      }
    }
    if (PIECE_VALUES[piece.type] >= 300 && attackers.includes(move.to) && after.attackers(target, enemy).length === 0) {
      result.push({
        kind: 'loose-piece',
        title: `An undefended ${PIECE_NAMES[piece.type]}`,
        description: `The ${PIECE_NAMES[piece.type]} on ${target} has no defenders and is attacked from ${move.to}. Watch for a capture, but first check the opponent's forcing replies.`,
        squares: [move.to, target],
        arrows: [{ from: move.to, to: target, tone: 'gold' }],
      })
    }
  }

  if (move.captured && PIECE_VALUES[move.captured] >= 300) {
    result.push({
      kind: 'capture',
      title: `A ${PIECE_NAMES[move.captured]} in reach`,
      description: `${move.san} captures a ${PIECE_NAMES[move.captured]} (about ${(PIECE_VALUES[move.captured] / 100).toFixed(0)} pawns). Follow the replies before deciding whether the exchange gains material.`,
      squares: [move.from, move.to],
      arrows: [{ from: move.from, to: move.to, tone: 'gold' }],
    })
  }
  if (!result.length && after.isCheck()) {
    result.push({
      kind: 'check',
      title: 'A forcing check',
      description: `${move.san} checks the king. Your opponent must deal with that threat before carrying out another plan.`,
      squares: [move.to],
      arrows: [],
    })
  }
  return result.slice(0, 4)
}

export function findLineTactics(fen: string, line: EngineLine, color: Color): Tactic[] {
  const chess = new Chess(fen)
  const motifs: (Tactic & { lineStep: number })[] = []
  const seen = new Set<string>()
  const priorities: Record<Tactic['kind'], number> = {
    mate: 0, fork: 1, pin: 2, skewer: 3, discovery: 4, 'loose-piece': 5, capture: 6, check: 7,
  }
  for (let index = 0; index < line.moves.length; index++) {
    const move = playUci(chess, line.moves[index])
    if (move.color !== color) continue
    for (const tactic of detectTactics(move.before, move.lan)) {
      const key = `${tactic.kind}:${tactic.squares.join(',')}`
      if (tactic.kind === 'check' || seen.has(key)) continue
      seen.add(key)
      motifs.push({
        ...tactic,
        lineStep: index + 1,
        description: index === 0 ? tactic.description : `Later in this engine line: ${tactic.description}`,
      })
    }
  }
  return motifs.sort((a, b) => priorities[a.kind] - priorities[b.kind] || a.lineStep - b.lineStep).slice(0, 4)
}
