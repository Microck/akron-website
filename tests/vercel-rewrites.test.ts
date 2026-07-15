import { describe, expect, test } from "bun:test";
import vercelConfig from "../vercel.json";

describe("Vercel public redirects", () => {
  test("sends the branded Discord route to Akron's permanent invite", () => {
    expect(vercelConfig.redirects).toContainEqual({
      source: "/discord",
      destination: "https://discord.gg/g28jCgdhFB",
      permanent: false
    });
  });
});

describe("Vercel upload rewrites", () => {
  test("routes branded multi-image capture URLs to their public R2 objects", () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/maps/:map/:pack/captures/:capture",
      destination: "https://pub-5441db2ee508423890b8fa2a6a176ffe.r2.dev/captures/:map/:pack/:capture"
    });
  });
});

describe("Vercel status proxy", () => {
  test("serves the website app at the status path", () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/status",
      destination: "/"
    });
  });

  test("proxies only the status API namespace to Gatus", () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/status-api/:path*",
      destination: "http://145.241.164.73/api/v1/:path*"
    });
  });
});
