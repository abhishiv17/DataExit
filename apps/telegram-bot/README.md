# Telegram test bot

This local bot uses Telegram long polling, Data Exit's `checkScam` engine, and Sarvam AI. It accepts text questions and voice notes, transcribes voice with Saaras v4, writes answers with Sarvam 105B Conversations, and sends spoken MP3 replies with Bulbul v3 in English, Hindi or Kannada. It does not connect to Gmail, approve or send data-rights requests, or read screenshots. Telegram carries the messages; the bot sends voice and text to Sarvam for processing. It keeps only the last four turns per user in memory until restart or `/reset`, and does not store message text on disk. Only chats listed in `TELEGRAM_ALLOWED_CHAT_IDS` can use AI or voice.

## What you need to provide

1. **Bot token.** In Telegram, open [@BotFather](https://t.me/BotFather), send `/newbot`, choose a display name and a unique username ending in `bot`, then copy the token. Put it in `TELEGRAM_BOT_TOKEN` in the repository root `.env`. Keep it private; do not paste it in a group, commit it, or send it in this chat.
2. **Test group chat ID.** Create a Telegram group and add your bot by its username. Leave BotFather's default **privacy mode enabled**; the bot does not need admin rights. Start the bot locally (steps below), then send `/chatid@YourBotUsername` in the group. Copy the negative numeric ID from the reply into `TELEGRAM_ALLOWED_CHAT_IDS` in `.env` and restart the bot. If you also want to test a private chat, send `/chatid` to the bot privately and add that ID too, separated by a comma. Group IDs can change when a group is upgraded to a supergroup, so repeat `/chatid` if checks stop after that change.
3. **Sarvam key.** Create a key in the [Sarvam dashboard](https://dashboard.sarvam.ai/) and place it in `SARVAM_API_KEY` in `.env`. The same key is used for transcription, chat, and speech generation. These API calls may use account credits.

Use a dedicated test bot and group. The bot only reads messages addressed to it through commands in the group; group privacy mode should stay on.

## Local setup

From the repository root, with Node 22+ installed:

```powershell
npm install
npm run build
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env`:

```dotenv
TELEGRAM_BOT_TOKEN=the_token_from_BotFather
TELEGRAM_ALLOWED_CHAT_IDS=-1001234567890,123456789
SARVAM_API_KEY=the_key_from_Sarvam
```

For the first run, leave `TELEGRAM_ALLOWED_CHAT_IDS` empty so `/chatid` works, then fill it in and restart. Run one polling instance at a time:

```powershell
npm run telegram
```

The terminal must stay open during testing. No public URL or webhook is needed. If the token already has a webhook, the bot stops with an error; remove the old webhook before using this local polling mode.

## Test it

- In a private chat, send `/start`, then send a text question or a voice note of up to 30 seconds. Private chat access requires adding its ID to the allowlist.
- In the group, send `/ask@YourBotUsername What does KYC mean?` for an AI text answer.
- `/voice @YourBotUsername ...` also works if you put a space before the bot mention, though `/voice@YourBotUsername ...` is the simpler form.
- Send `/check@YourBotUsername Share your OTP to unblock your bank account` for an AI scam assessment grounded in the rule-based warning signs, or reply to a suspicious text message with `/check@YourBotUsername`.
- Send `/voice@YourBotUsername What should I do if a suspicious link arrived?` to get both text and spoken audio.
- To test a group voice note while privacy mode stays on, **reply to one of the bot's messages** with a voice note. The bot replies with the transcript, an AI answer, and a spoken answer.
- Send `/reset@YourBotUsername` to clear that user's short conversation memory.
- Send `/status@YourBotUsername` to check the running bot version and language support after a restart.
- Send an ordinary group message and confirm the bot stays silent.

The scam checker is a first opinion, not a guarantee that a message is safe. The AI can make mistakes. Each answer includes a reminder that Data Exit never asks for OTP, PIN or Aadhaar. For a group demo, avoid posting real OTPs, financial details or identity numbers. The PowerShell process must stay running; after code or `.env` changes, stop it with Ctrl+C and run `npm run telegram` again.
