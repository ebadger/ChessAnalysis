import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeMove } from '../chess/analysis'
import { StockfishClient } from '../chess/engine'
import type { AnalysisMode, AnalysisStatus, MoveAnalysis, ParsedGame, PositionAnalysis } from '../chess/types'

interface ReviewCache {
  game: ParsedGame
  mode: AnalysisMode
  results: MoveAnalysis[]
  positions: PositionAnalysis[]
  paused: boolean
}

export function useAnalysis(game: ParsedGame, mode: AnalysisMode, enabled = true) {
  const [status, setStatus] = useState<AnalysisStatus>('idle')
  const [analyses, setAnalyses] = useState<MoveAnalysis[]>([])
  const [positions, setPositions] = useState<PositionAnalysis[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reviewSource, setReviewSource] = useState({ game, mode })
  const engineRef = useRef<StockfishClient | null>(null)
  const generationRef = useRef(0)
  const cacheRef = useRef<ReviewCache | null>(null)

  const run = useCallback(async (reset: boolean) => {
    const generation = ++generationRef.current
    engineRef.current?.dispose()
    engineRef.current = null
    const previous = cacheRef.current
    const cache: ReviewCache = !reset && previous?.game === game && previous.mode === mode
      ? previous
      : { game, mode, results: [], positions: [], paused: false }
    cacheRef.current = cache
    setReviewSource({ game, mode })
    setAnalyses([...cache.results])
    setPositions([...cache.positions])
    if (cache.paused) { setStatus('stopped'); return }
    if (cache.results.length === game.moves.length) { setStatus('complete'); return }
    const engine = new StockfishClient()
    engineRef.current = engine
    setStatus('loading')
    setError(null)
    try {
      await engine.initialize()
      if (generation !== generationRef.current) return
      setStatus('analyzing')
      const results = cache.results
      const evaluated = cache.positions
      for (let index = evaluated.length; index < game.positions.length; index++) {
        const position = await engine.evaluate(game, index, mode)
        if (generation !== generationRef.current) return
        const result = index > 0 ? analyzeMove(game, index - 1, evaluated[index - 1], position, results[index - 2]) : null
        evaluated.push(position)
        setPositions([...evaluated])
        if (result) {
          results.push(result)
          setAnalyses([...results])
        }
      }
      setStatus('complete')
    } catch (cause) {
      if (generation !== generationRef.current) return
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    } finally {
      engine.dispose()
      if (engineRef.current === engine) engineRef.current = null
    }
  }, [game, mode])

  const stop = useCallback(() => {
    generationRef.current++
    engineRef.current?.dispose()
    engineRef.current = null
    setStatus('stopped')
    if (cacheRef.current) cacheRef.current.paused = true
  }, [])

  useEffect(() => {
    if (enabled) void run(false)
    return () => {
      generationRef.current++
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [run, enabled])

  const start = useCallback(() => run(true), [run])
  const current = reviewSource.game === game && reviewSource.mode === mode
  return {
    status: current ? status : 'loading',
    analyses: current ? analyses : [],
    positions: current ? positions : [],
    error: current ? error : null,
    start,
    stop,
  }
}
