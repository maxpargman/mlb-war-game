import { useEffect, useState } from 'react'
import { loadData, yearBounds } from './data'
import SetupScreen from './SetupScreen'
import type { GameSettings } from './types'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<GameSettings | null>(null)

  useEffect(() => {
    loadData()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(String(e)))
  }, [])

  if (error) return <p style={{ color: 'red', padding: '1rem' }}>Error: {error}</p>
  if (!ready) return <p style={{ padding: '1rem' }}>Loading data…</p>

  if (!settings) {
    return <SetupScreen onStart={setSettings} />
  }

  return <GamePlaceholder settings={settings} onBack={() => setSettings(null)} />
}

function GamePlaceholder({ settings, onBack }: { settings: GameSettings; onBack: () => void }) {
  const { min, max } = yearBounds()
  const rangeLabel =
    settings.mode === 'all'
      ? `All years (${min}–${max})`
      : settings.mode === 'custom'
      ? `${settings.yearLo}–${settings.yearHi}`
      : `Hard mode (randomized per round)`

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0f172a', color: '#f1f5f9',
      fontFamily: 'system-ui, sans-serif', padding: '1.5rem',
    }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Draft starting…</h1>
      <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Time range: <strong style={{ color: '#f1f5f9' }}>{rangeLabel}</strong></p>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '2rem' }}>
        (Game UI comes in slice 2.3)
      </p>
      <button
        onClick={onBack}
        style={{
          padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #334155',
          background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem',
        }}
      >
        ← Back to setup
      </button>
    </div>
  )
}
