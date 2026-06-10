import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

interface AuthScreenProps {
  go: (screen: string) => void
}

// ─── Module-level styles ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 14,
  padding: '14px 18px',
  color: 'var(--text)',
  fontFamily: 'var(--sans)',
  fontSize: 15,
  outline: 'none',
}

// ─── PasswordInput (module-level — stable reference, no remount on parent render) ─

interface PasswordInputProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  show: boolean
  onToggle: () => void
  name: string
}

function PasswordInput({ value, onChange, placeholder, show, onToggle, name }: PasswordInputProps) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        minLength={6}
        style={{ ...inputStyle, paddingRight: 48 }}
      />
      <button
        type="button"
        onClick={onToggle}
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          color: 'var(--text-dim)',
          cursor: 'pointer',
          fontSize: 16,
          padding: 4,
          lineHeight: 1,
        }}
      >
        {show ? '🙈' : '👁'}
      </button>
    </div>
  )
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────

export function AuthScreen({ go }: AuthScreenProps) {
  const { signIn, signUp } = useAuth()
  // First-time visitors land on Sign Up (the product sells itself faster than
  // a login wall); anyone who has signed in on this device before gets Sign In.
  const [tab, setTab] = useState<'signin' | 'signup'>(() =>
    localStorage.getItem('hasSignedInBefore') ? 'signin' : 'signup',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (tab === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const result = tab === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password)
      if (result.error) {
        setError(result.error.message)
      } else {
        localStorage.setItem('hasSignedInBefore', '1')
        go('home')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  async function handleAppleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin },
    })
  }

  async function handleFacebookLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: window.location.origin },
    })
  }

  async function handleForgotPassword() {
    setError(null)
    setInfo(null)
    if (!email.trim()) {
      setError('Enter your email first.')
      return
    }
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      })
      if (err) {
        setError(err.message)
      } else {
        setInfo('Check your email for a reset link.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--sans)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
    marginBottom: 8,
  }

  const socialBtnStyle: React.CSSProperties = {
    flex: 1,
    height: 48,
    background: 'var(--surface-2)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: 'var(--text)',
    fontFamily: 'var(--sans)',
    fontSize: 13,
    fontWeight: 600,
  }

  const tabActive: React.CSSProperties = {
    color: 'var(--accent)',
    borderBottom: '2px solid var(--accent)',
    paddingBottom: 8,
    fontWeight: 600,
  }
  const tabInactive: React.CSSProperties = {
    color: 'var(--text-dim)',
    borderBottom: '2px solid transparent',
    paddingBottom: 8,
    fontWeight: 500,
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '32px 24px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--accent-wash)',
                border: '1px solid var(--accent-line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 30,
              }}
            >
              🌿
            </div>
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 32,
                fontWeight: 500,
                color: 'var(--text)',
                letterSpacing: '-0.02em',
                marginBottom: 6,
              }}
            >
              Mindful Bite
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'var(--sans)' }}>
              Your intelligent wellness companion
            </p>
          </div>

          {/* Value strip — show what the product does before asking for credentials */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {[
              ['📸', 'Snap meals → instant calories & macros'],
              ['🌿', 'Sage — your AI nutritionist & coach'],
              ['😴', 'Sleep & mood patterns, decoded'],
            ].map(([icon, line]) => (
              <div key={line} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-muted)' }}>{line}</span>
              </div>
            ))}
          </div>

          {/* Card */}
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 22,
              border: '1px solid var(--line)',
              boxShadow: 'var(--card-shadow)',
              overflow: 'hidden',
            }}
          >
            {/* Tabs */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--line)',
                padding: '0 24px',
              }}
            >
              {(['signin', 'signup'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t)
                    setError(null)
                    setInfo(null)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontFamily: 'var(--sans)',
                    fontSize: 14,
                    cursor: 'pointer',
                    marginRight: 24,
                    paddingTop: 16,
                    ...(tab === t ? tabActive : tabInactive),
                  }}
                >
                  {t === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {/* Email */}
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={inputStyle}
                />
              </div>

              {/* Password */}
              <div>
                <label style={labelStyle}>Password</label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  name="password"
                />
              </div>

              {/* Forgot password — sign in only */}
              {tab === 'signin' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'var(--sans)',
                    alignSelf: 'flex-end',
                    padding: '0 2px',
                    marginTop: -6,
                  }}
                >
                  Forgot password?
                </button>
              )}

              {/* Confirm password — sign up only */}
              {tab === 'signup' && (
                <div>
                  <label style={labelStyle}>Confirm Password</label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="••••••••"
                    show={showConfirm}
                    onToggle={() => setShowConfirm((v) => !v)}
                    name="confirmPassword"
                  />
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p
                      style={{
                        fontFamily: 'var(--sans)',
                        fontSize: 12,
                        color: 'var(--danger)',
                        marginTop: 6,
                        paddingLeft: 2,
                      }}
                    >
                      Passwords do not match.
                    </p>
                  )}
                </div>
              )}

              {/* Error / Info */}
              {error && (
                <div
                  style={{
                    background: 'oklch(0.65 0.18 25 / 0.12)',
                    border: '1px solid oklch(0.65 0.18 25 / 0.3)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: 'var(--danger)',
                    fontFamily: 'var(--sans)',
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}
              {info && (
                <div
                  style={{
                    background: 'var(--accent-wash)',
                    border: '1px solid var(--accent-line)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: 'var(--accent)',
                    fontFamily: 'var(--sans)',
                    fontSize: 13,
                  }}
                >
                  {info}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  height: 52,
                  background: loading ? 'var(--accent-wash)' : 'var(--accent)',
                  color: loading ? 'var(--text-dim)' : 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 18,
                  fontFamily: 'var(--sans)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  marginTop: 4,
                }}
              >
                {loading ? '…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
              </button>

              {/* Divider */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  margin: '4px 0',
                }}
              >
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                <span
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 12,
                    color: 'var(--text-dim)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  or continue with
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>

              {/* Social buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                {/* Google */}
                <button type="button" onClick={handleGoogleLogin} style={socialBtnStyle}>
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path
                      fill="#4285F4"
                      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
                    />
                    <path
                      fill="#34A853"
                      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"
                    />
                  </svg>
                  Google
                </button>

                {/* Apple */}
                <button type="button" onClick={handleAppleLogin} style={socialBtnStyle}>
                  <svg width="16" height="18" viewBox="0 0 14 17" fill="var(--text)">
                    <path d="M13.37 13.12c-.27.62-.59 1.19-.97 1.71-.51.72-.93 1.22-1.26 1.49-.5.46-1.04.7-1.62.71-.41 0-.91-.12-1.49-.35-.58-.23-1.12-.35-1.61-.35-.51 0-1.06.12-1.65.35-.59.24-1.07.36-1.44.37-.56.02-1.11-.22-1.65-.72-.36-.29-.8-.8-1.33-1.54C.81 14.04.37 13.2.08 12.24c-.31-.99-.46-1.95-.46-2.88 0-1.06.23-1.98.69-2.73a4.06 4.06 0 0 1 1.45-1.46 3.9 3.9 0 0 1 1.96-.55c.41 0 .94.12 1.62.38.67.25 1.1.38 1.29.38.14 0 .62-.15 1.43-.44.77-.27 1.41-.38 1.95-.34 1.44.12 2.52.69 3.23 1.73a3.52 3.52 0 0 0-1.9 3.19c.01.85.24 1.6.7 2.25.44.63.99 1.1 1.62 1.35zm-3.64-13c0 .66-.24 1.28-.72 1.86-.58.68-1.28 1.07-2.04 1.01-.01-.08-.02-.16-.02-.25 0-.64.28-1.32.77-1.88.25-.28.56-.52.95-.71.38-.18.74-.28 1.08-.31l.01.28z" />
                  </svg>
                  Apple
                </button>

                {/* Facebook */}
                <button type="button" onClick={handleFacebookLogin} style={socialBtnStyle}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Facebook
                </button>
              </div>
            </form>
          </div>

          <p
            style={{
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontFamily: 'var(--sans)',
              fontSize: 12,
              marginTop: 20,
              lineHeight: 1.6,
            }}
          >
            By continuing, you agree to MindfulBite's terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  )
}
