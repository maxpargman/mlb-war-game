import { useState, useEffect, useMemo } from 'react'
import { hasDraftablePlayer } from './engine'
import { emptyLineup } from './types'
import { generateDailySchedule, generateSkipBackups, generateRerollPool, todayString, DAILY_MODE_LABEL, type DailyRound, type DailyMode } from './daily'
import type { GameState, DraftPick, LineupSlot } from './types'
import LineupCard from './LineupCard'
import PickPanel from './PickPanel'
import { useSessionTracking } from './useSessionTracking'
import { loadDailyState, saveDailyState } from './dailyStorage'
import { COLORS } from './theme'

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
    rerollIndex: 0,
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

// Bugfix (post-5.3): deterministic dead-end substitution -- consumes the
// next entry from the precomputed reroll pool (see generateRerollPool in
// daily.ts), instead of the old Math.random() pick the server could never
// validate. Replaces both the franchise AND its year window (the pool
// entry carries its own, unlike the old behavior of keeping the original
// round's range), so hasDraftablePlayer checks the substitute's actual
// eligible window below.
function rerollFranchise(state: GameState, rerollPool: DailyRound[]): GameState {
  if (state.rerollIndex >= rerollPool.length) return state
  const replacement = rerollPool[state.rerollIndex]
  const roundFranchises = [...state.roundFranchises]
  roundFranchises[state.round] = { fid: replacement.fid, fn: replacement.fn }
  const roundRanges = [...state.roundRanges]
  roundRanges[state.round] = { yearLo: replacement.yearLo, yearHi: replacement.yearHi }
  return { ...state, roundFranchises, roundRanges, rerollIndex: state.rerollIndex + 1 }
}

function resolveState(state: GameState, rerollPool: DailyRound[]): GameState {
  if (state.phase === 'done') return state
  let s = state
  let attempts = 0
  while (!hasDraftablePlayer(s, s.roundFranchises[s.round].fid) && attempts < 30) {
    const next = rerollFranchise(s, rerollPool)
    if (next === s) break // pool exhausted -- give up rather than loop forever
    s = next
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

  // Pure function of (date, mode) -- identical whether starting fresh or
  // resuming, and stable across re-renders via useMemo.
  const schedule = useMemo(() => generateDailySchedule(todayString(), mode), [mode])

  // Skip (5.3, Medium/Hard only): a deterministic backup per round index,
  // derived from the primary schedule -- unaffected by any skip/reroll
  // already applied to live state.
  const backups = useMemo(() => {
    if (mode === 'easy') return []
    return generateSkipBackups(todayString(), mode, schedule)
  }, [mode, schedule])

  // Deterministic dead-end reroll pool (bugfix, post-5.3 -- see
  // generateRerollPool in daily.ts). Computed for every mode: a dead end
  // can happen even in Easy, just rarely, given its full year range.
  const rerollPool = useMemo(
    () => generateRerollPool(todayString(), mode, schedule, backups),
    [mode, schedule, backups],
  )

  // Lock-on-start with resume: a stored state for today's (date, mode) is
  // resumed as-is (already fully resolved -- no need to re-run resolveState,
  // which would risk a redundant reroll). No stored state starts fresh.
  useEffect(() => {
    const date = todayString()
    const stored = loadDailyState(date, mode)
    if (stored) { setState(stored); return }
    setState(resolveState(buildDailyState(schedule), rerollPool))
  }, [mode, schedule, rerollPool])

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
    setState(s => s ? resolveState(advanceSinglePlayer(s, pick, slotIndex), rerollPool) : s)
  }

  function handleSkip() {
    setState(s => s ? resolveState(applySkip(s, backups), rerollPool) : s)
  }

  const canSkip = mode !== 'easy' && !state.skipUsed

  // Adapt state for PickPanel (which reads state.turn and state.lineups[turn])
  const panelState = { ...state, turn: 0 as const }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span className="num" style={styles.meta}>ROUND {round + 1} / 11</span>
          <span className="display" style={styles.franchiseName}>{franchise.fn}</span>
          <span style={styles.yearRange}>
            {yearLo === yearHi ? yearLo : `${yearLo}–${yearHi}`}
          </span>
          <span className="num" style={styles.meta}>
            {DAILY_MODE_LABEL[mode]} · {todayString()}
          </span>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.scoreBlock}>
            <span className="display num" style={styles.scoreValue}>{totalWar.toFixed(1)}</span>
            <span style={styles.scoreUnit}>WAR</span>
          </div>
          {mode !== 'easy' && (
            <button
              onClick={handleSkip}
              disabled={!canSkip}
              className="btn btn-secondary"
              style={styles.skipBtn}
            >
              {state.skipUsed ? 'Skip used' : '⟳ Skip franchise'}
            </button>
          )}
        </div>
      </div>

      <div style={styles.poolWrap}>
        <PickPanel state={panelState} onPick={handlePick} />
      </div>

      <LineupCard
        lineup={state.lineups[0]}
        totalWar={totalWar}
        isActive
        showTotal={false}
      />
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
  header: {
    width: '100%',
    maxWidth: '480px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  headerLeft: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' },
  // marginRight pulls the score in from the header's right edge by a fixed
  // amount -- keyed off the header's own width (not headerLeft's, which
  // varies with the franchise name length) so its position doesn't drift
  // round to round.
  headerRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', marginTop: '1.5rem', marginRight: '5rem' },
  meta: { color: COLORS.textMuted, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' },
  franchiseName: { fontSize: '1.9rem', color: COLORS.text, lineHeight: 1, marginTop: '0.1rem' },
  yearRange: { color: COLORS.textMuted, fontSize: '0.75rem', marginBottom: '0.1rem' },
  scoreBlock: { display: 'flex', alignItems: 'baseline', gap: '0.4rem' },
  scoreValue: { fontSize: '3.5rem', color: COLORS.green, lineHeight: 1 },
  scoreUnit: { fontSize: '0.85rem', color: COLORS.textDim, fontFamily: "'Inter', sans-serif" },
  poolWrap: { width: '100%', maxWidth: '440px' },
  skipBtn: {
    padding: '0.3rem 0.75rem',
    fontSize: '0.7rem',
  },
}
