import { Composer } from "grammy";

import type { MyContext } from "../../i18n.ts";

export const pingComposer = new Composer<MyContext>();

pingComposer.command("ping", async (ctx) => {
  const start = Date.now();
  const msg = await ctx.reply("🏓");
  const latency = Date.now() - start;
  await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, `🏓 Pong! ${latency}ms`);
});
