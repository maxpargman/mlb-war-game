import { useState } from 'react'
import { yearBounds } from './data'
import type { GameSettings, TimeRangeMode } from './types'
import { todayString, type DailyMode } from './daily'
import { getDailyStatus, type DailyStatus } from './dailyStorage'
import InstructionsModal from './InstructionsModal'
import { COLORS } from './theme'
import warRoomLogo from './assets/war-room-logo.png'

const INSTRUCTIONS_SEEN_KEY = 'mlbwar_instructions_seen'

type TopMode = 'daily' | '2player'

interface Props {
  onStart: (settings: GameSettings) => void
  onDaily: (mode: DailyMode) => void
}

function statusText(status: DailyStatus, fallback: string): string {
  if (status.kind === 'in_progress') return 'In progress — tap to resume'
  if (status.kind === 'done') return `Completed — ${status.score.toFixed(1)} WAR`
  return fallback
}

export default function SetupScreen({ onStart, onDaily }: Props) {
  const { min, max: dataMax } = yearBounds()
  const max = Math.min(dataMax, new Date().getFullYear() - 1)

  const [topMode, setTopMode] = useState<TopMode>('daily')
  const [dailyDifficulty, setDailyDifficulty] = useState<DailyMode>('easy')
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

  const selectedDailyStatus = topMode === 'daily' ? dailyStatus[dailyDifficulty] : null
  const startLabel = selectedDailyStatus?.kind === 'in_progress'
    ? 'Resume Daily Challenge'
    : selectedDailyStatus?.kind === 'done'
      ? 'View Results'
      : topMode === '2player' ? 'Start Draft' : 'Start Daily Challenge'

  function handleStart() {
    if (topMode === 'daily') { onDaily(dailyDifficulty); return }
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

      {/* Top-level mode toggle: Daily (default) | 2-Player */}
      <div style={styles.toggle}>
        <button
          onClick={() => setTopMode('daily')}
          style={{ ...styles.toggleBtn, ...(topMode === 'daily' ? styles.toggleBtnActive : {}) }}
        >
          Daily
        </button>
        <button
          onClick={() => setTopMode('2player')}
          style={{ ...styles.toggleBtn, ...styles.toggleBtnRight, ...(topMode === '2player' ? styles.toggleBtnActive : {}) }}
        >
          2-Player
        </button>
      </div>

      {topMode === 'daily' ? (
        <div style={styles.section}>
          <ModeRow
            selected={dailyDifficulty === 'easy'}
            onClick={() => setDailyDifficulty('easy')}
            title="Easy"
            meta={statusText(dailyStatus.easy, 'All time')}
          />
          <ModeRow
            selected={dailyDifficulty === 'medium'}
            onClick={() => setDailyDifficulty('medium')}
            title="Medium"
            meta={statusText(dailyStatus.medium, 'Post-1970, 10-yr window')}
          />
          <ModeRow
            selected={dailyDifficulty === 'hard'}
            onClick={() => setDailyDifficulty('hard')}
            title="Hard"
            meta={statusText(dailyStatus.hard, 'Post-1970, 5-yr window')}
            last
          />
        </div>
      ) : (
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
  toggle: {
    width: '100%',
    maxWidth: '480px',
    display: 'flex',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '1.5rem',
  },
  toggleBtn: {
    flex: 1,
    padding: '14px',
    fontSize: '0.95rem',
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    background: 'transparent',
    color: COLORS.textDim,
    border: 'none',
    cursor: 'pointer',
    textAlign: 'center',
  },
  toggleBtnRight: {
    borderLeft: `1px solid ${COLORS.border}`,
  },
  toggleBtnActive: {
    background: COLORS.green,
    color: COLORS.bg,
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
