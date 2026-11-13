// Push notifications for the Community tab: new messages, friend requests, comments and likes.
//
// After doing something (sending a message, commenting…) the app calls POST /api/community/notify
// with what it did. We never trust that report: the event is looked up in the database with the
// service key, and we only notify when it really exists, was done by the caller just now, and the
// other person wants notifications and hasn't blocked them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isLang, type Lang } from "../shared/languages.ts";
import type { PushMessage, PushSubscriptionRow } from "./push.ts";

export const NOTIFY_KINDS = ["message", "comment", "like", "friend_request", "friend_accept"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export function isNotifyKind(value: unknown): value is NotifyKind {
  return typeof value === "string" && (NOTIFY_KINDS as readonly string[]).includes(value);
}

interface ProfileRow {
  username: string;
  display_name: string;
  notify: boolean;
  language: string | null;
}

export interface CommunityDeps {
  message(id: string): Promise<{ sender: string; recipient: string; body: string; created_at: string; image_path?: string | null } | null>;
  comment(id: string): Promise<{ author: string; body: string; created_at: string; post_author: string } | null>;
  like(postId: string, userId: string): Promise<{ created_at: string; post_author: string } | null>;
  friendship(requester: string, addressee: string): Promise<{ status: string; created_at: string } | null>;
  profile(id: string): Promise<ProfileRow | null>;
  blocked(a: string, b: string): Promise<boolean>;
}

// ---- Texts ------------------------------------------------------------------------------------------

type Texts = {
  message: string; // title is the sender's name; body is the message
  comment: string;
  like: string;
  friend_request: string;
  friend_accept: string;
};

const TEXTS: Record<Lang, Texts> = {
  en: { message: "💬 {name}", comment: "💬 {name} commented on your post", like: "❤️ {name} liked your post", friend_request: "👋 {name} wants to be your friend", friend_accept: "🤝 {name} accepted your friend request" },
  vi: { message: "💬 {name}", comment: "💬 {name} đã bình luận bài viết của bạn", like: "❤️ {name} đã thích bài viết của bạn", friend_request: "👋 {name} muốn kết bạn với bạn", friend_accept: "🤝 {name} đã chấp nhận lời mời kết bạn" },
  es: { message: "💬 {name}", comment: "💬 {name} comentó tu publicación", like: "❤️ A {name} le gustó tu publicación", friend_request: "👋 {name} quiere ser tu amigo", friend_accept: "🤝 {name} aceptó tu solicitud de amistad" },
  pt: { message: "💬 {name}", comment: "💬 {name} comentou sua publicação", like: "❤️ {name} curtiu sua publicação", friend_request: "👋 {name} quer ser seu amigo", friend_accept: "🤝 {name} aceitou sua solicitação de amizade" },
  fr: { message: "💬 {name}", comment: "💬 {name} a commenté votre publication", like: "❤️ {name} a aimé votre publication", friend_request: "👋 {name} veut devenir votre ami", friend_accept: "🤝 {name} a accepté votre demande d'ami" },
  de: { message: "💬 {name}", comment: "💬 {name} hat deinen Beitrag kommentiert", like: "❤️ {name} gefällt dein Beitrag", friend_request: "👋 {name} möchte mit dir befreundet sein", friend_accept: "🤝 {name} hat deine Freundschaftsanfrage angenommen" },
  zh: { message: "💬 {name}", comment: "💬 {name} 评论了你的动态", like: "❤️ {name} 赞了你的动态", friend_request: "👋 {name} 想加你为好友", friend_accept: "🤝 {name} 接受了你的好友请求" },
  ja: { message: "💬 {name}さん", comment: "💬 {name}さんがあなたの投稿にコメントしました", like: "❤️ {name}さんがあなたの投稿にいいねしました", friend_request: "👋 {name}さんから友達リクエストが届きました", friend_accept: "🤝 {name}さんが友達リクエストを承認しました" },
  ko: { message: "💬 {name}님", comment: "💬 {name}님이 회원님의 게시물에 댓글을 남겼어요", like: "❤️ {name}님이 회원님의 게시물을 좋아해요", friend_request: "👋 {name}님이 친구 요청을 보냈어요", friend_accept: "🤝 {name}님이 친구 요청을 수락했어요" },
};

const preview = (text: string, max = 120) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// ---- Deciding who to notify ---------------------------------------------------------------------------

const FRESH_MS = 10 * 60 * 1000; // only events from the last few minutes (no replaying old ones)

const PHOTO: Record<Lang, string> = {
  en: "📷 Sent a photo",
  vi: "📷 Đã gửi một ảnh",
  es: "📷 Envió una foto",
  pt: "📷 Enviou uma foto",
  fr: "📷 A envoyé une photo",
  de: "📷 Hat ein Foto gesendet",
  zh: "📷 发来一张照片",
  ja: "📷 写真を送信しました",
  ko: "📷 사진을 보냈어요",
};

export interface Notification {
  to: string;
  message: PushMessage;
}

/** Works out the notification for something `actor` just did, or null if there's nothing to send. */
export async function buildNotification(
  deps: CommunityDeps,
  actor: string,
  kind: NotifyKind,
  id: string,
  now = Date.now(),
): Promise<Notification | null> {
  const fresh = (iso: string) => now - Date.parse(iso) < FRESH_MS;
  let to: string;
  let body = "";
  let section = "feed";
  let photo = false; // a chat photo without text

  switch (kind) {
    case "message": {
      const m = await deps.message(id);
      if (!m || m.sender !== actor || !fresh(m.created_at)) return null;
      to = m.recipient;
      body = preview(m.body);
      photo = !m.body.trim() && Boolean(m.image_path);
      section = "chats";
      break;
    }
    case "comment": {
      const c = await deps.comment(id);
      if (!c || c.author !== actor || !fresh(c.created_at)) return null;
      to = c.post_author;
      body = preview(c.body);
      break;
    }
    case "like": {
      const l = await deps.like(id, actor);
      if (!l || !fresh(l.created_at)) return null;
      to = l.post_author;
      break;
    }
    case "friend_request": {
      const f = await deps.friendship(actor, id);
      if (!f || f.status !== "pending" || !fresh(f.created_at)) return null;
      to = id;
      section = "friends";
      break;
    }
    case "friend_accept": {
      const f = await deps.friendship(id, actor);
      if (!f || f.status !== "accepted") return null;
      to = id;
      section = "friends";
      break;
    }
  }

  if (to === actor) return null; // liking or commenting on your own post
  const [recipient, sender] = await Promise.all([deps.profile(to), deps.profile(actor)]);
  if (!recipient || !sender || !recipient.notify) return null;
  if (await deps.blocked(actor, to)) return null;

  const lang = isLang(recipient.language) ? recipient.language : "en";
  const texts = TEXTS[lang];
  if (photo) body = PHOTO[lang];
  const name = sender.display_name || sender.username;
  const title = texts[kind].replace("{name}", name);
  return {
    to,
    message: {
      title,
      body,
      url: `/?tab=community&section=${section}`,
      // One notification per conversation / post that updates, instead of a pile.
      tag: kind === "message" ? `chat-${actor}` : kind === "comment" || kind === "like" ? `post-${kind}-${id}` : `friend-${actor}`,
    },
  };
}

// ---- Supabase-backed deps -------------------------------------------------------------------------------

export function supabaseCommunityDeps(db: SupabaseClient): CommunityDeps {
  const one = async <T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null> => {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    message: (id) => one(db.from("messages").select("*").eq("id", id).maybeSingle()),
    async comment(id) {
      const row = await one<{ author: string; body: string; created_at: string; post: { author: string } | null }>(
        db.from("comments").select("author, body, created_at, post:posts!comments_post_id_fkey(author)").eq("id", id).maybeSingle() as never,
      );
      return row?.post ? { author: row.author, body: row.body, created_at: row.created_at, post_author: row.post.author } : null;
    },
    async like(postId, userId) {
      const row = await one<{ created_at: string; post: { author: string } | null }>(
        db.from("post_likes").select("created_at, post:posts!post_likes_post_id_fkey(author)").eq("post_id", postId).eq("user_id", userId).maybeSingle() as never,
      );
      return row?.post ? { created_at: row.created_at, post_author: row.post.author } : null;
    },
    friendship: (requester, addressee) =>
      one(db.from("friendships").select("status, created_at").eq("requester", requester).eq("addressee", addressee).maybeSingle()),
    profile: (id) => one(db.from("profiles").select("username, display_name, notify, language").eq("id", id).maybeSingle()),
    async blocked(a, b) {
      const { count, error } = await db
        .from("blocks")
        .select("blocker", { count: "exact", head: true })
        .or(`and(blocker.eq.${a},blocked.eq.${b}),and(blocker.eq.${b},blocked.eq.${a})`);
      if (error) throw new Error(error.message);
      return (count ?? 0) > 0;
    },
  };
}

/** Remembers what was already notified, so toggling a like on and off doesn't send it again. */
export class SentOnce {
  private seen = new Map<string, number>();
  constructor(private readonly ttlMs = 24 * 60 * 60 * 1000) {}
  first(key: string, now = Date.now()): boolean {
    if (this.seen.size > 50_000) {
      for (const [k, at] of this.seen) if (now - at > this.ttlMs) this.seen.delete(k);
    }
    const at = this.seen.get(key);
    if (at !== undefined && now - at < this.ttlMs) return false;
    this.seen.set(key, now);
    return true;
  }
}

export type { PushSubscriptionRow };
