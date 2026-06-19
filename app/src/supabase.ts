import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

export interface DailyScore {
  id?: string
  date: string        // YYYY-MM-DD
  username: string
  mode: 'easy' | 'hard'
  score: number
  lineup: object
  created_at?: string
}

export async function submitScore(entry: Omit<DailyScore, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('daily_scores').insert(entry)
  if (error) throw new Error(error.message)
}

export async function fetchLeaderboard(date: string, mode: 'easy' | 'hard'): Promise<DailyScore[]> {
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
