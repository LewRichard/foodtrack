import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Body, Button, Centered, Title } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isConfigured } from '@/lib/supabase';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    primary: colors.accent,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      {isConfigured ? (
        <AuthProvider>
          <RootStack />
        </AuthProvider>
      ) : (
        <NotConfigured />
      )}
    </ThemeProvider>
  );
}

function RootStack() {
  const { loading, session, profile, profileError, retry } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  if (loading) return <Centered />;
  if (profileError) {
    return (
      <Centered>
        <Title>Can’t connect</Title>
        <Body muted style={{ textAlign: 'center', padding: 24 }}>
          {profileError}
        </Body>
        <Button label="Try again" onPress={retry} />
      </Centered>
    );
  }

  const signedIn = Boolean(session);
  const ready = signedIn && Boolean(profile);

  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: colors.accent, headerTitleStyle: { color: colors.text } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !profile}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="capture" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="checkin/[id]" options={{ title: '' }} />
        <Stack.Screen name="user/[id]" options={{ title: '' }} />
      </Stack.Protected>
    </Stack>
  );
}

function NotConfigured() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <Centered>
      <Title>Almost there</Title>
      <Body muted style={{ textAlign: 'center', padding: 24 }}>
        Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in gymstreak/.env, then restart the dev
        server. See the README.
      </Body>
    </Centered>
  );
}
