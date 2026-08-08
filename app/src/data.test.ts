import { describe, it, expect, beforeAll } from 'vitest'
import { __setDbForTesting, eligiblePlayers, franchises, yearBounds, stintYears, formatYearRanges, franchiseYearBoundsMap } from './data'
import { fixtureDb } from './testFixtures'

beforeAll(() => {
  __setDbForTesting(fixtureDb)
})

describe('eligiblePlayers', () => {
  it('picks the best-WAR season within the active year range', () => {
    const all = eligiblePlayers('F01', 1990, 2012)
    const p02 = all.find(p => p.id === 'p02')
    expect(p02).toBeDefined()
    expect(p02!.bestWar).toBe(5.0)
    expect(p02!.bestYear).toBe(2005)
  })

  it('excludes seasons outside the requested range', () => {
    const narrow = eligiblePlayers('F01', 1990, 2003)
    const p02 = narrow.find(p => p.id === 'p02')
    expect(p02).toBeDefined()
    expect(p02!.bestWar).toBe(3.0)
    expect(p02!.bestYear).toBe(2000)
  })

  it('excludes players outside the requested franchise', () => {
    const other = eligiblePlayers('F02', 1990, 2012)
    expect(other.find(p => p.id === 'p02')).toBeUndefined()
  })

  it('keeps multiple position-versions of the same person as separate entries', () => {
    const f02 = eligiblePlayers('F02', 1990, 2012)
    const versions = f02.filter(p => p.id === 'multi01')
    expect(versions.map(v => v.pos).sort()).toEqual(['1B', 'OF'])
  })

  it('returns nothing for a range with no qualifying seasons', () => {
    const empty = eligiblePlayers('F01', 1900, 1950)
    expect(empty).toEqual([])
  })
})

describe('franchises', () => {
  it('returns one entry per distinct franchise id', () => {
    const list = franchises()
    const distinctFids = new Set(fixtureDb.map(r => r.fid))
    expect(list.length).toBe(distinctFids.size)
    expect(new Set(list.map(f => f.fid))).toEqual(distinctFids)
  })
})

describe('yearBounds', () => {
  it('returns the min and max year across the whole dataset', () => {
    const years = fixtureDb.map(r => r.y)
    expect(yearBounds()).toEqual({ min: Math.min(...years), max: Math.max(...years) })
  })
})

describe('franchiseYearBoundsMap', () => {
  it('returns the min/max year per franchise, not the whole dataset', () => {
    const map = franchiseYearBoundsMap()
    // F01: seasons in 2000-2005 only (see testFixtures.ts)
    expect(map.get('F01')).toEqual({ min: 2000, max: 2005 })
    // F02: seasons in 2010-2012 only
    expect(map.get('F02')).toEqual({ min: 2010, max: 2012 })
  })

  it('has one entry per distinct franchise', () => {
    const map = franchiseYearBoundsMap()
    const distinctFids = new Set(fixtureDb.map(r => r.fid))
    expect(map.size).toBe(distinctFids.size)
  })
})

describe('stintYears', () => {
  it('returns all years for a (player, position, franchise) within the range', () => {
    // p02 at F01/1B has seasons in 2000, 2001, 2002, 2005 (see testFixtures.ts)
    expect(stintYears('p02', '1B', 'F01', 1990, 2012)).toEqual([2000, 2001, 2002, 2005])
  })

  it('excludes years outside the requested range', () => {
    expect(stintYears('p02', '1B', 'F01', 1990, 2001)).toEqual([2000, 2001])
  })

  it('is scoped to position: a two-way player only gets years for that position-version', () => {
    expect(stintYears('multi01', 'OF', 'F02', 1990, 2020)).toEqual([2010])
    expect(stintYears('multi01', '1B', 'F02', 1990, 2020)).toEqual([2012])
  })

  it('returns an empty array when there are no qualifying seasons', () => {
    expect(stintYears('p02', '1B', 'F01', 1900, 1950)).toEqual([])
  })
})

describe('formatYearRanges', () => {
  it('returns an empty string for no years', () => {
    expect(formatYearRanges([])).toBe('')
  })

  it('renders a single year as itself, not a range', () => {
    expect(formatYearRanges([2005])).toBe('2005')
  })

  it('collapses a consecutive run into a single range', () => {
    expect(formatYearRanges([2001, 2002, 2003, 2004])).toBe('2001–2004')
  })

  it('is gap-aware: separates non-consecutive runs with a comma', () => {
    expect(formatYearRanges([2000, 2001, 2002, 2005])).toBe('2000–2002, 2005')
    expect(formatYearRanges([2001, 2004, 2007, 2010])).toBe('2001, 2004, 2007, 2010')
  })

  it('matches the plan example: "2001–2004, 2007–2010"', () => {
    expect(formatYearRanges([2001, 2002, 2003, 2004, 2007, 2008, 2009, 2010])).toBe('2001–2004, 2007–2010')
  })
})
