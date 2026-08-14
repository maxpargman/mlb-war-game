import { useState, useEffect } from 'react'
import './layout.css'
import { franchises } from './data'
import { initGame, applyPick, hasDraftablePlayer } from './engine'
import type { GameSettings, GameState, DraftPick } from './types'
import LineupCard from './LineupCard'
import PickPanel from './PickPanel'
import { useSessionTracking } from './useSessionTracking'
import { todayString } from './daily'
import { COLORS, accentColor } from './theme'

interface Props {
  settings: GameSettings
  onEnd: (state: GameState) => void
}

const PLAYER_NAMES = ['Player 1', 'Player 2']
const PLAYER_ACCENTS: ('green' | 'red')[] = ['green', 'red']

function rerollFranchise(state: GameState): GameState {
  const used = new Set(state.roundFranchises.map(f => f.fid))
  const remaining = franchises().filter(f => !used.has(f.fid))
  if (remaining.length === 0) return state
  const replacement = remaining[Math.floor(Math.random() * remaining.length)]
  const next = [...state.roundFranchises]
  next[state.round] = replacement
  return { ...state, roundFranchises: next }
}

// Advance through rerolls until there's at least one draftable player, or we run out of franchises.
function resolveState(state: GameState): GameState {
  if (state.phase === 'done') return state
  let s = state
  let attempts = 0
  while (!hasDraftablePlayer(s, s.roundFranchises[s.round].fid) && attempts < 30) {
    s = rerollFranchise(s)
    attempts++
  }
  return s
}

export default function DraftScreen({ settings, onEnd }: Props) {
  const [state, setState] = useState<GameState>(() => resolveState(initGame(settings)))
  // Which player's field is on screen -- independent of whose turn it is,
  // so picking doesn't yank the view out from under someone checking the
  // other lineup. Defaults to the active drafter on mount only.
  const [viewedPlayer, setViewedPlayer] = useState<0 | 1>(state.turn)

  useEffect(() => {
    if (state.phase === 'done') onEnd(state)
  }, [state.phase])

  // Slice 4.2: logs this session (create on first pick, update per pick,
  // complete on finish) -- hot-seat games are analytics only, no leaderboard.
  useSessionTracking('hotseat', settings.mode, todayString(), state.lineups, state.phase)

  const { round, turn } = state
  if (state.phase === 'done') return null
  const franchise = state.roundFranchises[round]
  const { yearLo, yearHi } = state.roundRanges[round]
  function handlePick(pick: DraftPick, slotIndex: number) {
    setState(s => resolveState(applyPick(s, pick, slotIndex)))
  }

  const totals = state.lineups.map(l => l.reduce((sum, sl) => sum + (sl.pick?.war ?? 0), 0))
  const turnColor = accentColor(PLAYER_ACCENTS[turn])

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div className="top-bar">
        <span className="top-bar-left num" style={styles.roundLabel}>ROUND {round + 1} / 11</span>
        <div className="top-bar-center" style={styles.franchiseChip}>
          <span className="display" style={styles.franchiseName}>{franchise.fn}</span>
          <span style={styles.yearRange}>{yearLo === yearHi ? yearLo : `${yearLo}–${yearHi}`}</span>
        </div>
        <div className="top-bar-right" style={styles.turnGroup}>
          <span style={{ ...styles.turnDot, background: turnColor }} />
          <span style={{ ...styles.turnLabel, color: turnColor }}>{PLAYER_NAMES[turn]} on the clock</span>
        </div>
      </div>

      {/* Only one field is shown at a time -- keeps the layout single-column
          like Daily mode instead of two lineups competing for space. */}
      <div style={styles.poolWrap}>
        <PickPanel state={state} onPick={handlePick} />
      </div>

      <div style={styles.fieldGroup}>
        {/* Tabs to pick which lineup is displayed -- click a name to switch. */}
        <div style={styles.scoreRow}>
          {PLAYER_NAMES.map((name, i) => (
            <button
              key={name}
              onClick={() => setViewedPlayer(i as 0 | 1)}
              className="num"
              style={{
                ...styles.scoreItem,
                color: accentColor(PLAYER_ACCENTS[i]),
                opacity: viewedPlayer === i ? 1 : 0.4,
                textDecoration: viewedPlayer === i ? 'underline' : 'none',
                textUnderlineOffset: '3px',
              }}
            >
              {name} {totals[i].toFixed(1)}
            </button>
          ))}
        </div>

        <LineupCard
          lineup={state.lineups[viewedPlayer]}
          totalWar={totals[viewedPlayer]}
          isActive={viewedPlayer === turn}
          accent={PLAYER_ACCENTS[viewedPlayer]}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '1.25rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
  },
  roundLabel: { color: COLORS.textMuted, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' },
  franchiseChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.1rem',
  },
  franchiseName: { fontSize: '1.9rem', color: COLORS.text, lineHeight: 1 },
  yearRange: { color: COLORS.textMuted, fontSize: '0.75rem' },
  turnGroup: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  turnDot: { width: 6, height: 6, borderRadius: '50%' },
  turnLabel: { fontWeight: 600, fontSize: '0.85rem' },
  poolWrap: { width: '100%', maxWidth: '440px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' },
  scoreRow: { display: 'flex', alignItems: 'center', gap: '0.8rem' },
  scoreItem: {
    fontWeight: 700,
    fontSize: '0.8rem',
    transition: 'opacity 0.2s',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
