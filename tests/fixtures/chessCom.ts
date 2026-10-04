export const archivesFixture = {
  archives: [
    'https://api.chess.com/pub/player/student/games/2020/01',
    'https://api.chess.com/pub/player/student/games/2026/10',
  ],
}

export function gameFixture(index = 0, rules = 'chess') {
  return {
    url: `https://www.chess.com/game/live/${1000 + index}`,
    pgn: `[Event "Chess.com practice"]\n[Site "Chess.com"]\n[White "Student"]\n[Black "Opponent${index}"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0`,
    white: { username: 'Student', rating: 1200, result: 'win' },
    black: { username: `Opponent${index}`, rating: 1250 + index, result: 'resigned' },
    end_time: Date.UTC(2026, 9, 3, 12, 0, index) / 1000,
    time_class: 'rapid',
    rules,
  }
}
