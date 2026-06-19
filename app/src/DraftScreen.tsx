import { useState } from 'react'
import { franchises } from './data'
import { initGame, autoPickBest, applyPick, hasDraftablePlayer } from './engine'
import { snakeOrder } from './types'
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

  if (state.phase === 'done') {
    onEnd(state)
    return null
  }

  const { round, turn } = state
  const franchise = state.roundFranchises[round]
  const { yearLo, yearHi } = state.roundRanges[round]
  const order = snakeOrder(round)
  const isFirstPick = order.indexOf(turn as 0 | 1) === 0

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
      <div style={styles.topBar}>
        <span style={styles.roundLabel}>Round {round + 1} / 11</span>
        <div style={styles.franchiseChip}>
          <span style={styles.franchiseName}>{franchise.fn}</span>
          <span style={styles.yearRange}>{yearLo === yearHi ? yearLo : `${yearLo}–${yearHi}`}</span>
        </div>
        <span style={styles.turnLabel}>{PLAYER_NAMES[turn]}'s pick{!isFirstPick ? ' (2nd)' : ''}</span>
      </div>

      {/* Pick panel */}
      <PickPanel state={state} onPick={handlePick} />

      {/* Auto-pick fallback */}
      <button onClick={handleAutoPick} style={styles.autoBtn}>
        Auto-pick
      </button>

      {/* Side-by-side lineup cards */}
      <div style={styles.lineupRow}>
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
  topBar: {
    width: '100%',
    maxWidth: '900px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
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
  lineupRow: {
    width: '100%',
    maxWidth: '900px',
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-start',
  },
}
