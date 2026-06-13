import { useEffect, useState } from "react";

import { getNsfwFilterSettings, updateNsfwFilterSettings } from "../api.ts";
import { DurationSelect } from "../components/DurationSelect.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { SaveButton } from "../components/SaveButton.tsx";
import { Toggle } from "../components/Toggle.tsx";
import type { Page } from "../router.ts";
import type { NsfwAction, NsfwFilterSettings } from "../types.ts";

const ACTION_LABELS: Record<NsfwAction, string> = {
  warn: "Варн",
  mute: "Мут",
  kick: "Кик",
  ban: "Бан",
};

interface Props { chatId: number; title: string; onNavigate: (p: Page) => void; }

export function NsfwFilterSettingsPage({ chatId, title, onNavigate }: Props) {
  const [settings, setSettings] = useState<NsfwFilterSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getNsfwFilterSettings(chatId).then(setSettings).catch((e: Error) => setError(e.message));
  }, [chatId]);

  const update = (patch: Partial<NsfwFilterSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await updateNsfwFilterSettings(chatId, {
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
      <PageHeader title="NSFW-фильтр" onBack={() => onNavigate({ type: "chat-menu", chatId, title })} />

      {error && <div className="error-card">{error}</div>}
      {!settings && !error && <div className="muted center">Загрузка…</div>}

      {settings && (
        <>
          <div className="section">
            <div className="section-body">
              <Toggle
                checked={settings.enabled}
                onChange={(v) => update({ enabled: v })}
                label="Включить фильтр"
              />
              <p className="section-desc">
                Автоматически проверяет фотографии с помощью нейросети и наказывает за неприемлемый контент.
              </p>
            </div>
          </div>

          {settings.enabled && (
            <>
              <div className="section">
                <div className="section-header">Порог обнаружения</div>
                <div className="section-body">
                  <div className="stepper-row">
                    <span className="field-label">Уверенность, %</span>
                    <div className="stepper">
                      <button
                        className="stepper-btn"
                        onClick={() => update({ percent: Math.max(10, settings.percent - 5) })}
                      >−</button>
                      <div className="stepper-divider" />
                      <span className="stepper-value">{settings.percent}%</span>
                      <div className="stepper-divider" />
                      <button
                        className="stepper-btn"
                        onClick={() => update({ percent: Math.min(95, settings.percent + 5) })}
                      >+</button>
                    </div>
                  </div>
                  <p className="section-desc">
                    Срабатывает если вероятность NSFW-контента превышает {settings.percent}%.
                  </p>
                </div>
              </div>

              <div className="section">
                <div className="section-header">Дополнительные классы</div>
                <div className="section-body">
                  <Toggle
                    checked={settings.blockCovered}
                    onChange={(v) => update({ blockCovered: v })}
                    label="Блокировать купальники и бельё"
                  />
                  <p className="section-desc">
                    Срабатывает также на прикрытые интимные части: верх/низ купальника, нижнее бельё.
                    Без этой опции блокируется только явная обнажённость.
                  </p>
                </div>
              </div>

              <div className="section">
                <div className="section-header">Наказание</div>
                <div className="section-body">
                  <div className="field">
                    <label className="field-label">Действие</label>
                    <div className="segmented">
                      {(["warn", "mute", "kick", "ban"] as NsfwAction[]).map((a) => (
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
                    checked={settings.deleteMessage}
                    onChange={(v) => update({ deleteMessage: v })}
                    label="Удалять сообщение"
                  />
                  <p className="section-desc">Удалять фото при обнаружении NSFW-контента.</p>
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
