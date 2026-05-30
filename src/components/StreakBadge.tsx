// Compact gold "streak" pill for use inside a home card.

export function StreakBadge({ current }: { current: number }) {
  if (current <= 0) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          fontFamily: 'var(--sans)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'var(--text-dim)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ opacity: 0.6 }}>🔥</span>
        Start a streak
      </span>
    )
  }

  return (
    <span
      className="mb-pop"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 11px',
        borderRadius: 999,
        background: 'var(--accent-wash)',
        border: '1px solid var(--accent-line)',
        fontFamily: 'var(--sans)',
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.01em',
        color: 'var(--accent)',
        whiteSpace: 'nowrap',
      }}
      title={`${current}-day streak`}
    >
      <span style={{ fontSize: 13, lineHeight: 1 }}>🔥</span>
      {current}
    </span>
  )
}
