import { ed25519 } from "@noble/curves/ed25519.js";
import type { FastifyReply, FastifyRequest } from "fastify";

const DEFAULT_TELEGRAM_PUBLIC_KEY = "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d";

const MAX_INIT_DATA_AGE_SECONDS = 600;

interface TelegramInitData {
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  auth_date: number;
  bot_id?: number;
}

export function extractBotId(token: string): number {
  const id = token.split(":")[0];
  if (!id) throw new Error("Invalid bot token format");
  return parseInt(id);
}

function getTelegramPublicKeyBytes(): Uint8Array {
  const configured = process.env.TELEGRAM_WEBAPP_PUBLIC_KEY?.trim();

  if (!configured) {
    return Buffer.from(DEFAULT_TELEGRAM_PUBLIC_KEY, "hex");
  }

  if (/^[0-9a-fA-F]{64}$/.test(configured)) {
    return Buffer.from(configured, "hex");
  }

  try {
    return Buffer.from(configured, "base64");
  } catch {
    return Buffer.from(DEFAULT_TELEGRAM_PUBLIC_KEY, "hex");
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function validateWithEd25519(initData: string, botId: number): TelegramInitData | null {
  try {
    const params = new URLSearchParams(initData);
    const signature = params.get("signature");

    if (!signature) {
      return null;
    }

    params.delete("signature");
    params.delete("hash");

    const signatureBytes = base64UrlToBytes(signature);
    const publicKeyBytes = getTelegramPublicKeyBytes();

    const dataCheckArray: string[] = [];
    params.forEach((value, key) => {
      dataCheckArray.push(`${key}=${value}`);
    });
    dataCheckArray.sort();
    const baseLines = dataCheckArray.join("\n");

    const dataCheckString = `${botId}:WebAppData\n${baseLines}`;
    const message = Buffer.from(dataCheckString, "utf-8");

    const isValid = ed25519.verify(signatureBytes, message, publicKeyBytes);

    if (!isValid) {
      return null;
    }

    const userJson = params.get("user");
    const authDate = params.get("auth_date");

    if (!userJson || !authDate) {
      return null;
    }

    const parsedAuthDate = parseInt(authDate);
    const age = Math.floor(Date.now() / 1000) - parsedAuthDate;

    if (age > MAX_INIT_DATA_AGE_SECONDS) {
      console.warn(`InitData expired: ${age}s old`);
      return null;
    }

    return {
      user: JSON.parse(userJson),
      auth_date: parsedAuthDate,
      bot_id: botId,
    };
  } catch (error) {
    console.error("Ed25519 validation error:", error);
    return null;
  }
}

export function createAuthMiddleware(botId: number) {
  return async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const adminSecret = process.env.ADMIN_SECRET;
    if (adminSecret) {
      const requestSecret = request.headers["x-admin-secret"] as string;
      const userId = request.headers["x-user-id"] as string;
      if (requestSecret === adminSecret && userId) {
        request.telegramUser = { id: parseInt(userId), first_name: "Admin" };
        return;
      }
    }

    const initData = request.headers["x-telegram-init-data"] as string;

    if (!initData) {
      return reply.status(401).send({ error: "Missing Telegram InitData" });
    }

    const validated = validateWithEd25519(initData, botId);

    if (!validated?.user) {
      return reply.status(401).send({ error: "Invalid Telegram InitData" });
    }

    request.telegramUser = validated.user;
    request.telegramBotId = validated.bot_id;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    telegramUser?: TelegramInitData["user"];
    telegramBotId?: number;
  }
}
