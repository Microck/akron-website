import * as Sentry from "@sentry/react";
import { parseSentryDsn, privateDataCollection, sanitizeErrorEvent } from "../observability/privacy.js";

export function browserTelemetryOptions(env: Partial<ImportMetaEnv>): Sentry.BrowserOptions | null {
  const parsed = parseSentryDsn(env.VITE_SENTRY_DSN);
  if (!env.PROD || !parsed) return null;
  return {
    dsn: parsed.dsn,
    tunnel: "/api/sentry",
    environment: env.VITE_SENTRY_ENVIRONMENT || "production",
    release: env.VITE_SENTRY_RELEASE || undefined,
    defaultIntegrations: false,
    integrations: [
      Sentry.eventFiltersIntegration(), Sentry.browserApiErrorsIntegration(),
      Sentry.globalHandlersIntegration(), Sentry.linkedErrorsIntegration(), Sentry.dedupeIntegration(),
    ],
    dataCollection: privateDataCollection,
    tracesSampler: () => 0,
    tracePropagationTargets: [],
    sendClientReports: false,
    beforeSend: sanitizeErrorEvent,
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    initialScope: { tags: { runtime: "browser" } },
  };
}

const options = browserTelemetryOptions(import.meta.env ?? {});
if (options) Sentry.init(options);

export const reactRootOptions = options ? {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
} : undefined;

export function captureStatusError(error: unknown, tags: Record<string, string>) {
  if (options) Sentry.captureException(error, { tags });
}
