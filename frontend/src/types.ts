export type WarnAction = "kick" | "ban" | "mute";

export interface WarnSettings {
  maxWarns: number;
  action: WarnAction;
  actionDuration: number | null;
  warnDuration: number | null;
}

export type ButtonStyle = "primary" | "success" | "danger";

export interface WelcomeButton {
  text: string;
  url: string;
  style?: ButtonStyle;
}

export interface WelcomeSettings {
  enabled: boolean;
  onlyFirst: boolean;
  message: string | null;
  buttons: WelcomeButton[][];
}

export interface CallAdminSettings {
  enabled: boolean;
  target: "admins" | "allAdmins";
}

export interface AnonAdminSettings {
  blockEnabled: boolean;
}

export type AntiFloodAction = "warn" | "mute" | "kick" | "ban";

export interface AntiFloodSettings {
  enabled: boolean;
  messages: number;
  time: number;
  action: AntiFloodAction;
  durationAction: number | null;
  deleteMessages: boolean;
}

export type NsfwAction = "warn" | "mute" | "kick" | "ban";

export interface NsfwFilterSettings {
  enabled: boolean;
  percent: number;
  blockCovered: boolean;
  action: NsfwAction;
  durationAction: number | null;
  deleteMessage: boolean;
}

export type RulesPermission = "noone" | "members" | "private" | "admins";

export interface RulesSettings {
  enabled: boolean;
  text: string;
  buttons: WelcomeButton[][];
  permissions: RulesPermission;
}

export interface ChatListItem {
  chatId: number;
  title: string;
}
