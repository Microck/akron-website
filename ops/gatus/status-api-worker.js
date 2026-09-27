// Cloudflare Worker: stable public edge for Akron status API.
// Vercel proxies /status-api/* here, then this worker reaches the status
// host through its persistent Tailscale Funnel hostname.
// STATUS_ORIGIN must be https://oracle-ashburn-cloud.tailc896c6.ts.net.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.STATUS_ORIGIN) {
      return new Response("STATUS_ORIGIN is not configured", { status: 503 });
    }

    const target = new URL(url.pathname + url.search, env.STATUS_ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ipcountry");
    headers.delete("cf-ray");
    headers.delete("cf-visitor");
    headers.delete("x-forwarded-for");
    headers.delete("x-forwarded-proto");
    headers.delete("x-real-ip");

    const init = {
      method: request.method,
      headers,
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }

    try {
      const resp = await fetch(target.toString(), init);
      const outHeaders = new Headers(resp.headers);
      outHeaders.set("access-control-allow-origin", "*");
      outHeaders.set("cache-control", "no-store");
      return new Response(resp.body, {
        status: resp.status,
        headers: outHeaders,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "origin_unreachable",
          message: String(error),
        }),
        {
          status: 502,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        },
      );
    }
  },
};
