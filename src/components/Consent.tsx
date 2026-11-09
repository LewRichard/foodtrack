import Sheet from "./Sheet.tsx";

/** Shown before the first photo is sent to the AI service. App stores require this disclosure. */
export default function Consent({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  return (
    <Sheet title="Before your first scan" onClose={onClose}>
      <p>To estimate calories, FoodTrack sends the meal photo (and any note you add) to our server, which passes it to Anthropic's Claude AI for analysis.</p>
      <ul className="consent-list">
        <li>Photos are used only to estimate nutrition. They're not stored on our server.</li>
        <li>Anthropic processes the photo under its API terms to return the estimate.</li>
        <li>Your food diary stays on this device.</li>
        <li>Estimates are approximate and aren't medical advice.</li>
      </ul>
      <p className="muted small">
        Read the full <a href="/privacy.html" target="_blank" rel="noreferrer">privacy policy</a>. You can still log food manually without scanning.
      </p>
      <div className="row gap">
        <button className="btn" onClick={onClose}>
          Not now
        </button>
        <button className="btn primary grow" onClick={onAccept}>
          Agree and scan
        </button>
      </div>
    </Sheet>
  );
}
