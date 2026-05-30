import React, { useEffect, useRef, useState } from 'react'

// ─── CountUp ──────────────────────────────────────────────────────────────────
interface CountUpProps {
  value: number
  duration?: number
  decimals?: number
  className?: string
  style?: React.CSSProperties
}

export function CountUp({ value, duration = 900, decimals = 0, className, style }: CountUpProps) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    const start = performance.now()
    // ease-out cubic
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)

    const tick = (now: number) => {
      const elapsed = now - start
      const t = duration > 0 ? Math.min(1, elapsed / duration) : 1
      const current = from + (to - from) * ease(t)
      setDisplay(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(to)
        fromRef.current = to
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      fromRef.current = value
    }
  }, [value, duration])

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString()

  return (
    <span className={className} style={style}>
      {formatted}
    </span>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
interface SkeletonProps {
  width?: number | string
  height?: number
  radius?: number
  style?: React.CSSProperties
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background:
          'linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%)',
        backgroundSize: '200% 100%',
        animation: 'mb-shimmer 1.4s ease-in-out infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────
export function SkeletonCard({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 22,
        border: '1px solid var(--line)',
        boxShadow: 'var(--card-shadow)',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...style,
      }}
    >
      <Skeleton width="40%" height={12} />
      <Skeleton width="70%" height={20} />
      <Skeleton width="100%" height={64} radius={14} />
      <Skeleton width="55%" height={12} />
    </div>
  )
}

// ─── Ring ────────────────────────────────────────────────────────────────────
interface RingProps {
  size: number
  stroke: number
  progress: number // 0..1
  color: string
  track?: string
  children?: React.ReactNode
}

export function Ring({ size, stroke, progress, color, track, children }: RingProps) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(1, Math.max(0, progress)))

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track ?? 'var(--ring-track)'}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// ─── MacroBar ────────────────────────────────────────────────────────────────
interface MacroBarProps {
  label: string
  value: number
  goal: number
  color: string
  unit?: string
}

export function MacroBar({ label, value, goal, color, unit = 'g' }: MacroBarProps) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          {label}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)' }}>
          {Math.round(value)}
          <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>/{Math.round(goal)}{unit}</span>
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 4,
          background: 'var(--surface-2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct * 100}%`,
            background: color,
            borderRadius: 4,
            transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </div>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
  pad?: number | string
  className?: string
}

export function Card({ children, style, onClick, pad = 18, className }: CardProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        borderRadius: 22,
        border: '1px solid var(--line)',
        boxShadow: 'var(--card-shadow)',
        padding: pad,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── Eyebrow ──────────────────────────────────────────────────────────────────
interface EyebrowProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

export function Eyebrow({ children, style }: EyebrowProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--sans)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--text-dim)',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

// ─── Bars ─────────────────────────────────────────────────────────────────────
interface BarsProps {
  data: number[]
  w?: number
  h?: number
  color?: string
  dim?: string
  active?: number
}

export function Bars({ data, w = 28, h = 80, color = 'var(--accent)', dim = 'var(--surface-2)', active }: BarsProps) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: h }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            width: w,
            height: Math.max(4, (v / max) * h),
            background: i === active ? color : dim,
            borderRadius: 4,
            transition: 'height 0.5s ease',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

// ─── glassBtn ─────────────────────────────────────────────────────────────────
export const glassBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 16,
  color: '#fff',
  padding: '10px 20px',
  cursor: 'pointer',
  fontFamily: 'var(--sans)',
  fontWeight: 600,
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 46 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${size * 0.08}px solid var(--surface-2)`,
        borderTopColor: 'var(--accent)',
        animation: 'mb-spin 0.8s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}
