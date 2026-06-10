import React, { createContext, useContext, useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark' | 'system'
type AccentKey = 'gold' | 'sage' | 'azure' | 'clay'

export const ACCENTS: { key: AccentKey; label: string; hue: number; swatch: string }[] = [
  { key: 'gold', label: 'Gold', hue: 85, swatch: 'oklch(0.80 0.09 85)' },
  { key: 'sage', label: 'Sage', hue: 150, swatch: 'oklch(0.80 0.09 150)' },
  { key: 'azure', label: 'Azure', hue: 255, swatch: 'oklch(0.80 0.09 255)' },
  { key: 'clay', label: 'Clay', hue: 35, swatch: 'oklch(0.80 0.09 35)' },
]

interface ThemeContextValue {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
  resolvedDark: boolean
  accent: AccentKey
  setAccent: (a: AccentKey) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return mode === 'dark'
}

function hueFor(accent: AccentKey): number {
  return ACCENTS.find((a) => a.key === accent)?.hue ?? 85
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('themeMode') as ThemeMode) || 'dark'
  })
  const [accent, setAccentState] = useState<AccentKey>(() => {
    return (localStorage.getItem('accentColor') as AccentKey) || 'gold'
  })
  const [resolvedDark, setResolvedDark] = useState(() => resolveDark(mode))

  useEffect(() => {
    const hue = hueFor(accent)
    const dark = resolveDark(mode)
    setResolvedDark(dark)
    applyThemeVars(dark, hue)

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => { const d = mq.matches; setResolvedDark(d); applyThemeVars(d, hue) }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [mode, accent])

  const setMode = (m: ThemeMode) => {
    localStorage.setItem('themeMode', m)
    setModeState(m)
  }

  const setAccent = (a: AccentKey) => {
    localStorage.setItem('accentColor', a)
    setAccentState(a)
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolvedDark, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

function applyThemeVars(dark: boolean, hue: number) {
  const root = document.documentElement
  if (dark) {
    // "Forest Calm" — soft deep green-charcoal, lifted off pure black, calm at night.
    root.style.setProperty('--bg', 'oklch(0.21 0.016 155)')
    root.style.setProperty('--surface', 'oklch(0.255 0.02 155)')
    root.style.setProperty('--surface-2', 'oklch(0.31 0.022 155)')
    root.style.setProperty('--line', 'rgba(255,255,255,0.08)')
    root.style.setProperty('--text', 'oklch(0.94 0.01 150)')
    root.style.setProperty('--text-muted', 'oklch(0.74 0.012 150)')
    root.style.setProperty('--text-dim', 'oklch(0.58 0.012 150)')
    root.style.setProperty('--ring-track', 'rgba(255,255,255,0.09)')
    root.style.setProperty('--on-accent', `oklch(0.22 0.03 ${hue})`)
    root.style.setProperty('--card-shadow', '0 1px 2px rgba(0,0,0,0.30)')
    root.style.setProperty('--accent', `oklch(0.80 0.09 ${hue})`)
    root.style.setProperty('--accent-wash', `oklch(0.80 0.09 ${hue} / 0.13)`)
    root.style.setProperty('--accent-line', `oklch(0.80 0.09 ${hue} / 0.30)`)
  } else {
    root.style.setProperty('--bg', 'oklch(0.955 0.007 85)')
    root.style.setProperty('--surface', 'oklch(0.995 0.004 88)')
    root.style.setProperty('--surface-2', 'oklch(0.93 0.007 85)')
    root.style.setProperty('--line', 'rgba(40,32,20,0.09)')
    root.style.setProperty('--text', 'oklch(0.27 0.012 70)')
    root.style.setProperty('--text-muted', 'oklch(0.46 0.012 72)')
    root.style.setProperty('--text-dim', 'oklch(0.60 0.01 75)')
    root.style.setProperty('--ring-track', 'rgba(40,32,20,0.08)')
    root.style.setProperty('--on-accent', '#ffffff')
    root.style.setProperty('--card-shadow', '0 1px 3px rgba(40,32,20,0.05)')
    root.style.setProperty('--accent', `oklch(0.56 0.10 ${hue})`)
    root.style.setProperty('--accent-wash', `oklch(0.56 0.10 ${hue} / 0.10)`)
    root.style.setProperty('--accent-line', `oklch(0.56 0.10 ${hue} / 0.26)`)
  }

  // Keep the browser chrome (status bar / PWA title bar) in sync with the
  // active theme — index.html hardcodes a dark value that's wrong in light mode.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = dark ? '#1d231e' : '#f3f1ec'
}
