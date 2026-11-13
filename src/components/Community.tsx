import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { sumNutrients } from "../../shared/nutrition.ts";
import { useI18n } from "../i18n/index.ts";
import { cloudEnabled, useSession } from "../lib/cloud.ts";
import {
  addComment,
  answerFriendRequest,
  blockUser,
  communityPushSupport,
  createPost,
  createProfile,
  deleteComment,
  deletePost,
  listenForMessages,
  listenForReads,
  chatImageUrls,
  loadBlocked,
  loadComments,
  loadConnections,
  loadConversations,
  loadFeed,
  loadLeaderboard,
  loadMyStreak,
  myGlobalRank,
  myStreakSnapshot,
  publishStreak,
  rankStreaks,
  setStreakPublic,
  loadMessages,
  markRead,
  removeAvatar,
  refreshAlerts,
  removeFriend,
  report,
  searchPeople,
  sendFriendRequest,
  sendMessage,
  setAvatar,
  setCommunityNotifications,
  setLiked,
  syncNotificationLanguage,
  unblockUser,
  updateDisplayName,
  useMyProfile,
  avatarUrl,
  USERNAME_PATTERN,
  type Comment,
  type Connection,
  type Conversation,
  type DaySummary,
  type Message,
  type Post,
  type Profile,
  type ReportTarget,
  type StreakRow,
  type Visibility,
} from "../lib/community.ts";
import { timeAgo, todayKey } from "../lib/dates.ts";
import { photoForUpload } from "../lib/image.ts";
import { entriesForDate, getState, useAppState } from "../lib/store.ts";
import AvatarCropper from "./AvatarCropper.tsx";
import Sheet from "./Sheet.tsx";
import { Icon } from "./Icon.tsx";
import { LewCard } from "./LewCard.tsx";

type Section = "feed" | "chats" | "friends" | "leaderboard";
type Person = Pick<Profile, "id" | "username" | "display_name" | "avatar_path">;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Community({ onSignIn, alerts }: { onSignIn: () => void; alerts: { messages: number; requests: number } }) {
  const session = useSession();
  const { t } = useI18n();
  const userId = session?.user.id ?? null;
  // Shared with the Profile tab, so a new photo or name shows up everywhere at once.
  const { profile, error, retry: load } = useMyProfile(userId);

  if (!cloudEnabled || !userId) {
    return (
      <div className="page">
        <h1 className="page-title">{t("community.title")}</h1>
        <section className="card community-intro">
          <p className="community-emoji" aria-hidden="true"><Icon name="users" size={36} /></p>
          <h2 className="title">{t("community.introTitle")}</h2>
          <p className="muted">{cloudEnabled ? t("community.signInBody") : t("cloud.notSetUp")}</p>
          {cloudEnabled && (
            <button className="btn primary" onClick={onSignIn}>
              {t("community.signIn")}
            </button>
          )}
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">{t("community.title")}</h1>
        <section className="card">
          <p className="error">{error}</p>
          <button className="btn" onClick={load}>
            {t("community.retry")}
          </button>
        </section>
      </div>
    );
  }

  if (profile === undefined) {
    return (
      <div className="page center-page">
        <div className="spinner dark" />
      </div>
    );
  }

  if (profile === null) return <Setup />;
  return <Home profile={profile} alerts={alerts} />;
}

// ---- First visit: pick a username and agree to the rules -----------------------------------------

function Setup() {
  const { t } = useI18n();
  const { name } = useAppState();
  const [username, setUsername] = useState(() =>
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9_.]/g, "")
      .slice(0, 20),
  );
  const [displayName, setDisplayName] = useState(name);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = USERNAME_PATTERN.test(username);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createProfile(username, displayName || username); // updates the shared profile
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">{t("community.title")}</h1>
      <form className="card stack" onSubmit={submit}>
        <h2 className="title">{t("community.setupTitle")}</h2>
        <p className="muted small">{t("community.setupBody")}</p>
        <label className="stack">
          <span className="label">{t("community.username")}</span>
          <div className="input-prefix">
            <span aria-hidden="true">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20))}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>
          <span className={`small ${username && !valid ? "error" : "muted"}`}>{t("community.usernameRules")}</span>
        </label>
        <label className="stack">
          <span className="label">{t("community.displayName")}</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value.slice(0, 40))} />
        </label>
        <div className="rules">
          <p className="label">{t("community.rulesTitle")}</p>
          <ul className="small">
            <li>{t("community.rule1")}</li>
            <li>{t("community.rule2")}</li>
            <li>{t("community.rule3")}</li>
            <li>{t("community.rule4")}</li>
          </ul>
        </div>
        <label className="check">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span className="small">{t("community.agree")}</span>
        </label>
        {error && <p className="error small">{error}</p>}
        <button className="btn primary" disabled={!valid || !agreed || busy}>
          {busy ? t("common.pleaseWait") : t("community.join")}
        </button>
      </form>
    </div>
  );
}

// ---- Signed in with a profile -----------------------------------------------------------------------

export const SECTION_KEY = "foodtrack:communitySection"; // set when a notification (or a link elsewhere) opens a section

function initialSection(): Section {
  try {
    const saved = sessionStorage.getItem(SECTION_KEY);
    sessionStorage.removeItem(SECTION_KEY);
    if (saved === "chats" || saved === "friends" || saved === "leaderboard") return saved;
  } catch {
    // storage unavailable
  }
  return "feed";
}

function Home({ profile, alerts }: { profile: Profile; alerts: { messages: number; requests: number } }) {
  const { t } = useI18n();
  const { communityPush } = useAppState();
  const [section, setSection] = useState<Section>(initialSection);
  const [showNotify, setShowNotify] = useState(false);

  useEffect(() => {
    void syncNotificationLanguage().catch(() => {});
  }, []);
  const [chatWith, setChatWith] = useState<Person | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);

  const reloadConnections = useCallback(() => {
    loadConnections().then(setConnections, () => {});
    refreshAlerts();
  }, []);
  // Refresh whenever the person switches section or a new request/message arrives, so a just-accepted
  // friend's posts show up in the feed.
  useEffect(reloadConnections, [reloadConnections, section, alerts.requests]);

  const friends = connections.filter((c) => c.state === "friend");

  if (chatWith) {
    return (
      <ChatView
        me={profile}
        other={chatWith}
        onBack={() => {
          setChatWith(null);
          setSection("chats");
        }}
      />
    );
  }

  const tabs: { id: Section; label: string; badge: number }[] = [
    { id: "feed", label: t("community.feed"), badge: 0 },
    { id: "chats", label: t("community.chats"), badge: alerts.messages },
    { id: "friends", label: t("community.friends"), badge: alerts.requests },
    { id: "leaderboard", label: t("lb.tab"), badge: 0 },
  ];

  return (
    <div className="page community">
      <div className="row between">
        <h1 className="page-title">{t("community.title")}</h1>
        <span className="row gap-sm">
          <span className="muted small">@{profile.username}</span>
          <button className="icon-btn" onClick={() => setShowNotify(true)} aria-label={t("community.notifications")}>
            <Icon name={communityPush ? "bell" : "bell-off"} />
          </button>
        </span>
      </div>
      {showNotify && <NotifySheet onClose={() => setShowNotify(false)} />}
      <div className="segmented" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={section === tab.id}
            className={section === tab.id ? "active" : ""}
            onClick={() => setSection(tab.id)}
          >
            {tab.label}
            {tab.badge > 0 && <span className="badge-count">{tab.badge > 99 ? "99+" : tab.badge}</span>}
          </button>
        ))}
      </div>
      {section === "feed" && !communityPush && <NotifyPrompt onOpen={() => setShowNotify(true)} />}
      {section === "feed" && (
        <Feed me={profile} friendIds={friends.map((f) => f.id)} onFindFriends={() => setSection("friends")} onRefresh={reloadConnections} />
      )}
      {section === "chats" && <Chats friends={friends} onOpen={setChatWith} onFindFriends={() => setSection("friends")} />}
      {section === "friends" && (
        <Friends me={profile} connections={connections} reload={reloadConnections} onChat={setChatWith} />
      )}
      {section === "leaderboard" && <Leaderboard me={profile} friendIds={friends.map((f) => f.id)} onFindFriends={() => setSection("friends")} />}
    </div>
  );
}

// ---- Notifications ------------------------------------------------------------------------------------

const PROMPT_KEY = "foodtrack:communityNotifyPrompt";

function NotifyPrompt({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(PROMPT_KEY) === "dismissed" || communityPushSupport() === "native";
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(PROMPT_KEY, "dismissed");
    } catch {
      // storage unavailable: hide for now
    }
    setHidden(true);
  };
  return (
    <section className="card notify-prompt">
      <p className="small">
        <strong>{t("community.notifyTitle")}</strong>
        <br />
        <span className="muted">{t("community.notifyBody")}</span>
      </p>
      <div className="row gap">
        <button className="btn small-btn" onClick={dismiss}>
          {t("community.notifyLater")}
        </button>
        <button className="btn primary small-btn" onClick={onOpen}>
          {t("community.notifyTurnOn")}
        </button>
      </div>
    </section>
  );
}

function NotifySheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { communityPush } = useAppState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const support = communityPushSupport();

  async function toggle(on: boolean) {
    setBusy(true);
    setError("");
    try {
      await setCommunityNotifications(on);
      try {
        localStorage.setItem(PROMPT_KEY, "dismissed");
      } catch {
        // ignore
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("community.notifications")} onClose={onClose}>
      <div className="stack">
        <p className="muted small">{t("community.notifyBody")}</p>
        {support === "native" && <p className="small">{t("community.notifyNative")}</p>}
        {support === "ios-needs-home-screen" && <p className="small">{t("rem.iosHomeScreen")}</p>}
        {support === "unsupported" && <p className="small">{t("rem.unsupported")}</p>}
        {support === "web" &&
          (communityPush ? (
            <>
              <p className="small">{t("community.notifyOn")}</p>
              <button className="btn" disabled={busy} onClick={() => toggle(false)}>
                {t("rem.turnOff")}
              </button>
            </>
          ) : (
            <button className="btn primary" disabled={busy} onClick={() => toggle(true)}>
              {busy ? t("common.pleaseWait") : t("community.notifyTurnOn")}
            </button>
          ))}
        {error && <p className="error small">{error}</p>}
      </div>
    </Sheet>
  );
}

// ---- Shared bits ------------------------------------------------------------------------------------

export function Avatar({ name, path, size = "md" }: { name: string; path?: string | null; size?: "sm" | "md" | "lg" }) {
  const [broken, setBroken] = useState(false);
  const url = avatarUrl(path);
  if (url && !broken) {
    return <img className={`c-avatar ${size}`} src={url} alt="" loading="lazy" onError={() => setBroken(true)} />;
  }
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.codePointAt(0)!) % 360;
  return (
    <span className={`c-avatar ${size}`} style={{ background: `hsl(${hue} 55% 45%)` }} aria-hidden="true">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function PersonRow({ person, children }: { person: Pick<Profile, "username" | "display_name" | "avatar_path">; children?: React.ReactNode }) {
  return (
    <div className="person-row">
      <Avatar name={person.display_name || person.username} path={person.avatar_path} />
      <span className="person-name">
        <strong>{person.display_name || person.username}</strong>
        <span className="muted small">@{person.username}</span>
      </span>
      {children && <span className="person-actions">{children}</span>}
    </div>
  );
}

function ReportSheet({ target, id, onClose }: { target: ReportTarget; id: string; onClose: () => void }) {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const reasons = [t("community.reasonSpam"), t("community.reasonAbuse"), t("community.reasonInappropriate"), t("community.reasonOther")];

  async function send(reason: string) {
    setError("");
    try {
      await report(target, id, reason);
      setSent(true);
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <Sheet title={t("community.reportTitle")} onClose={onClose}>
      {sent ? (
        <>
          <p>{t("community.reportThanks")}</p>
          <button className="btn primary" onClick={onClose}>
            {t("common.done")}
          </button>
        </>
      ) : (
        <div className="stack">
          <p className="muted small">{t("community.reportBody")}</p>
          {reasons.map((r) => (
            <button key={r} className="btn" onClick={() => send(r)}>
              {r}
            </button>
          ))}
          {error && <p className="error small">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

// ---- Feed ---------------------------------------------------------------------------------------------

function Feed({
  me,
  friendIds,
  onFindFriends,
  onRefresh,
}: {
  me: Profile;
  friendIds: string[];
  onFindFriends: () => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<"friends" | "explore">("friends");
  const [posts, setPosts] = useState<Post[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<Post | null>(null);
  const friendKey = friendIds.join(",");

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setError("");
      try {
        const page = await loadFeed(kind, friendKey ? friendKey.split(",") : [], before);
        setPosts((prev) => (before ? [...prev, ...page.posts] : page.posts));
        setMore(page.more);
      } catch (e) {
        setError(message(e));
      } finally {
        setLoading(false);
      }
    },
    [kind, friendKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const update = (next: Post | null, id: string) => {
    setPosts((prev) => (next ? prev.map((p) => (p.id === id ? next : p)) : prev.filter((p) => p.id !== id)));
    setOpen((o) => (o?.id === id ? next : o));
  };

  return (
    <>
      <div className="row gap feed-head">
        <div className="chips">
          <button className={`chip-btn ${kind === "friends" ? "active" : ""}`} onClick={() => setKind("friends")}>
            <Icon name="users" size={16} /> {t("community.friendsFeed")}
          </button>
          <button className={`chip-btn ${kind === "explore" ? "active" : ""}`} onClick={() => setKind("explore")}>
            <Icon name="earth" size={16} /> {t("community.explore")}
          </button>
        </div>
        <button
          className="icon-btn"
          onClick={() => {
            onRefresh();
            void load();
          }}
          aria-label={t("community.refresh")}
        >
          ↻
        </button>
      </div>

      <button className="card composer-open" onClick={() => setComposing(true)}>
        <Avatar name={me.display_name || me.username} path={me.avatar_path} />
        <span className="muted">{t("community.composePrompt")}</span>
        <span className="composer-photo" aria-hidden="true">
          <Icon name="image" />
        </span>
      </button>

      {error && <p className="error small">{error}</p>}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} me={me} onChange={(next) => update(next, post.id)} onOpen={() => setOpen(post)} />
      ))}

      {loading && <div className="spinner dark center-spinner" />}
      {!loading && !error && posts.length === 0 && (
        <LewCard
          className="lew-empty"
          pose={kind === "friends" ? "wave" : "think"}
          text={kind === "friends" ? t("community.emptyFriends") : t("community.emptyExplore")}
          actions={
            kind === "friends" && (
              <>
                <button className="btn small-btn primary" onClick={onFindFriends}>
                  {t("community.findFriends")}
                </button>
                <button className="btn small-btn" onClick={() => setKind("explore")}>
                  {t("community.explore")}
                </button>
              </>
            )
          }
        />
      )}
      {more && !loading && (
        <button className="btn" onClick={() => void load(posts[posts.length - 1]?.created_at)}>
          {t("community.loadMore")}
        </button>
      )}

      {composing && (
        <Composer
          onClose={() => setComposing(false)}
          onPosted={(post) => {
            setComposing(false);
            if (kind === "friends" || post.visibility === "public") setPosts((prev) => [post, ...prev]);
          }}
        />
      )}
      {open && <PostSheet post={open} me={me} onClose={() => setOpen(null)} onChange={(next) => update(next, open.id)} />}
    </>
  );
}

function SummaryChip({ summary }: { summary: DaySummary }) {
  const { t, num } = useI18n();
  return (
    <div className="day-summary">
      <span><Icon name="flame" size={14} /> {t("community.summaryKcal", { kcal: num(summary.kcal), goal: num(summary.goal) })}</span>
      <span className="muted small">
        {t("abbr.protein")} {Math.round(summary.protein)}g · {t("abbr.carbs")} {Math.round(summary.carbs)}g · {t("abbr.fat")} {Math.round(summary.fat)}g
      </span>
    </div>
  );
}

function PostCard({ post, me, onChange, onOpen }: { post: Post; me: Profile; onChange: (p: Post | null) => void; onOpen?: () => void }) {
  const { t, locale } = useI18n();
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState<{ target: ReportTarget; id: string } | null>(null);
  const author = post.author_profile ?? { username: "?", display_name: "", avatar_path: null };
  const mine = post.author === me.id;

  async function toggleLike() {
    const liked = !post.liked;
    onChange({ ...post, liked, like_count: Math.max(0, post.like_count + (liked ? 1 : -1)) });
    try {
      await setLiked(post.id, liked);
    } catch {
      onChange(post); // undo
    }
  }

  async function remove() {
    setMenu(false);
    if (!confirm(t("community.deletePostConfirm"))) return;
    try {
      await deletePost(post);
      onChange(null);
    } catch (e) {
      alert(message(e));
    }
  }

  async function block() {
    setMenu(false);
    if (!confirm(t("community.blockConfirm", { name: author.display_name || author.username }))) return;
    try {
      await blockUser(post.author);
      onChange(null);
    } catch (e) {
      alert(message(e));
    }
  }

  return (
    <article className="card post">
      <header className="post-head">
        <Avatar name={author.display_name || author.username} path={author.avatar_path} />
        <span className="person-name">
          <strong>{author.display_name || author.username}</strong>
          <span className="muted small">
            @{author.username} · {timeAgo(Date.parse(post.created_at), locale)} ·{" "}
            <span title={post.visibility === "public" ? t("community.public") : t("community.friendsOnly")}>
              <Icon name={post.visibility === "public" ? "earth" : "users"} size={13} />
            </span>
          </span>
        </span>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label={t("community.more")}>
          <Icon name="more" />
        </button>
      </header>
      {post.body && <p className="post-body">{post.body}</p>}
      {post.day_summary && <SummaryChip summary={post.day_summary} />}
      {post.imageUrl && <img className="post-image" src={post.imageUrl} alt="" loading="lazy" />}
      <footer className="post-actions">
        <button className={`post-action ${post.liked ? "liked" : ""}`} onClick={toggleLike} aria-pressed={post.liked}>
          <Icon name="heart" /> {post.like_count > 0 && post.like_count}
          <span className="sr-only">{t("community.like")}</span>
        </button>
        <button className="post-action" onClick={onOpen} disabled={!onOpen}>
          <Icon name="message" /> {post.comment_count > 0 && post.comment_count}
          <span className="sr-only">{t("community.comments")}</span>
        </button>
      </footer>

      {menu && (
        <Sheet title={t("community.postOptions")} onClose={() => setMenu(false)}>
          <div className="stack">
            {mine ? (
              <button className="btn danger" onClick={remove}>
                {t("community.deletePost")}
              </button>
            ) : (
              <>
                <button
                  className="btn"
                  onClick={() => {
                    setMenu(false);
                    setReporting({ target: "post", id: post.id });
                  }}
                >
                  {t("community.reportPost")}
                </button>
                <button className="btn danger" onClick={block}>
                  {t("community.block", { name: author.display_name || author.username })}
                </button>
              </>
            )}
          </div>
        </Sheet>
      )}
      {reporting && <ReportSheet target={reporting.target} id={reporting.id} onClose={() => setReporting(null)} />}
    </article>
  );
}

function PostSheet({ post, me, onClose, onChange }: { post: Post; me: Profile; onClose: () => void; onChange: (p: Post | null) => void }) {
  const { t, locale } = useI18n();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);

  useEffect(() => {
    loadComments(post.id).then(setComments, (e) => setError(message(e)));
  }, [post.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const comment = await addComment(post.id, draft);
      setComments((prev) => [...(prev ?? []), comment]);
      onChange({ ...post, comment_count: post.comment_count + 1 });
      setDraft("");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Comment) {
    if (!confirm(t("community.deleteCommentConfirm"))) return;
    try {
      await deleteComment(c.id);
      setComments((prev) => (prev ?? []).filter((x) => x.id !== c.id));
      onChange({ ...post, comment_count: Math.max(0, post.comment_count - 1) });
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <Sheet title={t("community.comments")} onClose={onClose}>
      <PostCard
        post={post}
        me={me}
        onChange={(next) => {
          onChange(next);
          if (!next) onClose();
        }}
      />
      <div className="comments">
        {comments === null && !error && <div className="spinner dark center-spinner" />}
        {comments?.length === 0 && <p className="muted small center">{t("community.noComments")}</p>}
        {comments?.map((c) => {
          const who = c.author_profile ?? { username: "?", display_name: "", avatar_path: null };
          const canDelete = c.author === me.id || post.author === me.id;
          return (
            <div key={c.id} className="comment">
              <Avatar name={who.display_name || who.username} path={who.avatar_path} size="sm" />
              <div className="comment-bubble">
                <strong className="small">{who.display_name || who.username}</strong>
                <p>{c.body}</p>
                <span className="muted tiny">
                  {timeAgo(Date.parse(c.created_at), locale)}
                  {canDelete && (
                    <button className="link tiny" onClick={() => remove(c)}>
                      {t("common.delete")}
                    </button>
                  )}
                  {c.author !== me.id && (
                    <button className="link tiny" onClick={() => setReporting(c.id)}>
                      {t("community.report")}
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="error small">{error}</p>}
      <form className="row gap comment-form" onSubmit={submit}>
        <input
          className="grow"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
          placeholder={t("community.writeComment")}
          aria-label={t("community.writeComment")}
        />
        <button className="btn primary" disabled={busy || !draft.trim()}>
          {t("community.send")}
        </button>
      </form>
      {reporting && <ReportSheet target="comment" id={reporting} onClose={() => setReporting(null)} />}
    </Sheet>
  );
}

function todaySummary(): DaySummary {
  const state = getState();
  const total = sumNutrients(entriesForDate(state, todayKey()));
  return {
    kcal: Math.round(total.calories),
    goal: state.goals.calories,
    protein: Math.round(total.protein),
    carbs: Math.round(total.carbs),
    fat: Math.round(total.fat),
  };
}

function Composer({ onClose, onPosted }: { onClose: () => void; onPosted: (p: Post) => void }) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [withSummary, setWithSummary] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("friends");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const summary = todaySummary();

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await photoForUpload(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(message(err));
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      onPosted(await createPost({ body, visibility, image: photo?.blob ?? null, daySummary: withSummary ? summary : null }));
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  const canPost = (body.trim().length > 0 || photo !== null) && !busy;

  return (
    <Sheet title={t("community.newPost")} onClose={onClose}>
      <div className="stack">
        <textarea
          className="composer-text"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 2000))}
          placeholder={t("community.composePrompt")}
          rows={4}
          autoFocus
        />
        {photo && (
          <div className="composer-preview">
            <img src={photo.url} alt="" />
            <button className="icon-btn" onClick={() => setPhoto(null)} aria-label={t("community.removePhoto")}>
              <Icon name="x" />
            </button>
          </div>
        )}
        {withSummary && <SummaryChip summary={summary} />}
        <div className="row gap wrap">
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Icon name="image" size={18} /> {photo ? t("community.changePhoto") : t("community.addPhoto")}
          </button>
          {summary.kcal > 0 && (
            <label className="check">
              <input type="checkbox" checked={withSummary} onChange={(e) => setWithSummary(e.target.checked)} />
              <span className="small">{t("community.attachSummary")}</span>
            </label>
          )}
        </div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickPhoto} />
        <div>
          <p className="label">{t("community.whoCanSee")}</p>
          <div className="segmented" role="radiogroup">
            {(["friends", "public"] as Visibility[]).map((v) => (
              <button key={v} role="radio" aria-checked={visibility === v} className={visibility === v ? "active" : ""} onClick={() => setVisibility(v)}>
                <Icon name={v === "friends" ? "users" : "earth"} size={16} /> {v === "friends" ? t("community.friendsOnly") : t("community.public")}
              </button>
            ))}
          </div>
          <p className="muted tiny">{visibility === "friends" ? t("community.friendsOnlyHint") : t("community.publicHint")}</p>
        </div>
        {error && <p className="error small">{error}</p>}
        <button className="btn primary" disabled={!canPost} onClick={submit}>
          {busy ? t("common.pleaseWait") : t("community.post")}
        </button>
      </div>
    </Sheet>
  );
}

// ---- Friends ------------------------------------------------------------------------------------------

function Friends({
  me,
  connections,
  reload,
  onChat,
}: {
  me: Profile;
  connections: Connection[];
  reload: () => void;
  onChat: (p: Person) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Connection[] | null>(null);
  const [error, setError] = useState("");
  const [menuFor, setMenuFor] = useState<Connection | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Profile[] | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      searchPeople(query).then(setResults, (e) => setError(message(e)));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      reload();
      if (query.trim().length >= 2) setResults(await searchPeople(query));
    } catch (e) {
      setError(message(e));
    }
  }

  const incoming = connections.filter((c) => c.state === "incoming");
  const friends = connections.filter((c) => c.state === "friend");
  const outgoing = connections.filter((c) => c.state === "outgoing");

  function actionFor(c: Connection) {
    switch (c.state) {
      case "friend":
        return (
          <button className="btn small-btn" onClick={() => onChat(c)}>
            {t("community.message")}
          </button>
        );
      case "incoming":
        return (
          <button className="btn primary small-btn" onClick={() => act(() => answerFriendRequest(c.id, true))}>
            {t("community.accept")}
          </button>
        );
      case "outgoing":
        return (
          <button className="btn small-btn" onClick={() => act(() => removeFriend(c.id))}>
            {t("community.cancelRequest")}
          </button>
        );
      default:
        return (
          <button className="btn primary small-btn" onClick={() => act(() => sendFriendRequest(c.id))}>
            {t("community.addFriend")}
          </button>
        );
    }
  }

  return (
    <>
      <section className="card">
        <p className="small muted">{t("community.yourHandle")}</p>
        <PersonRow person={me}>
          <button className="btn small-btn" onClick={() => setEditing(true)}>
            {t("community.editProfile")}
          </button>
        </PersonRow>
      </section>
      {editing && <EditProfile me={me} onClose={() => setEditing(false)} />}

      <input
        className="search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("community.searchPeople")}
        aria-label={t("community.searchPeople")}
        autoCapitalize="off"
      />
      {error && <p className="error small">{error}</p>}

      {results && (
        <section className="card list">
          {results.length === 0 && <p className="muted small">{t("community.noPeople")}</p>}
          {results.map((r) => (
            <PersonRow key={r.id} person={r}>
              {actionFor(r)}
            </PersonRow>
          ))}
        </section>
      )}

      {incoming.length > 0 && (
        <section className="card list">
          <h2 className="title">{t("community.requests")}</h2>
          {incoming.map((c) => (
            <PersonRow key={c.id} person={c}>
              <button className="btn small-btn" onClick={() => act(() => answerFriendRequest(c.id, false))}>
                {t("community.decline")}
              </button>
              <button className="btn primary small-btn" onClick={() => act(() => answerFriendRequest(c.id, true))}>
                {t("community.accept")}
              </button>
            </PersonRow>
          ))}
        </section>
      )}

      <section className="card list">
        <h2 className="title">
          {t("community.friends")} <span className="muted small">{friends.length}</span>
        </h2>
        {friends.length === 0 && <p className="muted small">{t("community.noFriends")}</p>}
        {friends.map((c) => (
          <PersonRow key={c.id} person={c}>
            <button className="btn small-btn" onClick={() => onChat(c)}>
              {t("community.message")}
            </button>
            <button className="icon-btn" onClick={() => setMenuFor(c)} aria-label={t("community.more")}>
              <Icon name="more" />
            </button>
          </PersonRow>
        ))}
      </section>

      {outgoing.length > 0 && (
        <section className="card list">
          <h2 className="title">{t("community.sent")}</h2>
          {outgoing.map((c) => (
            <PersonRow key={c.id} person={c}>
              {actionFor(c)}
            </PersonRow>
          ))}
        </section>
      )}

      <section className="card list">
        <button className="link" onClick={() => (blocked ? setBlocked(null) : loadBlocked().then(setBlocked, (e) => setError(message(e))))}>
          {blocked ? t("community.hideBlocked") : t("community.showBlocked")}
        </button>
        {blocked?.length === 0 && <p className="muted small">{t("community.noBlocked")}</p>}
        {blocked?.map((b) => (
          <PersonRow key={b.id} person={b}>
            <button
              className="btn small-btn"
              onClick={() =>
                act(async () => {
                  await unblockUser(b.id);
                  setBlocked((prev) => (prev ?? []).filter((x) => x.id !== b.id));
                })
              }
            >
              {t("community.unblock")}
            </button>
          </PersonRow>
        ))}
      </section>

      {menuFor && (
        <Sheet title={menuFor.display_name || menuFor.username} onClose={() => setMenuFor(null)}>
          <div className="stack">
            <button
              className="btn"
              onClick={() => {
                const c = menuFor;
                setMenuFor(null);
                if (confirm(t("community.unfriendConfirm", { name: c.display_name || c.username }))) void act(() => removeFriend(c.id));
              }}
            >
              {t("community.unfriend")}
            </button>
            <button
              className="btn"
              onClick={() => {
                setReporting(menuFor.id);
                setMenuFor(null);
              }}
            >
              {t("community.reportUser")}
            </button>
            <button
              className="btn danger"
              onClick={() => {
                const c = menuFor;
                setMenuFor(null);
                if (confirm(t("community.blockConfirm", { name: c.display_name || c.username }))) void act(() => blockUser(c.id));
              }}
            >
              {t("community.block", { name: menuFor.display_name || menuFor.username })}
            </button>
          </div>
        </Sheet>
      )}
      {reporting && <ReportSheet target="user" id={reporting} onClose={() => setReporting(null)} />}
    </>
  );
}

export function EditProfile({ me, onClose }: { me: Profile; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(me.display_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const [cropping, setCropping] = useState<File | null>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setCropping(file);
  }

  return (
    <Sheet title={t("community.editProfile")} onClose={onClose}>
      <div className="stack edit-profile">
        <div className="edit-avatar">
          <Avatar name={me.display_name || me.username} path={me.avatar_path} size="lg" />
          <div className="stack">
            <button className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
              <Icon name="camera" size={18} /> {me.avatar_path ? t("community.changeAvatar") : t("community.addAvatar")}
            </button>
            {me.avatar_path && (
              <button className="btn danger" disabled={busy} onClick={() => run(removeAvatar)}>
                {t("community.removeAvatar")}
              </button>
            )}
          </div>
        </div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={pick} />
        {cropping && (
          <AvatarCropper
            file={cropping}
            onCancel={() => setCropping(null)}
            onDone={(photo) => {
              setCropping(null);
              void run(() => setAvatar(photo));
            }}
          />
        )}
        <label className="stack">
          <span className="label">{t("community.displayName")}</span>
          <div className="row gap">
            <input className="grow" value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} />
            <button className="btn" disabled={busy || !name.trim() || name.trim() === me.display_name} onClick={() => run(() => updateDisplayName(name))}>
              {t("common.save")}
            </button>
          </div>
        </label>
        <p className="muted small">@{me.username}</p>
        {busy && <p className="muted small">{t("common.pleaseWait")}</p>}
        {saved && !busy && <p className="small">{t("common.saved")}</p>}
        {error && <p className="error small">{error}</p>}
      </div>
    </Sheet>
  );
}

// ---- Chat -----------------------------------------------------------------------------------------------

function Chats({ friends, onOpen, onFindFriends }: { friends: Connection[]; onOpen: (p: Person) => void; onFindFriends: () => void }) {
  const { t, locale } = useI18n();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadConversations().then(setList, (e) => setError(message(e)));
  }, []);

  const talkedTo = new Set((list ?? []).map((c) => c.other));
  const others = friends.filter((f) => !talkedTo.has(f.id));

  return (
    <>
      {error && <p className="error small">{error}</p>}
      {list === null && !error && <div className="spinner dark center-spinner" />}
      {list && list.length > 0 && (
        <section className="card list">
          {list.map((c) => (
            <button key={c.other} className="conversation" onClick={() => onOpen({ id: c.other, username: c.username, display_name: c.display_name, avatar_path: c.avatar_path })}>
              <Avatar name={c.display_name || c.username} path={c.avatar_path} />
              <span className="person-name">
                <strong>{c.display_name || c.username}</strong>
                <span className={`small ${c.unread ? "" : "muted"} ellipsis`}>
                  {c.last_from_me && typeof c.last_read === "boolean" && (
                    <span className={`tick ${c.last_read ? "seen" : ""}`} role="img" aria-label={c.last_read ? t("community.seen") : t("community.msgSent")}>
                      <Icon name={c.last_read ? "check-check" : "check"} size={14} strokeWidth={c.last_read ? 3 : 1.75} />
                    </span>
                  )}
                  {c.last_from_me ? `${t("community.you")}: ` : ""}
                  {c.last_body || (
                    <>
                      <Icon name="image" size={14} className="inline-ic" /> {t("community.photo")}
                    </>
                  )}
                </span>
              </span>
              <span className="conversation-meta">
                <span className="muted tiny">{timeAgo(Date.parse(c.last_at), locale)}</span>
                {c.unread > 0 && <span className="badge-count">{c.unread}</span>}
              </span>
            </button>
          ))}
        </section>
      )}
      {list && others.length > 0 && (
        <section className="card list">
          <h2 className="title">{t("community.startChat")}</h2>
          {others.map((f) => (
            <PersonRow key={f.id} person={f}>
              <button className="btn small-btn" onClick={() => onOpen(f)}>
                {t("community.message")}
              </button>
            </PersonRow>
          ))}
        </section>
      )}
      {list && list.length === 0 && friends.length === 0 && (
        <LewCard
          className="lew-empty"
          pose="wave"
          text={t("community.noChats")}
          actions={
            <button className="btn small-btn primary" onClick={onFindFriends}>
              {t("community.findFriends")}
            </button>
          }
        />
      )}
    </>
  );
}

function ChatView({ me, other, onBack }: { me: Profile; other: Person; onBack: () => void }) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  // Links for the photos in this chat (private files, so each one needs a signed link).
  const photoPaths = (messages ?? []).flatMap((m) => (m.image_path ? [m.image_path] : []));
  const photoKey = photoPaths.join("|");
  useEffect(() => {
    if (!photoPaths.length) return;
    let active = true;
    chatImageUrls(photoPaths).then((u) => active && setUrls((prev) => ({ ...prev, ...u })), () => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await photoForUpload(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(message(err));
    }
  }

  useEffect(() => {
    let active = true;
    loadMessages(other.id).then(
      (m) => active && setMessages(m),
      (e) => active && setError(message(e)),
    );
    void markRead(other.id).then(refreshAlerts, () => {});
    const stop = listenForMessages(me.id, (m) => {
      if (m.sender !== other.id) return;
      setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
      void markRead(other.id).then(refreshAlerts, () => {});
    });
    // My messages turn "seen" as soon as they open them.
    const stopReads = listenForReads(me.id, (m) => {
      if (m.recipient !== other.id) return;
      setMessages((prev) => prev?.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x)) ?? prev);
    });
    // Coming back to the app: catch up on anything missed while it was in the background.
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      loadMessages(other.id).then((m) => active && setMessages(m), () => {});
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      active = false;
      stop();
      stopReads();
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [me.id, other.id]);

  const lastMine = messages ? [...messages].reverse().find((m) => m.sender === me.id) : undefined;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if ((!body && !photo) || sending) return;
    const attached = photo;
    setDraft("");
    setError("");
    setSending(true);
    try {
      const sent = await sendMessage(other.id, body, attached?.blob);
      setMessages((prev) => [...(prev ?? []), sent]);
      setPhoto(null);
    } catch (err) {
      setDraft(body);
      setError(message(err));
    } finally {
      setSending(false);
    }
  }

  let lastDay = "";
  return (
    <div className="page chat">
      <header className="chat-head">
        <button className="icon-btn" onClick={onBack} aria-label={t("common.back")}>
          <Icon name="chevron-left" size={22} />
        </button>
        <PersonRow person={other} />
        <button className="link small" onClick={() => setReporting(true)}>
          {t("community.report")}
        </button>
      </header>
      <div className="chat-log" aria-live="polite">
        {messages === null && !error && <div className="spinner dark center-spinner" />}
        {messages?.length === 0 && <p className="muted small center">{t("community.sayHi", { name: other.display_name || other.username })}</p>}
        {messages?.map((m) => {
          const day = new Date(m.created_at).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <p className="chat-day muted tiny">{day}</p>}
              <div className={`bubble ${m.sender === me.id ? "mine" : "theirs"} ${m.image_path ? "has-photo" : ""}`}>
                {m.image_path && (
                  <button className="bubble-photo" onClick={() => urls[m.image_path!] && setViewing(urls[m.image_path!])} aria-label={t("community.openPhoto")}>
                    {urls[m.image_path] ? <img src={urls[m.image_path]} alt="" onLoad={() => endRef.current?.scrollIntoView({ block: "end" })} /> : <span className="bubble-photo-wait" />}
                  </button>
                )}
                {m.body && <span>{m.body}</span>}
                <span className="bubble-time">
                  {new Date(m.created_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                  {m.sender === me.id && (
                    <span className={`tick ${m.read_at ? "seen" : ""}`} role="img" aria-label={m.read_at ? t("community.seen") : t("community.msgSent")}>
                      <Icon name={m.read_at ? "check-check" : "check"} size={14} strokeWidth={m.read_at ? 3 : 1.75} />
                    </span>
                  )}
                </span>
              </div>
              {m === lastMine && (
                <p className={`chat-status tiny ${m.read_at ? "seen" : "muted"}`}>
                  {m.read_at
                    ? t("community.seenAt", { time: new Date(m.read_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) })
                    : t("community.msgSent")}
                </p>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {error && <p className="error small">{error}</p>}
      <form className="chat-form" onSubmit={submit}>
        {photo && (
          <div className="chat-attach">
            <img src={photo.url} alt="" />
            <button type="button" className="chat-attach-remove" onClick={() => setPhoto(null)} aria-label={t("community.removePhoto")}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        <div className="row gap">
          <button type="button" className="icon-btn chat-photo-btn" onClick={() => photoInput.current?.click()} aria-label={t("community.addPhoto")} disabled={sending}>
            <Icon name="image" size={20} />
          </button>
          <input
            className="grow"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            placeholder={photo ? t("community.addCaption") : t("community.writeMessage")}
            aria-label={t("community.writeMessage")}
          />
          <button className="btn primary" disabled={(!draft.trim() && !photo) || sending}>
            {sending ? <span className="spinner small-spinner" /> : t("community.send")}
          </button>
        </div>
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e)} />
      </form>
      {viewing && createPortal(
        <div className="photo-viewer" role="dialog" aria-modal="true" onClick={() => setViewing(null)}>
          <img src={viewing} alt="" />
          <button className="close-btn" aria-label={t("common.close")}>
            <Icon name="x" size={20} />
          </button>
        </div>,
        document.body,
      )}
      {reporting && <ReportSheet target="user" id={other.id} onClose={() => setReporting(false)} />}
    </div>
  );
}

// ---- Streak leaderboard ----------------------------------------------------------------------------

type Ranked = ReturnType<typeof rankStreaks<StreakRow>>[number];

function Leaderboard({ me, friendIds, onFindFriends }: { me: Profile; friendIds: string[]; onFindFriends: () => void }) {
  const { t, tp, num } = useI18n();
  const state = useAppState();
  const [board, setBoard] = useState<"friends" | "global">("friends");
  const [rows, setRows] = useState<Ranked[] | null>(null);
  const [mine, setMine] = useState<StreakRow | null | undefined>(undefined);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null); // the switch moves at once, before the save finishes
  const snapshot = myStreakSnapshot();
  const friendKey = friendIds.join(",");

  const load = useCallback(async () => {
    setError("");
    try {
      await publishStreak();
      const [list, own] = await Promise.all([loadLeaderboard(board, friendKey ? friendKey.split(",") : []), loadMyStreak()]);
      setRows(rankStreaks(list));
      setMine(own);
      setMyRank(board === "global" && own?.public && snapshot.current_days > 0 ? await myGlobalRank(snapshot.current_days) : null);
    } catch (e) {
      setError(message(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, friendKey, snapshot.current_days, state.entries.length]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  async function togglePublic(on: boolean) {
    setBusy(true);
    setOptimistic(on);
    try {
      await setStreakPublic(on);
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setOptimistic(null);
      setBusy(false);
    }
  }

  const listed = rows?.some((r) => r.user_id === me.id) ?? false;

  return (
    <>
      <section className="card lb-me">
        <div className="row gap">
          <span className="lb-flame" aria-hidden="true">
            <Icon name="flame" size={28} />
          </span>
          <div className="lb-me-text">
            <strong>{tp("streak.days", snapshot.current_days)}</strong>
            <span className="muted small">{t("lb.best", { n: num(snapshot.longest_days) })}</span>
          </div>
        </div>
        <label className="check lb-public">
          <input
            type="checkbox"
            checked={optimistic ?? Boolean(mine?.public)}
            disabled={busy || mine === undefined}
            onChange={(e) => void togglePublic(e.target.checked)}
          />
          <span>
            <span>{t("lb.joinGlobal")}</span>
            <span className="muted small">{t("lb.joinGlobalHelp")}</span>
          </span>
        </label>
      </section>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={board === "friends"} className={board === "friends" ? "active" : ""} onClick={() => setBoard("friends")}>
          <Icon name="users" size={16} /> {t("lb.friends")}
        </button>
        <button role="tab" aria-selected={board === "global"} className={board === "global" ? "active" : ""} onClick={() => setBoard("global")}>
          <Icon name="earth" size={16} /> {t("lb.global")}
        </button>
      </div>

      {error && (
        <div className="card">
          <p className="error small">{error}</p>
          <button className="btn" onClick={() => void load()}>
            {t("community.retry")}
          </button>
        </div>
      )}

      {rows === null && !error ? (
        <div className="center-page">
          <div className="spinner dark" />
        </div>
      ) : (
        rows && (
          <>
            {rows.length > 0 && (
              <ol className="card lb-list">
                {rows.map((r) => (
                  <LeaderRow key={r.user_id} row={r} isMe={r.user_id === me.id} />
                ))}
              </ol>
            )}
            {board === "friends" && friendIds.length === 0 && (
              <LewCard
                className="lew-empty"
                pose="point"
                text={t("lb.emptyFriends")}
                actions={
                  <button className="btn small-btn primary" onClick={onFindFriends}>
                    {t("community.findFriends")}
                  </button>
                }
              />
            )}
            {board === "global" && rows.length === 0 && <p className="muted small center">{t("lb.emptyGlobal")}</p>}
            {board === "global" && !listed && (
              <p className="muted small center">
                {!mine?.public ? t("lb.notJoined") : snapshot.current_days === 0 ? t("lb.noStreak") : myRank ? t("lb.yourRank", { n: num(myRank) }) : ""}
              </p>
            )}
          </>
        )
      )}
    </>
  );
}


function LeaderRow({ row, isMe }: { row: Ranked; isMe: boolean }) {
  const { t, num } = useI18n();
  const p = row.profiles;
  return (
    <li className={`lb-row ${isMe ? "me" : ""}`}>
      <span className={`lb-rank ${row.live > 0 && row.rank <= 3 ? `top top-${row.rank}` : ""}`}>{row.live > 0 ? row.rank : "–"}</span>
      <Avatar name={p.display_name || p.username} path={p.avatar_path} size="sm" />
      <span className="person-name">
        <strong>
          {p.display_name || p.username}
          {isMe && <span className="lb-you"> · {t("lb.you")}</span>}
        </strong>
        <span className="muted small">{t("lb.best", { n: num(row.longest_days) })}</span>
      </span>
      <span className={`lb-days ${row.live === 0 ? "muted" : ""}`}><Icon name="flame" size={16} /> {num(row.live)}</span>
    </li>
  );
}
