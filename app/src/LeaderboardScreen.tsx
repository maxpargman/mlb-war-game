import { useState, useEffect } from 'react'
import { fetchLeaderboard, submitScore, type DailyScore } from './supabase'
import { todayString, type DailyMode } from './daily'
import type { LineupSlot } from './types'
import LineupCard from './LineupCard'

interface Props {
  mode: DailyMode
  score: number
  lineup: LineupSlot[]
  onPlayAgain: () => void
}

const MODE_LABEL: Record<DailyMode, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const POS_EMOJI: Record<string, string> = {
  C: '🎯', '1B': '1️⃣', '2B': '2️⃣', '3B': '3️⃣', SS: '⚡', OF: '🌿', P: '⚾',
}

function buildShareText(date: string, mode: DailyMode, score: number, lineup: LineupSlot[]): string {
  const header = `⚾ MLB WAR Draft — Daily ${MODE_LABEL[mode]}`
  const dateStr = `📅 ${date}`
  const scoreStr = `🏆 ${score.toFixed(1)} WAR`
  const picks = lineup
    .filter(sl => sl.pick)
    .map(sl => `${POS_EMOJI[sl.pos] ?? '▪️'} ${sl.pick!.name} · ${sl.pick!.war.toFixed(1)}`)
    .join('\n')
  const link = 'https://mlb-war-draft.vercel.app/'
  return [header, dateStr, scoreStr, '', picks, '', link].join('\n')
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
    const text = buildShareText(date, mode, score, lineup)
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
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Daily Challenge</div>
          <div style={styles.sub}>{mode.charAt(0).toUpperCase() + mode.slice(1)} · {date}</div>
        </div>
        <div style={styles.scoreBox}>
          <div style={styles.scoreLabel}>Your score</div>
          <div style={styles.scoreValue}>{score.toFixed(1)} WAR</div>
          <button onClick={handleShare} style={styles.shareBtn}>
            {copied ? '✓ Copied!' : 'share' in navigator ? '↑ Share' : '⎘ Copy score'}
          </button>
        </div>
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
            style={styles.input}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !username.trim()}
            style={styles.submitBtn}
          >
            {submitting ? 'Submitting…' : 'Submit to Leaderboard'}
          </button>
          {error && <span style={styles.error}>{error}</span>}
        </div>
      ) : (
        <div style={{ color: '#34d399', fontWeight: 600 }}>Score submitted!</div>
      )}

      <div style={styles.board}>
        <div style={styles.boardTitle}>Today's Leaderboard</div>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : board.length === 0 ? (
          <div style={styles.empty}>No scores yet — be the first!</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Name</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>WAR</th>
              </tr>
            </thead>
            <tbody>
              {board.map((entry, i) => (
                <tr
                  key={i}
                  style={entry.username === username && submitted ? styles.myRow : styles.row}
                >
                  <td style={styles.td}>{i + 1}</td>
                  <td style={styles.td}>{entry.username}</td>
                  <td style={{ ...styles.td, textAlign: 'right', color: '#34d399', fontWeight: 700 }}>
                    {Number(entry.score).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ width: '100%', maxWidth: '500px' }}>
        <LineupCard
          playerName="Your Lineup"
          lineup={lineup}
          totalWar={score}
        />
      </div>

      <button onClick={onPlayAgain} style={styles.againBtn}>
        Play again
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f1f5f9',
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
  },
  header: {
    width: '100%',
    maxWidth: '500px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontWeight: 800, fontSize: '1.4rem' },
  sub: { color: '#64748b', fontSize: '0.85rem', marginTop: '0.2rem' },
  scoreBox: { textAlign: 'right' },
  scoreLabel: { color: '#64748b', fontSize: '0.8rem' },
  scoreValue: { fontWeight: 800, fontSize: '1.75rem', color: '#facc15' },
  shareBtn: {
    marginTop: '0.4rem',
    padding: '0.3rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  submitBox: {
    width: '100%',
    maxWidth: '500px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  input: {
    padding: '0.65rem 1rem',
    borderRadius: '8px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f1f5f9',
    fontSize: '1rem',
    outline: 'none',
  },
  submitBtn: {
    padding: '0.65rem',
    borderRadius: '8px',
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    fontWeight: 700,
    fontSize: '1rem',
    cursor: 'pointer',
  },
  error: { color: '#ef4444', fontSize: '0.85rem' },
  board: {
    width: '100%',
    maxWidth: '500px',
    background: '#1e293b',
    borderRadius: '12px',
    padding: '1rem',
  },
  boardTitle: {
    fontWeight: 700,
    fontSize: '0.75rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: '0.75rem',
  },
  empty: { color: '#64748b', fontSize: '0.85rem', padding: '0.5rem 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: {
    color: '#64748b',
    fontWeight: 600,
    fontSize: '0.75rem',
    textAlign: 'left',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #334155',
  },
  row: { borderBottom: '1px solid #0f172a' },
  myRow: { borderBottom: '1px solid #0f172a', background: '#1e3a5f' },
  td: { padding: '0.5rem 0.25rem' },
  againBtn: {
    padding: '0.5rem 1.5rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
}
