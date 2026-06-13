import { Composer } from "grammy";

import { hasPromoteRights } from "../../middlewares/index.ts";
import type { MyContext } from "../../i18n.ts";
import {
  banChatMemberWithMtproto,
  isMtprotoConfigured,
  type MtprotoModerationResult,
} from "../../mtproto.ts";
import {
  getReason,
  getTargetUser,
  parseCommand,
  replyMtprotoModerationError,
  replyModerationError,
  type TargetUser,
  userLink,
} from "../../utils/moderation.ts";

export const kickComposer = new Composer<MyContext>();
kickComposer.use(hasPromoteRights);

kickComposer.command("kick", async (ctx) => {
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

    const kickResult = await kickTarget(ctx, ctx.chatId, target);

    if (!kickResult.ok) {
      await replyMtprotoModerationError(ctx, kickResult);
      return;
    }

    // Сразу снимаем бан — это и есть кик
    await ctx.api.unbanChatMember(ctx.chatId, target.id, { only_if_banned: true });

    await ctx.reply(
      ctx.t("moderation.kick.success", {
        target: userLink(ctx, target),
        reason,
      }),
      { parse_mode: "HTML" },
    );
  } catch (error) {
    await replyModerationError(ctx, error);
  }
});

async function kickTarget(
  ctx: MyContext,
  chatId: number,
  target: TargetUser,
): Promise<MtprotoModerationResult> {
  if (isMtprotoConfigured()) {
    const result = await banChatMemberWithMtproto({ chatId, target });

    if (result.ok || target.username) {
      return result;
    }
  }

  await ctx.api.banChatMember(chatId, target.id);

  return { ok: true };
}
