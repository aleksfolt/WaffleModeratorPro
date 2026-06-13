const DURATION_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Навсегда", value: null },
  { label: "1 час", value: 3600 },
  { label: "1 день", value: 86400 },
  { label: "7 дней", value: 604800 },
  { label: "30 дней", value: 2592000 },
];

interface DurationSelectProps {
  value: number | null;
  onChange: (v: number | null) => void;
}

export function DurationSelect({ value, onChange }: DurationSelectProps) {
  return (
    <div className="select-wrap">
      <select
        className="select"
        value={value ?? "null"}
        onChange={(e) => onChange(e.target.value === "null" ? null : Number(e.target.value))}
      >
        {DURATION_OPTIONS.map((opt) => (
          <option key={String(opt.value)} value={opt.value ?? "null"}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="select-arrow">▾</span>
    </div>
  );
}
