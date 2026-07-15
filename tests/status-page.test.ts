import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  formatUptimePercentage,
  formatCheckAge,
  formatUptimeDate,
  getAdjacentHourIndex,
  getMinuteUptimeSummary,
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

describe("formatUptimeDate", () => {
  test("shows the complete UTC date used by the hourly tooltip", () => {
    expect(formatUptimeDate("2026-07-13")).toBe("July 13, 2026");
  });
});

describe("getAdjacentHourIndex", () => {
  test("moves between hours with wrapping arrow-key navigation", () => {
    expect(
      getAdjacentHourIndex({
        currentIndex: 0,
        hourCount: 24,
        key: "ArrowLeft",
      }),
    ).toBe(23);
    expect(
      getAdjacentHourIndex({
        currentIndex: 23,
        hourCount: 24,
        key: "ArrowRight",
      }),
    ).toBe(0);
    expect(
      getAdjacentHourIndex({
        currentIndex: 10,
        hourCount: 24,
        key: "Tab",
      }),
    ).toBeNull();
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

    expect(summary.hasFullHistory).toBe(false);
    expect(summary.days).toHaveLength(30);
    expect(
      summary.days.slice(0, -1).every(({ status }) => status === "unknown"),
    ).toBe(true);
    expect(summary.days.at(-1)).toMatchObject({
      date: "2026-07-13",
      percentage: 50,
      status: "down",
    });
    expect(summary.days.at(-1)?.hours).toHaveLength(24);
    expect(summary.days.at(-1)?.hours[11]).toMatchObject({
      hour: 11,
      percentage: 0,
      status: "down",
    });
    expect(summary.days.at(-1)?.hours[13]).toMatchObject({
      hour: 13,
      percentage: 100,
      status: "up",
    });
    const outageMinutes = getMinuteUptimeSummary(
      events,
      "2026-07-13",
      11,
      now,
    );
    const healthyMinutes = getMinuteUptimeSummary(
      events,
      "2026-07-13",
      13,
      now,
    );

    expect(outageMinutes).toHaveLength(60);
    expect(outageMinutes.every(({ status }) => status === "down")).toBe(true);
    expect(healthyMinutes[0]).toEqual({
      minute: 0,
      status: "up",
    });
    expect(
      summary.days
        .at(-1)
        ?.hours.slice(15)
        .every(({ status }) => status === "unknown"),
    ).toBe(true);
    expect(reversedSummary).toEqual(summary);
  });

  test("colors days and hours from cumulative downtime duration", () => {
    const summary = getMonthlyUptimeSummary(
      [
        { type: "START", timestamp: "2026-06-01T00:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-06-01T00:00:00Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-10T10:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-10T10:01:00Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-11T10:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-11T10:02:00Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-12T10:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-12T10:05:00Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-12T11:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-12T11:09:00Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-13T10:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-13T10:15:00Z" },
      ],
      now,
    );

    expect(summary.hasFullHistory).toBe(true);
    expect(summary.days.at(-4)?.status).toBe("up");
    expect(summary.days.at(-4)?.hours[10]?.status).toBe("degraded");
    expect(summary.days.at(-3)?.status).toBe("degraded");
    expect(summary.days.at(-2)?.status).toBe("degraded");
    expect(summary.days.at(-2)?.hours[10]).toMatchObject({
      hour: 10,
      percentage: 91.67,
      status: "down",
    });
    expect(summary.days.at(-1)?.status).toBe("down");
  });

  test("does not round separate short outages up to failed minutes", () => {
    const summary = getMonthlyUptimeSummary(
      [
        { type: "START", timestamp: "2026-06-01T00:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-06-01T00:00:00Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-13T10:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-13T10:00:10Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-13T11:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-13T11:00:10Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-13T12:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-13T12:00:10Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-13T13:00:00Z" },
        { type: "HEALTHY", timestamp: "2026-07-13T13:00:10Z" },
      ],
      now,
    );

    expect(summary.days.at(-1)?.status).toBe("up");
    expect(summary.days.at(-1)?.hours[10]?.status).toBe("up");
    expect(
      getMinuteUptimeSummary(
        [
          { type: "START", timestamp: "2026-07-13T10:00:00Z" },
          { type: "UNHEALTHY", timestamp: "2026-07-13T10:00:00Z" },
          { type: "HEALTHY", timestamp: "2026-07-13T10:00:10Z" },
        ],
        "2026-07-13",
        10,
        now,
      )[0]?.status,
    ).toBe("down");
  });

  test("leaves periods unknown until they have enough monitoring coverage", () => {
    const partialNow = new Date("2026-07-13T12:00:00Z");
    const summary = getMonthlyUptimeSummary(
      [
        { type: "START", timestamp: "2026-07-13T11:59:30Z" },
        { type: "UNHEALTHY", timestamp: "2026-07-13T11:59:30Z" },
      ],
      partialNow,
    );

    expect(summary.days.at(-1)).toMatchObject({
      percentage: 0,
      status: "unknown",
    });
    expect(summary.days.at(-1)?.hours[11]).toMatchObject({
      percentage: 0,
      status: "unknown",
    });
  });

  test("reports unknown days when no event history is available", () => {
    const summary = getMonthlyUptimeSummary([], now);

    expect(summary.hasFullHistory).toBe(false);
    expect(summary.days.every(({ status }) => status === "unknown")).toBe(true);
  });
});

describe("Gatus catalog contract", () => {
  test("monitors the catalog format consumed by current Akron releases", () => {
    const config = readFileSync("ops/gatus/config.yaml", "utf8");
    const catalogConfig = config.match(
      /  - name: Community Pack Catalog[\s\S]*?(?=\n  - name:|$)/,
    )?.[0];

    expect(catalogConfig).toContain(
      '"[BODY].format == akron-community-pack-index-v3"',
    );
    expect(catalogConfig).toContain('"[BODY].version == 3"');
    expect(catalogConfig).not.toContain("akron-community-pack-index-v2");
  });
});

describe("nested uptime tooltips", () => {
  test("keeps both tooltip levels open across hover gaps and draws arrows", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toContain(".status-uptime-tooltip::before");
    expect(styles).toContain(".status-uptime-tooltip::after");
    expect(styles).toContain(".status-minute-tooltip::before");
    expect(styles).toContain(".status-minute-tooltip::after");
    expect(styles).toContain(".status-uptime-bar:focus-within");
    expect(styles).toContain(".status-hourly-bar:focus");
  });
});
