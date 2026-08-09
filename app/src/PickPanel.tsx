import { useState, useMemo, useRef, type CSSProperties } from 'react'
import './layout.css'
import type { PlayerVersion } from './data'
import { eligiblePlayers, stintYears, formatYearRanges } from './data'
import { openSlotsFor } from './engine'
import type { GameState, DraftPick, LineupSlot } from './types'
import { COLORS } from './theme'

interface Props {
  state: GameState
  onPick: (pick: DraftPick, slotIndex: number) => void
}

// Case-fold, strip accents/diacritics, and drop apostrophes/periods so search
// matches regardless of how the user types a name (e.g. "pena" finds "Peña",
// "oday" finds "O'Day").
function normalize(s: string): string {
  const COMBINING_MARK_LO = 0x0300
  const COMBINING_MARK_HI = 0x036f
  const stripped = Array.from(s.normalize('NFD'))
    .filter(ch => {
      const code = ch.codePointAt(0) ?? 0
      return code < COMBINING_MARK_LO || code > COMBINING_MARK_HI
    })
    .join('')
  return stripped.replace(/['’.]/g, '').toLowerCase()
}

export default function PickPanel({ state, onPick }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { fid, fn } = state.roundFranchises[state.round]
  const { yearLo, yearHi } = state.roundRanges[state.round]
  const lineup: LineupSlot[] = state.lineups[state.turn]

  // Every player-version for this franchise + range, regardless of whether
  // they're currently pickable -- search needs the full pool so a player
  // whose position is full (or who's already drafted) still shows up,
  // grayed out, instead of silently vanishing from results.
  const allEligible = useMemo(() => eligiblePlayers(fid, yearLo, yearHi), [fid, yearLo, yearHi])

  // Subset that fits an open slot right now -- what's actually clickable.
  const available = useMemo(() => {
    return allEligible.filter(
      p => !state.takenPlayerIds.has(p.id) && openSlotsFor(lineup, p.pos).length > 0
    )
  }, [allEligible, state.takenPlayerIds, lineup])

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    const result = q ? allEligible.filter(p => normalize(p.name).includes(q)) : available
    const lastName = (name: string) => name.slice(name.lastIndexOf(' ') + 1)
    return [...result].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))
  }, [allEligible, available, query])

  // Why a listed player can't be picked right now, or null if they can.
  function unavailableReason(p: PlayerVersion): string | null {
    if (state.takenPlayerIds.has(p.id)) return 'Already drafted'
    if (openSlotsFor(lineup, p.pos).length === 0) return 'Position full'
    return null
  }

  function handlePick(p: PlayerVersion) {
    const slots = openSlotsFor(lineup, p.pos)
    if (slots.length === 0 || state.takenPlayerIds.has(p.id)) return
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
    const pick: DraftPick = {
      playerId: p.id,
      name: p.name,
      pos: p.pos,
      war: p.bestWar,
      year: p.bestYear,
      fid,
      fn,
    }
    onPick(pick, slots[0])
  }

  const yearLabel = yearLo === yearHi ? yearLo : `${yearLo}–${yearHi}`

  return (
    <div className="pick-panel-wrap">
      <input
        type="search"
        ref={inputRef}
        placeholder={`Search ${yearLabel} ${fn} seasons…`}
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="line-input"
        autoFocus
      />
      {query.trim() && filtered.length > 0 && (
        <div className="pick-results">
          <ul className="pick-list">
            {filtered.map(p => (
              <PlayerRow
                key={`${p.id}|${p.pos}`}
                player={p}
                years={formatYearRanges(stintYears(p.id, p.pos, fid, yearLo, yearHi))}
                unavailableReason={unavailableReason(p)}
                onPick={handlePick}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PlayerRow({
  player: p,
  years,
  unavailableReason,
  onPick,
}: {
  player: PlayerVersion
  years: string
  unavailableReason: string | null
  onPick: (p: PlayerVersion) => void
}) {
  const unavailable = unavailableReason !== null
  const rowStyle: CSSProperties = { ...styles.row, ...(unavailable ? styles.rowDisabled : {}) }
  return (
    <li
      className={unavailable ? 'player-row player-row-disabled' : 'player-row'}
      style={rowStyle}
      onClick={unavailable ? undefined : () => onPick(p)}
      aria-disabled={unavailable}
    >
      <span style={{ ...styles.pos, ...(unavailable ? styles.posDisabled : {}) }}>{p.pos}</span>
      <span style={{ ...styles.name, ...(unavailable ? styles.nameDisabled : {}) }}>{p.name}</span>
      <span style={styles.years}>{unavailable ? unavailableReason : years}</span>
    </li>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    padding: '0.5rem 0.25rem',
    cursor: 'pointer',
  },
  rowDisabled: {
    cursor: 'default',
  },
  pos: {
    color: COLORS.textMuted,
    fontWeight: 700,
    fontSize: '0.65rem',
    letterSpacing: '0.05em',
    width: '2rem',
    flexShrink: 0,
  },
  posDisabled: {
    color: '#454138',
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: COLORS.text,
    fontWeight: 600,
    fontSize: '0.9rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameDisabled: {
    color: COLORS.textMuted,
  },
  years: {
    flexShrink: 0,
    color: COLORS.textMuted,
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
  },
}
