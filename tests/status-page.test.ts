import { describe, expect, test } from "bun:test";
import {
  formatUptimePercentage,
  formatCheckAge,
  getMonthlyUptimeSummary,
  getOverallStatus,
  type StatusEndpoint,
  type StatusEvent,
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

describe("formatUptimePercentage", () => {
  test("formats the authoritative Gatus uptime fraction", () => {
    expect(formatUptimePercentage(1)).toBe("100%");
    expect(formatUptimePercentage(0.632124)).toBe("63.21%");
    expect(formatUptimePercentage(0)).toBe("0%");
  });
});

describe("getMonthlyUptimeSummary", () => {
  const now = new Date("2026-07-13T15:00:00Z");
  const events: readonly StatusEvent[] = [
    { type: "HEALTHY", timestamp: "2026-07-13T13:00:00Z" },
    { type: "START", timestamp: "2026-07-13T11:00:00Z" },
    { type: "UNHEALTHY", timestamp: "2026-07-13T11:00:00Z" },
  ];

  test("builds 30 UTC daily bars from state transitions in any order", () => {
    const summary = getMonthlyUptimeSummary(events, now);
    const reversedSummary = getMonthlyUptimeSummary(events.toReversed(), now);

    expect(summary.periodLabel).toBe("Since monitoring began");
    expect(summary.days).toHaveLength(30);
    expect(
      summary.days.slice(0, -1).every(({ status }) => status === "unknown"),
    ).toBe(true);
    expect(summary.days.at(-1)).toMatchObject({
      date: "2026-07-13",
      percentage: 50,
      status: "down",
    });
    expect(reversedSummary).toEqual(summary);
  });

  test("uses green for 100%, amber from 99%, and red below 99%", () => {
    const summary = getMonthlyUptimeSummary(
      [
        { type: "START", timestamp: "2026-06-01T00:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-06-01T00:00:00Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-12T12:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-12T12:10:00Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-13T12:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-13T12:10:00Z" },
      ],
      now,
    );

    expect(summary.periodLabel).toBe("Past 30 days");
    expect(summary.days.at(-3)?.status).toBe("up");
    expect(summary.days.at(-2)).toMatchObject({
      date: "2026-07-12",
      status: "degraded",
    });
    expect(summary.days.at(-1)).toMatchObject({
      date: "2026-07-13",
      status: "down",
    });
  });

  test("reports unknown days when no event history is available", () => {
    const summary = getMonthlyUptimeSummary([], now);

    expect(summary.periodLabel).toBe("Since monitoring began");
    expect(summary.days.every(({ status }) => status === "unknown")).toBe(true);
  });
});
