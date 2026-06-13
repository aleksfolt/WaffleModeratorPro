import { useEffect, useState } from "react";

import "./App.css";
import { AnonAdminSettingsPage } from "./pages/AnonAdminSettingsPage.tsx";
import { AntiFloodSettingsPage } from "./pages/AntiFloodSettingsPage.tsx";
import { NsfwFilterSettingsPage } from "./pages/NsfwFilterSettingsPage.tsx";
import { RulesSettingsPage } from "./pages/RulesSettingsPage.tsx";
import { CallAdminSettingsPage } from "./pages/CallAdminSettingsPage.tsx";
import { ChatListPage } from "./pages/ChatListPage.tsx";
import { ChatMenuPage } from "./pages/ChatMenuPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { WarnSettingsPage } from "./pages/WarnSettingsPage.tsx";
import { WelcomeSettingsPage } from "./pages/WelcomeSettingsPage.tsx";
import type { Page } from "./router.ts";

function telegramReady() {
  try {
    const tg = (window as unknown as Record<string, unknown>).Telegram as
      | { WebApp?: { ready?: () => void; expand?: () => void } }
      | undefined;
    tg?.WebApp?.ready?.();
    tg?.WebApp?.expand?.();
  } catch {}
}

export default function App() {
  const [page, setPage] = useState<Page>({ type: "home" });

  useEffect(() => {
    telegramReady();
  }, []);

  if (page.type === "home") return <HomePage onNavigate={setPage} />;
  if (page.type === "chats") return <ChatListPage onNavigate={setPage} />;
  if (page.type === "chat-menu") return <ChatMenuPage chatId={page.chatId} title={page.title} onNavigate={setPage} />;
  if (page.type === "warn-settings") return <WarnSettingsPage chatId={page.chatId} title={page.title} onNavigate={setPage} />;
  if (page.type === "welcome-settings") return <WelcomeSettingsPage chatId={page.chatId} title={page.title} onNavigate={setPage} />;
  if (page.type === "call-admin-settings") return <CallAdminSettingsPage chatId={page.chatId} title={page.title} onNavigate={setPage} />;
  if (page.type === "anon-admin-settings") return <AnonAdminSettingsPage chatId={page.chatId} title={page.title} onNavigate={setPage} />;
  if (page.type === "anti-flood-settings") return <AntiFloodSettingsPage chatId={page.chatId} title={page.title} onNavigate={setPage} />;
  if (page.type === "nsfw-filter-settings") return <NsfwFilterSettingsPage chatId={page.chatId} title={page.title} onNavigate={setPage} />;
  return <RulesSettingsPage chatId={page.chatId} title={page.title} onNavigate={setPage} />;
}
