import { afterEach, describe, expect, test } from "bun:test";
import { createStatusHandler, createStatusWorker } from "../ops/gatus/status-api-handler.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("status Worker error reporting", () => {
  test("does not initialize telemetry when its DSN is absent or invalid", async () => {
    let initialized = 0;
    globalThis.fetch = (async () => new Response("healthy")) as typeof fetch;
    const worker = createStatusWorker({ withSentry() { initialized++; throw new Error("must not initialize"); } });
    for (const SENTRY_DSN of [undefined, "invalid"]) {
      const res = await worker.fetch(new Request("https://status.example/api/v1/config"), {
        STATUS_ORIGIN: "https://origin.example", SENTRY_DSN,
      });
      expect(res.status).toBe(200);
    }
    expect(initialized).toBe(0);
  });

  test("pins proxy requests to the configured origin and removes caller tracing headers", async () => {
    const received: { url: string; headers: Headers }[] = [];
    globalThis.fetch = (async (url, init) => {
      received.push({ url: String(url), headers: new Headers(init?.headers) });
      return new Response("healthy");
    }) as typeof fetch;
    let options: Record<string, any>;
    const worker = createStatusWorker({
      withSentry(config: (env: Record<string, string>) => Record<string, unknown>, handler: any) {
        options = config({ SENTRY_DSN: "https://0123456789abcdef0123456789abcdef@sentry.example/42" });
        return handler;
      },
    });
    await worker.fetch(new Request("https://status.example//attacker.example/config", {
      headers: { "sentry-trace": "private", baggage: "sentry-user_id=private", "x-real-ip": "private" },
    }), { STATUS_ORIGIN: "https://origin.example", SENTRY_DSN: "https://0123456789abcdef0123456789abcdef@sentry.example/42" });
    expect(received[0].url).toBe("https://origin.example//attacker.example/config");
    expect(received[0].headers.has("baggage")).toBe(false);
    expect(received[0].headers.has("sentry-trace")).toBe(false);
    expect(received[0].headers.has("x-real-ip")).toBe(false);
    expect(options!.dataCollection.httpBodies).toEqual([]);
    expect(options!.tracesSampler()).toBe(0);
  });

  test("keeps origin failures generic and reports repeated failures once", async () => {
    globalThis.fetch = (async () => { throw new Error("private-host-and-token"); }) as typeof fetch;
    const captured: { error: Error; tags: Record<string, string> }[] = [];
    const handler = createStatusHandler((error: Error, tags: Record<string, string>) => captured.push({ error, tags }));
    for (let index = 0; index < 2; index++) {
      const res = await handler.fetch(new Request("https://status.example/api/v1/config"), { STATUS_ORIGIN: "https://origin.example" });
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain("private-host-and-token");
    }
    expect(captured).toHaveLength(1);
    expect(captured[0].tags).toEqual({ operation: "origin_fetch", failure_kind: "network" });
  });

  test("reports upstream 5xx, preserves responses and ignores expected 4xx", async () => {
    const statuses = [503, 503, 404, 200];
    globalThis.fetch = (async () => new Response("upstream", { status: statuses.shift() })) as typeof fetch;
    const captured: Record<string, string>[] = [];
    const handler = createStatusHandler((_error: Error, tags: Record<string, string>) => captured.push(tags));
    for (const status of [503, 503, 404, 200]) {
      const res = await handler.fetch(new Request("https://status.example/api/v1/config"), { STATUS_ORIGIN: "https://origin.example" });
      expect(res.status).toBe(status);
      expect(await res.text()).toBe("upstream");
    }
    expect(captured).toEqual([{ operation: "origin_fetch", failure_kind: "http", http_status: "503" }]);
  });

  test("returns an actionable configuration failure without contacting an origin", async () => {
    let requests = 0;
    globalThis.fetch = (async () => { requests++; return new Response(); }) as typeof fetch;
    const reports: string[] = [];
    const handler = createStatusHandler((_error: Error, tags: Record<string, string>) => reports.push(tags.operation));
    const res = await handler.fetch(new Request("https://status.example/api/v1/config"), {});
    expect(res.status).toBe(503);
    expect(requests).toBe(0);
    expect(reports).toEqual(["origin_config"]);
  });
});
