import { describe, expect, test } from "bun:test";
import {
  formatCheckAge,
  getOverallStatus,
  getUptimeSummary,
  type StatusEndpoint,
  type StatusResult,
} from "../src/status-page";

function endpoint(success?: boolean): StatusEndpoint {
  return {
    name: "Website",
    group: "Core",
    key: "core_website",
    results:
      success === undefined
        ? []
        : [
            {
              success,
              timestamp: "2026-07-13T12:00:00Z",
              duration: 25_000_000,
              status: 200,
            },
          ],
  };
}

describe("getOverallStatus", () => {
  test("reports unknown before any endpoint data is available", () => {
    expect(getOverallStatus([])).toBe("unknown");
  });

  test("reports operational only when every endpoint is healthy", () => {
    expect(getOverallStatus([endpoint(true), endpoint(true)])).toBe(
      "operational",
    );
  });

  test("uses the newest timestamp regardless of history ordering", () => {
    const olderFailure: StatusResult = {
      success: false,
      timestamp: "2026-07-13T12:00:00Z",
      duration: 25_000_000,
      status: 500,
    };
    const newerSuccess: StatusResult = {
      success: true,
      timestamp: "2026-07-13T12:01:00Z",
      duration: 25_000_000,
      status: 200,
    };
    const statusEndpoint: StatusEndpoint = {
      ...endpoint(false),
      results: [olderFailure, newerSuccess],
    };

    expect(getOverallStatus([statusEndpoint])).toBe("operational");
    expect(
      getOverallStatus([
        { ...statusEndpoint, results: statusEndpoint.results.toReversed() },
      ]),
    ).toBe("operational");
  });

  test("reports degraded for failures or missing endpoint results", () => {
    expect(getOverallStatus([endpoint(true), endpoint(false)])).toBe(
      "degraded",
    );
    expect(getOverallStatus([endpoint(true), endpoint()])).toBe("degraded");
  });
});

describe("formatCheckAge", () => {
  const now = new Date("2026-07-13T12:05:00Z");

  test("uses compact age labels without unstable seconds", () => {
    expect(formatCheckAge("2026-07-13T12:04:45Z", now)).toBe("just now");
    expect(formatCheckAge("2026-07-13T12:03:00Z", now)).toBe("2m ago");
    expect(formatCheckAge("2026-07-13T09:05:00Z", now)).toBe("3h ago");
  });
});

describe("getUptimeSummary", () => {
  const result = (success: boolean, minute: number): StatusResult => ({
    success,
    timestamp: `2026-07-13T12:${minute.toString().padStart(2, "0")}:00Z`,
    duration: 25_000_000,
    status: success ? 200 : 500,
  });

  test("keeps the newest checks and calculates their success rate", () => {
    const history = [
      result(false, 0),
      result(true, 1),
      result(true, 2),
      result(false, 3),
    ];
    const summary = getUptimeSummary(history, 3);
    const reversedSummary = getUptimeSummary(history.toReversed(), 3);

    expect(summary.results.map(({ success }) => success)).toEqual([
      true,
      true,
      false,
    ]);
    expect(summary.percentage).toBe("66.67%");
    expect(reversedSummary).toEqual(summary);
  });

  test("reports no percentage without monitoring history", () => {
    expect(getUptimeSummary([])).toEqual({
      results: [],
      percentage: null,
    });
  });
});
