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

// Single global day boundary for the daily challenge (schedule seed,
// storage keys, lock/resume) — US Eastern midnight, DST-aware via the IANA
// zone name rather than a fixed UTC offset.
export function todayString(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
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

// Slice 5.3: a deterministic backup franchise/year-window per round index,
// for the daily challenge's skip feature (Medium/Hard only). Seeded
// independently of the primary schedule (own offset) so it doesn't disturb
// it, and drawn from a pool excluding every primary-schedule franchise so a
// skip can never reintroduce a repeat. Pure function of (date, mode,
// schedule) — every player skipping round N on the same day lands on the
// identical replacement. KEPT IN SYNC with the copy in
// supabase/functions/submit-score/index.ts, which needs it to validate a
// skip-affected submission.
const SKIP_SEED_OFFSET = 100

export function generateSkipBackups(date: string, mode: DailyMode, schedule: DailyRound[]): DailyRound[] {
  const rand = mulberry32(dateToSeed(date) + SKIP_SEED_OFFSET + MODE_OFFSET[mode])
  const { min, max } = yearBounds()
  const usedFids = new Set(schedule.map(r => r.fid))
  const pool = franchises().filter(f => !usedFids.has(f.fid))
  const backups: DailyRound[] = []

  for (let i = 0; i < schedule.length && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length)
    const { fid, fn } = pool.splice(idx, 1)[0]

    let yearLo: number
    let yearHi: number

    if (mode === 'easy') {
      yearLo = min
      yearHi = max
    } else {
      const windowSize = mode === 'medium' ? 10 : 5
      const span = max - ERA_START - windowSize
      yearLo = ERA_START + Math.floor(rand() * span)
      yearHi = yearLo + windowSize
    }

    backups.push({ fid, fn, yearLo, yearHi })
  }

  return backups
}
