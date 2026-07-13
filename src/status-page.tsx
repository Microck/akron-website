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

export type DailyUptime = Readonly<{
  date: string;
  percentage: number | null;
  status: "up" | "degraded" | "down" | "unknown";
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

const dayInMilliseconds = 24 * 60 * 60 * 1_000;

function startOfUtcDay(date: Date) {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

export function getMonthlyUptimeSummary(
  events: readonly StatusEvent[],
  now = new Date(),
) {
  const nowTimestamp = now.getTime();
  const firstDayTimestamp = startOfUtcDay(now) - 29 * dayInMilliseconds;
  const sortedEvents = [...events].sort((left, right) => {
    const timestampDifference =
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();

    if (timestampDifference !== 0) {
      return timestampDifference;
    }

    // A START event resets the known state before the first result at the same time.
    return Number(left.type !== "START") - Number(right.type !== "START");
  });
  const intervals = sortedEvents.map((event, index) => ({
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
  }));

  const days = Array.from({ length: 30 }, (_, index): DailyUptime => {
    const dayStart = firstDayTimestamp + index * dayInMilliseconds;
    const dayEnd = Math.min(dayStart + dayInMilliseconds, nowTimestamp);
    let monitoredMilliseconds = 0;
    let healthyMilliseconds = 0;

    // State transitions are the only compact historical data Gatus exposes per day.
    for (const interval of intervals) {
      if (
        interval.state === "unknown" ||
        interval.end <= dayStart ||
        interval.start >= dayEnd
      ) {
        continue;
      }

      const duration =
        Math.min(interval.end, dayEnd) - Math.max(interval.start, dayStart);
      monitoredMilliseconds += duration;
      if (interval.state === "healthy") {
        healthyMilliseconds += duration;
      }
    }

    const percentage =
      monitoredMilliseconds === 0
        ? null
        : Math.round((healthyMilliseconds / monitoredMilliseconds) * 10_000) /
          100;
    const status =
      percentage === null
        ? "unknown"
        : percentage === 100
          ? "up"
          : percentage >= 99
            ? "degraded"
            : "down";

    return {
      date: new Date(dayStart).toISOString().slice(0, 10),
      percentage,
      status,
    };
  });
  const monitoringStartedAt = sortedEvents.find(
    ({ type }) => type === "START",
  )?.timestamp;
  const hasFullHistory = monitoringStartedAt
    ? nowTimestamp - new Date(monitoringStartedAt).getTime() >=
      30 * dayInMilliseconds
    : false;

  return {
    days,
    periodLabel: hasFullHistory ? "Past 30 days" : "Since monitoring began",
  } as const;
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
  const latestResult = getLatestResult(endpoint.results);
  const isHealthy = latestResult?.success === true;
  const monthlySummary = getMonthlyUptimeSummary(history?.events ?? []);

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

      <div className="status-uptime-bars" aria-hidden="true">
        {monthlySummary.days.map((day) => (
          <span
            className={`status-uptime-bar status-uptime-bar-${day.status}`}
            key={day.date}
            title={`${day.date}: ${
              day.percentage === null
                ? "No monitoring data"
                : `${formatUptimePercentage(day.percentage / 100)} uptime`
            }`}
          />
        ))}
      </div>

      <div className="status-uptime-meta">
        <span>
          {history
            ? monthlySummary.periodLabel
            : historyUnavailable
              ? "History unavailable"
              : "Loading history"}
        </span>
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
