import { GrammyError, type Context, type MiddlewareFn } from "grammy";

import type { MyContext } from "../i18n.ts";

const noPrivateChatAdminsError = "there are no administrators in the private chat";

export const hasPromoteRights: MiddlewareFn<MyContext> = async (ctx, next) => {
  if (await canPromoteMembers(ctx)) {
    return next();
  }

  if (ctx.callbackQuery) {
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
