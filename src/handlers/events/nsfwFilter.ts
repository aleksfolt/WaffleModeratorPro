import { unlink } from "node:fs/promises";

import { Composer } from "grammy";

import { chatMemberService } from "../../database/services/chatMemberService.ts";
import { chatService } from "../../database/services/chatService.ts";
import type { MyContext } from "../../i18n.ts";
import {
  banChatMemberWithMtproto,
  isMtprotoConfigured,
  restrictChatMemberWithMtproto,
} from "../../mtproto.ts";
import { detectNudity, COVERED_NSFW_CLASSES, NSFW_CLASSES } from "../../nudenetDetector.ts";
import {
  formatDuration,
  restrictedChatPermissions,
  secondsToHumanDuration,
  userLink,
} from "../../utils/moderation.ts";
import type { NsfwAction } from "../../database/models/chat.ts";

const ANON_ADMIN_BOT_ID = 1087968824;

export function createNsfwFilterComposer(botToken: string): Composer<MyContext> {
  const composer = new Composer<MyContext>();

  composer.on("message:photo", async (ctx, next) => {
    // апдейт продолжается немедленно — проверка в фоне
    void next();

    const chatId = ctx.chatId;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;
    if (ctx.chat.type === "private") return;
    if (ctx.from.is_bot || userId === ANON_ADMIN_BOT_ID) return;

    const tmpPath = `/tmp/nsfw_${ctx.message.photo.at(-1)!.file_id}.jpg`;

    try {
      const chat = await chatService.get(chatId).catch(() => null);
      if (!chat?.nsfwFilter?.enabled) return;

      const { percent, blockCovered, action, durationAction, deleteMessage } = chat.nsfwFilter;

      const photo = ctx.message.photo.at(-1)!;
      const file = await ctx.api.getFile(photo.file_id);
      if (!file.file_path) return;

      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
      const res = await fetch(fileUrl);
      if (!res.ok) return;

      await Bun.write(tmpPath, await res.arrayBuffer());

      // confThreshold из percent (0-100 → 0-1)
      const detections = await detectNudity(tmpPath, percent / 100);
      const nsfwDetections = detections.filter(
        (d) => NSFW_CLASSES.has(d.className) || (blockCovered && COVERED_NSFW_CLASSES.has(d.className)),
      );

      if (nsfwDetections.length === 0) return;

      const best = nsfwDetections.reduce((a, b) => (a.confidence > b.confidence ? a : b));
      console.log(
        `[NSFW] chat ${chatId} user ${userId}: detected ${best.className} (${(best.confidence * 100).toFixed(1)}%)`,
      );

      const msgId = ctx.message.message_id;
      if (deleteMessage) {
        ctx.api.deleteMessage(chatId, msgId).catch(() => {});
      }

      const target = { id: userId, firstName: ctx.from.first_name, username: ctx.from.username };
      const untilDate = durationAction ? Math.floor(Date.now() / 1000) + durationAction : undefined;
      const durationLabel = durationAction
        ? formatDuration(ctx, secondsToHumanDuration(durationAction))
        : ctx.t("moderation.duration.forever");

      if (action === "warn") {
        const maxWarns = chat.warn.maxWarns ?? 3;
        const expiresAt = chat.warn.warnDuration
          ? new Date(Date.now() + chat.warn.warnDuration * 1000)
          : null;

        const member = await chatMemberService.addWarning(chatId, userId, {
          moderatorId: 0,
          reason: "NSFW-контент",
          expiresAt,
        });

        const activeWarns = member.warnings.filter((w) => w.active).length;

        if (activeWarns < maxWarns) {
          await ctx
            .reply(
              ctx.t("moderation.nsfw.warn", {
                target: userLink(ctx, target),
                count: activeWarns,
                max: maxWarns,
              }),
              { parse_mode: "HTML" },
            )
            .catch(() => {});
        } else {
          const warnAction = chat.warn.action ?? "kick";
          const actionSeconds = warnAction !== "kick" ? (chat.warn.actionDuration ?? null) : null;
          const warnUntil = actionSeconds
            ? Math.floor(Date.now() / 1000) + actionSeconds
            : undefined;
          const warnDurationLabel = actionSeconds
            ? formatDuration(ctx, secondsToHumanDuration(actionSeconds))
            : ctx.t("moderation.duration.forever");

          await applyPunishment(ctx, chatId, userId, warnAction, warnUntil);
          chatMemberService.resetWarnings(chatId, userId).catch(() => {});

          await ctx
            .reply(
              ctx.t(`moderation.warn.limit_${warnAction}`, {
                target: userLink(ctx, target),
                count: activeWarns,
                max: maxWarns,
                reason: "NSFW-контент",
                duration: warnDurationLabel,
              }),
              { parse_mode: "HTML" },
            )
            .catch(() => {});
        }
      } else {
        await applyPunishment(ctx, chatId, userId, action, untilDate);
        await ctx
          .reply(
            ctx.t(`moderation.nsfw.${action}`, {
              target: userLink(ctx, target),
              duration: durationLabel,
            }),
            { parse_mode: "HTML" },
          )
          .catch(() => {});
      }
    } catch (error) {
      console.error("[NSFW] error:", error);
    } finally {
      unlink(tmpPath).catch(() => {});
    }
  });

  return composer;
}

async function applyPunishment(
  ctx: MyContext,
  chatId: number,
  userId: number,
  action: NsfwAction | "kick" | "ban" | "mute",
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
    chatMemberService
      .upsert({ chatId, userId, bannedUntil: untilDate ? new Date(untilDate * 1000) : null })
      .catch(() => {});
    return;
  }

  if (action === "mute") {
    if (isMtprotoConfigured()) {
      const result = await restrictChatMemberWithMtproto({
        chatId,
        target: { id: userId },
        untilDate,
      });
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
    chatMemberService
      .upsert({ chatId, userId, mutedUntil: untilDate ? new Date(untilDate * 1000) : null })
      .catch(() => {});
  }
}
