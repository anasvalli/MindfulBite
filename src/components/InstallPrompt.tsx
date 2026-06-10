import { useEffect, useState } from 'react'
import { isPWA } from '../lib/pwa'

// The `beforeinstallprompt` event isn't in the standard lib DOM types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'installDismissed'

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Already installed, or previously dismissed -> never show.
    if (isPWA()) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // stop the mini-infobar; we control the UI
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Defer one tick so the slide-up transition can play.
      requestAnimationFrame(() => setVisible(true))
    }

    const onInstalled = () => {
      setVisible(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
    if (choice.outcome === 'dismissed') {
      // Don't permanently silence on a single dismissal of the native sheet,
      // but the prompt event is single-use, so hide for this session.
    }
  }

  if (!deferredPrompt) return null

  return (
    <div
      role="dialog"
      aria-label="Install Mindful Bite"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        // Sit above where a bottom tab bar would be, respecting safe-area inset.
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        color: 'var(--text)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
        transform: visible ? 'translateY(0)' : 'translateY(140%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 280ms ease, opacity 280ms ease',
      }}
    >
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
        📲 Install Mindful Bite for the full experience
      </span>
      <button
        type="button"
        onClick={install}
        style={{
          flexShrink: 0,
          padding: '8px 16px',
          borderRadius: 10,
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 14,
          background: 'var(--accent)',
          color: 'var(--on-accent)',
        }}
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 10,
          border: '1px solid var(--line)',
          background: 'transparent',
          color: 'var(--text)',
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  )
}
