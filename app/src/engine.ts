import { franchises, eligiblePlayers, yearBounds } from './data'
import type { GameSettings, GameState, DraftPick, LineupSlot } from './types'
import { emptyLineup, snakeOrder } from './types'

const ROUNDS = 11

function resolveRange(settings: GameSettings, roundIndex: number): { yearLo: number; yearHi: number } {
  if (settings.mode === 'custom') {
    return { yearLo: settings.yearLo, yearHi: settings.yearHi }
  }
  if (settings.mode === 'hard') {
    // Hard mode: random 10-year window within dataset bounds, seeded per round
    // (re-uses the pre-seeded roundRanges generated at game start)
    void roundIndex  // consumed via roundRanges; this branch is just for documentation
  }
  const { min, max } = yearBounds()
  return { yearLo: min, yearHi: max }
}

function randomHardRange(): { yearLo: number; yearHi: number } {
  const { min, max } = yearBounds()
  const window = 10
  const lo = min + Math.floor(Math.random() * (max - min - window + 1))
  return { yearLo: lo, yearHi: lo + window }
}

function drawFranchises(count: number, exclude: Set<string>): Array<{ fid: string; fn: string }> {
  const pool = franchises().filter(f => !exclude.has(f.fid))
  const drawn: Array<{ fid: string; fn: string }> = []
  const available = [...pool]
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.floor(Math.random() * available.length)
    drawn.push(available.splice(idx, 1)[0])
  }
  return drawn
}

export function initGame(settings: GameSettings): GameState {
  const roundFranchises = drawFranchises(ROUNDS, new Set())

  const roundRanges = Array.from({ length: ROUNDS }, (_, i) =>
    settings.mode === 'hard' ? randomHardRange() : resolveRange(settings, i)
  )

  return {
    settings,
    roundRanges,
    roundFranchises,
    lineups: [emptyLineup(), emptyLineup()],
    takenPlayerIds: new Set(),
    round: 0,
    turn: snakeOrder(0)[0],
    phase: 'draft',
  }
}

// Returns open slot indices in a lineup that match the given position.
export function openSlotsFor(lineup: LineupSlot[], pos: string): number[] {
  return lineup
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.pos === pos && s.pick === null)
    .map(({ i }) => i)
}

// True if there is at least one eligible player for the current player's open slots.
export function hasDraftablePlayer(state: GameState, fid: string): boolean {
  const { yearLo, yearHi } = state.roundRanges[state.round]
  const players = eligiblePlayers(fid, yearLo, yearHi)
  const lineup = state.lineups[state.turn]
  return players.some(
    p => !state.takenPlayerIds.has(p.id) && openSlotsFor(lineup, p.pos).length > 0
  )
}

// Apply a pick to the game state (immutably — returns new state).
export function applyPick(state: GameState, pick: DraftPick, slotIndex: number): GameState {
  const lineups = state.lineups.map(l => [...l.map(s => ({ ...s }))]) as [LineupSlot[], LineupSlot[]]
  lineups[state.turn][slotIndex] = { pos: pick.pos, pick }

  const takenPlayerIds = new Set(state.takenPlayerIds)
  takenPlayerIds.add(pick.playerId)

  // Advance turn/round
  const order = snakeOrder(state.round)
  const turnPos = order.indexOf(state.turn as 0 | 1)
  let round = state.round
  let turn: 0 | 1 = state.turn

  if (turnPos === 0) {
    // First pick of the round done; hand off to second picker
    turn = order[1]
  } else {
    // Both picks done; advance round
    round += 1
    if (round >= ROUNDS) {
      return { ...state, lineups, takenPlayerIds, round, turn, phase: 'done' }
    }
    turn = snakeOrder(round)[0]
  }

  return { ...state, lineups, takenPlayerIds, round, turn, phase: 'draft' }
}

// For placeholder picks: auto-selects the best available player for any open slot.
export function autoPickBest(state: GameState): { pick: DraftPick; slotIndex: number } | null {
  const { fid, fn } = state.roundFranchises[state.round]
  const { yearLo, yearHi } = state.roundRanges[state.round]
  const players = eligiblePlayers(fid, yearLo, yearHi)
  const lineup = state.lineups[state.turn]

  for (const p of players) {
    if (state.takenPlayerIds.has(p.id)) continue
    const slots = openSlotsFor(lineup, p.pos)
    if (slots.length > 0) {
      return {
        pick: { playerId: p.id, name: p.name, pos: p.pos, war: p.bestWar, year: p.bestYear, fid, fn },
        slotIndex: slots[0],
      }
    }
  }
  return null
}
