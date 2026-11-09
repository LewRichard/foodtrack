import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { sumNutrients } from "../../shared/nutrition.ts";
import { useI18n } from "../i18n/index.ts";
import { cloudEnabled, useSession } from "../lib/cloud.ts";
import {
  addComment,
  answerFriendRequest,
  blockUser,
  createPost,
  createProfile,
  deleteComment,
  deletePost,
  listenForMessages,
  loadBlocked,
  loadComments,
  loadConnections,
  loadConversations,
  loadFeed,
  loadMessages,
  loadMyProfile,
  markRead,
  refreshAlerts,
  removeFriend,
  report,
  searchPeople,
  sendFriendRequest,
  sendMessage,
  setLiked,
  unblockUser,
  USERNAME_PATTERN,
  type Comment,
  type Connection,
  type Conversation,
  type DaySummary,
  type Message,
  type Post,
  type Profile,
  type ReportTarget,
  type Visibility,
} from "../lib/community.ts";
import { timeAgo, todayKey } from "../lib/dates.ts";
import { photoForUpload } from "../lib/image.ts";
import { entriesForDate, getState, useAppState } from "../lib/store.ts";
import Sheet from "./Sheet.tsx";

type Section = "feed" | "chats" | "friends";
type Person = Pick<Profile, "id" | "username" | "display_name">;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Community({ onSignIn, alerts }: { onSignIn: () => void; alerts: { messages: number; requests: number } }) {
  const session = useSession();
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState("");
  const userId = session?.user.id ?? null;

  const load = useCallback(() => {
    setError("");
    setProfile(undefined);
    loadMyProfile().then(setProfile, (e) => setError(message(e)));
  }, []);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  if (!cloudEnabled || !userId) {
    return (
      <div className="page">
        <h1 className="page-title">{t("community.title")}</h1>
        <section className="card community-intro">
          <p className="community-emoji" aria-hidden="true">👋</p>
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

  if (profile === null) return <Setup onCreated={setProfile} />;
  return <Home profile={profile} alerts={alerts} />;
}

// ---- First visit: pick a username and agree to the rules -----------------------------------------

function Setup({ onCreated }: { onCreated: (p: Profile) => void }) {
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
      onCreated(await createProfile(username, displayName || username));
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

function Home({ profile, alerts }: { profile: Profile; alerts: { messages: number; requests: number } }) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("feed");
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
  ];

  return (
    <div className="page community">
      <div className="row between">
        <h1 className="page-title">{t("community.title")}</h1>
        <span className="muted small">@{profile.username}</span>
      </div>
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
      {section === "feed" && (
        <Feed me={profile} friendIds={friends.map((f) => f.id)} onFindFriends={() => setSection("friends")} onRefresh={reloadConnections} />
      )}
      {section === "chats" && <Chats friends={friends} onOpen={setChatWith} onFindFriends={() => setSection("friends")} />}
      {section === "friends" && (
        <Friends me={profile} connections={connections} reload={reloadConnections} onChat={setChatWith} />
      )}
    </div>
  );
}

// ---- Shared bits ------------------------------------------------------------------------------------

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.codePointAt(0)!) % 360;
  return (
    <span className={`c-avatar ${size}`} style={{ background: `hsl(${hue} 55% 45%)` }} aria-hidden="true">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function PersonRow({ person, children }: { person: Pick<Profile, "username" | "display_name">; children?: React.ReactNode }) {
  return (
    <div className="person-row">
      <Avatar name={person.display_name || person.username} />
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
            👥 {t("community.friendsFeed")}
          </button>
          <button className={`chip-btn ${kind === "explore" ? "active" : ""}`} onClick={() => setKind("explore")}>
            🌍 {t("community.explore")}
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
        <Avatar name={me.display_name || me.username} />
        <span className="muted">{t("community.composePrompt")}</span>
        <span className="composer-photo" aria-hidden="true">
          📷
        </span>
      </button>

      {error && <p className="error small">{error}</p>}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} me={me} onChange={(next) => update(next, post.id)} onOpen={() => setOpen(post)} />
      ))}

      {loading && <div className="spinner dark center-spinner" />}
      {!loading && !error && posts.length === 0 && (
        <section className="card center">
          <p className="muted">{kind === "friends" ? t("community.emptyFriends") : t("community.emptyExplore")}</p>
          {kind === "friends" && (
            <div className="row gap center-row">
              <button className="btn" onClick={onFindFriends}>
                {t("community.findFriends")}
              </button>
              <button className="btn" onClick={() => setKind("explore")}>
                {t("community.explore")}
              </button>
            </div>
          )}
        </section>
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
      <span>🔥 {t("community.summaryKcal", { kcal: num(summary.kcal), goal: num(summary.goal) })}</span>
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
  const author = post.author_profile ?? { username: "?", display_name: "" };
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
        <Avatar name={author.display_name || author.username} />
        <span className="person-name">
          <strong>{author.display_name || author.username}</strong>
          <span className="muted small">
            @{author.username} · {timeAgo(Date.parse(post.created_at), locale)} ·{" "}
            <span title={post.visibility === "public" ? t("community.public") : t("community.friendsOnly")}>
              {post.visibility === "public" ? "🌍" : "👥"}
            </span>
          </span>
        </span>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label={t("community.more")}>
          ⋯
        </button>
      </header>
      {post.body && <p className="post-body">{post.body}</p>}
      {post.day_summary && <SummaryChip summary={post.day_summary} />}
      {post.imageUrl && <img className="post-image" src={post.imageUrl} alt="" loading="lazy" />}
      <footer className="post-actions">
        <button className={`post-action ${post.liked ? "liked" : ""}`} onClick={toggleLike} aria-pressed={post.liked}>
          {post.liked ? "❤️" : "🤍"} {post.like_count > 0 && post.like_count}
          <span className="sr-only">{t("community.like")}</span>
        </button>
        <button className="post-action" onClick={onOpen} disabled={!onOpen}>
          💬 {post.comment_count > 0 && post.comment_count}
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
          const who = c.author_profile ?? { username: "?", display_name: "" };
          const canDelete = c.author === me.id || post.author === me.id;
          return (
            <div key={c.id} className="comment">
              <Avatar name={who.display_name || who.username} size="sm" />
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
              ✕
            </button>
          </div>
        )}
        {withSummary && <SummaryChip summary={summary} />}
        <div className="row gap wrap">
          <button className="btn" onClick={() => fileInput.current?.click()}>
            📷 {photo ? t("community.changePhoto") : t("community.addPhoto")}
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
                {v === "friends" ? `👥 ${t("community.friendsOnly")}` : `🌍 ${t("community.public")}`}
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
        <PersonRow person={me} />
      </section>

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
              ⋯
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
            <button key={c.other} className="conversation" onClick={() => onOpen({ id: c.other, username: c.username, display_name: c.display_name })}>
              <Avatar name={c.display_name || c.username} />
              <span className="person-name">
                <strong>{c.display_name || c.username}</strong>
                <span className={`small ${c.unread ? "" : "muted"} ellipsis`}>
                  {c.last_from_me ? `${t("community.you")}: ` : ""}
                  {c.last_body}
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
        <section className="card center">
          <p className="muted">{t("community.noChats")}</p>
          <button className="btn" onClick={onFindFriends}>
            {t("community.findFriends")}
          </button>
        </section>
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
  const endRef = useRef<HTMLDivElement>(null);

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
    return () => {
      active = false;
      stop();
    };
  }, [me.id, other.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError("");
    try {
      const sent = await sendMessage(other.id, body);
      setMessages((prev) => [...(prev ?? []), sent]);
    } catch (err) {
      setDraft(body);
      setError(message(err));
    }
  }

  let lastDay = "";
  return (
    <div className="page chat">
      <header className="chat-head">
        <button className="icon-btn" onClick={onBack} aria-label={t("common.back")}>
          ‹
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
              <div className={`bubble ${m.sender === me.id ? "mine" : "theirs"}`}>
                <span>{m.body}</span>
                <span className="bubble-time">
                  {new Date(m.created_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {error && <p className="error small">{error}</p>}
      <form className="row gap chat-form" onSubmit={submit}>
        <input
          className="grow"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          placeholder={t("community.writeMessage")}
          aria-label={t("community.writeMessage")}
        />
        <button className="btn primary" disabled={!draft.trim()}>
          {t("community.send")}
        </button>
      </form>
      {reporting && <ReportSheet target="user" id={other.id} onClose={() => setReporting(false)} />}
    </div>
  );
}
