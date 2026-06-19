import { useState, useMemo, type CSSProperties } from 'react'
import './layout.css'
import type { PlayerVersion } from './data'
import { eligiblePlayers } from './data'
import { openSlotsFor } from './engine'
import type { GameState, DraftPick, LineupSlot } from './types'

interface Props {
  state: GameState
  onPick: (pick: DraftPick, slotIndex: number) => void
}

export default function PickPanel({ state, onPick }: Props) {
  const [query, setQuery] = useState('')

  const { fid, fn } = state.roundFranchises[state.round]
  const { yearLo, yearHi } = state.roundRanges[state.round]
  const lineup: LineupSlot[] = state.lineups[state.turn]

  // All player-versions for this franchise + range, filtered to ones that fit an open slot
  const available = useMemo(() => {
    const all = eligiblePlayers(fid, yearLo, yearHi)
    return all.filter(
      p => !state.takenPlayerIds.has(p.id) && openSlotsFor(lineup, p.pos).length > 0
    )
  }, [fid, yearLo, yearHi, state.takenPlayerIds, lineup])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result = q ? available.filter(p => p.name.toLowerCase().includes(q)) : available
    const lastName = (name: string) => name.slice(name.lastIndexOf(' ') + 1)
    return [...result].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))
  }, [available, query])

  function handlePick(p: typeof available[0]) {
    const slots = openSlotsFor(lineup, p.pos)
    if (slots.length === 0) return
    setQuery('')
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
    <div style={styles.panel}>
      <input
        type="search"
        placeholder="Search players…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={styles.search}
        autoFocus
      />

      {available.length === 0 ? (
        <p style={styles.empty}>No eligible players — will reroll team.</p>
      ) : !query.trim() ? (
        <p style={styles.empty}>Start typing a name to search…</p>
      ) : filtered.length === 0 ? (
        <p style={styles.empty}>No players match "{query}"</p>
      ) : (
        <ul className="pick-list" style={styles.list}>
          {filtered.map(p => (
            <PlayerRow key={`${p.id}|${p.pos}`} player={p} onPick={handlePick} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PlayerRow({ player: p, onPick }: { player: PlayerVersion; onPick: (p: PlayerVersion) => void }) {
  const rowStyle: CSSProperties = styles.row
  return (
    <li
      className="player-row"
      style={rowStyle}
      onClick={() => onPick(p)}
    >
      <span style={styles.pos}>{p.pos}</span>
      <span style={styles.name}>{p.name}</span>
    </li>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: '100%',
    maxWidth: '900px',
    background: '#1e293b',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  search: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.65rem 1rem',
    fontSize: '0.95rem',
    background: '#0f172a',
    border: 'none',
    borderBottom: '1px solid #334155',
    color: '#f1f5f9',
    outline: 'none',
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    maxHeight: '280px',
    overflowY: 'auto',
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
  pos: {
    color: '#64748b',
    fontWeight: 700,
    fontSize: '0.7rem',
    letterSpacing: '0.05em',
    width: '2rem',
    flexShrink: 0,
  },
  name: {
    flex: 1,
    color: '#f1f5f9',
    fontWeight: 600,
    fontSize: '0.9rem',
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
