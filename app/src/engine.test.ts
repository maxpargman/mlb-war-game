import { describe, it, expect, beforeAll } from 'vitest'
import { __setDbForTesting } from './data'
import type { Pos } from './data'
import { fixtureDb } from './testFixtures'
import { applyPick, hasDraftablePlayer, autoPickBest, initGame } from './engine'
import { emptyLineup, snakeOrder } from './types'
import type { GameState, DraftPick, LineupSlot } from './types'

beforeAll(() => {
  __setDbForTesting(fixtureDb)
})

const dummyPick: DraftPick = { playerId: 'dummy', name: 'Dummy', pos: 'C', war: 0, year: 2000, fid: 'F01', fn: 'Team 01' }

// A lineup where every slot is already filled except the one matching `openPos`
// — isolates hasDraftablePlayer's answer to exactly that one slot.
function lineupWithOnlyOpen(openPos: Pos): LineupSlot[] {
  return emptyLineup().map(s => (s.pos === openPos ? s : { pos: s.pos, pick: { ...dummyPick, pos: s.pos } }))
}

function baseState(): GameState {
  const roundFranchises = [{ fid: 'F01', fn: 'Team 01' }, { fid: 'F02', fn: 'Team 02' }]
  const roundRanges = Array.from({ length: 11 }, () => ({ yearLo: 1990, yearHi: 2012 }))
  return {
    settings: { mode: 'custom', yearLo: 1990, yearHi: 2012 },
    roundRanges,
    roundFranchises,
    lineups: [emptyLineup(), emptyLineup()],
    takenPlayerIds: new Set(),
    round: 0,
    turn: 0,
    phase: 'draft',
    skipUsed: false,
    rerollIndex: 0,
  }
}

describe('snakeOrder', () => {
  it('alternates first-picker every round', () => {
    expect(snakeOrder(0)).toEqual([0, 1])
    expect(snakeOrder(1)).toEqual([1, 0])
    expect(snakeOrder(2)).toEqual([0, 1])
    expect(snakeOrder(3)).toEqual([1, 0])
  })
})

describe('applyPick', () => {
  it('hands off to the second picker after the first pick of a round', () => {
    const state = baseState()
    const pick: DraftPick = { ...dummyPick, playerId: 'p01', name: 'Player One', pos: 'C', war: 2.0, fid: 'F01', fn: 'Team 01' }
    const slotIndex = state.lineups[0].findIndex(s => s.pos === 'C')
    const next = applyPick(state, pick, slotIndex)
    expect(next.turn).toBe(1)
    expect(next.round).toBe(0)
    expect(next.phase).toBe('draft')
  })

  it('advances the round and follows snake order after the second pick', () => {
    let state = baseState()
    state = applyPick(state, { ...dummyPick, playerId: 'p01', pos: 'C' }, state.lineups[0].findIndex(s => s.pos === 'C'))
    state = applyPick(state, { ...dummyPick, playerId: 'p05', pos: 'SS' }, state.lineups[1].findIndex(s => s.pos === 'SS'))
    expect(state.round).toBe(1)
    expect(state.turn).toBe(snakeOrder(1)[0])
  })

  it('does not mutate the original state (immutability)', () => {
    const state = baseState()
    const originalLineupSlot = state.lineups[0].find(s => s.pos === 'C')!
    const pick: DraftPick = { ...dummyPick, playerId: 'p01', pos: 'C' }
    const slotIndex = state.lineups[0].findIndex(s => s.pos === 'C')

    const next = applyPick(state, pick, slotIndex)

    // Original state untouched
    expect(originalLineupSlot.pick).toBeNull()
    expect(state.lineups[0][slotIndex].pick).toBeNull()
    expect(state.takenPlayerIds.size).toBe(0)
    expect(state.turn).toBe(0)

    // New state reflects the change, with new object identities
    expect(next.lineups[0][slotIndex].pick?.playerId).toBe('p01')
    expect(next.takenPlayerIds.has('p01')).toBe(true)
    expect(next.lineups).not.toBe(state.lineups)
    expect(next.lineups[0]).not.toBe(state.lineups[0])
    expect(next.takenPlayerIds).not.toBe(state.takenPlayerIds)
  })

  it('marks phase done once all 11 rounds are complete', () => {
    let state = baseState()
    for (let round = 0; round < 11; round++) {
      for (const picker of snakeOrder(round)) {
        state.turn = picker
        const openSlot = state.lineups[picker].find(s => s.pick === null)
        if (!openSlot) continue
        const idx = state.lineups[picker].indexOf(openSlot)
        state = applyPick(state, { ...dummyPick, playerId: `filler-${round}-${picker}`, pos: openSlot.pos }, idx)
      }
    }
    expect(state.phase).toBe('done')
    expect(state.lineups[0].every(s => s.pick !== null)).toBe(true)
    expect(state.lineups[1].every(s => s.pick !== null)).toBe(true)
  })
})

describe('shared player pool (no duplicate person, one position-version each)', () => {
  it('blocks the other position-version, and the other board, once a person is drafted', () => {
    const state = baseState()
    state.roundFranchises = [{ fid: 'F02', fn: 'Team 02' }]

    // Before anyone drafts multi01, F02's only 1B option is draftable on either board.
    state.turn = 0
    state.lineups[0] = lineupWithOnlyOpen('1B')
    expect(hasDraftablePlayer(state, 'F02')).toBe(true)
    state.turn = 1
    state.lineups[1] = lineupWithOnlyOpen('1B')
    expect(hasDraftablePlayer(state, 'F02')).toBe(true)

    // Board 0 drafts multi01's OF version (a different slot than the one we're
    // probing above, so the 1B slot itself is never touched by this pick).
    let ofState = baseState()
    ofState.roundFranchises = [{ fid: 'F02', fn: 'Team 02' }]
    ofState = applyPick(
      ofState,
      { ...dummyPick, playerId: 'multi01', name: 'Two Way Guy', pos: 'OF', war: 3.5, year: 2010, fid: 'F02', fn: 'Team 02' },
      ofState.lineups[0].findIndex(s => s.pos === 'OF'),
    )
    expect(ofState.takenPlayerIds.has('multi01')).toBe(true)

    // Now that multi01 is taken game-wide, the 1B slot is undraftable on
    // EITHER board — same person, same shared takenPlayerIds set.
    const blocked: GameState = { ...state, takenPlayerIds: ofState.takenPlayerIds }
    blocked.turn = 0
    expect(hasDraftablePlayer(blocked, 'F02')).toBe(false)
    blocked.turn = 1
    expect(hasDraftablePlayer(blocked, 'F02')).toBe(false)
    expect(autoPickBest({ ...blocked, turn: 0 })).toBeNull()
  })
})

describe('dead-end detection', () => {
  it('is false when the only open slot has no eligible player for that franchise', () => {
    const state = baseState()
    state.roundFranchises = [{ fid: 'F01', fn: 'Team 01' }]
    // F01 has zero pitchers in the fixture.
    state.lineups[0] = lineupWithOnlyOpen('P')
    expect(hasDraftablePlayer(state, 'F01')).toBe(false)
  })

  it('is true when an open slot has a matching eligible player', () => {
    const state = baseState()
    state.roundFranchises = [{ fid: 'F01', fn: 'Team 01' }]
    state.lineups[0] = lineupWithOnlyOpen('C')
    expect(hasDraftablePlayer(state, 'F01')).toBe(true)
  })
})

describe('initGame', () => {
  it('produces a structurally valid fresh game', () => {
    const state = initGame({ mode: 'all', yearLo: 0, yearHi: 0 })
    expect(state.roundRanges.length).toBe(11)
    expect(state.roundFranchises.length).toBeLessThanOrEqual(11)
    expect(new Set(state.roundFranchises.map(f => f.fid)).size).toBe(state.roundFranchises.length)
    expect(state.phase).toBe('draft')
    expect(state.round).toBe(0)
    expect(state.turn).toBe(0)
    expect(state.lineups[0].every(s => s.pick === null)).toBe(true)
    expect(state.lineups[1].every(s => s.pick === null)).toBe(true)
  })
})
