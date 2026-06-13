import i18next, { type i18n, type TFunction } from "i18next";
import Backend from "i18next-fs-backend";
import { type Context, type MiddlewareFn } from "grammy";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type MyContext = Context & {
  user?: {
    language_code?: string;
  };
  t: TFunction;
};

let instance: i18n | null = null;
let globalI18n: i18n | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getI18n(): Promise<i18n> {
  if (!instance) {
    instance = i18next.createInstance();

    await instance.use(Backend).init({
      fallbackLng: "ru",
      preload: ["ru"],
      interpolation: { escapeValue: false },
      backend: {
        loadPath: path.resolve(__dirname, "../locales/{{lng}}.json"),
      },
    });
  }

  return instance;
}

export async function initGlobalI18n(): Promise<i18n> {
  if (!globalI18n) {
    globalI18n = await getI18n();
    console.log("Global i18n instance initialized");
  }

  return globalI18n;
}

export const i18nMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  if (!globalI18n) {
    throw new Error("Global i18n not initialized. Call initGlobalI18n() first.");
  }

  const userLang = ctx.user?.language_code ?? ctx.from?.language_code ?? "ru";
  ctx.t = globalI18n.getFixedT(userLang);

  return next();
};
