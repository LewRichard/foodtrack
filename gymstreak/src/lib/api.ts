import { decode } from 'base64-arraybuffer';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';
import { addDays, toDayKey, type DayKey } from './streaks';

export const BUCKET = 'checkins';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  weekly_goal: number;
  created_at: string;
};

export type PublicProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'weekly_goal'>;

export type Reaction = { user_id: string; emoji: string };

export type Checkin = {
  id: string;
  user_id: string;
  photo_path: string;
  caption: string | null;
  checkin_date: DayKey;
  created_at: string;
  profile: PublicProfile;
  reactions: Reaction[];
};

export type Friendship = {
  id: string;
  status: 'pending' | 'accepted';
  requester_id: string;
  addressee_id: string;
  created_at: string;
  requester: PublicProfile;
  addressee: PublicProfile;
};

const PROFILE_FIELDS = 'id, username, display_name, weekly_goal';
const CHECKIN_FIELDS = `id, user_id, photo_path, caption, checkin_date, created_at,
  profile:profiles(${PROFILE_FIELDS}), reactions(user_id, emoji)`;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ─── Profiles ───────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  fail(error);
  return data as Profile | null;
}

export async function upsertProfile(
  userId: string,
  fields: { username: string; display_name: string; weekly_goal: number },
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...fields })
    .select('*')
    .single();
  if (error?.code === '23505') throw new Error('That username is taken.');
  fail(error);
  return data as Profile;
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, '');
}

export const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;

// ─── Check-ins ──────────────────────────────────────────────────────────────

/** Resizes the photo, uploads it to the user's folder in Storage and records the check-in. */
export async function postCheckin(userId: string, photoUri: string, caption: string): Promise<Checkin> {
  const rendered = await ImageManipulator.manipulate(photoUri).resize({ width: 1080 }).renderAsync();
  const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!image.base64) throw new Error('Could not process the photo.');

  const now = new Date();
  const path = `${userId}/${now.getTime()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(image.base64), { contentType: 'image/jpeg' });
  fail(upload.error);

  const { data, error } = await supabase
    .from('checkins')
    .insert({
      user_id: userId,
      photo_path: path,
      caption: caption.trim() || null,
      checkin_date: toDayKey(now),
    })
    .select(CHECKIN_FIELDS)
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    fail(error);
  }
  return data as unknown as Checkin;
}

/** Your own and your friends' check-ins, newest first (row level security does the filtering). */
export async function fetchFeed(limit = 30, before?: string): Promise<Checkin[]> {
  let query = supabase
    .from('checkins')
    .select(CHECKIN_FIELDS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  fail(error);
  return (data ?? []) as unknown as Checkin[];
}

/** All of one user's check-ins (photo history). */
export async function fetchUserCheckins(userId: string): Promise<Checkin[]> {
  const rows: Checkin[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('checkins')
      .select(CHECKIN_FIELDS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, from + page - 1);
    fail(error);
    rows.push(...((data ?? []) as unknown as Checkin[]));
    if (!data || data.length < page) return rows;
  }
}

export async function fetchCheckin(id: string): Promise<Checkin | null> {
  const { data, error } = await supabase.from('checkins').select(CHECKIN_FIELDS).eq('id', id).maybeSingle();
  fail(error);
  return data as unknown as Checkin | null;
}

/** Check-in days per user over the last `days` days — enough history to compute streaks. */
export async function fetchCheckinDays(userIds: string[], days = 400): Promise<Map<string, DayKey[]>> {
  const result = new Map<string, DayKey[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return result;
  const since = addDays(toDayKey(new Date()), -days);
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('checkins')
      .select('user_id, checkin_date')
      .in('user_id', userIds)
      .gte('checkin_date', since)
      .order('checkin_date', { ascending: false })
      .range(from, from + page - 1);
    fail(error);
    for (const row of data ?? []) result.get(row.user_id)?.push(row.checkin_date);
    if (!data || data.length < page) return result;
  }
}

export async function deleteCheckin(checkin: Pick<Checkin, 'id' | 'photo_path'>): Promise<void> {
  const { error } = await supabase.from('checkins').delete().eq('id', checkin.id);
  fail(error);
  await supabase.storage.from(BUCKET).remove([checkin.photo_path]);
  urlCache.delete(checkin.photo_path);
}

// ─── Photos ─────────────────────────────────────────────────────────────────

const URL_TTL_SECONDS = 60 * 60;
const urlCache = new Map<string, { url: string; expires: number }>();

/** Signed URLs for private photos, cached until shortly before they expire. */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const hit = urlCache.get(path);
    if (hit && hit.expires > now) out[path] = hit.url;
    else missing.push(path);
  }
  if (missing.length > 0) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, URL_TTL_SECONDS);
    fail(error);
    for (const item of data ?? []) {
      if (!item.signedUrl || !item.path) continue;
      out[item.path] = item.signedUrl;
      urlCache.set(item.path, { url: item.signedUrl, expires: now + (URL_TTL_SECONDS - 300) * 1000 });
    }
  }
  return out;
}

// ─── Reactions ──────────────────────────────────────────────────────────────

export const REACTIONS = ['🔥', '💪', '👏', '😤', '🏆'] as const;

export async function setReaction(checkinId: string, userId: string, emoji: string | null): Promise<void> {
  if (emoji === null) {
    const { error } = await supabase.from('reactions').delete().match({ checkin_id: checkinId, user_id: userId });
    fail(error);
    return;
  }
  const { error } = await supabase.from('reactions').upsert({ checkin_id: checkinId, user_id: userId, emoji });
  fail(error);
}

// ─── Friends ────────────────────────────────────────────────────────────────

export async function fetchFriendships(): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(
      `id, status, requester_id, addressee_id, created_at,
       requester:profiles!friendships_requester_id_fkey(${PROFILE_FIELDS}),
       addressee:profiles!friendships_addressee_id_fkey(${PROFILE_FIELDS})`,
    )
    .order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as unknown as Friendship[];
}

export function otherPerson(friendship: Friendship, me: string): PublicProfile {
  return friendship.requester_id === me ? friendship.addressee : friendship.requester;
}

export async function searchUsers(query: string, me: string): Promise<PublicProfile[]> {
  const q = normalizeUsername(query).replace(/[^a-z0-9_]/g, '');
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .ilike('username', `${q}%`)
    .neq('id', me)
    .limit(20);
  fail(error);
  return (data ?? []) as PublicProfile[];
}

export async function sendFriendRequest(me: string, userId: string): Promise<void> {
  const { error } = await supabase.from('friendships').insert({ requester_id: me, addressee_id: userId });
  if (error?.code === '23505') throw new Error('You are already friends or have a pending request.');
  fail(error);
}

export async function acceptFriendRequest(id: string): Promise<void> {
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
  fail(error);
}

export async function removeFriendship(id: string): Promise<void> {
  const { error } = await supabase.from('friendships').delete().eq('id', id);
  fail(error);
}

// ─── Safety ─────────────────────────────────────────────────────────────────

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { target: userId });
  fail(error);
}

export async function reportCheckin(me: string, checkin: Pick<Checkin, 'id' | 'user_id'>, reason: string): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: me, checkin_id: checkin.id, reported_user_id: checkin.user_id, reason });
  fail(error);
}

// ─── Account ────────────────────────────────────────────────────────────────

/** Deletes every photo the user uploaded, then the account and all rows that reference it. */
export async function deleteAccount(userId: string): Promise<void> {
  const storage = supabase.storage.from(BUCKET);
  for (;;) {
    const { data, error } = await storage.list(userId, { limit: 100 });
    fail(error);
    if (!data || data.length === 0) break;
    const removed = await storage.remove(data.map((f) => `${userId}/${f.name}`));
    fail(removed.error);
  }
  const { error } = await supabase.rpc('delete_account');
  fail(error);
  await supabase.auth.signOut();
}
