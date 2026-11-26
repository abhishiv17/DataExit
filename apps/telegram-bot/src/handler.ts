export interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  chat: { id: number; type: string };
  from?: { id?: number; is_bot?: boolean };
  text?: string;
  voice?: { file_id: string; duration: number; file_size?: number; mime_type?: string };
  reply_to_message?: { text?: string; from?: { id?: number } };
}

export type Action = "static" | "ask" | "check" | "reset";
export interface Request {
  action: Action;
  input?: string;
  voiceFile?: TelegramMessage["voice"];
  speak: boolean;
  chatId: number;
  userId: number;
  messageId: number;
  threadId?: number;
  text?: string;
}

export const BOT_VERSION = "0.3.0";
const HELP = "Send me a voice note (up to 30 seconds) or a text question in a private chat. I use Sarvam AI to answer and send a spoken reply to voice notes. In a group, use /ask@BotName for a question, /check@BotName for a suspicious text, or reply to one of my messages with a voice note. /voice@BotName followed by text asks for a spoken reply. I respond in English, Hindi or Kannada based on your question. /status shows the active version; /reset clears this chat's short conversation memory. I never ask for OTP, PIN or Aadhaar.";

/** Decide what to process before any paid API call. */
export function routeMessage(message: TelegramMessage, username: string, botId: number, allowedChats: ReadonlySet<number>): Request | null {
  if (message.from?.is_bot) return null;
  const raw = message.text?.trim() ?? "";
  const command = raw.match(/^\/([a-z]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/i);
  if (command?.[2] && command[2].toLowerCase() !== username.toLowerCase()) return null;
  const verb = command?.[1]?.toLowerCase();
  let commandInput = command?.[3]?.trim();
  // Accept both /voice@BotName text and /voice @BotName text.
  const spacedMention = commandInput?.match(/^@([A-Za-z0-9_]+)(?:\s+([\s\S]*))?$/);
  if (spacedMention) {
    if (spacedMention[1].toLowerCase() !== username.toLowerCase()) return null;
    commandInput = spacedMention[2]?.trim();
  }
  const base = {
    chatId: message.chat.id,
    userId: message.from?.id ?? message.chat.id,
    messageId: message.message_id,
    ...(message.message_thread_id !== undefined ? { threadId: message.message_thread_id } : {}),
  };
  if (verb === "chatid") return { ...base, action: "static", speak: false, text: `This chat ID is ${message.chat.id}. Add it to TELEGRAM_ALLOWED_CHAT_IDS in your local .env, then restart the bot.` };
  if (verb === "start" || verb === "help") return { ...base, action: "static", speak: false, text: HELP.replaceAll("BotName", username) };
  if (verb === "status") return { ...base, action: "static", speak: false, text: `Data Exit Telegram bot v${BOT_VERSION}. Sarvam AI and voice are enabled. Reply languages: English, Hindi, Kannada. Allowed here: ${allowedChats.has(message.chat.id) ? "yes" : "no"}.` };
  if (!allowedChats.has(message.chat.id)) {
    if (verb || message.chat.type === "private") return { ...base, action: "static", speak: false, text: `This chat is not enabled. Its ID is ${message.chat.id}. Add it to TELEGRAM_ALLOWED_CHAT_IDS in your local .env, then restart the bot.` };
    return null;
  }
  if (verb === "reset") return { ...base, action: "reset", speak: false };
  if (verb === "check" || verb === "ask" || verb === "voice") {
    const input = commandInput || message.reply_to_message?.text?.trim();
    if (!input) return { ...base, action: "static", speak: false, text: `Send /${verb}@${username} followed by text, or use the command as a reply to a text message.` };
    if (input.length > 10_000) return { ...base, action: "static", speak: false, text: "That text is too long. Send up to 10,000 characters." };
    return { ...base, action: verb === "check" ? "check" : "ask", input, speak: verb === "voice" };
  }
  if (command) return null;
  if (message.voice) {
    // With privacy mode enabled, a group voice message is processed only when replying to the bot.
    if (message.chat.type !== "private" && message.reply_to_message?.from?.id !== botId) return null;
    if (message.voice.duration > 30 || (message.voice.file_size ?? 0) > 10_000_000) {
      return { ...base, action: "static", speak: false, text: "Please send a voice note of 30 seconds or less and under 10 MB." };
    }
    return { ...base, action: "ask", voiceFile: message.voice, speak: true };
  }
  if (message.chat.type === "private" && raw) {
    if (raw.length > 10_000) return { ...base, action: "static", speak: false, text: "That text is too long. Send up to 10,000 characters." };
    return { ...base, action: "ask", input: raw, speak: false };
  }
  return null;
}
