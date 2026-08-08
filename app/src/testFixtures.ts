// Small synthetic dataset for the core test suite. Deliberately not real MLB
// data — tests check structural query behavior, not specific player values.
import type { Season } from './data'

export const fixtureDb: Season[] = [
  // F01: position players only, no pitchers — used to test dead-end detection.
  { id: 'p01', n: 'Player One', fid: 'F01', fn: 'Team 01', y: 2000, pos: 'C', war: 2.0 },
  // p02 has two seasons for F01 at the same position — used to test that
  // eligiblePlayers picks the best-WAR season within the active year range.
  { id: 'p02', n: 'Player Two', fid: 'F01', fn: 'Team 01', y: 2000, pos: '1B', war: 3.0 },
  { id: 'p02', n: 'Player Two', fid: 'F01', fn: 'Team 01', y: 2005, pos: '1B', war: 5.0 },
  // p02 also has two more low-WAR seasons (2001, 2002) making 2000-2002 a
  // consecutive run with a gap before 2005 -- used to test gap-aware year
  // formatting ("2000-2002, 2005"). Low WAR so they never win "best season".
  { id: 'p02', n: 'Player Two', fid: 'F01', fn: 'Team 01', y: 2001, pos: '1B', war: 1.0 },
  { id: 'p02', n: 'Player Two', fid: 'F01', fn: 'Team 01', y: 2002, pos: '1B', war: 1.0 },
  { id: 'p03', n: 'Player Three', fid: 'F01', fn: 'Team 01', y: 2000, pos: '2B', war: 1.5 },
  { id: 'p04', n: 'Player Four', fid: 'F01', fn: 'Team 01', y: 2000, pos: '3B', war: 1.0 },
  { id: 'p05', n: 'Player Five', fid: 'F01', fn: 'Team 01', y: 2000, pos: 'SS', war: 4.0 },
  { id: 'p06', n: 'Player Six', fid: 'F01', fn: 'Team 01', y: 2000, pos: 'OF', war: 2.5 },

  // F02: a two-way player (multi01) is the ONLY OF and ONLY 1B option for this
  // franchise — used to test that drafting one position-version blocks the
  // other, and blocks the person for both boards.
  { id: 'multi01', n: 'Two Way Guy', fid: 'F02', fn: 'Team 02', y: 2010, pos: 'OF', war: 3.5 },
  { id: 'multi01', n: 'Two Way Guy', fid: 'F02', fn: 'Team 02', y: 2012, pos: '1B', war: 4.5 },
  { id: 'p07', n: 'Player Seven', fid: 'F02', fn: 'Team 02', y: 2010, pos: 'P', war: 2.0 },

  // F03-F12: filler franchises so franchise-draw logic (which needs a pool
  // of at least 11 for a full 11-round schedule) has enough entries. Each
  // spans the full 1990-2012 dataset range (two rows, same player) rather
  // than a single year -- long enough to comfortably fit a medium/hard
  // window without every round hitting the per-franchise clamp (see
  // generateDailySchedule's franchise-year-bounds fix). Global min/max stay
  // exactly 1990/2012 either way, which the "easy mode" test below depends on.
  ...Array.from({ length: 10 }, (_, i) => {
    const n = i + 3
    const fid = `F${String(n).padStart(2, '0')}`
    const fn = `Team ${String(n).padStart(2, '0')}`
    return [
      { id: `filler${n}`, n: `Filler Player ${n}`, fid, fn, y: 1990, pos: 'OF' as const, war: 1.0 },
      { id: `filler${n}`, n: `Filler Player ${n}`, fid, fn, y: 2012, pos: 'OF' as const, war: 1.0 },
    ]
  }).flat(),
]
