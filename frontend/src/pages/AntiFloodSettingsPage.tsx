import { useEffect, useState } from "react";

import { getAntiFloodSettings, updateAntiFloodSettings } from "../api.ts";
import { DurationSelect } from "../components/DurationSelect.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { SaveButton } from "../components/SaveButton.tsx";
import { Toggle } from "../components/Toggle.tsx";
import type { Page } from "../router.ts";
import type { AntiFloodAction, AntiFloodSettings } from "../types.ts";

const ACTION_LABELS: Record<AntiFloodAction, string> = {
  warn: "Варн",
  mute: "Мут",
  kick: "Кик",
  ban: "Бан",
};

interface Props { chatId: number; title: string; onNavigate: (p: Page) => void; }

export function AntiFloodSettingsPage({ chatId, title, onNavigate }: Props) {
  const [settings, setSettings] = useState<AntiFloodSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAntiFloodSettings(chatId).then(setSettings).catch((e: Error) => setError(e.message));
  }, [chatId]);

  const update = (patch: Partial<AntiFloodSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await updateAntiFloodSettings(chatId, {
        ...settings,
        durationAction: (settings.action === "kick" || settings.action === "warn")
          ? null
          : settings.durationAction,
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
      <PageHeader title="Антифлуд" onBack={() => onNavigate({ type: "chat-menu", chatId, title })} />

      {error && <div className="error-card">{error}</div>}
      {!settings && !error && <div className="muted center">Загрузка…</div>}

      {settings && (
        <>
          <div className="section">
            <div className="section-body">
              <Toggle
                checked={settings.enabled}
                onChange={(v) => update({ enabled: v })}
                label="Включить антифлуд"
              />
              <p className="section-desc">
                Автоматически наказывает участников, отправляющих слишком много сообщений за короткое время.
              </p>
            </div>
          </div>

          {settings.enabled && (
            <>
              <div className="section">
                <div className="section-header">Условие срабатывания</div>
                <div className="section-body">
                  <div className="stepper-row">
                    <span className="field-label">Сообщений</span>
                    <div className="stepper">
                      <button className="stepper-btn" onClick={() => update({ messages: Math.max(3, settings.messages - 1) })}>−</button>
                      <div className="stepper-divider" />
                      <span className="stepper-value">{settings.messages}</span>
                      <div className="stepper-divider" />
                      <button className="stepper-btn" onClick={() => update({ messages: Math.min(30, settings.messages + 1) })}>+</button>
                    </div>
                  </div>
                  <div className="stepper-row">
                    <span className="field-label">За секунд</span>
                    <div className="stepper">
                      <button className="stepper-btn" onClick={() => update({ time: Math.max(5, settings.time - 5) })}>−</button>
                      <div className="stepper-divider" />
                      <span className="stepper-value">{settings.time}</span>
                      <div className="stepper-divider" />
                      <button className="stepper-btn" onClick={() => update({ time: Math.min(120, settings.time + 5) })}>+</button>
                    </div>
                  </div>
                  <p className="section-desc">
                    Если участник отправит больше {settings.messages} сообщений за {settings.time} сек — срабатывает антифлуд.
                  </p>
                </div>
              </div>

              <div className="section">
                <div className="section-header">Наказание</div>
                <div className="section-body">
                  <div className="field">
                    <label className="field-label">Действие</label>
                    <div className="segmented">
                      {(["warn", "mute", "kick", "ban"] as AntiFloodAction[]).map((a) => (
                        <button
                          key={a}
                          className={`seg-btn ${settings.action === a ? "seg-active" : ""}`}
                          onClick={() => update({ action: a })}
                        >
                          {ACTION_LABELS[a]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(settings.action === "ban" || settings.action === "mute") && (
                    <div className="field">
                      <label className="field-label">Длительность</label>
                      <DurationSelect
                        value={settings.durationAction}
                        onChange={(v) => update({ durationAction: v })}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="section">
                <div className="section-header">Дополнительно</div>
                <div className="section-body">
                  <Toggle
                    checked={settings.deleteMessages}
                    onChange={(v) => update({ deleteMessages: v })}
                    label="Удалять сообщения"
                  />
                  <p className="section-desc">Удалять флуд-сообщения при срабатывании.</p>
                </div>
                </div>
            </>
          )}

          <SaveButton saving={saving} saved={saved} onClick={save} />
        </>
      )}
    </div>
  );
}
