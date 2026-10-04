# Badger-Flores

A private, browser-only chess study companion. Paste a PGN, explore a visual board, and let a flower-wearing badger help you understand the moments that mattered.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. A real review of Morphy's Opera Game starts automatically. Choose **Play a bot** for a practice game; **Import a game** still accepts pasted Chess.com/Lichess PGN or a local `.pgn` file from either activity.

```sh
npm run build
npm run preview
```

Deploy the contents of `dist` to any static HTTP(S) host, including GitHub Pages. Asset URLs are relative, so repository subpaths work. There is no application server, API key, database, remote analysis service, or required cross-origin-isolation header. Opening `index.html` directly with `file://` is not supported because browsers restrict workers and WebAssembly loading there.

The install/build step copies the pinned Stockfish 17.1 **lite single-threaded** JavaScript, WebAssembly, and GPL license into `public/engine`, then into `dist/engine`. Those generated assets are intentionally not committed. Deploy **all** of `dist`, including `engine`. Serve `.wasm` as `application/wasm` for streaming compilation. The first visit downloads the engine from your own static host.

### Publish to GitHub Pages

Live site: **https://ebadger.github.io/ChessAnalysis/**

```sh
npm run deploy
```

This rebuilds the self-contained site and publishes only the generated files to the `gh-pages` branch, with a `.nojekyll` marker. It does not switch or overwrite your source branch. Git push access to this repository is required. The publishing dependency is development-only and is not part of the web app.

In the repository's **Settings > Pages**, the source is **Deploy from a branch**, branch **gh-pages**, folder **/ (root)**. The repository is public to support Pages on GitHub Free. GitHub may take a minute or two to publish an update. On a phone, open the live URL and wait for **Available offline** before disconnecting. Close existing site tabs and reopen after a deployment to allow a waiting offline-cache update to activate.

## Self-contained and offline

**Stockfish runs on the student's device.** Every runtime dependency, chess piece, icon, font choice, coach illustration, and engine asset is local or bundled. There are no analysis API calls, remote model calls, CDNs, telemetry endpoints, or third-party font requests. The production Content Security Policy restricts scripts, connections, workers, and other runtime resources to this app's origin.

The production build generates a versioned service worker that precaches the complete app, including Stockfish's JavaScript, WebAssembly, and license. Wait for **Available offline** before disconnecting. After that you can reload the page, import a completely new game, run fresh Quick or Deep analysis, explore lines, and export a study without an internet connection. Offline-save failures are visible and retryable.

The first load must obtain the files from the static host. For an entirely disconnected setup, copy the already-built `dist` directory to the device and serve it with any installed local static HTTP server. No npm or internet access is needed to **run that built copy**. Dependency installation is a build-time step only.

Offline storage requires HTTPS or localhost and service-worker support. The cache contains only app assets, never PGNs. Clearing browser site data or browser cache eviction removes the offline copy. A later connected visit can save it again. Browsers can check for updated service workers when connected; new versions activate after existing tabs close, so an active study is not replaced underneath the student. Caches are scoped to the deployment path so separate installs do not delete each other's data.

`npm run dev` does not install a service worker; use a production build with `npm run preview` to exercise offline mode. The default dev and preview ports are different to avoid a saved production worker intercepting development files. Optional reference/source links in the guide require the internet only if deliberately opened; the license itself is cached locally.

## The study experience

- An original animated Badger-Flores coach, honoring the family name with a badger, a daisy, a lilac scarf, and a little garden. The SVG artwork is created for this project; reduced-motion preferences are respected.
- Five leveled local bots, playable as White, Black, or a randomly assigned color. Phone-friendly tap-to-move controls show legal destinations, with explicit queen/rook/bishop/knight promotion choices. Take back a turn, resign, save the PGN, or send a completed/in-progress game straight to analysis.
- Legal PGN replay, custom starting FENs, Black-to-move starts, castling, promotion, en passant, mate, and drawn positions. Annotations and variations are accepted; the PGN's **main line** is reviewed.
- Real Stockfish analysis in a Web Worker. Quick review searches up to depth 12 / 400 ms per position; Deep review up to depth 18 / 1,400 ms per position. The first limit reached ends each search. Completed depth is shown; up to three candidates are retained.
- Familiar move labels: Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Blunder, and Miss.
- A clickable evaluation timeline, two estimated study-accuracy scores, a move journal, a classification breakdown, and previous/next critical-moment navigation.
- Separate alternate timelines for a better move **from the position before your move**, or for the opponent's response **from the position after it**. Step through either side with position-grounded explanations and a net-material-change readout, autoplay the line, or jump directly to a step without changing the original game.
- Visual callouts for forks, absolute and relative pins, skewers, discovered attacks, undefended pieces, captures, and mating patterns. Missed tactics are searched throughout the displayed best line; clicking one jumps to the exact position where it occurs.
- An annotated PGN download. Partial reviews export annotations only for completed moves.
- No PGN uploads, analytics, third-party fonts, game storage, or language-model calls. Game data is held in memory and is cleared on refresh. Only application assets are saved in the offline cache. Export a study to keep it.

### Phone-first game review

On phones, the review fits within the current screen instead of stacking a long article below the board. The board, evaluation bar, current move/line indicator, and navigation stay visible. **Coach**, **Moves**, and **Chart** tabs share a compact lower panel; only that panel scrolls. Suggested moves and tactical callouts therefore update a board you can still see.

Opening an alternative switches the Coach panel to its step-by-step explanation and labels the board **Alternative** or **Response** with the current step. The close button beside that label returns to the original game. Move history, critical-moment filtering, the evaluation timeline, player information, accuracy, export, hints, and the study guide remain available without leaving this layout.

The layout accounts for dynamic phone viewport height and safe-area insets. Rotating a phone moves the details beside the board; wider desktop windows retain the full three-column workspace. Bot play keeps its existing touch-friendly board and game controls.

### Controls

| Action | Control |
| --- | --- |
| Previous / next move or variation step | Left / right arrow |
| First / last position | Home / End |
| Next / previous critical moment | J / Shift+J |
| Flip the board | F |
| Return from an alternative to the game | Escape / Back to game |
| Review another game | Import a game |

Keyboard shortcuts are suspended while editing PGN or using a dialog. The move journal, timeline slider, alternatives, and board controls are keyboard accessible.

## Play a bot

The **Play a bot** tab offers five Stockfish-powered companions. These are relative practice levels, **not calibrated Elo ratings**. Both UCI `Skill Level` and the search budget change; moves are validated by chess.js before they reach the board.

| Companion | Practice level | Stockfish skill | Maximum depth | Search time cap |
| --- | --- | --- | --- | --- |
| Sprout | Beginner | 0 | 3 | 120 ms |
| Clover | Casual | 3 | 6 | 220 ms |
| Fern | Club | 8 | 10 | 400 ms |
| Iris | Advanced | 14 | 14 | 750 ms |
| Oak | Expert | 20 | 18 | 1,400 ms |

There is no chess clock. Tap a piece and then a highlighted destination; on a keyboard, focus the board, use arrow keys to navigate squares, and Enter/Space to select. Escape cancels a selection. Castling, en passant, all four promotions, checkmate, and draw detection use the same legal-move model as imported games. Practice games automatically finish on stalemate, insufficient material, threefold repetition, or the fifty-move rule.

**Take back** returns to the position before your last move, removing the bot's reply too if it has already played. It also cancels an in-flight bot response. When playing Black, the bot's opening move is preserved. Changing companion/color starts a new match only after pressing **Start game** in the new-game dialog.

**Analyze this game** (or **Analyze the game so far**) imports the generated PGN into the existing review experience. Review always uses full engine skill, independently of the bot setting. Switching activities preserves the current match and completed review work in memory, pauses background searches, and resumes unfinished work when appropriate. Manual review stops stay paused. Neither bot games nor imported games are uploaded or saved in browser storage; use **Save game PGN** before refreshing/closing the page. All bot levels also work offline after the app files have been cached.

## How the coaching works

Stockfish receives the initial FEN **plus the actual move history**, rather than unrelated FENs, so repetition context is preserved. Its centipawn and mate scores are normalized to White's perspective. Each move compares the best evaluation before it with the opponent's best evaluation afterward.

This is an **independent, educational approximation**, not Chess.com's proprietary classification or accuracy algorithm. It is not rating-aware. We use the expected-score curve `1 / (1 + exp(-0.00368208 * centipawns))` from the mover's perspective:

| Expected-score loss | Ordinary label |
| --- | --- |
| At most 0.02 | Excellent |
| At most 0.05 | Good |
| At most 0.10 | Inaccuracy |
| At most 0.20 | Mistake |
| Above 0.20 | Blunder |

The engine's first choice is Best. An exact curated opening-prefix match with less than 60 centipawns of loss is Book. Great requires the best candidate to exceed the next candidate by more than 0.12 expected score. Brilliant additionally requires a best-line, accepted non-pawn sacrifice of at least two pawns of net material, a near-best result, and a position not already clearly won. Miss recognizes a lost mating/material opportunity or a failure to exploit a previous substantial error. These special labels are deliberately conservative heuristics, not authoritative judgments.

Study accuracy is `round(100 * exp(-4 * mean(expected-score loss)))`, calculated separately for each color's analyzed moves. The evaluation bar and graph are visual advantage indicators, **not** win probabilities. A finite-depth result can change with deeper search, particularly in forced lines and sacrifices.

Coaching is generated from legal board state, material differences, and engine continuations. Tactical detectors identify **patterns**, not guaranteed wins: a pin, defense, or forcing counterattack can invalidate a tempting capture. Material gains refer only to the displayed line. The opening repertoire is intentionally small and exact-match-only; an unrecognized opening is not assumed to be bad.

The lite engine is smaller but weaker than full Stockfish. Searches are bounded, run one at a time in a worker, and can be stopped. Switching game/depth terminates the previous worker. Engine load failures and timeouts are visible and retryable; PGN navigation remains available.

## Development checks

```sh
npm test
npm run build
npm run test:browser
```

If Playwright reports a missing browser, run `npx playwright install chromium`, then retry. Browser tests serve the **production build under `/study/`** and exercise the real WebAssembly engine, PGN import/validation, alternate lines, keyboard controls, critical jumps, export, failure/retry, cancellation, every bot level, takebacks, color choice, bot-game-to-review transfer, and fresh offline play/analysis after a full reload. Phone review checks measure board/panel bounds at 320x568, 360x640, and 390x844, ensure scrolling explanations never scrolls the board away, and cover landscape/desktop transitions. Unit tests cover parsing, special moves and promotions, match outcomes, bot search settings and cancellation, score normalization, grading boundaries, and tactical patterns.

## Engine licensing and references

- [Stockfish.js v17.1.0 source and build scripts](https://github.com/nmrugg/stockfish.js/tree/v17.1.0) and its [exact source archive](https://github.com/nmrugg/stockfish.js/archive/refs/tags/v17.1.0.tar.gz).
- Stockfish.js is copyright Chess.com, LLC and the Stockfish contributors, distributed under **GNU GPL v3**. The unmodified engine's license is shipped at `engine/COPYING.txt`, and the in-app study guide links to its corresponding source. Keep these notices and source access when redistributing the engine.
- [Chess.com's public move-classification descriptions](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc) informed the familiar vocabulary. [Chessigma](https://www.chessigma.com/) is an additional product reference. This app is independent and not affiliated with either service.
- UI and coach artwork are original; no commercial service's artwork, commentary, or proprietary analysis algorithm is copied.
