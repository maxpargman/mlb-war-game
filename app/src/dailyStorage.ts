// Slice 5.2: per (date, difficulty) persistence for the daily challenge --
// lock-on-start with resume. Storing the full GameState (not just picks)
// matters because roundFranchises can be mutated by DailyDraftScreen's
// dead-end reroll (plain Math.random(), not the seeded schedule), so a
// resumed game must see the exact franchises/ranges it already resolved to,
// not re-derive them.

import type { GameState } from './types'
import type { DailyMode } from './daily'

const STORAGE_PREFIX = 'mlbwar_daily_'

// GameState.takenPlayerIds is a Set, which JSON.stringify silently drops.
type StoredGameState = Omit<GameState, 'takenPlayerIds'> & { takenPlayerIds: string[] }

function storageKey(date: string, mode: DailyMode): string {
  return `${STORAGE_PREFIX}${date}_${mode}`
}

export function loadDailyState(date: string, mode: DailyMode): GameState | null {
  const raw = localStorage.getItem(storageKey(date, mode))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredGameState
    return { ...parsed, takenPlayerIds: new Set(parsed.takenPlayerIds) }
  } catch {
    return null
  }
}

export function saveDailyState(date: string, mode: DailyMode, state: GameState): void {
  const stored: StoredGameState = { ...state, takenPlayerIds: [...state.takenPlayerIds] }
  localStorage.setItem(storageKey(date, mode), JSON.stringify(stored))
}

export type DailyStatus =
  | { kind: 'new' }
  | { kind: 'in_progress' }
  | { kind: 'done'; score: number }

export function getDailyStatus(date: string, mode: DailyMode): DailyStatus {
  const state = loadDailyState(date, mode)
  if (!state) return { kind: 'new' }
  if (state.phase === 'done') {
    const score = state.lineups[0].reduce((sum, s) => sum + (s.pick?.war ?? 0), 0)
    return { kind: 'done', score }
  }
  return { kind: 'in_progress' }
}
