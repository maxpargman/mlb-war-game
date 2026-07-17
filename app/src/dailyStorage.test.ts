import { describe, it, expect, beforeEach } from 'vitest'
import { loadDailyState, saveDailyState, getDailyStatus } from './dailyStorage'
import { emptyLineup } from './types'
import type { GameState } from './types'

// The test environment is plain Node (see vite.config.ts), which has no
// localStorage global -- a minimal in-memory stand-in is enough here since
// dailyStorage.ts only calls getItem/setItem.
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null { return this.store.get(key) ?? null }
  setItem(key: string, value: string): void { this.store.set(key, value) }
  removeItem(key: string): void { this.store.delete(key) }
  clear(): void { this.store.clear() }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage
})

function makeState(phase: 'draft' | 'done', takenIds: string[] = []): GameState {
  const lineup = emptyLineup()
  if (phase === 'done') {
    lineup[0] = { pos: 'C', pick: { playerId: 'p01', name: 'Player One', pos: 'C', war: 3.5, year: 2000, fid: 'F01', fn: 'Team 01' } }
  }
  return {
    settings: { mode: 'all', yearLo: 0, yearHi: 9999 },
    roundRanges: Array.from({ length: 11 }, () => ({ yearLo: 1990, yearHi: 2020 })),
    roundFranchises: Array.from({ length: 11 }, (_, i) => ({ fid: `F${i}`, fn: `Team ${i}` })),
    lineups: [lineup, emptyLineup()],
    takenPlayerIds: new Set(takenIds),
    round: phase === 'done' ? 11 : 3,
    turn: 0,
    phase,
  }
}

describe('dailyStorage', () => {
  it('returns null when nothing is stored', () => {
    expect(loadDailyState('2026-07-17', 'easy')).toBeNull()
  })

  it('round-trips a GameState, including takenPlayerIds as a real Set', () => {
    const state = makeState('draft', ['p01', 'p02'])
    saveDailyState('2026-07-17', 'easy', state)
    const loaded = loadDailyState('2026-07-17', 'easy')
    expect(loaded).not.toBeNull()
    expect(loaded!.takenPlayerIds).toBeInstanceOf(Set)
    expect([...loaded!.takenPlayerIds]).toEqual(['p01', 'p02'])
    expect(loaded!.round).toBe(3)
    expect(loaded!.phase).toBe('draft')
  })

  it('keeps separate storage per (date, mode) key', () => {
    saveDailyState('2026-07-17', 'easy', makeState('draft', ['a']))
    saveDailyState('2026-07-17', 'hard', makeState('draft', ['b']))
    saveDailyState('2026-07-16', 'easy', makeState('draft', ['c']))

    expect([...loadDailyState('2026-07-17', 'easy')!.takenPlayerIds]).toEqual(['a'])
    expect([...loadDailyState('2026-07-17', 'hard')!.takenPlayerIds]).toEqual(['b'])
    expect([...loadDailyState('2026-07-16', 'easy')!.takenPlayerIds]).toEqual(['c'])
  })

  it('returns null instead of throwing on malformed stored JSON', () => {
    localStorage.setItem('mlbwar_daily_2026-07-17_easy', '{not json')
    expect(loadDailyState('2026-07-17', 'easy')).toBeNull()
  })

  describe('getDailyStatus', () => {
    it('is "new" when nothing is stored', () => {
      expect(getDailyStatus('2026-07-17', 'easy')).toEqual({ kind: 'new' })
    })

    it('is "in_progress" for a stored draft-phase state', () => {
      saveDailyState('2026-07-17', 'medium', makeState('draft'))
      expect(getDailyStatus('2026-07-17', 'medium')).toEqual({ kind: 'in_progress' })
    })

    it('is "done" with the summed score for a stored done-phase state', () => {
      saveDailyState('2026-07-17', 'hard', makeState('done'))
      expect(getDailyStatus('2026-07-17', 'hard')).toEqual({ kind: 'done', score: 3.5 })
    })
  })
})
