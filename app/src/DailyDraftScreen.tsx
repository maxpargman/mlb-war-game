import { useState, useEffect } from 'react'
import { franchises } from './data'
import { hasDraftablePlayer } from './engine'
import { emptyLineup } from './types'
import { generateDailySchedule, todayString, type DailyRound, type DailyMode } from './daily'
import type { GameState, DraftPick, LineupSlot } from './types'
import LineupCard from './LineupCard'
import PickPanel from './PickPanel'

interface Props {
  mode: DailyMode
  onDone: (score: number, lineup: LineupSlot[]) => void
}

function buildDailyState(rounds: DailyRound[]): GameState {
  return {
    settings: { mode: 'all', yearLo: 0, yearHi: 9999 },
    roundRanges: rounds.map(r => ({ yearLo: r.yearLo, yearHi: r.yearHi })),
    roundFranchises: rounds.map(r => ({ fid: r.fid, fn: r.fn })),
    lineups: [emptyLineup(), emptyLineup()],
    takenPlayerIds: new Set(),
    round: 0,
    turn: 0,
    phase: 'draft',
  }
}

function rerollFranchise(state: GameState): GameState {
  const used = new Set(state.roundFranchises.map(f => f.fid))
  const remaining = franchises().filter(f => !used.has(f.fid))
  if (remaining.length === 0) return state
  const replacement = remaining[Math.floor(Math.random() * remaining.length)]
  const next = [...state.roundFranchises]
  next[state.round] = replacement
  return { ...state, roundFranchises: next }
}

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

// Single-player: only uses lineups[0], turn is always 0
function advanceSinglePlayer(state: GameState, pick: DraftPick, slotIndex: number): GameState {
  const lineup0 = state.lineups[0].map(s => ({ ...s }))
  lineup0[slotIndex] = { pos: pick.pos, pick }

  const takenPlayerIds = new Set(state.takenPlayerIds)
  takenPlayerIds.add(pick.playerId)

  const round = state.round + 1
  if (round >= 11) {
    return { ...state, lineups: [lineup0, state.lineups[1]], takenPlayerIds, round, phase: 'done' }
  }
  return { ...state, lineups: [lineup0, state.lineups[1]], takenPlayerIds, round, phase: 'draft' }
}

export default function DailyDraftScreen({ mode, onDone }: Props) {
  const [state, setState] = useState<GameState | null>(null)

  useEffect(() => {
    const rounds = generateDailySchedule(todayString(), mode)
    setState(resolveState(buildDailyState(rounds)))
  }, [mode])

  useEffect(() => {
    if (state?.phase === 'done') {
      const lineup = state.lineups[0]
      const score = lineup.reduce((sum, sl) => sum + (sl.pick?.war ?? 0), 0)
      onDone(score, lineup)
    }
  }, [state?.phase])

  if (!state || state.phase === 'done') return null

  const { round } = state
  const franchise = state.roundFranchises[round]
  const { yearLo, yearHi } = state.roundRanges[round]
  const totalWar = state.lineups[0].reduce((sum, sl) => sum + (sl.pick?.war ?? 0), 0)

  function handlePick(pick: DraftPick, slotIndex: number) {
    setState(s => s ? resolveState(advanceSinglePlayer(s, pick, slotIndex)) : s)
  }

  // Adapt state for PickPanel (which reads state.turn and state.lineups[turn])
  const panelState = { ...state, turn: 0 as const }

  return (
    <div style={styles.page}>
      <div className="top-bar">
        <span className="top-bar-left" style={styles.meta}>
          Round {round + 1} / 11
        </span>
        <div className="top-bar-center" style={styles.franchiseChip}>
          <span style={styles.franchiseName}>{franchise.fn}</span>
          <span style={styles.yearRange}>
            {yearLo === yearHi ? yearLo : `${yearLo}–${yearHi}`}
          </span>
        </div>
        <span className="top-bar-right" style={styles.meta}>
          {mode.charAt(0).toUpperCase() + mode.slice(1)} · {todayString()}
        </span>
      </div>

      <PickPanel state={panelState} onPick={handlePick} />

      <div style={{ width: '100%', maxWidth: '900px' }}>
        <LineupCard
          playerName="Your Lineup"
          lineup={state.lineups[0]}
          totalWar={totalWar}
          isActive
        />
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
  meta: { color: '#64748b', fontSize: '0.85rem' },
  franchiseChip: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' },
  franchiseName: { fontWeight: 800, fontSize: '1.4rem' },
  yearRange: { color: '#94a3b8', fontSize: '0.8rem' },
}
