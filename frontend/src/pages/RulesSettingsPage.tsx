import { useEffect, useState } from "react";

import { getRulesSettings, updateRulesSettings } from "../api.ts";
import { ButtonsEditor } from "../components/ButtonsEditor.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { SaveButton } from "../components/SaveButton.tsx";
import { Toggle } from "../components/Toggle.tsx";
import type { Page } from "../router.ts";
import type { RulesPermission, RulesSettings } from "../types.ts";

const PERMISSION_LABELS: Record<RulesPermission, string> = {
  noone:   "Никто",
  members: "Все",
  private: "В ЛС",
  admins:  "Админы",
};

const PERMISSION_DESCS: Record<RulesPermission, string> = {
  noone:   "Команда /rules не работает.",
  members: "Любой участник может вызвать /rules.",
  private: "Бот отправляет правила пользователю в личные сообщения.",
  admins:  "Только администраторы могут вызвать /rules.",
};

interface Props { chatId: number; title: string; onNavigate: (p: Page) => void; }

export function RulesSettingsPage({ chatId, title, onNavigate }: Props) {
  const [settings, setSettings] = useState<RulesSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRulesSettings(chatId)
      .then((s) => setSettings({ buttons: [], ...s }))
      .catch((e: Error) => setError(e.message));
  }, [chatId]);

  const update = (patch: Partial<RulesSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await updateRulesSettings(chatId, settings);
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
      <PageHeader title="Правила" onBack={() => onNavigate({ type: "chat-menu", chatId, title })} />

      {error && <div className="error-card">{error}</div>}
      {!settings && !error && <div className="muted center">Загрузка…</div>}

      {settings && (
        <>
          <div className="section">
            <div className="section-body">
              <Toggle
                checked={settings.enabled}
                onChange={(v) => update({ enabled: v })}
                label="Включить команду /rules"
              />
            </div>
          </div>

          {settings.enabled && (
            <>
              <div className="section">
                <div className="section-header">Доступ к команде</div>
                <div className="section-body">
                  <div className="segmented">
                    {(["noone", "members", "private", "admins"] as RulesPermission[]).map((p) => (
                      <button
                        key={p}
                        className={`seg-btn ${settings.permissions === p ? "seg-active" : ""}`}
                        onClick={() => update({ permissions: p })}
                      >
                        {PERMISSION_LABELS[p]}
                      </button>
                    ))}
                  </div>
                  <p className="section-desc">{PERMISSION_DESCS[settings.permissions]}</p>
                </div>
              </div>

              <div className="section">
                <div className="section-body">
                  <div className="field">
                    <label className="field-label">Текст правил</label>
                    <p className="section-desc">HTML-форматирование разрешено.</p>
                    <textarea
                      className="textarea"
                      placeholder="1. Будьте вежливы&#10;2. Не спамьте&#10;3. Соблюдайте тему чата"
                      value={settings.text}
                      onChange={(e) => update({ text: e.target.value })}
                      rows={6}
                      maxLength={4000}
                    />
                    <span className="field-counter">{settings.text.length} / 4000</span>
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
