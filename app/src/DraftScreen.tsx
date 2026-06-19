import { useState, useEffect } from 'react'
import './layout.css'
import { franchises } from './data'
import { initGame, autoPickBest, applyPick, hasDraftablePlayer } from './engine'
import type { GameSettings, GameState, DraftPick } from './types'
import LineupCard from './LineupCard'
import PickPanel from './PickPanel'

interface Props {
  settings: GameSettings
  onEnd: (state: GameState) => void
}

const PLAYER_NAMES = ['Player 1', 'Player 2']

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

  useEffect(() => {
    if (state.phase === 'done') onEnd(state)
  }, [state.phase])

  const { round, turn } = state
  if (state.phase === 'done') return null
  const franchise = state.roundFranchises[round]
  const { yearLo, yearHi } = state.roundRanges[round]
  function handlePick(pick: DraftPick, slotIndex: number) {
    setState(s => resolveState(applyPick(s, pick, slotIndex)))
  }

  function handleAutoPick() {
    const result = autoPickBest(state)
    if (!result) return
    handlePick(result.pick, result.slotIndex)
  }

  const totals = state.lineups.map(l => l.reduce((sum, sl) => sum + (sl.pick?.war ?? 0), 0))

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div className="top-bar">
        <span className="top-bar-left" style={styles.roundLabel}>Round {round + 1} / 11</span>
        <div className="top-bar-center" style={styles.franchiseChip}>
          <span style={styles.franchiseName}>{franchise.fn}</span>
          <span style={styles.yearRange}>{yearLo === yearHi ? yearLo : `${yearLo}–${yearHi}`}</span>
        </div>
        <span className="top-bar-right" style={styles.turnLabel}>{PLAYER_NAMES[turn]}'s pick</span>
      </div>

      {/* Pick panel */}
      <PickPanel state={state} onPick={handlePick} />

      {/* Auto-pick fallback */}
      <button onClick={handleAutoPick} style={styles.autoBtn}>
        Auto-pick
      </button>

      {/* Side-by-side lineup cards */}
      <div className="lineup-row">
        {state.lineups.map((lineup, pi) => (
          <LineupCard
            key={pi}
            playerName={PLAYER_NAMES[pi]}
            lineup={lineup}
            totalWar={totals[pi]}
            isActive={turn === pi}
          />
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f1f5f9',
    fontFamily: 'system-ui, sans-serif',
    padding: '1.25rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
  },
  roundLabel: { color: '#64748b', fontSize: '0.85rem' },
  franchiseChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.1rem',
  },
  franchiseName: { fontWeight: 800, fontSize: '1.4rem' },
  yearRange: { color: '#94a3b8', fontSize: '0.8rem' },
  turnLabel: { fontWeight: 600, fontSize: '0.95rem', color: '#93c5fd' },
  autoBtn: {
    alignSelf: 'flex-end',
    padding: '0.35rem 0.9rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    borderRadius: '6px',
    border: '1px solid #334155',
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
  },
}
