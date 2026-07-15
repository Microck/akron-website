# Akron Status Page Plan

Research date: 2026-07-13

## Goal

Publish an Akron status page that reports the health of the player-facing
website, documentation, downloads, community services, and Discord automation.
The requested public entry point is `https://akron.micr.dev/status`.

Gatus runs on an independent status host, but the public path is proxied through
the existing Vercel project. This means the requested URL is unavailable during
a Vercel outage even if Gatus itself is healthy. The monitoring origin remains
an operator fallback, not the advertised public URL.

## Public Components

| Component | User-visible responsibility | Main dependencies |
| --- | --- | --- |
| Website | Akron landing page | DNS, Vercel |
| Documentation | Player and contributor documentation | Vercel rewrite, Mintlify |
| Downloads and Installation | Raw download and Olympus install links | Vercel Functions, GameBanana API and file delivery |
| Community Pack Catalog | Pack index, previews, and `.akr` downloads | Vercel rewrite, Cloudflare R2 |
| Community Pack Uploads | Prepare, transfer, complete, and moderation handoff | Vercel rewrite, Cloudflare Worker, D1, R2, rate limiting |
| Discord Bot | Verification, scanning, moderation, playtesting, and automation | Bot host, Discord Gateway/API, SQLite |
| GitHub Issue Sync | Discord forum to GitHub issue synchronization | Bot host, GitHub API/webhooks, SQLite |

GitHub Issue Sync may remain a secondary component if the public page should be
shorter. The release pipeline should be monitored internally, not presented as
a continuously available public service.

## Dependency Findings

### `akron-website`

The website is both a landing page and the public routing gateway:

- Vercel serves the site and server-side download redirect handlers.
- GameBanana supplies latest-file metadata and release downloads.
- Cloudflare Workers handles in-game upload requests.
- Cloudflare R2 serves the catalog, packs, captures, and submission assets.
- Mintlify serves documentation behind Vercel rewrites.

### `akron-discord`

The repository contains two operational runtimes:

- A Discord bot using Discord, local SQLite, Cloudflare R2, GitHub, and an
  optional NVIDIA NIM advisory review.
- A Cloudflare upload Worker using D1, quarantine R2, public R2, rate-limit
  bindings, scheduled cleanup, and Cloudflare Image Transformations.

NVIDIA NIM fails soft to moderator review, so it is an internal degraded-state
signal rather than a primary public component.

The bot hosting provider is not documented in the three inspected repositories.

### `akron`

The base mod is local software. Once installed, its main overlay, practice,
capture, and setup features do not depend on an Akron server. Celeste and
Everest are mandatory local runtime dependencies. Motion Smoothing, Speedrun
Tool, CelesteTAS, Extended Variant Mode, and Extended Camera Dynamics are
optional local integrations, not public Akron services.

The hosted runtime dependencies are limited to:

- Community catalog, preview, and pack downloads.
- Community pack uploads.
- Installation and release distribution.

## Production Findings to Resolve

Checks performed on 2026-07-13 found:

- `/`, `/docs`, `/catalog/index.json`, and `/uploads/challenge` returned 200.
- `/raw` and `/olympus` returned the expected 307 redirects.
- `/discord` returned 404 even though the website and upload completion flow
  use that URL.
- The live catalog returned format v1, while the checked-out Akron client
  requires v2 and the checked-out upload Worker generates v2.

The catalog result demonstrates why status checks must validate response
contracts instead of treating every HTTP 200 response as healthy.

Later that day, the catalog object and its D1 source row were migrated to v2
with verified SHA-256 and byte-size metadata. The original v1 catalog remains
preserved in R2 as a rollback artifact.

## Options Researched

All projects below were active and not archived when checked on 2026-07-13.

### 1. Upptime

[Upptime](https://github.com/upptime/upptime) is built entirely on GitHub
Actions, Issues, and Pages. Setup starts from a repository template, endpoint
configuration lives in `.upptimerc.yml`, outages create GitHub issues, and the
public site is generated on GitHub Pages.

Relevant documentation:

- [Getting started](https://upptime.js.org/docs/get-started)
- [Configuration](https://upptime.js.org/docs/configuration)

Advantages for Akron:

- No status server, database, or custom status-page application to maintain.
- Independent of Akron's Vercel and Cloudflare deployments.
- Configuration and incident history are version controlled.
- Supports expected status codes, response-time degradation, request headers,
  request bodies, and required or forbidden response-body strings.
- A public repository receives GitHub Actions build minutes without the private
  repository billing described by Upptime's setup guide.

Limitations:

- Default checks run about every five minutes and GitHub schedules can be late.
- The generated page and monitoring both depend on GitHub.
- It needs a fine-grained GitHub token with write access to Actions, Contents,
  Issues, and Workflows.
- Semantic checks are string-based. Exact JSON-schema and redirect-header
  assertions may need a small purpose-built health endpoint or workflow check.

### 2. Gatus

[Gatus](https://github.com/TwiN/gatus) is a lightweight Go service configured
with YAML. It provides a status dashboard, alerting, incidents, persistent
history, and detailed conditions over HTTP status, body, response time,
certificates, DNS, and other protocols.

Documentation: [Gatus docs](https://gatus.io/docs)

Advantages for Akron:

- Best fit for exact catalog JSON assertions and richer synthetic checks.
- A single small container and configuration file.
- Fast intervals and broad alerting support.

Limitations:

- Requires an independently hosted always-on container and persistent storage.
- Hosting it beside `akron-discord` would make it unable to report a failure of
  that host.
- Adds deployment, upgrades, backups, TLS, and availability work that Upptime
  avoids.

### 3. Uptime Kuma

[Uptime Kuma](https://github.com/louislam/uptime-kuma) is a self-hosted Docker
application with a polished admin UI, multiple status pages, 20-second
intervals, notifications, keyword monitors, and JSON-query monitors.

It is the easiest self-hosted option for manual administration, but its monitor
configuration and incident state live in a persistent application database
rather than a small reviewable repository. It has the same independent-hosting
requirement as Gatus.

### 4. Kener

[Kener](https://github.com/rajnandan1/kener) is a modern status-page application
with monitoring and an admin UI. Version 4 documents a Docker quick start and
explicit support for deployment under `/status`.

Documentation: [Kener quick start](https://kener.ing/docs/v4/getting-started/quick-start)

Kener is attractive when the visual status page and incident-management UI are
the priority. It is less attractive for Akron's first version because it adds a
stateful application and Redis, while its documented API monitor focuses on
status-code checks rather than the contract assertions Akron needs most.

### 5. OpenStatus

[OpenStatus](https://github.com/openstatusHQ/openstatus) combines synthetic
monitoring, incidents, status pages, custom domains, and monitoring as code.
The managed service is the lowest-administration hosted option.

Documentation: [Status page reference](https://docs.openstatus.dev/reference/status-page)

The hosted custom-domain documentation points to Vercel DNS. That creates a
shared hosting failure domain with `akron.micr.dev`. Self-hosting the full
OpenStatus platform is substantially more infrastructure than Akron needs.

## Decision

Use **Gatus on an independent status host** and expose it through a narrow
Vercel reverse proxy at `https://akron.micr.dev/status`.

Gatus was selected over Upptime because Akron needs one-minute checks, exact
JSON assertions for the catalog contract, and persistent response history.
The deployment remains small: one Gatus container, one Caddy container, and one
SQLite database. Do not run Upptime in parallel.

Gatus does not support a base path. Its stock frontend uses root-relative
assets, API calls, and detail routes, so it cannot be mounted cleanly at
`/status`. The Akron website renders a small native status view at `/status`
and reads Gatus through the isolated `/status-api` reverse-proxy namespace.
Gatus still owns monitoring schedules, semantic conditions, SQLite history,
and incident announcements.

## Deployed Gatus Checks

| Component | Check |
| --- | --- |
| Website | HTTP 200, Akron title marker, and more than 72 hours of certificate validity |
| Documentation | HTTP 200 and the Akron documentation title marker |
| Raw download | Exact HTTP 307 without following the redirect |
| Olympus install | Exact HTTP 307 without following the redirect |
| Community Pack Catalog | HTTP 200, format `akron-community-pack-index-v3`, version 3, and a packs field |
| Community Pack Uploads | HTTP 200 plus challenge terms, accepted sections, and limits fields |
| Discord Platform API | HTTP 200 and the expected Discord Gateway URL |

The upload challenge is not a deep health check today. It returns static
capability data without proving D1 or R2 availability.

## Uptime Bar Severity

Bar colors use cumulative unhealthy duration within each displayed period.
Separate outages add their exact durations; they are not rounded up or counted
as incidents. Hours and days remain unknown until monitoring coverage reaches
their yellow threshold, which prevents partial periods from showing a
misleading green state. A minute remains unknown only when it has no monitoring
coverage.

| Period | Green | Yellow | Red |
| --- | --- | --- | --- |
| Minute | Healthy | Not used | Any unhealthy duration |
| Hour | Less than 1 minute down | 1 to less than 5 minutes down | 5 minutes or more down |
| Day | Less than 2 minutes down | 2 to less than 15 minutes down | 15 minutes or more down |

The tooltip percentage remains the exact duration-based uptime for the period.

## Deployment

The canonical deployment files live in `ops/gatus` and are copied to
`/opt/akron-status` on the status host configured by the operator.

- Gatus: `ghcr.io/twin/gatus:v5.36.0`
- Caddy: `caddy:2.11.4-alpine`
- Persistent history: `/opt/akron-status/data/gatus.db`
- Check interval: one minute
- Retention: 43,200 results and 100 events per endpoint
- Resource limit: 256 MiB per container

Routine configuration deployment:

```console
scp ops/gatus/compose.yaml ops/gatus/config.yaml ops/gatus/caddyfile "$STATUS_HOST":/tmp/
ssh "$STATUS_HOST" 'sudo install -m 0644 /tmp/compose.yaml /tmp/config.yaml /tmp/caddyfile /opt/akron-status/ && rm /tmp/compose.yaml /tmp/config.yaml /tmp/caddyfile && cd /opt/akron-status && sudo docker compose up -d'
```

The `data`, `caddy-data`, and `caddy-config` directories must remain owned by
root because the containers run as root with all Linux capabilities dropped.
The operator-owned YAML and Caddy files remain writable through SSH.

## Remaining Work

1. Add a deep upload health endpoint that performs non-mutating D1 and R2
   checks. The current challenge endpoint validates the HTTP contract only.
2. Add a Discord bot readiness or heartbeat endpoint that checks Discord client
   readiness and SQLite. Discord's public API is not proof that the Akron bot is
   online.
3. Choose an alert destination and configure Gatus failure and recovery alerts.
4. Consider a dedicated status hostname if availability during Vercel outages
   becomes more important than keeping the page under `/status`.

## Success Criteria

- `https://akron.micr.dev/status` renders the Akron status view backed by Gatus.
- The monitoring origin remains healthy across container restarts and retains SQLite history.
- All currently monitorable components report independently, and the Discord
  bot readiness gap is explicit.
- Catalog incompatibility is detected even when the endpoint returns 200.
- Incidents have public history and can include maintainer updates.
- No production secret is stored in the public status repository.

## Out of Scope for the First Version

- Building a custom React incident-management system.
- Monitoring optional local Celeste mods.
- Publishing internal release-pipeline details as a public component.
- Preserving compatibility with obsolete catalog formats.
- Adding deep upload or Discord bot health without deployable service endpoints.
