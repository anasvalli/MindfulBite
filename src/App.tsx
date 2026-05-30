import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import { useLanguage } from './contexts/LanguageContext'
import { AuthScreen } from './screens/AuthScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { HomeScreen } from './screens/HomeScreen'
import { NutritionScreen } from './screens/NutritionScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { CoachScreen } from './screens/CoachScreen'
import { MoodScreen } from './screens/MoodScreen'
import { SleepScreen } from './screens/SleepScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { InsightsScreen } from './screens/InsightsScreen'
import { MealPlanScreen } from './screens/MealPlanScreen'
import { MealScheduleScreen } from './screens/MealScheduleScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { WearablesScreen } from './screens/WearablesScreen'
import { WaterScreen } from './screens/WaterScreen'
import { WeightScreen } from './screens/WeightScreen'
import { CycleScreen } from './screens/CycleScreen'
import { InstallPrompt } from './components/InstallPrompt'
import { Spinner } from './components/ui'
import { IconHome, IconFlame, IconMoon, IconCamera, IconMood, IconGear } from './components/icons'

type Screen =
  | 'auth'
  | 'home'
  | 'nutrition'
  | 'capture'
  | 'coach'
  | 'mood'
  | 'sleep'
  | 'settings'
  | 'insights'
  | 'plans'
  | 'history'
  | 'mealSchedule'
  | 'wearables'
  | 'water'
  | 'weight'
  | 'cycle'

const FRAME_W = 402
const FRAME_H = 874

// Screens where the tab bar is hidden
const IMMERSIVE: Screen[] = ['capture', 'coach', 'settings', 'plans', 'history', 'mealSchedule', 'wearables', 'water', 'weight', 'cycle']
// Screens where the inner content gets zero padding (they manage their own)
const SELF_PADDED: Screen[] = ['capture', 'coach', 'settings', 'plans', 'history', 'mealSchedule', 'wearables', 'water', 'weight', 'cycle']

// Device mode: on a real phone (narrow viewport) the app fills the screen edge to
// edge and respects safe-area insets (notch / punch-hole / gesture bar). On a wide
// desktop viewport we show a centered phone-sized preview frame. Foldables that
// unfold to a wide width get the framed view; folded/narrow get full-screen.
function useDeviceMode() {
  const [state, setState] = useState(() => computeDeviceMode())
  useEffect(() => {
    function update() {
      setState(computeDeviceMode())
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return state
}

function computeDeviceMode(): { fullScreen: boolean; scale: number } {
  const w = window.innerWidth
  const h = window.innerHeight
  // Treat anything <= 600px wide as a real phone → full-screen, edge to edge.
  if (w <= 600) return { fullScreen: true, scale: 1 }
  // Wider (desktop, tablet, unfolded foldable) → centered framed preview, scaled to fit height.
  const scale = Math.min((h - 32) / FRAME_H, 1)
  return { fullScreen: false, scale }
}

interface TabBarProps {
  screen: Screen
  go: (s: Screen) => void
}

function TabBar({ screen, go }: TabBarProps) {
  const { t } = useLanguage()
  type TabItem = { id: Screen; label: string; icon: React.ReactNode; fab?: boolean }

  const tabs: TabItem[] = [
    { id: 'home', label: t('nav.today'), icon: <IconHome size={22} /> },
    { id: 'nutrition', label: t('nav.nutrition'), icon: <IconFlame size={22} /> },
    { id: 'capture', label: '', icon: <IconCamera size={26} />, fab: true },
    { id: 'sleep', label: t('nav.sleep'), icon: <IconMoon size={22} /> },
    { id: 'mood', label: t('nav.mood'), icon: <IconMood size={22} /> },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(to top, var(--bg) 60%, transparent)',
        display: 'flex',
        alignItems: 'center',
        // Respect the device's bottom gesture bar / home indicator
        paddingTop: 8,
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        zIndex: 30,
      }}
    >
      {tabs.map((tab) => {
        const isActive = screen === tab.id

        if (tab.fab) {
          return (
            <button
              key={tab.id}
              onClick={() => go('capture')}
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--on-accent)',
                  boxShadow: '0 4px 16px oklch(0.80 0.09 85 / 0.40)',
                  transform: 'translateY(-10px)',
                  transition: 'transform 0.15s ease',
                }}
              >
                <IconCamera size={26} />
              </div>
            </button>
          )
        }

        return (
          <button
            key={tab.id}
            onClick={() => go(tab.id as Screen)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 0',
              color: isActive ? 'var(--accent)' : 'var(--text-dim)',
              transition: 'color 0.15s ease',
            }}
          >
            {tab.icon}
            <span
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
              }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function App() {
  const { loading, session, profile } = useAuth()
  const [screen, setScreen] = useState<Screen>('home')
  const [screenKey, setScreenKey] = useState(0)
  const { fullScreen, scale } = useDeviceMode()

  const go = useCallback((s: string) => {
    setScreen(s as Screen)
    setScreenKey((k) => k + 1)
  }, [])

  // Reactively redirect on every session change — if session becomes null mid-use,
  // the user is immediately sent to auth.
  useEffect(() => {
    if (loading) return
    if (!session) {
      setScreen('auth')
    } else if (screen === 'auth') {
      setScreen('home')
    }
  }, [loading, session])

  const isOnboarding = !!session && !!profile && !profile.onboarding_complete
  const showTabBar = !IMMERSIVE.includes(screen) && !!session && !isOnboarding
  const selfPadded = SELF_PADDED.includes(screen) || !session || isOnboarding
  // Top padding clears the status bar / notch / punch-hole (env safe-area on devices
  // that report it, with a sensible floor for Android). Bottom clears the tab bar +
  // gesture bar.
  const innerPadding = selfPadded
    ? 0
    : `max(env(safe-area-inset-top, 0px) + 18px, 52px) 20px ${showTabBar ? 'calc(96px + env(safe-area-inset-bottom, 0px))' : 'max(20px, env(safe-area-inset-bottom, 0px))'}`

  function renderScreen() {
    if (!session) return <AuthScreen go={go} />
    if (profile && !profile.onboarding_complete) {
      return <OnboardingScreen go={go} />
    }
    switch (screen) {
      case 'home':
        return <HomeScreen go={go} />
      case 'nutrition':
        return <NutritionScreen go={go} />
      case 'capture':
        return <CaptureScreen go={go} />
      case 'coach':
        return <CoachScreen go={go} />
      case 'mood':
        return <MoodScreen go={go} />
      case 'sleep':
        return <SleepScreen go={go} />
      case 'settings':
        return <SettingsScreen go={go} />
      case 'insights':
        return <InsightsScreen go={go} />
      case 'plans':
        return <MealPlanScreen go={go} />
      case 'history':
        return <HistoryScreen go={go} />
      case 'mealSchedule':
        return <MealScheduleScreen go={go} />
      case 'wearables':
        return <WearablesScreen go={go} />
      case 'water':
        return <WaterScreen go={go} />
      case 'weight':
        return <WeightScreen go={go} />
      case 'cycle':
        return <CycleScreen go={go} />
      default:
        return <HomeScreen go={go} />
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* App surface — full-screen on real phones, centered preview frame on desktop */}
      <div
        style={
          fullScreen
            ? {
                width: '100%',
                height: '100dvh',
                position: 'relative',
                overflow: 'hidden',
                background: 'var(--bg)',
              }
            : {
                width: FRAME_W,
                height: FRAME_H,
                borderRadius: 44,
                overflow: 'hidden',
                boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
                position: 'relative',
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                background: 'var(--bg)',
                flexShrink: 0,
              }
        }
      >
        {/* Global loading */}
        {loading ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 32 }}>🌿</div>
              <Spinner size={40} />
            </div>
          </div>
        ) : (
          <>
            {/* Screen content */}
            <div
              key={screenKey}
              style={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                padding: innerPadding,
              }}
            >
              {renderScreen()}
            </div>

            {/* Tab bar */}
            {showTabBar && <TabBar screen={screen} go={go} />}

            {/* Settings button (floating, when signed in, not on immersive screens, not during onboarding) */}
            {session && !IMMERSIVE.includes(screen) && !isOnboarding && (
              <button
                onClick={() => go('settings')}
                style={{
                  position: 'absolute',
                  top: 'max(env(safe-area-inset-top, 0px) + 12px, 46px)',
                  right: 18,
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 40,
                }}
              >
                <IconGear size={18} />
              </button>
            )}
          </>
        )}
      </div>
      {session && <InstallPrompt />}
    </div>
  )
}
