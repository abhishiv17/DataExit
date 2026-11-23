# Deployment on AWS

Live URL: https://isozxdci5aem2ewbe7utcwv6i40oulpk.lambda-url.ap-south-1.on.aws/

## What runs today (hackathon MVP)

| Resource | Name | Purpose |
| --- | --- | --- |
| Lambda (Node 22, arm64, 256 MB, ap-south-1) | `dataexit-voice` | Serves the web app, `POST /api/check`, `POST /api/tts`, `GET /api/health` |
| Lambda Function URL (auth NONE, CORS) | (see live URL) | HTTPS endpoint; HTTPS is needed for the browser microphone |
| IAM role | `dataexit-voice-lambda` | `AWSLambdaBasicExecutionRole` only; trust limited to this account |
| S3 bucket (all public access blocked) | `dataexit-wapas-<account>` | Deployment bundle `_deploy/voice.zip` |

`/api/check` runs `servers/scam-shield/dist/ops.js`, the exact code behind the `check_scam` MCP tool, so the website and the agent always agree. `/api/tts` calls ElevenLabs. The API key lives only in the Lambda's environment and in the git-ignored `.env`; it never reaches the browser.

Messages sent to `/api/check` and `/api/tts` are not stored or logged. TTS input is capped at 700 characters per call.

Why not CloudFront + S3? CloudFront requires account verification on this new AWS account. A Lambda Function URL gives HTTPS today; CloudFront moves in front of it once the account is verified.

## Redeploy

```bash
npm run build && npm run build -w @dataexit/web   # MCP code + web app (VITE_VOICE_API=/api from apps/web/.env.production)
sh infra/voice-lambda/build.sh                    # assembles infra/voice-lambda/out
cd infra/voice-lambda/out && zip -r ../voice.zip . # or Compress-Archive on Windows
aws s3 cp ../voice.zip s3://dataexit-wapas-<account>/_deploy/voice.zip
aws lambda update-function-code --region ap-south-1 --function-name dataexit-voice \
  --s3-bucket dataexit-wapas-<account> --s3-key _deploy/voice.zip
```

Rotate or set the ElevenLabs key: put `ELEVENLABS_API_KEY=...` in `.env`, then run `powershell -File infra/voice-lambda/set-key.ps1` (the script never prints the key).

## Production architecture (pilot)

```
WhatsApp Cloud API ─┐                       ┌─ Lambda: discovery ─────┐
Missed-call (Twilio)├─▶ API Gateway (HTTP) ─┼─ Lambda: request-engine ├─▶ RDS Postgres (db/schema.sql)
Web app (CloudFront)┘     + Cognito JWT     ├─ Lambda: tracker ───────┤   S3 Object Lock + KMS (evidence)
                                            └─ Lambda: scam-shield ───┘   Secrets Manager (OAuth, ElevenLabs)
EventBridge Scheduler ─▶ Step Functions: 30-day reminder → grievance officer → 90-day DPB draft
SNS ─▶ SMS / WhatsApp digest
```

- One Lambda per MCP server, reusing `servers/*/src/ops.ts` unchanged; `servers/dataexit --http` already speaks MCP over HTTP.
- Request deadlines become Step Functions waits instead of Calendar-only reminders.
- Region ap-south-1 keeps personal data in India.
