import { useEffect, useState } from "react";

import { getAnonAdminSettings, updateAnonAdminSettings } from "../api.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { SaveButton } from "../components/SaveButton.tsx";
import { Toggle } from "../components/Toggle.tsx";
import type { Page } from "../router.ts";
import type { AnonAdminSettings } from "../types.ts";

interface Props { chatId: number; title: string; onNavigate: (p: Page) => void; }

export function AnonAdminSettingsPage({ chatId, title, onNavigate }: Props) {
  const [settings, setSettings] = useState<AnonAdminSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAnonAdminSettings(chatId).then(setSettings).catch((e: Error) => setError(e.message));
  }, [chatId]);

  const update = (patch: Partial<AnonAdminSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await updateAnonAdminSettings(chatId, settings);
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
      <PageHeader title="Анонимные админы" onBack={() => onNavigate({ type: "chat-menu", chatId, title })} />

      {error && <div className="error-card">{error}</div>}
      {!settings && !error && <div className="muted center">Загрузка…</div>}

      {settings && (
        <>
          <div className="section">
            <div className="section-body">
              <Toggle
                checked={settings.blockEnabled}
                onChange={(v) => update({ blockEnabled: v })}
                label="Блокировка пользователей"
              />
              <p className="section-desc">
                Анонимные администраторы смогут использовать команды /ban, /kick, /mute и /warn без раскрытия личности.
              </p>
            </div>
          </div>

          <SaveButton saving={saving} saved={saved} onClick={save} />
        </>
      )}
    </div>
  );
}
