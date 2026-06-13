import { useEffect, useState } from "react";

import { getWarnSettings, updateWarnSettings } from "../api.ts";
import { DurationSelect } from "../components/DurationSelect.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { SaveButton } from "../components/SaveButton.tsx";
import type { Page } from "../router.ts";
import type { WarnAction, WarnSettings } from "../types.ts";

const ACTION_LABELS: Record<WarnAction, string> = { kick: "Кик", ban: "Бан", mute: "Мут" };

interface Props { chatId: number; title: string; onNavigate: (p: Page) => void; }

export function WarnSettingsPage({ chatId, title, onNavigate }: Props) {
  const [settings, setSettings] = useState<WarnSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWarnSettings(chatId).then(setSettings).catch((e: Error) => setError(e.message));
  }, [chatId]);

  const update = (patch: Partial<WarnSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await updateWarnSettings(chatId, {
        ...settings,
        actionDuration: settings.action === "kick" ? null : settings.actionDuration,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Настройка варнов" onBack={() => onNavigate({ type: "chat-menu", chatId, title })} />

      {error && <div className="error-card">{error}</div>}
      {!settings && !error && <div className="muted center">Загрузка…</div>}

      {settings && (
        <>
          <div className="section">
            <div className="section-body">
              <p className="section-desc">
                После {settings.maxWarns} предупрежден{settings.maxWarns === 1 ? "ия" : "ий"} применяется наказание.
              </p>
              <div className="stepper-row">
                <span className="field-label">Максимум варнов</span>
                <div className="stepper">
                  <button className="stepper-btn" onClick={() => update({ maxWarns: Math.max(1, settings.maxWarns - 1) })}>−</button>
                  <div className="stepper-divider" />
                  <span className="stepper-value">{settings.maxWarns}</span>
                  <div className="stepper-divider" />
                  <button className="stepper-btn" onClick={() => update({ maxWarns: Math.min(10, settings.maxWarns + 1) })}>+</button>
                </div>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-body">
              <div className="field">
                <label className="field-label">Наказание</label>
                <div className="segmented">
                  {(["kick", "ban", "mute"] as WarnAction[]).map((a) => (
                    <button key={a} className={`seg-btn ${settings.action === a ? "seg-active" : ""}`} onClick={() => update({ action: a })}>
                      {ACTION_LABELS[a]}
                    </button>
                  ))}
                </div>
              </div>
              {settings.action !== "kick" && (
                <div className="field">
                  <label className="field-label">Длительность наказания</label>
                  <DurationSelect value={settings.actionDuration} onChange={(v) => update({ actionDuration: v })} />
                </div>
              )}
            </div>
          </div>

          <div className="section">
            <div className="section-body">
              <div className="field">
                <label className="field-label">Длительность варна</label>
                <p className="section-desc">Через сколько предупреждение снимается автоматически.</p>
                <DurationSelect value={settings.warnDuration} onChange={(v) => update({ warnDuration: v })} />
              </div>
            </div>
          </div>

          <SaveButton saving={saving} saved={saved} onClick={save} />
        </>
      )}
    </div>
  );
}
