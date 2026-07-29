// Anonymous per-browser device UUID, persisted in localStorage. Split out
// from session.ts (which uses it for game_sessions) so supabase.ts can also
// use it (for daily_scores, slice 4.4) without a circular import between
// the two.

const DEVICE_ID_KEY = 'mlbwar_device_id'

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}
