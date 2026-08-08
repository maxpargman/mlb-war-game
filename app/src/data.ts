// Data-access layer for game-data.json.
// All game logic that touches player data goes through these functions.

export type Pos = 'C' | '1B' | '2B' | '3B' | 'SS' | 'OF' | 'P'

export interface Season {
  id: string        // playerID (e.g. "harpebr03")
  n: string         // full name
  fid: string       // franchID (e.g. "PHI")
  fn: string        // franchise display name
  y: number         // season year
  pos: Pos          // position version
  war: number       // bWAR for this season
}

// Loaded once at startup; null until the fetch completes.
let _db: Season[] | null = null

export async function loadData(): Promise<Season[]> {
  if (_db) return _db
  const res = await fetch('/game-data.json')
  if (!res.ok) throw new Error(`Failed to load game-data.json: ${res.status}`)
  _db = await res.json() as Season[]
  return _db
}

export function getDb(): Season[] {
  if (!_db) throw new Error('Data not loaded yet — await loadData() first')
  return _db
}

// Test-only: seed the in-memory db directly, bypassing the network fetch.
export function __setDbForTesting(db: Season[]): void {
  _db = db
}

// Returns every unique franchise {fid, fn} sorted by display name.
export function franchises(): { fid: string; fn: string }[] {
  const db = getDb()
  const seen = new Map<string, string>()
  for (const r of db) seen.set(r.fid, r.fn)
  return [...seen.entries()]
    .map(([fid, fn]) => ({ fid, fn }))
    .sort((a, b) => a.fn.localeCompare(b.fn))
}

export interface PlayerVersion {
  id: string
  name: string
  pos: Pos
  bestWar: number   // highest qualifying WAR within the active range
  bestYear: number  // the season that produced bestWar
}

// For a given franchise + year range, returns one PlayerVersion per
// (player, position) pair that has at least one qualifying season.
// This is the core query the draft loop will call each round.
export function eligiblePlayers(
  fid: string,
  yearLo: number,
  yearHi: number,
): PlayerVersion[] {
  const db = getDb()

  // Collect best WAR per (playerID, pos) within the franchise + range
  const best = new Map<string, PlayerVersion>()

  for (const r of db) {
    if (r.fid !== fid) continue
    if (r.y < yearLo || r.y > yearHi) continue

    const key = `${r.id}|${r.pos}`
    const existing = best.get(key)
    if (!existing || r.war > existing.bestWar) {
      best.set(key, {
        id: r.id,
        name: r.n,
        pos: r.pos,
        bestWar: r.war,
        bestYear: r.y,
      })
    }
  }

  return [...best.values()].sort((a, b) => b.bestWar - a.bestWar)
}

// Sorted, deduplicated years within [yearLo, yearHi] where this specific
// (player, position, franchise) combination recorded a season. Scoped to
// position too, since a two-way player's two PlayerVersions (e.g. OF and
// 1B) can have entirely different stint years.
export function stintYears(id: string, pos: Pos, fid: string, yearLo: number, yearHi: number): number[] {
  const db = getDb()
  const years = new Set<number>()
  for (const r of db) {
    if (r.id !== id || r.pos !== pos || r.fid !== fid) continue
    if (r.y < yearLo || r.y > yearHi) continue
    years.add(r.y)
  }
  return [...years].sort((a, b) => a - b)
}

// Groups consecutive years into ranges, e.g. [2001,2002,2003,2004,2007] ->
// "2001–2004, 2007". A single year renders as itself, not a "2007–2007" range.
export function formatYearRanges(years: number[]): string {
  if (years.length === 0) return ''
  const parts: string[] = []
  let start = years[0]
  let prev = years[0]
  for (let i = 1; i < years.length; i++) {
    const y = years[i]
    if (y === prev + 1) {
      prev = y
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = y
    prev = y
  }
  parts.push(start === prev ? `${start}` : `${start}–${prev}`)
  return parts.join(', ')
}

// Earliest and latest years in the dataset.
export function yearBounds(): { min: number; max: number } {
  const db = getDb()
  let min = Infinity, max = -Infinity
  for (const r of db) {
    if (r.y < min) min = r.y
    if (r.y > max) max = r.y
  }
  return { min, max }
}

// Bugfix: earliest/latest years each franchise actually appears in the
// dataset. generateDailySchedule (and the skip/reroll pools) used to draw a
// medium/hard year window from the whole dataset's range regardless of
// which franchise it landed on -- a young franchise (e.g. Arizona,
// founded 1998) could get a window entirely before it existed, guaranteeing
// zero eligible players. One pass over the whole dataset, computed once and
// reused, rather than re-scanning per franchise per round.
export function franchiseYearBoundsMap(): Map<string, { min: number; max: number }> {
  const db = getDb()
  const map = new Map<string, { min: number; max: number }>()
  for (const r of db) {
    const existing = map.get(r.fid)
    if (!existing) map.set(r.fid, { min: r.y, max: r.y })
    else {
      if (r.y < existing.min) existing.min = r.y
      if (r.y > existing.max) existing.max = r.y
    }
  }
  return map
}
