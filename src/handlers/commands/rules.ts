import { Composer } from "grammy";

import { chatService } from "../../database/services/chatService.ts";
import type { MyContext } from "../../i18n.ts";
import { buildKeyboard } from "../../utils/keyboard.ts";

export const rulesComposer = new Composer<MyContext>();

rulesComposer.command("rules", async (ctx) => {
  if (!ctx.chat || ctx.chat.type === "private") return;

  const chat = await chatService.get(ctx.chat.id).catch(() => null);
  if (!chat?.rules?.enabled) return;

  const { text, buttons, permissions } = chat.rules;
  const keyboard = buildKeyboard(buttons);

  switch (permissions) {
    case "noone":
      return;

    case "admins": {
      const member = await ctx.getChatMember(ctx.from!.id).catch(() => null);
      const isAdmin = member && ["administrator", "creator"].includes(member.status);
      if (!isAdmin) return;
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
      return;
    }

    case "private": {
      try {
        await ctx.api.sendMessage(ctx.from!.id, text, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
        if ((ctx.chat.type as string) !== "private") {
          await ctx.reply("✅ Правила отправлены вам в личные сообщения.");
        }
      } catch {
        await ctx.reply(
          "❌ Не удалось отправить правила.\n" +
            "Возможно, вы не начали диалог с ботом. Начните диалог и повторите попытку.",
        );
      }
      return;
    }

    case "members":
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
      return;
  }
});
