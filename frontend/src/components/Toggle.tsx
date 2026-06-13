interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <div className="toggle-row" onClick={() => onChange(!checked)}>
      <span className="toggle-label">{label}</span>
      <div className={`toggle ${checked ? "toggle-on" : ""}`}>
        <div className="toggle-thumb" />
      </div>
    </div>
  );
}
