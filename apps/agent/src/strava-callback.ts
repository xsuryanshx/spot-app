import { createServer } from "node:http";
import { URL } from "node:url";
import { completeStravaOAuth } from "./strava-handlers.js";

let serverStarted = false;

export function startStravaCallbackServer(): void {
  if (serverStarted) return;
  if (!shouldStartCallbackServer()) return;

  const redirect = process.env.STRAVA_REDIRECT_URI ?? "http://localhost:8787/strava/callback";
  let listenUrl: URL;
  try {
    listenUrl = new URL(redirect);
  } catch {
    console.warn(`Invalid STRAVA_REDIRECT_URI: ${redirect}`);
    return;
  }

  const pathname = listenUrl.pathname || "/strava/callback";
  const isLocal = listenUrl.hostname === "localhost" || listenUrl.hostname === "127.0.0.1";
  const port = Number(process.env.PORT ?? listenUrl.port ?? (listenUrl.protocol === "https:" ? 443 : 8787));
  const host = isLocal ? "127.0.0.1" : "0.0.0.0";

  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (!req.url?.startsWith(pathname)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const url = new URL(req.url, `${listenUrl.protocol}//${listenUrl.host}`);
    const code = url.searchParams.get("code");
    const userId = url.searchParams.get("state") ?? "unknown-user";
    const error = url.searchParams.get("error");

    if (error || !code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`Strava authorization failed: ${error ?? "missing code"}`);
      return;
    }

    try {
      const message = await completeStravaOAuth(userId, code);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`${message}\n\nYou can close this tab and return to iMessage.`);
      console.log(`Strava linked for ${userId}`);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "unknown error";
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Strava link failed: ${detail}`);
    }
  });

  server.listen(port, host, () => {
    serverStarted = true;
    const label = isLocal ? `http://localhost:${port}` : listenUrl.origin;
    console.log(`Strava OAuth callback listening on ${label}${pathname} (health: /health)`);
  });
}

function shouldStartCallbackServer(): boolean {
  if (process.env.SPOT_STRAVA_CALLBACK === "1") return true;
  const redirect = process.env.STRAVA_REDIRECT_URI ?? "";
  return redirect.startsWith("https://") && Boolean(process.env.STRAVA_CLIENT_ID);
}
