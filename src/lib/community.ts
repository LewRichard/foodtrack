import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentLanguage, t } from "../i18n/index.ts";
import { projectUrl } from "../../shared/supabase.ts";
import { API_BASE } from "./api.ts";
import { accessToken, cloudClient, onBeforeDeleteAccount } from "./cloud.ts";
import { isNative } from "./native.ts";
import { reminderSupport, subscribeThisDevice, unsubscribeThisDevice } from "./reminders.ts";
import { photoSquare } from "./image.ts";
import { actions, getState, onStateChange } from "./store.ts";
import { streak } from "./achievements.ts";
import { addDays, todayKey } from "./dates.ts";

// Community: profiles, friends, posts, comments, likes and chat, all stored in Supabase.
// Who can see or do what is enforced by the database (supabase/community.sql); this file just asks.

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
}

export type ConnectionState = "friend" | "incoming" | "outgoing" | "none";
export interface Connection extends Profile {
  state: ConnectionState;
}

export interface DaySummary {
  kcal: number;
  goal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type Visibility = "public" | "friends";

export interface Post {
  id: string;
  author: string;
  body: string;
  image_path: string | null;
  visibility: Visibility;
  day_summary: DaySummary | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  author_profile: Pick<Profile, "username" | "display_name" | "avatar_path"> | null;
  liked: boolean;
  imageUrl: string | null;
}

export interface Comment {
  id: string;
  post_id: string;
  author: string;
  body: string;
  created_at: string;
  author_profile: Pick<Profile, "username" | "display_name" | "avatar_path"> | null;
}

export interface Conversation {
  other: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  last_body: string;
  last_at: string;
  last_from_me: boolean;
  unread: number;
}

export interface Message {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export type ReportTarget = "post" | "comment" | "user" | "message";

const BUCKET = "post-images";
const PAGE = 15;
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;

/** Turns a database error into something a person can act on. */
export class CommunityError extends Error {}

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === "23505") throw new CommunityError(t("community.usernameTaken"));
  if (error.code === "42P01" || error.code === "PGRST202" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message)) {
    throw new CommunityError(t("community.notSetUp"));
  }
  if (/row-level security/i.test(error.message)) throw new CommunityError(t("community.notAllowed"));
  if (/blocked/i.test(error.message)) throw new CommunityError(t("community.notAllowed"));
  throw new CommunityError(error.message);
}

async function db(): Promise<SupabaseClient> {
  return cloudClient();
}

async function me(): Promise<string> {
  const { data } = await (await db()).auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new CommunityError(t("community.signInFirst"));
  return id;
}

type NotifyKind = "message" | "comment" | "like" | "friend_request" | "friend_accept";

/** Tells the server what I just did so it can notify the other person. Best effort: never throws. */
function notify(kind: NotifyKind, id: string) {
  void (async () => {
    const token = await accessToken();
    if (!token) return;
    await fetch(`${API_BASE}/api/community/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, id }),
    });
  })().catch(() => {});
}

// ---- Profile ------------------------------------------------------------------------------------

// My own profile, shared by the Community and Profile tabs (undefined = not loaded yet).
let myProfile: Profile | null | undefined;
const profileListeners = new Set<() => void>();
function setMyProfile(p: Profile | null | undefined) {
  myProfile = p;
  profileListeners.forEach((fn) => fn());
}

export async function loadMyProfile(): Promise<Profile | null> {
  const id = await me();
  const { data, error } = await (await db()).from("profiles").select("id, username, display_name, avatar_path").eq("id", id).maybeSingle();
  fail(error);
  setMyProfile(data as Profile | null);
  return data as Profile | null;
}

let profileError = "";

/**
 * My community profile while signed in (loaded once, shared by every screen). `profile` is
 * undefined while loading and null when I haven't joined yet; `error` is set if loading failed.
 */
export function useMyProfile(userId: string | null): { profile: Profile | null | undefined; error: string; retry: () => void } {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    profileListeners.add(fn);
    return () => void profileListeners.delete(fn);
  }, []);
  const load = () => {
    profileError = "";
    setMyProfile(undefined);
    loadMyProfile().catch((e) => {
      profileError = e instanceof Error ? e.message : String(e);
      setMyProfile(undefined);
    });
  };
  useEffect(() => {
    if (!userId) {
      profileError = "";
      setMyProfile(undefined); // signed out: forget it, so the next account loads its own
    } else if ((myProfile === undefined && !profileError) || (myProfile && myProfile.id !== userId)) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  return { profile: userId ? myProfile : null, error: userId ? profileError : "", retry: load };
}

const SUPABASE_URL = projectUrl(import.meta.env.VITE_SUPABASE_URL ?? "");
const AVATARS = "avatars";

/** Public link to a profile photo. */
export function avatarUrl(path: string | null | undefined): string | null {
  return path && SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/${AVATARS}/${path}` : null;
}

/** Sets my profile photo (cropped to a square) and removes the previous one. */
export async function setAvatar(file: Blob): Promise<Profile> {
  const client = await db();
  const myId = await me();
  const photo = await photoSquare(file);
  // A new name each time, so phones don't keep showing the old photo from their cache.
  const path = `${myId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await client.storage.from(AVATARS).upload(path, photo, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (uploadError) throw new CommunityError(t("community.photoFailed", { error: uploadError.message }));
  return replaceAvatar(path);
}

export async function removeAvatar(): Promise<Profile> {
  return replaceAvatar(null);
}

async function replaceAvatar(path: string | null): Promise<Profile> {
  const client = await db();
  const myId = await me();
  const old = myProfile?.avatar_path ?? null;
  const { data, error } = await client
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", myId)
    .select("id, username, display_name, avatar_path")
    .single();
  if (error && path) await client.storage.from(AVATARS).remove([path]);
  fail(error);
  if (old && old !== path) await client.storage.from(AVATARS).remove([old]);
  return saved(data);
}

export async function updateDisplayName(name: string): Promise<Profile> {
  const { data, error } = await (await db())
    .from("profiles")
    .update({ display_name: name.trim().slice(0, 40) })
    .eq("id", await me())
    .select("id, username, display_name, avatar_path")
    .single();
  fail(error);
  return saved(data);
}

/** Shares a just-saved profile with every screen (reloading it if the save didn't send it back). */
async function saved(data: unknown): Promise<Profile> {
  if (data) {
    setMyProfile(data as Profile);
    return data as Profile;
  }
  const fresh = await loadMyProfile();
  if (!fresh) throw new CommunityError(t("community.notAllowed"));
  return fresh;
}

export async function createProfile(username: string, displayName: string): Promise<Profile> {
  const clean = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(clean)) throw new CommunityError(t("community.usernameRules"));
  const { data, error } = await (await db())
    .from("profiles")
    .insert({ username: clean, display_name: displayName.trim().slice(0, 40) })
    .select("id, username, display_name, avatar_path")
    .single();
  fail(error);
  setMyProfile(data as Profile);
  return data as Profile;
}

// ---- Friends ------------------------------------------------------------------------------------

export async function loadConnections(): Promise<Connection[]> {
  const { data, error } = await (await db()).rpc("my_connections");
  fail(error);
  return (data ?? []) as Connection[];
}

export async function searchPeople(query: string): Promise<Connection[]> {
  if (query.trim().length < 2) return [];
  const { data, error } = await (await db()).rpc("search_profiles", { query: query.trim() });
  fail(error);
  return (data ?? []) as Connection[];
}

export async function sendFriendRequest(id: string): Promise<"pending" | "accepted"> {
  const { data, error } = await (await db()).rpc("send_friend_request", { target: id });
  fail(error);
  notify(data === "accepted" ? "friend_accept" : "friend_request", id);
  return data as "pending" | "accepted";
}

export async function answerFriendRequest(id: string, accept: boolean): Promise<void> {
  const { error } = await (await db()).rpc("respond_friend_request", { requester_id: id, accept });
  fail(error);
  if (accept) notify("friend_accept", id);
}

export async function removeFriend(id: string): Promise<void> {
  const { error } = await (await db()).rpc("remove_friend", { other: id });
  fail(error);
}

export async function blockUser(id: string): Promise<void> {
  const { error } = await (await db()).from("blocks").insert({ blocked: id });
  if (error?.code === "23505") return; // already blocked
  fail(error);
}

export async function unblockUser(id: string): Promise<void> {
  const { error } = await (await db()).from("blocks").delete().eq("blocked", id);
  fail(error);
}

export async function loadBlocked(): Promise<Profile[]> {
  const { data, error } = await (await db()).from("blocks").select("blocked, profile:profiles!blocks_blocked_fkey(id, username, display_name, avatar_path)");
  fail(error);
  return ((data ?? []) as unknown as { profile: Profile | null }[]).flatMap((row) => (row.profile ? [row.profile] : []));
}

// ---- Posts ----------------------------------------------------------------------------------------

const POST_FIELDS = "id, author, body, image_path, visibility, day_summary, like_count, comment_count, created_at, author_profile:profiles!posts_author_fkey(username, display_name, avatar_path)";

async function withExtras(rows: Omit<Post, "liked" | "imageUrl">[]): Promise<Post[]> {
  if (!rows.length) return [];
  const client = await db();
  const myId = await me();
  const ids = rows.map((r) => r.id);
  const paths = rows.flatMap((r) => (r.image_path ? [r.image_path] : []));
  const [likes, urls] = await Promise.all([
    client.from("post_likes").select("post_id").eq("user_id", myId).in("post_id", ids),
    paths.length ? client.storage.from(BUCKET).createSignedUrls(paths, 60 * 60) : Promise.resolve({ data: [], error: null }),
  ]);
  const liked = new Set(((likes.data ?? []) as { post_id: string }[]).map((l) => l.post_id));
  const urlFor = new Map(((urls.data ?? []) as { path: string | null; signedUrl: string }[]).map((u) => [u.path, u.signedUrl]));
  return rows.map((r) => ({ ...r, liked: liked.has(r.id), imageUrl: r.image_path ? (urlFor.get(r.image_path) ?? null) : null }));
}

/** A page of posts, newest first. "friends" = my friends and me; "explore" = everyone's public posts. */
export async function loadFeed(kind: "friends" | "explore", friendIds: string[], before?: string): Promise<{ posts: Post[]; more: boolean }> {
  const client = await db();
  let query = client.from("posts").select(POST_FIELDS).order("created_at", { ascending: false }).limit(PAGE);
  if (kind === "explore") query = query.eq("visibility", "public");
  else query = query.in("author", [await me(), ...friendIds]);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  fail(error);
  const rows = (data ?? []) as unknown as Omit<Post, "liked" | "imageUrl">[];
  return { posts: await withExtras(rows), more: rows.length === PAGE };
}

export async function createPost(input: { body: string; visibility: Visibility; image: Blob | null; daySummary: DaySummary | null }): Promise<Post> {
  const client = await db();
  const myId = await me();
  let imagePath: string | null = null;
  if (input.image) {
    imagePath = `${myId}/${crypto.randomUUID()}.jpg`;
    const { error } = await client.storage.from(BUCKET).upload(imagePath, input.image, { contentType: "image/jpeg" });
    if (error) throw new CommunityError(t("community.photoFailed", { error: error.message }));
  }
  const { data, error } = await client
    .from("posts")
    .insert({ body: input.body.trim(), visibility: input.visibility, image_path: imagePath, day_summary: input.daySummary })
    .select(POST_FIELDS)
    .single();
  if (error && imagePath) await client.storage.from(BUCKET).remove([imagePath]);
  fail(error);
  const [post] = await withExtras([data as unknown as Omit<Post, "liked" | "imageUrl">]);
  return post;
}

export async function deletePost(post: Post): Promise<void> {
  const client = await db();
  const { error } = await client.from("posts").delete().eq("id", post.id);
  fail(error);
  if (post.image_path) await client.storage.from(BUCKET).remove([post.image_path]);
}

export async function setLiked(postId: string, liked: boolean): Promise<void> {
  const client = await db();
  const { error } = liked
    ? await client.from("post_likes").insert({ post_id: postId })
    : await client.from("post_likes").delete().eq("post_id", postId).eq("user_id", await me());
  if (error?.code === "23505") return; // already liked (double tap)
  fail(error);
  if (liked) notify("like", postId);
}

export async function loadComments(postId: string): Promise<Comment[]> {
  const { data, error } = await (await db())
    .from("comments")
    .select("id, post_id, author, body, created_at, author_profile:profiles!comments_author_fkey(username, display_name, avatar_path)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(200);
  fail(error);
  return (data ?? []) as unknown as Comment[];
}

export async function addComment(postId: string, body: string): Promise<Comment> {
  const { data, error } = await (await db())
    .from("comments")
    .insert({ post_id: postId, body: body.trim() })
    .select("id, post_id, author, body, created_at, author_profile:profiles!comments_author_fkey(username, display_name, avatar_path)")
    .single();
  fail(error);
  notify("comment", (data as { id: string }).id);
  return data as unknown as Comment;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await (await db()).from("comments").delete().eq("id", id);
  fail(error);
}

export async function report(target: ReportTarget, id: string, reason: string): Promise<void> {
  const { error } = await (await db()).from("reports").insert({ target_type: target, target_id: id, reason: reason.slice(0, 500) });
  fail(error);
}

// ---- Chat -------------------------------------------------------------------------------------------

export async function loadConversations(): Promise<Conversation[]> {
  const { data, error } = await (await db()).rpc("my_conversations");
  fail(error);
  return (data ?? []) as Conversation[];
}

export async function loadMessages(other: string): Promise<Message[]> {
  const myId = await me();
  const { data, error } = await (await db())
    .from("messages")
    .select("id, sender, recipient, body, created_at, read_at")
    .or(`and(sender.eq.${myId},recipient.eq.${other}),and(sender.eq.${other},recipient.eq.${myId})`)
    .order("created_at", { ascending: false })
    .limit(100);
  fail(error);
  return ((data ?? []) as Message[]).reverse();
}

export async function sendMessage(recipient: string, body: string): Promise<Message> {
  const { data, error } = await (await db())
    .from("messages")
    .insert({ recipient, body: body.trim() })
    .select("id, sender, recipient, body, created_at, read_at")
    .single();
  fail(error);
  notify("message", (data as Message).id);
  return data as Message;
}

export async function markRead(other: string): Promise<void> {
  const { error } = await (await db()).rpc("mark_conversation_read", { other });
  fail(error);
}

/** Calls `onMessage` for every new message sent to me, live. Returns a function that stops listening. */
export function listenForMessages(myId: string, onMessage: (m: Message) => void): () => void {
  let stop = () => {};
  let stopped = false;
  void db().then((client) => {
    if (stopped) return;
    const channel = client
      .channel(`messages:${myId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient=eq.${myId}` }, (payload) =>
        onMessage(payload.new as Message),
      )
      .subscribe();
    stop = () => void client.removeChannel(channel);
  });
  return () => {
    stopped = true;
    stop();
  };
}

/** Unread messages and friend requests waiting for me, for the badge on the Community tab. */
export async function loadAlerts(): Promise<{ messages: number; requests: number }> {
  const client = await db();
  const myId = await me();
  const [unread, requests] = await Promise.all([
    client.from("messages").select("id", { count: "exact", head: true }).eq("recipient", myId).is("read_at", null),
    client.from("friendships").select("requester", { count: "exact", head: true }).eq("addressee", myId).eq("status", "pending"),
  ]);
  return { messages: unread.count ?? 0, requests: requests.count ?? 0 };
}

const alertListeners = new Set<() => void>();
/** Asks the badge to refresh now (e.g. after reading a conversation). */
export function refreshAlerts() {
  alertListeners.forEach((fn) => fn());
}

/** Keeps the Community badge up to date while signed in. */
export function useCommunityAlerts(userId: string | null): { messages: number; requests: number } {
  const [alerts, setAlerts] = useState({ messages: 0, requests: 0 });
  useEffect(() => {
    if (!userId) {
      setAlerts({ messages: 0, requests: 0 });
      return;
    }
    let cancelled = false;
    const refresh = () =>
      void loadAlerts()
        .then((a) => !cancelled && setAlerts(a))
        .catch(() => {}); // community not set up yet, or offline: no badge
    refresh();
    alertListeners.add(refresh);
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), 60_000);
    const stopListening = listenForMessages(userId, refresh);
    return () => {
      cancelled = true;
      alertListeners.delete(refresh);
      clearInterval(timer);
      stopListening();
    };
  }, [userId]);
  return alerts;
}

// ---- Notifications ----------------------------------------------------------------------------------

export type CommunityPushSupport = "web" | "ios-needs-home-screen" | "unsupported" | "native";

export function communityPushSupport(): CommunityPushSupport {
  // The iPhone app would need Apple push (APNs) for this; for now Community notifications are web-only.
  if (isNative) return "native";
  const support = reminderSupport().kind;
  return support === "native" ? "native" : support;
}

/** Turns Community notifications on or off for my account, and registers/unregisters this device. */
export async function setCommunityNotifications(on: boolean): Promise<void> {
  const client = await db();
  const myId = await me();
  if (on) await subscribeThisDevice();
  const { error } = await client.from("profiles").update({ notify: on, language: currentLanguage() }).eq("id", myId);
  fail(error);
  if (!on && !getState().reminders.enabled) await unsubscribeThisDevice().catch(() => {});
  actions.setCommunityPush(on);
}

/** Keeps the language of my notifications in step with the app's language. */
export async function syncNotificationLanguage(): Promise<void> {
  const client = await db();
  const myId = await me();
  await client.from("profiles").update({ language: currentLanguage() }).eq("id", myId);
}

// Photos aren't removed by the database when an account is deleted, so the app removes them first.
onBeforeDeleteAccount(async () => {
  const client = await db();
  const myId = await me();
  for (const bucket of [BUCKET, AVATARS]) {
    const { data } = await client.storage.from(bucket).list(myId, { limit: 1000 });
    const paths = (data ?? []).map((f) => `${myId}/${f.name}`);
    if (paths.length) await client.storage.from(bucket).remove(paths);
  }
});

// ---- Streak leaderboard ----------------------------------------------------------------------------

export interface StreakRow {
  user_id: string;
  current_days: number;
  longest_days: number;
  last_date: string | null;
  public: boolean;
  profiles: Profile;
}

/** A published streak as it stands today: one that ended before yesterday has run out. */
export function liveStreak(row: Pick<StreakRow, "current_days" | "last_date">, today = todayKey()): number {
  return row.last_date && row.last_date >= addDays(today, -1) ? row.current_days : 0;
}

/** Ranks rows by live streak, then best streak, giving equal streaks the same place (1, 1, 3). */
export function rankStreaks<T extends Pick<StreakRow, "current_days" | "longest_days" | "last_date">>(rows: T[], today = todayKey()): (T & { live: number; rank: number })[] {
  const sorted = rows
    .map((r) => ({ ...r, live: liveStreak(r, today) }))
    .sort((a, b) => b.live - a.live || b.longest_days - a.longest_days);
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => x.live === r.live) + 1 }));
}

/** What my diary says my streak is, in the shape the leaderboard stores. */
export function myStreakSnapshot(today = todayKey()): { current_days: number; longest_days: number; last_date: string | null } {
  const state = getState();
  const s = streak(state, today);
  let last: string | null = null;
  if (s.loggedToday) last = today;
  else if (s.current > 0) last = addDays(today, -1);
  else last = state.entries.reduce<string | null>((max, e) => (e.date <= today && (!max || e.date > max) ? e.date : max), null);
  return { current_days: s.current, longest_days: Math.max(s.longest, s.current), last_date: last };
}

const STREAK_COLUMNS = "user_id, current_days, longest_days, last_date, public, profiles!streaks_user_id_fkey(id, username, display_name, avatar_path)";

export async function loadMyStreak(): Promise<StreakRow | null> {
  const id = await me();
  const { data, error } = await (await db()).from("streaks").select(STREAK_COLUMNS).eq("user_id", id).maybeSingle();
  fail(error);
  return data as unknown as StreakRow | null;
}

let publishedKey = "";

/** Publishes my streak if it changed since last time. Needs a Community profile. */
export async function publishStreak(force = false): Promise<void> {
  if (!myProfile) return;
  const snapshot = myStreakSnapshot();
  const key = `${myProfile.id}:${JSON.stringify(snapshot)}`;
  if (!force && key === publishedKey) return;
  const { error } = await (await db())
    .from("streaks")
    .upsert({ user_id: myProfile.id, ...snapshot, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  fail(error);
  publishedKey = key;
}

/** Keeps my published streak in step with my diary while signed in with a Community profile. */
export function useStreakPublisher(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void publishStreak().catch(() => {}), 1500);
    };
    // My Community profile may not be loaded yet if neither Community nor Profile has been opened.
    if (myProfile === undefined) void loadMyProfile().catch(() => {});
    soon();
    const stopState = onStateChange(soon);
    profileListeners.add(soon);
    return () => {
      clearTimeout(timer);
      stopState();
      profileListeners.delete(soon);
    };
  }, [userId]);
}

export async function setStreakPublic(on: boolean): Promise<void> {
  await publishStreak(true);
  const { error } = await (await db()).from("streaks").update({ public: on }).eq("user_id", await me());
  fail(error);
}

/** Friends' streaks (and mine), or the global top 50 among people who joined it. */
export async function loadLeaderboard(kind: "friends" | "global", friendIds: string[], today = todayKey()): Promise<StreakRow[]> {
  const client = await db();
  let query = client.from("streaks").select(STREAK_COLUMNS);
  query =
    kind === "friends"
      ? query.in("user_id", [await me(), ...friendIds])
      : query.eq("public", true).gte("last_date", addDays(today, -1)).order("current_days", { ascending: false }).order("longest_days", { ascending: false }).limit(50);
  const { data, error } = await query;
  fail(error);
  return ((data ?? []) as unknown as StreakRow[]).filter((r) => r.profiles);
}

/** My place on the global board (people with a longer live streak, plus one). */
export async function myGlobalRank(current: number, today = todayKey()): Promise<number> {
  const { count, error } = await (await db())
    .from("streaks")
    .select("user_id", { count: "exact", head: true })
    .eq("public", true)
    .gte("last_date", addDays(today, -1))
    .gt("current_days", current);
  fail(error);
  return (count ?? 0) + 1;
}
