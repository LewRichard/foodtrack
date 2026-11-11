import { useEffect, useRef, useState, type FormEvent } from "react";
import { deviceLanguage, LANGUAGES, useI18n, type LanguagePref } from "../i18n/index.ts";
import {
  enabledProviders,
  sendPasswordReset,
  signIn,
  signInWithProvider,
  signUp,
  updatePassword,
  usePasswordRecovery,
  type OAuthProvider,
} from "../lib/cloud.ts";
import { isNative } from "../lib/native.ts";
import { actions, useAppState } from "../lib/store.ts";
import { offerToSavePassword, rememberedEmail, rememberEmail, SAVE_FRAME } from "./Account.tsx";

type Mode = "signin" | "signup" | "forgot";

/** The first screen when signed out: sign in with Apple / Google / Facebook or email. */
export default function AuthScreen() {
  const { t } = useI18n();
  const recovering = usePasswordRecovery();
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [mode, setMode] = useState<Mode>(() => (rememberedEmail() ? "signin" : "signup"));

  // Social sign-in uses a web redirect; the iPhone app sticks to email until it has native sign-in.
  useEffect(() => {
    if (!isNative) void enabledProviders().then(setProviders);
  }, []);

  return (
    <div className="auth-screen">
      <div className="auth-inner">
        <header className="auth-brand">
          <img src="/icon.svg" alt="" className="auth-logo" />
          <h1>FoodTrack</h1>
          <p className="muted">{t("welcome.tagline")}</p>
        </header>

        {recovering ? (
          <NewPassword />
        ) : (
          <>
            {providers.length > 0 && mode !== "forgot" && (
              <>
                <div className="stack social-buttons">
                  {providers.map((p) => (
                    <SocialButton key={p} provider={p} />
                  ))}
                </div>
                <div className="auth-divider">
                  <span>{t("welcome.orEmail")}</span>
                </div>
              </>
            )}
            <EmailForm mode={mode} setMode={setMode} />
          </>
        )}

        <footer className="auth-footer">
          <LanguagePicker />
          <span className="muted small auth-legal">
            <a href="/terms.html" target="_blank" rel="noreferrer">
              {t("legal.terms")}
            </a>
            {" · "}
            <a href="/privacy.html" target="_blank" rel="noreferrer">
              {t("welcome.privacy")}
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}

const PROVIDER_LABEL: Record<OAuthProvider, "welcome.apple" | "welcome.google" | "welcome.facebook"> = {
  apple: "welcome.apple",
  google: "welcome.google",
  facebook: "welcome.facebook",
};

function SocialButton({ provider }: { provider: OAuthProvider }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className={`btn social-btn social-${provider}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await signInWithProvider(provider); // leaves the page on success
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
      >
        <ProviderIcon provider={provider} />
        <span>{busy ? t("common.pleaseWait") : t(PROVIDER_LABEL[provider])}</span>
      </button>
      {error && <p className="error small">{error}</p>}
    </>
  );
}

function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
    );
  }
  if (provider === "apple") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.37 12.62c-.03-2.73 2.23-4.04 2.33-4.1-1.27-1.86-3.25-2.11-3.95-2.14-1.68-.17-3.28.99-4.13.99-.85 0-2.17-.97-3.56-.94-1.83.03-3.52 1.06-4.47 2.7-1.9 3.3-.49 8.19 1.37 10.87.91 1.31 1.99 2.78 3.41 2.73 1.37-.05 1.89-.88 3.54-.88 1.65 0 2.12.88 3.57.86 1.47-.03 2.4-1.34 3.3-2.66 1.04-1.52 1.47-3 1.49-3.07-.03-.01-2.86-1.1-2.9-4.36zM13.66 4.6c.75-.91 1.26-2.18 1.12-3.44-1.08.04-2.39.72-3.17 1.63-.7.8-1.31 2.09-1.15 3.33 1.21.09 2.44-.61 3.2-1.52z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M15.12 5.32H17V2.14A26.11 26.11 0 0 0 14.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.62H6.61v3.56h3.07V22h3.68v-9.12h3.06l.46-3.56h-3.52V7.05c0-1.03.28-1.73 1.76-1.73z"
      />
    </svg>
  );
}

function EmailForm({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "forgot") {
        await sendPasswordReset(email);
        setMessage({ error: false, text: t("welcome.resetSent") });
        return;
      }
      const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
      rememberEmail(email.trim());
      if (result.needsConfirmation) {
        setMessage({ error: false, text: t("account.confirmEmail") });
        setMode("signin");
      } else if (formRef.current) {
        await offerToSavePassword(formRef.current, email.trim(), password);
      }
    } catch (err) {
      setMessage({ error: true, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} className="stack auth-form" onSubmit={submit} method="post" action="about:blank" target={SAVE_FRAME} autoComplete="on">
      <iframe name={SAVE_FRAME} title="" hidden tabIndex={-1} aria-hidden="true" />
      {mode !== "forgot" ? (
        <div className="segmented">
          <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>
            {t("account.signIn")}
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            {t("account.createAccount")}
          </button>
        </div>
      ) : (
        <div>
          <h2 className="title">{t("welcome.forgotTitle")}</h2>
          <p className="muted small">{t("welcome.forgotBody")}</p>
        </div>
      )}
      <input
        type="email"
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
      {mode !== "forgot" && (
        <div className="password-field">
          <input
            type={show ? "text" : "password"}
            name="password"
            placeholder={mode === "signup" ? t("account.newPassword") : t("account.password")}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="password-toggle" onClick={() => setShow(!show)} aria-pressed={show}>
            {show ? t("account.hide") : t("account.show")}
          </button>
        </div>
      )}
      {message && <p className={message.error ? "error small" : "small"}>{message.text}</p>}
      <button className="btn primary" disabled={busy}>
        {busy
          ? t("common.pleaseWait")
          : mode === "signin"
            ? t("account.signIn")
            : mode === "signup"
              ? t("account.createAccount")
              : t("welcome.sendReset")}
      </button>
      {mode === "signin" && (
        <button type="button" className="link center" onClick={() => setMode("forgot")}>
          {t("welcome.forgot")}
        </button>
      )}
      {mode === "forgot" && (
        <button type="button" className="link center" onClick={() => setMode("signin")}>
          {t("common.back")}
        </button>
      )}
    </form>
  );
}

function NewPassword() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="stack auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await updatePassword(password);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="title">{t("welcome.newPasswordTitle")}</h2>
      <input
        type="password"
        name="password"
        autoComplete="new-password"
        placeholder={t("account.newPassword")}
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoFocus
      />
      {error && <p className="error small">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? t("common.pleaseWait") : t("common.save")}
      </button>
    </form>
  );
}

function LanguagePicker() {
  const { t } = useI18n();
  const { language } = useAppState();
  return (
    <select
      className="auth-language"
      value={language}
      onChange={(e) => actions.setLanguage(e.target.value as LanguagePref)}
      aria-label={t("profile.language")}
    >
      <option value="auto">{t("profile.languageAuto", { name: LANGUAGES.find((l) => l.code === deviceLanguage())?.name ?? "" })}</option>
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
