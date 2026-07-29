// Slice 4.2: anonymous session tracking. Fire-and-forget by design — this
// is analytics, not gameplay-critical, so a failed/slow network call must
// never block or disrupt a real game in progress.

import { supabase } from './supabase'
import { getDeviceId } from './deviceId'

export type GameType = 'daily' | 'hotseat'

async function callTrackSession(body: Record<string, unknown>): Promise<{ sessionId?: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('track-session', { body })
    if (error || data?.error) return null
    return data
  } catch {
    return null
  }
}

export async function startSession(gameType: GameType, mode: string, date: string, lineup: unknown): Promise<string | null> {
  const res = await callTrackSession({ action: 'start', deviceId: getDeviceId(), gameType, mode, date, lineup })
  return res?.sessionId ?? null
}

export async function updateSession(sessionId: string, lineup: unknown, score: number): Promise<void> {
  await callTrackSession({ action: 'update', sessionId, deviceId: getDeviceId(), lineup, score })
}

export async function completeSession(sessionId: string, lineup: unknown, score: number): Promise<void> {
  await callTrackSession({ action: 'complete', sessionId, deviceId: getDeviceId(), lineup, score })
}
