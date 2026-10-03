import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Values pasted into .env often pick up invisible characters (zero-width spaces, non-breaking spaces,
// stray quotes). iOS silently drops a request header whose value contains them, so Supabase answers
// "No API key found in request". Keep only the characters a key or URL can legitimately contain.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/[^\x21-\x7E]|["']/g, '').replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.replace(/[^A-Za-z0-9._-]/g, '');

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

// Only refresh the session while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
