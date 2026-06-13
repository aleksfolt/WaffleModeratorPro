import {
  ChatMember,
  buildChatMemberId,
  type IChatMember,
  type IChatMemberWarning,
} from "../models/chatMember.ts";

export type ChatMemberWarningData = Pick<IChatMemberWarning, "moderatorId" | "reason"> &
  Partial<Pick<IChatMemberWarning, "id" | "active" | "createdAt" | "expiresAt">>;

export type ChatMemberCreateData = {
  chatId: number;
  userId: number;
  warnsCount?: number;
  warnings?: ChatMemberWarningData[];
  mutedUntil?: Date | null;
  bannedUntil?: Date | null;
  lastSeenAt?: Date;
  messagesCount?: number;
};

export type ChatMemberUpdateData = Partial<Omit<ChatMemberCreateData, "chatId" | "userId">>;

export type ChatMemberUpsertData = {
  chatId: number;
  userId: number;
} & ChatMemberUpdateData;

export class ChatMemberService {
  async create(data: ChatMemberCreateData): Promise<IChatMember> {
    return ChatMember.create({
      _id: buildChatMemberId(data.chatId, data.userId),
      ...this.normalizeChatMemberData(data),
    });
  }

  async get(chatId: number, userId: number): Promise<IChatMember | null> {
    return ChatMember.findById(buildChatMemberId(chatId, userId));
  }

  async getByChat(chatId: number): Promise<IChatMember[]> {
    return ChatMember.find({ chatId });
  }

  async getByUser(userId: number): Promise<IChatMember[]> {
    return ChatMember.find({ userId });
  }

  async update(
    chatId: number,
    userId: number,
    data: ChatMemberUpdateData,
  ): Promise<IChatMember | null> {
    return ChatMember.findByIdAndUpdate(
      buildChatMemberId(chatId, userId),
      { $set: this.normalizeChatMemberData(data) },
      { returnDocument: "after", runValidators: true },
    );
  }

  async upsert(data: ChatMemberUpsertData): Promise<IChatMember> {
    const updateData = this.normalizeChatMemberUpdateData(data);

    return ChatMember.findByIdAndUpdate(
      buildChatMemberId(data.chatId, data.userId),
      {
        ...(Object.keys(updateData).length > 0 ? { $set: updateData } : {}),
        $setOnInsert: {
          _id: buildChatMemberId(data.chatId, data.userId),
          chatId: data.chatId,
          userId: data.userId,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).orFail();
  }

  async delete(chatId: number, userId: number): Promise<boolean> {
    const result = await ChatMember.deleteOne({
      _id: buildChatMemberId(chatId, userId),
    });

    return result.deletedCount === 1;
  }

  async exists(chatId: number, userId: number): Promise<boolean> {
    const chatMember = await ChatMember.exists({
      _id: buildChatMemberId(chatId, userId),
    });

    return Boolean(chatMember);
  }

  async touchMessage(chatId: number, userId: number): Promise<IChatMember> {
    return ChatMember.findByIdAndUpdate(
      buildChatMemberId(chatId, userId),
      {
        $set: {
          lastSeenAt: new Date(),
        },
        $inc: {
          messagesCount: 1,
        },
        $setOnInsert: {
          _id: buildChatMemberId(chatId, userId),
          chatId,
          userId,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).orFail();
  }

  private normalizeChatMemberData<T extends Partial<ChatMemberCreateData>>(data: T): T {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        continue;
      }

      normalized[key] = value;
    }

    return normalized as T;
  }

  private normalizeChatMemberUpdateData<T extends Partial<ChatMemberCreateData>>(
    data: T,
  ): Partial<ChatMemberCreateData> {
    const normalized = this.normalizeChatMemberData(data);

    delete normalized.chatId;
    delete normalized.userId;

    return normalized;
  }
}

export const chatMemberService = new ChatMemberService();
