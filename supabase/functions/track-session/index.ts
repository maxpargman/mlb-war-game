// track-session — Slice 4.2: the only path allowed to write to game_sessions.
//
// Logs both daily-challenge and 2-player hot-seat games for analytics —
// one row per game, created on the first pick and updated as the game
// progresses. Unlike submit-score (slice 4.1), nothing written here is ever
// shown back to a user or used to rank anyone, so validation here is
// deliberately lighter: structural shape + sane bounds, not full
// game-rule/WAR recomputation. Direct table writes are rejected by RLS
// (game_sessions has zero policies — service role only), so this function
// is the only writer, same pattern as submit-score.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RATE_LIMIT_MAX = 200 // generous: a single hot-seat game alone can be ~22 calls
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

const MAX_LINEUP_JSON_LEN = 50_000 // an 11-slot lineup is a few KB at most; this is a generous cap, not a tight fit
const MIN_SCORE = -50
const MAX_SCORE = 200 // generous headroom above any realistic 11-player WAR total

const GAME_TYPES = ['daily', 'hotseat'] as const
const MODES_BY_GAME_TYPE: Record<string, string[]> = {
  daily: ['easy', 'medium', 'hard'],
  hotseat: ['all', 'custom', 'hard'],
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class ValidationError extends Error {}

function validateDeviceId(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (s.length === 0 || s.length > 100) throw new ValidationError('Invalid deviceId.')
  return s
}

function validateGameType(raw: unknown): string {
  const s = String(raw ?? '')
  if (!GAME_TYPES.includes(s as typeof GAME_TYPES[number])) throw new ValidationError('Invalid gameType.')
  return s
}

function validateMode(gameType: string, raw: unknown): string {
  const s = String(raw ?? '')
  if (!MODES_BY_GAME_TYPE[gameType]?.includes(s)) throw new ValidationError('Invalid mode for this gameType.')
  return s
}

function validateDate(raw: unknown): string {
  const s = String(raw ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError('Invalid date.')
  return s
}

function validateLineup(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') throw new ValidationError('Invalid lineup payload.')
  const json = JSON.stringify(raw)
  if (json.length > MAX_LINEUP_JSON_LEN) throw new ValidationError('Lineup payload too large.')
  return raw
}

function validateScore(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < MIN_SCORE || n > MAX_SCORE) throw new ValidationError('Invalid score.')
  return Math.round(n * 100) / 100
}

function validateSessionId(raw: unknown): string {
  const s = String(raw ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new ValidationError('Invalid sessionId.')
  return s
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
    await admin.from('submission_attempts').insert({ ip, endpoint: 'track-session' })
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
    const { count } = await admin
      .from('submission_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('endpoint', 'track-session')
      .gte('created_at', since)
    if ((count ?? 0) > RATE_LIMIT_MAX) {
      return new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429, headers: corsHeaders })
    }

    const body = await req.json()
    const action = String(body.action ?? '')
    const deviceId = validateDeviceId(body.deviceId)

    if (action === 'start') {
      const gameType = validateGameType(body.gameType)
      const mode = validateMode(gameType, body.mode)
      const date = validateDate(body.date)
      const lineup = validateLineup(body.lineup)

      const { data, error } = await admin
        .from('game_sessions')
        .insert({ device_id: deviceId, game_type: gameType, mode, date, lineup, status: 'in_progress' })
        .select('id')
        .single()
      if (error || !data) return new Response(JSON.stringify({ error: 'Failed to start session.' }), { status: 500, headers: corsHeaders })
      return new Response(JSON.stringify({ ok: true, sessionId: data.id }), { status: 200, headers: corsHeaders })
    }

    if (action === 'update' || action === 'complete') {
      const sessionId = validateSessionId(body.sessionId)
      const lineup = validateLineup(body.lineup)
      const score = validateScore(body.score)

      const patch: Record<string, unknown> = { lineup, score, updated_at: new Date().toISOString() }
      if (action === 'complete') patch.status = 'completed'

      const { data, error } = await admin
        .from('game_sessions')
        .update(patch)
        .eq('id', sessionId)
        .eq('device_id', deviceId) // ownership check: a device can only update its own session
        .neq('status', 'completed') // don't resurrect a finished session
        .select('id')
        .maybeSingle()
      if (error) return new Response(JSON.stringify({ error: 'Failed to update session.' }), { status: 500, headers: corsHeaders })
      if (!data) return new Response(JSON.stringify({ error: 'Session not found or not updatable.' }), { status: 404, headers: corsHeaders })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
    }

    throw new ValidationError('Invalid action.')
  } catch (e) {
    if (e instanceof ValidationError) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: corsHeaders })
    }
    console.error(e)
    return new Response(JSON.stringify({ error: 'Internal error.' }), { status: 500, headers: corsHeaders })
  }
})
