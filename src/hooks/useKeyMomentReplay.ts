import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { moveLabel } from '../chess/game'
import { fastReplayInterval } from '../chess/navigation'
import type { ParsedGame } from '../chess/types'

interface Journey {
  game: ParsedGame
  startPly: number
  targetPly: number
}

interface ReplayFrame {
  game: ParsedGame
  id: number
  fromPly: number
  toPly: number
  duration: number
}

export function useKeyMomentReplay(game: ParsedGame, selectedPly: number, onSelect: (ply: number) => void, enabled: boolean) {
  const [journey, setJourney] = useState<Journey | null>(null)
  const [transition, setTransition] = useState<ReplayFrame | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const currentPly = useRef(selectedPly)
  const active = useRef<Journey | null>(null)
  const frame = useRef<number | null>(null)
  const generation = useRef(0)
  const motionId = useRef(0)

  useLayoutEffect(() => { currentPly.current = selectedPly }, [selectedPly])

  const clearFrame = useCallback(() => {
    generation.current++
    if (frame.current !== null) window.cancelAnimationFrame(frame.current)
    frame.current = null
    active.current = null
  }, [])

  const cancel = useCallback((announce = false) => {
    const wasRunning = active.current !== null
    clearFrame()
    setJourney(null)
    setTransition(null)
    setAnnouncement(announce && wasRunning ? 'Fast replay stopped at the current position.' : '')
  }, [clearFrame])

  const finish = useCallback(() => {
    const destination = active.current
    if (!destination) return
    clearFrame()
    currentPly.current = destination.targetPly
    onSelect(destination.targetPly)
    setJourney(null)
    setTransition(null)
    setAnnouncement(`Arrived at ${destination.targetPly === 0 ? 'the starting position' : moveLabel(destination.game.moves[destination.targetPly - 1])}.`)
  }, [clearFrame, onSelect])

  useLayoutEffect(() => {
    cancel()
    return clearFrame
  }, [game, enabled, cancel, clearFrame])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { if (media.matches) finish() }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [finish])

  const go = useCallback((targetPly: number) => {
    cancel()
    if (!enabled) return
    if (!Number.isInteger(targetPly) || targetPly < 0 || targetPly > game.moves.length) {
      throw new Error('The requested key moment is outside this game.')
    }
    const startPly = currentPly.current
    const label = targetPly ? moveLabel(game.moves[targetPly - 1]) : 'the starting position'
    if (startPly === targetPly || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      currentPly.current = targetPly
      onSelect(targetPly)
      setAnnouncement(`Arrived at ${label}.`)
      return
    }
    const destination: Journey = { game, startPly, targetPly }
    const direction = Math.sign(targetPly - startPly)
    const interval = fastReplayInterval(Math.abs(targetPly - startPly))
    const duration = Math.round(interval * .8)
    const ticket = generation.current
    let lastStep = performance.now()
    let settlingUntil: number | null = null
    active.current = destination
    setJourney(destination)
    setAnnouncement(`Replaying ${direction > 0 ? 'forward' : 'backward'} to ${label}.`)

    const tick = (now: number) => {
      if (ticket !== generation.current || active.current !== destination) return
      if (settlingUntil !== null) {
        if (now >= settlingUntil) { finish(); return }
      } else if (now - lastStep >= interval) {
        const fromPly = currentPly.current
        const toPly = fromPly + direction
        currentPly.current = toPly
        setTransition({ game, id: ++motionId.current, fromPly, toPly, duration })
        onSelect(toPly)
        lastStep = now
        if (toPly === targetPly) settlingUntil = now + duration
      }
      // Advance at most one position per frame; a slow device must not skip intervening moves.
      frame.current = window.requestAnimationFrame(tick)
    }
    frame.current = window.requestAnimationFrame(tick)
  }, [cancel, enabled, game, onSelect, finish])

  return { journey, transition, announcement, go, cancel, finish }
}
