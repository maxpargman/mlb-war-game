// Temporary probe screen for slice 2.1.
// Lets you pick a franchise + year range and lists eligible players.
// Will be replaced by real game UI in later slices.

import { useEffect, useState } from 'react'
import {
  loadData,
  franchises,
  eligiblePlayers,
  yearBounds,
  type PlayerVersion,
} from './data'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fid, setFid] = useState('PHI')
  const [yearLo, setYearLo] = useState(2000)
  const [yearHi, setYearHi] = useState(2025)
  const [players, setPlayers] = useState<PlayerVersion[]>([])

  useEffect(() => {
    loadData()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!ready) return
    setPlayers(eligiblePlayers(fid, yearLo, yearHi))
  }, [ready, fid, yearLo, yearHi])

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>
  if (!ready) return <p>Loading data…</p>

  const { min, max } = yearBounds()
  const franch = franchises()

  return (
    <div style={{ padding: '1rem', fontFamily: 'monospace' }}>
      <h1>MLB WAR Draft — data probe</h1>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label>
          Franchise{' '}
          <select value={fid} onChange={e => setFid(e.target.value)}>
            {franch.map(f => (
              <option key={f.fid} value={f.fid}>{f.fn}</option>
            ))}
          </select>
        </label>

        <label>
          Year from{' '}
          <input
            type="number" min={min} max={max} value={yearLo}
            onChange={e => setYearLo(Number(e.target.value))}
            style={{ width: '5rem' }}
          />
        </label>

        <label>
          to{' '}
          <input
            type="number" min={min} max={max} value={yearHi}
            onChange={e => setYearHi(Number(e.target.value))}
            style={{ width: '5rem' }}
          />
        </label>
      </div>

      <p>{players.length} eligible player-versions</p>

      <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            {['Name', 'Pos', 'Best WAR', 'Year'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '2px 12px', borderBottom: '1px solid #666' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map(p => (
            <tr key={`${p.id}|${p.pos}`}>
              <td style={{ padding: '2px 12px' }}>{p.name}</td>
              <td style={{ padding: '2px 12px' }}>{p.pos}</td>
              <td style={{ padding: '2px 12px' }}>{p.bestWar.toFixed(2)}</td>
              <td style={{ padding: '2px 12px' }}>{p.bestYear}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
