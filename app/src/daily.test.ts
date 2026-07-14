import { describe, it, expect, beforeAll } from 'vitest'
import { __setDbForTesting } from './data'
import { fixtureDb } from './testFixtures'
import { generateDailySchedule } from './daily'

beforeAll(() => {
  __setDbForTesting(fixtureDb)
})

describe('generateDailySchedule', () => {
  it('is deterministic: same date + mode always produces the same schedule', () => {
    const a = generateDailySchedule('2026-07-14', 'easy')
    const b = generateDailySchedule('2026-07-14', 'easy')
    expect(a).toEqual(b)
  })

  it('produces a different schedule for a different date', () => {
    const a = generateDailySchedule('2026-07-14', 'easy')
    const b = generateDailySchedule('2026-07-15', 'easy')
    expect(a).not.toEqual(b)
  })

  it('produces a different schedule per mode on the same date (mode offset)', () => {
    const easy = generateDailySchedule('2026-07-14', 'easy')
    const medium = generateDailySchedule('2026-07-14', 'medium')
    const hard = generateDailySchedule('2026-07-14', 'hard')
    expect(easy).not.toEqual(medium)
    expect(easy).not.toEqual(hard)
    expect(medium).not.toEqual(hard)
  })

  it('never repeats a franchise within one schedule', () => {
    const rounds = generateDailySchedule('2026-07-14', 'medium')
    const fids = rounds.map(r => r.fid)
    expect(new Set(fids).size).toBe(fids.length)
  })

  it('always returns 11 rounds', () => {
    for (const mode of ['easy', 'medium', 'hard'] as const) {
      expect(generateDailySchedule('2026-07-14', mode).length).toBe(11)
    }
  })

  it('easy mode spans the full dataset year range for every round', () => {
    const rounds = generateDailySchedule('2026-07-14', 'easy')
    for (const r of rounds) {
      expect(r.yearLo).toBe(1990)
      expect(r.yearHi).toBe(2012)
    }
  })

  it('medium mode uses post-1970, 10-year windows', () => {
    const rounds = generateDailySchedule('2026-07-14', 'medium')
    for (const r of rounds) {
      expect(r.yearHi - r.yearLo).toBe(10)
      expect(r.yearLo).toBeGreaterThanOrEqual(1970)
    }
  })

  it('hard mode uses post-1970, 5-year windows', () => {
    const rounds = generateDailySchedule('2026-07-14', 'hard')
    for (const r of rounds) {
      expect(r.yearHi - r.yearLo).toBe(5)
      expect(r.yearLo).toBeGreaterThanOrEqual(1970)
    }
  })
})
