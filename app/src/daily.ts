import { franchises, yearBounds } from './data'

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
  // YYYY-MM-DD → integer e.g. 20260619
  return parseInt(date.replace(/-/g, ''), 10)
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface DailyRound {
  fid: string
  fn: string
  yearLo: number
  yearHi: number
}

export function generateDailySchedule(date: string, mode: 'easy' | 'hard'): DailyRound[] {
  const rand = mulberry32(dateToSeed(date) + (mode === 'hard' ? 1 : 0))
  const { min, max } = yearBounds()
  const allFranchises = franchises()

  // Draw 11 unique franchises
  const pool = [...allFranchises]
  const rounds: DailyRound[] = []

  for (let i = 0; i < 11; i++) {
    const idx = Math.floor(rand() * pool.length)
    const { fid, fn } = pool.splice(idx, 1)[0]

    let yearLo = min
    let yearHi = max

    if (mode === 'hard') {
      const windowSize = 10
      const span = max - min - windowSize
      yearLo = min + Math.floor(rand() * span)
      yearHi = yearLo + windowSize
    }

    rounds.push({ fid, fn, yearLo, yearHi })
  }

  return rounds
}
