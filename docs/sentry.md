# Sentry error reporting

Error reporting is optional. With no DSNs configured, the browser and status
Worker do not initialize Sentry, and the tunnel returns 204 without an outgoing
request. Development (`bun run dev`) stays disabled even when a browser DSN is
present. No test DSNs or credentials belong in the repository.

This integration pins the released JavaScript SDK **11.6.0** and Sentry bundler
plugins **5.4.1**. It uses the v11 `dataCollection` options. Do not copy older
`sendDefaultPii` or `nodejs_als` examples into this configuration.

## Website on Vercel

Create a React Sentry project and set both variables in the relevant Vercel
environment, then rebuild/redeploy:

| Variable | Purpose |
| --- | --- |
| `VITE_SENTRY_DSN` | Public project DSN, embedded in the production browser build. |
| `SENTRY_BROWSER_DSN` | The identical DSN, read only by `/api/sentry` on the server. |
| `VITE_SENTRY_ENVIRONMENT` | Optional label; defaults to Vercel's environment or Vite's mode. |
| `SENTRY_RELEASE` | Optional release identifier; defaults to `VERCEL_GIT_COMMIT_SHA` during a Vercel build. |

The browser sends errors through the same-origin `/api/sentry` function. This
works with the existing `connect-src 'self'` policy and needs no wildcard CSP
exception. The tunnel derives its upstream exclusively from `SENTRY_BROWSER_DSN`,
checks the envelope DSN against that value, allows one error event of at most
200 KB, rejects cross-site browser requests, and strips caller headers. It does
not accept attachments, replay, sessions, transactions or arbitrary proxy URLs.
The public DSN is not an authentication secret; project quotas remain relevant.

For readable production stacks, set these build-only variables:

| Variable | Purpose |
| --- | --- |
| `SENTRY_AUTH_TOKEN` | Token with permission to upload source maps to the project. Never prefix this with `VITE_`. |
| `SENTRY_ORG` | Sentry organization slug. |
| `SENTRY_PROJECT` | Browser Sentry project slug. |

The Vite plugin runs only for a production build with a browser DSN and all
three upload variables. It creates hidden source maps, uploads them, then removes
the maps from `dist`. Without credentials, a normal build succeeds without
creating or uploading browser source maps. The release supplied to the SDK and
upload is the same; debug IDs are also retained in sanitized error events.

`src/instrument.ts` initializes before mounting and registers React 19 root
error callbacks. `AppErrorBoundary` supplies a reload fallback; the root reports
the error once. The status page explicitly reports both current-status and
history failures because those errors are otherwise handled by the UI. It
reports once per phase until recovery, ignores cancellation/offline failures,
and prevents overlapping polls. A service being down in valid Gatus data is
not itself an application error.

## Status API Worker

The Worker in `ops/gatus` is deployed independently of Vercel. Installing the
website dependencies or deploying the frontend does not update it.

Install dependencies with `bun install --frozen-lockfile` (Node 24 is supported),
then set these variables in the environment running
`ops/gatus/deploy-status-api-worker.sh`:

| Variable | Purpose |
| --- | --- |
| `STATUS_ORIGIN` | Existing Gatus origin URL; still required. |
| `CLOUDFLARE_API_TOKEN` | Existing Workers deployment credential; still required. |
| `SENTRY_DSN` | Optional Worker Sentry project DSN. Omit to disable Worker reporting. |
| `SENTRY_ENVIRONMENT` | Optional Worker environment label; defaults to `production`. |
| `SENTRY_RELEASE` | Recommended commit SHA, shared between the bundle upload and runtime. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_STATUS_PROJECT` | Optional build-time source-map upload credentials and Worker project slug. |

Only DSN/environment/release become Worker bindings; the Sentry auth token is
never uploaded as a binding. The deployment script bundles npm dependencies
before uploading the Worker and sets `nodejs_compat` with compatibility date
`2026-10-10`. The old raw-file upload would not resolve the SDK's imports.
Worker maps are generated beside the bundle; upload occurs only when all three
Worker source-map variables are present. `bun run build:status-worker` builds
locally into `ops/gatus/dist` without deploying anything.

The wrapper captures uncaught handler exceptions and explicitly reports caught
origin errors, missing origin configuration and upstream 5xx responses. Reports
are capped at one per failure class per five minutes in each isolate. Expected
4xx responses are forwarded without reporting. Origin error messages returned
to clients are generic. Gatus continues to own uptime and recovery monitoring.

## Data policy and verification

This first integration enables errors only. Tracing, replay, logs, metrics,
automatic sessions and breadcrumb collection are not enabled. Automatic user,
cookie, header, query, body, local-variable and source-context collection is
explicitly disabled.

`observability/privacy.js` is the final allowlist for both runtimes and the
tunnel. It keeps error types, stack filenames/functions/line numbers, debug IDs,
release/environment and fixed diagnostic tags. It drops user/request/extra/
context/breadcrumb data and free-form exception messages; known static status
error messages are retained. Stack URLs lose origins, query strings and
fragments; local paths lose machine-specific directories. This means stack
locations and error types, rather than arbitrary exception payloads, are the
primary diagnostics.

Run `bun test`, `bun run build` and `bun run build:status-worker`. Tests exercise
disabled configuration, the actual SDK's error envelope, data filtering, tunnel
destination/size constraints, outage deduplication and Worker response handling.
Before enabling a production DSN, use a preview deployment to trigger a controlled
error and confirm the original stack location in Sentry. This is a manual check:
there is no permanent public error-trigger endpoint.

The website SDK cannot instrument `/uploads`, `/bot`, R2 or Mintlify requests
that Vercel rewrites to other runtimes. Those integrations belong to their
owning applications.

## References

- [JavaScript SDK 11.6.0 release](https://github.com/getsentry/sentry-javascript/releases/tag/11.6.0)
- [Bundler plugins 5.4.1 release](https://github.com/getsentry/sentry-javascript-bundler-plugins/releases/tag/5.4.1)
- [React error handling](https://docs.sentry.io/platforms/javascript/guides/react/features/error-boundary/)
- [Cloudflare manual setup](https://docs.sentry.io/platforms/javascript/guides/cloudflare/install/wrangler/)
- [Vite source maps](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/uploading/vite/)
