import path from "node:path";
import { fileURLToPath } from "node:url";

import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { loadConfig } from "../config.ts";
import { connectDatabase } from "../database/index.ts";
import { chatService } from "../database/services/chatService.ts";
import type { IAnonAdminSettings, IAntiFloodSettings, ICallAdminSettings, INsfwFilterSettings, IRulesSettings, IWarnSettings, IWelcomeSettings, IWelcomeButton } from "../database/models/chat.ts";
import { createAuthMiddleware, extractBotId } from "./middleware/auth.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

const WARN_ACTIONS = ["kick", "ban", "mute"] as const;

function isValidWarnSettings(body: unknown): body is IWarnSettings {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (!Number.isInteger(b.maxWarns) || (b.maxWarns as number) < 1 || (b.maxWarns as number) > 10) return false;
  if (!WARN_ACTIONS.includes(b.action as never)) return false;
  if (b.actionDuration !== null && (!Number.isInteger(b.actionDuration) || (b.actionDuration as number) <= 0)) return false;
  if (b.warnDuration !== null && (!Number.isInteger(b.warnDuration) || (b.warnDuration as number) <= 0)) return false;
  return true;
}

function isValidWelcomeSettings(body: unknown): body is IWelcomeSettings {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.enabled !== "boolean") return false;
  if (typeof b.onlyFirst !== "boolean") return false;
  if (b.message !== null && typeof b.message !== "string") return false;
  if (!Array.isArray(b.buttons)) return false;
  if (b.buttons.length > 8) return false;
  for (const row of b.buttons) {
    if (!Array.isArray(row) || row.length === 0 || row.length > 2) return false;
    for (const btn of row) {
      if (!btn || typeof btn !== "object") return false;
      const { text, url, style } = btn as Record<string, unknown>;
      if (typeof text !== "string" || text.trim().length === 0 || text.length > 64) return false;
      if (typeof url !== "string" || !url.startsWith("http")) return false;
      if (style !== undefined && !["primary", "success", "danger"].includes(style as string)) return false;
    }
  }
  return true;
}

function isValidCallAdminSettings(body: unknown): body is ICallAdminSettings {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.enabled !== "boolean") return false;
  if (b.target !== "admins" && b.target !== "allAdmins") return false;
  return true;
}

const ANTI_FLOOD_ACTIONS = ["warn", "mute", "kick", "ban"] as const;

function isValidAntiFloodSettings(body: unknown): body is IAntiFloodSettings {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.enabled !== "boolean") return false;
  if (!Number.isInteger(b.messages) || (b.messages as number) < 3 || (b.messages as number) > 30) return false;
  if (!Number.isInteger(b.time) || (b.time as number) < 5 || (b.time as number) > 120) return false;
  if (!ANTI_FLOOD_ACTIONS.includes(b.action as never)) return false;
  if (b.durationAction !== null && (!Number.isInteger(b.durationAction) || (b.durationAction as number) <= 0)) return false;
  if (typeof b.deleteMessages !== "boolean") return false;
  return true;
}

function isValidAnonAdminSettings(body: unknown): body is IAnonAdminSettings {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.blockEnabled !== "boolean") return false;
  return true;
}

async function main() {
  const config = await loadConfig();
  await connectDatabase(config.database);
  const botId = extractBotId(config.bot.token);
  const authMiddleware = createAuthMiddleware(botId);

  const app = Fastify({ logger: true });

  await app.register(fastifyCors, {
    origin: process.env.NODE_ENV === "production" ? false : true,
  });

  await app.register(fastifyStatic, {
    root: frontendDist,
    prefix: "/",
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/me", { preHandler: authMiddleware }, async (request) => {
    return { ok: true, user: request.telegramUser };
  });

  app.get("/api/chats", { preHandler: authMiddleware }, async (request) => {
    const userId = request.telegramUser!.id;
    const chats = await chatService.getChatsForUser(userId);
    return chats.map((c) => ({ chatId: c.chatId, title: c.title }));
  });

  // ── warn ──────────────────────────────────────────────────────────────────

  app.get("/api/chats/:chatId/warn", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    return chat.warn;
  });

  app.patch("/api/chats/:chatId/warn", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    const body = request.body;
    if (!isValidWarnSettings(body)) return reply.status(400).send({ error: "Invalid settings" });
    if (body.action === "kick") body.actionDuration = null;
    await chatService.updateWarnSettings(chatId, body);
    return { ok: true };
  });

  // ── welcome ───────────────────────────────────────────────────────────────

  app.get("/api/chats/:chatId/welcome", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    return chat.welcome;
  });

  app.patch("/api/chats/:chatId/welcome", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    const body = request.body;
    if (!isValidWelcomeSettings(body)) return reply.status(400).send({ error: "Invalid settings" });
    const settings: IWelcomeSettings = {
      enabled: body.enabled,
      onlyFirst: body.onlyFirst,
      message: typeof body.message === "string" ? body.message.slice(0, 1000) : null,
      buttons: body.buttons,
    };
    await chatService.updateWelcomeSettings(chatId, settings);
    return { ok: true };
  });

  // ── call-admin ────────────────────────────────────────────────────────────

  app.get("/api/chats/:chatId/call-admin", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    return chat.callAdmin;
  });

  app.patch("/api/chats/:chatId/call-admin", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    const body = request.body;
    if (!isValidCallAdminSettings(body)) return reply.status(400).send({ error: "Invalid settings" });
    await chatService.updateCallAdminSettings(chatId, body);
    return { ok: true };
  });

  // ── anti-flood ────────────────────────────────────────────────────────────

  app.get("/api/chats/:chatId/anti-flood", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    return chat.antiFlood ?? { enabled: false, messages: 5, time: 10, action: "warn", durationAction: null, deleteMessages: false };
  });

  app.patch("/api/chats/:chatId/anti-flood", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    const body = request.body;
    if (!isValidAntiFloodSettings(body)) return reply.status(400).send({ error: "Invalid settings" });
    await chatService.updateAntiFloodSettings(chatId, body);
    return { ok: true };
  });

  // ── anon-admin ────────────────────────────────────────────────────────────

  app.get("/api/chats/:chatId/anon-admin", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    return chat.anonAdmin ?? { blockEnabled: false };
  });

  app.patch("/api/chats/:chatId/anon-admin", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    const body = request.body;
    if (!isValidAnonAdminSettings(body)) return reply.status(400).send({ error: "Invalid settings" });
    await chatService.updateAnonAdminSettings(chatId, body);
    return { ok: true };
  });

  // ── nsfw-filter ───────────────────────────────────────────────────────────

  const NSFW_ACTIONS = ["warn", "mute", "kick", "ban"] as const;

  function isValidNsfwFilterSettings(body: unknown): body is INsfwFilterSettings {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;
    if (typeof b.enabled !== "boolean") return false;
    if (!Number.isInteger(b.percent) || (b.percent as number) < 0 || (b.percent as number) > 100) return false;
    if (typeof b.blockCovered !== "boolean") return false;
    if (!NSFW_ACTIONS.includes(b.action as never)) return false;
    if (b.durationAction !== null && (!Number.isInteger(b.durationAction) || (b.durationAction as number) <= 0)) return false;
    if (typeof b.deleteMessage !== "boolean") return false;
    return true;
  }

  app.get("/api/chats/:chatId/nsfw-filter", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    return chat.nsfwFilter ?? { enabled: false, percent: 60, blockCovered: false, action: "kick", durationAction: null, deleteMessage: true };
  });

  app.patch("/api/chats/:chatId/nsfw-filter", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    const body = request.body;
    if (!isValidNsfwFilterSettings(body)) return reply.status(400).send({ error: "Invalid settings" });
    await chatService.updateNsfwFilterSettings(chatId, body);
    return { ok: true };
  });

  // ── rules ─────────────────────────────────────────────────────────────────

  const RULES_PERMISSIONS = ["noone", "members", "private", "admins"] as const;

  function isValidRulesSettings(body: unknown): body is IRulesSettings {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;
    if (typeof b.enabled !== "boolean") return false;
    if (typeof b.text !== "string" || b.text.length === 0 || b.text.length > 4000) return false;
    if (!RULES_PERMISSIONS.includes(b.permissions as never)) return false;
    if (!Array.isArray(b.buttons)) return false;
    if ((b.buttons as unknown[]).length > 8) return false;
    for (const row of b.buttons as unknown[]) {
      if (!Array.isArray(row) || (row as unknown[]).length === 0 || (row as unknown[]).length > 2) return false;
      for (const btn of row as unknown[]) {
        if (!btn || typeof btn !== "object") return false;
        const { text, url } = btn as Record<string, unknown>;
        if (typeof text !== "string" || text.trim().length === 0 || text.length > 64) return false;
        if (typeof url !== "string" || !url.startsWith("http")) return false;
      }
    }
    return true;
  }

  app.get("/api/chats/:chatId/rules", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    return chat.rules ?? { enabled: false, text: "Правила группы не установлены.", buttons: [], permissions: "members" };
  });

  app.patch("/api/chats/:chatId/rules", { preHandler: authMiddleware }, async (request, reply) => {
    const chatId = Number((request.params as { chatId: string }).chatId);
    const userId = request.telegramUser!.id;
    const chat = await chatService.get(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    if (!chat.allAdmins.includes(userId)) return reply.status(403).send({ error: "Not an admin" });
    const body = request.body;
    if (!isValidRulesSettings(body)) return reply.status(400).send({ error: "Invalid settings" });
    const settings: IRulesSettings = {
      enabled: body.enabled,
      text: body.text.slice(0, 4000),
      buttons: (body.buttons as IWelcomeButton[][]),
      permissions: body.permissions,
    };
    await chatService.updateRulesSettings(chatId, settings);
    return { ok: true };
  });

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  const port = parseInt(process.env.WEBAPP_PORT ?? "3002");

  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Webapp running on http://localhost:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
