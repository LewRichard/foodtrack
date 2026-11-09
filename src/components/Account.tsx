import { useState } from "react";
import { deleteAccount, signIn, signOut, signUp, syncNow, useSession } from "../lib/cloud.ts";
import { useAppState } from "../lib/store.ts";
import { useSyncStatus } from "../lib/sync.ts";
import { hasPending } from "../lib/syncState.ts";

const LAST_EMAIL_KEY = "foodtrack:lastEmail";

function rememberedEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(LAST_EMAIL_KEY, email);
    else localStorage.removeItem(LAST_EMAIL_KEY);
  } catch {
    // Storage unavailable: the email just won't be pre-filled next time.
  }
}

/** Sign in / account card for the Profile tab. Only rendered when cloud backup is configured. */
export default function Account() {
  const session = useSession();
  return session ? <SignedIn email={session.user.email ?? "your account"} /> : <SignInForm />;
}

function SignInForm() {
  // Pre-fill the email used last time on this device, so signing back in is just the password
  // (which the phone's password manager can fill with Face ID / fingerprint).
  const [email, setEmail] = useState(rememberedEmail);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
      rememberEmail(email.trim());
      if (result.needsConfirmation) {
        setMessage({ error: false, text: "Check your email and tap the confirmation link, then sign in here." });
        setMode("signin");
      }
    } catch (err) {
      setMessage({ error: true, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  // method/name/autocomplete let Safari, Chrome and iCloud Keychain offer to save and fill the login.
  return (
    <form className="card" onSubmit={submit} method="post" action="#" autoComplete="on">
      <div>
        <h2 className="title">Back up &amp; sync</h2>
        <p className="muted small">
          Sign in to save your diary online, so it's never lost and you can use it on your phone and computer. Food you've
          already logged here is moved into your account.
        </p>
      </div>
      <div className="segmented">
        <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>
          Sign in
        </button>
        <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
          Create account
        </button>
      </div>
      <input
        type="email"
        id="ft-email"
        name="email"
        inputMode="email"
        placeholder="Email"
        autoComplete="username"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <div className="password-field">
        <input
          type={showPassword ? "text" : "password"}
          id="ft-password"
          name="password"
          placeholder={mode === "signup" ? "Choose a password (6+ characters)" : "Password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus={Boolean(email) && mode === "signin"}
          required
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      {message && <p className={message.error ? "error small" : "small"}>{message.text}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}

function SignedIn({ email }: { email: string }) {
  const status = useSyncStatus();
  const state = useAppState();
  const pending = hasPending(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const last = state.sync.lastSyncedAt;
  const statusText =
    status.kind === "syncing"
      ? "Syncing…"
      : status.kind === "offline"
        ? "Offline. Changes are saved on this device and will sync when you're back online."
        : status.kind === "error"
          ? `Couldn't sync: ${status.message}`
          : pending
            ? "Changes waiting to sync…"
            : last
              ? `All changes saved · ${timeAgo(last)}`
              : "Connected";

  async function doSignOut() {
    setBusy(true);
    setError("");
    try {
      let done = await signOut();
      if (!done) {
        const ok = confirm(
          "Some changes haven't been uploaded yet (you may be offline). Sign out anyway and lose them on this device?",
        );
        if (ok) done = await signOut(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!confirm("Delete your account and everything in it? This can't be undone.")) return;
    if (prompt('Type DELETE to confirm.')?.trim().toUpperCase() !== "DELETE") return;
    setBusy(true);
    setError("");
    try {
      await deleteAccount();
      rememberEmail(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="row between">
        <div className="account-who">
          <h2 className="title">Account</h2>
          <span className="muted small">{email}</span>
        </div>
        <span className={`sync-dot ${status.kind === "error" ? "bad" : status.kind === "idle" && !pending ? "ok" : "wait"}`} aria-hidden="true" />
      </div>
      <p className={status.kind === "error" ? "error small" : "muted small"} role="status">
        {statusText}
      </p>
      {error && <p className="error small">{error}</p>}
      <div className="row gap wrap">
        <button className="btn" onClick={() => void syncNow()} disabled={busy || status.kind === "syncing"}>
          Sync now
        </button>
        <button className="btn" onClick={doSignOut} disabled={busy}>
          Sign out
        </button>
        <button className="btn danger" onClick={doDelete} disabled={busy}>
          Delete account
        </button>
      </div>
    </section>
  );
}

function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
