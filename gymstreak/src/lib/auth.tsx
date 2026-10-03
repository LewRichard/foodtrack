import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getProfile, type Profile } from './api';
import { supabase } from './supabase';

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Set when the profile could not be fetched (e.g. offline) — distinct from "no profile yet". */
  profileError: string | null;
  setProfile: (profile: Profile) => void;
  retry: () => void;
};

type ProfileState = { userId: string | null; profile: Profile | null; error: string | null };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!sessionLoaded) return;
    let alive = true;
    const load = userId ? getProfile(userId) : Promise.resolve(null);
    load
      .then((profile) => alive && setProfileState({ userId, profile, error: null }))
      .catch((e: Error) => alive && setProfileState({ userId, profile: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [sessionLoaded, userId, attempt]);

  const setProfile = useCallback(
    (profile: Profile) => setProfileState({ userId: profile.id, profile, error: null }),
    [],
  );
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Only trust profile state that belongs to the current user.
  const current = profileState?.userId === userId ? profileState : null;

  const value = useMemo<AuthState>(
    () => ({
      loading: !sessionLoaded || current === null,
      session,
      profile: current?.profile ?? null,
      profileError: current?.error ?? null,
      setProfile,
      retry,
    }),
    [sessionLoaded, current, session, setProfile, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For screens that only render when signed in with a profile. */
export function useMe(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('No profile');
  return profile;
}
