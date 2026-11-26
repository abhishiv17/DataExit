# Scam-shield MCP server

`check_scam` checks suspicious message text or a voice transcript. Its weighted rules return warning flags, a cautious verdict, next steps and a reply in English, Hindi or Kannada. The rule result works offline. An optional AI provider adds a short contextual explanation, without changing the rule verdict or removing the safety line.

## Run locally

From the repository root:

```powershell
npm install
npm run build
node servers/scam-shield/dist/index.js
```

This uses MCP over stdio, so it is meant for an MCP client rather than a terminal conversation. The all-in-one server also registers `check_scam` (`npm start`). Set `SCAM_AI_PROVIDER=none` to run without any provider call.

For a local HTTP MCP connector, set a random `MCP_HTTP_SECRET` of at least 24 characters and run `node servers/scam-shield/dist/index.js --http`. The default listener is `127.0.0.1:8788`; the endpoint is `/mcp/<secret>`. A remote connector needs an HTTPS deployment and a secret kept out of logs and chat messages.

## Provider configuration

In the local, git-ignored `.env`:

```dotenv
SCAM_AI_PROVIDER=auto
GROQ_API_KEY=your_key
GROQ_MODEL=openai/gpt-oss-120b
```

`auto` selects Groq when its key exists, otherwise Anthropic when its key exists, otherwise rules only. To switch later, set `SCAM_AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, and optionally `ANTHROPIC_MODEL` (default `claude-haiku-4-5-20251001`). The API key never appears in tool output. The provider receives up to 4,000 characters of the submitted text after long numbers, email addresses and URL token parameters are redacted; raw submitted text is not stored by this server.

The `ai` field reports `provider`, `status` (`ok`, `unavailable` or `disabled`) and `explanation`. When AI is unavailable, `reply_text`, flags and verdict come from the rules. The final reply always ends with the OTP/PIN/Aadhaar safety line. This tool is a first opinion, not a sender verification service.
