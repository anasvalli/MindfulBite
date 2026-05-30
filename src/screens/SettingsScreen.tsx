import { useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, ACCENTS } from '../contexts/ThemeContext'
import { useLanguage, LANGUAGES } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import { Card, Eyebrow, Spinner } from '../components/ui'
import { IconChevL, IconChevR, IconCamera } from '../components/icons'
import type { User } from '../types'
import { calculateMacroTargets } from '../lib/macros'
import {
  isNotificationsEnabled,
  requestNotificationPermission,
  scheduleMealReminders,
} from '../lib/notifications'

interface SettingsScreenProps {
  go: (screen: string) => void
}

function scheduleTo24h(t: string | null | undefined): string {
  if (!t) return ''
  if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, '0')
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return ''
  let h = parseInt(m[1]); const min = m[2]; const ap = m[3].toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}

function initials(name: string | null, email: string | null | undefined): string {
  if (name) {
    const parts = name.trim().split(' ')
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase()
  }
  if (email) return email[0]?.toUpperCase() ?? '?'
  return '?'
}

function joinedMonth(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

type PatternStatus = 'idle' | 'loading' | 'success' | 'error'

interface EditField {
  key: string
  label: string
  value: string
  type: 'number' | 'prefs'
}

const DIETARY_PREFS = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Halal',
  'Keto',
  'Paleo',
  'None',
]

export function SettingsScreen({ go }: SettingsScreenProps) {
  const { profile, user, signOut, refreshProfile } = useAuth()
  const { mode, setMode, accent, setAccent } = useTheme()
  const { lang, setLang, t } = useLanguage()
  const [langSheetOpen, setLangSheetOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [patternStatus, setPatternStatus] = useState<PatternStatus>('idle')
  const [patternMessage, setPatternMessage] = useState('')
  const [editField, setEditField] = useState<EditField | null>(null)
  const [editValue, setEditValue] = useState('')
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notifEnabled, setNotifEnabled] = useState(isNotificationsEnabled())

  async function toggleNotifications() {
    if (notifEnabled) {
      // Can't programmatically revoke — just inform
      setNotifEnabled(false)
    } else {
      const granted = await requestNotificationPermission()
      setNotifEnabled(granted)
      if (granted) {
        // Schedule reminders for current meal plan if it exists
        const raw = localStorage.getItem('mealPlan')
        if (raw) {
          try { scheduleMealReminders(JSON.parse(raw)) } catch {}
        }
      }
    }
  }

  function openEdit(field: EditField) {
    if (field.type === 'prefs') {
      const current = field.value ? field.value.split(',').map((s) => s.trim()).filter(Boolean) : []
      setSelectedPrefs(current)
    }
    setSaveError(null)
    setSaveSuccess(false)
    setEditValue(field.value)
    setEditField(field)
  }

  function togglePref(pref: string) {
    setSelectedPrefs((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    )
  }

  async function handleSave() {
    if (!editField || !user) return
    setSaveError(null)
    setSaving(true)

    const update: Partial<User> = {}

    if (editField.key === 'daily_calorie_goal') {
      update.daily_calorie_goal = Number(editValue)
    }
    if (editField.key === 'goal_weight') {
      update.goal_weight = Number(editValue)
    }
    if (editField.key === 'dietary_prefs') {
      update.dietary_prefs = selectedPrefs.length > 0 ? selectedPrefs.join(',') : null
    }
    if (editField.key === 'age') {
      update.age = Number(editValue)
    }
    if (editField.key === 'weight') {
      update.weight = Number(editValue)
      if (profile?.height) {
        update.bmi = Number((Number(editValue) / Math.pow(profile.height / 100, 2)).toFixed(1))
      }
    }
    if (editField.key === 'height') {
      update.height = Number(editValue)
      if (profile?.weight) {
        update.bmi = Number((profile.weight / Math.pow(Number(editValue) / 100, 2)).toFixed(1))
      }
    }

    if (editField.key === 'daily_calorie_goal' || editField.key === 'weight') {
      const weightKg = editField.key === 'weight' ? Number(editValue) : (profile?.weight ?? 70)
      const calGoal = editField.key === 'daily_calorie_goal' ? Number(editValue) : (profile?.daily_calorie_goal ?? 2150)
      const macros = calculateMacroTargets(weightKg, profile?.goal_weight ?? null, calGoal)
      update.protein_goal = macros.protein
      update.carbs_goal = macros.carbs
      update.fat_goal = macros.fat
    }

    try {
      const { error: updateError } = await supabase.from('users').update(update).eq('id', user.id)
      if (updateError) throw new Error(updateError.message)
      await refreshProfile()
      setSaveSuccess(true)
      setTimeout(() => { setSaveSuccess(false); setEditField(null) }, 1200)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAnalysePatterns() {
    setPatternStatus('loading')
    setPatternMessage('Pattern analysis runs automatically each night. Come back tomorrow to see your updated insights.')
    setPatternStatus('success')
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      go('auth')
    } catch (err) {
      console.warn('Sign out error:', err)
      setSigningOut(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadingAvatar(true)
    try {
      // Compress to 256px square
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const img = new Image()
          img.onload = () => {
            const size = 256
            const canvas = document.createElement('canvas')
            canvas.width = size; canvas.height = size
            const ctx = canvas.getContext('2d')!
            const minDim = Math.min(img.width, img.height)
            const sx = (img.width - minDim) / 2
            const sy = (img.height - minDim) / 2
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)
            resolve(canvas.toDataURL('image/jpeg', 0.85))
          }
          img.src = ev.target?.result as string
        }
        reader.readAsDataURL(file)
      })
      const blob = await (await fetch(dataUrl)).blob()
      const fileName = `${user.id}/avatar-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('avatars').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
      await supabase.from('users').update({ avatar_url: urlData.publicUrl }).eq('id', user.id)
      await refreshProfile()
    } catch (err) {
      console.warn('Avatar upload failed:', err)
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null)
    setDeleting(true)
    try {
      const { error } = await supabase.rpc('delete_user_account')
      if (error) throw error
      await supabase.auth.signOut()
      go('auth')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete account')
      setDeleting(false)
    }
  }

  const displayName = profile?.full_name ?? user?.email ?? 'User'
  const avatarText = initials(profile?.full_name ?? null, user?.email ?? null)
  const joinedLabel = profile?.created_at ? `Mindful since ${joinedMonth(profile.created_at)}` : 'Welcome'
  const isPremium = profile?.subscription_tier === 'Premium'

  const healthRows: Array<{
    key: string
    label: string
    rawValue: string | null
    displayValue: string
    editable: boolean
    type: 'number' | 'prefs'
  }> = [
    {
      key: 'daily_calorie_goal',
      label: 'Daily Calorie Goal',
      rawValue: profile?.daily_calorie_goal != null ? String(profile.daily_calorie_goal) : '',
      displayValue: profile?.daily_calorie_goal ? `${profile.daily_calorie_goal} kcal` : 'Not set',
      editable: true,
      type: 'number',
    },
    {
      key: 'goal_weight',
      label: 'Goal Weight',
      rawValue: profile?.goal_weight != null ? String(profile.goal_weight) : '',
      displayValue: profile?.goal_weight ? `${profile.goal_weight} kg` : 'Not set',
      editable: true,
      type: 'number',
    },
    {
      key: 'dietary_prefs',
      label: 'Dietary Preferences',
      rawValue: profile?.dietary_prefs ?? '',
      displayValue: profile?.dietary_prefs
        ? profile.dietary_prefs.split(',').map((s) => s.trim()).join(', ')
        : 'None',
      editable: true,
      type: 'prefs',
    },
    {
      key: 'age',
      label: 'Age',
      rawValue: profile?.age != null ? String(profile.age) : '',
      displayValue: profile?.age ? `${profile.age} years` : 'Not set',
      editable: true,
      type: 'number',
    },
    {
      key: 'weight',
      label: 'Weight',
      rawValue: profile?.weight != null ? String(profile.weight) : '',
      displayValue: profile?.weight ? `${profile.weight} kg` : 'Not set',
      editable: true,
      type: 'number',
    },
    {
      key: 'height',
      label: 'Height',
      rawValue: profile?.height != null ? String(profile.height) : '',
      displayValue: profile?.height ? `${profile.height} cm` : 'Not set',
      editable: true,
      type: 'number',
    },
    {
      key: 'cuisine_pref',
      label: 'Cuisine',
      rawValue: '',
      displayValue: profile?.cuisine_pref ?? 'Not set',
      editable: false,
      type: 'number',
    },
    {
      key: 'protein_goal',
      label: 'Protein Target',
      rawValue: '',
      displayValue: profile?.protein_goal != null ? `${profile.protein_goal}g` : '—',
      editable: false,
      type: 'number',
    },
    {
      key: 'carbs_goal',
      label: 'Carbs Target',
      rawValue: '',
      displayValue: profile?.carbs_goal != null ? `${profile.carbs_goal}g` : '—',
      editable: false,
      type: 'number',
    },
    {
      key: 'fat_goal',
      label: 'Fat Target',
      rawValue: '',
      displayValue: profile?.fat_goal != null ? `${profile.fat_goal}g` : '—',
      editable: false,
      type: 'number',
    },
    {
      key: 'bmi',
      label: 'BMI',
      rawValue: '',
      displayValue: profile?.bmi ? profile.bmi.toFixed(1) : 'Not set',
      editable: false,
      type: 'number',
    },
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--surface-2)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    padding: '13px 16px',
    fontFamily: 'var(--sans)',
    fontSize: 15,
    color: 'var(--text)',
    outline: 'none',
  }

  return (
    <div
      className="mb-screen"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '56px 20px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => go('home')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
        >
          <IconChevL size={20} />
        </button>
        <h2
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
          }}
        >
          Settings
        </h2>
      </div>

      <div style={{ padding: '20px 20px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Profile Header Card */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            {/* Avatar */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              style={{ display: 'none' }}
            />
            <div
              onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
              style={{
                position: 'relative',
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontFamily: 'var(--serif)',
                fontSize: 24,
                fontWeight: 500,
                color: 'var(--on-accent)',
                cursor: uploadingAvatar ? 'default' : 'pointer',
                overflow: 'hidden',
              }}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                avatarText
              )}

              {/* Camera badge */}
              <div
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <IconCamera size={13} />
              </div>

              {/* Uploading overlay */}
              {uploadingAvatar && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Spinner size={26} />
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 22,
                  fontWeight: 500,
                  color: 'var(--text)',
                  marginBottom: 3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayName}
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginBottom: 8 }}>
                {user?.email}
              </p>
              {/* Subscription badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: isPremium ? 'var(--accent)' : 'var(--surface-2)',
                  borderRadius: 100,
                  padding: '3px 10px',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: isPremium ? 'var(--on-accent)' : 'var(--text-dim)',
                    fontFamily: 'var(--mono)',
                    letterSpacing: '0.08em',
                  }}
                >
                  {isPremium ? '★ PREMIUM' : 'BASIC'}
                </span>
              </div>
              <br />
              {profile?.created_at && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--accent)',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  🌿 {joinedLabel}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Health Data */}
        <div>
          <Eyebrow style={{ display: 'block', marginBottom: 10 }}>Health Data</Eyebrow>
          <Card pad={0}>
            {healthRows.map(({ key, label, rawValue, displayValue, editable, type }, i) => (
              <div
                key={key}
                onClick={editable ? () => openEdit({ key, label, value: rawValue ?? '', type }) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderBottom: i < healthRows.length - 1 ? '1px solid var(--line)' : 'none',
                  cursor: editable ? 'pointer' : 'default',
                }}
              >
                <span style={{ fontSize: 14.5, color: 'var(--text)' }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 14,
                      color: displayValue === 'Not set' ? 'var(--text-dim)' : 'var(--text-muted)',
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    {displayValue}
                  </span>
                  {editable && <span style={{ color: 'var(--text-dim)' }}><IconChevR size={14} /></span>}
                </div>
              </div>
            ))}
          </Card>

          {/* Daily Schedule */}
          <Card pad={0} style={{ marginTop: 10 }}>
            <div
              onClick={() => go('mealSchedule')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14.5, color: 'var(--text)' }}>Daily Schedule</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 14,
                    color: (profile?.wake_time || profile?.sleep_time) ? 'var(--text-muted)' : 'var(--text-dim)',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  {(profile?.wake_time || profile?.sleep_time)
                    ? `${scheduleTo24h(profile?.wake_time) || '—'} – ${scheduleTo24h(profile?.sleep_time) || '—'}`
                    : 'Not set'}
                </span>
                <span style={{ color: 'var(--text-dim)' }}><IconChevR size={14} /></span>
              </div>
            </div>
          </Card>

          {/* Connect Wearable */}
          <Card pad={0} style={{ marginTop: 10 }}>
            <div
              onClick={() => go('wearables')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                ⌚ Connect Wearable
              </span>
              <span style={{ color: 'var(--text-dim)' }}><IconChevR size={14} /></span>
            </div>
          </Card>
        </div>

        {/* App */}
        <div>
          <Eyebrow style={{ display: 'block', marginBottom: 10 }}>App</Eyebrow>
          <Card pad={0}>
            {/* Theme */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 14.5, color: 'var(--text)', marginBottom: 10 }}>{t('settings.theme')}</div>
              <div style={{ display: 'flex', gap: 6, background: 'var(--surface-2)', borderRadius: 12, padding: 4 }}>
                {(['light', 'dark', 'system'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: 9,
                      border: 'none',
                      cursor: 'pointer',
                      background: mode === m ? 'var(--accent)' : 'transparent',
                      color: mode === m ? 'var(--on-accent)' : 'var(--text-muted)',
                      fontFamily: 'var(--sans)',
                      fontSize: 13,
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Accent color */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 14.5, color: 'var(--text)', marginBottom: 10 }}>Accent color</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {ACCENTS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setAccent(a.key as 'gold' | 'sage' | 'azure' | 'clay')}
                    aria-label={a.label}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      background: a.swatch,
                      border: accent === a.key ? '2px solid var(--text)' : '2px solid transparent',
                      outline: accent === a.key ? '1px solid var(--line)' : 'none',
                      outlineOffset: 2,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Language */}
            <div
              onClick={() => setLangSheetOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14.5, color: 'var(--text)' }}>{t('settings.language')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                  {LANGUAGES.find((l) => l.code === lang)?.label ?? lang}
                </span>
                <span style={{ color: 'var(--text-dim)' }}><IconChevR size={14} /></span>
              </div>
            </div>

            {/* Notifications */}
            <div
              onClick={toggleNotifications}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14.5, color: 'var(--text)' }}>Notifications</span>
              <div
                style={{
                  width: 46,
                  height: 26,
                  borderRadius: 100,
                  background: notifEnabled ? 'var(--accent)' : 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: notifEnabled ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: notifEnabled ? 'var(--on-accent)' : 'var(--text-dim)',
                    transition: 'left 0.2s',
                  }}
                />
              </div>
            </div>

            {/* App Version */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span style={{ fontSize: 14.5, color: 'var(--text)' }}>App Version</span>
              <span style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>1.0.0</span>
            </div>

            {/* Sign Out */}
            <div
              onClick={handleSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 18px',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  fontSize: 14.5,
                  color: signingOut ? 'var(--text-dim)' : 'var(--danger, #e05252)',
                  fontFamily: 'var(--sans)',
                  fontWeight: 500,
                }}
              >
                {signingOut ? `${t('common.loading')}` : t('settings.signOut')}
              </span>
            </div>
          </Card>
        </div>

        {/* AI Insights */}
        <div>
          <Eyebrow style={{ display: 'block', marginBottom: 10 }}>AI Insights</Eyebrow>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Run a fresh pattern analysis on your meals, moods, and sleep to update your AI model.
              </p>

              <button
                onClick={handleAnalysePatterns}
                disabled={patternStatus === 'loading'}
                style={{
                  background: patternStatus === 'loading' ? 'var(--surface-2)' : 'var(--accent-wash)',
                  border: '1px solid var(--accent-line)',
                  borderRadius: 12,
                  padding: '13px 20px',
                  color: patternStatus === 'loading' ? 'var(--text-dim)' : 'var(--accent)',
                  fontFamily: 'var(--sans)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: patternStatus === 'loading' ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                  width: '100%',
                  letterSpacing: '0.01em',
                  transition: 'opacity 0.15s',
                }}
              >
                {patternStatus === 'loading' ? 'Analysing…' : '✦ Analyse My Patterns'}
              </button>

              {patternStatus === 'success' && (
                <p style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--mono)', textAlign: 'center' }}>
                  {patternMessage}
                </p>
              )}

              {patternStatus === 'error' && (
                <p style={{ fontSize: 13, color: 'var(--danger, #e05252)', fontFamily: 'var(--mono)', textAlign: 'center' }}>
                  {patternMessage}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Delete Account */}
        <Card pad={0}>
          <div
            onClick={() => { setDeleteError(null); setShowDeleteConfirm(true) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 18px',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                fontSize: 14.5,
                color: 'var(--danger, #e05252)',
                fontFamily: 'var(--sans)',
                fontWeight: 500,
              }}
            >
              Delete Account
            </span>
          </div>
        </Card>
      </div>

      {/* Delete Account Confirmation Overlay */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              borderRadius: '24px 24px 0 0',
              padding: '24px 24px 48px',
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid var(--line)',
              borderBottom: 'none',
            }}
          >
            {/* Sheet handle */}
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 4,
                background: 'var(--line)',
                margin: '-12px auto 20px',
              }}
            />

            <div
              style={{
                fontSize: 18,
                fontFamily: 'var(--serif)',
                color: 'var(--text)',
                marginBottom: 10,
                fontWeight: 500,
              }}
            >
              Delete your account?
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 22 }}>
              This permanently deletes all your meals, moods, sleep logs, and profile data. This cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{
                  flex: 1,
                  height: 50,
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--line)',
                  borderRadius: 18,
                  fontFamily: 'var(--sans)',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{
                  flex: 1,
                  height: 50,
                  background: 'var(--danger, #e05252)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 18,
                  fontFamily: 'var(--sans)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>

            {deleteError && (
              <div style={{ marginTop: 14, fontSize: 13, color: 'var(--danger, #e05252)', textAlign: 'center' }}>
                {deleteError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Sheet Overlay */}
      {editField && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={() => setEditField(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              borderRadius: '24px 24px 0 0',
              padding: '24px 24px 48px',
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid var(--line)',
              borderBottom: 'none',
            }}
          >
            {/* Sheet handle */}
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 4,
                background: 'var(--line)',
                margin: '-12px auto 20px',
              }}
            />

            <div
              style={{
                fontSize: 16,
                fontFamily: 'var(--serif)',
                color: 'var(--text)',
                marginBottom: 20,
                fontWeight: 500,
              }}
            >
              Edit {editField.label}
            </div>

            {editField.type === 'number' && (
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
                style={inputStyle}
              />
            )}

            {editField.type === 'prefs' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                {DIETARY_PREFS.map((pref) => {
                  const selected = selectedPrefs.includes(pref)
                  return (
                    <button
                      key={pref}
                      onClick={() => togglePref(pref)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 24,
                        border: selected ? '1px solid var(--accent-line)' : '1px solid var(--line)',
                        background: selected ? 'var(--accent-wash)' : 'var(--surface-2)',
                        color: selected ? 'var(--accent)' : 'var(--text-muted)',
                        fontFamily: 'var(--sans)',
                        fontSize: 13,
                        fontWeight: selected ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {pref}
                    </button>
                  )
                })}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || saveSuccess}
              style={{
                marginTop: 20,
                width: '100%',
                height: 50,
                background: saveSuccess ? 'oklch(0.74 0.14 150)' : saving ? 'var(--accent-wash)' : 'var(--accent)',
                color: saving ? 'var(--text-dim)' : 'var(--on-accent)',
                border: 'none',
                borderRadius: 18,
                fontFamily: 'var(--sans)',
                fontSize: 15,
                fontWeight: 700,
                cursor: saving || saveSuccess ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {saveSuccess ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
            </button>
            {saveError && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>
                {saveError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Language Sheet Overlay */}
      {langSheetOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={() => setLangSheetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              borderRadius: '24px 24px 0 0',
              padding: '24px 0 32px',
              width: '100%',
              maxHeight: '72%',
              boxSizing: 'border-box',
              border: '1px solid var(--line)',
              borderBottom: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Sheet handle */}
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 4,
                background: 'var(--line)',
                margin: '-12px auto 20px',
              }}
            />

            <div
              style={{
                fontSize: 16,
                fontFamily: 'var(--serif)',
                color: 'var(--text)',
                fontWeight: 500,
                padding: '0 24px 16px',
              }}
            >
              {t('settings.language')}
            </div>

            <div style={{ overflow: 'auto' }}>
              {LANGUAGES.map((l) => {
                const selected = l.code === lang
                return (
                  <div
                    key={l.code}
                    onClick={() => { setLang(l.code); setLangSheetOpen(false) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '13px 24px',
                      cursor: 'pointer',
                      background: selected ? 'var(--accent-wash)' : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15,
                        color: selected ? 'var(--accent)' : 'var(--text)',
                        fontWeight: selected ? 600 : 400,
                        fontFamily: 'var(--sans)',
                      }}
                    >
                      {l.label}
                    </span>
                    {selected && (
                      <span style={{ fontSize: 14, color: 'var(--accent)' }}>✓</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
