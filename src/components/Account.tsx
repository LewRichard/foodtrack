import { useRef, useState } from "react";
import { useI18n } from "../i18n/index.ts";
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
  // Keep the form on screen for a moment after signing in, so the browser sees the login form
  // submitted and offers to save the password (see offerToSavePassword).
  const [finishing, setFinishing] = useState(false);
  return session && !finishing ? (
    <SignedIn email={session.user.email ?? "your account"} />
  ) : (
    <SignInForm onStart={() => setFinishing(true)} onFinish={() => setFinishing(false)} />
  );
}

// Name of a hidden frame that receives the login form after a successful sign-in.
const SAVE_FRAME = "ft-password-save";

/**
 * Browsers only offer "Save password?" when they see a login form actually submitted, which an app
 * that signs in with JavaScript never does. So after a successful sign-in:
 *  - Chrome / Edge / Android: ask directly with the Credential Management API;
 *  - Safari / iPhone (and others): submit the form into a hidden frame at about:blank. That's a real
 *    form submission for the browser's password manager, but nothing is sent anywhere: about:blank
 *    makes no network request.
 */
async function offerToSavePassword(form: HTMLFormElement, email: string, password: string) {
  const w = window as Window & { PasswordCredential?: new (data: { id: string; password: string; name?: string }) => Credential };
  if (w.PasswordCredential && navigator.credentials?.store) {
    try {
      await navigator.credentials.store(new w.PasswordCredential({ id: email, password, name: email }));
      return;
    } catch {
      // Fall through to the form submission.
    }
  }
  try {
    form.submit(); // programmatic submit: doesn't fire onSubmit again
  } catch {
    // Nothing else to try; the user can still save the password manually.
  }
}

function SignInForm({ onStart, onFinish }: { onStart: () => void; onFinish: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  // Pre-fill the email used last time on this device, so signing back in is just the password
  // (which the phone's password manager can fill with Face ID / fingerprint).
  const [email, setEmail] = useState(rememberedEmail);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    onStart();
    try {
      const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
      rememberEmail(email.trim());
      if (result.needsConfirmation) {
        setMessage({ error: false, text: t("account.confirmEmail") });
        setMode("signin");
      } else if (formRef.current) {
        await offerToSavePassword(formRef.current, email.trim(), password);
        // Give the browser a moment to register the submission before the form is replaced.
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      setMessage({ error: true, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      onFinish();
    }
  }

  // method/name/autocomplete let Safari, Chrome and iCloud Keychain offer to save and fill the login.
  return (
    <form
      ref={formRef}
      className="card"
      onSubmit={submit}
      method="post"
      action="about:blank"
      target={SAVE_FRAME}
      autoComplete="on"
    >
      <iframe name={SAVE_FRAME} title="" hidden tabIndex={-1} aria-hidden="true" />
      <div>
        <h2 className="title">{t("account.backupTitle")}</h2>
        <p className="muted small">{t("account.backupBody")}</p>
      </div>
      <div className="segmented">
        <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>
          {t("account.signIn")}
        </button>
        <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
          {t("account.createAccount")}
        </button>
      </div>
      <input
        type="email"
        id="ft-email"
        name="email"
        inputMode="email"
        placeholder={t("account.email")}
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
          placeholder={mode === "signup" ? t("account.newPassword") : t("account.password")}
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
          aria-label={showPassword ? t("account.hidePassword") : t("account.showPassword")}
          aria-pressed={showPassword}
        >
          {showPassword ? t("account.hide") : t("account.show")}
        </button>
      </div>
      {message && <p className={message.error ? "error small" : "small"}>{message.text}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? t("common.pleaseWait") : mode === "signin" ? t("account.signIn") : t("account.createAccount")}
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
  const { t, locale } = useI18n();

  const last = state.sync.lastSyncedAt;
  const statusText =
    status.kind === "syncing"
      ? t("account.syncing")
      : status.kind === "offline"
        ? t("account.offline")
        : status.kind === "error"
          ? t("account.syncError", { error: status.message })
          : pending
            ? t("account.pending")
            : last
              ? t("account.allSaved", { when: timeAgo(last, locale) })
              : t("account.connected");

  async function doSignOut() {
    setBusy(true);
    setError("");
    try {
      let done = await signOut();
      if (!done) {
        const ok = confirm(t("account.signOutConfirm"));
        if (ok) done = await signOut(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!confirm(t("account.deleteConfirm"))) return;
    if (prompt(t("account.deletePrompt"))?.trim().toUpperCase() !== "DELETE") return;
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
          <h2 className="title">{t("account.title")}</h2>
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
          {t("account.syncNow")}
        </button>
        <button className="btn" onClick={doSignOut} disabled={busy}>
          {t("account.signOut")}
        </button>
        <button className="btn danger" onClick={doDelete} disabled={busy}>
          {t("account.delete")}
        </button>
      </div>
    </section>
  );
}

/** "just now" / "5 minutes ago" / a date, in the app's language. */
function timeAgo(ms: number, locale: string): string {
  const s = Math.round((Date.now() - ms) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (s < 60) return rtf.format(0, "second");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return new Date(ms).toLocaleDateString(locale, { month: "short", day: "numeric" });
}
