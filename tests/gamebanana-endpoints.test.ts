import { describe, expect, test } from "bun:test";
import { resolveOlympusInstallUrl, resolveRawDownloadUrl } from "../api/_gamebanana.js";

describe("install endpoints", () => {
  test("both install routes use the published release archive", () => {
    const download = resolveRawDownloadUrl();
    expect(download).toBe("https://github.com/Microck/akron/releases/download/v0.1.2-beta.82/Akron-v0.1.2-beta.82.zip");
    expect(resolveOlympusInstallUrl()).toBe(`everest:${download}`);
  });
});
