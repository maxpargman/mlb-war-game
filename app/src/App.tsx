import { useEffect, useState } from 'react'
import { loadData } from './data'
import SetupScreen from './SetupScreen'
import DraftScreen from './DraftScreen'
import LineupCard from './LineupCard'
import type { GameSettings, GameState } from './types'

type AppPhase = 'loading' | 'setup' | 'draft' | 'done'

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<GameSettings | null>(null)
  const [finalState, setFinalState] = useState<GameState | null>(null)

  useEffect(() => {
    loadData()
      .then(() => setPhase('setup'))
      .catch((e: unknown) => setError(String(e)))
  }, [])

  if (error) return <p style={{ color: 'red', padding: '1rem' }}>Error: {error}</p>
  if (phase === 'loading') return <p style={{ padding: '1rem', color: '#f1f5f9' }}>Loading data…</p>

  if (phase === 'setup' || !settings) {
    return <SetupScreen onStart={s => { setSettings(s); setPhase('draft') }} />
  }

  if (phase === 'draft') {
    return (
      <DraftScreen
        settings={settings}
        onEnd={gs => { setFinalState(gs); setPhase('done') }}
      />
    )
  }

  // Done screen
  const lineups = finalState!.lineups
  const totals = lineups.map(l => l.reduce((s, sl) => s + (sl.pick?.war ?? 0), 0))
  const winner = totals[0] > totals[1] ? 'Player 1' : totals[1] > totals[0] ? 'Player 2' : 'Tie!'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#f1f5f9',
      fontFamily: 'system-ui, sans-serif',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1rem',
    }}>
      {/* Result banner */}
      <div style={{
        width: '100%', maxWidth: '900px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Draft complete</span>
        <span style={{ fontWeight: 800, fontSize: '1.5rem', color: '#facc15' }}>{winner} wins!</span>
        <button
          onClick={() => { setSettings(null); setFinalState(null); setPhase('setup') }}
          style={{
            padding: '0.4rem 1.25rem', borderRadius: '6px',
            border: '1px solid #334155', background: 'transparent',
            color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem',
          }}
        >
          Play again
        </button>
      </div>

      {/* Side-by-side lineup cards — same component as draft screen */}
      <div style={{ width: '100%', maxWidth: '900px', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        {lineups.map((lineup, pi) => (
          <LineupCard
            key={pi}
            playerName={`Player ${pi + 1}`}
            lineup={lineup}
            totalWar={totals[pi]}
          />
        ))}
      </div>
    </div>
  )
}
