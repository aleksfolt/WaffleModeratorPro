import { Composer } from "grammy";

import { chatMemberService } from "../../database/services/chatMemberService.ts";
import { chatService } from "../../database/services/chatService.ts";
import type { MyContext } from "../../i18n.ts";

export const migrateComposer = new Composer<MyContext>();

migrateComposer.on("message:migrate_to_chat_id", async (ctx) => {
  const oldChatId = ctx.chat.id;
  const newChatId = ctx.message.migrate_to_chat_id;

  console.log(`Chat migration: ${oldChatId} -> ${newChatId}`);

  await Promise.all([
    chatService
      .migrateChat(oldChatId, newChatId)
      .catch((error) => console.error("Failed to migrate chat record:", error)),
    chatMemberService
      .migrateChat(oldChatId, newChatId)
      .catch((error) => console.error("Failed to migrate chat members:", error)),
  ]);

  console.log(`Chat migration done: ${oldChatId} -> ${newChatId}`);
});