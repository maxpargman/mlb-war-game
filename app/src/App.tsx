import { useEffect, useState } from 'react'
import './layout.css'
import { loadData } from './data'
import SetupScreen from './SetupScreen'
import DraftScreen from './DraftScreen'
import DailyDraftScreen from './DailyDraftScreen'
import LeaderboardScreen from './LeaderboardScreen'
import LineupCard from './LineupCard'
import type { GameSettings, GameState, LineupSlot } from './types'
import { COLORS } from './theme'

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

  if (error) return <p style={{ color: COLORS.error, padding: '1rem' }}>Error: {error}</p>
  if (phase === 'loading') return <p style={{ padding: '1rem', color: COLORS.textDim }}>Loading data…</p>

  function goHome() {
    setPhase('setup')
    setSettings(null)
    setFinalState(null)
    setDailyResult(null)
  }

  const homeBtn = phase !== 'setup' && (
    <button onClick={goHome} className="btn btn-secondary" style={homeStyle} title="Home">⌂</button>
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
  const accents: ('green' | 'red')[] = ['green', 'red']

  const totals = lineups.map(l => l.reduce((s, sl) => s + (sl.pick?.war ?? 0), 0))
  const winner = totals[0] > totals[1] ? 'Player 1' : totals[1] > totals[0] ? 'Player 2' : null
  const winnerColor = winner === 'Player 1' ? COLORS.green : winner === 'Player 2' ? COLORS.redLight : COLORS.text

  return (
    <>
    {homeBtn}
    <div style={{
      minHeight: '100vh', padding: '2rem 1.5rem 3rem',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
    }}>
      <div className="num" style={{ color: COLORS.textMuted, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' }}>
        DRAFT COMPLETE · FULL LINEUP
      </div>
      <div className="display" style={{ fontSize: '2.25rem', color: winnerColor, margin: '0.2rem 0' }}>
        {winner ? `${winner} Wins` : 'Tie!'}
      </div>
      <div className="num" style={{ fontSize: '0.85rem', color: COLORS.textDim, marginBottom: '1.75rem' }}>
        {totals[0].toFixed(1)} – {totals[1].toFixed(1)}
      </div>

      <div className="lineup-stack">
        {lineups.map((lineup, pi) => (
          <LineupCard
            key={pi}
            playerName={`Player ${pi + 1}`}
            lineup={lineup}
            totalWar={totals[pi]}
            accent={accents[pi]}
            capBar
          />
        ))}
      </div>

      <button
        onClick={() => { setSettings(null); setFinalState(null); setPhase('setup') }}
        className="btn btn-primary"
        style={{ marginTop: '2rem' }}
      >
        Play Again
      </button>
    </div>
    </>
  )
}

const homeStyle: React.CSSProperties = {
  position: 'fixed',
  top: '0.75rem',
  left: '0.75rem',
  zIndex: 100,
  padding: '0.35rem 0.65rem',
  fontSize: '1.1rem',
  lineHeight: 1,
}
