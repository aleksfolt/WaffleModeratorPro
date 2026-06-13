import { Composer, InlineKeyboard } from "grammy";

import { chatMemberService } from "../../database/services/chatMemberService.ts";
import { hasPromoteRights } from "../../middlewares/index.ts";
import type { MyContext } from "../../i18n.ts";
import {
  isMtprotoConfigured,
  restrictChatMemberWithMtproto,
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
  liftChatRestrictions,
  parseCommand,
  replyMtprotoModerationError,
  replyModerationError,
  restrictedChatPermissions,
  type TargetUser,
  userLink,
} from "../../utils/moderation.ts";

export const muteComposer = new Composer<MyContext>();
muteComposer.use(hasPromoteRights);

muteComposer.command("mute", async (ctx) => {
  try {
    if (!ctx.chatId) {
      await ctx.reply(ctx.t("moderation.errors.chat_required"));
      return;
    }

    const parsed = parseCommand(ctx.message!.text!);
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

    const muteResult = await muteTarget(ctx, ctx.chatId, target, untilDate);

    if (!muteResult.ok) {
      await replyMtprotoModerationError(ctx, muteResult);
      return;
    }

    chatMemberService
      .upsert({ chatId: ctx.chatId, userId: target.id, mutedUntil: untilDate ? new Date(untilDate * 1000) : null })
      .catch((error) => console.error("Failed to update mutedUntil:", error));

    const keyboard = new InlineKeyboard().text(
      ctx.t("moderation.buttons.unmute"),
      `moderation:unmute:${target.id}`,
    );

    await ctx.reply(
      ctx.t("moderation.mute.success", {
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

async function muteTarget(
  ctx: MyContext,
  chatId: number,
  target: TargetUser,
  untilDate?: number,
): Promise<MtprotoModerationResult> {
  if (isMtprotoConfigured()) {
    const result = await restrictChatMemberWithMtproto({ chatId, target, untilDate });

    if (result.ok || target.username) {
      return result;
    }
  }

  await ctx.api.restrictChatMember(chatId, target.id, restrictedChatPermissions, {
    until_date: untilDate,
    use_independent_chat_permissions: false,
  });

  return { ok: true };
}

muteComposer.command("unmute", async (ctx) => {
  try {
    if (!ctx.chatId) {
      await ctx.reply(ctx.t("moderation.errors.chat_required"));
      return;
    }

    const parsed = parseCommand(ctx.message!.text!);
    const args = parsed?.args ?? [];
    const targetResult = await getTargetUser(ctx, args);

    if (!targetResult.ok) {
      await ctx.reply(ctx.t(targetResult.error), { parse_mode: "HTML" });
      return;
    }

    await liftChatRestrictions(ctx, ctx.chatId, targetResult.target.id);

    chatMemberService
      .upsert({ chatId: ctx.chatId, userId: targetResult.target.id, mutedUntil: null })
      .catch((error) => console.error("Failed to clear mutedUntil:", error));

    await ctx.reply(
      ctx.t("moderation.unmute.success", {
        target: userLink(ctx, targetResult.target),
      }),
      { parse_mode: "HTML" },
    );
  } catch (error) {
    await replyModerationError(ctx, error);
  }
});

muteComposer.callbackQuery(/^moderation:unmute:(\d+)$/, async (ctx) => {
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

    await liftChatRestrictions(ctx, chatId, userId);

    chatMemberService
      .upsert({ chatId, userId, mutedUntil: null })
      .catch((error) => console.error("Failed to clear mutedUntil:", error));

    await ctx.answerCallbackQuery();

    const msg = ctx.callbackQuery.message;
    if (msg && "text" in msg) {
      const label = ctx.t("moderation.unmute.callback_success");
      await ctx.editMessageText(msg.text + "\n\n" + label, {
        entities: msg.entities,
      });
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
