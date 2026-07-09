import { describe, expect, test } from "bun:test";
import vercelConfig from "../vercel.json";

describe("Vercel upload rewrites", () => {
  test("routes branded multi-image capture URLs to their public R2 objects", () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/maps/:map/:pack/captures/:capture",
      destination: "https://pub-5441db2ee508423890b8fa2a6a176ffe.r2.dev/captures/:map/:pack/:capture"
    });
  });
});
