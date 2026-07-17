import { describe, it, expect, beforeAll } from 'vitest'
import { __setDbForTesting } from './data'
import { fixtureDb } from './testFixtures'
import { generateDailySchedule, generateSkipBackups, todayString } from './daily'

beforeAll(() => {
  __setDbForTesting(fixtureDb)
})

describe('todayString', () => {
  it('returns a YYYY-MM-DD date string', () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
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

describe('generateSkipBackups', () => {
  it('is deterministic: same date + mode + schedule always produces the same backups', () => {
    const schedule = generateDailySchedule('2026-07-14', 'medium')
    const a = generateSkipBackups('2026-07-14', 'medium', schedule)
    const b = generateSkipBackups('2026-07-14', 'medium', schedule)
    expect(a).toEqual(b)
  })

  it('never reuses a franchise already in the primary schedule (no-repeat rule)', () => {
    const schedule = generateDailySchedule('2026-07-14', 'medium')
    const scheduleFids = new Set(schedule.map(r => r.fid))
    const backups = generateSkipBackups('2026-07-14', 'medium', schedule)
    expect(backups.length).toBeGreaterThan(0)
    for (const b of backups) {
      expect(scheduleFids.has(b.fid)).toBe(false)
    }
  })

  it('draws only as many backups as the remaining franchise pool allows', () => {
    // Fixture has 12 franchises total; an 11-round schedule uses 11, leaving 1.
    const schedule = generateDailySchedule('2026-07-14', 'medium')
    const backups = generateSkipBackups('2026-07-14', 'medium', schedule)
    expect(backups.length).toBe(1)
  })

  it('backup fids are mutually distinct (drawn without replacement)', () => {
    const schedule = generateDailySchedule('2026-07-14', 'medium')
    const backups = generateSkipBackups('2026-07-14', 'medium', schedule)
    const fids = backups.map(b => b.fid)
    expect(new Set(fids).size).toBe(fids.length)
  })

  it('medium backups use 10-year windows, hard backups use 5-year windows', () => {
    const mediumSchedule = generateDailySchedule('2026-07-14', 'medium')
    const hardSchedule = generateDailySchedule('2026-07-14', 'hard')
    for (const b of generateSkipBackups('2026-07-14', 'medium', mediumSchedule)) {
      expect(b.yearHi - b.yearLo).toBe(10)
      expect(b.yearLo).toBeGreaterThanOrEqual(1970)
    }
    for (const b of generateSkipBackups('2026-07-14', 'hard', hardSchedule)) {
      expect(b.yearHi - b.yearLo).toBe(5)
      expect(b.yearLo).toBeGreaterThanOrEqual(1970)
    }
  })

  it('produces a different backup sequence for a different date', () => {
    const scheduleA = generateDailySchedule('2026-07-14', 'medium')
    const scheduleB = generateDailySchedule('2026-07-15', 'medium')
    const a = generateSkipBackups('2026-07-14', 'medium', scheduleA)
    const b = generateSkipBackups('2026-07-15', 'medium', scheduleB)
    expect(a).not.toEqual(b)
  })

  it('produces a different backup sequence per mode on the same date (mode offset)', () => {
    const mediumSchedule = generateDailySchedule('2026-07-14', 'medium')
    const hardSchedule = generateDailySchedule('2026-07-14', 'hard')
    const medium = generateSkipBackups('2026-07-14', 'medium', mediumSchedule)
    const hard = generateSkipBackups('2026-07-14', 'hard', hardSchedule)
    expect(medium).not.toEqual(hard)
  })
})
