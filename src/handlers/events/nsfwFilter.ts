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
import type { Detection } from "../../nudenetDetector.ts";
import {
  formatDuration,
  restrictedChatPermissions,
  secondsToHumanDuration,
  userLink,
} from "../../utils/moderation.ts";
import { scanVideoForNsfw } from "../../utils/videoScan.ts";
import type { NsfwAction } from "../../database/models/chat.ts";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB — Telegram Bot API getFile limit

const ANON_ADMIN_BOT_ID = 1087968824;

export function createNsfwFilterComposer(botToken: string): Composer<MyContext> {
  const composer = new Composer<MyContext>();

  async function downloadFile(fileId: string, outPath: string): Promise<boolean> {
    const info = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const json = await info.json() as { ok: boolean; result?: { file_path?: string } };
    console.log(`[NSFW] getFile response:`, JSON.stringify(json));
    if (!json.ok || !json.result?.file_path) return false;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${json.result.file_path}`;
    const res = await fetch(fileUrl);
    console.log(`[NSFW] file fetch status=${res.status} url=${json.result.file_path}`);
    if (!res.ok) return false;
    await Bun.write(outPath, await res.arrayBuffer());
    return true;
  }

  function isNsfwGuard(ctx: MyContext): boolean {
    if (ctx.chat?.type === "private") return false;
    if (!ctx.from || ctx.from.is_bot || ctx.from.id === ANON_ADMIN_BOT_ID) return false;
    return true;
  }

  composer.on("message:photo", async (ctx, next) => {
    void next();
    if (!isNsfwGuard(ctx)) return;
    const chatId = ctx.chatId!;
    const userId = ctx.from!.id;
    const tmpPath = `/tmp/nsfw_${ctx.message.photo.at(-1)!.file_id}.jpg`;
    try {
      const chat = await chatService.get(chatId).catch(() => null);
      if (!chat?.nsfwFilter?.enabled || chat.allAdmins?.includes(userId)) return;
      const { percent, blockCovered } = chat.nsfwFilter;
      const photo = ctx.message.photo.at(-1)!;
      const file = await ctx.api.getFile(photo.file_id);
      if (!file.file_path) return;
      const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
      if (!res.ok) return;
      await Bun.write(tmpPath, await res.arrayBuffer());
      const detections = await detectNudity(tmpPath, percent / 100);
      const hit = detections.find(
        (d) => NSFW_CLASSES.has(d.className) || (blockCovered && COVERED_NSFW_CLASSES.has(d.className)),
      );
      if (!hit) return;
      await handleNsfwHit(ctx, chatId, userId, ctx.message.message_id, chat, hit);
    } catch (error) {
      console.error("[NSFW] photo error:", error);
    } finally {
      unlink(tmpPath).catch(() => {});
    }
  });

  composer.on("message:sticker", async (ctx, next) => {
    void next();
    if (!isNsfwGuard(ctx)) return;
    const sticker = ctx.message.sticker;
    if (sticker.is_animated) return; // TGS/Lottie — cannot scan
    const chatId = ctx.chatId!;
    const userId = ctx.from!.id;
    if (sticker.file_size && sticker.file_size > MAX_FILE_SIZE) return;
    const isVideo = sticker.is_video;
    const tmpPath = `/tmp/nsfw_${sticker.file_id}.${isVideo ? "webm" : "webp"}`;
    try {
      const chat = await chatService.get(chatId).catch(() => null);
      if (!chat?.nsfwFilter?.enabled || chat.allAdmins?.includes(userId)) return;
      const { percent, blockCovered } = chat.nsfwFilter;
      const ok = await downloadFile(sticker.file_id, tmpPath);
      if (!ok) return;
      if (isVideo) {
        const hit = await scanVideoForNsfw(tmpPath, percent / 100, blockCovered);
        if (!hit) return;
        await handleNsfwHit(ctx, chatId, userId, ctx.message.message_id, chat, hit);
      } else {
        const detections = await detectNudity(tmpPath, percent / 100);
        const hit = detections.find(
          (d) => NSFW_CLASSES.has(d.className) || (blockCovered && COVERED_NSFW_CLASSES.has(d.className)),
        );
        if (!hit) return;
        await handleNsfwHit(ctx, chatId, userId, ctx.message.message_id, chat, hit);
      }
    } catch (error) {
      console.error("[NSFW] sticker error:", error);
    } finally {
      unlink(tmpPath).catch(() => {});
    }
  });

  composer.on(["message:video", "message:animation", "message:video_note"], async (ctx, next) => {
    void next();
    if (!isNsfwGuard(ctx)) return;
    const chatId = ctx.chatId!;
    const userId = ctx.from!.id;
    const media = (
      "video" in ctx.message ? ctx.message.video :
      "animation" in ctx.message ? ctx.message.animation :
      ctx.message.video_note
    )!;
    if (media?.file_size && media.file_size > MAX_FILE_SIZE) return;
    const ext = "video_note" in ctx.message ? "mp4" : "video" in ctx.message ? "mp4" : "gif.mp4";
    const tmpPath = `/tmp/nsfw_${media?.file_id ?? "unknown"}.${ext}`;
    try {
      const chat = await chatService.get(chatId).catch(() => null);
      if (!chat?.nsfwFilter?.enabled || chat.allAdmins?.includes(userId)) return;
      const { percent, blockCovered } = chat.nsfwFilter;
      console.log(`[NSFW] video download start file_id=${media.file_id} size=${media.file_size ?? "?"}`);
      const ok = await downloadFile(media.file_id, tmpPath);
      console.log(`[NSFW] video download ok=${ok}`);
      if (!ok) return;
      console.log(`[NSFW] video scan start`);
      const hit = await scanVideoForNsfw(tmpPath, percent / 100, blockCovered);
      console.log(`[NSFW] video scan done hit=${hit?.className ?? "none"}`);
      if (!hit) return;
      await handleNsfwHit(ctx, chatId, userId, ctx.message.message_id, chat, hit);
    } catch (error) {
      console.error("[NSFW] video error:", error);
    } finally {
      unlink(tmpPath).catch(() => {});
    }
  });

  return composer;
}

async function handleNsfwHit(
  ctx: MyContext,
  chatId: number,
  userId: number,
  msgId: number,
  chat: Awaited<ReturnType<typeof chatService.get>>,
  best: Detection,
): Promise<void> {
  const { action, durationAction, deleteMessage } = chat!.nsfwFilter!;
  console.log(`[NSFW] chat ${chatId} user ${userId}: ${best.className} (${(best.confidence * 100).toFixed(1)}%)`);
  if (deleteMessage) ctx.api.deleteMessage(chatId, msgId).catch(() => {});
  const target = { id: userId, firstName: ctx.from!.first_name, username: ctx.from!.username };
  const untilDate = durationAction ? Math.floor(Date.now() / 1000) + durationAction : undefined;
  const durationLabel = durationAction
    ? formatDuration(ctx, secondsToHumanDuration(durationAction))
    : ctx.t("moderation.duration.forever");

  if (action === "warn") {
    const maxWarns = chat!.warn.maxWarns ?? 3;
    const expiresAt = chat!.warn.warnDuration ? new Date(Date.now() + chat!.warn.warnDuration * 1000) : null;
    const member = await chatMemberService.addWarning(chatId, userId, { moderatorId: 0, reason: "NSFW-контент", expiresAt });
    const activeWarns = member.warnings.filter((w) => w.active).length;
    if (activeWarns < maxWarns) {
      await ctx.reply(ctx.t("moderation.nsfw.warn", { target: userLink(ctx, target), count: activeWarns, max: maxWarns }), { parse_mode: "HTML" }).catch(() => {});
    } else {
      const warnAction = chat!.warn.action ?? "kick";
      const actionSeconds = warnAction !== "kick" ? (chat!.warn.actionDuration ?? null) : null;
      const warnUntil = actionSeconds ? Math.floor(Date.now() / 1000) + actionSeconds : undefined;
      const warnDurationLabel = actionSeconds ? formatDuration(ctx, secondsToHumanDuration(actionSeconds)) : ctx.t("moderation.duration.forever");
      await applyPunishment(ctx, chatId, userId, warnAction, warnUntil);
      chatMemberService.resetWarnings(chatId, userId).catch(() => {});
      await ctx.reply(ctx.t(`moderation.warn.limit_${warnAction}`, { target: userLink(ctx, target), count: activeWarns, max: maxWarns, reason: "NSFW-контент", duration: warnDurationLabel }), { parse_mode: "HTML" }).catch(() => {});
    }
  } else {
    await applyPunishment(ctx, chatId, userId, action, untilDate);
    await ctx.reply(ctx.t(`moderation.nsfw.${action}`, { target: userLink(ctx, target), duration: durationLabel }), { parse_mode: "HTML" }).catch(() => {});
  }
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
