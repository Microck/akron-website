import { Buffer } from "node:buffer";
import { parseSentryDsn, sanitizeErrorEvent } from "../observability/privacy.js";

const maxEnvelopeBytes = 200_000;

class InvalidEnvelope extends Error {
  constructor(status = 400) { super("Invalid error envelope"); this.status = status; }
}

async function readEnvelope(req) {
  const declaredLength = req.headers["content-length"];
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxEnvelopeBytes)) {
    throw new InvalidEnvelope(413);
  }
  if (req.body !== undefined) {
    if (typeof req.body !== "string" && !Buffer.isBuffer(req.body)) throw new InvalidEnvelope();
    const body = Buffer.from(req.body);
    if (body.byteLength > maxEnvelopeBytes) throw new InvalidEnvelope(413);
    return body.toString("utf8");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const data = Buffer.from(chunk);
    bytes += data.byteLength;
    if (bytes > maxEnvelopeBytes) throw new InvalidEnvelope(413);
    chunks.push(data);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createSentryTunnel({ dsn, fetchImpl = fetch }) {
  const target = parseSentryDsn(dsn);
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).end();
      return;
    }
    // A missing DSN leaves a normal deployment fully usable without telemetry.
    if (!target) { res.status(204).end(); return; }
    if (req.headers["sec-fetch-site"] === "cross-site") { res.status(403).end(); return; }
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) { res.status(403).end(); return; }
      } catch { res.status(403).end(); return; }
    }
    try {
      const lines = (await readEnvelope(req)).trimEnd().split("\n");
      // Error-only SDK configuration sends one JSON event. No attachments,
      // replays, sessions, logs, client reports or arbitrary envelope types.
      if (lines.length !== 3) throw new InvalidEnvelope();
      const header = JSON.parse(lines[0]);
      const item = JSON.parse(lines[1]);
      if (!header || !item || parseSentryDsn(header.dsn)?.dsn !== target.dsn || item.type !== "event") throw new InvalidEnvelope();
      const event = sanitizeErrorEvent(JSON.parse(lines[2]));
      if (!event || !event.event_id) throw new InvalidEnvelope();
      const body = [
        JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
        JSON.stringify({ type: "event" }), JSON.stringify(event),
      ].join("\n");
      // The destination and key come exclusively from server configuration.
      // Never forward caller headers, cookies, client IP or an envelope URL.
      const upstream = await fetchImpl(target.envelopeUrl, {
        method: "POST", headers: { "Content-Type": "application/x-sentry-envelope" },
        body, redirect: "error", signal: AbortSignal.timeout(5_000),
      });
      await upstream.body?.cancel();
      if (upstream.status === 429) {
        const retryAfter = upstream.headers.get("retry-after");
        if (/^\d{1,6}$/.test(retryAfter ?? "")) res.setHeader("Retry-After", retryAfter);
        res.status(429).end();
      } else {
        res.status(upstream.ok ? 204 : 502).end();
      }
    } catch (error) {
      res.status(error instanceof InvalidEnvelope ? error.status : error instanceof SyntaxError ? 400 : 502).end();
    }
  };
}

export default async function handler(req, res) {
  return createSentryTunnel({ dsn: process.env.SENTRY_BROWSER_DSN })(req, res);
}
