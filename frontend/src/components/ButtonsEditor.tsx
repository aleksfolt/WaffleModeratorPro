import { useState } from "react";

import type { ButtonStyle, WelcomeButton } from "../types.ts";

interface ButtonsEditorProps {
  rows: WelcomeButton[][];
  onChange: (rows: WelcomeButton[][]) => void;
}

interface EditTarget {
  ri: number;
  bi: number | null; // null = новая кнопка в этом ряду
}

interface SheetProps {
  initial: WelcomeButton;
  onSave: (btn: WelcomeButton) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const STYLES: { value: ButtonStyle | undefined; label: string; className: string }[] = [
  { value: undefined,   label: "По умолчанию", className: "style-chip style-chip-default" },
  { value: "primary",   label: "Синяя",        className: "style-chip style-chip-primary" },
  { value: "success",   label: "Зелёная",      className: "style-chip style-chip-success" },
  { value: "danger",    label: "Красная",       className: "style-chip style-chip-danger" },
];

function Sheet({ initial, onSave, onDelete, onClose }: SheetProps) {
  const [text, setText] = useState(initial.text);
  const [url, setUrl] = useState(initial.url);
  const [style, setStyle] = useState<ButtonStyle | undefined>(initial.style);

  const valid = text.trim().length > 0 && url.startsWith("http");

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div className="sheet-body">
          <p className="sheet-title">{onDelete ? "Редактировать кнопку" : "Новая кнопка"}</p>

          <div className="field">
            <label className="field-label">Текст кнопки</label>
            <input
              className="input"
              placeholder="Правила чата"
              value={text}
              maxLength={64}
              autoFocus
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label">Ссылка</label>
            <input
              className="input"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label">Цвет кнопки</label>
            <div className="style-chips">
              {STYLES.map((s) => (
                <button
                  key={String(s.value)}
                  className={s.className + (style === s.value ? " style-chip-active" : "")}
                  onClick={() => setStyle(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn-primary"
            disabled={!valid}
            onClick={() => { if (valid) onSave({ text: text.trim(), url, style }); }}
          >
            Сохранить
          </button>

          {onDelete && (
            <button className="btn-danger" onClick={onDelete}>
              Удалить кнопку
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ButtonsEditor({ rows, onChange }: ButtonsEditorProps) {
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const closeSheet = () => setEditing(null);

  const handleSave = (btn: WelcomeButton) => {
    if (!editing) return;
    const { ri, bi } = editing;
    let next: WelcomeButton[][];

    if (bi === null) {
      // новая кнопка в существующий ряд
      next = rows.map((row, r) => r === ri ? [...row, btn] : row);
    } else {
      // обновить существующую
      next = rows.map((row, r) =>
        r === ri ? row.map((b, i) => i === bi ? btn : b) : row,
      );
    }

    onChange(next);
    closeSheet();
  };

  const handleDelete = () => {
    if (!editing || editing.bi === null) return;
    const { ri, bi } = editing;
    const row = rows[ri].filter((_, i) => i !== bi);
    const next = row.length === 0
      ? rows.filter((_, r) => r !== ri)
      : rows.map((r, i) => i === ri ? row : r);
    onChange(next);
    closeSheet();
  };

  const addRow = () => {
    const ri = rows.length;
    onChange([...rows, [{ text: "", url: "" }]]);
    // открываем шторку для первой кнопки нового ряда
    setEditing({ ri, bi: 0 });
  };

  const editTarget = editing !== null ? (
    editing.bi === null
      ? { text: "", url: "" }
      : rows[editing.ri]?.[editing.bi] ?? { text: "", url: "" }
  ) : null;

  return (
    <div className="btn-editor">
      {/* Превью кнопок */}
      {rows.length > 0 && (
        <div className="btn-editor-preview">
          {rows.map((row, ri) => (
            <div key={ri} className="tg-btn-row">
              {row.map((btn, bi) => (
                <button
                  key={bi}
                  className={["tg-btn", btn.style ? `tg-btn-${btn.style}` : ""].filter(Boolean).join(" ")}
                  onClick={() => setEditing({ ri, bi })}
                >
                  {btn.text || <span className="tg-btn-placeholder">Кнопка</span>}
                </button>
              ))}
              {row.length < 2 && (
                <button
                  className="tg-btn tg-btn-add"
                  onClick={() => setEditing({ ri, bi: null })}
                >
                  +
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {rows.length < 8 && (
        <button className="btn-add-row" onClick={addRow}>
          + добавить ряд
        </button>
      )}

      {editing !== null && editTarget !== null && (
        <Sheet
          initial={editTarget}
          onSave={handleSave}
          onDelete={editing.bi !== null ? handleDelete : undefined}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
