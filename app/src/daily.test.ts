import { describe, it, expect, beforeAll } from 'vitest'
import { __setDbForTesting, franchiseYearBoundsMap } from './data'
import { fixtureDb } from './testFixtures'
import { generateDailySchedule, generateSkipBackups, generateRerollPool, todayString } from './daily'

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

  it('medium mode uses post-1970, at-most-10-year windows, clamped to each franchise\'s real active span', () => {
    const bounds = franchiseYearBoundsMap()
    const rounds = generateDailySchedule('2026-07-14', 'medium')
    for (const r of rounds) {
      const f = bounds.get(r.fid)!
      expect(r.yearHi - r.yearLo).toBeLessThanOrEqual(10)
      expect(r.yearLo).toBeGreaterThanOrEqual(Math.max(1970, f.min))
      expect(r.yearHi).toBeLessThanOrEqual(f.max)
    }
  })

  it('hard mode uses post-1970, at-most-5-year windows, clamped to each franchise\'s real active span', () => {
    const bounds = franchiseYearBoundsMap()
    const rounds = generateDailySchedule('2026-07-14', 'hard')
    for (const r of rounds) {
      const f = bounds.get(r.fid)!
      expect(r.yearHi - r.yearLo).toBeLessThanOrEqual(5)
      expect(r.yearLo).toBeGreaterThanOrEqual(Math.max(1970, f.min))
      expect(r.yearHi).toBeLessThanOrEqual(f.max)
    }
  })

  it('bugfix: never draws a window predating a franchise\'s founding (the actual reported bug)', () => {
    // F02 only exists 2010-2012 in the fixture -- shorter than a 10-year
    // medium window, so whenever it's drawn, the window must clamp to
    // exactly its real span instead of reaching back to (or before) 1970.
    let foundF02 = false
    for (let day = 1; day <= 60 && !foundF02; day++) {
      const date = `2026-${String(Math.ceil(day / 28)).padStart(2, '0')}-${String(((day - 1) % 28) + 1).padStart(2, '0')}`
      const rounds = generateDailySchedule(date, 'medium')
      const round = rounds.find(r => r.fid === 'F02')
      if (!round) continue
      foundF02 = true
      expect(round.yearLo).toBe(2010)
      expect(round.yearHi).toBe(2012)
    }
    expect(foundF02).toBe(true) // sanity-check the search actually found a case
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

  it('medium backups use at-most-10-year windows, hard backups at-most-5, clamped per franchise', () => {
    const bounds = franchiseYearBoundsMap()
    const mediumSchedule = generateDailySchedule('2026-07-14', 'medium')
    const hardSchedule = generateDailySchedule('2026-07-14', 'hard')
    for (const b of generateSkipBackups('2026-07-14', 'medium', mediumSchedule)) {
      const f = bounds.get(b.fid)!
      expect(b.yearHi - b.yearLo).toBeLessThanOrEqual(10)
      expect(b.yearLo).toBeGreaterThanOrEqual(Math.max(1970, f.min))
    }
    for (const b of generateSkipBackups('2026-07-14', 'hard', hardSchedule)) {
      const f = bounds.get(b.fid)!
      expect(b.yearHi - b.yearLo).toBeLessThanOrEqual(5)
      expect(b.yearLo).toBeGreaterThanOrEqual(Math.max(1970, f.min))
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

describe('generateRerollPool', () => {
  it('is deterministic: same inputs always produce the same pool', () => {
    const schedule = generateDailySchedule('2026-07-14', 'medium')
    const backups = generateSkipBackups('2026-07-14', 'medium', schedule)
    const a = generateRerollPool('2026-07-14', 'medium', schedule, backups)
    const b = generateRerollPool('2026-07-14', 'medium', schedule, backups)
    expect(a).toEqual(b)
  })

  it('never reuses a franchise already in the primary schedule', () => {
    const schedule = generateDailySchedule('2026-07-14', 'medium')
    const backups = generateSkipBackups('2026-07-14', 'medium', schedule)
    const scheduleFids = new Set(schedule.map(r => r.fid))
    for (const r of generateRerollPool('2026-07-14', 'medium', schedule, backups)) {
      expect(scheduleFids.has(r.fid)).toBe(false)
    }
  })

  it('never reuses a franchise already claimed by the skip backups (the actual bug: skip and reroll must not collide)', () => {
    // Fixture has 12 franchises total: 11 in the schedule, leaving exactly 1
    // for skip backups -- so if the reroll pool excluded only the schedule
    // (not the skip backups too), it would incorrectly include that last
    // franchise. With both excluded, nothing is left.
    const schedule = generateDailySchedule('2026-07-14', 'medium')
    const backups = generateSkipBackups('2026-07-14', 'medium', schedule)
    expect(backups.length).toBe(1) // sanity-check the premise above
    const rerollPool = generateRerollPool('2026-07-14', 'medium', schedule, backups)
    expect(rerollPool).toEqual([])
  })

  it('is non-empty when nothing needs to be excluded beyond the schedule (e.g. no skip backups)', () => {
    const schedule = generateDailySchedule('2026-07-14', 'medium')
    const rerollPool = generateRerollPool('2026-07-14', 'medium', schedule, [])
    expect(rerollPool.length).toBe(1) // the one fixture franchise left over
  })

  it('pool entries are mutually distinct (drawn without replacement)', () => {
    const schedule = generateDailySchedule('2026-07-14', 'medium')
    const rerollPool = generateRerollPool('2026-07-14', 'medium', schedule, [])
    const fids = rerollPool.map(r => r.fid)
    expect(new Set(fids).size).toBe(fids.length)
  })

  it('medium pool entries use at-most-10-year windows, hard pool entries at-most-5, clamped per franchise', () => {
    const bounds = franchiseYearBoundsMap()
    const mediumSchedule = generateDailySchedule('2026-07-14', 'medium')
    const hardSchedule = generateDailySchedule('2026-07-14', 'hard')
    for (const r of generateRerollPool('2026-07-14', 'medium', mediumSchedule, [])) {
      expect(r.yearHi - r.yearLo).toBeLessThanOrEqual(10)
      expect(r.yearLo).toBeGreaterThanOrEqual(Math.max(1970, bounds.get(r.fid)!.min))
    }
    for (const r of generateRerollPool('2026-07-14', 'hard', hardSchedule, [])) {
      expect(r.yearHi - r.yearLo).toBeLessThanOrEqual(5)
      expect(r.yearLo).toBeGreaterThanOrEqual(Math.max(1970, bounds.get(r.fid)!.min))
    }
  })

  it('produces a different pool for a different date', () => {
    const scheduleA = generateDailySchedule('2026-07-14', 'medium')
    const scheduleB = generateDailySchedule('2026-07-15', 'medium')
    const a = generateRerollPool('2026-07-14', 'medium', scheduleA, [])
    const b = generateRerollPool('2026-07-15', 'medium', scheduleB, [])
    expect(a).not.toEqual(b)
  })
})
