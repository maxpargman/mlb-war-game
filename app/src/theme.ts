// War Room Vintage design tokens — see app/src/design-reference/war-room-vintage.dc.html
// for the source mockup. Centralized here so every screen's inline styles pull
// from one place instead of re-hardcoding hex values.

export const COLORS = {
  bg: '#141a22',
  fieldBg: '#1c2a1e',
  diamond: '#3a3226',
  border: '#20262f',
  borderSubtle: '#191f27',

  text: '#e8e2d3',
  textDim: '#8b8676',
  textMuted: '#6f6a5c',

  green: '#4d7a52',
  greenHover: '#5f9463',
  red: '#7f3232',
  redLight: '#c58080',

  error: '#c58080',
} as const

// Player-relative accent: player 0 / "you" is always green, player 1 (2-player
// mode's second seat) is red — matches the mockup's two-column draft screen.
export function accentColor(accent: 'green' | 'red'): string {
  return accent === 'red' ? COLORS.redLight : COLORS.green
}

export const FONT_DISPLAY = "'Bebas Neue', sans-serif"
export const FONT_BODY = "'Inter', system-ui, sans-serif"
