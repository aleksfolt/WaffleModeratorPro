import { Composer } from "grammy";

import { chatService } from "../../database/services/chatService.ts";
import type { MyContext } from "../../i18n.ts";
import { escapeHtml } from "../../utils/moderation.ts";

export const callAdminComposer = new Composer<MyContext>();

callAdminComposer.on("message", async (ctx) => {
  if (!ctx.chatId || !ctx.from) return;

  const text = ctx.message.text ?? ctx.message.caption ?? "";
  if (!text.includes("@admin")) return;

  const chat = await chatService.get(ctx.chatId).catch(() => null);
  if (!chat?.callAdmin.enabled) return;

  const targetIds = chat.callAdmin.target === "admins" ? chat.admins : chat.allAdmins;
  if (targetIds.length === 0) return;

  const callerName = escapeHtml(ctx.from.first_name || ctx.t("moderation.user_fallback"));
  const callerMention = `<a href="tg://user?id=${ctx.from.id}">${callerName}</a>`;
  const chatTitle = escapeHtml("title" in ctx.chat ? (ctx.chat.title ?? "чат") : "чат");

  const notifyText = ctx.t("commands.call_admin_dm", {
    caller: callerMention,
    chat: chatTitle,
  });

  const repliedId = ctx.message.reply_to_message?.message_id;

  for (const adminId of targetIds) {
    try {
      await ctx.api.sendMessage(adminId, notifyText, { parse_mode: "HTML" });

      if (repliedId) {
        await ctx.api.forwardMessage(adminId, ctx.chatId, repliedId);
      }
    } catch {
      // Администратор не запустил бота или заблокировал его
    }
  }
});
