import { useState } from 'react'
import { yearBounds } from './data'
import type { GameSettings, TimeRangeMode } from './types'
import { todayString, type DailyMode } from './daily'
import { getDailyStatus, type DailyStatus } from './dailyStorage'
import InstructionsModal from './InstructionsModal'

const INSTRUCTIONS_SEEN_KEY = 'mlbwar_instructions_seen'

export type GameMode = '2player' | 'daily-easy' | 'daily-medium' | 'daily-hard'

interface Props {
  onStart: (settings: GameSettings) => void
  onDaily: (mode: DailyMode) => void
}

const DAILY_MODE_OF: Record<GameMode, DailyMode | null> = {
  '2player': null,
  'daily-easy': 'easy',
  'daily-medium': 'medium',
  'daily-hard': 'hard',
}

function statusText(status: DailyStatus, fallback: string): string {
  if (status.kind === 'in_progress') return 'In progress — tap to resume'
  if (status.kind === 'done') return `Completed — ${status.score.toFixed(1)} WAR`
  return fallback
}

export default function SetupScreen({ onStart, onDaily }: Props) {
  const { min, max: dataMax } = yearBounds()
  const max = Math.min(dataMax, new Date().getFullYear() - 1)

  const [gameMode, setGameMode] = useState<GameMode>('2player')
  const [rangeMode, setRangeMode] = useState<TimeRangeMode>('all')
  const [yearLo, setYearLo] = useState(2000)
  const [yearHi, setYearHi] = useState(max)
  const [showInstructions, setShowInstructions] = useState(() => !localStorage.getItem(INSTRUCTIONS_SEEN_KEY))

  function closeInstructions() {
    localStorage.setItem(INSTRUCTIONS_SEEN_KEY, '1')
    setShowInstructions(false)
  }

  const loErr = rangeMode === 'custom' && yearLo > yearHi
  const rangeErr = rangeMode === 'custom' && (yearLo < min || yearLo > max || yearHi < min || yearHi > max)
  const canStart = !loErr && !rangeErr

  // Statuses are read fresh on each render (cheap, synchronous localStorage
  // reads) -- this component remounts whenever the player returns to setup.
  const today = todayString()
  const dailyStatus: Record<DailyMode, DailyStatus> = {
    easy: getDailyStatus(today, 'easy'),
    medium: getDailyStatus(today, 'medium'),
    hard: getDailyStatus(today, 'hard'),
  }

  const selectedDailyMode = DAILY_MODE_OF[gameMode]
  const selectedDailyStatus = selectedDailyMode ? dailyStatus[selectedDailyMode] : null
  const startLabel = selectedDailyStatus?.kind === 'in_progress'
    ? 'Resume Daily Challenge'
    : selectedDailyStatus?.kind === 'done'
      ? 'View Results'
      : gameMode === '2player' ? 'Start Draft' : 'Start Daily Challenge'

  function handleStart() {
    if (gameMode === 'daily-easy') { onDaily('easy'); return }
    if (gameMode === 'daily-medium') { onDaily('medium'); return }
    if (gameMode === 'daily-hard') { onDaily('hard'); return }
    onStart({ mode: rangeMode, yearLo, yearHi })
  }

  return (
    <div style={styles.page}>
      <button onClick={() => setShowInstructions(true)} style={styles.howToPlayBtn}>
        ❓ How to play
      </button>

      {showInstructions && <InstructionsModal onClose={closeInstructions} />}

      <h1 style={styles.title}>The WAR Room</h1>

      {/* Game mode */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Mode</h2>

        <label style={styles.radio}>
          <input type="radio" name="gameMode" checked={gameMode === '2player'} onChange={() => setGameMode('2player')} />
          <span style={styles.radioTitle}>2-Player</span>
          <span style={styles.desc}>Hot-seat draft on one device</span>
        </label>

        <label style={styles.radio}>
          <input type="radio" name="gameMode" checked={gameMode === 'daily-easy'} onChange={() => setGameMode('daily-easy')} />
          <span style={styles.radioTitle}>Daily — Easy</span>
          <span style={styles.desc}>{statusText(dailyStatus.easy, "Today's challenge, all time")}</span>
        </label>

        <label style={styles.radio}>
          <input type="radio" name="gameMode" checked={gameMode === 'daily-medium'} onChange={() => setGameMode('daily-medium')} />
          <span style={styles.radioTitle}>Daily — Medium</span>
          <span style={styles.desc}>{statusText(dailyStatus.medium, 'Post-1970, random 10-year windows')}</span>
        </label>

        <label style={styles.radio}>
          <input type="radio" name="gameMode" checked={gameMode === 'daily-hard'} onChange={() => setGameMode('daily-hard')} />
          <span style={styles.radioTitle}>Daily — Hard</span>
          <span style={styles.desc}>{statusText(dailyStatus.hard, 'Post-1970, random 5-year windows')}</span>
        </label>
      </div>

      {/* Time range — only shown for 2-player */}
      {gameMode === '2player' && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Time Range</h2>

          <label style={styles.radio}>
            <input type="radio" name="rangeMode" value="all" checked={rangeMode === 'all'} onChange={() => setRangeMode('all')} />
            <span style={styles.radioTitle}>All Time</span>
            <span style={styles.desc}>Any season in franchise history</span>
          </label>

          <label style={styles.radio}>
            <input type="radio" name="rangeMode" value="custom" checked={rangeMode === 'custom'} onChange={() => setRangeMode('custom')} />
            <span style={styles.radioTitle}>Custom Range</span>
            <span style={styles.desc}>Only seasons within a chosen window</span>
          </label>

          {rangeMode === 'custom' && (
            <div style={styles.rangeRow}>
              <label style={styles.rangeLabel}>
                From
                <input
                  type="number" min={min} max={max} value={yearLo}
                  onChange={e => setYearLo(Number(e.target.value))}
                  style={{ ...styles.yearInput, ...((loErr || rangeErr) ? styles.inputErr : {}) }}
                />
              </label>
              <label style={styles.rangeLabel}>
                to
                <input
                  type="number" min={min} max={max} value={yearHi}
                  onChange={e => setYearHi(Number(e.target.value))}
                  style={{ ...styles.yearInput, ...((loErr || rangeErr) ? styles.inputErr : {}) }}
                />
              </label>
              {loErr && <span style={styles.errText}>Start year must be ≤ end year</span>}
              {!loErr && rangeErr && <span style={styles.errText}>Years must be between {min} and {max}</span>}
            </div>
          )}

          <label style={styles.radio}>
            <input type="radio" name="rangeMode" value="hard" checked={rangeMode === 'hard'} onChange={() => setRangeMode('hard')} />
            <span style={styles.radioTitle}>Hard Mode</span>
            <span style={styles.desc}>Year range randomized each round</span>
          </label>
        </div>
      )}

      <button onClick={handleStart} disabled={!canStart} style={styles.startBtn}>
        {startLabel}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    fontFamily: 'system-ui, sans-serif',
    background: '#0f172a',
    color: '#f1f5f9',
    gap: '0rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 800,
    marginBottom: '1.5rem',
    letterSpacing: '-0.5px',
  },
  howToPlayBtn: {
    position: 'fixed',
    top: '0.75rem',
    right: '0.75rem',
    zIndex: 100,
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#94a3b8',
    borderRadius: '8px',
    padding: '0.35rem 0.75rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  card: {
    background: '#1e293b',
    borderRadius: '12px',
    padding: '1.25rem 2rem',
    width: '100%',
    maxWidth: '440px',
    marginBottom: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem',
  },
  cardTitle: {
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: '0.1rem',
  },
  radio: {
    display: 'grid',
    gridTemplateColumns: 'auto 8rem 1fr',
    alignItems: 'baseline',
    gap: '0 0.6rem',
    cursor: 'pointer',
    fontSize: '0.95rem',
    lineHeight: 1.6,
  },
  radioTitle: { fontWeight: 700 },
  desc: { color: '#94a3b8', fontWeight: 400, fontSize: '0.85rem' },
  rangeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginLeft: '1.5rem',
    flexWrap: 'wrap',
  },
  rangeLabel: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' },
  yearInput: {
    width: '5rem',
    padding: '0.25rem 0.4rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: '0.9rem',
  },
  inputErr: { borderColor: '#ef4444' },
  errText: { color: '#ef4444', fontSize: '0.8rem' },
  startBtn: {
    padding: '0.75rem 2.5rem',
    fontSize: '1rem',
    fontWeight: 700,
    borderRadius: '8px',
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
  },
}
