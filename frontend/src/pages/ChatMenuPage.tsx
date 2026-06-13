import { PageHeader } from "../components/PageHeader.tsx";
import type { Page } from "../router.ts";

interface ChatMenuPageProps {
  chatId: number;
  title: string;
  onNavigate: (p: Page) => void;
}

const MENU_ITEMS = [
  {
    icon: "⚠️",
    label: "Настройка варнов",
    desc: "Максимум предупреждений, тип и длительность наказания",
    pageType: "warn-settings" as const,
  },
  {
    icon: "👋",
    label: "Приветствие",
    desc: "Сообщение при вступлении нового участника",
    pageType: "welcome-settings" as const,
  },
  {
    icon: "🆘",
    label: "Тег @admin",
    desc: "Вызов администраторов в ЛС через @admin",
    pageType: "call-admin-settings" as const,
  },
  {
    icon: "🥷",
    label: "Анонимные админы",
    desc: "Права для администраторов без имени",
    pageType: "anon-admin-settings" as const,
  },
  {
    icon: "🌊",
    label: "Антифлуд",
    desc: "Защита от спама и частых сообщений",
    pageType: "anti-flood-settings" as const,
  },
  {
    icon: "🔞",
    label: "NSFW-фильтр",
    desc: "Автоматическое удаление неприемлемых изображений",
    pageType: "nsfw-filter-settings" as const,
  },
  {
    icon: "📜",
    label: "Правила",
    desc: "Текст правил группы по команде /rules",
    pageType: "rules-settings" as const,
  },
];

export function ChatMenuPage({ chatId, title, onNavigate }: ChatMenuPageProps) {
  return (
    <div className="page">
      <PageHeader title={title} onBack={() => onNavigate({ type: "chats" })} />

      <div className="section">
        {MENU_ITEMS.map((item) => (
          <div
            key={item.label}
            className="row"
            onClick={() => onNavigate({ type: item.pageType, chatId, title })}
          >
            <div className="row-icon">{item.icon}</div>
            <div className="row-info">
              <span className="row-title">{item.label}</span>
              <span className="row-meta">{item.desc}</span>
            </div>
            <span className="row-chevron">›</span>
          </div>
        ))}
      </div>
    </div>
  );
}
