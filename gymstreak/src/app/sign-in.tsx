import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Field, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL;

export default function SignIn() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.includes('@') || password.length < 8) {
      Alert.alert('Check your details', 'Enter a valid email and a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('Confirm your email', 'We sent you a link. Open it, then sign in here.');
          setMode('sign-in');
        }
      }
    } catch (e) {
      Alert.alert(mode === 'sign-in' ? 'Sign in failed' : 'Sign up failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.includes('@')) {
      Alert.alert('Enter your email first');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    Alert.alert(error ? 'Could not send reset email' : 'Check your inbox', error?.message ?? 'We sent a password reset link.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.hero}>
          <Text style={{ fontSize: 64 }}>🏋️🔥</Text>
          <Title style={{ textAlign: 'center' }}>GymStreak</Title>
          <Body muted style={{ textAlign: 'center' }}>
            Snap a photo every time you hit the gym. Keep your streak alive with your friends.
          </Body>
        </View>

        <View style={styles.form}>
          <Field
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            placeholder="Password (8+ characters)"
            secureTextEntry
            autoComplete={mode === 'sign-in' ? 'password' : 'new-password'}
            textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          <Button label={mode === 'sign-in' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />
          <Button
            variant="ghost"
            label={mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
            onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          />
          {mode === 'sign-in' ? <Button variant="ghost" small label="Forgot password?" onPress={resetPassword} /> : null}
        </View>

        {PRIVACY_URL || TERMS_URL ? (
          <Text style={styles.legal}>
            By continuing you agree to our{' '}
            {TERMS_URL ? (
              <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
                Terms
              </Text>
            ) : null}
            {TERMS_URL && PRIVACY_URL ? ' and ' : ''}
            {PRIVACY_URL ? (
              <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
                Privacy Policy
              </Text>
            ) : null}
            .
          </Text>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: space.lg, justifyContent: 'center', gap: space.xl },
  hero: { alignItems: 'center', gap: space.sm },
  form: { gap: space.md },
  legal: { color: colors.textMuted, textAlign: 'center', fontSize: 12 },
  link: { color: colors.accent },
});
