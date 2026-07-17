// Slice 5.5: brief "how to play" overlay. Auto-shown once per browser (a
// localStorage flag, set the first time it's closed) and reopenable anytime
// via a persistent button -- see SetupScreen.tsx.

interface Props {
  onClose: () => void
}

export default function InstructionsModal({ onClose }: Props) {
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.card} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>How to Play</span>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
        </div>

        <div style={styles.section}>
          <span style={styles.sectionTitle}>Goal</span>
          <p style={styles.text}>Build the best 11-player lineup you can, one pick at a time, by drafting real MLB players from the franchises you're dealt.</p>
        </div>

        <div style={styles.section}>
          <span style={styles.sectionTitle}>WAR</span>
          <p style={styles.text}>Wins Above Replacement estimates how many more wins a player was worth than a readily available replacement — higher is better. Your score is your lineup's total WAR.</p>
        </div>

        <div style={styles.section}>
          <span style={styles.sectionTitle}>Snake Draft</span>
          <p style={styles.text}>Each of the 11 rounds reveals a random franchise and year range. Pick one eligible player to fill an open lineup slot. Turn order flips every round, so both players get an equal share of early and late picks.</p>
        </div>

        <div style={styles.section}>
          <span style={styles.sectionTitle}>Daily Challenge</span>
          <p style={styles.text}>Everyone gets the same 11 franchises each day, at Easy, Medium, or Hard difficulty. Submit your score to the leaderboard and see how you stack up.</p>
        </div>

        <button onClick={onClose} style={styles.gotItBtn}>Got it</button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    zIndex: 200,
  },
  card: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '1.5rem',
    width: '100%',
    maxWidth: '440px',
    maxHeight: '85vh',
    overflowY: 'auto',
    color: '#f1f5f9',
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: '1.25rem', fontWeight: 800 },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '1.1rem',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0.25rem',
  },
  section: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  sectionTitle: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#93c5fd',
  },
  text: { margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: '#cbd5e1' },
  gotItBtn: {
    marginTop: '0.25rem',
    padding: '0.65rem',
    fontSize: '0.95rem',
    fontWeight: 700,
    borderRadius: '8px',
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
  },
}
