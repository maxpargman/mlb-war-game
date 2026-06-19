import type { Pos } from './data'

export type TimeRangeMode = 'all' | 'custom' | 'hard'

export interface GameSettings {
  mode: TimeRangeMode
  yearLo: number   // used when mode === 'custom'; ignored otherwise
  yearHi: number   // used when mode === 'custom'; ignored otherwise
}

export interface LineupSlot {
  pos: Pos
  pick: DraftPick | null
}

export interface DraftPick {
  playerId: string
  name: string
  pos: Pos
  war: number
  year: number
  fid: string
  fn: string
}

export interface GameState {
  settings: GameSettings
  // Per-round year ranges (hard mode generates these upfront; other modes repeat the same range)
  roundRanges: Array<{ yearLo: number; yearHi: number }>
  // Franchise drawn for each round (length = 11 once fully seeded)
  roundFranchises: Array<{ fid: string; fn: string }>
  lineups: [LineupSlot[], LineupSlot[]]   // [player0, player1]
  takenPlayerIds: Set<string>             // any picked player's id blocks all their versions
  round: number        // 0-based current round (0–10)
  turn: 0 | 1         // which player is picking this half-round
  phase: 'draft' | 'done'
}

// Snake order: round 0 → [0,1], round 1 → [1,0], round 2 → [0,1], …
export function snakeOrder(round: number): [0 | 1, 0 | 1] {
  return round % 2 === 0 ? [0, 1] : [1, 0]
}

export const LINEUP_TEMPLATE: Pos[] = ['C', '1B', '2B', '3B', 'SS', 'OF', 'OF', 'OF', 'P', 'P', 'P']

export function emptyLineup(): LineupSlot[] {
  return LINEUP_TEMPLATE.map(pos => ({ pos, pick: null }))
}
