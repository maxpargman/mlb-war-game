export type TimeRangeMode = 'all' | 'custom' | 'hard'

export interface GameSettings {
  mode: TimeRangeMode
  yearLo: number   // used when mode === 'custom'; ignored otherwise
  yearHi: number   // used when mode === 'custom'; ignored otherwise
}
