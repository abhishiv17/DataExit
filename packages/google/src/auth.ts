import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { OAuth2Client, type Credentials } from "google-auth-library";

/**
 * gmail.readonly is needed because the gmail.metadata scope cannot use search queries.
 * Discovery still requests format=metadata (headers only); bodies are read only to classify replies.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  tokenPath: string;
  redirectPort: number;
}

function redirectUri(port: number) {
  return `http://127.0.0.1:${port}/oauth2callback`;
}

function saveToken(path: string, token: Credentials) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(token, null, 2), { mode: 0o600 });
}

/** Returns an authorised client, or null if `npm run auth:google` has not been run yet. */
export function loadGoogleClient(cfg: GoogleAuthConfig): OAuth2Client | null {
  if (!cfg.clientId || !cfg.clientSecret || !existsSync(cfg.tokenPath)) return null;
  const client = new OAuth2Client({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: redirectUri(cfg.redirectPort),
  });
  const token = JSON.parse(readFileSync(cfg.tokenPath, "utf8")) as Credentials;
  client.setCredentials(token);
  // Persist refreshed access tokens, keeping the refresh token.
  client.on("tokens", (t) => saveToken(cfg.tokenPath, { ...token, ...t, refresh_token: t.refresh_token ?? token.refresh_token }));
  return client;
}

/** Interactive loopback OAuth flow. Prints a URL, waits for the redirect, saves the token. */
export async function runGoogleAuthFlow(cfg: GoogleAuthConfig, print: (s: string) => void): Promise<void> {
  const client = new OAuth2Client({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: redirectUri(cfg.redirectPort),
  });
  const url = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GOOGLE_SCOPES });
  print(`\nOpen this URL in your browser and sign in with the demo Gmail account:\n\n${url}\n`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", redirectUri(cfg.redirectPort));
      if (u.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }
      const c = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(c ? "Data Exit is authorised. You can close this tab." : `Authorisation failed: ${err}`);
      server.close();
      if (c) resolve(c);
      else reject(new Error(`Google returned error: ${err}`));
    });
    server.listen(cfg.redirectPort, "127.0.0.1");
    server.on("error", reject);
  });

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) print("Warning: no refresh token returned. Remove the app's access in your Google account and run this again.");
  saveToken(cfg.tokenPath, tokens);
  print(`Saved token to ${cfg.tokenPath}`);
}
