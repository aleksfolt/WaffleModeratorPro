import { Composer } from "grammy";

import { chatMemberService } from "../../database/services/chatMemberService.ts";
import { chatService } from "../../database/services/chatService.ts";
import type { MyContext } from "../../i18n.ts";
import { buildKeyboard } from "../../utils/keyboard.ts";
import { escapeHtml } from "../../utils/moderation.ts";

export const chatMemberComposer = new Composer<MyContext>();

const JOINED_FROM = new Set(["left", "kicked"]);

chatMemberComposer.on("message:new_chat_members", async (ctx) => {
  const chatId = ctx.chat.id;
  for (const user of ctx.message.new_chat_members) {
    if (user.is_bot) continue;
    await handleWelcome(ctx, chatId, user.id, user.first_name);
  }
});

chatMemberComposer.on("chat_member", async (ctx) => {
  const { old_chat_member, new_chat_member } = ctx.chatMember;
  const oldStatus = old_chat_member.status;
  const newStatus = new_chat_member.status;
  const userId = new_chat_member.user.id;
  const chatId = ctx.chat.id;

  const wasAdmin = oldStatus === "administrator" || oldStatus === "creator";
  const isNowAdmin = newStatus === "administrator" || newStatus === "creator";

  if (!wasAdmin && isNowAdmin) {
    chatService
      .addAdmin(chatId, userId)
      .catch((error) => console.error("Failed to add admin:", error));
  } else if (wasAdmin && !isNowAdmin) {
    chatService
      .removeAdmin(chatId, userId)
      .catch((error) => console.error("Failed to remove admin:", error));
  }

  // Приветствие при вступлении в чат
  if (newStatus === "member" && JOINED_FROM.has(oldStatus)) {
    await handleWelcome(ctx, chatId, userId, new_chat_member.user.first_name);
  }
});


async function handleWelcome(
  ctx: MyContext,
  chatId: number,
  userId: number,
  firstName: string,
): Promise<void> {
  console.log(`[welcome] chatId=${chatId} userId=${userId}`);
  const chat = await chatService.get(chatId).catch(() => null);
  console.log(`[welcome] chat=${chat ? "found" : "null"} enabled=${chat?.welcome?.enabled}`);
  if (!chat?.welcome.enabled) return;

  if (chat.welcome.onlyFirst) {
    const alreadySeen = await chatMemberService.exists(chatId, userId);
    console.log(`[welcome] onlyFirst=${chat.welcome.onlyFirst} alreadySeen=${alreadySeen}`);
    if (alreadySeen) return;
  }

  chatMemberService
    .upsert({ chatId, userId })
    .catch((error) => console.error("Failed to upsert chat member on welcome:", error));

  const text = chat.welcome.message
    ? chat.welcome.message.replace(/\{\{name\}\}/g, escapeHtml(firstName))
    : ctx.t("chat.welcome_default", { name: escapeHtml(firstName) });

  const keyboard = buildKeyboard(chat.welcome.buttons);

  console.log(`[welcome] sending message, text length=${text.length}`);
  await ctx.reply(text, {
    parse_mode: "HTML",
    ...(keyboard ? { reply_markup: keyboard } : {}),
  }).catch((e) => console.error("[welcome] reply failed:", e));
}
