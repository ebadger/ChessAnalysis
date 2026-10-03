import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeMove } from '../chess/analysis'
import { StockfishClient } from '../chess/engine'
import type { AnalysisMode, AnalysisStatus, MoveAnalysis, ParsedGame, PositionAnalysis } from '../chess/types'

export function useAnalysis(game: ParsedGame, mode: AnalysisMode) {
  const [status, setStatus] = useState<AnalysisStatus>('idle')
  const [analyses, setAnalyses] = useState<MoveAnalysis[]>([])
  const [positions, setPositions] = useState<PositionAnalysis[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reviewSource, setReviewSource] = useState({ game, mode })
  const engineRef = useRef<StockfishClient | null>(null)
  const generationRef = useRef(0)

  const start = useCallback(async () => {
    const generation = ++generationRef.current
    engineRef.current?.dispose()
    const engine = new StockfishClient()
    engineRef.current = engine
    setReviewSource({ game, mode })
    setStatus('loading')
    setError(null)
    setAnalyses([])
    setPositions([])
    try {
      await engine.initialize()
      if (generation !== generationRef.current) return
      setStatus('analyzing')
      const results: MoveAnalysis[] = []
      const evaluated: PositionAnalysis[] = []
      for (let index = 0; index < game.positions.length; index++) {
        const position = await engine.evaluate(game, index, mode)
        if (generation !== generationRef.current) return
        evaluated.push(position)
        setPositions([...evaluated])
        if (index > 0) {
          results.push(analyzeMove(game, index - 1, evaluated[index - 1], position, results[index - 2]))
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
  }, [])

  useEffect(() => {
    void start()
    return () => {
      generationRef.current++
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [start])

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
