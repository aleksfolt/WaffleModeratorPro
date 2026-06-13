import { useEffect, useState } from "react";

import { getCallAdminSettings, updateCallAdminSettings } from "../api.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { SaveButton } from "../components/SaveButton.tsx";
import { Toggle } from "../components/Toggle.tsx";
import type { Page } from "../router.ts";
import type { CallAdminSettings } from "../types.ts";

interface Props { chatId: number; title: string; onNavigate: (p: Page) => void; }

export function CallAdminSettingsPage({ chatId, title, onNavigate }: Props) {
  const [settings, setSettings] = useState<CallAdminSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCallAdminSettings(chatId).then(setSettings).catch((e: Error) => setError(e.message));
  }, [chatId]);

  const update = (patch: Partial<CallAdminSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await updateCallAdminSettings(chatId, settings);
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
      <PageHeader title="Тег @admin" onBack={() => onNavigate({ type: "chat-menu", chatId, title })} />

      {error && <div className="error-card">{error}</div>}
      {!settings && !error && <div className="muted center">Загрузка…</div>}

      {settings && (
        <>
          <div className="section">
            <div className="section-body">
              <Toggle checked={settings.enabled} onChange={(v) => update({ enabled: v })} label="Включить @admin" />
              <p className="section-desc">
                Если участник напишет @admin — администраторы получат уведомление в ЛС.
              </p>
            </div>
          </div>

          {settings.enabled && (
            <div className="section">
              <div className="section-body">
                <div className="field">
                  <label className="field-label">Кого уведомлять</label>
                  <div className="segmented">
                    <button
                      className={`seg-btn ${settings.target === "admins" ? "seg-active" : ""}`}
                      onClick={() => update({ target: "admins" })}
                    >
                      Суперадмины
                    </button>
                    <button
                      className={`seg-btn ${settings.target === "allAdmins" ? "seg-active" : ""}`}
                      onClick={() => update({ target: "allAdmins" })}
                    >
                      Все админы
                    </button>
                  </div>
                  <p className="section-desc">
                    {settings.target === "admins"
                      ? "Только администраторы с полными правами."
                      : "Все администраторы и создатель чата."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <SaveButton saving={saving} saved={saved} onClick={save} />
        </>
      )}
    </div>
  );
}
