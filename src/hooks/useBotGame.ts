import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { StockfishClient } from '../chess/engine'
import {
  appendMatchMove, createBotMatch, getBotLevel, lastHumanMoveIndex, matchBoard, matchOutcome, takeBackMatch,
} from '../chess/bots'
import type { BotLevelId, BotMatch, ColorChoice } from '../chess/bots'
import { opposite } from '../chess/game'

export function useBotGame(active: boolean) {
  const [match, setMatch] = useState<BotMatch | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'thinking' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const clientRef = useRef<{ matchId: number; engine: StockfishClient } | null>(null)
  const generation = useRef(0)
  const chess = useMemo(() => match ? matchBoard(match) : new Chess(), [match])
  const outcome = match ? matchOutcome(match, chess) : null
  const finished = Boolean(outcome && outcome.result !== '*')
  const humanTurn = Boolean(match && !finished && chess.turn() === match.humanColor)
  const canTakeBack = match !== null && lastHumanMoveIndex(match) >= 0

  const releaseEngine = useCallback(() => {
    clientRef.current?.engine.dispose()
    clientRef.current = null
  }, [])

  useEffect(() => {
    const currentGeneration = ++generation.current
    if (!active || !match || finished) {
      releaseEngine()
      setStatus('idle')
      return
    }
    if (humanTurn) { setStatus('idle'); return }

    let completed = false
    const currentMatch = match
    const bot = getBotLevel(match.levelId)
    const started = performance.now()
    setError(null)
    async function play() {
      let client = clientRef.current
      if (!client || client.matchId !== currentMatch.id) {
        releaseEngine()
        client = { matchId: currentMatch.id, engine: new StockfishClient() }
        clientRef.current = client
        setStatus('loading')
        await client.engine.initialize({ skillLevel: bot.skill, multiPv: 1 })
      }
      if (currentGeneration !== generation.current) return
      setStatus('thinking')
      const uci = await client.engine.chooseMove(chess, bot)
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 350 - (performance.now() - started))))
      if (currentGeneration !== generation.current) return
      const next = appendMatchMove(currentMatch, uci, opposite(currentMatch.humanColor))
      completed = true
      setMatch((current) => current?.id === currentMatch.id && current.moves.length === currentMatch.moves.length && !current.resigned ? next : current)
      setStatus('idle')
    }
    void play().catch((cause: unknown) => {
      if (currentGeneration !== generation.current) return
      completed = true
      releaseEngine()
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    })
    return () => {
      generation.current++
      if (!completed) releaseEngine()
    }
  }, [active, match, chess, finished, humanTurn, attempt, releaseEngine])

  useEffect(() => () => { generation.current++; releaseEngine() }, [releaseEngine])

  const startGame = (level: BotLevelId, color: ColorChoice) => {
    generation.current++
    releaseEngine()
    setError(null)
    setStatus('idle')
    setMatch(createBotMatch(level, color))
  }
  const playMove = (uci: string) => {
    if (!active || !match || !humanTurn) throw new Error('Wait for your turn before making a move.')
    setMatch(appendMatchMove(match, uci, match.humanColor))
    setError(null)
  }
  const takeBack = () => {
    if (!match) throw new Error('Start a game before taking back a move.')
    const previous = takeBackMatch(match)
    generation.current++
    releaseEngine()
    setMatch(previous)
    setError(null)
    setStatus('idle')
  }
  const resign = () => {
    if (!match || finished) throw new Error('There is no active game to resign.')
    generation.current++
    releaseEngine()
    setMatch({ ...match, resigned: match.humanColor })
    setError(null)
    setStatus('idle')
  }
  const retry = () => {
    generation.current++
    releaseEngine()
    setAttempt((value) => value + 1)
  }

  return { match, chess, outcome, finished, humanTurn, canTakeBack, status, error, startGame, playMove, takeBack, resign, retry }
}

export type BotGameController = ReturnType<typeof useBotGame>
