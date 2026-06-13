import { Composer, InlineKeyboard } from "grammy";

import { chatMemberService } from "../../database/services/chatMemberService.ts";
import { hasPromoteRights } from "../../filters/index.ts";
import type { MyContext } from "../../i18n.ts";
import {
  banChatMemberWithMtproto,
  isMtprotoConfigured,
  type MtprotoModerationResult,
} from "../../mtproto.ts";
import {
  errorMessage,
  formatDuration,
  getDuration,
  getReason,
  getRegexNumberGroup,
  getModerationErrorKey,
  getTargetUser,
  getUntilDate,
  parseCommand,
  replyMtprotoModerationError,
  replyModerationError,
  type TargetUser,
  type TextMessageContext,
  userLink,
} from "../../utils/moderation.ts";

export const banComposer = new Composer<MyContext>();

const banCommand = banComposer.on("message:text");

banCommand.command("ban", hasPromoteRights, async (ctx) => {
  try {
    if (!ctx.chatId) {
      await ctx.reply(ctx.t("moderation.errors.chat_required"), { parse_mode: "HTML" });
      return;
    }

    const parsed = parseCommand(ctx.message.text);
    const args = parsed?.args ?? [];
    const targetResult = await getTargetUser(ctx, args);

    if (!targetResult.ok) {
      await ctx.reply(ctx.t(targetResult.error), { parse_mode: "HTML" });
      return;
    }

    const duration = getDuration(args, targetResult.targetArgIndex);
    const untilDate = getUntilDate(duration);
    const reason = getReason(ctx, args, targetResult.targetArgIndex, duration?.argIndex);
    const target = targetResult.target;

    const banResult = await banTarget(ctx, ctx.chatId, target, untilDate);

    if (!banResult.ok) {
      await replyMtprotoModerationError(ctx, banResult);
      return;
    }

    chatMemberService
      .upsert({ chatId: ctx.chatId, userId: target.id, bannedUntil: untilDate ? new Date(untilDate * 1000) : null })
      .catch((error) => console.error("Failed to update bannedUntil:", error));

    const keyboard = new InlineKeyboard().text(
      ctx.t("moderation.buttons.unban"),
      `moderation:unban:${target.id}`,
    );

    await ctx.reply(
      ctx.t("moderation.ban.success", {
        target: userLink(ctx, target),
        duration: formatDuration(ctx, duration),
        reason,
      }),
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      },
    );
  } catch (error) {
    await replyModerationError(ctx, error);
  }
});

async function banTarget(
  ctx: TextMessageContext,
  chatId: number,
  target: TargetUser,
  untilDate?: number,
): Promise<MtprotoModerationResult> {
  if (isMtprotoConfigured()) {
    const result = await banChatMemberWithMtproto({ chatId, target, untilDate });

    if (result.ok || target.username) {
      return result;
    }
  }

  await ctx.api.banChatMember(chatId, target.id, {
    until_date: untilDate,
  });

  return { ok: true };
}

banCommand.command("unban", hasPromoteRights, async (ctx) => {
  try {
    if (!ctx.chatId) {
      await ctx.reply(ctx.t("moderation.errors.chat_required"), { parse_mode: "HTML" });
      return;
    }

    const parsed = parseCommand(ctx.message.text);
    const args = parsed?.args ?? [];
    const targetResult = await getTargetUser(ctx, args);

    if (!targetResult.ok) {
      await ctx.reply(ctx.t(targetResult.error), { parse_mode: "HTML" });
      return;
    }

    await ctx.api.unbanChatMember(ctx.chatId, targetResult.target.id, {
      only_if_banned: true,
    });

    chatMemberService
      .upsert({ chatId: ctx.chatId, userId: targetResult.target.id, bannedUntil: null })
      .catch((error) => console.error("Failed to clear bannedUntil:", error));

    await ctx.reply(
      ctx.t("moderation.unban.success", {
        target: userLink(ctx, targetResult.target),
      }),
      { parse_mode: "HTML" },
    );
  } catch (error) {
    await replyModerationError(ctx, error);
  }
});

banComposer.callbackQuery(/^moderation:unban:(\d+)$/, hasPromoteRights, async (ctx) => {
  try {
    const chatId = ctx.chatId;
    const userId = getRegexNumberGroup(ctx.match);

    if (!chatId || !userId) {
      await ctx.answerCallbackQuery({
        text: ctx.t("moderation.errors.callback_user_required"),
        show_alert: true,
      });
      return;
    }

    await ctx.api.unbanChatMember(chatId, userId, {
      only_if_banned: true,
    });

    chatMemberService
      .upsert({ chatId, userId, bannedUntil: null })
      .catch((error) => console.error("Failed to clear bannedUntil:", error));

    await ctx.answerCallbackQuery(ctx.t("moderation.unban.callback_success"));

    await ctx.editMessageText(
      ctx.t("moderation.unban.success", {
        target: userLink(ctx, {
          id: userId,
          firstName: ctx.t("moderation.user_fallback"),
        }),
      }),
      { parse_mode: "HTML" },
    );

    try {
      await ctx.editMessageReplyMarkup();
    } catch {
      // The message can be inaccessible or already edited. The unban itself succeeded.
    }
  } catch (error) {
    const key = getModerationErrorKey(error);

    await ctx.answerCallbackQuery({
      text: key
        ? ctx.t("moderation.errors.target_admin_callback")
        : ctx.t("moderation.errors.callback_generic", { error: errorMessage(error) }),
      show_alert: true,
    });
  }
});
