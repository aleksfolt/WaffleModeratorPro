import type { Page } from "../router.ts";

function getTelegramUser(): { first_name: string } | null {
  try {
    const tg = (window as unknown as Record<string, unknown>).Telegram as
      | { WebApp?: { initDataUnsafe?: { user?: { first_name: string } } } }
      | undefined;
    return tg?.WebApp?.initDataUnsafe?.user ?? null;
  } catch {
    return null;
  }
}

interface HomePageProps {
  onNavigate: (p: Page) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const user = getTelegramUser();
  const firstName = user?.first_name ?? "пользователь";

  return (
    <div className="page">
      <div className="hero">
        <div className="logo">🧇</div>
        <h1 className="title">Waffle Moderator</h1>
        <p className="subtitle">Pro</p>
      </div>

      <div className="section">
        <div className="welcome-card">
          <p className="greeting">Привет, <span className="name">{firstName}</span>!</p>
          <p className="description">
            Инструмент для модерации Telegram-чатов. Баны, муты, предупреждения и статистика — всё в одном месте.
          </p>
        </div>
      </div>

      <div className="section features">
        <div className="feature"><span className="feature-icon">🔨</span><span>Бан и мут с таймером</span></div>
        <div className="feature"><span className="feature-icon">⚠️</span><span>Система предупреждений</span></div>
        <div className="feature"><span className="feature-icon">📊</span><span>Статистика участников</span></div>
        <div className="feature"><span className="feature-icon">🛡️</span><span>Управление правами</span></div>
      </div>

      <button className="btn-primary" onClick={() => onNavigate({ type: "chats" })}>
        Настройки чатов
      </button>
    </div>
  );
}
