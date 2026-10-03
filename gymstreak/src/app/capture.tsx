import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Title } from '@/components/ui';
import { fetchCheckinDays, postCheckin } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { scheduleReminders } from '@/lib/reminders';
import { toDayKey, weeklyStreak } from '@/lib/streaks';
import { colors, radius, space } from '@/lib/theme';

export default function Capture() {
  const me = useMe();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  if (!permission) return <View style={styles.screen} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.screen, styles.permission]}>
        <Text style={{ fontSize: 56 }}>📸</Text>
        <Title style={{ textAlign: 'center' }}>Camera access</Title>
        <Body muted style={{ textAlign: 'center' }}>
          GymStreak needs your camera to take check-in photos. Only you and your friends can see them.
        </Body>
        <Button
          label={permission.canAskAgain ? 'Allow camera' : 'Open Settings'}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          style={{ alignSelf: 'stretch' }}
        />
        <Button variant="ghost" label="Not now" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  async function shoot() {
    if (!camera.current || !ready) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.8 });
      setPhoto(picture.uri);
    } catch (e) {
      Alert.alert('Could not take photo', (e as Error).message);
    }
  }

  async function post() {
    if (!photo) return;
    setPosting(true);
    try {
      await postCheckin(me.id, photo, caption);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const today = toDayKey(new Date());
      const days = (await fetchCheckinDays([me.id])).get(me.id) ?? [];
      scheduleReminders({ checkedInToday: true, streakWeeks: weeklyStreak(days, me.weekly_goal, today) }).catch(() => {});
      router.back();
    } catch (e) {
      setPosting(false);
      Alert.alert('Could not post', (e as Error).message);
    }
  }

  if (photo) {
    return (
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.review}>
          <View style={styles.frame}>
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <TextInput
              style={styles.caption}
              placeholder="Add a caption… (leg day 🦵)"
              placeholderTextColor="rgba(255,255,255,0.7)"
              value={caption}
              onChangeText={setCaption}
              maxLength={140}
              returnKeyType="done"
            />
          </View>
          <View style={styles.reviewActions}>
            <Button variant="secondary" label="Retake" onPress={() => setPhoto(null)} style={{ flex: 1 }} disabled={posting} />
            <Button label="Post 🔥" onPress={post} loading={posting} style={{ flex: 2 }} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Text style={styles.icon}>✕</Text>
        </Pressable>
        <Text style={styles.topTitle}>Gym check-in</Text>
        <View style={{ width: 28 }} />
      </View>
      <View style={styles.frame}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} onCameraReady={() => setReady(true)} />
        {!ready ? <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} /> : null}
      </View>
      <View style={styles.controls}>
        <View style={{ width: 56 }} />
        <Pressable onPress={shoot} accessibilityLabel="Take photo" style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.92 }] }]}>
          <View style={styles.shutterInner} />
        </Pressable>
        <Pressable
          accessibilityLabel="Flip camera"
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          style={styles.flip}
        >
          <Text style={styles.icon}>🔄</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  permission: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md },
  topTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  icon: { color: '#fff', fontSize: 24 },
  frame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg * 1.5,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
  },
  controls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#fff' },
  flip: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  review: { flex: 1, justifyContent: 'center', gap: space.lg },
  caption: {
    margin: space.md,
    alignSelf: 'center',
    minWidth: '60%',
    maxWidth: '90%',
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  reviewActions: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md },
});
