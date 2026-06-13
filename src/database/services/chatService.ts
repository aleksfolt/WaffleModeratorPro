import {
  Chat,
  type IAnonAdminSettings,
  type IAntiFloodSettings,
  type INsfwFilterSettings,
  type ICallAdminSettings,
  type IChat,
  type IRulesSettings,
  type IWarnSettings,
  type IWelcomeSettings,
} from "../models/chat.ts";

export type { IWarnSettings as WarnSettings, IWelcomeSettings as WelcomeSettings, ICallAdminSettings as CallAdminSettings, IAnonAdminSettings as AnonAdminSettings, IAntiFloodSettings as AntiFloodSettings };

export type ChatUpsertData = {
  chatId: number;
  title?: string;
  membersCount?: number;
  admins?: number[];
  allAdmins?: number[];
  work?: boolean;
};

export class ChatService {
  async get(chatId: number): Promise<IChat | null> {
    return Chat.findOne({ chatId });
  }

  async upsert(data: ChatUpsertData): Promise<IChat> {
    const { chatId, ...rest } = data;
    const update: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) update[key] = value;
    }

    return Chat.findOneAndUpdate(
      { chatId },
      { $set: update },
      { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).orFail();
  }

  async migrateChat(oldChatId: number, newChatId: number): Promise<void> {
    await Chat.updateOne({ chatId: oldChatId }, { $set: { chatId: newChatId } });
  }

  async setWork(chatId: number, work: boolean): Promise<void> {
    await Chat.updateOne({ chatId }, { $set: { work } }, { upsert: false });
  }

  async addAdmin(chatId: number, userId: number): Promise<void> {
    await Chat.updateOne({ chatId }, { $addToSet: { allAdmins: userId } });
  }

  async removeAdmin(chatId: number, userId: number): Promise<void> {
    await Chat.updateOne({ chatId }, { $pull: { allAdmins: userId } });
  }

  async getChatsForUser(userId: number): Promise<IChat[]> {
    return Chat.find({ allAdmins: userId });
  }

  async updateWarnSettings(chatId: number, settings: IWarnSettings): Promise<IChat | null> {
    return Chat.findOneAndUpdate(
      { chatId },
      { $set: { warn: settings } },
      { returnDocument: "after", runValidators: true },
    );
  }

  async updateWelcomeSettings(chatId: number, settings: IWelcomeSettings): Promise<IChat | null> {
    return Chat.findOneAndUpdate(
      { chatId },
      { $set: { welcome: settings } },
      { returnDocument: "after", runValidators: true },
    );
  }

  async updateCallAdminSettings(chatId: number, settings: ICallAdminSettings): Promise<IChat | null> {
    return Chat.findOneAndUpdate(
      { chatId },
      { $set: { callAdmin: settings } },
      { returnDocument: "after", runValidators: true },
    );
  }

  async updateAnonAdminSettings(chatId: number, settings: IAnonAdminSettings): Promise<IChat | null> {
    return Chat.findOneAndUpdate(
      { chatId },
      { $set: { anonAdmin: settings } },
      { returnDocument: "after", runValidators: true },
    );
  }

  async updateAntiFloodSettings(chatId: number, settings: IAntiFloodSettings): Promise<IChat | null> {
    return Chat.findOneAndUpdate(
      { chatId },
      { $set: { antiFlood: settings } },
      { returnDocument: "after", runValidators: true },
    );
  }

  async updateNsfwFilterSettings(chatId: number, settings: INsfwFilterSettings): Promise<IChat | null> {
    return Chat.findOneAndUpdate(
      { chatId },
      { $set: { nsfwFilter: settings } },
      { returnDocument: "after", runValidators: true },
    );
  }

  async updateRulesSettings(chatId: number, settings: IRulesSettings): Promise<IChat | null> {
    return Chat.findOneAndUpdate(
      { chatId },
      { $set: { rules: settings } },
      { returnDocument: "after", runValidators: true },
    );
  }
}

export const chatService = new ChatService();
