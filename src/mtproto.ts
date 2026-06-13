import { TelegramClient } from "@mtcute/bun";

import type { Config } from "./config.ts";

export type ResolvedUsername = {
  id: number;
  firstName: string;
  username: string;
};

export type GetUsernameResult =
  | {
      ok: true;
      user: ResolvedUsername;
    }
  | {
      ok: false;
      error: "mtproto_not_configured" | "username_resolve_failed";
    };

export type MtprotoModerationTarget = {
  id: number;
  username?: string;
};

export type MtprotoModerationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error:
        | "mtproto_not_configured"
        | "participant_id_invalid"
        | "target_admin"
        | "mtproto_action_failed";
      details?: string;
    };

let botToken: string | null = null;
let mtprotoConfig: Config["mtproto"] | undefined;
let client: TelegramClient | null = null;
let clientPromise: Promise<TelegramClient> | null = null;

export function configureMtproto(config: Config) {
  botToken = config.bot.token;
  mtprotoConfig = config.mtproto;
}

export function isMtprotoConfigured(): boolean {
  return Boolean(mtprotoConfig && botToken);
}

export async function getUsername(username: string): Promise<GetUsernameResult> {
  if (!mtprotoConfig || !botToken) {
    return { ok: false, error: "mtproto_not_configured" };
  }

  const normalizedUsername = username.replace(/^@/, "");

  try {
    const tg = await getMtprotoClient();
    const inputUser = await tg.resolveUser(normalizedUsername, true);
    const [user] = await tg.getUsers(inputUser);

    if (!user) {
      return { ok: false, error: "username_resolve_failed" };
    }

    return {
      ok: true,
      user: {
        id: user.id,
        firstName: user.firstName || user.displayName || normalizedUsername,
        username: user.username ?? normalizedUsername,
      },
    };
  } catch (error) {
    console.error("MTProto username resolve failed:", username, error);
    return { ok: false, error: "username_resolve_failed" };
  }
}

export async function banChatMemberWithMtproto(params: {
  chatId: number;
  target: MtprotoModerationTarget;
  untilDate?: number;
}): Promise<MtprotoModerationResult> {
  if (!mtprotoConfig || !botToken) {
    return { ok: false, error: "mtproto_not_configured" };
  }

  try {
    const tg = await getMtprotoClient();

    await tg.banChatMember({
      chatId: params.chatId,
      participantId: getParticipantPeer(params.target),
      untilDate: getMtprotoDate(params.untilDate),
    });

    return { ok: true };
  } catch (error) {
    console.error("MTProto ban failed:", params.target, error);
    return {
      ok: false,
      error: getModerationError(error),
      details: getErrorMessage(error),
    };
  }
}

export async function restrictChatMemberWithMtproto(params: {
  chatId: number;
  target: MtprotoModerationTarget;
  untilDate?: number;
}): Promise<MtprotoModerationResult> {
  if (!mtprotoConfig || !botToken) {
    return { ok: false, error: "mtproto_not_configured" };
  }

  try {
    const tg = await getMtprotoClient();

    await tg.restrictChatMember({
      chatId: params.chatId,
      userId: getParticipantPeer(params.target),
      restrictions: mutedRights,
      until: getMtprotoDate(params.untilDate),
    });

    return { ok: true };
  } catch (error) {
    console.error("MTProto restrict failed:", params.target, error);
    return {
      ok: false,
      error: getModerationError(error),
      details: getErrorMessage(error),
    };
  }
}

async function getMtprotoClient(): Promise<TelegramClient> {
  if (client) {
    return client;
  }

  if (!clientPromise) {
    clientPromise = startMtprotoClient();
  }

  client = await clientPromise;
  return client;
}

async function startMtprotoClient(): Promise<TelegramClient> {
  if (!mtprotoConfig || !botToken) {
    throw new Error("MTProto is not configured");
  }

  const tg = new TelegramClient({
    apiId: mtprotoConfig.apiId,
    apiHash: mtprotoConfig.apiHash,
    storage: mtprotoConfig.session,
    disableUpdates: true,
  });

  const self = await tg.start({ botToken });
  console.log(`MTProto @${self.username ?? self.displayName} started`);

  return tg;
}

function getParticipantPeer(target: MtprotoModerationTarget): string | number {
  return target.username ? target.username : target.id;
}

function getMtprotoDate(unixSeconds?: number): Date | undefined {
  return unixSeconds ? new Date(unixSeconds * 1000) : undefined;
}

function getModerationError(
  error: unknown,
): Exclude<MtprotoModerationResult, { ok: true }>["error"] {
  if (isTargetAdminError(error)) {
    return "target_admin";
  }

  if (isPeerNotFoundError(error)) {
    return "participant_id_invalid";
  }

  return "mtproto_action_failed";
}

function isTargetAdminError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return message.includes("user_admin_invalid") || message.includes("user is an administrator");
}

function isPeerNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    (message.includes("peer") && message.includes("not found")) ||
    message.includes("participant_id_invalid")
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const mutedRights = {
  sendMessages: true,
  sendMedia: true,
  sendStickers: true,
  sendGifs: true,
  sendGames: true,
  sendInline: true,
  embedLinks: true,
  sendPolls: true,
  changeInfo: true,
  inviteUsers: true,
  pinMessages: true,
  manageTopics: true,
  sendPhotos: true,
  sendVideos: true,
  sendRoundvideos: true,
  sendAudios: true,
  sendVoices: true,
  sendDocs: true,
  sendPlain: true,
  sendReactions: true,
};
