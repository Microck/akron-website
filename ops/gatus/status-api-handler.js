import { parseSentryDsn, privateDataCollection, sanitizeErrorEvent } from "../../observability/privacy.js";

export function createStatusWorker(sentry) {
  const plainHandler = createStatusHandler();
  let instrumentedHandler;
  return {
    fetch(request, env, ctx) {
      if (!parseSentryDsn(env.SENTRY_DSN)) return plainHandler.fetch(request, env, ctx);
      instrumentedHandler ??= sentry.withSentry((bindings) => ({
        dsn: parseSentryDsn(bindings.SENTRY_DSN)?.dsn,
        cacheClient: false,
        environment: bindings.SENTRY_ENVIRONMENT || "production",
        release: bindings.SENTRY_RELEASE || undefined,
        defaultIntegrations: false,
        dataCollection: privateDataCollection,
        tracesSampler: () => 0,
        tracePropagationTargets: [],
        sendClientReports: false,
        beforeSend: sanitizeErrorEvent,
        beforeSendLog: () => null,
        beforeSendMetric: () => null,
        initialScope: { tags: { runtime: "status_worker" } },
      }), createStatusHandler((error, tags) => sentry.captureException(error, { tags })));
      // Error-only monitoring does not continue caller-controlled trace/baggage
      // metadata or forward it to the status origin.
      const headers = new Headers(request.headers);
      headers.delete("sentry-trace");
      headers.delete("baggage");
      return instrumentedHandler.fetch(new Request(request, { headers }), env, ctx);
    },
  };
}

export function createStatusHandler(captureFailure = () => {}) {
  // Fixed keys only, with at most one report per class every five minutes in an
  // isolate. Gatus remains responsible for uptime/recovery alerts.
  const lastReport = new Map();
  function report(error, operation, failureKind, status) {
    const key = `${operation}:${failureKind}`;
    const now = Date.now();
    if (lastReport.has(key) && now - lastReport.get(key) < 300_000) return;
    lastReport.set(key, now);
    try {
      captureFailure(error, {
        operation, failure_kind: failureKind,
        ...(status ? { http_status: String(status) } : {}),
      });
    } catch { /* Reporting must not change the proxy response. */ }
  }

  return {
    async fetch(request, env) {
      if (!env.STATUS_ORIGIN) {
        report(new Error("Status origin is not configured."), "origin_config", "configuration");
        return new Response("STATUS_ORIGIN is not configured", { status: 503 });
      }
      try {
        const url = new URL(request.url);
        const target = new URL(env.STATUS_ORIGIN);
        target.pathname = url.pathname;
        target.search = url.search;
        const headers = new Headers(request.headers);
        for (const name of ["host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
          "x-forwarded-for", "x-forwarded-proto", "x-real-ip"]) headers.delete(name);
        const init = { method: request.method, headers };
        if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
        const resp = await fetch(target.toString(), init);
        if (resp.status >= 500) {
          report(new Error("Status origin returned a server error."), "origin_fetch", "http", resp.status);
        }
        const outHeaders = new Headers(resp.headers);
        outHeaders.set("access-control-allow-origin", "*");
        outHeaders.set("cache-control", "no-store");
        return new Response(resp.body, { status: resp.status, headers: outHeaders });
      } catch (error) {
        report(error, "origin_fetch", "network");
        return new Response(JSON.stringify({
          error: "origin_unreachable", message: "The status service could not be reached.",
        }), { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
    },
  };
}
