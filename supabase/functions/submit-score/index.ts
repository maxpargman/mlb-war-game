// submit-score — Slice 4.1: the only path allowed to write to daily_scores.
//
// Replaces the old open-insert flow (app/src/supabase.ts called
// `supabase.from('daily_scores').insert(...)` directly with the anon key,
// trusting whatever score/lineup the client sent). Direct inserts are now
// rejected by RLS (see the migration in this same slice) — this function is
// the only writer, using the service role key to bypass RLS after doing its
// own validation.
//
// What it checks, in order:
//   1. Request shape (date, username, mode, lineup all present and typed right).
//   2. Rate limit: this IP hasn't submitted more than RATE_LIMIT_MAX times
//      in the last RATE_LIMIT_WINDOW_MS (logged in submission_attempts,
//      independent of whether the attempt succeeds — this needs to catch
//      abuse that never makes it into daily_scores at all).
//   3. Username sanitized: trimmed, control characters stripped, capped at
//      USERNAME_MAX_LEN.
//   4. Lineup recomputed against the deterministic daily schedule for
//      (date, mode) — the mulberry32 PRNG logic here MUST stay in sync with
//      app/src/daily.ts's generateDailySchedule. Every pick's franchise,
//      year, and position get checked against that schedule, and its WAR
//      value is looked up fresh from game-data.json (never trusts the
//      client's submitted WAR or total score). A pick may instead match the
//      deterministic skip-backup for its round (slice 5.3, Medium/Hard
//      only) — at most one such substitution is accepted per submission.
//   5. One submission per (date, username, mode) — checked here for a fast
//      rejection, and enforced for real by a unique constraint in the DB
//      (this check alone can't close a race between two near-simultaneous
//      requests; the DB constraint can).
//
// Slice 4.4: also stores the client's device id (same one game_sessions
// uses) alongside the score, for correlation -- not validated beyond basic
// shape, since it's metadata, not an anti-cheat control.
//
// Bugfix (post-5.3, see generateRerollPool below): a pick may also match
// the deterministic dead-end reroll pool, uncapped. This replaces an
// earlier, narrower scope note -- the client's dead-end reroll used to be
// plain Math.random(), which this function could never validate, rejecting
// real submissions ("not in today's schedule or a valid skip") whenever a
// dead end occurred. That was originally accepted as a rare edge case, but
// turned out to be common enough in Medium/Hard's narrow year windows to
// be a real, user-reported problem -- worth the fix rather than continuing
// to accept it.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const GAME_DATA_URL = 'https://mlb-war-draft.vercel.app/game-data.json'
const GAME_DATA_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

const USERNAME_MAX_LEN = 30
// Kept as an explicit literal, not imported, since this function can't
// import from app/src/types.ts across the Deno/Vite boundary -- verify
// against LINEUP_TEMPLATE in app/src/types.ts if the lineup shape ever changes.
const LINEUP_TEMPLATE = ['C', '1B', '2B', '3B', 'SS', 'OF', 'OF', 'OF', 'P', 'P', 'P']

const MODE_OFFSET: Record<string, number> = { easy: 0, medium: 1, hard: 2 }
const ERA_START = 1970
const DAILY_ROUNDS = 11

type Season = { id: string; n: string; fid: string; fn: string; y: number; pos: string; war: number }
type DailyRound = { fid: string; fn: string; yearLo: number; yearHi: number }
type LineupSlot = { pos: string; pick: { playerId: string; name: string; pos: string; war: number; year: number; fid: string; fn: string } | null }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- ported from app/src/daily.ts -- KEEP IN SYNC ---

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dateToSeed(date: string): number {
  return parseInt(date.replace(/-/g, ''), 10)
}

function franchises(gameData: Season[]): { fid: string; fn: string }[] {
  const seen = new Map<string, string>()
  for (const r of gameData) seen.set(r.fid, r.fn)
  return [...seen.entries()].map(([fid, fn]) => ({ fid, fn })).sort((a, b) => a.fn.localeCompare(b.fn))
}

function yearBounds(gameData: Season[]): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const r of gameData) {
    if (r.y < min) min = r.y
    if (r.y > max) max = r.y
  }
  return { min, max }
}

// Bugfix -- ported from app/src/daily.ts's franchiseYearBoundsMap (via
// data.ts) -- KEEP IN SYNC.
function franchiseYearBoundsMap(gameData: Season[]): Map<string, { min: number; max: number }> {
  const map = new Map<string, { min: number; max: number }>()
  for (const r of gameData) {
    const existing = map.get(r.fid)
    if (!existing) map.set(r.fid, { min: r.y, max: r.y })
    else {
      if (r.y < existing.min) existing.min = r.y
      if (r.y > existing.max) existing.max = r.y
    }
  }
  return map
}

// Bugfix -- ported from app/src/daily.ts's resolveWindow -- KEEP IN SYNC.
// Constrains a medium/hard window to the given franchise's own active years
// (a young franchise like Arizona, founded 1998, could otherwise get a
// window entirely before it existed, guaranteeing zero eligible players).
function resolveWindow(
  fid: string,
  mode: string,
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

function generateDailySchedule(date: string, mode: string, gameData: Season[]): DailyRound[] {
  const rand = mulberry32(dateToSeed(date) + (MODE_OFFSET[mode] ?? 0))
  const datasetBounds = yearBounds(gameData)
  const franchiseBounds = franchiseYearBoundsMap(gameData)
  const pool = franchises(gameData)
  const rounds: DailyRound[] = []

  for (let i = 0; i < DAILY_ROUNDS; i++) {
    const idx = Math.floor(rand() * pool.length)
    const { fid, fn } = pool.splice(idx, 1)[0]
    const { yearLo, yearHi } = resolveWindow(fid, mode, rand, datasetBounds, franchiseBounds)
    rounds.push({ fid, fn, yearLo, yearHi })
  }
  return rounds
}

// Slice 5.3 skip feature -- ported from app/src/daily.ts's
// generateSkipBackups -- KEEP IN SYNC.
const SKIP_SEED_OFFSET = 100

function generateSkipBackups(date: string, mode: string, schedule: DailyRound[], gameData: Season[]): DailyRound[] {
  const rand = mulberry32(dateToSeed(date) + SKIP_SEED_OFFSET + (MODE_OFFSET[mode] ?? 0))
  const datasetBounds = yearBounds(gameData)
  const franchiseBounds = franchiseYearBoundsMap(gameData)
  const usedFids = new Set(schedule.map(r => r.fid))
  const pool = franchises(gameData).filter(f => !usedFids.has(f.fid))
  const backups: DailyRound[] = []

  for (let i = 0; i < schedule.length && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length)
    const { fid, fn } = pool.splice(idx, 1)[0]
    const { yearLo, yearHi } = resolveWindow(fid, mode, rand, datasetBounds, franchiseBounds)
    backups.push({ fid, fn, yearLo, yearHi })
  }
  return backups
}

// Bugfix (post-5.3) -- ported from app/src/daily.ts's generateRerollPool --
// KEEP IN SYNC. See that file for the full explanation: the client's
// dead-end reroll used to be plain Math.random(), which this function could
// never validate, rejecting real submissions as "not in today's schedule or
// a valid skip" whenever a dead end occurred -- common enough in
// Medium/Hard's narrow year windows to be a real (not rare) problem.
const REROLL_SEED_OFFSET = 200

function generateRerollPool(date: string, mode: string, schedule: DailyRound[], skipBackups: DailyRound[], gameData: Season[]): DailyRound[] {
  const rand = mulberry32(dateToSeed(date) + REROLL_SEED_OFFSET + (MODE_OFFSET[mode] ?? 0))
  const datasetBounds = yearBounds(gameData)
  const franchiseBounds = franchiseYearBoundsMap(gameData)
  const exclude = new Set([...schedule.map(r => r.fid), ...skipBackups.map(r => r.fid)])
  const pool = franchises(gameData).filter(f => !exclude.has(f.fid))
  const result: DailyRound[] = []

  while (pool.length > 0) {
    const idx = Math.floor(rand() * pool.length)
    const { fid, fn } = pool.splice(idx, 1)[0]
    const { yearLo, yearHi } = resolveWindow(fid, mode, rand, datasetBounds, franchiseBounds)
    result.push({ fid, fn, yearLo, yearHi })
  }
  return result
}

// --- end ported section ---

function eligibleWar(gameData: Season[], fid: string, pos: string, yearLo: number, yearHi: number, playerId: string): { war: number; year: number } | null {
  let best: { war: number; year: number } | null = null
  for (const r of gameData) {
    if (r.fid !== fid || r.pos !== pos || r.id !== playerId) continue
    if (r.y < yearLo || r.y > yearHi) continue
    if (!best || r.war > best.war) best = { war: r.war, year: r.y }
  }
  return best
}

let cachedGameData: Season[] | null = null
let cachedAt = 0

async function loadGameData(): Promise<Season[]> {
  const now = Date.now()
  if (cachedGameData && now - cachedAt < GAME_DATA_CACHE_TTL_MS) return cachedGameData
  const res = await fetch(GAME_DATA_URL)
  if (!res.ok) throw new Error(`Failed to fetch game data: ${res.status}`)
  cachedGameData = (await res.json()) as Season[]
  cachedAt = now
  return cachedGameData
}

function sanitizeUsername(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    // deliberately narrow (not a broad Unicode letters-only regex) so real
    // names with accents/apostrophes still work; this just strips control
    // characters and other non-printable garbage.
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, USERNAME_MAX_LEN)
  if (s.length === 0) throw new ValidationError('Username is required.')
  return s
}

// Slice 4.4: correlation metadata, not an anti-cheat control -- a missing
// or malformed device id is stored as null rather than rejecting an
// otherwise-legitimate submission.
function sanitizeDeviceId(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (s.length === 0 || s.length > 100) return null
  return s
}

class ValidationError extends Error {}

function validateAndScore(lineup: unknown, schedule: DailyRound[], backups: DailyRound[], rerollPool: DailyRound[], gameData: Season[]): number {
  if (!Array.isArray(lineup) || lineup.length !== LINEUP_TEMPLATE.length) {
    throw new ValidationError('Lineup must have exactly 11 slots.')
  }

  const roundsByFid = new Map(schedule.map(r => [r.fid, r]))
  const backupsByFid = new Map(backups.map(r => [r.fid, r]))
  const rerollByFid = new Map(rerollPool.map(r => [r.fid, r]))
  const usedFids = new Set<string>()
  const usedPlayerIds = new Set<string>()
  let skipCount = 0
  let total = 0

  for (let i = 0; i < LINEUP_TEMPLATE.length; i++) {
    const slot = lineup[i] as LineupSlot | null | undefined
    const expectedPos = LINEUP_TEMPLATE[i]
    if (!slot || slot.pos !== expectedPos || !slot.pick) {
      throw new ValidationError(`Slot ${i} (${expectedPos}) is missing or malformed.`)
    }
    const pick = slot.pick

    if (usedPlayerIds.has(pick.playerId)) throw new ValidationError(`Player ${pick.playerId} drafted more than once.`)
    usedPlayerIds.add(pick.playerId)

    // A pick's franchise must be either a scheduled franchise, the
    // deterministic skip-backup for some round (at most once per
    // submission -- slice 5.3), or a deterministic dead-end reroll
    // substitute (no cap -- a system-triggered substitution, not a player
    // choice, so it doesn't count against the skip budget; see
    // generateRerollPool). Doesn't matter which round any of these was
    // "for" -- each pool already excludes every fid in the others.
    let round = roundsByFid.get(pick.fid)
    if (!round) {
      round = backupsByFid.get(pick.fid)
      if (round) {
        skipCount++
        if (skipCount > 1) throw new ValidationError('Only one skip is allowed per game.')
      }
    }
    if (!round) round = rerollByFid.get(pick.fid)
    if (!round) throw new ValidationError(`Franchise ${pick.fid} was not in today's schedule or a valid skip.`)
    if (usedFids.has(pick.fid)) throw new ValidationError(`Franchise ${pick.fid} used more than once.`)
    usedFids.add(pick.fid)

    if (pick.year < round.yearLo || pick.year > round.yearHi) {
      throw new ValidationError(`Year ${pick.year} outside ${round.fid}'s range ${round.yearLo}-${round.yearHi}.`)
    }

    const trueWar = eligibleWar(gameData, pick.fid, expectedPos, round.yearLo, round.yearHi, pick.playerId)
    if (!trueWar) {
      throw new ValidationError(`${pick.playerId} is not a valid ${expectedPos} for ${pick.fid} in ${round.yearLo}-${round.yearHi}.`)
    }
    total += trueWar.war
  }

  if (usedFids.size !== schedule.length) {
    throw new ValidationError("Submitted lineup doesn't cover all of today's franchises.")
  }

  return Math.round(total * 100) / 100
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  try {
    // Rate limit: log this attempt, then check how many this IP has made
    // in the window. Logged before validation so rejected/malformed
    // requests count too. submission_attempts is shared with track-session
    // (slice 4.2) -- must filter by endpoint or a single daily game's ~12
    // track-session calls (one per pick) blow through this budget too.
    await admin.from('submission_attempts').insert({ ip, endpoint: 'submit-score' })
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
    const { count } = await admin
      .from('submission_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('endpoint', 'submit-score')
      .gte('created_at', since)
    if ((count ?? 0) > RATE_LIMIT_MAX) {
      return new Response(JSON.stringify({ error: 'Too many submissions. Try again later.' }), { status: 429, headers: corsHeaders })
    }

    const body = await req.json()
    const date = String(body.date ?? '')
    const mode = String(body.mode ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError('Invalid date.')
    if (!['easy', 'medium', 'hard'].includes(mode)) throw new ValidationError('Invalid mode.')

    const username = sanitizeUsername(body.username)
    const deviceId = sanitizeDeviceId(body.deviceId)

    const gameData = await loadGameData()
    const schedule = generateDailySchedule(date, mode, gameData)
    // Skip is Medium/Hard only (slice 5.3) -- easy gets no valid backups,
    // so any non-scheduled franchise there is rejected same as before.
    const backups = mode === 'easy' ? [] : generateSkipBackups(date, mode, schedule, gameData)
    // Dead-end reroll (bugfix) can happen in any mode, so computed for all.
    const rerollPool = generateRerollPool(date, mode, schedule, backups, gameData)
    const score = validateAndScore(body.lineup, schedule, backups, rerollPool, gameData)

    // Fast pre-check (not race-safe on its own -- the DB unique constraint
    // from this slice's migration is the real guarantee).
    const { data: existing } = await admin
      .from('daily_scores')
      .select('id')
      .eq('date', date)
      .eq('username', username)
      .eq('mode', mode)
      .maybeSingle()
    if (existing) {
      return new Response(JSON.stringify({ error: 'You already submitted a score today for this mode.' }), { status: 409, headers: corsHeaders })
    }

    const { error: insertError } = await admin
      .from('daily_scores')
      .insert({ date, username, mode, score, lineup: body.lineup, device_id: deviceId })
    if (insertError) {
      // Most likely the unique constraint catching a race the pre-check missed.
      const status = insertError.code === '23505' ? 409 : 500
      const message = insertError.code === '23505' ? 'You already submitted a score today for this mode.' : 'Failed to save score.'
      return new Response(JSON.stringify({ error: message }), { status, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ ok: true, score }), { status: 200, headers: corsHeaders })
  } catch (e) {
    if (e instanceof ValidationError) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: corsHeaders })
    }
    console.error(e)
    return new Response(JSON.stringify({ error: 'Internal error.' }), { status: 500, headers: corsHeaders })
  }
})
