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

export function getUptimeSummary(
  results: readonly StatusResult[],
  limit = 60,
) {
  const recentResults = sortResultsChronologically(results).slice(-limit);

  if (recentResults.length === 0) {
    return { results: recentResults, percentage: null };
  }

  const successfulChecks = recentResults.filter(({ success }) => success).length;
  const percentage = (successfulChecks / recentResults.length) * 100;

  return {
    results: recentResults,
    percentage:
      percentage === 0 || percentage === 100
        ? `${percentage}%`
        : `${percentage.toFixed(2)}%`,
  };
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

function EndpointRow({ endpoint }: Readonly<{ endpoint: StatusEndpoint }>) {
  const uptime = getUptimeSummary(endpoint.results);
  const latestResult = uptime.results.at(-1);
  const isHealthy = latestResult?.success === true;
  const missingBarCount = 60 - uptime.results.length;

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
        {Array.from({ length: missingBarCount }, (_, index) => (
          <span className="status-uptime-bar status-uptime-bar-unknown" key={`empty-${index}`} />
        ))}
        {uptime.results.map((result) => (
          <span
            className={`status-uptime-bar ${result.success ? "status-uptime-bar-up" : "status-uptime-bar-down"}`}
            key={result.timestamp}
            title={`${result.success ? "Operational" : "Failed"} at ${new Date(result.timestamp).toLocaleString()}`}
          />
        ))}
      </div>

      <div className="status-uptime-meta">
        <span>{uptime.results.length} recent checks</span>
        <span>{uptime.percentage ? `${uptime.percentage} uptime` : "No history"}</span>
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadStatus() {
      try {
        const [endpointsResponse, configResponse] = await Promise.all([
          fetch(`${statusApiBase}/endpoints/statuses?page=1&pageSize=60`, {
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
                  <EndpointRow endpoint={endpoint} key={endpoint.key} />
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
