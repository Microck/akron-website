import { describe, expect, test } from "bun:test";
import { preferNewestKnownFileId } from "../api/_gamebanana.js";

describe("preferNewestKnownFileId", () => {
  test("keeps the release fallback while the public API lags", () => {
    expect(preferNewestKnownFileId("1756151")).toBe("1760076");
    expect(preferNewestKnownFileId(null)).toBe("1760076");
  });

  test("accepts a newer public GameBanana file", () => {
    expect(preferNewestKnownFileId("1760077")).toBe("1760077");
  });
});
