import { describe, it, expect, beforeAll } from 'vitest'
import { __setDbForTesting, eligiblePlayers, franchises, yearBounds } from './data'
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
