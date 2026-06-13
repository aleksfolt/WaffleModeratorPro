import type { MiddlewareFn } from "grammy";
import type { User as TelegramUser } from "grammy/types";

import { chatMemberService } from "../database/services/chatMemberService.ts";
import { userService } from "../database/services/userService.ts";
import type { MyContext } from "../i18n.ts";

export const userMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  const users = getUsersFromUpdate(ctx);

  if (users.length > 0) {
    try {
      await Promise.all(
        users.map((user) =>
          userService.upsert({
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            language_code: user.language_code,
            is_premium: Boolean(user.is_premium),
          }),
        ),
      );
    } catch (error) {
      console.error("Failed to upsert Telegram user:", error);
    }
  }

  await upsertChatMembersFromMessage(ctx);

  return next();
};

function getUsersFromUpdate(ctx: MyContext): TelegramUser[] {
  const users = new Map<number, TelegramUser>();

  addUser(users, ctx.from);

  for (const user of ctx.message?.new_chat_members ?? []) {
    addUser(users, user);
  }

  addUser(users, ctx.message?.left_chat_member);

  return [...users.values()];
}

function addUser(users: Map<number, TelegramUser>, user?: TelegramUser) {
  if (!user) {
    return;
  }

  users.set(user.id, user);
}

async function upsertChatMembersFromMessage(ctx: MyContext) {
  if (!ctx.message || !ctx.chat) {
    return;
  }

  const chatId = ctx.chat.id;
  const users = getUsersFromUpdate(ctx);

  if (users.length === 0) {
    return;
  }

  try {
    await Promise.all(
      users.map((user) => {
        if (ctx.from?.id === user.id) {
          return chatMemberService.touchMessage(chatId, user.id);
        }

        return chatMemberService.upsert({
          chatId,
          userId: user.id,
          lastSeenAt: new Date(),
        });
      }),
    );
  } catch (error) {
    console.error("Failed to upsert chat member:", error);
  }
}
