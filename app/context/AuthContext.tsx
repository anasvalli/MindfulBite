import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useRouter, useSegments } from 'expo-router';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  initialized: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  initialized: false,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovering(true);
        setTimeout(() => {
          router.replace('/(auth)/update-password');
        }, 300);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!initialized || isRecovering) return;

    const inAuthGroup = segments[0] === '(auth)';

    const checkProfileAndRoute = async () => {
      if (!user && !inAuthGroup) {
        // User is not signed in and not in auth pages -> redirect to login
        router.replace('/(auth)/login');
      } else if (user && !inAuthGroup) {
        // User is signed in but we must ensure they have a profile
        const { data: profile } = await supabase
          .from('users')
          .select('age, gender')
          .eq('id', user.id)
          .single();

        if (!profile || !profile.age || !profile.gender) {
          // If onboarding is incomplete, push to onboarding
          router.replace('/(auth)/onboarding');
        } else if (segments.length < 1) {
          router.replace('/(tabs)');
        }
      } else if (user && inAuthGroup && segments[1] === 'login') {
        const { data: profile } = await supabase
          .from('users')
          .select('age, gender')
          .eq('id', user.id)
          .single();

        if (!profile || !profile.age || !profile.gender) {
          router.replace('/(auth)/onboarding');
        } else {
          router.replace('/(tabs)');
        }
      }
    };

    checkProfileAndRoute();
  }, [user, initialized, segments]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, initialized, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
