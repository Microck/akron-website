import { useEffect, useMemo, useState } from "react";

type ConditionResult = Readonly<{
  condition: string;
  success: boolean;
}>;

export type StatusResult = Readonly<{
  success: boolean;
  timestamp: string;
  duration: number;
  status: number;
  conditionResults?: readonly ConditionResult[];
}>;

export type StatusEndpoint = Readonly<{
  name: string;
  group: string;
  key: string;
  results: readonly StatusResult[];
}>;

export type StatusEvent = Readonly<{
  type: "START" | "HEALTHY" | "UNHEALTHY";
  timestamp: string;
}>;

type EndpointHistory = Readonly<{
  uptime: number;
  events: readonly StatusEvent[];
}>;

type UptimeStatus = "up" | "degraded" | "down" | "unknown";

export type HourlyUptime = Readonly<{
  hour: number;
  percentage: number | null;
  status: UptimeStatus;
}>;

export type MinuteUptime = Readonly<{
  minute: number;
  status: UptimeStatus;
}>;

export type DailyUptime = Readonly<{
  date: string;
  percentage: number | null;
  status: UptimeStatus;
  hours: readonly HourlyUptime[];
}>;

type StatusAnnouncement = Readonly<{
  timestamp: string;
  type: "information" | "none" | "operational" | "outage" | "warning";
  message: string;
  archived?: boolean;
}>;

type StatusConfig = Readonly<{
  announcements?: readonly StatusAnnouncement[];
}>;

export type OverallStatus = "degraded" | "operational" | "unknown";

const statusApiBase = "/status-api";

function sortResultsChronologically(results: readonly StatusResult[]) {
  return [...results].sort(
    (left, right) =>
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

function getLatestResult(results: readonly StatusResult[]) {
  return sortResultsChronologically(results).at(-1);
}

export function getOverallStatus(
  endpoints: readonly StatusEndpoint[],
): OverallStatus {
  if (endpoints.length === 0) {
    return "unknown";
  }

  return endpoints.every(
    (endpoint) => getLatestResult(endpoint.results)?.success === true,
  )
    ? "operational"
    : "degraded";
}

export function formatCheckAge(timestamp: string, now = new Date()) {
  const elapsedMilliseconds = Math.max(
    0,
    now.getTime() - new Date(timestamp).getTime(),
  );
  const elapsedMinutes = Math.floor(elapsedMilliseconds / 60_000);

  if (elapsedMinutes < 1) {
    return "just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  return `${Math.floor(elapsedHours / 24)}d ago`;
}

export function formatUptimePercentage(uptime: number) {
  const percentage = uptime * 100;

  return percentage === 0 || percentage === 100
    ? `${percentage}%`
    : `${percentage.toFixed(2)}%`;
}

export function formatUptimeDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

const dayInMilliseconds = 24 * 60 * 60 * 1_000;
const hourInMilliseconds = 60 * 60 * 1_000;
const checkIntervalInMilliseconds = 60 * 1_000;
const hourlyDegradedAfterMilliseconds = checkIntervalInMilliseconds;
const hourlyDownAfterMilliseconds = 5 * checkIntervalInMilliseconds;
const dailyDegradedAfterMilliseconds = 2 * checkIntervalInMilliseconds;
const dailyDownAfterMilliseconds = 15 * checkIntervalInMilliseconds;

type UptimeInterval = Readonly<{
  start: number;
  end: number;
  state: "healthy" | "unhealthy" | "unknown";
}>;

function startOfUtcDay(date: Date) {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

function buildUptimeIntervals(
  events: readonly StatusEvent[],
  nowTimestamp: number,
) {
  const sortedEvents = [...events].sort((left, right) => {
    const timestampDifference =
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();

    if (timestampDifference !== 0) {
      return timestampDifference;
    }

    // A START event resets the known state before the first result at the same time.
    return Number(left.type !== "START") - Number(right.type !== "START");
  });
  const intervals: readonly UptimeInterval[] = sortedEvents.map(
    (event, index) => ({
      start: new Date(event.timestamp).getTime(),
      end:
        index + 1 < sortedEvents.length
          ? new Date(sortedEvents[index + 1].timestamp).getTime()
          : nowTimestamp,
      state:
        event.type === "HEALTHY"
          ? "healthy"
          : event.type === "UNHEALTHY"
            ? "unhealthy"
            : "unknown",
    }),
  );

  return { intervals, sortedEvents } as const;
}

function summarizeUptime(
  intervals: readonly UptimeInterval[],
  periodStart: number,
  periodEnd: number,
) {
  let monitoredMilliseconds = 0;
  let healthyMilliseconds = 0;

  for (const interval of intervals) {
    if (
      interval.state === "unknown" ||
      interval.end <= periodStart ||
      interval.start >= periodEnd
    ) {
      continue;
    }

    const duration =
      Math.min(interval.end, periodEnd) -
      Math.max(interval.start, periodStart);
    monitoredMilliseconds += duration;
    if (interval.state === "healthy") {
      healthyMilliseconds += duration;
    }
  }

  const unhealthyMilliseconds = monitoredMilliseconds - healthyMilliseconds;
  const percentage =
    monitoredMilliseconds === 0
      ? null
      : Math.round((healthyMilliseconds / monitoredMilliseconds) * 10_000) /
        100;

  return {
    monitoredMilliseconds,
    unhealthyMilliseconds,
    percentage,
  } as const;
}

function getDurationStatus({
  monitoredMilliseconds,
  unhealthyMilliseconds,
  degradedAfterMilliseconds,
  downAfterMilliseconds,
}: Readonly<{
  monitoredMilliseconds: number;
  unhealthyMilliseconds: number;
  degradedAfterMilliseconds: number;
  downAfterMilliseconds: number;
}>): UptimeStatus {
  // A period cannot be called healthy before it has been observed for at
  // least as long as the first downtime threshold.
  if (monitoredMilliseconds < degradedAfterMilliseconds) {
    return "unknown";
  }

  if (unhealthyMilliseconds >= downAfterMilliseconds) {
    return "down";
  }

  return unhealthyMilliseconds >= degradedAfterMilliseconds
    ? "degraded"
    : "up";
}

export function getMinuteUptimeSummary(
  events: readonly StatusEvent[],
  date: string,
  hour: number,
  now = new Date(),
) {
  const nowTimestamp = now.getTime();
  const hourStart = new Date(
    `${date}T${hour.toString().padStart(2, "0")}:00:00Z`,
  ).getTime();
  const hourEnd = Math.min(hourStart + hourInMilliseconds, nowTimestamp);
  const { intervals } = buildUptimeIntervals(events, nowTimestamp);

  return Array.from({ length: 60 }, (_, minute): MinuteUptime => {
    const minuteStart = hourStart + minute * checkIntervalInMilliseconds;
    const minuteEnd = Math.min(
      minuteStart + checkIntervalInMilliseconds,
      hourEnd,
    );

    const minuteUptime = summarizeUptime(intervals, minuteStart, minuteEnd);
    const status: UptimeStatus =
      minuteUptime.monitoredMilliseconds === 0
        ? "unknown"
        : minuteUptime.unhealthyMilliseconds > 0
          ? "down"
          : "up";

    return { minute, status };
  });
}

export function getMonthlyUptimeSummary(
  events: readonly StatusEvent[],
  now = new Date(),
) {
  const nowTimestamp = now.getTime();
  const firstDayTimestamp = startOfUtcDay(now) - 29 * dayInMilliseconds;
  const { intervals, sortedEvents } = buildUptimeIntervals(
    events,
    nowTimestamp,
  );
  const days = Array.from({ length: 30 }, (_, index): DailyUptime => {
    const dayStart = firstDayTimestamp + index * dayInMilliseconds;
    const dayEnd = Math.min(dayStart + dayInMilliseconds, nowTimestamp);
    const dailyUptime = summarizeUptime(intervals, dayStart, dayEnd);
    const date = new Date(dayStart).toISOString().slice(0, 10);
    // Color is based on cumulative downtime, not the number of transitions.
    // Brief separate blips therefore add only their real duration.
    const dailyStatus = getDurationStatus({
      ...dailyUptime,
      degradedAfterMilliseconds: dailyDegradedAfterMilliseconds,
      downAfterMilliseconds: dailyDownAfterMilliseconds,
    });
    const hours = Array.from({ length: 24 }, (_, hour): HourlyUptime => {
      const hourStart = dayStart + hour * hourInMilliseconds;
      const hourEnd = Math.min(hourStart + hourInMilliseconds, dayEnd);

      const hourlyUptime = summarizeUptime(intervals, hourStart, hourEnd);

      return {
        hour,
        percentage: hourlyUptime.percentage,
        status: getDurationStatus({
          ...hourlyUptime,
          degradedAfterMilliseconds: hourlyDegradedAfterMilliseconds,
          downAfterMilliseconds: hourlyDownAfterMilliseconds,
        }),
      };
    });

    return {
      date,
      percentage: dailyUptime.percentage,
      status: dailyStatus,
      hours,
    };
  });
  const monitoringStartedAt = sortedEvents.find(
    ({ type }) => type === "START",
  )?.timestamp;
  const hasFullHistory = monitoringStartedAt
    ? nowTimestamp - new Date(monitoringStartedAt).getTime() >=
      30 * dayInMilliseconds
    : false;

  return { days, hasFullHistory } as const;
}

function formatAnnouncementDate(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function groupEndpoints(endpoints: readonly StatusEndpoint[]) {
  const groups = new Map<string, StatusEndpoint[]>();

  for (const endpoint of endpoints) {
    const group = groups.get(endpoint.group) ?? [];
    group.push(endpoint);
    groups.set(endpoint.group, group);
  }

  return Array.from(groups, ([name, groupEndpoints]) => ({
    name,
    endpoints: groupEndpoints,
  }));
}

function StatusSummary({
  endpoints,
  isLoading,
}: Readonly<{
  endpoints: readonly StatusEndpoint[];
  isLoading: boolean;
}>) {
  const overallStatus = getOverallStatus(endpoints);
  const latestTimestamp = endpoints
    .map((endpoint) => getLatestResult(endpoint.results)?.timestamp)
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort()
    .at(-1);

  const summary = isLoading
    ? "Checking Akron services"
    : overallStatus === "operational"
      ? "All monitored systems are operational"
      : overallStatus === "degraded"
        ? "Some monitored systems are degraded"
        : "Status data is unavailable";

  return (
    <section
      className={`status-summary status-summary-${overallStatus}`}
      aria-live="polite"
    >
      <span className="status-summary-dot" aria-hidden="true" />
      <div>
        <h1>{summary}</h1>
        <p>
          {latestTimestamp
            ? `Last checked ${formatCheckAge(latestTimestamp)}`
            : "Waiting for the first monitoring result"}
        </p>
      </div>
    </section>
  );
}

function EndpointRow({
  endpoint,
  history,
  historyUnavailable,
}: Readonly<{
  endpoint: StatusEndpoint;
  history?: EndpointHistory;
  historyUnavailable: boolean;
}>) {
  const [activeMinuteTooltipId, setActiveMinuteTooltipId] = useState<
    string | null
  >(null);
  const latestResult = getLatestResult(endpoint.results);
  const isHealthy = latestResult?.success === true;
  const monthlySummary = getMonthlyUptimeSummary(history?.events ?? []);
  const historyLabel = history
    ? monthlySummary.hasFullHistory
      ? "Past 30 days"
      : null
    : historyUnavailable
      ? "History unavailable"
      : "Loading history";

  return (
    <li
      className={`status-endpoint ${isHealthy ? "status-endpoint-up" : "status-endpoint-down"}`}
    >
      <div className="status-endpoint-heading">
        <div className="status-endpoint-identity">
          <span
            className={`status-dot ${isHealthy ? "status-dot-up" : "status-dot-down"}`}
            aria-hidden="true"
          />
          <h3>{endpoint.name}</h3>
        </div>

        <strong className="status-endpoint-result">
          {isHealthy ? "Operational" : latestResult ? "Degraded" : "Unknown"}
        </strong>
      </div>

      <div className="status-uptime-bars">
        {monthlySummary.days.map((day) => {
          const formattedDate = formatUptimeDate(day.date);
          const dailyUptime =
            day.percentage === null
              ? "No monitoring data"
              : `${formatUptimePercentage(day.percentage / 100)} uptime`;
          const tooltipId = `${endpoint.key}-${day.date}-hourly-uptime`;

          return (
            <span
              aria-hidden={day.percentage === null ? true : undefined}
              aria-label={
                day.percentage === null
                  ? undefined
                  : `${formattedDate}: ${dailyUptime}`
              }
              className={`status-uptime-bar status-uptime-bar-${day.status}`}
              key={day.date}
              role={day.percentage === null ? undefined : "group"}
              tabIndex={day.percentage === null ? undefined : 0}
            >
              <span
                aria-label={`Hourly uptime for ${formattedDate}`}
                className="status-uptime-tooltip"
                id={tooltipId}
                role="group"
              >
                <span className="status-uptime-tooltip-heading">
                  <strong>{formattedDate}</strong>
                  <span>{dailyUptime}</span>
                </span>
                <span className="status-hourly-bars">
                  {day.hours.map((hour) => {
                    const hourText = hour.hour.toString().padStart(2, "0");
                    const hourlyUptime =
                      hour.percentage === null
                        ? "No monitoring data"
                        : `${formatUptimePercentage(hour.percentage / 100)} uptime`;
                    const minuteTooltipId = `${endpoint.key}-${day.date}-${hourText}-minute-uptime`;
                    const isMinuteTooltipActive =
                      activeMinuteTooltipId === minuteTooltipId;
                    const minutes = isMinuteTooltipActive
                      ? getMinuteUptimeSummary(
                          history?.events ?? [],
                          day.date,
                          hour.hour,
                        )
                      : [];

                    if (hour.percentage === null) {
                      return (
                        <span
                          aria-hidden="true"
                          className={`status-hourly-bar status-uptime-bar-${hour.status}`}
                          key={hour.hour}
                        />
                      );
                    }

                    return (
                      <span
                        aria-describedby={
                          isMinuteTooltipActive ? minuteTooltipId : undefined
                        }
                        aria-label={`${hourText}:00 UTC: ${hourlyUptime}`}
                        className={`status-hourly-bar status-uptime-bar-${hour.status}`}
                        key={hour.hour}
                        onBlur={(event) => {
                          if (!event.currentTarget.matches(":hover")) {
                            setActiveMinuteTooltipId(null);
                          }
                        }}
                        onFocus={() =>
                          setActiveMinuteTooltipId(minuteTooltipId)
                        }
                        onMouseEnter={() =>
                          setActiveMinuteTooltipId(minuteTooltipId)
                        }
                        onMouseLeave={(event) => {
                          if (document.activeElement !== event.currentTarget) {
                            setActiveMinuteTooltipId(null);
                          }
                        }}
                        role="group"
                        tabIndex={0}
                      >
                        {isMinuteTooltipActive ? (
                          <span
                            className="status-minute-tooltip"
                            id={minuteTooltipId}
                            role="tooltip"
                          >
                            <span className="status-uptime-tooltip-heading">
                              <strong>{hourText}:00 UTC</strong>
                              <span>{hourlyUptime}</span>
                            </span>
                            <span
                              className="status-minute-bars"
                              aria-hidden="true"
                            >
                              {minutes.map((minute) => (
                                <span
                                  className={`status-minute-bar status-uptime-bar-${minute.status}`}
                                  key={minute.minute}
                                />
                              ))}
                            </span>
                            <span
                              className="status-minute-axis"
                              aria-hidden="true"
                            >
                              <span>:00</span>
                              <span>minute</span>
                              <span>:59</span>
                            </span>
                            <span className="sr-only">
                              {minutes
                                .map(
                                  (minute) =>
                                    `${hourText}:${minute.minute.toString().padStart(2, "0")}: ${
                                      minute.status === "unknown"
                                        ? "no monitoring data"
                                        : minute.status === "up"
                                          ? "operational"
                                          : minute.status === "degraded"
                                            ? "degraded"
                                            : "outage"
                                    }`,
                                )
                                .join(". ")}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </span>
                <span className="status-hourly-axis" aria-hidden="true">
                  <span>00:00</span>
                  <span>UTC</span>
                  <span>23:00</span>
                </span>
              </span>
            </span>
          );
        })}
      </div>

      <div className="status-uptime-meta">
        {historyLabel ? <span>{historyLabel}</span> : null}
        <span>
          {history
            ? `${formatUptimePercentage(history.uptime)} uptime`
            : "No history"}
        </span>
      </div>
    </li>
  );
}

export function StatusPage() {
  const [endpoints, setEndpoints] = useState<readonly StatusEndpoint[] | null>(
    null,
  );
  const [announcements, setAnnouncements] = useState<
    readonly StatusAnnouncement[]
  >([]);
  const [endpointHistories, setEndpointHistories] = useState<
    Readonly<Record<string, EndpointHistory>>
  >({});
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadStatus() {
      try {
        const [endpointsResponse, configResponse] = await Promise.all([
          fetch(`${statusApiBase}/endpoints/statuses?page=1&pageSize=1`, {
            signal: abortController.signal,
          }),
          fetch(`${statusApiBase}/config`, { signal: abortController.signal }),
        ]);

        if (!endpointsResponse.ok || !configResponse.ok) {
          throw new Error("The status service returned an invalid response.");
        }

        const nextEndpoints =
          (await endpointsResponse.json()) as readonly StatusEndpoint[];
        const config = (await configResponse.json()) as StatusConfig;

        setEndpoints(nextEndpoints);
        setAnnouncements(config.announcements ?? []);
        setErrorMessage(null);

        try {
          const historyEntries = await Promise.all(
            nextEndpoints.map(async (endpoint) => {
              const endpointKey = encodeURIComponent(endpoint.key);
              const [detailResponse, uptimeResponse] = await Promise.all([
                fetch(
                  `${statusApiBase}/endpoints/${endpointKey}/statuses?page=1&pageSize=1`,
                  { signal: abortController.signal },
                ),
                fetch(`${statusApiBase}/endpoints/${endpointKey}/uptimes/30d`, {
                  signal: abortController.signal,
                }),
              ]);

              if (!detailResponse.ok || !uptimeResponse.ok) {
                throw new Error("Monthly history could not be loaded.");
              }

              const detail = (await detailResponse.json()) as StatusEndpoint & {
                events?: readonly StatusEvent[];
              };
              const uptime = Number(await uptimeResponse.text());

              if (!Number.isFinite(uptime) || uptime < 0 || uptime > 1) {
                throw new Error("Monthly history returned an invalid uptime.");
              }

              return [
                endpoint.key,
                { uptime, events: detail.events ?? [] },
              ] as const;
            }),
          );

          setEndpointHistories(Object.fromEntries(historyEntries));
          setHistoryUnavailable(false);
        } catch (error: unknown) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          // Current health remains useful even if historical aggregation fails.
          setEndpointHistories({});
          setHistoryUnavailable(true);
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The status service could not be reached.",
        );
      }
    }

    loadStatus();
    const refreshTimer = window.setInterval(loadStatus, 60_000);

    return () => {
      window.clearInterval(refreshTimer);
      abortController.abort();
    };
  }, []);

  const groups = useMemo(() => groupEndpoints(endpoints ?? []), [endpoints]);
  const activeAnnouncements = announcements.filter(
    (announcement) => announcement.archived !== true,
  );
  const archivedAnnouncements = announcements.filter(
    (announcement) => announcement.archived === true,
  );

  return (
    <main className="status-page" aria-label="Akron service status">
      <title>Akron Status</title>

      <header className="status-header">
        <a className="status-wordmark" href="/" aria-label="Akron home">
          <span>Akron Status</span>
        </a>
      </header>

      <div className="status-content">
        <StatusSummary
          endpoints={endpoints ?? []}
          isLoading={endpoints === null && errorMessage === null}
        />

        {errorMessage ? (
          <section className="status-notice status-notice-error" role="alert">
            <div>
              <p className="status-notice-label">Monitoring unavailable</p>
              <h2>Current data could not be refreshed</h2>
              <p>{errorMessage}</p>
            </div>
          </section>
        ) : null}

        {activeAnnouncements.map((announcement) => (
          <section
            className={`status-notice status-notice-${announcement.type}`}
            key={`${announcement.timestamp}-${announcement.message}`}
          >
            <div>
              <p className="status-notice-label">Known issue</p>
              <h2>{announcement.message}</h2>
              <time dateTime={announcement.timestamp}>
                {formatAnnouncementDate(announcement.timestamp)}
              </time>
            </div>
          </section>
        ))}

        <section className="status-groups" aria-label="Monitored services">
          {groups.map((group) => (
            <article className="status-group" key={group.name}>
              <header>
                <h2>{group.name}</h2>
                <span>
                  {group.endpoints.length}{" "}
                  {group.endpoints.length === 1 ? "service" : "services"}
                </span>
              </header>
              <ul>
                {group.endpoints.map((endpoint) => (
                  <EndpointRow
                    endpoint={endpoint}
                    history={endpointHistories[endpoint.key]}
                    historyUnavailable={historyUnavailable}
                    key={endpoint.key}
                  />
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="status-history" aria-labelledby="status-history-title">
          <h2 id="status-history-title">Past incidents</h2>

          {archivedAnnouncements.length === 0 ? (
            <p className="status-history-empty">
              No resolved incidents have been posted yet.
            </p>
          ) : (
            <ol>
              {archivedAnnouncements.map((announcement) => (
                <li key={`${announcement.timestamp}-${announcement.message}`}>
                  <time dateTime={announcement.timestamp}>
                    {formatAnnouncementDate(announcement.timestamp)}
                  </time>
                  <p>{announcement.message}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="status-footer">
          <p>Updated every minute</p>
          <a href="https://github.com/TwiN/gatus">Powered by Gatus</a>
        </footer>
      </div>
    </main>
  );
}
