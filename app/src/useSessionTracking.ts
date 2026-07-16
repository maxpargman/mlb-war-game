import { useEffect, useRef } from 'react'
import { startSession, updateSession, completeSession, type GameType } from './session'
import type { LineupSlot } from './types'

function totalWar(lineup: LineupSlot[]): number {
  return lineup.reduce((sum, s) => sum + (s.pick?.war ?? 0), 0)
}

// Fires session-tracking calls at the right points: create on the first
// pick, update on each subsequent pick, complete when the game finishes.
// Shared by DailyDraftScreen (a single lineup) and DraftScreen (two).
export function useSessionTracking(
  gameType: GameType,
  mode: string,
  date: string,
  lineups: LineupSlot[][],
  phase: 'draft' | 'done',
): void {
  const sessionIdRef = useRef<string | null>(null)
  const startingRef = useRef(false)
  const pickCount = lineups.reduce((n, l) => n + l.filter(s => s.pick !== null).length, 0)

  useEffect(() => {
    if (pickCount === 0) return

    const scores = lineups.map(totalWar)
    const score = gameType === 'hotseat' ? Math.max(...scores) : scores[0]
    const payload = { lineups, scores }

    if (!sessionIdRef.current) {
      // First pick starts the session; the create call itself already
      // carries this pick's lineup, so nothing is lost while it's in
      // flight. A pick landing before this resolves (unlikely for
      // human-paced play) would be skipped rather than queued -- fine for
      // fire-and-forget analytics, not worth a retry/queue mechanism.
      if (startingRef.current) return
      startingRef.current = true
      startSession(gameType, mode, date, payload).then(id => {
        sessionIdRef.current = id
        startingRef.current = false
      })
      return
    }

    if (phase === 'done') completeSession(sessionIdRef.current, payload, score)
    else updateSession(sessionIdRef.current, payload, score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickCount, phase])
}
