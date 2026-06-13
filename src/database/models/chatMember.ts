import { randomUUID } from "node:crypto";
import { Schema, model, type Document } from "mongoose";

export interface IChatMemberWarning {
  id: string;
  moderatorId: number;
  reason: string;
  active: boolean;
  createdAt: Date;
  expiresAt?: Date | null;
}

export interface IChatMember extends Document<string> {
  _id: string;
  chatId: number;
  userId: number;
  warnsCount: number;
  warnings: IChatMemberWarning[];
  mutedUntil?: Date | null;
  bannedUntil?: Date | null;
  lastSeenAt: Date;
  updatedAt: Date;
  messagesCount: number;
}

const ChatMemberWarningSchema = new Schema<IChatMemberWarning>(
  {
    id: { type: String, required: true, default: () => randomUUID() },
    moderatorId: { type: Number, required: true },
    reason: { type: String, required: true, default: "" },
    active: { type: Boolean, required: true, default: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, default: null },
  },
  {
    _id: false,
    id: false,
  },
);

const ChatMemberSchema = new Schema<IChatMember>(
  {
    _id: { type: String },
    chatId: { type: Number, required: true },
    userId: { type: Number, required: true },
    warnsCount: { type: Number, required: true, default: 0 },
    warnings: { type: [ChatMemberWarningSchema], required: true, default: [] },
    mutedUntil: { type: Date, default: null },
    bannedUntil: { type: Date, default: null },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    messagesCount: { type: Number, required: true, default: 0 },
  },
  {
    collection: "chat_members",
    id: false,
    timestamps: {
      createdAt: false,
      updatedAt: "updatedAt",
    },
  },
);

ChatMemberSchema.pre("validate", function () {
  if (!this._id) {
    this._id = buildChatMemberId(this.chatId, this.userId);
  }
});

ChatMemberSchema.index({ chatId: 1, userId: 1 }, { unique: true });
ChatMemberSchema.index({ userId: 1 });
ChatMemberSchema.index({ chatId: 1 });
ChatMemberSchema.index({ chatId: 1, warnsCount: -1 });

export function buildChatMemberId(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}

export const ChatMember = model<IChatMember>("ChatMember", ChatMemberSchema);
