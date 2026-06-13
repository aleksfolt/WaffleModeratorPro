import { Schema, model, type Document } from "mongoose";

export type WarnAction = "kick" | "ban" | "mute";

export interface IWarnSettings {
  maxWarns: number;
  action: WarnAction;
  actionDuration: number | null; // seconds; null = forever; ignored for kick
  warnDuration: number | null;   // seconds; null = warn is permanent
}

export type ButtonStyle = "primary" | "success" | "danger";

export interface IWelcomeButton {
  text: string;
  url: string;
  style?: ButtonStyle;
}

export interface IWelcomeSettings {
  enabled: boolean;
  onlyFirst: boolean;
  message: string | null;
  buttons: IWelcomeButton[][];  // массив рядов, в каждом 1-2 кнопки
}

export interface ICallAdminSettings {
  enabled: boolean;
  target: "admins" | "allAdmins";
}

export interface IAnonAdminSettings {
  blockEnabled: boolean;
}

export type AntiFloodAction = "warn" | "mute" | "kick" | "ban";

export interface IAntiFloodSettings {
  enabled: boolean;
  messages: number;
  time: number;            // окно в секундах
  action: AntiFloodAction;
  durationAction: number | null; // секунды; null = навсегда (для ban/mute)
  deleteMessages: boolean;
}

export type RulesPermission = "noone" | "members" | "private" | "admins";

export interface IRulesSettings {
  enabled: boolean;
  text: string;
  buttons: IWelcomeButton[][];
  permissions: RulesPermission;
}

export type NsfwAction = "warn" | "mute" | "kick" | "ban";

export interface INsfwFilterSettings {
  enabled: boolean;
  percent: number;          // confidence threshold 0-100
  blockCovered: boolean;    // также блокировать купальники/бельё (covered классы)
  action: NsfwAction;
  durationAction: number | null; // секунды; null = навсегда
  deleteMessage: boolean;
}

export interface IChat extends Document {
  anonAdmin: IAnonAdminSettings;
  antiFlood: IAntiFloodSettings;
  nsfwFilter: INsfwFilterSettings;
  rules: IRulesSettings;
  chatId: number;
  title: string;
  membersCount: number;
  // admins — суперадмины с полными правами, используются для уведомлений
  // allAdmins — все администраторы и создатель, для статистики и @admin
  admins: number[];
  allAdmins: number[];
  work: boolean;
  updatedAt: Date;
  warn: IWarnSettings;
  welcome: IWelcomeSettings;
  callAdmin: ICallAdminSettings;
}

const WarnSettingsSchema = new Schema<IWarnSettings>(
  {
    maxWarns: { type: Number, required: true, default: 3 },
    action: { type: String, enum: ["kick", "ban", "mute"], required: true, default: "kick" },
    actionDuration: { type: Number, default: null },
    warnDuration: { type: Number, default: null },
  },
  { _id: false },
);

const WelcomeButtonSchema = new Schema<IWelcomeButton>(
  {
    text: { type: String, required: true },
    url: { type: String, required: true },
    style: { type: String, enum: ["primary", "success", "danger"], default: undefined },
  },
  { _id: false },
);

const WelcomeSettingsSchema = new Schema<IWelcomeSettings>(
  {
    enabled: { type: Boolean, required: true, default: false },
    onlyFirst: { type: Boolean, required: true, default: false },
    message: { type: String, default: null },
    buttons: { type: [[WelcomeButtonSchema]], required: true, default: [] },
  },
  { _id: false },
);

const AntiFloodSettingsSchema = new Schema<IAntiFloodSettings>(
  {
    enabled:        { type: Boolean, required: true, default: false },
    messages:       { type: Number,  required: true, default: 5 },
    time:           { type: Number,  required: true, default: 10 },
    action:         { type: String, enum: ["warn", "mute", "kick", "ban"], required: true, default: "warn" },
    durationAction: { type: Number, default: null },
    deleteMessages: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const AnonAdminSettingsSchema = new Schema<IAnonAdminSettings>(
  {
    blockEnabled: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const CallAdminSettingsSchema = new Schema<ICallAdminSettings>(
  {
    enabled: { type: Boolean, required: true, default: false },
    target: { type: String, enum: ["admins", "allAdmins"], required: true, default: "admins" },
  },
  { _id: false },
);

const NsfwFilterSettingsSchema = new Schema<INsfwFilterSettings>(
  {
    enabled:        { type: Boolean, required: true, default: false },
    percent:        { type: Number,  required: true, default: 60 },
    blockCovered:   { type: Boolean, required: true, default: false },
    action:         { type: String, enum: ["warn", "mute", "kick", "ban"], required: true, default: "kick" },
    durationAction: { type: Number, default: null },
    deleteMessage:  { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const RulesSettingsSchema = new Schema<IRulesSettings>(
  {
    enabled:     { type: Boolean, required: true, default: false },
    text:        { type: String,  required: true, default: "Правила группы не установлены." },
    buttons:     { type: [[WelcomeButtonSchema]], required: true, default: [] },
    permissions: { type: String, enum: ["noone", "members", "private", "admins"], required: true, default: "members" },
  },
  { _id: false },
);

const ChatSchema = new Schema<IChat>(
  {
    chatId: { type: Number, required: true },
    title: { type: String, required: true, default: "" },
    membersCount: { type: Number, required: true, default: 0 },
    admins: { type: [Number], required: true, default: [] },
    allAdmins: { type: [Number], required: true, default: [] },
    work: { type: Boolean, required: true, default: false },
    warn: { type: WarnSettingsSchema, required: true, default: () => ({}) },
    welcome: { type: WelcomeSettingsSchema, required: true, default: () => ({}) },
    callAdmin: { type: CallAdminSettingsSchema, required: true, default: () => ({}) },
    anonAdmin:   { type: AnonAdminSettingsSchema,    required: true, default: () => ({}) },
    antiFlood:   { type: AntiFloodSettingsSchema,   required: true, default: () => ({}) },
    nsfwFilter:  { type: NsfwFilterSettingsSchema,  required: true, default: () => ({}) },
    rules:       { type: RulesSettingsSchema,        required: true, default: () => ({}) },
  },
  {
    collection: "chats",
    id: false,
    timestamps: {
      createdAt: false,
      updatedAt: "updatedAt",
    },
  },
);

ChatSchema.index({ chatId: 1 }, { unique: true });
ChatSchema.index({ allAdmins: 1 });

export const Chat = model<IChat>("Chat", ChatSchema);
