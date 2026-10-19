import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { resolveOlympusInstallUrl, resolveRawDownloadUrl } from "../api/_gamebanana.js";

describe("install endpoints", () => {
  test("both install routes use the published release archive", () => {
    const download = resolveRawDownloadUrl();
    const tag = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8").match(/const releaseTag = "(v[^"\s]+)";/u)?.[1];
    expect(tag).toBeDefined();
    expect(download).toBe(`https://github.com/Microck/akron/releases/download/${tag}/Akron-${tag}.zip`);
    expect(resolveOlympusInstallUrl()).toBe(`everest:${download}`);
  });
});
