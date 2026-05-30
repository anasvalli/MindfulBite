import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

interface AuthContextValue {
  session: Session | null
  user: SupabaseUser | null
  profile: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const profileFetchedRef = useRef(false)

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code === 'PGRST116') {
        // No row found — create a minimal profile (handles Google/Apple OAuth users)
        const { data: newProfile, error: insertError } = await supabase
          .from('users')
          .upsert({
            id: userId,
            daily_calorie_goal: 2150,
            subscription_tier: 'Basic',
            onboarding_complete: false,
          }, { onConflict: 'id' })
          .select()
          .single()
        if (!insertError && newProfile) {
          setProfile(newProfile as User)
        } else {
          setProfile(null)
        }
      } else if (!error && data) {
        setProfile(data as User)
      } else {
        setProfile(null)
      }
    } catch (err) {
      console.warn('Profile fetch failed:', err)
      setProfile(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user && !profileFetchedRef.current) {
        profileFetchedRef.current = true
        fetchProfile(s.user.id).finally(() => setLoading(false))
      } else if (!s?.user) {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        profileFetchedRef.current = true
        fetchProfile(s.user.id).finally(() => setLoading(false))
      } else {
        profileFetchedRef.current = false
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error ? new Error(error.message) : null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Sign in failed') }
    }
  }

  async function signUp(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) return { error: new Error(error.message) }
      // Auto-create a minimal profile row so the app has a users record immediately
      if (data.user) {
        const { error: upsertError } = await supabase.from('users').upsert({
          id: data.user.id,
          daily_calorie_goal: 2150,
          subscription_tier: 'Basic',
          onboarding_complete: false,
        }, { onConflict: 'id', ignoreDuplicates: true })
        if (upsertError) {
          console.warn('Profile upsert failed on signup:', upsertError.message)
          // Non-fatal — fetchProfile will retry on auth state change
        }
      }
      return { error: null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Sign up failed') }
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
