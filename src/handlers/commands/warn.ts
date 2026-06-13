import { Composer, InlineKeyboard } from "grammy";

import { chatMemberService } from "../../database/services/chatMemberService.ts";
import { chatService } from "../../database/services/chatService.ts";
import { hasPromoteRights } from "../../middlewares/index.ts";
import type { MyContext } from "../../i18n.ts";
import {
  banChatMemberWithMtproto,
  isMtprotoConfigured,
  restrictChatMemberWithMtproto,
} from "../../mtproto.ts";
import {
  formatDuration,
  getRegexNumberGroup,
  getTargetUser,
  getModerationErrorKey,
  getReason,
  getUntilDate,
  liftChatRestrictions,
  parseCommand,
  parseDuration,
  replyModerationError,
  restrictedChatPermissions,
  secondsToHumanDuration,
  userLink,
  errorMessage,
  type TargetUser,
} from "../../utils/moderation.ts";

export const warnComposer = new Composer<MyContext>();
warnComposer.use(hasPromoteRights);

warnComposer.command("warn", async (ctx) => {
  try {
    if (!ctx.chatId) {
      await ctx.reply(ctx.t("moderation.errors.chat_required"), { parse_mode: "HTML" });
      return;
    }

    const parsed = parseCommand(ctx.message!.text!);
    const args = parsed?.args ?? [];
    const targetResult = await getTargetUser(ctx, args);

    if (!targetResult.ok) {
      await ctx.reply(ctx.t(targetResult.error), { parse_mode: "HTML" });
      return;
    }

    const target = targetResult.target;
    const reason = getReason(ctx, args, targetResult.targetArgIndex, undefined);

    const chat = await chatService.get(ctx.chatId);
    const maxWarns = chat?.warn.maxWarns ?? 3;

    const warnDurationSeconds = chat?.warn.warnDuration ?? null;
    const expiresAt = warnDurationSeconds
      ? new Date(Date.now() + warnDurationSeconds * 1000)
      : null;

    const member = await chatMemberService.addWarning(ctx.chatId, target.id, {
      moderatorId: ctx.from!.id,
      reason,
      expiresAt,
    });

    const activeWarns = member.warnings.filter((w) => w.active).length;

    if (activeWarns < maxWarns) {
      await ctx.reply(
        ctx.t("moderation.warn.success", {
          target: userLink(ctx, target),
          count: activeWarns,
          max: maxWarns,
          reason,
        }),
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text(
            ctx.t("moderation.buttons.unwarn"),
            `moderation:unwarn:${target.id}`,
          ),
        },
      );
      return;
    }

    // Достигнут лимит — применяем наказание
    const warnAction = chat?.warn.action ?? "kick";
    const actionDurationSeconds = warnAction !== "kick" ? (chat?.warn.actionDuration ?? null) : null;
    const untilDate = actionDurationSeconds
      ? getUntilDate(secondsToHumanDuration(actionDurationSeconds))
      : undefined;

    const durationLabel = actionDurationSeconds
      ? formatDuration(ctx, secondsToHumanDuration(actionDurationSeconds))
      : ctx.t("moderation.duration.forever");

    try {
      await applyPunishment(ctx, ctx.chatId, target, warnAction, untilDate);
    } catch (punishError) {
      await replyModerationError(ctx, punishError);
      return;
    }

    chatMemberService.resetWarnings(ctx.chatId, target.id).catch(() => {});

    await ctx.reply(
      ctx.t(`moderation.warn.limit_${warnAction}`, {
        target: userLink(ctx, target),
        count: activeWarns,
        max: maxWarns,
        reason,
        duration: durationLabel,
      }),
      { parse_mode: "HTML" },
    );
  } catch (error) {
    await replyModerationError(ctx, error);
  }
});

warnComposer.command("unwarn", async (ctx) => {
  try {
    if (!ctx.chatId) {
      await ctx.reply(ctx.t("moderation.errors.chat_required"), { parse_mode: "HTML" });
      return;
    }

    const parsed = parseCommand(ctx.message!.text!);
    const args = parsed?.args ?? [];
    const targetResult = await getTargetUser(ctx, args);

    if (!targetResult.ok) {
      await ctx.reply(ctx.t(targetResult.error), { parse_mode: "HTML" });
      return;
    }

    const target = targetResult.target;
    const member = await chatMemberService.removeLastWarning(ctx.chatId, target.id);

    if (!member) {
      await ctx.reply(ctx.t("moderation.warn.not_in_db"), { parse_mode: "HTML" });
      return;
    }

    const activeWarns = member.warnings.filter((w) => w.active).length;

    await ctx.reply(
      ctx.t("moderation.unwarn.success", {
        target: userLink(ctx, target),
        count: activeWarns,
      }),
      { parse_mode: "HTML" },
    );
  } catch (error) {
    await replyModerationError(ctx, error);
  }
});

warnComposer.callbackQuery(/^moderation:unwarn:(\d+)$/, async (ctx) => {
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

    const member = await chatMemberService.removeLastWarning(chatId, userId);
    const activeWarns = member?.warnings.filter((w) => w.active).length ?? 0;

    await ctx.answerCallbackQuery();

    const msg = ctx.callbackQuery.message;
    if (msg && "text" in msg) {
      const label = ctx.t("moderation.unwarn.callback_success");
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

async function applyPunishment(
  ctx: MyContext,
  chatId: number,
  target: TargetUser,
  action: "kick" | "ban" | "mute",
  untilDate?: number,
): Promise<void> {
  if (action === "kick") {
    if (isMtprotoConfigured()) {
      await banChatMemberWithMtproto({ chatId, target });
    } else {
      await ctx.api.banChatMember(chatId, target.id);
    }
    await ctx.api.unbanChatMember(chatId, target.id, { only_if_banned: true });
    return;
  }

  if (action === "ban") {
    if (isMtprotoConfigured()) {
      const result = await banChatMemberWithMtproto({ chatId, target, untilDate });
      if (!result.ok && !target.username) {
        await ctx.api.banChatMember(chatId, target.id, { until_date: untilDate });
      }
    } else {
      await ctx.api.banChatMember(chatId, target.id, { until_date: untilDate });
    }
    chatMemberService
      .upsert({ chatId, userId: target.id, bannedUntil: untilDate ? new Date(untilDate * 1000) : null })
      .catch(() => {});
    return;
  }

  // mute
  if (isMtprotoConfigured()) {
    const result = await restrictChatMemberWithMtproto({ chatId, target, untilDate });
    if (!result.ok && !target.username) {
      await ctx.api.restrictChatMember(chatId, target.id, restrictedChatPermissions, {
        until_date: untilDate,
        use_independent_chat_permissions: false,
      });
    }
  } else {
    await ctx.api.restrictChatMember(chatId, target.id, restrictedChatPermissions, {
      until_date: untilDate,
      use_independent_chat_permissions: false,
    });
  }
  chatMemberService
    .upsert({ chatId, userId: target.id, mutedUntil: untilDate ? new Date(untilDate * 1000) : null })
    .catch(() => {});
}

// Размут по кнопке unmute работает через muteComposer — warn не дублирует callback
export async function liftWarnMute(ctx: MyContext, chatId: number, userId: number) {
  await liftChatRestrictions(ctx, chatId, userId);
}
