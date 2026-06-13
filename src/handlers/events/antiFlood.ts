import { Composer } from "grammy";

import { chatMemberService } from "../../database/services/chatMemberService.ts";
import { chatService } from "../../database/services/chatService.ts";
import type { MyContext } from "../../i18n.ts";
import { isMtprotoConfigured, banChatMemberWithMtproto, restrictChatMemberWithMtproto } from "../../mtproto.ts";
import {
  formatDuration,
  parseDuration,
  restrictedChatPermissions,
  secondsToHumanDuration,
  userLink,
} from "../../utils/moderation.ts";
import type { AntiFloodAction } from "../../database/models/chat.ts";

export const antiFloodComposer = new Composer<MyContext>();

const ANON_ADMIN_BOT_ID = 1087968824;

interface FloodEntry {
  count: number;
  msgIds: number[];
  timer: ReturnType<typeof setTimeout>;
}

// ключ: `${chatId}:${userId}`
const floodMap = new Map<string, FloodEntry>();
const punishedSet = new Set<string>();

antiFloodComposer.on("message", async (ctx, next) => {
  const chatType = ctx.chat?.type;
  if (!chatType || chatType === "private") return;

  const userId = ctx.from?.id;
  const chatId = ctx.chatId;
  if (!userId || !chatId) return;

  // пропускаем ботов и анонимных админов
  if (ctx.from.is_bot || userId === ANON_ADMIN_BOT_ID) return;

  const chat = await chatService.get(chatId).catch(() => null);
  if (!chat?.antiFlood?.enabled) return;

  const { messages: limit, time, action, durationAction, deleteMessages } = chat.antiFlood;
  const key = `${chatId}:${userId}`;

  const msgId = ctx.message.message_id;

  // если пользователь уже наказан в этом окне — удаляем сообщение и выходим
  if (punishedSet.has(key)) {
    if (deleteMessages) ctx.api.deleteMessage(chatId, msgId).catch(() => {});
    return next();
  }

  const existing = floodMap.get(key);

  if (existing) {
    existing.count++;
    existing.msgIds.push(msgId);

    if (existing.count > limit) {
      clearTimeout(existing.timer);
      floodMap.delete(key);
      punishedSet.add(key);

      if (deleteMessages) {
        for (const id of existing.msgIds) {
          ctx.api.deleteMessage(chatId, id).catch(() => {});
        }
      }

      const target = {
        id: userId,
        firstName: ctx.from.first_name,
        username: ctx.from.username,
      };

      const untilDate = durationAction
        ? Math.floor(Date.now() / 1000) + durationAction
        : undefined;

      const durationLabel = durationAction
        ? formatDuration(ctx, secondsToHumanDuration(durationAction))
        : ctx.t("moderation.duration.forever");

      try {
        if (action === "warn") {
          await applyWarn(ctx, chatId, userId, target, durationLabel);
        } else {
          await applyPunishment(ctx, chatId, userId, action, untilDate);
          await ctx.reply(
            ctx.t(`moderation.antiflood.${action}` as const, {
              target: userLink(ctx, target),
              duration: durationLabel,
            }),
            { parse_mode: "HTML" },
          ).catch(() => {});
        }
      } catch {
        punishedSet.delete(key);
        return next();
      }

      // через то же окно сбрасываем флаг — если продолжает спамить, счётчик сразу накопится заново
      setTimeout(() => punishedSet.delete(key), time * 1000);
    }
  } else {
    const timer = setTimeout(() => floodMap.delete(key), time * 1000);
    floodMap.set(key, { count: 1, msgIds: [msgId], timer });
  }

  return next();
});

async function applyWarn(
  ctx: MyContext,
  chatId: number,
  userId: number,
  target: { id: number; firstName: string; username?: string },
  durationLabel: string,
): Promise<void> {
  const chat = await chatService.get(chatId);
  const maxWarns = chat?.warn.maxWarns ?? 3;
  const warnDurationSeconds = chat?.warn.warnDuration ?? null;
  const expiresAt = warnDurationSeconds ? new Date(Date.now() + warnDurationSeconds * 1000) : null;

  const member = await chatMemberService.addWarning(chatId, userId, {
    moderatorId: 0,
    reason: "флуд",
    expiresAt,
  });

  const activeWarns = member.warnings.filter((w) => w.active).length;

  if (activeWarns < maxWarns) {
    await ctx.reply(
      ctx.t("moderation.antiflood.warn", {
        target: userLink(ctx, target),
        duration: durationLabel,
        count: activeWarns,
        max: maxWarns,
      }),
      { parse_mode: "HTML" },
    ).catch(() => {});
    return;
  }

  // достигнут лимит варнов — применяем основное наказание из настроек варнов
  const warnAction = chat?.warn.action ?? "kick";
  const actionDurationSeconds = warnAction !== "kick" ? (chat?.warn.actionDuration ?? null) : null;
  const untilDate = actionDurationSeconds
    ? Math.floor(Date.now() / 1000) + actionDurationSeconds
    : undefined;
  const punishDurationLabel = actionDurationSeconds
    ? formatDuration(ctx, secondsToHumanDuration(actionDurationSeconds))
    : ctx.t("moderation.duration.forever");

  await applyPunishment(ctx, chatId, userId, warnAction, untilDate);
  chatMemberService.resetWarnings(chatId, userId).catch(() => {});

  await ctx.reply(
    ctx.t(`moderation.warn.limit_${warnAction}`, {
      target: userLink(ctx, target),
      count: activeWarns,
      max: maxWarns,
      reason: "флуд",
      duration: punishDurationLabel,
    }),
    { parse_mode: "HTML" },
  ).catch(() => {});
}

async function applyPunishment(
  ctx: MyContext,
  chatId: number,
  userId: number,
  action: AntiFloodAction,
  untilDate?: number,
): Promise<void> {
  if (action === "kick") {
    if (isMtprotoConfigured()) {
      await banChatMemberWithMtproto({ chatId, target: { id: userId } });
    } else {
      await ctx.api.banChatMember(chatId, userId);
    }
    await ctx.api.unbanChatMember(chatId, userId, { only_if_banned: true });
    return;
  }

  if (action === "ban") {
    if (isMtprotoConfigured()) {
      const result = await banChatMemberWithMtproto({ chatId, target: { id: userId }, untilDate });
      if (!result.ok) await ctx.api.banChatMember(chatId, userId, { until_date: untilDate });
    } else {
      await ctx.api.banChatMember(chatId, userId, { until_date: untilDate });
    }
    return;
  }

  if (action === "mute") {
    if (isMtprotoConfigured()) {
      const result = await restrictChatMemberWithMtproto({ chatId, target: { id: userId }, untilDate });
      if (!result.ok) {
        await ctx.api.restrictChatMember(chatId, userId, restrictedChatPermissions, {
          until_date: untilDate,
          use_independent_chat_permissions: false,
        });
      }
    } else {
      await ctx.api.restrictChatMember(chatId, userId, restrictedChatPermissions, {
        until_date: untilDate,
        use_independent_chat_permissions: false,
      });
    }
    return;
  }

}
