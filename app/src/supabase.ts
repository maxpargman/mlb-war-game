import { createClient } from '@supabase/supabase-js'
import { getDeviceId } from './deviceId'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

export interface DailyScore {
  id?: string
  date: string        // YYYY-MM-DD
  username: string
  mode: 'easy' | 'medium' | 'hard'
  score: number
  lineup: object
  created_at?: string
}

// Slice 4.1: writes no longer go directly to the table (RLS rejects them
// now). The submit-score Edge Function recomputes the score server-side
// from the lineup and only inserts if it's legitimate.
// Slice 4.4: also sends the device UUID (same one used by game_sessions)
// so a leaderboard row can be correlated back to a session/device.
export async function submitScore(entry: Omit<DailyScore, 'id' | 'created_at'>): Promise<void> {
  const { data, error } = await supabase.functions.invoke('submit-score', { body: { ...entry, deviceId: getDeviceId() } })
  if (error) {
    // FunctionsHttpError carries the function's JSON error body on .context
    const context = (error as { context?: Response }).context
    const message = context ? ((await context.json().catch(() => null))?.error ?? error.message) : error.message
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
}

export async function fetchLeaderboard(date: string, mode: 'easy' | 'medium' | 'hard'): Promise<DailyScore[]> {
  const { data, error } = await supabase
    .from('daily_scores')
    .select('username, score, created_at')
    .eq('date', date)
    .eq('mode', mode)
    .order('score', { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as DailyScore[]
}
