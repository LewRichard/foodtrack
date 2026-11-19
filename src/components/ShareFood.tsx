import { useEffect, useState } from "react";
import { sumNutrients } from "../../shared/nutrition.ts";
import type { SharedFood } from "../../shared/sharedFood.ts";
import { useI18n } from "../i18n/index.ts";
import { useSession } from "../lib/cloud.ts";
import { loadConnections, sendMessage, useMyProfile, type Connection } from "../lib/community.ts";
import { Avatar } from "./Community.tsx";
import { Icon } from "./Icon.tsx";
import Sheet from "./Sheet.tsx";

/** Sends a food or a whole meal from the diary to a friend's chat. Loaded on demand. */
export default function ShareFoodSheet({ food, onClose }: { food: SharedFood; onClose: () => void }) {
  const { t, tp, num } = useI18n();
  const session = useSession();
  const { profile } = useMyProfile(session?.user.id ?? null);
  const [friends, setFriends] = useState<Connection[] | null>(null);
  const [to, setTo] = useState<Connection | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const total = sumNutrients(food.items);

  useEffect(() => {
    if (!profile) return;
    loadConnections().then(
      (all) => setFriends(all.filter((c) => c.state === "friend")),
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [profile]);

  async function send() {
    if (!to) return;
    setBusy(true);
    setError("");
    try {
      await sendMessage(to.id, note, undefined, food);
      setSentTo(to.display_name || to.username);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("share.title")} onClose={onClose}>
      <div className="stack">
        <div className="food-card static">
          {food.photo && <img src={food.photo} alt="" />}
          <div className="food-card-text">
            <strong>{food.title}</strong>
            <span className="muted small">
              {tp("scan.items", food.items.length)} · {num(Math.round(total.calories))} kcal
            </span>
          </div>
        </div>

        {sentTo ? (
          <div className="stack center">
            <span className="premium-mark" aria-hidden="true">
              <Icon name="check" size={24} />
            </span>
            <p>{t("share.sent", { name: sentTo })}</p>
            <button className="btn primary" onClick={onClose}>
              {t("common.done")}
            </button>
          </div>
        ) : !session || profile === null ? (
          <p className="muted small">{t("share.joinFirst")}</p>
        ) : profile === undefined || (friends === null && !error) ? (
          <div className="spinner dark center-spinner" />
        ) : friends && friends.length === 0 ? (
          <p className="muted small">{t("share.noFriends")}</p>
        ) : (
          <>
            <p className="label">{t("share.to")}</p>
            <div className="share-friends" role="radiogroup">
              {(friends ?? []).map((f) => (
                <button key={f.id} role="radio" aria-checked={to?.id === f.id} className={`share-friend ${to?.id === f.id ? "active" : ""}`} onClick={() => setTo(f)}>
                  <Avatar name={f.display_name || f.username} path={f.avatar_path} size="sm" />
                  <span className="ellipsis">{f.display_name || f.username}</span>
                  {to?.id === f.id && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
            <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t("share.notePlaceholder")} />
            <button className="btn primary" disabled={!to || busy} onClick={() => void send()}>
              <Icon name="send" size={18} /> {busy ? t("common.pleaseWait") : to ? t("share.sendTo", { name: to.display_name || to.username }) : t("share.pick")}
            </button>
          </>
        )}
        {error && <p className="error small">{error}</p>}
      </div>
    </Sheet>
  );
}
