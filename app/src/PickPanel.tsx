import { useState, useMemo, useRef, type CSSProperties } from 'react'
import './layout.css'
import type { PlayerVersion } from './data'
import { eligiblePlayers, stintYears, formatYearRanges } from './data'
import { openSlotsFor } from './engine'
import type { GameState, DraftPick, LineupSlot } from './types'

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

  return (
    <div className="pick-panel-wrap">
      <div style={styles.panel}>
      <input
        type="search"
        ref={inputRef}
        placeholder="Search players…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={styles.search}
        autoFocus
      />

      </div>
      {query.trim() && filtered.length > 0 && (
        <div className="pick-results" style={styles.results}>
          <ul className="pick-list" style={styles.list}>
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
  panel: {
    width: '100%',
    maxWidth: '900px',
  },
  search: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.65rem 1rem',
    fontSize: '0.95rem',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#f1f5f9',
    outline: 'none',
  },
  results: {
    background: '#1e293b',
    borderRadius: '8px',
    border: '1px solid #334155',
    overflow: 'hidden',
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    borderBottom: '1px solid #0f172a',
    transition: 'background 0.1s',
  },
  rowDisabled: {
    cursor: 'default',
  },
  pos: {
    color: '#64748b',
    fontWeight: 700,
    fontSize: '0.7rem',
    letterSpacing: '0.05em',
    width: '2rem',
    flexShrink: 0,
  },
  posDisabled: {
    color: '#3f4c5f',
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: '#f1f5f9',
    fontWeight: 600,
    fontSize: '0.9rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameDisabled: {
    color: '#5b6577',
  },
  years: {
    flexShrink: 0,
    color: '#64748b',
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
  },
  war: {
    color: '#34d399',
    fontWeight: 700,
    fontSize: '0.85rem',
    width: '3rem',
    textAlign: 'right',
    flexShrink: 0,
  },
  year: {
    color: '#64748b',
    fontSize: '0.8rem',
    width: '2.5rem',
    textAlign: 'right',
    flexShrink: 0,
  },
  empty: {
    padding: '1rem',
    color: '#64748b',
    fontSize: '0.85rem',
    margin: 0,
  },
}
