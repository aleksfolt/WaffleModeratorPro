interface SaveButtonProps {
  saving: boolean;
  saved: boolean;
  onClick: () => void;
}

export function SaveButton({ saving, saved, onClick }: SaveButtonProps) {
  return (
    <button className="btn-primary" onClick={onClick} disabled={saving}>
      {saved ? "✓ Сохранено" : saving ? "Сохранение…" : "Сохранить"}
    </button>
  );
}
