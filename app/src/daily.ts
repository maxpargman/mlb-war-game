import { franchises, yearBounds, franchiseYearBoundsMap } from './data'

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

// Bugfix: picks a medium/hard year window constrained to the given
// franchise's OWN active years (intersected with [ERA_START, datasetMax]),
// not the whole dataset's range. Drawing a window from the whole dataset
// regardless of franchise could land entirely before a young franchise
// existed (e.g. Arizona, founded 1998, could get a 1972-1982 window) --
// guaranteeing zero eligible players, not just a rare unlucky draw. If a
// franchise's active span is shorter than the window (not the case for any
// current MLB franchise, but defensive), clamps to its real max instead of
// running past it.
function resolveWindow(
  fid: string,
  mode: DailyMode,
  rand: () => number,
  datasetBounds: { min: number; max: number },
  franchiseBounds: Map<string, { min: number; max: number }>,
): { yearLo: number; yearHi: number } {
  if (mode === 'easy') {
    return { yearLo: datasetBounds.min, yearHi: datasetBounds.max }
  }
  const windowSize = mode === 'medium' ? 10 : 5
  const fBounds = franchiseBounds.get(fid) ?? datasetBounds
  const lo = Math.max(ERA_START, fBounds.min)
  const span = Math.max(0, fBounds.max - lo - windowSize)
  const yearLo = lo + Math.floor(rand() * (span + 1))
  const yearHi = Math.min(yearLo + windowSize, fBounds.max)
  return { yearLo, yearHi }
}

export function generateDailySchedule(date: string, mode: DailyMode): DailyRound[] {
  const rand = mulberry32(dateToSeed(date) + MODE_OFFSET[mode])
  const datasetBounds = yearBounds()
  const franchiseBounds = franchiseYearBoundsMap()
  const pool = franchises()
  const rounds: DailyRound[] = []

  for (let i = 0; i < 11; i++) {
    const idx = Math.floor(rand() * pool.length)
    const { fid, fn } = pool.splice(idx, 1)[0]
    const { yearLo, yearHi } = resolveWindow(fid, mode, rand, datasetBounds, franchiseBounds)
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
  const datasetBounds = yearBounds()
  const franchiseBounds = franchiseYearBoundsMap()
  const usedFids = new Set(schedule.map(r => r.fid))
  const pool = franchises().filter(f => !usedFids.has(f.fid))
  const backups: DailyRound[] = []

  for (let i = 0; i < schedule.length && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length)
    const { fid, fn } = pool.splice(idx, 1)[0]
    const { yearLo, yearHi } = resolveWindow(fid, mode, rand, datasetBounds, franchiseBounds)
    backups.push({ fid, fn, yearLo, yearHi })
  }

  return backups
}

// Bugfix (post-5.3): dead-end reroll -- when a drawn franchise has no
// eligible player left for the currently-open lineup slots,
// DailyDraftScreen substitutes a replacement. This used to be plain
// Math.random(), which the server could never validate (a real submission
// hitting a dead end anywhere got rejected as "not in today's schedule or a
// valid skip" -- confusing, and in Medium/Hard's narrow year windows,
// common enough to be a real problem, not a rare edge case). Deterministic
// now, same pattern as generateSkipBackups: seeded independently, and drawn
// from a pool excluding BOTH the primary schedule and the skip backups (so
// a reroll can never collide with either). Unlike the skip backups (11,
// one per round), this drains the WHOLE remaining pool -- a reroll can, in
// rare cases, itself dead-end and need a second substitute, and a single
// game could (very rarely) hit more than one dead end across different
// rounds. Consumed in order via a cursor (GameState.rerollIndex), so it
// doesn't matter which round each substitution was "for" -- the server just
// needs to recognize each fid as having come from this same deterministic
// sequence. KEPT IN SYNC with the copy in
// supabase/functions/submit-score/index.ts.
const REROLL_SEED_OFFSET = 200

export function generateRerollPool(date: string, mode: DailyMode, schedule: DailyRound[], skipBackups: DailyRound[]): DailyRound[] {
  const rand = mulberry32(dateToSeed(date) + REROLL_SEED_OFFSET + MODE_OFFSET[mode])
  const datasetBounds = yearBounds()
  const franchiseBounds = franchiseYearBoundsMap()
  const exclude = new Set([...schedule.map(r => r.fid), ...skipBackups.map(r => r.fid)])
  const pool = franchises().filter(f => !exclude.has(f.fid))
  const result: DailyRound[] = []

  while (pool.length > 0) {
    const idx = Math.floor(rand() * pool.length)
    const { fid, fn } = pool.splice(idx, 1)[0]
    const { yearLo, yearHi } = resolveWindow(fid, mode, rand, datasetBounds, franchiseBounds)
    result.push({ fid, fn, yearLo, yearHi })
  }

  return result
}
