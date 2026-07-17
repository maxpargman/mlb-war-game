import { useState, useEffect, useMemo } from 'react'
import { franchises } from './data'
import { hasDraftablePlayer } from './engine'
import { emptyLineup } from './types'
import { generateDailySchedule, generateSkipBackups, todayString, type DailyRound, type DailyMode } from './daily'
import type { GameState, DraftPick, LineupSlot } from './types'
import LineupCard from './LineupCard'
import PickPanel from './PickPanel'
import { useSessionTracking } from './useSessionTracking'
import { loadDailyState, saveDailyState } from './dailyStorage'

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
    skipUsed: false,
  }
}

// Replaces the current round's franchise + year window with the
// pre-generated deterministic backup for that round index -- derived from
// the ORIGINAL primary schedule (not live state), so it's identical for
// every player who skips round N on this (date, mode), regardless of any
// dead-end reroll that may have already touched other rounds.
function applySkip(state: GameState, backups: DailyRound[]): GameState {
  if (state.skipUsed || state.phase !== 'draft') return state
  const backup = backups[state.round]
  if (!backup) return state
  const roundFranchises = [...state.roundFranchises]
  roundFranchises[state.round] = { fid: backup.fid, fn: backup.fn }
  const roundRanges = [...state.roundRanges]
  roundRanges[state.round] = { yearLo: backup.yearLo, yearHi: backup.yearHi }
  return { ...state, roundFranchises, roundRanges, skipUsed: true }
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

  // Skip (5.3, Medium/Hard only): a deterministic backup per round index,
  // derived from the primary schedule -- pure function of (date, mode), so
  // it's identical whether starting fresh or resuming, and unaffected by
  // any skip/reroll already applied to live state.
  const backups = useMemo(() => {
    if (mode === 'easy') return []
    const date = todayString()
    return generateSkipBackups(date, mode, generateDailySchedule(date, mode))
  }, [mode])

  // Lock-on-start with resume: a stored state for today's (date, mode) is
  // resumed as-is (already fully resolved -- no need to re-run resolveState,
  // which would risk a redundant reroll). No stored state starts fresh.
  useEffect(() => {
    const date = todayString()
    const stored = loadDailyState(date, mode)
    if (stored) { setState(stored); return }
    const rounds = generateDailySchedule(date, mode)
    setState(resolveState(buildDailyState(rounds)))
  }, [mode])

  // Persist after every change (including the final 'done' state) so a
  // reload always resumes -- or, once finished, redisplays the result
  // instead of starting a new game. Declared before the onDone effect below
  // so a completed game is saved before this screen unmounts.
  useEffect(() => {
    if (state) saveDailyState(todayString(), mode, state)
  }, [state, mode])

  useEffect(() => {
    if (state?.phase === 'done') {
      const lineup = state.lineups[0]
      const score = lineup.reduce((sum, sl) => sum + (sl.pick?.war ?? 0), 0)
      onDone(score, lineup)
    }
  }, [state?.phase])

  // Slice 4.2: logs this session (create on first pick, update per pick,
  // complete on finish) independent of the optional named leaderboard
  // submission, which only happens later in LeaderboardScreen.
  useSessionTracking('daily', mode, todayString(), state ? [state.lineups[0]] : [], state?.phase ?? 'draft')

  if (!state || state.phase === 'done') return null

  const { round } = state
  const franchise = state.roundFranchises[round]
  const { yearLo, yearHi } = state.roundRanges[round]
  const totalWar = state.lineups[0].reduce((sum, sl) => sum + (sl.pick?.war ?? 0), 0)

  function handlePick(pick: DraftPick, slotIndex: number) {
    setState(s => s ? resolveState(advanceSinglePlayer(s, pick, slotIndex)) : s)
  }

  function handleSkip() {
    setState(s => s ? resolveState(applySkip(s, backups)) : s)
  }

  const canSkip = mode !== 'easy' && !state.skipUsed

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
        <div className="top-bar-right" style={styles.rightGroup}>
          <span style={styles.meta}>
            {mode.charAt(0).toUpperCase() + mode.slice(1)} · {todayString()}
          </span>
          {mode !== 'easy' && (
            <button
              onClick={handleSkip}
              disabled={!canSkip}
              style={{ ...styles.skipBtn, ...(canSkip ? {} : styles.skipBtnDisabled) }}
            >
              {state.skipUsed ? 'Skip used' : '⟳ Skip franchise'}
            </button>
          )}
        </div>
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
  rightGroup: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  skipBtn: {
    padding: '0.3rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    borderRadius: '6px',
    border: '1px solid #334155',
    background: 'transparent',
    color: '#93c5fd',
    cursor: 'pointer',
  },
  skipBtnDisabled: { color: '#475569', cursor: 'default' },
}
