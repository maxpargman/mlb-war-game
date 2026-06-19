import { useEffect, useState } from 'react'
import './layout.css'
import { loadData } from './data'
import SetupScreen from './SetupScreen'
import DraftScreen from './DraftScreen'
import DailyDraftScreen from './DailyDraftScreen'
import LeaderboardScreen from './LeaderboardScreen'
import LineupCard from './LineupCard'
import type { GameSettings, GameState, LineupSlot } from './types'

type AppPhase = 'loading' | 'setup' | 'draft' | 'done' | 'daily' | 'leaderboard'

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<GameSettings | null>(null)
  const [dailyMode, setDailyMode] = useState<'easy' | 'medium' | 'hard'>('easy')
  const [finalState, setFinalState] = useState<GameState | null>(null)
  const [dailyResult, setDailyResult] = useState<{ score: number; lineup: LineupSlot[] } | null>(null)

  useEffect(() => {
    loadData()
      .then(() => setPhase('setup'))
      .catch((e: unknown) => setError(String(e)))
  }, [])

  if (error) return <p style={{ color: 'red', padding: '1rem' }}>Error: {error}</p>
  if (phase === 'loading') return <p style={{ padding: '1rem', color: '#f1f5f9' }}>Loading data…</p>

  function goHome() {
    setPhase('setup')
    setSettings(null)
    setFinalState(null)
    setDailyResult(null)
  }

  const homeBtn = phase !== 'setup' && (
    <button onClick={goHome} style={homeStyle} title="Home">⌂</button>
  )

  if (phase === 'setup') {
    return (
      <SetupScreen
        onStart={s => { setSettings(s); setPhase('draft') }}
        onDaily={m => { setDailyMode(m); setPhase('daily') }}
      />
    )
  }

  if (phase === 'daily') {
    return (
      <>
        {homeBtn}
        <DailyDraftScreen
          mode={dailyMode}
          onDone={(score, lineup) => {
            setDailyResult({ score, lineup })
            setPhase('leaderboard')
          }}
        />
      </>
    )
  }

  if (phase === 'leaderboard' && dailyResult) {
    return (
      <>
        {homeBtn}
        <LeaderboardScreen
          mode={dailyMode}
          score={dailyResult.score}
          lineup={dailyResult.lineup}
          onPlayAgain={() => setPhase('setup')}
        />
      </>
    )
  }

  if (phase === 'draft' && settings) {
    return (
      <>
        {homeBtn}
        <DraftScreen
          settings={settings}
          onEnd={gs => { setFinalState(gs); setPhase('done') }}
        />
      </>
    )
  }

  // 2-player done screen
  const lineups = finalState!.lineups

  const totals = lineups.map(l => l.reduce((s, sl) => s + (sl.pick?.war ?? 0), 0))
  const winner = totals[0] > totals[1] ? 'Player 1' : totals[1] > totals[0] ? 'Player 2' : 'Tie!'

  return (
    <>
    {homeBtn}
    <div style={{
      minHeight: '100vh', background: '#0f172a', color: '#f1f5f9',
      fontFamily: 'system-ui, sans-serif', padding: '1.25rem 1.5rem',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
    }}>
      <div className="top-bar">
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
      <div className="lineup-row">
        {lineups.map((lineup, pi) => (
          <LineupCard key={pi} playerName={`Player ${pi + 1}`} lineup={lineup} totalWar={totals[pi]} />
        ))}
      </div>
    </div>
    </>
  )
}

const homeStyle: React.CSSProperties = {
  position: 'fixed',
  top: '0.75rem',
  left: '0.75rem',
  zIndex: 100,
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#94a3b8',
  borderRadius: '8px',
  padding: '0.35rem 0.65rem',
  fontSize: '1.1rem',
  cursor: 'pointer',
  lineHeight: 1,
}
