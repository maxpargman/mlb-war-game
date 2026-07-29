import { describe, it, expect, beforeEach } from 'vitest'
import { getDeviceId } from './deviceId'

// Same minimal in-memory localStorage stand-in as dailyStorage.test.ts --
// the test environment is plain Node (see vite.config.ts).
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null { return this.store.get(key) ?? null }
  setItem(key: string, value: string): void { this.store.set(key, value) }
  removeItem(key: string): void { this.store.delete(key) }
  clear(): void { this.store.clear() }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage
})

describe('getDeviceId', () => {
  it('generates and persists an id on first call', () => {
    expect(localStorage.getItem('mlbwar_device_id')).toBeNull()
    const id = getDeviceId()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(localStorage.getItem('mlbwar_device_id')).toBe(id)
  })

  it('returns the same id on repeated calls', () => {
    const first = getDeviceId()
    const second = getDeviceId()
    expect(second).toBe(first)
  })

  it('reuses an id already in localStorage rather than generating a new one', () => {
    localStorage.setItem('mlbwar_device_id', 'existing-id-123')
    expect(getDeviceId()).toBe('existing-id-123')
  })
})
