import { useEffect, useState } from "react";

import { getChats } from "../api.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import type { Page } from "../router.ts";
import type { ChatListItem } from "../types.ts";

interface ChatListPageProps {
  onNavigate: (p: Page) => void;
}

export function ChatListPage({ onNavigate }: ChatListPageProps) {
  const [chats, setChats] = useState<ChatListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getChats()
      .then(setChats)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <PageHeader title="Мои чаты" onBack={() => onNavigate({ type: "home" })} />

      {error && <div className="error-card">{error}</div>}
      {!chats && !error && <div className="muted center">Загрузка…</div>}

      {chats?.length === 0 && (
        <div className="section">
          <div className="section-body">
            <p className="muted">Нет чатов, где вы администратор и бот активен.</p>
          </div>
        </div>
      )}

      {chats && chats.length > 0 && (
        <div className="section">
          {chats.map((chat) => (
            <div
              key={chat.chatId}
              className="row"
              onClick={() => onNavigate({ type: "chat-menu", chatId: chat.chatId, title: chat.title })}
            >
              <div className="row-info">
                <span className="row-title">{chat.title}</span>
              </div>
              <span className="row-chevron">›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
