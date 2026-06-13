import { GrammyError, type Context, type MiddlewareFn } from "grammy";

import { chatService } from "../database/services/chatService.ts";
import type { MyContext } from "../i18n.ts";

const noPrivateChatAdminsError = "there are no administrators in the private chat";

const ANON_ADMIN_BOT_ID = 1087968824;

export const hasPromoteRights: MiddlewareFn<MyContext> = async (ctx, next) => {
  const isCommand = ctx.message?.entities?.some((e) => e.type === "bot_command");
  const isCallback = !!ctx.callbackQuery;

  console.log(`[hasPromoteRights] isCommand=${isCommand} isCallback=${isCallback} from=${ctx.from?.id}`);

  if (!isCommand && !isCallback) return next();

  const can = await canPromoteMembers(ctx);
  console.log(`[hasPromoteRights] canPromoteMembers=${can}`);

  if (can) {
    return next();
  }

  if (isCallback) {
    await ctx.answerCallbackQuery({
      text: ctx.t("moderation.errors.no_rights_callback"),
      show_alert: true,
    });
    return;
  }

  await ctx.reply(ctx.t("moderation.errors.no_rights"), {
    parse_mode: "HTML",
  });
};

export async function canPromoteMembers(ctx: Context): Promise<boolean> {
  const chatId = ctx.chatId;
  const userId = ctx.from?.id;

  if (chatId === undefined || userId === undefined) {
    return false;
  }

  // Анонимный админ — проверяем настройку в БД
  if (userId === ANON_ADMIN_BOT_ID) {
    const chat = await chatService.get(chatId).catch(() => null);
    return chat?.anonAdmin?.blockEnabled === true;
  }

  let admins;

  try {
    admins = await ctx.api.getChatAdministrators(chatId);
  } catch (error) {
    if (
      error instanceof GrammyError &&
      error.description.toLowerCase().includes(noPrivateChatAdminsError)
    ) {
      return false;
    }

    throw error;
  }

  return admins.some((admin) => {
    if (admin.user.id !== userId) {
      return false;
    }

    return admin.status === "creator" || admin.can_restrict_members;
  });
}
