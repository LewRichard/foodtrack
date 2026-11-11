import { useEffect, type ReactNode } from "react";
import { useI18n } from "../i18n/index.ts";
import { Icon } from "./Icon.tsx";

/** Bottom sheet modal. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between sheet-head">
          <h2 className="title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="x" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
