export type Page =
  | { type: "home" }
  | { type: "chats" }
  | { type: "chat-menu"; chatId: number; title: string }
  | { type: "warn-settings"; chatId: number; title: string }
  | { type: "welcome-settings"; chatId: number; title: string }
  | { type: "call-admin-settings"; chatId: number; title: string }
  | { type: "anon-admin-settings"; chatId: number; title: string }
  | { type: "anti-flood-settings"; chatId: number; title: string }
  | { type: "nsfw-filter-settings"; chatId: number; title: string }
  | { type: "rules-settings"; chatId: number; title: string };
