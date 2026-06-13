import { Composer } from "grammy";
import type { ChatMemberAdministrator } from "grammy/types";

import { chatService } from "../../database/services/chatService.ts";
import type { MyContext } from "../../i18n.ts";

export const myChatMemberComposer = new Composer<MyContext>();

myChatMemberComposer.on("my_chat_member", async (ctx) => {
  const { new_chat_member } = ctx.myChatMember;
  const newStatus = new_chat_member.status;
  const chatId = ctx.chat.id;

  if (newStatus === "kicked" || newStatus === "left") {
    const savedChat = await chatService.get(chatId).catch(() => null);

    chatService
      .setWork(chatId, false)
      .catch((error) => console.error("Failed to update chat work status:", error));

    for (const adminId of savedChat?.admins ?? []) {
      await ctx.api.sendMessage(adminId, ctx.t("chat.bot_unlinked"), { parse_mode: "HTML" }).catch(() => {});
    }
  } else if (newStatus === "member") {
    await ctx.reply(ctx.t("chat.bot_added_as_member"), { parse_mode: "HTML" });
  } else if (newStatus === "administrator") {
    const [chatInfo, membersCount, rawAdmins] = await Promise.all([
      ctx.api.getChat(chatId),
      ctx.api.getChatMemberCount(chatId),
      ctx.api.getChatAdministrators(chatId),
    ]);

    const admins = rawAdmins
      .filter((a) => a.status === "creator" || (a.status === "administrator" && hasFullRights(a)))
      .map((a) => a.user.id);

    const allAdmins = rawAdmins.map((a) => a.user.id);
    const title = "title" in chatInfo ? chatInfo.title : "";

    await chatService
      .upsert({ chatId, title, membersCount, work: true, admins, allAdmins })
      .catch((error) => console.error("Failed to save chat info:", error));

    await ctx.reply(ctx.t("chat.bot_promoted"), { parse_mode: "HTML" });
  }
});

function hasFullRights(admin: ChatMemberAdministrator): boolean {
  return Boolean(
    admin.can_manage_chat &&
      admin.can_delete_messages &&
      admin.can_manage_video_chats &&
      admin.can_restrict_members &&
      admin.can_promote_members &&
      admin.can_change_info &&
      admin.can_invite_users &&
      admin.can_pin_messages,
  );
}