import { useState } from 'react'
import { yearBounds } from './data'
import type { GameSettings, TimeRangeMode } from './types'

interface Props {
  onStart: (settings: GameSettings) => void
}

export default function SetupScreen({ onStart }: Props) {
  const { min, max: dataMax } = yearBounds()
  // Cap at last completed season — current year's season may not be finished
  const max = Math.min(dataMax, new Date().getFullYear() - 1)

  const [mode, setMode] = useState<TimeRangeMode>('all')
  const [yearLo, setYearLo] = useState(2000)
  const [yearHi, setYearHi] = useState(max)

  function handleStart() {
    onStart({ mode, yearLo, yearHi })
  }

  const loErr = mode === 'custom' && yearLo > yearHi
  const rangeErr = mode === 'custom' && (yearLo < min || yearLo > max || yearHi < min || yearHi > max)
  const canStart = !loErr && !rangeErr

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>MLB WAR Draft</h1>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Time Range</h2>

        <label style={styles.radio}>
          <input type="radio" name="mode" value="all" checked={mode === 'all'} onChange={() => setMode('all')} />
          <span style={styles.radioTitle}>All Time</span>
          <span style={styles.desc}>Any season in franchise history</span>
        </label>

        <label style={styles.radio}>
          <input type="radio" name="mode" value="custom" checked={mode === 'custom'} onChange={() => setMode('custom')} />
          <span style={styles.radioTitle}>Custom Range</span>
          <span style={styles.desc}>Only seasons within a chosen window</span>
        </label>

        {mode === 'custom' && (
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
          <input type="radio" name="mode" value="hard" checked={mode === 'hard'} onChange={() => setMode('hard')} />
          <span style={styles.radioTitle}>Hard Mode</span>
          <span style={styles.desc}>Year range randomized each round</span>
        </label>
      </div>

      <button onClick={handleStart} disabled={!canStart} style={styles.startBtn}>
        Start Draft
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
  },
  title: {
    fontSize: '2rem',
    fontWeight: 800,
    marginBottom: '2rem',
    letterSpacing: '-0.5px',
  },
  card: {
    background: '#1e293b',
    borderRadius: '12px',
    padding: '1.5rem 2rem',
    width: '100%',
    maxWidth: '440px',
    marginBottom: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  cardTitle: {
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: '0.25rem',
  },
  radio: {
    display: 'grid',
    gridTemplateColumns: 'auto 7rem 1fr',
    alignItems: 'baseline',
    gap: '0 0.6rem',
    cursor: 'pointer',
    fontSize: '0.95rem',
    lineHeight: 1.6,
  },
  radioTitle: {
    fontWeight: 700,
  },
  desc: {
    color: '#94a3b8',
    fontWeight: 400,
    fontSize: '0.85rem',
  },
  rangeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginLeft: '1.5rem',
    flexWrap: 'wrap',
  },
  rangeLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.9rem',
  },
  yearInput: {
    width: '5rem',
    padding: '0.25rem 0.4rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: '0.9rem',
  },
  inputErr: {
    borderColor: '#ef4444',
  },
  errText: {
    color: '#ef4444',
    fontSize: '0.8rem',
  },
  startBtn: {
    padding: '0.75rem 2.5rem',
    fontSize: '1rem',
    fontWeight: 700,
    borderRadius: '8px',
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
    opacity: 1,
    transition: 'opacity 0.15s',
  },
}
