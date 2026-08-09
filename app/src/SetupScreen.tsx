import { useState } from 'react'
import { yearBounds } from './data'
import type { GameSettings, TimeRangeMode } from './types'
import { todayString, type DailyMode } from './daily'
import { getDailyStatus, type DailyStatus } from './dailyStorage'
import InstructionsModal from './InstructionsModal'
import { COLORS } from './theme'
import warRoomLogo from './assets/war-room-logo.png'

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
      <button onClick={() => setShowInstructions(true)} className="btn btn-secondary" style={styles.howToPlayBtn}>
        How to play
      </button>

      {showInstructions && <InstructionsModal onClose={closeInstructions} />}

      <img src={warRoomLogo} alt="War Room" style={styles.logo} />
      <div style={styles.tagline}>Snake-draft baseball history. Best lineup by total WAR wins.</div>

      {/* Mode */}
      <div style={styles.section}>
        <ModeRow
          selected={gameMode === '2player'}
          onClick={() => setGameMode('2player')}
          title="2-Player Draft"
          meta="Hot-seat, one device, 11 rounds"
        />
        <ModeRow
          selected={gameMode === 'daily-easy'}
          onClick={() => setGameMode('daily-easy')}
          title="Daily — Easy"
          meta={statusText(dailyStatus.easy, 'All time')}
        />
        <ModeRow
          selected={gameMode === 'daily-medium'}
          onClick={() => setGameMode('daily-medium')}
          title="Daily — Medium"
          meta={statusText(dailyStatus.medium, 'Post-1970, 10-yr window')}
        />
        <ModeRow
          selected={gameMode === 'daily-hard'}
          onClick={() => setGameMode('daily-hard')}
          title="Daily — Hard"
          meta={statusText(dailyStatus.hard, 'Post-1970, 5-yr window')}
          last
        />
      </div>

      {/* Time range — only shown for 2-player */}
      {gameMode === '2player' && (
        <div style={styles.section}>
          <ModeRow
            selected={rangeMode === 'all'}
            onClick={() => setRangeMode('all')}
            title="All Time"
            meta="Any season in franchise history"
          />
          <ModeRow
            selected={rangeMode === 'custom'}
            onClick={() => setRangeMode('custom')}
            title="Custom Range"
            meta="Only seasons within a chosen window"
          >
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
          </ModeRow>
          <ModeRow
            selected={rangeMode === 'hard'}
            onClick={() => setRangeMode('hard')}
            title="Hard Mode"
            meta="Year range randomized each round"
            last
          />
        </div>
      )}

      <button onClick={handleStart} disabled={!canStart} className="btn btn-primary" style={styles.startBtn}>
        {startLabel}
      </button>
    </div>
  )
}

function ModeRow({
  selected, onClick, title, meta, last, children,
}: {
  selected: boolean
  onClick: () => void
  title: string
  meta: string
  last?: boolean
  children?: React.ReactNode
}) {
  return (
    <div>
      <div
        className="list-row"
        onClick={onClick}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.75rem',
          padding: '14px 12px',
          borderBottom: last ? 'none' : `1px solid ${COLORS.border}`,
          cursor: 'pointer',
          borderLeft: `2px solid ${selected ? COLORS.green : 'transparent'}`,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: selected ? COLORS.text : COLORS.textDim }}>
          {title}
        </span>
        <span style={{ fontSize: '0.75rem', color: COLORS.textMuted, textAlign: 'right' }}>{meta}</span>
      </div>
      {children}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '2.25rem 1.5rem 3rem',
  },
  logo: {
    height: 130,
    width: 130,
    objectFit: 'contain',
    marginBottom: '0.4rem',
  },
  tagline: {
    fontSize: '0.8rem',
    color: COLORS.textDim,
    marginBottom: '2.25rem',
    textAlign: 'center',
  },
  howToPlayBtn: {
    position: 'fixed',
    top: '0.75rem',
    right: '0.75rem',
    zIndex: 100,
    fontSize: '0.75rem',
    padding: '0.35rem 0.75rem',
  },
  section: {
    width: '100%',
    maxWidth: '480px',
    marginBottom: '0.5rem',
  },
  rangeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0 12px 14px',
    flexWrap: 'wrap',
  },
  rangeLabel: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: COLORS.textDim },
  yearInput: {
    width: '5rem',
    padding: '0.3rem 0.4rem',
    borderRadius: '4px',
    border: `1px solid ${COLORS.border}`,
    background: COLORS.fieldBg,
    color: COLORS.text,
    fontSize: '0.85rem',
  },
  inputErr: { borderColor: COLORS.error },
  errText: { color: COLORS.error, fontSize: '0.75rem' },
  startBtn: {
    width: '100%',
    maxWidth: '480px',
    padding: '15px',
    fontSize: '0.95rem',
    marginTop: '1.75rem',
  },
}
