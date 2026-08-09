import { useState, useEffect } from 'react'
import { fetchLeaderboard, submitScore, type DailyScore } from './supabase'
import { todayString, DAILY_MODE_LABEL, type DailyMode } from './daily'
import type { LineupSlot } from './types'
import LineupCard from './LineupCard'
import { COLORS } from './theme'

interface Props {
  mode: DailyMode
  score: number
  lineup: LineupSlot[]
  onPlayAgain: () => void
}

function buildShareText(date: string, mode: DailyMode, score: number): string {
  const header = `⚾ The WAR Room — Daily ${DAILY_MODE_LABEL[mode]}`
  const dateStr = `📅 ${date}`
  const scoreStr = `🏆 ${score.toFixed(1)} WAR`
  const link = 'https://mlb-war-draft.vercel.app/'
  return [header, dateStr, scoreStr, '', link].join('\n')
}

export default function LeaderboardScreen({ mode, score, lineup, onPlayAgain }: Props) {
  const [username, setUsername] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [board, setBoard] = useState<DailyScore[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const date = todayString()

  useEffect(() => {
    fetchLeaderboard(date, mode)
      .then(setBoard)
      .catch(() => setBoard([]))
      .finally(() => setLoading(false))
  }, [submitted])

  async function handleSubmit() {
    if (!username.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await submitScore({
        date,
        username: username.trim(),
        mode,
        score,
        lineup: lineup as object,
      })
      setSubmitted(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleShare() {
    const text = buildShareText(date, mode, score)
    const nav = navigator as Navigator & { share?: (d: object) => Promise<void> }
    if (nav.share) {
      await nav.share({ text })
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={styles.page}>
      <div className="num" style={styles.meta}>
        DAILY · {DAILY_MODE_LABEL[mode].toUpperCase()} · {date}
      </div>
      <div className="display num" style={styles.scoreValue}>
        {score.toFixed(1)} <span style={styles.scoreUnit}>WAR</span>
      </div>

      <LineupCard playerName="Your Lineup" lineup={lineup} totalWar={score} accent="green" />

      <div style={styles.btnRow}>
        <button onClick={handleShare} className="btn btn-primary" style={styles.flexBtn}>
          {copied ? 'Copied!' : 'share' in navigator ? 'Share Score' : 'Copy Score'}
        </button>
        <button onClick={onPlayAgain} className="btn btn-secondary" style={styles.flexBtn}>
          Play Again
        </button>
      </div>

      {!submitted ? (
        <div style={styles.submitBox}>
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            maxLength={30}
            className="line-input"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !username.trim()}
            className="btn btn-primary"
          >
            {submitting ? 'Submitting…' : 'Submit to Leaderboard'}
          </button>
          {error && <span style={styles.error}>{error}</span>}
        </div>
      ) : (
        <div style={{ color: COLORS.green, fontWeight: 600, fontSize: '0.9rem' }}>Score submitted!</div>
      )}

      <div style={styles.board}>
        <div style={styles.boardTitle}>Today's Leaderboard</div>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : board.length === 0 ? (
          <div style={styles.empty}>No scores yet — be the first!</div>
        ) : (
          board.map((entry, i) => (
            <div
              key={i}
              style={{ ...styles.row, ...(entry.username === username && submitted ? { color: COLORS.green } : {}) }}
            >
              <span style={styles.rowLeft}>
                <span className="num" style={styles.rank}>{i + 1}</span>
                <span style={{ fontWeight: entry.username === username && submitted ? 700 : 600 }}>{entry.username}</span>
              </span>
              <span className="num" style={{ fontWeight: 700, color: entry.username === username && submitted ? COLORS.green : COLORS.textDim }}>
                {Number(entry.score).toFixed(1)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '1.5rem 1.5rem 3rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
  },
  meta: { color: COLORS.textMuted, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' },
  scoreValue: { fontSize: '3.25rem', color: COLORS.green, lineHeight: 1, marginTop: '0.2rem' },
  scoreUnit: {
    fontSize: '1rem', color: COLORS.textDim, fontFamily: "'Inter', sans-serif",
    fontWeight: 500, textTransform: 'none', letterSpacing: 'normal',
  },
  btnRow: { display: 'flex', gap: '0.6rem', width: '100%', maxWidth: '400px' },
  flexBtn: { flex: 1 },
  submitBox: {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  error: { color: COLORS.error, fontSize: '0.8rem' },
  board: {
    width: '100%',
    maxWidth: '400px',
    marginTop: '0.5rem',
  },
  boardTitle: { fontSize: '0.75rem', color: COLORS.textMuted, marginBottom: '0.4rem' },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: `1px solid ${COLORS.borderSubtle}`,
    fontSize: '0.9rem',
  },
  rowLeft: { display: 'flex', gap: '0.6rem' },
  rank: { color: COLORS.textMuted },
  empty: { color: COLORS.textMuted, fontSize: '0.85rem', padding: '0.5rem 0' },
}
