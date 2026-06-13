interface PageHeaderProps {
  title: string;
  onBack: () => void;
}

export function PageHeader({ title, onBack }: PageHeaderProps) {
  return (
    <div className="page-header">
      <button className="btn-back" onClick={onBack}>←</button>
      <h1 className="page-title">{title}</h1>
    </div>
  );
}
