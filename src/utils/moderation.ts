import { GrammyError, type Filter } from "grammy";
import type { ChatPermissions } from "grammy/types";

import type { MyContext } from "../i18n.ts";
import { getUsername, type MtprotoModerationResult } from "../mtproto.ts";

export type TextMessageContext = Filter<MyContext, "message:text">;

export type ParsedCommand = {
  name: string;
  botUsername?: string;
  args: string[];
};

export type ParsedDuration = {
  value: number;
  unit: "seconds" | "minutes" | "hours" | "days" | "weeks";
  seconds: number;
};

export type TargetUser = {
  id: number;
  firstName: string;
  username?: string;
};

export type TargetResult =
  | {
      ok: true;
      target: TargetUser;
      targetArgIndex?: number;
    }
  | {
      ok: false;
      error: string;
    };

export const restrictedChatPermissions: ChatPermissions = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_react_to_messages: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
  can_manage_topics: false,
};

export const unrestrictedChatPermissions: ChatPermissions = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_react_to_messages: true,
  can_change_info: true,
  can_invite_users: true,
  can_pin_messages: true,
  can_manage_topics: true,
};

export function parseCommand(text: string): ParsedCommand | null {
  const match = text.match(/^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]+))?$/i);

  if (!match || !match[1]) {
    return null;
  }

  return {
    name: match[1].toLowerCase(),
    botUsername: match[2]?.toLowerCase(),
    args: match[3]?.trim().split(/\s+/).filter(Boolean) ?? [],
  };
}

export function isCommand(ctx: TextMessageContext, name: string): boolean {
  const parsed = parseCommand(ctx.message.text);

  if (!parsed || parsed.name !== name) {
    return false;
  }

  return !parsed.botUsername || parsed.botUsername === ctx.me.username.toLowerCase();
}

export async function getTargetUser(ctx: TextMessageContext, args: string[]): Promise<TargetResult> {
  const repliedUser = ctx.message.reply_to_message?.from;

  if (repliedUser) {
    return {
      ok: true,
      target: {
        id: repliedUser.id,
        firstName: repliedUser.first_name || ctx.t("moderation.user_fallback"),
      },
    };
  }

  const targetArgIndex = args.findIndex(isTargetArg);

  if (targetArgIndex === -1) {
    return { ok: false, error: "moderation.errors.user_required" };
  }

  const targetArg = args[targetArgIndex];

  if (!targetArg) {
    return { ok: false, error: "moderation.errors.user_required" };
  }

  if (targetArg.startsWith("@")) {
    const result = await getUsername(targetArg);

    if (!result.ok) {
      return { ok: false, error: `moderation.errors.${result.error}` };
    }

    return {
      ok: true,
      target: {
        id: result.user.id,
        firstName: result.user.firstName,
        username: result.user.username,
      },
      targetArgIndex,
    };
  }

  const userId = Number(targetArg);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { ok: false, error: "moderation.errors.user_required" };
  }

  return {
    ok: true,
    target: {
      id: userId,
      firstName: ctx.t("moderation.user_fallback"),
    },
    targetArgIndex,
  };
}

export function getDuration(
  args: string[],
  targetArgIndex?: number,
): (ParsedDuration & { argIndex: number }) | null {
  for (const [index, arg] of args.entries()) {
    if (index === targetArgIndex) {
      continue;
    }

    const duration = parseDuration(arg);

    if (duration) {
      return { ...duration, argIndex: index };
    }
  }

  return null;
}

export function parseDuration(value: string): ParsedDuration | null {
  const match = value.match(
    /^(\d+)(s|sec|сек|с|m|min|мин|h|hour|hours|ч|час|d|day|days|д|w|week|weeks|н|нед)$/iu,
  );

  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2].toLowerCase();

  if (["s", "sec", "сек", "с"].includes(unit)) {
    return { value: amount, unit: "seconds", seconds: amount };
  }

  if (["m", "min", "мин"].includes(unit)) {
    return { value: amount, unit: "minutes", seconds: amount * 60 };
  }

  if (["h", "hour", "hours", "ч", "час"].includes(unit)) {
    return { value: amount, unit: "hours", seconds: amount * 60 * 60 };
  }

  if (["d", "day", "days", "д"].includes(unit)) {
    return { value: amount, unit: "days", seconds: amount * 24 * 60 * 60 };
  }

  return { value: amount, unit: "weeks", seconds: amount * 7 * 24 * 60 * 60 };
}

export function getReason(
  ctx: TextMessageContext,
  args: string[],
  targetArgIndex?: number,
  durationArgIndex?: number,
): string {
  const reason = args
    .filter((_, index) => index !== targetArgIndex && index !== durationArgIndex)
    .join(" ")
    .trim();

  return reason ? escapeHtml(reason) : ctx.t("moderation.reason_fallback");
}

export function formatDuration(ctx: MyContext, duration: ParsedDuration | null): string {
  if (!duration) {
    return ctx.t("moderation.duration.forever");
  }

  return ctx.t(`moderation.duration.${duration.unit}`, { count: duration.value });
}

export function getUntilDate(duration: ParsedDuration | null): number | undefined {
  return duration ? Math.floor(Date.now() / 1000) + duration.seconds : undefined;
}

export function userLink(ctx: MyContext, user: TargetUser): string {
  const firstName = user.firstName || ctx.t("moderation.user_fallback");
  return `<a href="tg://user?id=${user.id}">${escapeHtml(firstName)}</a>`;
}

export function getRegexNumberGroup(match: unknown, groupIndex = 1): number | null {
  const value = Array.isArray(match) ? match[groupIndex] : undefined;
  const number = value ? Number(value) : NaN;

  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export async function liftChatRestrictions(ctx: MyContext, chatId: number, userId: number) {
  await ctx.api.restrictChatMember(chatId, userId, unrestrictedChatPermissions, {
    use_independent_chat_permissions: false,
  });
}

export async function replyModerationError(ctx: MyContext, error: unknown) {
  const key = getModerationErrorKey(error);

  await ctx.reply(
    ctx.t(key ?? "moderation.errors.generic", {
      error: escapeHtml(errorMessage(error)),
    }),
    { parse_mode: "HTML" },
  );
}

export async function replyMtprotoModerationError(
  ctx: MyContext,
  result: Exclude<MtprotoModerationResult, { ok: true }>,
) {
  await ctx.reply(
    ctx.t(`moderation.errors.${result.error}`, {
      error: escapeHtml(result.details ?? ""),
    }),
    { parse_mode: "HTML" },
  );
}

export function getModerationErrorKey(error: unknown): string | null {
  if (!(error instanceof GrammyError)) {
    return null;
  }

  const description = error.description.toLowerCase();

  if (description.includes("user is an administrator of the chat")) {
    return "moderation.errors.target_admin";
  }

  if (description.includes("participant_id_invalid")) {
    return "moderation.errors.participant_id_invalid";
  }

  return null;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTargetArg(arg: string): boolean {
  return /^@\w{1,32}$/i.test(arg) || /^\d+$/.test(arg);
}
