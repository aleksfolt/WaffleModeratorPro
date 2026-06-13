import { useEffect, useState } from "react";

import { getWelcomeSettings, updateWelcomeSettings } from "../api.ts";
import { ButtonsEditor } from "../components/ButtonsEditor.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { SaveButton } from "../components/SaveButton.tsx";
import { Toggle } from "../components/Toggle.tsx";
import type { Page } from "../router.ts";
import type { WelcomeSettings } from "../types.ts";

interface Props { chatId: number; title: string; onNavigate: (p: Page) => void; }

export function WelcomeSettingsPage({ chatId, title, onNavigate }: Props) {
  const [settings, setSettings] = useState<WelcomeSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWelcomeSettings(chatId)
      .then((s) => setSettings({ ...s, buttons: s.buttons ?? [] }))
      .catch((e: Error) => setError(e.message));
  }, [chatId]);

  const update = (patch: Partial<WelcomeSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await updateWelcomeSettings(chatId, settings);
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
      <PageHeader title="Приветствие" onBack={() => onNavigate({ type: "chat-menu", chatId, title })} />

      {error && <div className="error-card">{error}</div>}
      {!settings && !error && <div className="muted center">Загрузка…</div>}

      {settings && (
        <>
          <div className="section">
            <div className="section-body">
              <Toggle checked={settings.enabled} onChange={(v) => update({ enabled: v })} label="Включить приветствие" />
            </div>
          </div>

          {settings.enabled && (
            <>
              <div className="section">
                <div className="section-body">
                  <Toggle checked={settings.onlyFirst} onChange={(v) => update({ onlyFirst: v })} label="Только при первом входе" />
                  <p className="section-desc">
                    {settings.onlyFirst
                      ? "Бот поприветствует участника один раз — при первом вступлении в чат."
                      : "Бот будет приветствовать участника при каждом вступлении в чат."}
                  </p>
                </div>
              </div>

              <div className="section">
                <div className="section-body">
                  <div className="field">
                    <label className="field-label">Текст приветствия</label>
                    <p className="section-desc">
                      Если оставить пустым — будет использоваться стандартное сообщение.
                      Можно использовать <b>{"{{name}}"}</b> для имени участника.
                    </p>
                    <textarea
                      className="textarea"
                      placeholder="Добро пожаловать в чат, {{name}}!"
                      value={settings.message ?? ""}
                      onChange={(e) => update({ message: e.target.value.length > 0 ? e.target.value : null })}
                      rows={4}
                      maxLength={1000}
                    />
                    <span className="field-counter">{(settings.message ?? "").length} / 1000</span>
                  </div>
                </div>
              </div>

              <div className="section">
                <div className="section-body">
                  <div className="field">
                    <label className="field-label">Кнопки под сообщением</label>
                    <p className="section-desc">До 8 рядов, в каждом 1 или 2 кнопки.</p>
                    <ButtonsEditor
                      rows={settings.buttons}
                      onChange={(buttons) => update({ buttons })}
                    />
                  </div>
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
