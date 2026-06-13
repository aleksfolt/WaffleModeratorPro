import { InlineKeyboard } from "grammy";

import type { IWelcomeButton } from "../database/models/chat.ts";

export function buildKeyboard(rows: IWelcomeButton[][]): InlineKeyboard | undefined {
  if (!rows || rows.length === 0) return undefined;
  const kb = new InlineKeyboard();
  for (const row of rows) {
    for (const btn of row) {
      kb.add({
        text: btn.text,
        url: btn.url,
        ...(btn.style ? { style: btn.style } : {}),
      });
    }
    kb.row();
  }
  return kb;
}
