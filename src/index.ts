import { run } from "@grammyjs/runner";
import { Bot, InlineKeyboard } from "grammy";

import { loadConfig } from "./config.ts";
import { connectDatabase, disconnectDatabase } from "./database/index.ts";
import { banComposer } from "./handlers/commands/ban.ts";
import { pingComposer } from "./handlers/commands/ping.ts";
import { rulesComposer } from "./handlers/commands/rules.ts";
import { callAdminComposer } from "./handlers/commands/callAdmin.ts";
import { kickComposer } from "./handlers/commands/kick.ts";
import { muteComposer } from "./handlers/commands/mute.ts";
import { warnComposer } from "./handlers/commands/warn.ts";
import { antiFloodComposer } from "./handlers/events/antiFlood.ts";
import { createNsfwFilterComposer } from "./handlers/events/nsfwFilter.ts";
import { chatMemberComposer } from "./handlers/events/chatMember.ts";
import { migrateComposer } from "./handlers/events/migrate.ts";
import { myChatMemberComposer } from "./handlers/events/myChatMember.ts";
import { i18nMiddleware, initGlobalI18n, type MyContext } from "./i18n.ts";
import { userMiddleware } from "./middlewares/index.ts";
import { configureMtproto } from "./mtproto.ts";

async function main() {
  const config = await loadConfig();
  await connectDatabase(config.database);
  configureMtproto(config);

  const bot = new Bot<MyContext>(config.bot.token);

  await initGlobalI18n();
  bot.use(i18nMiddleware);
  bot.use(userMiddleware);

  bot.command("start", async (ctx) => {
    const keyboard = config.bot.webappUrl
      ? new InlineKeyboard().webApp(ctx.t("commands.open_webapp"), config.bot.webappUrl)
      : undefined;

    await ctx.reply(ctx.t("commands.start"), { reply_markup: keyboard });
  });

  bot.use(pingComposer);
  bot.use(rulesComposer);
  bot.use(createNsfwFilterComposer(config.bot.token));
  bot.use(antiFloodComposer);
  bot.use(muteComposer);
  bot.use(banComposer);
  bot.use(kickComposer);
  bot.use(warnComposer);
  bot.use(callAdminComposer);
  bot.use(myChatMemberComposer);
  bot.use(chatMemberComposer);
  bot.use(migrateComposer);

  bot.catch((error) => {
    console.error("Bot error:", error.error);
  });

  await bot.init();
  console.log(`Bot @${bot.botInfo.username} started`);

  const runner = run(bot, {
    runner: {
      fetch: {
        allowed_updates: ["message", "callback_query", "my_chat_member", "chat_member"],
      },
    },
  });

  const stopRunner = async () => {
    if (runner.isRunning()) {
      await runner.stop();
    }

    await disconnectDatabase();
  };

  process.once("SIGINT", async () => {
    await stopRunner();
    console.log("Bot stopped");
  });

  process.once("SIGTERM", async () => {
    await stopRunner();
    console.log("Bot stopped");
  });

  await runner.task();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
