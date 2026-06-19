import type { LineupSlot } from './types'
import type { Pos } from './data'

// Display order for lineup slots
const DISPLAY_ORDER: Pos[] = ['1B', '2B', '3B', 'SS', 'C', 'OF', 'OF', 'OF', 'P', 'P', 'P']

interface Props {
  playerName: string
  lineup: LineupSlot[]
  totalWar: number
  isActive?: boolean   // highlight border when it's this player's turn
}

export default function LineupCard({ playerName, lineup, totalWar, isActive }: Props) {
  // Sort slots into display order, tracking original index (needed by parent for picks)
  // We sort a copy for display only — the original array order is preserved in state.
  const sorted = [...lineup]
    .map((slot, i) => ({ slot, origIndex: i }))
    .sort((a, b) => DISPLAY_ORDER.indexOf(a.slot.pos) - DISPLAY_ORDER.indexOf(b.slot.pos))

  // Group consecutive identical-position slots so we can show e.g. "OF" once with 3 rows
  return (
    <div style={{ ...styles.card, ...(isActive ? styles.cardActive : {}) }}>
      <div style={styles.cardHeader}>
        <span style={styles.playerName}>{playerName}</span>
        <span style={styles.war}>{totalWar.toFixed(1)} WAR</span>
      </div>

      <table style={styles.table}>
        <tbody>
          {sorted.map(({ slot, origIndex }) => (
            <tr key={origIndex} style={slot.pick ? styles.filledRow : styles.emptyRow}>
              <td style={styles.posCell}>{slot.pos}</td>
              <td style={styles.nameCell}>
                {slot.pick ? (
                  <>
                    <span style={styles.pickedName}>{slot.pick.name}</span>
                    <span style={styles.pickedMeta}>
                      {slot.pick.fn} · {slot.pick.year} · {slot.pick.war.toFixed(1)} WAR
                    </span>
                  </>
                ) : (
                  <span style={styles.emptySlot}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#1e293b',
    borderRadius: '12px',
    padding: '1rem',
    flex: '1 1 0',
    minWidth: '220px',
    border: '2px solid transparent',
    transition: 'border-color 0.15s',
  },
  cardActive: {
    borderColor: '#3b82f6',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '0.75rem',
  },
  playerName: {
    fontWeight: 700,
    fontSize: '1rem',
  },
  war: {
    color: '#94a3b8',
    fontSize: '0.85rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.82rem',
  },
  filledRow: {
    borderBottom: '1px solid #0f172a',
  },
  emptyRow: {
    borderBottom: '1px solid #0f172a',
    opacity: 0.5,
  },
  posCell: {
    color: '#64748b',
    fontWeight: 700,
    fontSize: '0.7rem',
    letterSpacing: '0.05em',
    padding: '0.4rem 0.5rem 0.4rem 0',
    whiteSpace: 'nowrap',
    verticalAlign: 'top',
    width: '2.5rem',
  },
  nameCell: {
    padding: '0.35rem 0',
    verticalAlign: 'top',
  },
  pickedName: {
    display: 'block',
    color: '#f1f5f9',
    fontWeight: 600,
  },
  pickedMeta: {
    display: 'block',
    color: '#64748b',
    fontSize: '0.75rem',
    marginTop: '0.1rem',
  },
  emptySlot: {
    color: '#334155',
  },
}
