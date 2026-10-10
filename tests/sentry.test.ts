import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/react";
import { browserTelemetryOptions } from "../src/instrument";
import { createOutageReporter, parseSentryDsn, sanitizeErrorEvent } from "../observability/privacy.js";
import { createSentryTunnel } from "../api/sentry.js";

// Reserved test host; every network-capable dependency is replaced below.
const dsn = "https://0123456789abcdef0123456789abcdef@sentry.example/42";
const eventId = "abcdef0123456789abcdef0123456789";
const secret = "PRIVATE_PAYLOAD_DO_NOT_SEND";

function sampleEvent() {
  return {
    event_id: eventId, timestamp: 1, level: "error", release: "akron@123", environment: "test",
    user: { email: secret, ip_address: secret }, request: { url: `https://site.example/?token=${secret}`, data: secret },
    extra: { content: secret }, contexts: { anything: { value: secret } },
    breadcrumbs: [{ message: secret }], tags: { runtime: "browser", operation: "current_status", arbitrary: secret },
    exception: { values: [{ type: "TypeError", value: secret, stacktrace: { frames: [{
      filename: `https://site.example/assets/app.js?token=${secret}#${secret}`, function: "loadStatus", lineno: 12, colno: 8,
      vars: { password: secret }, context_line: secret,
    }] } }] },
  };
}

function envelope(value = sampleEvent(), headerDsn = dsn, type = "event") {
  return [JSON.stringify({ dsn: headerDsn, event_id: eventId, trace: { user: secret } }),
    JSON.stringify({ type }), JSON.stringify(value)].join("\n");
}

function response() {
  return {
    statusCode: 0, headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; },
    end() {},
  };
}

describe("Sentry configuration and privacy", () => {
  test("stays disabled without a DSN, in dev, and with malformed DSNs", () => {
    expect(browserTelemetryOptions({ PROD: true })).toBeNull();
    expect(browserTelemetryOptions({ PROD: false, VITE_SENTRY_DSN: dsn })).toBeNull();
    expect(browserTelemetryOptions({ PROD: true, VITE_SENTRY_DSN: "not a DSN" })).toBeNull();
    expect(parseSentryDsn(dsn.replace("https:", "http:"))).toBeNull();
    expect(parseSentryDsn(dsn + "?redirect=https://attacker.example")).toBeNull();
    expect(parseSentryDsn(dsn.replace("@", ":password@"))).toBeNull();
  });

  test("only retains diagnostic error fields and fixed tags", () => {
    const original = sampleEvent();
    const clean = sanitizeErrorEvent(original)!;
    expect(JSON.stringify(clean)).not.toContain(secret);
    expect(clean.exception.values[0].type).toBe("TypeError");
    expect(clean.exception.values[0].stacktrace.frames[0]).toEqual({
      filename: "/assets/app.js", function: "loadStatus", lineno: 12, colno: 8, in_app: undefined,
    });
    expect(original.user.email).toBe(secret);
    expect(sanitizeErrorEvent({ message: secret })).toBeNull();
  });

  test("configured SDK sends one sanitized error envelope without sessions or other products", async () => {
    const sent: string[] = [];
    const forwarded: string[] = [];
    const tunnel = createSentryTunnel({ dsn, fetchImpl: async (_url: string, init: RequestInit) => {
      forwarded.push(String(init.body));
      return new Response(null, { status: 200 });
    } });
    const options = browserTelemetryOptions({ PROD: true, VITE_SENTRY_DSN: dsn })!;
    Sentry.init({ ...options, transport: (transportOptions) => Sentry.makeFetchTransport(transportOptions,
      (async (_url, init) => {
        sent.push(String(init?.body));
        const res = response();
        await tunnel({ method: "POST", headers: {}, body: init?.body }, res);
        return new Response(null, { status: res.statusCode });
      }) as typeof fetch),
    });
    Sentry.captureException(new Error(secret));
    await Sentry.flush(1_000);
    await Sentry.close(1_000);
    expect(sent).toHaveLength(1);
    const [header, item, error] = sent[0].split("\n").map((part) => JSON.parse(part));
    expect(header.dsn).toBe(dsn);
    expect(item.type).toBe("event");
    expect(error.exception.values).toHaveLength(1);
    expect(sent[0]).not.toContain(secret);
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]).not.toContain(secret);
    expect(options.dataCollection?.userInfo).toBe(false);
    expect(options.dataCollection?.httpBodies).toEqual([]);
    expect(options.tracePropagationTargets).toEqual([]);
  });
});

describe("status polling reports", () => {
  test("ignores cancellations and offline failures; reports once per phase until recovery", () => {
    const captured: string[] = [];
    const reporter = createOutageReporter((_error, tags) => captured.push(tags.operation));
    reporter.failure("current_status", new DOMException("Cancelled", "AbortError"));
    reporter.failure("current_status", new Error("offline"), true);
    expect(captured).toEqual([]);
    reporter.failure("current_status", new Error("outage"));
    reporter.failure("current_status", new Error("same outage"));
    reporter.failure("status_history", new Error("history"));
    expect(captured).toEqual(["current_status", "status_history"]);
    reporter.recovered("current_status");
    reporter.failure("current_status", new Error("new outage"));
    expect(captured).toHaveLength(3);
  });
});

describe("same-origin Sentry error tunnel", () => {
  test("does not send anything when its server DSN is absent", async () => {
    let requests = 0;
    const handler = createSentryTunnel({ dsn: undefined, fetchImpl: async () => { requests++; } });
    const res = response();
    await handler({ method: "POST", headers: {}, body: envelope() }, res);
    expect(res.statusCode).toBe(204);
    expect(requests).toBe(0);
  });

  test("only posts sanitized error data to the configured project, without caller headers", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const handler = createSentryTunnel({ dsn, fetchImpl: async (url: string, init: RequestInit) => {
      sent.push({ url, init }); return new Response(null, { status: 200 });
    } });
    const res = response();
    await handler({ method: "POST", headers: { host: "site.example", origin: "https://site.example", cookie: secret }, body: envelope() }, res);
    expect(res.statusCode).toBe(204);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://sentry.example/api/42/envelope/?sentry_key=0123456789abcdef0123456789abcdef&sentry_version=7");
    expect(JSON.stringify(sent)).not.toContain(secret);
    expect(sent[0].init.redirect).toBe("error");
    expect(sent[0].init.headers).toEqual({ "Content-Type": "application/x-sentry-envelope" });
  });

  test("rejects untrusted destinations, other item types, cross-site requests and oversized bodies", async () => {
    let requests = 0;
    const handler = createSentryTunnel({ dsn, fetchImpl: async () => { requests++; } });
    for (const [body, headers, expected] of [
      [envelope(sampleEvent(), dsn.replace("sentry.example", "127.0.0.1")), {}, 400],
      [envelope(sampleEvent(), dsn, "replay_event"), {}, 400],
      [envelope() + "\n{}\n{}", {}, 400],
      ["null\nnull\nnull", {}, 400],
      [envelope(), { "sec-fetch-site": "cross-site" }, 403],
      [envelope(), { origin: "https://attacker.example", host: "site.example" }, 403],
      ["x".repeat(200_001), {}, 413],
      [envelope(), { "content-length": "200001" }, 413],
    ] as const) {
      const res = response();
      await handler({ method: "POST", headers, body }, res);
      expect(res.statusCode).toBe(expected);
    }
    expect(requests).toBe(0);
  });

  test("bounds streamed bodies even when content-length is omitted", async () => {
    let requests = 0;
    const handler = createSentryTunnel({ dsn, fetchImpl: async () => { requests++; } });
    const res = response();
    const req = {
      method: "POST", headers: {},
      async *[Symbol.asyncIterator]() { yield Buffer.alloc(100_001); yield Buffer.alloc(100_000); },
    };
    await handler(req, res);
    expect(res.statusCode).toBe(413);
    expect(requests).toBe(0);
  });
});
