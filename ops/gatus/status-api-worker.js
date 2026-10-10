// Cloudflare Worker: public edge for Gatus through its persistent Tailscale
// Funnel hostname. Build with build-status-api-worker.mjs before deploying.
import * as Sentry from "@sentry/cloudflare";
import { createStatusWorker } from "./status-api-handler.js";

export default createStatusWorker({
  withSentry: Sentry.withSentry,
  captureException: Sentry.captureException,
});
