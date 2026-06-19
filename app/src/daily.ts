import { franchises, yearBounds } from './data'

export type DailyMode = 'easy' | 'medium' | 'hard'

// Mulberry32 — fast seedable PRNG
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function dateToSeed(date: string): number {
  return parseInt(date.replace(/-/g, ''), 10)
}

// Each mode gets a different seed offset so schedules don't overlap
const MODE_OFFSET: Record<DailyMode, number> = { easy: 0, medium: 1, hard: 2 }

export function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface DailyRound {
  fid: string
  fn: string
  yearLo: number
  yearHi: number
}

const ERA_START = 1970  // medium and hard constrained to modern era

export function generateDailySchedule(date: string, mode: DailyMode): DailyRound[] {
  const rand = mulberry32(dateToSeed(date) + MODE_OFFSET[mode])
  const { max } = yearBounds()
  const allFranchises = franchises()
  const pool = [...allFranchises]
  const rounds: DailyRound[] = []

  for (let i = 0; i < 11; i++) {
    const idx = Math.floor(rand() * pool.length)
    const { fid, fn } = pool.splice(idx, 1)[0]

    let yearLo: number
    let yearHi: number

    if (mode === 'easy') {
      const { min } = yearBounds()
      yearLo = min
      yearHi = max
    } else {
      const windowSize = mode === 'medium' ? 10 : 5
      const span = max - ERA_START - windowSize
      yearLo = ERA_START + Math.floor(rand() * span)
      yearHi = yearLo + windowSize
    }

    rounds.push({ fid, fn, yearLo, yearHi })
  }

  return rounds
}
