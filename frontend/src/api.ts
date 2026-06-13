import type { AnonAdminSettings, AntiFloodSettings, CallAdminSettings, ChatListItem, NsfwFilterSettings, RulesSettings, WarnSettings, WelcomeSettings } from "./types.ts";

function initData(): string {
  try {
    return (window as Record<string, unknown> & { Telegram?: { WebApp?: { initData?: string } } })
      .Telegram?.WebApp?.initData ?? "";
  } catch {
    return "";
  }
}

function headers(): HeadersInit {
  return { "x-telegram-init-data": initData(), "content-type": "application/json" };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...options, headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export function getChats(): Promise<ChatListItem[]> {
  return request("/api/chats");
}

export function getWarnSettings(chatId: number): Promise<WarnSettings> {
  return request(`/api/chats/${chatId}/warn`);
}

export function updateWarnSettings(chatId: number, settings: WarnSettings): Promise<{ ok: boolean }> {
  return request(`/api/chats/${chatId}/warn`, { method: "PATCH", body: JSON.stringify(settings) });
}

export function getWelcomeSettings(chatId: number): Promise<WelcomeSettings> {
  return request(`/api/chats/${chatId}/welcome`);
}

export function updateWelcomeSettings(chatId: number, settings: WelcomeSettings): Promise<{ ok: boolean }> {
  return request(`/api/chats/${chatId}/welcome`, { method: "PATCH", body: JSON.stringify(settings) });
}

export function getCallAdminSettings(chatId: number): Promise<CallAdminSettings> {
  return request(`/api/chats/${chatId}/call-admin`);
}

export function updateCallAdminSettings(chatId: number, settings: CallAdminSettings): Promise<{ ok: boolean }> {
  return request(`/api/chats/${chatId}/call-admin`, { method: "PATCH", body: JSON.stringify(settings) });
}

export function getAntiFloodSettings(chatId: number): Promise<AntiFloodSettings> {
  return request(`/api/chats/${chatId}/anti-flood`);
}

export function updateAntiFloodSettings(chatId: number, settings: AntiFloodSettings): Promise<{ ok: boolean }> {
  return request(`/api/chats/${chatId}/anti-flood`, { method: "PATCH", body: JSON.stringify(settings) });
}

export function getAnonAdminSettings(chatId: number): Promise<AnonAdminSettings> {
  return request(`/api/chats/${chatId}/anon-admin`);
}

export function updateAnonAdminSettings(chatId: number, settings: AnonAdminSettings): Promise<{ ok: boolean }> {
  return request(`/api/chats/${chatId}/anon-admin`, { method: "PATCH", body: JSON.stringify(settings) });
}

export function getNsfwFilterSettings(chatId: number): Promise<NsfwFilterSettings> {
  return request(`/api/chats/${chatId}/nsfw-filter`);
}

export function updateNsfwFilterSettings(chatId: number, settings: NsfwFilterSettings): Promise<{ ok: boolean }> {
  return request(`/api/chats/${chatId}/nsfw-filter`, { method: "PATCH", body: JSON.stringify(settings) });
}

export function getRulesSettings(chatId: number): Promise<RulesSettings> {
  return request(`/api/chats/${chatId}/rules`);
}

export function updateRulesSettings(chatId: number, settings: RulesSettings): Promise<{ ok: boolean }> {
  return request(`/api/chats/${chatId}/rules`, { method: "PATCH", body: JSON.stringify(settings) });
}
