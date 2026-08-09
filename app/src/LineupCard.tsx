import type { LineupSlot } from './types'
import { COLORS, accentColor } from './theme'

// Position of each of the first 8 lineup-template slots (C,1B,2B,3B,SS,OF,OF,OF)
// on the diamond field, as percentages of the field's 250x230 box.
const FIELD_POS: { left: string; top: string }[] = [
  { left: '50%', top: '88%' }, // C
  { left: '82%', top: '50%' }, // 1B
  { left: '70%', top: '30%' }, // 2B
  { left: '18%', top: '50%' }, // 3B
  { left: '30%', top: '30%' }, // SS
  { left: '15%', top: '10%' }, // OF
  { left: '50%', top: '7%' },  // OF
  { left: '85%', top: '10%' }, // OF
]

interface Props {
  playerName?: string
  lineup: LineupSlot[]
  totalWar: number
  isActive?: boolean    // pulse open slots when it's this player's turn
  accent?: 'green' | 'red'
  capBar?: boolean       // small header cap above the field (Done/Result screens)
  showTotal?: boolean    // total-WAR number below the pitchers list (default true)
}

export default function LineupCard({ playerName, lineup, totalWar, isActive, accent = 'green', capBar, showTotal = true }: Props) {
  const color = accentColor(accent)
  const fieldSlots = lineup.slice(0, 8)
  const pitchers = lineup.slice(8, 11)

  return (
    <div>
      {playerName && (
        <div style={{ fontSize: 12, fontWeight: 600, color, textAlign: 'center', marginBottom: 10 }}>
          {playerName}
        </div>
      )}

      {capBar && <div className="field-cap" />}
      <div className="field" style={capBar ? { borderRadius: '0 0 8px 8px' } : undefined}>
        <div className="field-diamond" />
        {fieldSlots.map((slot, i) => {
          const pos = FIELD_POS[i]
          const filled = slot.pick !== null
          return (
            <div
              key={i}
              className={filled || !isActive ? 'slot' : 'slot active'}
              style={{ left: pos.left, top: pos.top }}
            >
              {filled ? (
                <>
                  <div className="tag">{slot.pos}</div>
                  <div className="nm">{slot.pick!.name}</div>
                  <div className="wv num" style={{ color }}>{slot.pick!.war.toFixed(1)}</div>
                </>
              ) : (
                <>
                  <div className="dot" />
                  <div className="tag">{slot.pos}</div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="pitchers">
        <div className="plabel">PITCHERS</div>
        {pitchers.map((slot, i) => (
          <div key={i} className="prow">
            <span style={{ color: slot.pick ? COLORS.text : COLORS.textMuted }}>
              {slot.pick ? slot.pick.name : '—'}
            </span>
            <span className="num" style={{ color: slot.pick ? color : COLORS.textMuted, fontWeight: 700 }}>
              {slot.pick ? slot.pick.war.toFixed(1) : '—'}
            </span>
          </div>
        ))}
      </div>

      {showTotal && (
        <div className="display num" style={{ textAlign: 'center', fontSize: 26, color, marginTop: 10 }}>
          {totalWar.toFixed(1)}
        </div>
      )}
    </div>
  )
}
