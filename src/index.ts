import { run } from "@grammyjs/runner";
import { Bot } from "grammy";

import { loadConfig } from "./config.ts";
import { connectDatabase, disconnectDatabase } from "./database/index.ts";
import { banComposer } from "./handlers/commands/ban.ts";
import { muteComposer } from "./handlers/commands/mute.ts";
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
    await ctx.reply(ctx.t("commands.start"));
  });

  bot.use(muteComposer);
  bot.use(banComposer);

  bot.catch((error) => {
    console.error("Bot error:", error.error);
  });

  await bot.init();
  console.log(`Bot @${bot.botInfo.username} started`);

  const runner = run(bot);

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
